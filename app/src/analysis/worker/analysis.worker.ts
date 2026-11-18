// The analysis worker: downloads and checks the models, runs the networks
// with ONNX Runtime Web (WebAssembly, threads when the page is cross-origin
// isolated), decodes the grid, the key and the chords. Everything heavy is
// here, so that the interface stays fluid.
//
// Cancellation: `cancel` is read between the pieces of work (the long loops
// yield to the event loop between two network runs); the main thread also
// terminates the worker if it does not stop quickly.

import * as ort from 'onnxruntime-web/wasm';
import ortWasmModule from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmBinary from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import tsumugiGraphUrl from '../assets/tsumugi-chords.graph.onnx?url';
import ss2ManifestJson from '../assets/sheetsage2/sheetsage2-manifest.json';
import { ensureLargeModel, ensureModels, missingModels, sha256Hex } from '../models/download';
import { openModelStore } from '../models/store';
import { ANALYSIS_FIXED_LOAD, createSleeper, createThrottle, easePlan } from '../../settings/easeLoad';
import { AnalysisError, type AnalysisErrorCode, type AnalysisStep, type ChordFallback, type GridHint, type ListenedResult } from '../types';
import { BEAT_MODEL_ID, CHORD_MODEL_ID, MODEL_REGISTRY, SHEETSAGE2_FILES, TSUMUGI_GRAPH, modelsFor, usesSheetSage2, usesTsumugi } from '../models';
import { TSUMUGI_WEIGHTS_LOCATION, runTsumugi, tsumugiAudio, tsumugiChordFrames, tsumugiInfo, tsumugiWindows } from '../engine/tsumugi';
import { runSheetSage2, sheetsage2ChordFrames, ss2Units, type Ss2GraphInfo, type Ss2Manifest, type Ss2Runtime } from '../engine/sheetsage2';
import { SS2_FRONT_BYTES, SS2_RATE, melFront } from '../engine/sheetsage2Mel';
import { combineFrames } from '../engine/combine';
import type { AnalysisResult } from '../../model/analysis';
import type { ChordFrames } from '../engine/chords';
import { resultFromOutputs } from '../engine/analyse';
import { manualTempoGrid, tappedInfoOf, type ManualTempoFix } from '../engine/tapGrid';
import type { KnownCharts } from '../engine/chart';
import { beatUnits, chordStage, gridFromActivations, gridFromHint, runNetworks, type NetworkOutputs, type Sessions, type StepControl } from '../engine/pipeline';
import { frameRms, isHarmonyCandidate, selectHarmony, stemFeatures, type StemFeatures } from '../engine/listen';
import type { HarmonyListening } from '../engine/chart';
import { resampleRatioAsync } from '../engine/resample';
import type { OrtLike, SessionLike } from '../engine/session';
import type { Key } from '../../model/harmony';
import type { AnalyseRequestMessage, DecodeRequestMessage, FromWorker, ToWorker } from './protocol';

/** SheetSage2's graphs shipped with the app (no weights in them), by file name. */
const SS2_GRAPH_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/sheetsage2/*.onnx', { query: '?url', import: 'default', eager: true }) as Record<string, string>).map(([k, v]) => [k.split('/').pop()!, v]),
);
const SS2_MANIFEST = ss2ManifestJson as unknown as Ss2Manifest;

// The DOM typings of the app do not describe a worker's global scope: only what is used here.
const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
  crossOriginIsolated: boolean;
  navigator?: { hardwareConcurrency?: number };
};
const post = (message: FromWorker, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

let cancelRequested = false;
let busy = false;
/** The rests of « Alléger le travail pour l'appareil »: a cancellation wakes them at once. */
const sleeper = createSleeper();

const yieldNow = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * What the pieces of work call between two network runs (`RunControl.yieldNow`). At full speed, the plain yield, as
 * ever. « Alléger »: first the rest, as long as the work since the last one took, scaled by the share, then the yield.
 * Whatever is one long call (loading the networks, decoding) is rested for at the next of these.
 */
