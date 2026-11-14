// The separation worker: gets the tool (from the device, or downloaded from
// its public location and checked), loads it with ONNX Runtime Web on the
// graphics chip (WebGPU) or on the processor (WebAssembly), and runs the
// pipeline (`engine/pipeline.ts`) on the piece, handing the parts back
// stretch by stretch.
//
// Graphics path: any failure (no adapter, the network does not load, a
// segment fails or gives garbage, the device is lost) is reported as
// `gpu-failed` with the segment it happened at, and this worker stops; the
// main thread ends it and starts a processor worker that goes on, with the
// same tool, from the frames already written. The two builds of ONNX Runtime
// are loaded only by the path that needs them: WebGPU (with its own
// WebAssembly binary) for the graphics chip, the plain WebAssembly build (the
// one the analysis uses) for the processor.
//
// Cancellation: `cancel` is read between the steps of each segment; the main
// thread also terminates the worker if it does not stop at once.

import ortWasmModule from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmBinary from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortGpuModule from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortGpuBinary from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type * as Ort from 'onnxruntime-web/wasm';
import { readPcm, type PcmAudio } from '../../audio/pcm';
import { AnalysisError } from '../../analysis/types';
import { ensureModels, missingModels } from '../../analysis/models/download';
import { openModelStore } from '../../analysis/models/store';
import type { ModelSpec } from '../../analysis/models';
import { BadOutputError, planOf, separatePiece, type SegmentModel } from '../engine/pipeline';
import { ConfigError, parseConfig } from '../engine/plan';
import { makeRunner, type NetworkOutputs, type Prepared } from '../engine/runners';
import { SeparationError, type SeparationErrorCode } from '../types';
import { SEPARATION_STORE_OPTIONS, SEPARATION_TOOLS_DB } from '../toolsDb';
import type { FromWorker, GpuFailure, SeparateMessage, ToWorker } from './protocol';

// The DOM typings of the app do not describe a worker's global scope: only what is used here.
const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
  crossOriginIsolated: boolean;
  navigator?: { hardwareConcurrency?: number; gpu?: unknown };
};
const post = (message: FromWorker, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

let cancelRequested = false;
let busy = false;

const yieldNow = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const check = () => {
  if (cancelRequested) throw new SeparationError('cancelled');
};

/** A failure of the graphics path: the processor takes over. */
class GpuError extends Error {
  constructor(
    readonly stage: GpuFailure,
    message: string,
    readonly segment: number | null = null,
  ) {
    super(message);
    this.name = 'GpuError';
  }
}

/** Errors as codes the interface understands. */
function describe(e: unknown): { code: SeparationErrorCode; message: string } {
  if (e instanceof SeparationError) return { code: e.code, message: e.message };
  if (e instanceof AnalysisError) return { code: e.code === 'cancelled' || e.code === 'download-failed' ? e.code : 'failed', message: e.message };
  if (e instanceof ConfigError) return { code: 'unknown-model', message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  if (/out of memory|memory access out of bounds|Array buffer allocation failed|Invalid array length|allocation failed|bad_alloc|OOM/i.test(message) || e instanceof RangeError) {
    return { code: 'memory', message };
  }
  if (/WebAssembly|SharedArrayBuffer/i.test(message) && /not defined|not supported|unavailable/i.test(message)) return { code: 'unsupported', message };
  return { code: 'failed', message };
}

/** Processor threads: all cores but one (the page, the audio), at most eight; one when the page is not isolated. */
function threadCount(): number {
  if (scope.crossOriginIsolated !== true) return 1;
  const cores = scope.navigator?.hardwareConcurrency || 1;
  return Math.max(1, Math.min(8, cores - 1));
}

type OrtModule = typeof Ort;

async function loadOrt(backend: 'gpu' | 'cpu', threads: number): Promise<OrtModule> {
  const ort = (backend === 'gpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm')) as unknown as OrtModule;
  ort.env.wasm.numThreads = threads;
  ort.env.wasm.wasmPaths = backend === 'gpu' ? { mjs: ortGpuModule, wasm: ortGpuBinary } : { mjs: ortWasmModule, wasm: ortWasmBinary };
  ort.env.logLevel = 'error';
  return ort;
}

interface GpuDeviceLike {
  lost?: Promise<{ reason?: string; message?: string }>;
  adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string };
}

/** What the browser says of the graphics adapter in use (no personal data: maker, family, model). */
function adapterText(info: GpuDeviceLike['adapterInfo'] | undefined): string | null {
  if (!info) return null;
  const parts = [info.vendor, info.architecture, info.device, info.description].filter((p): p is string => !!p && p.length > 0);
  return parts.length ? [...new Set(parts)].join(' · ').slice(0, 160) : null;
}

