// The real separator: the `Separator` of `types.ts` backed by a Web Worker
// (`worker/separation.worker.ts`) that runs ONNX Runtime Web, on the
// graphics chip (WebGPU) first when asked, on the processor (WebAssembly)
// otherwise. The tools of `models.json` are downloaded at first use from
// their public location (resumable, SHA-256 checked, kept in their own
// database).
//
// This side is light on purpose (it runs on the interface's thread, and is
// loaded with the app: ONNX Runtime itself is only loaded by the worker, when
// a separation starts):
//   - it hands the piece to the worker as it is in memory (shared, no copy);
//   - it writes the parts the worker hands back into one 16-bit track per
//     part (`PcmWriter`), stretch by stretch: the parts are never held as
//     Float32 for the whole piece;
//   - progress: one fraction for the whole run that never goes back, and a
//     remaining time measured from the real pace of the segments of the
//     current path (said once two segments have been timed);
//   - graphics failure (session, segment, garbage, lost device, a worker that
//     dies or stops answering): the worker is ended and a processor worker
//     goes on with THE SAME TOOL from the frames already written; `fellBack`
//     is reported at once. The tool is never changed here;
//   - cancellation rejects at once and ends the worker (its memory is only
//     given back that way);
//   - after a separation, a measurement report (`report.ts`).

import { PcmWriter, type PcmAudio } from '../audio/pcm';
import { openModelStore, type ModelStore } from '../analysis/models/store';
import type { SeparationBackend } from '../model/separation';
import type { SeparationReport } from './report';
import { SEPARATION_STORE_OPTIONS, SEPARATION_TOOLS_DB } from './toolsDb';
import {
  SeparationError,
  type SeparatedTrack,
  type SeparationModelSpec,
  type SeparationOutput,
  type SeparationProgress,
  type SeparationRequest,
  type SeparationStep,
  type Separator,
  type ToolsUsage,
} from './types';
import type { FromWorker, GpuFailure, SeparateMessage, ToWorker, WorkerBackend } from './worker/protocol';

/** Version of ONNX Runtime Web in use (package.json), for the report. */
const RUNTIME = 'ONNX Runtime Web 1.31.1';

/** Share of the progress the first download takes, when there is one. */
export const DOWNLOAD_SHARE = 0.15;
/** Loading the tool, before the first segment. */
const PREPARE_SHARE = 0.03;
/** Writing the tracks after the last segment (the runner keeps them on the device). */
const FINISH_SHARE = 0.02;

/** How long a cancelled worker is given before it is ended. */
const GRACE_MS = 200;
/** A graphics segment that takes this long (or this many times the usual) is a stalled device. */
const GPU_FIRST_SEGMENT_LIMIT_S = 300;
const GPU_SEGMENT_LIMIT_S = 90;
const GPU_SEGMENT_LIMIT_FACTOR = 10;

export interface OnnxSeparatorOptions {
  /** The worker (replaceable in tests). */
  createWorker?: () => Worker;
  /** The store of the tools (tests). */
  store?: () => Promise<ModelStore>;
  /** Browser checks only: the « graphics » path runs on the processor and fails at this segment (see the worker). */
  simulateGpuFailureAt?: number;
}

function defaultWorker(): Worker {
  return new Worker(new URL('./worker/separation.worker.ts', import.meta.url), { type: 'module', name: 'fabtice-separation' });
}

/** Whether this browser can run a separation at all. */
export function separationSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

const now = () => performance.now() / 1000;

/** The pace of the segments of one path: honest remaining time once two have been timed. */
export class Pace {
  private times: number[] = [];
  /** A new path (the processor taking over): its pace is measured afresh. */
  reset(): void {
    this.times = [];
  }
  add(seconds: number): void {
    this.times.push(seconds);
  }
  /** Seconds per segment, leaving out the first of the path (it includes warming up) once there are more. */
  perSegment(): number | null {
    if (this.times.length < 2) return null;
    const use = this.times.slice(1);
    return use.reduce((a, b) => a + b, 0) / use.length;
  }
  /** Remaining seconds for `left` segments, or null until it can be said. */
  remaining(left: number): number | null {
    const per = this.perSegment();
    return per === null ? null : Math.max(0, per * left);
  }
}