function breather(throttle: ReturnType<typeof createThrottle>): () => Promise<void> {
  if (!throttle) return yieldNow;
  return async () => {
    await throttle.pause();
    await yieldNow();
  };
}

function control(rest: () => Promise<void> = yieldNow): StepControl {
  let current: AnalysisStep = 'prepare';
  return {
    check() {
      if (cancelRequested) throw new AnalysisError('cancelled');
    },
    progress(fraction) {
      post({ type: 'progress', step: current, fraction: Math.min(1, Math.max(0, fraction)) });
    },
    yieldNow: rest,
    step(step) {
      current = step;
      post({ type: 'step', step });
    },
  };
}

/** Errors as codes the interface understands. */
function describe(e: unknown): { code: AnalysisErrorCode; message: string } {
  if (e instanceof AnalysisError) return { code: e.code, message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/out of memory|memory access out of bounds|Array buffer allocation failed|Invalid array length|allocation failed|bad_alloc/i.test(message) || e instanceof RangeError) {
    return { code: 'memory', message };
  }
  if (/WebAssembly|SharedArrayBuffer/i.test(message) && /not defined|not supported|unavailable/i.test(message)) return { code: 'unsupported', message };
  return { code: 'failed', message };
}

/** Processor threads: up to four, one when the page is not isolated; fewer with `units` of « Alléger ». */
function threadCount(): number {
  const isolated = scope.crossOriginIsolated === true;
  const cores = scope.navigator?.hardwareConcurrency || 1;
  return isolated ? Math.max(1, Math.min(4, cores)) : 1;
}

function configureOrt(threads: number): void {
  ort.env.wasm.numThreads = threads;
  ort.env.wasm.wasmPaths = { mjs: ortWasmModule, wasm: ortWasmBinary };
  ort.env.logLevel = 'error';
}

async function createSession(bytes: ArrayBuffer): Promise<ort.InferenceSession> {
  return ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3,
  });
}

const asSession = (s: ort.InferenceSession) => s as unknown as SessionLike;

/** Grid, key and chords on the networks' outputs. Cheap. */
function decode(outputs: NetworkOutputs, grid: GridHint | null, key: Key | null, known: KnownCharts | null, base: { duration: number; models: string[] }) {
  return resultFromOutputs({ outputs, grid, key, known, ...base });
}

/** The grid the chords are decoded on: the user's, or the one a manual tempo action computes from the outputs. */
function gridFor(outputs: NetworkOutputs, grid: GridHint | null, fix: ManualTempoFix | null | undefined): GridHint | null {
  return fix ? manualTempoGrid(outputs.act, fix) : grid;
}

/**
 * The piece at 22.05 kHz (Beat This!) and 44.1 kHz (CREMA), and at 24 kHz when SheetSage2 will read it;
 * the 48 kHz mono copy is dropped on the way.
 */
async function resampleAll(msg: AnalyseRequestMessage, ctl: StepControl, ss2: boolean): Promise<{ a22: Float32Array; a44: Float32Array; a24: Float32Array | null }> {
  const mono = msg.mono;
  msg.mono = new Float32Array(0); // the message must not keep the piece alive
  const between = async () => {
    ctl.check();
    await ctl.yieldNow();
  };
  const a22 = await resampleRatioAsync(mono, msg.sampleRate / 22050, 32, between);
  ctl.progress(0.7);
  const a44 = await resampleRatioAsync(mono, msg.sampleRate / 44100, 20, between);
  const a24 = ss2 ? await resampleRatioAsync(mono, msg.sampleRate / SS2_RATE, 32, between) : null;
  return { a22, a44, a24 };
}

