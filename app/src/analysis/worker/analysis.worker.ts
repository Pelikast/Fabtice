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
import { ensureModels, missingModels, sha256Hex } from '../models/download';
import { openModelStore } from '../models/store';
import { AnalysisError, type AnalysisErrorCode, type AnalysisStep, type ChordFallback, type GridHint, type ListenedResult } from '../types';
import { BEAT_MODEL_ID, CHORD_MODEL_ID, MODEL_REGISTRY, TSUMUGI_GRAPH, modelsFor } from '../models';
import { TSUMUGI_WEIGHTS_LOCATION, runTsumugi, tsumugiAudio, tsumugiChordFrames, tsumugiInfo } from '../engine/tsumugi';
import type { AnalysisResult } from '../../model/analysis';
import type { ChordFrames } from '../engine/chords';
import { resultFromOutputs } from '../engine/analyse';
import { applyTempoFix, type TempoFixRequest } from '../engine/tempoFix';
import type { KnownCharts } from '../engine/chart';
import { runNetworks, type NetworkOutputs, type Sessions, type StepControl } from '../engine/pipeline';
import { resampleRatioAsync } from '../engine/resample';
import type { OrtLike, SessionLike } from '../engine/session';
import type { Key } from '../../model/harmony';
import type { AnalyseRequestMessage, DecodeRequestMessage, FromWorker, ToWorker } from './protocol';

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

const yieldNow = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function control(): StepControl {
  let current: AnalysisStep = 'prepare';
  return {
    check() {
      if (cancelRequested) throw new AnalysisError('cancelled');
    },
    progress(fraction) {
      post({ type: 'progress', step: current, fraction: Math.min(1, Math.max(0, fraction)) });
    },
    yieldNow,
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

function configureOrt(): void {
  const isolated = scope.crossOriginIsolated === true;
  const cores = scope.navigator?.hardwareConcurrency || 1;
  ort.env.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores)) : 1;
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
function gridFor(outputs: NetworkOutputs, grid: GridHint | null, fix: TempoFixRequest | null | undefined): GridHint | null {
  return fix ? applyTempoFix(outputs.act, fix) : grid;
}

/** The piece at 22.05 kHz (Beat This!) and 44.1 kHz (CREMA); the 48 kHz mono copy is dropped on the way. */
async function resampleAll(msg: AnalyseRequestMessage, ctl: StepControl): Promise<{ a22: Float32Array; a44: Float32Array }> {
  const mono = msg.mono;
  msg.mono = new Float32Array(0); // the message must not keep the piece alive
  const between = async () => {
    ctl.check();
    await yieldNow();
  };
  const a22 = await resampleRatioAsync(mono, msg.sampleRate / 22050, 32, between);
  ctl.progress(0.7);
  const a44 = await resampleRatioAsync(mono, msg.sampleRate / 44100, 20, between);
  return { a22, a44 };
}

async function analyse(msg: AnalyseRequestMessage): Promise<void> {
  const ctl = control();
  const fine = msg.chordModel === 'fine';
  simulatedFailure = msg.simulateChordFailure ?? null;
  const specs = modelsFor(msg.beatModel, msg.chordModel);
  const base = modelsFor(msg.beatModel);
  const store = await openModelStore();

  // 1. The tools, from the device or from their public location. The fine chord model's
  //    weights come last: if they cannot be had, CREMA reads the chords (said in the result).
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
  } finally {
    clearInterval(watch);
  }

  // 2. Prepare: the sessions, then the audio at the networks' rates.
  ctl.step('prepare');
  ctl.check();
  configureOrt();
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

    ({ a22, a44 } = await resampleAll(msg, ctl));
    ctl.progress(1);

    const set: Sessions = { logmel: asSession(logmel), beat: asSession(beat), crema: asSession(crema) };
    let outputs = await runNetworks(ort as unknown as OrtLike, set, a22, a44, ctl);
    msg.grid = gridFor(outputs, msg.grid, msg.tempoFix);
    a22 = null;
    a44 = null;
    // The sessions are no longer needed: free their memory before decoding.
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));

    // 3. The fine chord model, fed with the beats and the key of the analysis just made.
    let models = base.map((s) => s.id);
    if (fine && fineWeights && !fallback) {
      const first = decode(outputs, msg.grid, msg.key, msg.known, { duration: msg.duration, models });
      const weights = fineWeights;
      fineWeights = null;
      const r = await fineChords(msg, first, weights, ctl);
      if (r.fallback) fallback = r.fallback;
      else if (r.frames) {
        outputs = { ...outputs, frames: r.frames, timeScale: 1 };
        models = models.map((id) => (id === CHORD_MODEL_ID.crema ? CHORD_MODEL_ID.fine : id));
      }
    }
    msg.stereo = [];

    // 4. Decode.
    ctl.step('finish');
    ctl.check();
    await yieldNow();
    const result: ListenedResult = decode(outputs, msg.grid, msg.key, msg.known, { duration: msg.duration, models });
    if (fine) result.chordModel = fallback ? { id: CHORD_MODEL_ID.crema, fallback } : { id: CHORD_MODEL_ID.fine };
    post({ type: 'result', result, outputs, models });
  } finally {
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));
  }
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
): Promise<{ frames?: ChordFrames; fallback?: ChordFallback }> {
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
    const out = await runTsumugi(ort as unknown as OrtLike, asSession(session), left, right, info, ctl, (done, total) => {
      if (simulatedFailure === 'memoire' && done === 1) throw new RangeError('simulated: Array buffer allocation failed');
      post({ type: 'progress', step: 'chords', fraction: total ? done / total : 0, chordWindow: { done, total } });
    });
    return { frames: tsumugiChordFrames(out) };
  } catch (e) {
    const { code } = describe(e);
    if (code === 'cancelled') throw e;
    return { fallback: code === 'memory' ? 'memory' : 'failed' };
  } finally {
    await session?.release().catch(() => {});
  }
}

async function decodeOnly(msg: DecodeRequestMessage): Promise<void> {
  const ctl = control();
  ctl.step('finish');
  const result = decode(msg.outputs, gridFor(msg.outputs, msg.grid, msg.tempoFix), msg.key, msg.known, { duration: msg.duration, models: msg.models });
  post({ type: 'result', result, outputs: null, models: msg.models });
}

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancelRequested = true;
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
