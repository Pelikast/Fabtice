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
import { ensureModels, missingModels } from '../models/download';
import { openModelStore } from '../models/store';
import { AnalysisError, type AnalysisErrorCode, type AnalysisStep, type GridHint } from '../types';
import { BEAT_MODEL_ID, MODEL_REGISTRY, modelsFor } from '../models';
import { chartFromGrid, gridFromActivations, gridFromHint, runNetworks, type NetworkOutputs, type Sessions, type StepControl } from '../engine/pipeline';
import { resampleRatioAsync } from '../engine/resample';
import { toAnalysisResult, type ResultInput } from '../engine/result';
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

function tonalHint(key: Key | null) {
  return key ? { tonic: key.tonic, minor: key.mode === 'minor' } : null;
}

/** Grid, key and chords on the networks' outputs. Cheap. */
function decode(outputs: NetworkOutputs, grid: GridHint | null, key: Key | null, base: Pick<ResultInput, 'duration' | 'models'>) {
  let g;
  let meterScores: ResultInput['meterScores'] = [];
  if (grid) g = gridFromHint(grid.times, grid.downbeat, grid.meter.numerator);
  else {
    const r = gridFromActivations(outputs.act);
    g = r.grid;
    meterScores = r.meterScores;
  }
  if (g.beats.length < 2) throw new AnalysisError('no-music', 'no beats found');
  const chart = chartFromGrid(outputs.frames, outputs.timeScale, g, tonalHint(key));
  return toAnalysisResult({
    grid: g,
    downbeat: grid ? grid.downbeat : undefined,
    meterScores,
    gridIsHint: !!grid,
    key: chart.key,
    keyIsHint: !!key,
    tuning: outputs.tuning,
    segments: chart.segments,
    ...base,
  });
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
  const specs = modelsFor(msg.beatModel);
  const modelIds = specs.map((s) => s.id);
  const store = await openModelStore();

  // 1. The tools, from the device or from their public location.
  const missing = await missingModels(specs, store);
  post({ type: 'plan', downloadBytes: missing.reduce((n, s) => n + s.bytes, 0) });
  const controller = new AbortController();
  const watch = setInterval(() => {
    if (cancelRequested) controller.abort();
  }, 100);
  let files: Map<string, ArrayBuffer>;
  try {
    if (missing.length) ctl.step('download');
    files = await ensureModels(specs, {
      store,
      signal: controller.signal,
      onProgress: (p) => post({ type: 'progress', step: 'download', fraction: p.total ? p.loaded / p.total : 0, download: p }),
    });
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
    const outputs = await runNetworks(ort as unknown as OrtLike, set, a22, a44, ctl);
    a22 = null;
    a44 = null;
    // The sessions are no longer needed: free their memory before decoding.
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));

    // 3. Decode.
    ctl.step('finish');
    ctl.check();
    await yieldNow();
    const result = decode(outputs, msg.grid, msg.key, { duration: msg.duration, models: modelIds });
    post({ type: 'result', result, outputs, models: modelIds });
  } finally {
    await Promise.all(sessions.splice(0).map((s) => s.release().catch(() => {})));
  }
}

async function decodeOnly(msg: DecodeRequestMessage): Promise<void> {
  const ctl = control();
  ctl.step('finish');
  const result = decode(msg.outputs, msg.grid, msg.key, { duration: msg.duration, models: msg.models });
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