async function analyse(msg: AnalyseRequestMessage): Promise<void> {
  // « Alléger le travail pour l'appareil »: fewer threads, and rests that make up the rest of the share.
  const ease = easePlan(threadCount(), typeof msg.loadShare === 'number' ? msg.loadShare : 1, ANALYSIS_FIXED_LOAD);
  const throttle = createThrottle({ share: ease.duty, sleep: sleeper.sleep });
  const rest = breather(throttle);
  const ctl = control(rest);
  const fine = usesTsumugi(msg.chordModel);
  const ss2 = usesSheetSage2(msg.chordModel);
  simulatedFailure = msg.simulateChordFailure ?? null;
  const specs = modelsFor(msg.beatModel, msg.chordModel);
  const base = modelsFor(msg.beatModel);
  const store = await openModelStore();

  // 1. The tools, from the device or from their public location. The fine chord models' weights
  //    come last: if they cannot be had, the analysis goes on without them (said in the result).
  const missing = await missingModels(specs, store);
  const total = missing.reduce((n, s) => n + s.bytes, 0);
  post({ type: 'plan', downloadBytes: total });
  const controller = new AbortController();
  const watch = setInterval(() => {
    if (cancelRequested) controller.abort();
  }, 100);
  let files: Map<string, ArrayBuffer>;
  let fineWeights: ArrayBuffer | null = null;
  let fallback: ChordFallback | null = null;
  let ss2Files: { ss2: Blob; mert: Blob } | null = null;
  let ss2Fallback: ChordFallback | null = null;
  let ss2Message: string | null = null;
  try {
    if (missing.length) ctl.step('download');
    const baseBytes = missing.filter((m) => base.some((b) => b.id === m.id)).reduce((n, s) => n + s.bytes, 0);
    files = await ensureModels(base, {
      store,
      signal: controller.signal,
      onProgress: (p) => post({ type: 'progress', step: 'download', fraction: total ? p.loaded / total : 0, download: { ...p, total: Math.max(total, p.total) } }),
    });
    if (fine) {
      try {
        const got = await ensureModels([MODEL_REGISTRY['tsumugi-chords']], {
          store,
          signal: controller.signal,
          onProgress: (p) => {
            const loaded = baseBytes + p.loaded;
            post({ type: 'progress', step: 'download', fraction: total ? loaded / total : 0, download: { ...p, loaded, total: Math.max(total, loaded) } });
          },
        });
        fineWeights = got.get(MODEL_REGISTRY['tsumugi-chords'].id) ?? null;
      } catch (e) {
        if (e instanceof AnalysisError && e.code === 'cancelled') throw e;
        fallback = 'download';
      }
    }
    if (ss2) {
      // SheetSage2's two files (2.8 GB), kept as Blobs and read by slices: never one buffer.
      let before = missing.filter((m) => !SHEETSAGE2_FILES.some((f) => f.id === m.id)).reduce((n, s) => n + s.bytes, 0);
      try {
        const got: Blob[] = [];
        for (const spec of SHEETSAGE2_FILES) {
          const wasMissing = missing.some((m) => m.id === spec.id);
          const at = before;
          got.push(
            await ensureLargeModel(spec, { store, signal: controller.signal }, (received) => {
              const loaded = at + received;
              post({ type: 'progress', step: 'download', fraction: total ? loaded / total : 0, download: { modelId: spec.id, loaded, total: Math.max(total, loaded) } });
            }),
          );
          if (wasMissing) before += spec.bytes;
        }
        ss2Files = { ss2: got[0]!, mert: got[1]! };
      } catch (e) {
        if (e instanceof AnalysisError && e.code === 'cancelled') throw e;
        ss2Fallback = 'download';
      }
    }
  } finally {
    clearInterval(watch);
  }

  // 2. Prepare: the sessions, then the audio at the networks' rates.
  ctl.step('prepare');
  ctl.check();
  configureOrt(ease.units);
  throttle?.mark(); // the download is waiting, not working
  const sessions: ort.InferenceSession[] = [];
  let a22: Float32Array | null = null;
  let a44: Float32Array | null = null;
  try {
    const open = async (id: string) => {
      const s = await createSession(files.get(id)!);
      files.delete(id);
      sessions.push(s);
      ctl.check();
      return s;
    };
    const logmel = await open(MODEL_REGISTRY['beat-this-logmel'].id);
    ctl.progress(0.15);
    const beat = await open(MODEL_REGISTRY[BEAT_MODEL_ID[msg.beatModel]].id);
    ctl.progress(0.3);
    const crema = await open(MODEL_REGISTRY['crema-chords'].id);
    ctl.progress(0.4);
    files.clear();

    let a24: Float32Array | null = null;
    ({ a22, a44, a24 } = await resampleAll(msg, ctl, ss2 && !!ss2Files));
    ctl.progress(1);

    const set: Sessions = { logmel: asSession(logmel), beat: asSession(beat), crema: asSession(crema) };
    let outputs = await runNetworks(ort as unknown as OrtLike, set, a22, a44, ctl);
    msg.grid = gridFor(outputs, msg.grid, msg.tempoFix);
    a22 = null;
    a44 = null;
    // 2b. The separated parts (1.0.1): CREMA on each tells which carry the harmony; their remix waits for the fine model.
    let remix: { mono: Float32Array; stems: string[] } | null = null;
    const stems = msg.stems ?? [];
    msg.stems = [];
    if (fine && fineWeights && !fallback && stems.length) remix = await harmonyRemix(stems, outputs, msg, set, ctl);
    // The sessions are no longer needed: free their memory before decoding.
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));

    // 3. The fine chord models, fed with the beats and the key of the analysis just made.
    //    « Combinaison » (1.0.2): Tsumugi, then SheetSage2, then their vote (`engine/combine.ts`).
    let models = base.map((s) => s.id);
    const first = fine || ss2 ? decode(outputs, msg.grid, msg.key, msg.known, { duration: msg.duration, models }) : null;
    // One steady progress over both models: Tsumugi's windows, then SheetSage2's pieces of work.
    const tsUnits = fine && fineWeights && !fallback ? tsumugiWindows(Math.round(msg.duration * 25600)) * (remix ? 2 : 1) : 0;
    const allUnits = tsUnits + (ss2 && ss2Files ? ss2Units(msg.duration, SS2_MANIFEST) : 0);
    let tsumugi: { frames: ChordFrames; harmony?: ChordFrames } | null = null;
    if (fine && fineWeights && !fallback) {
      const weights = fineWeights;
      fineWeights = null;
      const r = await fineChords(msg, first!, weights, ctl, remix?.mono ?? null, { before: 0, total: allUnits });
      if (r.fallback) fallback = r.fallback;
      else if (r.frames) tsumugi = { frames: r.frames, ...(r.harmony ? { harmony: r.harmony } : {}) };
    }
    let sheetsage2: ChordFrames | null = null;
    if (ss2 && ss2Files && a24) {
      const audio24 = a24;
      a24 = null;
      const r = await sheetsage2Chords(audio24, ss2Files, ctl, { before: tsUnits, total: allUnits });
      if (r.fallback) {
        ss2Fallback = r.fallback;
        ss2Message = r.message ?? null;
      } else sheetsage2 = r.frames!;
    }
    ss2Files = null;
    if (ss2 && !sheetsage2 && !ss2Fallback) ss2Fallback = 'failed';
    const harmonyOf = (h: ChordFrames | undefined): HarmonyListening | null => (h && remix ? { frames: h, timeScale: 1, stems: remix.stems } : null);
    const withFrames = (frames: ChordFrames, harmony: HarmonyListening | null) => {
      outputs = { ...outputs, frames, timeScale: 1, listening: { harmony, bass: outputs.listening?.bass ?? null } };
    };
    // What read the chords, as the result says it: the choice, or what it fell back to.
    let readBy: string = CHORD_MODEL_ID.crema;
    if (msg.chordModel === 'combined' && tsumugi && sheetsage2) {
      withFrames(combineFrames(tsumugi.frames, sheetsage2), harmonyOf(tsumugi.harmony && combineFrames(tsumugi.harmony, sheetsage2)));
      readBy = CHORD_MODEL_ID.combined;
    } else if (msg.chordModel === 'sheetsage2' && sheetsage2) {
      withFrames(sheetsage2, null);
      readBy = CHORD_MODEL_ID.sheetsage2;
    } else if (tsumugi) {
      withFrames(tsumugi.frames, harmonyOf(tsumugi.harmony));
      readBy = CHORD_MODEL_ID.fine;
    } else if (msg.chordModel === 'combined' && sheetsage2) {
      withFrames(sheetsage2, null);
      readBy = CHORD_MODEL_ID.sheetsage2;
    }
    if (readBy !== CHORD_MODEL_ID.crema) {
      const ids = readBy === CHORD_MODEL_ID.fine ? ['tsumugi-chords'] : readBy === CHORD_MODEL_ID.sheetsage2 ? SHEETSAGE2_FILES.map((f) => f.id) : ['tsumugi-chords', ...SHEETSAGE2_FILES.map((f) => f.id)];
      models = [...models.filter((id) => id !== CHORD_MODEL_ID.crema), ...ids];
    }
    msg.stereo = [];

    // 4. Decode.
    ctl.step('finish');
    ctl.check();
    await rest();
    const result: ListenedResult = decode(outputs, msg.grid, msg.key, msg.known, { duration: msg.duration, models });
    if (fine || ss2) {
      const wanted = CHORD_MODEL_ID[msg.chordModel];
      const why = ss2 ? (ss2Fallback ?? fallback) : fallback;
      result.chordModel = readBy === wanted ? { id: readBy } : { id: readBy, fallback: why ?? 'failed', wanted, ...(ss2Message ? { detail: ss2Message } : {}) };
    }
    const tapped = tappedInfoOf(msg.grid);
    if (tapped) result.tapped = tapped;
    post({ type: 'result', result, outputs, models });
  } finally {
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));
  }
}