async function separate(msg: SeparateMessage): Promise<void> {
  const cfg = parseConfig(msg.config);
  const tool: ModelSpec = { id: msg.tool.id, name: msg.tool.name, role: 'séparation', url: msg.tool.url, host: msg.tool.host, licence: msg.tool.licence, bytes: msg.tool.bytes, sha256: msg.tool.sha256 };
  const gpu = msg.backend === 'gpu';
  // Browser checks only: a « graphics » path that runs on the processor and fails at a given segment.
  const simulated = gpu && typeof msg.simulateGpuFailureAt === 'number' ? msg.simulateGpuFailureAt : null;
  if (gpu && simulated === null && !scope.navigator?.gpu) throw new GpuError('unavailable', 'no WebGPU in this worker');

  // 1. The tool, from the device or from its public location.
  const store = await openModelStore(SEPARATION_TOOLS_DB, SEPARATION_STORE_OPTIONS);
  const missing = await missingModels([tool], store);
  post({ type: 'plan', downloadBytes: missing.reduce((n, s) => n + s.bytes, 0) });
  const controller = new AbortController();
  const watch = setInterval(() => {
    if (cancelRequested) controller.abort();
  }, 100);
  const t0 = performance.now();
  let bytes: ArrayBuffer | undefined;
  try {
    const files = await ensureModels([tool], {
      store,
      signal: controller.signal,
      onProgress: (p) => post({ type: 'download', loaded: p.loaded, total: p.total }),
    });
    bytes = files.get(tool.id);
    files.clear();
  } finally {
    clearInterval(watch);
  }
  if (!bytes) throw new SeparationError('download-failed', 'the tool is missing');
  post({ type: 'tool', seconds: (performance.now() - t0) / 1000, downloaded: missing.length > 0 });
  check();

  // 2. The network, on the graphics chip or the processor.
  const threads = threadCount();
  const ort = await loadOrt(msg.backend, threads);
  const t1 = performance.now();
  let session: Ort.InferenceSession;
  try {
    session = await ort.InferenceSession.create(new Uint8Array(bytes), {
      executionProviders: [gpu && simulated === null ? 'webgpu' : 'wasm'],
      graphOptimizationLevel: 'all',
      freeDimensionOverrides: { batch: 1 },
      logSeverityLevel: 3,
    });
  } catch (e) {
    if (gpu) throw new GpuError('session', e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    bytes = undefined; // the runtime holds its own copy now
  }
  const sessionSeconds = (performance.now() - t1) / 1000;
  let lost: string | null = null;
  let adapter: string | null = null;
  if (gpu && simulated === null) {
    try {
      const device = (await (ort.env.webgpu as unknown as { device: Promise<GpuDeviceLike> }).device) ?? null;
      void device?.lost?.then((info) => {
        // `destroyed` is the runtime releasing its device with the session, not a failure.
        if (info?.reason !== 'destroyed') lost = info?.message || info?.reason || 'device lost';
      });
      const fromAdapter = (ort.env.webgpu as unknown as { adapter?: { info?: GpuDeviceLike['adapterInfo'] } }).adapter?.info;
      adapter = adapterText(device?.adapterInfo ?? fromAdapter);
    } catch {
      adapter = null;
    }
  }

  try {
    const audio = msg.audio as unknown as PcmAudio;
    const plan = planOf(cfg, audio.frames, audio.sampleRate);
    const step = cfg.family === 'msst' ? Math.floor(cfg.segment / cfg.overlap) : Math.max(1, Math.floor((1 - cfg.overlap) * cfg.segment));
    // The segment being computed (the one a failure belongs to).
    let current: number | null = null;
    let first = 0;
    let runs = 0;
    const runner = makeRunner(cfg, msg.stems, (data, dims) => new ort.Tensor('float32', data, dims));
    const model: SegmentModel<Prepared, NetworkOutputs> = {
      prepare: (l, r) => runner.prepare(l, r),
      run: async (p) => {
        // Segments run in order: the n-th call of this run is segment first + n.
        const index = first + runs++;
        if (lost) throw new GpuError('lost', lost, index);
        if (simulated === index) throw new GpuError('lost', 'simulated failure (browser check)', index);
        try {
          return (await session.run(p.feeds as Record<string, Ort.Tensor>)) as unknown as NetworkOutputs;
        } catch (e) {
          if (gpu) throw new GpuError(lost ? 'lost' : 'segment', lost ?? (e instanceof Error ? e.message : String(e)), index);
          throw e;
        }
      },
      finish: (p, out) => runner.finish(p, out),
      release: (out) => {
        for (const k of Object.keys(out)) {
          try {
            out[k]!.dispose?.();
          } catch {
            // processor tensors
          }
        }
      },
    };
    try {
      await separatePiece({
        cfg,
        stems: msg.stems,
        model,
        input: {
          frames: audio.frames,
          sampleRate: audio.sampleRate,
          stereo: !audio.mono,
          read: (ch, start, out) => readPcm(audio, ch, start, out),
        },
        fromFrame: msg.fromFrame,
        monoOut: msg.monoOut,
        pipelined: gpu,
        check,
        yieldNow,
        onStart: (j, count) => {
          first = j;
          current = j;
          post({ type: 'ready', backend: msg.backend, sessionSeconds, adapter, threads, segments: count, first: j, segmentSeconds: step / cfg.sampleRate });
        },
        onSegment: (d) => {
          current = d.index + 1 < d.count ? d.index + 1 : null;
          post({ type: 'segment', index: d.index, count: d.count, seconds: d.seconds, written: d.written });
        },
        emit: (offset, parts) => {
          post({ type: 'block', offset, parts }, parts.flat().map((a) => a.buffer));
        },
      });
    } catch (e) {
      if (gpu && !(e instanceof SeparationError)) {
        const stage: GpuFailure = e instanceof GpuError ? e.stage : e instanceof BadOutputError ? 'output' : 'segment';
        const at = e instanceof GpuError && e.segment !== null ? e.segment : current;
        throw new GpuError(stage, (e instanceof Error ? e.message : String(e)).slice(0, 300), at);
      }
      throw e;
    }
    post({ type: 'done', segments: plan.segments.length, computed: plan.segments.length - first });
  } finally {
    await session.release().catch(() => {});
  }
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
  separate(msg)
    .catch((e) => {
      if (e instanceof GpuError) post({ type: 'gpu-failed', stage: e.stage, segment: e.segment, message: e.message });
      else post({ type: 'error', ...describe(e) });
    })
    .finally(() => {
      busy = false;
    });
};
