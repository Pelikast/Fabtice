// `createInstrumentRecognizer`: the `InstrumentRecognizer` of `structure/types.ts`. The work is
// done by a small worker of its own, started on the first excerpt; the model is downloaded the
// first time (with the analysis tools' store and download code). It never throws: whatever goes
// wrong (offline, download refused or not allowed, no WebAssembly, a model that cannot run, an
// abort) resolves to null, and the part stays « Solo (Vents) » or without instrument.

import type { AnalysisModelInfo } from '../../analysis/types';
import { MODEL_REGISTRY } from '../../analysis/models';
import { openModelStore } from '../../analysis/models/store';
import type { InstrumentGuess, InstrumentRecognizer } from '../types';
import type { FromInstrumentsWorker, ToInstrumentsWorker } from './protocol';

/** What the recogniser needs from a worker (a real `Worker`, or a fake in tests). */
export interface InstrumentsWorkerLike {
  postMessage(message: ToInstrumentsWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<FromInstrumentsWorker>) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  terminate(): void;
}

export interface RecognizerOptions {
  /** The worker (replaceable in tests). */
  createWorker?: () => InstrumentsWorkerLike;
  /** Whether the model may be downloaded when it is not on the device yet (default: yes). */
  allowDownload?: () => boolean | Promise<boolean>;
  /** Longest wait for one excerpt, download included (default 3 min): null after. */
  timeoutMs?: number;
  /** After the model was found unusable, how long to answer null at once before trying again (default 10 min). */
  retryMs?: number;
  /** Clock (tests). */
  now?: () => number;
}

/** The model as the interface shows it: name, role, source, licence, size, kept or not. */
export const INSTRUMENT_MODEL = MODEL_REGISTRY['ced-tiny'];

export async function instrumentModelInfo(): Promise<AnalysisModelInfo> {
  const { sha256, ...info } = INSTRUMENT_MODEL;
  let cached = false;
  try {
    cached = await (await openModelStore()).hasFile(info.id, info.bytes, sha256);
  } catch {
    cached = false;
  }
  return { ...info, cached };
}

function defaultWorker(): InstrumentsWorkerLike {
  return new Worker(new URL('./instruments.worker.ts', import.meta.url), { type: 'module', name: 'fabtice-instruments' }) as unknown as InstrumentsWorkerLike;
}

const supported = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

export function createInstrumentRecognizer(options: RecognizerOptions = {}): InstrumentRecognizer & { dispose(): void } {
  const injected = !!options.createWorker;
  const createWorker = options.createWorker ?? defaultWorker;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const retryMs = options.retryMs ?? 600_000;
  const now = options.now ?? (() => Date.now());
  let worker: InstrumentsWorkerLike | null = null;
  let unusableSince = -Infinity;
  let nextId = 1;
  const pending = new Map<number, (m: FromInstrumentsWorker | null) => void>();

  const drop = () => {
    worker?.terminate();
    worker = null;
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  };

  const ensureWorker = (): InstrumentsWorkerLike => {
    if (worker) return worker;
    const w = createWorker();
    w.onmessage = (ev) => {
      const m = ev.data;
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    };
    w.onerror = () => {
      unusableSince = now();
      drop();
    };
    worker = w;
    return w;
  };

  async function recognise(mono: Float32Array, sampleRate: number, signal?: AbortSignal): Promise<InstrumentGuess | null> {
    try {
      if (signal?.aborted || !mono.length || !(sampleRate > 0)) return null;
      if (!injected && !supported()) return null;
      if (now() - unusableSince < retryMs) return null;
      const download = options.allowDownload ? await options.allowDownload() : true;
      if (signal?.aborted) return null;
      const w = ensureWorker();
      const id = nextId++;
      const copy = mono.slice(); // the caller keeps its excerpt
      const answer = await new Promise<FromInstrumentsWorker | null>((resolve) => {
        const timer = setTimeout(() => {
          w.postMessage({ type: 'cancel', id });
          pending.delete(id);
          resolve(null);
        }, timeoutMs);
        const onAbort = () => {
          w.postMessage({ type: 'cancel', id });
          pending.delete(id);
          resolve(null);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        pending.set(id, (m) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve(m);
        });
        w.postMessage({ type: 'recognise', id, mono: copy, sampleRate, download }, [copy.buffer]);
      });
      if (!answer) return null;
      if (answer.type === 'unavailable') {
        // Not downloaded and not allowed to be: asked again next time, when it may be allowed.
        if (download) unusableSince = now();
        return null;
      }
      return answer.guess;
    } catch {
      return null;
    }
  }

  return { recognise, dispose: drop };
}