/**
 * The separated parts that carry the harmony, remixed with the bass (mono, at the piece's rate), as
 * the bench measured it (web/spikes/accords/modeles/bench/variantes.ts, `modele-tiges`): CREMA on
 * each candidate part, its features against the mix's, `selectHarmony`. Null when none carries it.
 * The parts' audio is let go here.
 */
async function harmonyRemix(
  stems: { name: string; mono: Float32Array }[],
  outputs: NetworkOutputs,
  msg: AnalyseRequestMessage,
  set: Sessions,
  ctl: StepControl,
): Promise<{ mono: Float32Array; stems: string[] } | null> {
  ctl.step('chords');
  const grid = msg.grid ? gridFromHint(msg.grid.times, msg.grid.downbeat, msg.grid.meter.numerator) : gridFromActivations(outputs.act).grid;
  if (grid.beats.length < 2) return null;
  const mixUnits = beatUnits(outputs.frames, outputs.timeScale, grid);
  const between = async () => {
    ctl.check();
    await ctl.yieldNow();
  };
  const feats: Record<string, StemFeatures> = {};
  const candidates = stems.filter((s) => isHarmonyCandidate(s.name) && s.name !== 'bass');
  for (const [k, s] of candidates.entries()) {
    const a44 = await resampleRatioAsync(s.mono, msg.sampleRate / 44100, 20, between);
    const quiet: StepControl = { ...ctl, step() {}, progress() {} };
    const { frames, timeScale } = await chordStage(ort as unknown as OrtLike, set, a44, outputs.tuning, quiet);
    feats[s.name] = stemFeatures(frames, frameRms(a44, frames.T, timeScale), beatUnits(frames, timeScale, grid), mixUnits, grid.numbers);
    ctl.progress((k + 1) / (candidates.length + 1) / 10);
  }
  const pick = selectHarmony(feats);
  if (!pick.length) return null;
  const bass = stems.find((s) => s.name === 'bass');
  if (bass) pick.push('bass');
  const parts = pick.map((n) => stems.find((s) => s.name === n)!.mono);
  const n = Math.max(...parts.map((p) => p.length));
  const mono = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) mono[i]! += p[i]!;
  return { mono, stems: pick };
}

