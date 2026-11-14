// The real analyser: the `Analyzer` of `types.ts` backed by a Web Worker
// (`worker/analysis.worker.ts`) that runs ONNX Runtime Web.
//
// This side is light on purpose, since it runs on the interface's thread:
//   - it mixes the piece to mono (in slices, yielding between them) and hands
//     that one copy to the worker by transfer; the piece the engine plays is
//     never touched;
//   - it turns the worker's step messages into the contract's progress (one
//     fraction for the whole analysis that never goes back, with the weights
//     of each step, and a steady beat while a long network run gives no news);
//   - it ends the worker when the analysis ends, whatever the way (the memory
//     of WebAssembly cannot be given back otherwise), and at once when the
//     analysis is cancelled.
// The small outputs of the networks are kept for the audio just analysed, so
// that « keep my grid / my key » on the same audio decodes again (cheap)
// without running the networks.

import type { AnalysisResult } from '../model/analysis';
import { mixToMono } from './engine/resample';
import type { NetworkOutputs } from './engine/pipeline';
import { modelsFor, type BeatModelChoice } from './models';
import { openModelStore } from './models/store';
import {
  AnalysisError,
  type AnalysisErrorCode,
  type AnalysisModelInfo,
  type AnalysisProgress,
  type AnalysisRequest,
  type AnalysisStep,
  type Analyzer,
} from './types';
import type { AnalyseRequestMessage, DecodeRequestMessage, FromWorker, ToWorker } from './worker/protocol';

/**
 * Share of the whole analysis each step takes once the tools are on the
 * device (they add up to 1). Measured on a 4-minute piece, 4 threads: loading
 * the networks and resampling 3.6 s, tuning 0.6 s, beats 13 s, chords 1.3 s,
 * decoding 0.4 s.
 */
export const STEP_WEIGHTS: Record<Exclude<AnalysisStep, 'download'>, number> = {
  prepare: 0.15,
  tuning: 0.03,
  beats: 0.65,
  chords: 0.12,
  finish: 0.05,
};
/** The first download takes this share of the progress when there is one. */
export const DOWNLOAD_SHARE = 0.3;

/** How long a cancelled worker is given to put its work away before it is ended. */
const GRACE_MS = 300;

/** Expected duration of the chord network, in seconds of work per second of music (for the steady progress). */
const CHORD_SECONDS_PER_SECOND = 0.01;

export interface FabticeAnalyzerOptions {
  beatModel?: BeatModelChoice;
  /** The worker (replaceable in tests). */
  createWorker?: () => Worker;
}

