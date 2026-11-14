// Messages between the separator (main thread, `separation/onnx.ts`) and its
// worker (`separation.worker.ts`).
//
// One worker per run on one path: created when a separation starts (or when
// the processor takes over from the graphics chip), terminated when it ends,
// fails or is cancelled. ONNX Runtime's WebAssembly memory never shrinks and a
// lost graphics device cannot be trusted again: ending the worker is the only
// way to give everything back.
//
// The piece goes to the worker as it is in memory (16-bit chunks): in shared
// memory when the page is cross-origin isolated (always the case in the app),
// so nothing is copied. The parts come back stretch by stretch at 48 kHz
// (`block`, transferred), and the main thread writes them into the tracks.

import type { SeparationErrorCode } from '../types';

/** The piece, as `audio/pcm.ts#PcmAudio` holds it (read with `readPcm`). */
export interface WorkerAudio {
  sampleRate: number;
  frames: number;
  channelCount: 1 | 2;
  mono: boolean;
  chunks: readonly { l: Int16Array; r: Int16Array | null }[];
  bytes: number;
}

/** The weights to fetch (pinned address, size, digest) and how to describe them. */
export interface WorkerTool {
  id: string;
  name: string;
  url: string;
  host: string;
  licence: string;
  bytes: number;
  sha256: string;
}

export type WorkerBackend = 'gpu' | 'cpu';

export interface SeparateMessage {
  type: 'separate';
  audio: WorkerAudio;
  tool: WorkerTool;
  /** Parts the tool gives. */
  stems: number;
  /** The tool's settings (`models.json` `config`), checked by the worker. */
  config: Record<string, unknown>;
  backend: WorkerBackend;
  /** First output frame to write (> 0 when the processor takes over). */
  fromFrame: number;
  /** One channel per part (a piece in one channel). */
  monoOut: boolean;
  /**
   * Browser checks only (`?separation=reel&repli-essai=N`, on a machine without a graphics chip): the
   * « graphics » path runs on the processor and fails at segment N, so that the processor taking over
   * mid-run is checked for real. Never set for a user.
   */
  simulateGpuFailureAt?: number;
}

export type ToWorker = SeparateMessage | { type: 'cancel' };

/** Where the graphics path failed. */
export type GpuFailure = 'unavailable' | 'session' | 'segment' | 'lost' | 'output';

export type FromWorker =
  /** Bytes to download (0: the tool is on the device). */
  | { type: 'plan'; downloadBytes: number }
  | { type: 'download'; loaded: number; total: number }
  /** The tool is ready to load: how long getting it took, and whether it was downloaded. */
  | { type: 'tool'; seconds: number; downloaded: boolean }
  /** The network is loaded on `backend`; the piece takes `segments` segments, this run starts at `first`. */
  | { type: 'ready'; backend: WorkerBackend; sessionSeconds: number; adapter: string | null; threads: number; segments: number; first: number; segmentSeconds: number }
  /** A finished stretch of every part, from frame `offset` (arrays transferred). */
  | { type: 'block'; offset: number; parts: Float32Array[][] }
  /** Segment `index` of `count` is done, in `seconds`; `written` frames handed out so far. */
  | { type: 'segment'; index: number; count: number; seconds: number; written: number }
  /** The graphics path failed; the main thread goes on on the processor from what was written. */
  | { type: 'gpu-failed'; stage: GpuFailure; segment: number | null; message: string }
  | { type: 'done'; segments: number; computed: number }
  | { type: 'error'; code: SeparationErrorCode; message: string };