/** The shipped graph of the fine model, checked against its SHA-256. */
async function fineGraph(): Promise<ArrayBuffer> {
  const res = await fetch(tsumugiGraphUrl);
  if (!res.ok) throw new Error(`the chord model graph could not be read (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength !== TSUMUGI_GRAPH.bytes || (await sha256Hex(bytes)) !== TSUMUGI_GRAPH.sha256) throw new Error('the chord model graph is damaged');
  return bytes;
}

/** Test hook (`?echec-accords=memoire|session`): make the fine model fail as it would on a small device. */
let simulatedFailure: string | null = null;

/**
 * Tsumugi-Chords over the piece (30 s windows) as ChordFrames for the decoding, or why it could
 * not run (the caller then keeps CREMA's). A cancellation goes through.
 */
async function fineChords(
  msg: AnalyseRequestMessage,
  first: AnalysisResult,
  weights: ArrayBuffer,
  ctl: StepControl,
  remix: Float32Array | null = null,
  units: { before: number; total: number } | null = null,
): Promise<{ frames?: ChordFrames; harmony?: ChordFrames; fallback?: ChordFallback }> {
  ctl.step('chords');
  let session: ort.InferenceSession | null = null;
  try {
    if (simulatedFailure === 'session') throw new Error('simulated: the chord model session could not be created');
    const graph = await fineGraph();
    ctl.check();
    session = await ort.InferenceSession.create(new Uint8Array(graph), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
      externalData: [{ path: TSUMUGI_WEIGHTS_LOCATION, data: new Uint8Array(weights) }],
    });
    ctl.check();
    if (!msg.stereo.length) throw new Error('no audio for the chord model');
    const [left, right] = tsumugiAudio(msg.stereo, msg.sampleRate);
    msg.stereo = [];
    await yieldNow();
    const b = first.beats;
    const n = b.meter.numerator;
    const numbers = b.times.map((_, i) => ((((i - b.downbeat) % n) + n) % n) + 1);
    const key = first.key ? { tonic: first.key.tonic, minor: first.key.mode === 'minor' } : null;
    const info = tsumugiInfo(b.times, numbers, key, msg.duration);
    // With the separated parts, the windows of both passes make one progress (same length, same count).
    const passes = remix ? 2 : 1;
    const window = (pass: number) => (done: number, total: number) => {
      if (simulatedFailure === 'memoire' && done === 1) throw new RangeError('simulated: Array buffer allocation failed');
      // With SheetSage2 after it (« Combinaison »), its pieces of work follow in the same count.
      const all = units && units.total > total * passes ? units.total : total * passes;
      const at = (units?.before ?? 0) + pass * total + done;
      post({ type: 'progress', step: 'chords', fraction: all ? at / all : 0, chordWindow: { done: at, total: all, ...(all > total * passes ? { kind: 'steps' as const } : {}) } });
    };
    const out = await runTsumugi(ort as unknown as OrtLike, asSession(session), left, right, info, ctl, window(0));
    const frames = tsumugiChordFrames(out);
    if (!remix) return { frames };
    // The parts that carry the harmony: one more pass, on their remix, with the same beats and key.
    // Should it fail, the analysis keeps the whole piece's (as without separation).
    try {
      const [l2, r2] = tsumugiAudio([remix], msg.sampleRate);
      await yieldNow();
      const h = await runTsumugi(ort as unknown as OrtLike, asSession(session), l2, r2, info, ctl, window(1));
      return { frames, harmony: tsumugiChordFrames(h) };
    } catch (e) {
      if (describe(e).code === 'cancelled') throw e;
      return { frames };
    }
  } catch (e) {
    const { code } = describe(e);
    if (code === 'cancelled') throw e;
    return { fallback: code === 'memory' ? 'memory' : 'failed' };
  } finally {
    await session?.release().catch(() => {});
  }
}

/** A graph of SheetSage2 shipped with the app, checked against the manifest's SHA-256. */
async function ss2Graph(info: Ss2GraphInfo): Promise<Uint8Array> {
  const url = SS2_GRAPH_URLS[info.graph];
  if (!url) throw new Error(`no SheetSage2 graph ${info.graph}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the SheetSage2 graph could not be read (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength !== info.bytes || (await sha256Hex(bytes)) !== info.sha256) throw new Error('a SheetSage2 graph is damaged');
  return new Uint8Array(bytes);
}

/**
 * SheetSage2 over the piece (24 kHz mono) as ChordFrames, or why it could not run. Each graph's
 * session reads only the slices of the authors' files it needs (`Blob.slice`), and is released
 * before the next one is created. A cancellation goes through.
 */
async function sheetsage2Chords(
  audio: Float32Array,
  files: { ss2: Blob; mert: Blob },
  ctl: StepControl,
  units: { before: number; total: number },
): Promise<{ frames?: ChordFrames; fallback?: ChordFallback; message?: string }> {
  ctl.step('chords');
  try {
    if (simulatedFailure === 'session') throw new Error('simulated: the chord model session could not be created');
    const rt: Ss2Runtime = {
      Tensor: ort.Tensor as unknown as Ss2Runtime['Tensor'],
      async open(info) {
        const graph = await ss2Graph(info);
        const externalData = [];
        for (const x of info.slices) {
          const blob = x.file === 'mert' ? files.mert : files.ss2;
          externalData.push({ path: x.name, data: new Uint8Array(await blob.slice(x.start, x.end).arrayBuffer()) });
        }
        ctl.check();
        const s = await ort.InferenceSession.create(graph, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3, externalData });
        return { run: (f) => s.run(f as Record<string, ort.Tensor>) as unknown as ReturnType<SessionLike['run']>, release: () => s.release() };
      },
    };
    const front = melFront(await files.mert.slice(0, SS2_FRONT_BYTES).arrayBuffer());
    const out = await runSheetSage2(rt, SS2_MANIFEST, front, audio, ctl, (p) => {
      if (simulatedFailure === 'memoire' && p.done === 1) throw new RangeError('simulated: Array buffer allocation failed');
      const at = units.before + p.done;
      post({ type: 'progress', step: 'chords', fraction: units.total ? at / units.total : p.fraction, chordWindow: { done: at, total: units.total, kind: 'steps' } });
    });
    return { frames: sheetsage2ChordFrames(out) };
  } catch (e) {
    const { code, message } = describe(e);
    if (code === 'cancelled') throw e;
    return { fallback: code === 'memory' ? 'memory' : 'failed', message: message.slice(0, 300) };
  }
}

async function decodeOnly(msg: DecodeRequestMessage): Promise<void> {
  const ctl = control();
  ctl.step('finish');
  const grid = gridFor(msg.outputs, msg.grid, msg.tempoFix);
  const result: ListenedResult = decode(msg.outputs, grid, msg.key, msg.known, { duration: msg.duration, models: msg.models });
  const tapped = tappedInfoOf(grid);
  if (tapped) result.tapped = tapped;
  post({ type: 'result', result, outputs: null, models: msg.models });
}

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancelRequested = true;
    sleeper.wake();
    return;
  }
  if (busy) {
    post({ type: 'error', code: 'failed', message: 'the worker is busy' });
    return;
  }
  busy = true;
  cancelRequested = false;
  const work = msg.type === 'analyse' ? analyse(msg) : decodeOnly(msg);
  work.catch((e) => {
    const { code, message } = describe(e);
    post({ type: 'error', code, message });
  }).finally(() => {
    busy = false;
  });
};