interface Attempt {
  backend: WorkerBackend;
  worker: Worker;
  /** Segments timed on this path. */
  times: number[];
  sessionSeconds: number | null;
  firstSegment: number | null;
}

export class OnnxSeparator implements Separator {
  readonly kind = 'onnx';
  private readonly createWorker: () => Worker;
  private readonly openStore: () => Promise<ModelStore>;
  private running = false;
  private readonly injected: boolean;
  private readonly simulateGpuFailureAt: number | undefined;

  constructor(options: OnnxSeparatorOptions = {}) {
    this.simulateGpuFailureAt = options.simulateGpuFailureAt;
    this.createWorker = options.createWorker ?? defaultWorker;
    this.injected = !!options.createWorker;
    this.openStore = options.store ?? (() => openModelStore(SEPARATION_TOOLS_DB, SEPARATION_STORE_OPTIONS));
  }

  async isCached(model: SeparationModelSpec): Promise<boolean> {
    try {
      return await (await this.openStore()).hasFile(model.id, model.file.bytes, model.file.sha256);
    } catch {
      return false;
    }
  }

  async toolsUsage(): Promise<ToolsUsage> {
    const cached = await (await this.openStore()).listFiles();
    return { cached, bytes: cached.reduce((n, c) => n + c.bytes, 0) };
  }

  async forgetTools(): Promise<void> {
    await (await this.openStore()).clearAll();
  }

  async separate(request: SeparationRequest): Promise<SeparationOutput> {
    if (this.running) throw new SeparationError('failed', 'a separation is already running');
    if (!this.injected && !separationSupported()) throw new SeparationError('unsupported');
    if (request.signal.aborted) throw new SeparationError('cancelled');
    this.running = true;
    try {
      return await this.run(request);
    } finally {
      this.running = false;
    }
  }

