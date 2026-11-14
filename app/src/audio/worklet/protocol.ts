// What the main thread and the AudioWorklet say to each other, and the layout
// of the small shared block the worklet writes its playhead into.
// Imported by both sides: no DOM and no worklet globals in here.

/** Frames per storage chunk (32 768 = 64 KiB per 16-bit channel). */
export const CHUNK_BITS = 15;
export const CHUNK = 1 << CHUNK_BITS;

/** Audio stored as 16-bit blocks; a mono track keeps `r === null` (stored once). */
export interface Chunk {
  l: Int16Array;
  r: Int16Array | null;
}

export interface TrackMessage {
  type: 'track';
  id: string;
  frames: number;
  mono: boolean;
  chunks: readonly Chunk[];
  volume: number;
  mute: boolean;
  solo: boolean;
}

export type ToWorklet =
  | { type: 'init'; wasm: ArrayBuffer }
  | TrackMessage
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'mix'; id: string; volume: number; mute: boolean; solo: boolean }
  /** `semitones` already includes the cents. */
  | { type: 'params'; rate?: number; semitones?: number }
  | { type: 'loop'; enabled: boolean; start: number; end: number }
  | { type: 'clicks'; frames: Float64Array; accents: Uint8Array }
  | { type: 'metronome'; enabled: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; frame: number }
  | { type: 'ping'; id: number };

export interface Diagnostics {
  /** Mean processing time of a busy quantum, as a fraction of the quantum duration. */
  loadAvg: number;
  loadMax: number;
  /** Quanta that took longer than the quantum itself (audio thread overrun). */
  overBudget: number;
  /** Tracks currently computed (muted ones are skipped). */
  activeTracks: number;
  /** Chunks that were missing from a track while reading (should stay 0). */
  missingChunks: number;
  wasmBytes: number;
  /** Stretcher delay model: output latency = a + b / rate, in frames. */
  latencyA: number;
  latencyB: number;
}

export type FromWorklet =
  | { type: 'ready'; latencyA: number; latencyB: number; wasmBytes: number; ms: number }
  | { type: 'pong'; id: number }
  | { type: 'ended' }
  | { type: 'status'; diagnostics: Diagnostics }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------- shared playhead
// A SharedArrayBuffer written by the audio thread every quantum and read by
// the main thread every animation frame, without allocation or message.
// Layout (bytes): [0] i32 sequence (odd while writing), [4] i32 flags,
// [8] f64 heard position (source frames), [16] f64 frame stamp (currentFrame),
// [24] f64 tempo ratio.

export const SHARED_BYTES = 32;
export const FLAG_PLAYING = 1;

export interface SharedViews {
  i32: Int32Array;
  f64: Float64Array;
}

export function sharedViews(buffer: SharedArrayBuffer): SharedViews {
  return { i32: new Int32Array(buffer, 0, 2), f64: new Float64Array(buffer, 8, 3) };
}
