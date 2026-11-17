// The instrument recogniser's worker: gets CED-Tiny onto the device the first time (pinned
// Hugging Face URL, SHA-256 checked, kept with the analysis tools), opens it with ONNX Runtime
// Web (WebAssembly, one thread: about a quarter of a second per 10 s window) and reads excerpts.
// One excerpt at a time, in the order asked.

import * as ort from 'onnxruntime-web/wasm';
import ortWasmModule from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmBinary from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MODEL_REGISTRY } from '../../analysis/models';
import { ensureModels, missingModels } from '../../analysis/models/download';
import { openModelStore } from '../../analysis/models/store';
import type { SessionLike } from '../../analysis/engine/session';
import { createSleeper, createThrottle } from '../../settings/easeLoad';
import { classifyExcerpt, sessionRunner } from './classify';
import type { FromInstrumentsWorker, ToInstrumentsWorker } from './protocol';

const scope = self as unknown as {
  postMessage(message: FromInstrumentsWorker): void;
  onmessage: ((ev: MessageEvent<ToInstrumentsWorker>) => void) | null;
};

const SPEC = MODEL_REGISTRY['ced-tiny'];
let session: Promise<SessionLike> | null = null;
const cancels = new Map<number, AbortController>();
let queue: Promise<void> = Promise.resolve();
/** The rest between two windows (« Alléger »): a cancellation wakes it at once. */
const sleeper = createSleeper();

async function openSession(download: boolean): Promise<SessionLike> {
  const store = await openModelStore();
  if (!download && (await missingModels([SPEC], store)).length) throw new Error('not downloaded');
  const files = await ensureModels([SPEC], { store });
  const bytes = files.get(SPEC.id);
  if (!bytes) throw new Error('model missing');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { mjs: ortWasmModule, wasm: ortWasmBinary };
  ort.env.logLevel = 'error';
  const s = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  return s as unknown as SessionLike;
}

async function recognise(msg: Extract<ToInstrumentsWorker, { type: 'recognise' }>): Promise<void> {
  const ctl = cancels.get(msg.id);
  try {
    if (ctl?.signal.aborted) return scope.postMessage({ type: 'result', id: msg.id, guess: null });
    session ??= openSession(msg.download);
    let s: SessionLike;
    try {
      s = await session;
    } catch (e) {
      session = null; // tried again next time (back online, download allowed)
      throw e;
    }
    // One thread, so only the rests: one after each window, as long as the window took, scaled by the share.
    const throttle = createThrottle({ share: msg.loadShare ?? 1, sleep: sleeper.sleep });
    throttle?.mark();
    const guess = await classifyExcerpt(msg.mono, msg.sampleRate, sessionRunner(ort as unknown as Parameters<typeof sessionRunner>[0], s), {
      signal: ctl?.signal,
      ...(throttle ? { pause: () => throttle.pause() } : {}),
    });
    scope.postMessage({ type: 'result', id: msg.id, guess });
  } catch (e) {
    if (ctl?.signal.aborted) scope.postMessage({ type: 'result', id: msg.id, guess: null });
    else scope.postMessage({ type: 'unavailable', id: msg.id, reason: e instanceof Error ? e.message : String(e) });
  } finally {
    cancels.delete(msg.id);
  }
}

scope.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancels.get(msg.id)?.abort();
    sleeper.wake();
    return;
  }
  cancels.set(msg.id, new AbortController());
  queue = queue.then(() => recognise(msg));
};