  private run(request: SeparationRequest): Promise<SeparationOutput> {
    const { audio, model, signal } = request;
    const S = model.stems.length;
    const monoOut = audio.mono;
    const writers = model.stems.map(() => new PcmWriter(audio.frames, audio.sampleRate, audio.channelCount));

    return new Promise<SeparationOutput>((resolve, reject) => {
      let settled = false;
      let attempt: Attempt | null = null;
      // ---- state of the run
      let step: SeparationStep = 'prepare';
      let backend: SeparationBackend | null = null;
      let fellBack = false;
      let fallback: SeparationReport['fallback'] = null;
      let downloadBytes = 0;
      let download: SeparationProgress['download'];
      let downloadStarted: number | null = null;
      let downloadSeconds: number | null = null;
      let readSeconds: number | null = null;
      let computeStarted: number | null = null;
      let written = 0;
      let segments = 0;
      let lastIndex = -1;
      let lastSegmentAt = now();
      let latest = 0;
      let adapter: string | null = null;
      let threads: number | null = null;
      let segmentSeconds = 0;
      const pace = new Pace();
      const perPath: Record<WorkerBackend, number[]> = { gpu: [], cpu: [] };
      const sessions: Record<WorkerBackend, number | null> = { gpu: null, cpu: null };

      const dlShare = () => (downloadBytes > 0 ? DOWNLOAD_SHARE : 0);
      const fractionNow = (): number => {
        const base = dlShare();
        const rest = 1 - base;
        if (step === 'download') return base * (download && download.total ? download.loaded / download.total : 0);
        if (step === 'prepare') return base + rest * PREPARE_SHARE * 0.5;
        if (step === 'finish') return base + rest * (1 - FINISH_SHARE);
        // Separating: what is written, and the segment in progress on the clock (never to its end).
        let done = written / Math.max(1, audio.frames);
        const per = pace.perSegment();
        if (per && segments > 0) done += Math.min(0.9, (now() - lastSegmentAt) / per) / segments;
        return base + rest * (PREPARE_SHARE + (1 - PREPARE_SHARE - FINISH_SHARE) * Math.min(1, done));
      };
      const remainingNow = (): number | null => {
        if (step !== 'separate' || segments === 0) return null;
        const left = pace.remaining(Math.max(0, segments - 1 - lastIndex));
        return left === null ? null : Math.max(0, left - (now() - lastSegmentAt));
      };
      const report = () => {
        latest = Math.max(latest, Math.min(1, fractionNow()));
        try {
          request.onProgress({ step, fraction: latest, remainingSeconds: remainingNow(), ...(download && step === 'download' ? { download } : {}), backend, fellBack });
        } catch {
          // never into the separator
        }
      };
      const beat = setInterval(() => {
        report();
        watchdog();
      }, 500);

      // ---- ending
      const end = (worker: Worker | null, grace: boolean) => {
        if (!worker) return;
        if (grace) {
          try {
            worker.postMessage({ type: 'cancel' } satisfies ToWorker);
          } catch {
            // already gone
          }
          setTimeout(() => worker.terminate(), GRACE_MS);
        } else worker.terminate();
      };
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true;
        clearInterval(beat);
        signal.removeEventListener('abort', onAbort);
        const cancelled = !ok && value instanceof SeparationError && value.code === 'cancelled';
        end(attempt?.worker ?? null, cancelled);
        attempt = null;
        if (ok) resolve(value as SeparationOutput);
        else reject(value);
      };
      const onAbort = () => finish(false, new SeparationError('cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });

      const succeed = () => {
        step = 'finish';
        report();
        const tracks: SeparatedTrack[] = model.stems.map((stem, s) => ({ stem, audio: writers[s]!.finish() as PcmAudio }));
        const computeSeconds = computeStarted === null ? 0 : now() - computeStarted;
        const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
        const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number });
        const rep: SeparationReport = {
          toolId: model.id,
          toolName: model.name,
          toolSha256: model.file.sha256,
          requested: request.backend,
          backend: backend ?? 'cpu',
          adapter,
          fellBack,
          fallback,
          pieceSeconds: audio.frames / audio.sampleRate,
          channels: audio.mono ? 'mono' : 'stereo',
          segmentSeconds,
          segments,
          computeSeconds,
          perSegment: { gpu: avg(perPath.gpu), cpu: avg(perPath.cpu) },
          sessionSeconds: sessions,
          download: downloadSeconds !== null ? { seconds: downloadSeconds, bytes: downloadBytes } : null,
          readSeconds,
          threads,
          isolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true,
          cores: nav?.hardwareConcurrency ?? null,
          memoryGB: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
          browser: nav?.userAgent ?? '?',
          runtime: RUNTIME,
          at: new Date().toISOString(),
        };
        tracks.forEach((tr) => {
          try {
            request.onTrack?.(tr);
          } catch {
            // ignored
          }
        });
        finish(true, { tracks, backend: backend ?? 'cpu', fellBack, computeSeconds, report: rep } satisfies SeparationOutput);
      };

      // ---- the graphics path failed: the processor goes on, same tool, from what is written
      const fallBack = (stage: GpuFailure | 'timeout' | 'crash', segment: number | null, message: string) => {
        if (settled || !attempt || attempt.backend !== 'gpu') return;
        end(attempt.worker, false);
        attempt = null;
        fellBack = true;
        fallback = { stage, segment, message };
        backend = 'cpu';
        pace.reset();
        lastSegmentAt = now();
        report();
        launch('cpu');
      };

      const watchdog = () => {
        if (!attempt || attempt.backend !== 'gpu' || step !== 'separate') return;
        const per = attempt.times.length ? attempt.times.reduce((a, b) => a + b, 0) / attempt.times.length : null;
        const limit = per === null ? GPU_FIRST_SEGMENT_LIMIT_S : Math.max(GPU_SEGMENT_LIMIT_S, per * GPU_SEGMENT_LIMIT_FACTOR);
        if (now() - lastSegmentAt > limit) fallBack('timeout', lastIndex + 1, `no segment for ${Math.round(now() - lastSegmentAt)} s`);
      };

      const onMessage = (a: Attempt, m: FromWorker) => {
        if (settled || attempt !== a) return; // an ended worker may still be talking for a moment
        switch (m.type) {
          case 'plan':
            if (m.downloadBytes > 0 && downloadBytes === 0) {
              downloadBytes = m.downloadBytes;
              downloadStarted = now();
              step = 'download';
              download = { loaded: 0, total: m.downloadBytes };
            }
            report();
            break;
          case 'download':
            download = { loaded: m.loaded, total: m.total };
            report();
            break;
          case 'tool':
            if (m.downloaded && downloadStarted !== null && downloadSeconds === null) downloadSeconds = now() - downloadStarted;
            if (!m.downloaded && readSeconds === null) readSeconds = m.seconds;
            // After a fallback the run is still separating (the processor loading the same tool).
            if (step !== 'separate') step = 'prepare';
            computeStarted ??= now();
            report();
            break;
          case 'ready':
            a.sessionSeconds = m.sessionSeconds;
            sessions[a.backend] = m.sessionSeconds;
            if (m.adapter) adapter = m.adapter;
            threads = m.threads;
            segments = m.segments;
            segmentSeconds = m.segmentSeconds;
            a.firstSegment = m.first;
            backend = a.backend;
            step = 'separate';
            lastSegmentAt = now();
            report();
            break;
          case 'block': {
            const parts = m.parts;
            if (parts.length !== S) {
              finish(false, new SeparationError('failed', `the worker gave ${parts.length} parts`));
              return;
            }
            parts.forEach((p, s) => {
              if (monoOut) writers[s]!.write(m.offset, p[0]!);
              else writers[s]!.write(m.offset, p[0]!, p[1]);
            });
            written = Math.max(written, m.offset + (parts[0]?.[0]?.length ?? 0));
            break;
          }
          case 'segment':
            a.times.push(m.seconds);
            perPath[a.backend].push(m.seconds);
            pace.add(m.seconds);
            lastIndex = m.index;
            lastSegmentAt = now();
            written = Math.max(written, m.written);
            report();
            break;
          case 'gpu-failed':
            fallBack(m.stage, m.segment, m.message);
            break;
          case 'done':
            succeed();
            break;
          case 'error':
            finish(false, new SeparationError(m.code, m.message));
            break;
        }
      };

      const launch = (path: WorkerBackend) => {
        let worker: Worker;
        try {
          worker = this.createWorker();
        } catch (e) {
          finish(false, new SeparationError('unsupported', e instanceof Error ? e.message : String(e)));
          return;
        }
        const a: Attempt = { backend: path, worker, times: [], sessionSeconds: null, firstSegment: null };
        attempt = a;
        worker.onmessage = (ev: MessageEvent<FromWorker>) => onMessage(a, ev.data);
        worker.onerror = (ev) => {
          ev.preventDefault?.();
          if (attempt !== a) return;
          const message = ev.message || 'the separation worker stopped';
          if (a.backend === 'gpu') fallBack('crash', lastIndex + 1, message);
          else finish(false, new SeparationError(/memory|allocation/i.test(message) ? 'memory' : 'failed', message));
        };
        worker.onmessageerror = () => finish(false, new SeparationError('failed', 'the separation worker sent something unreadable'));
        const message: SeparateMessage = {
          type: 'separate',
          audio: { sampleRate: audio.sampleRate, frames: audio.frames, channelCount: audio.channelCount, mono: audio.mono, chunks: audio.chunks, bytes: audio.bytes },
          tool: { id: model.id, name: model.name, url: model.file.url, host: model.file.host, licence: model.licence, bytes: model.file.bytes, sha256: model.file.sha256 },
          stems: S,
          config: model.config,
          backend: path,
          fromFrame: written,
          monoOut,
          ...(path === 'gpu' && this.simulateGpuFailureAt !== undefined ? { simulateGpuFailureAt: this.simulateGpuFailureAt } : {}),
        };
        try {
          // Shared chunks are shared with the worker, not copied (the page is cross-origin isolated).
          worker.postMessage(message);
        } catch (e) {
          finish(false, new SeparationError('failed', e instanceof Error ? e.message : String(e)));
        }
      };

      report();
      launch(request.backend === 'cpu' ? 'cpu' : 'gpu');
    });
  }
}