function defaultWorker(): Worker {
  return new Worker(new URL('./worker/analysis.worker.ts', import.meta.url), { type: 'module', name: 'fabtice-analysis' });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether this browser can run the analysis at all. */
export function analysisSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export class FabticeAnalyzer implements Analyzer {
  readonly id = 'fabtice';
  private readonly beatModel: BeatModelChoice;
  private readonly createWorker: () => Worker;
  /** The analysis in progress (its signal tells when it is being given up: a new one may then start at once). */
  private active: { signal?: AbortSignal } | null = null;
  private current: Worker | null = null;
  private kept: { audioId: string; outputs: NetworkOutputs; duration: number; models: string[] } | null = null;

  constructor(options: FabticeAnalyzerOptions = {}) {
    this.beatModel = options.beatModel ?? 'light';
    this.createWorker = options.createWorker ?? defaultWorker;
  }

  async models(): Promise<AnalysisModelInfo[]> {
    const specs = modelsFor(this.beatModel);
    let has: (id: string, bytes: number, sha: string) => Promise<boolean> = async () => false;
    try {
      const store = await openModelStore();
      has = (id, bytes, sha) => store.hasFile(id, bytes, sha);
    } catch {
      // Nothing is known to be kept.
    }
    return Promise.all(
      specs.map(async ({ sha256, ...info }) => ({ ...info, cached: await has(info.id, info.bytes, sha256).catch(() => false) })),
    );
  }

  async analyse(request: AnalysisRequest): Promise<AnalysisResult> {
    // One analysis at a time. One that was just cancelled may still be unwinding (its promise has
    // not yet rejected when the runner starts the next one): it does not count.
    if (this.active && !this.active.signal?.aborted) throw new AnalysisError('failed', 'an analysis is already running');
    if (!analysisSupported()) throw new AnalysisError('unsupported');
    const { signal } = request;
    if (signal?.aborted) throw new AnalysisError('cancelled');
    const { channels, sampleRate } = request;
    const length = channels[0]?.length ?? 0;
    if (!channels.length || length === 0) throw new AnalysisError('no-music');
    const mine = { signal };
    this.active = mine;
    try {
      const duration = length / sampleRate;
      const reuse = this.kept && this.kept.audioId === request.audioId && (request.grid || request.key) ? this.kept : null;
      if (!reuse) this.kept = null;
      let message: ToWorker;
      let transfer: Transferable[] = [];
      if (reuse) {
        message = { type: 'decode', outputs: reuse.outputs, duration: reuse.duration, models: reuse.models, grid: request.grid ?? null, key: request.key ?? null } satisfies DecodeRequestMessage;
      } else {
        const mono = await this.mix(channels, length, signal);
        message = {
          type: 'analyse',
          mono,
          sampleRate,
          duration,
          beatModel: this.beatModel,
          grid: request.grid ?? null,
          key: request.key ?? null,
        } satisfies AnalyseRequestMessage;
        transfer = [mono.buffer];
      }
      const { result, outputs, models } = await this.talk(message, transfer, duration, request);
      if (outputs) this.kept = { audioId: request.audioId, outputs, duration, models };
      return result;
    } finally {
      if (this.active === mine) this.active = null;
    }
  }

  dispose(): void {
    this.end(this.current, false);
    this.kept = null;
  }

  /** Mono mix of the piece, done in slices so that the interface keeps breathing. */
  private async mix(channels: readonly Float32Array[], length: number, signal?: AbortSignal): Promise<Float32Array> {
    const mono = new Float32Array(length);
    const SLICE = 1 << 20;
    for (let i = 0; i < length; i += SLICE) {
      if (signal?.aborted) throw new AnalysisError('cancelled');
      mixToMono(channels, mono, i, Math.min(length, i + SLICE));
      if (length > 2 * SLICE) await sleep(0);
    }
    return mono;
  }

  /** Ends a worker: at once, or after a short grace for a cancelled one to put its work away. */
  private end(worker: Worker | null, grace: boolean): void {
    if (!worker) return;
    if (this.current === worker) this.current = null;
    if (grace) {
      worker.postMessage({ type: 'cancel' } satisfies ToWorker);
      setTimeout(() => worker.terminate(), GRACE_MS);
    } else worker.terminate();
  }

  private talk(
    message: ToWorker,
    transfer: Transferable[],
    duration: number,
    request: AnalysisRequest,
  ): Promise<{ result: AnalysisResult; outputs: NetworkOutputs | null; models: string[] }> {
    return new Promise((resolve, reject) => {
      const { signal } = request;
      let worker: Worker;
      try {
        worker = this.createWorker();
      } catch (e) {
        reject(new AnalysisError('unsupported', e instanceof Error ? e.message : String(e)));
        return;
      }
      this.current = worker;
      let settled = false;

      // ---- progress: one fraction for the whole analysis, never going back
      let downloadBytes = 0;
      let step: AnalysisStep = 'prepare';
      let stepFraction = 0;
      let stepStarted = performance.now();
      let latest = 0;
      let download: AnalysisProgress['download'];
      const share = (s: AnalysisStep): [number, number] => {
        const scale = downloadBytes > 0 ? 1 - DOWNLOAD_SHARE : 1;
        if (s === 'download') return [0, DOWNLOAD_SHARE];
        let base = downloadBytes > 0 ? DOWNLOAD_SHARE : 0;
        for (const k of ['prepare', 'tuning', 'beats', 'chords', 'finish'] as const) {
          if (k === s) return [base, STEP_WEIGHTS[k] * scale];
          base += STEP_WEIGHTS[k] * scale;
        }
        return [1, 0];
      };
      const report = () => {
        const [base, weight] = share(step);
        let f = stepFraction;
        // The chord network gives no news while it runs: advance on the clock, never to the end.
        if (step === 'chords' && f === 0) {
          const expected = Math.max(1, duration * CHORD_SECONDS_PER_SECOND);
          f = Math.min(0.95, 1 - Math.exp(-(performance.now() - stepStarted) / 1000 / expected));
        }
        latest = Math.max(latest, Math.min(1, base + weight * f));
        try {
          request.onProgress?.({ step, fraction: latest, ...(download ? { download } : {}) });
        } catch {
          // a failing listener never breaks the analysis
        }
      };
      const beat = setInterval(report, 400);

      // ---- ending
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true;
        clearInterval(beat);
        signal?.removeEventListener('abort', onAbort);
        this.end(worker, !ok && (value as AnalysisError)?.code === 'cancelled');
        if (ok) resolve(value as { result: AnalysisResult; outputs: NetworkOutputs | null; models: string[] });
        else reject(value);
      };
      const onAbort = () => finish(false, new AnalysisError('cancelled'));
      signal?.addEventListener('abort', onAbort, { once: true });

      worker.onmessage = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data;
        switch (m.type) {
          case 'plan':
            downloadBytes = m.downloadBytes;
            break;
          case 'step':
            step = m.step;
            stepFraction = 0;
            stepStarted = performance.now();
            report();
            break;
          case 'progress':
            step = m.step;
            stepFraction = m.fraction;
            download = m.download;
            report();
            break;
          case 'result':
            latest = 1;
            try {
              request.onProgress?.({ step: 'finish', fraction: 1 });
            } catch {
              // ignored
            }
            finish(true, { result: m.result, outputs: m.outputs, models: m.models });
            break;
          case 'error':
            finish(false, new AnalysisError(m.code, m.message));
            break;
        }
      };
      worker.onerror = (ev) => {
        ev.preventDefault?.();
        const code: AnalysisErrorCode = typeof WebAssembly === 'undefined' ? 'unsupported' : 'failed';
        finish(false, new AnalysisError(code, ev.message || 'the analysis worker failed'));
      };
      worker.onmessageerror = () => finish(false, new AnalysisError('failed', 'the analysis worker sent something unreadable'));
      try {
        worker.postMessage(message, transfer);
      } catch (e) {
        finish(false, new AnalysisError('failed', e instanceof Error ? e.message : String(e)));
      }
    });
  }
}
