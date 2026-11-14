// What the page and a render worker say to each other. One worker renders one
// track (or one range of it): the page streams the input in blocks and the
// worker streams the output back, so neither side ever holds a whole track as
// Float32. Imported by both sides: no DOM and no worker globals in here.

/** Input frames per block the page sends. */
export const BLOCK_FRAMES = 16384;
/** Blocks the page lets get ahead of what the worker has acknowledged. */
export const BLOCKS_IN_FLIGHT = 3;

export interface StartMessage {
  type: 'start';
  sampleRate: number;
  channels: 1 | 2;
  /** Transposition in semitones, cents included. */
  semitones: number;
  tempoRatio: number;
  formants: boolean;
  /** Exactly this many output frames. */
  outFrames: number;
  fadeIn: number;
  fadeOut: number;
  /** The measured lateness of the engine for these settings (frames), or null to measure it first. */
  delay: number | null;
  /**
   * Input frames sent BEFORE the range (the audio just before it, so the engine starts warm instead of from a
   * hard cut): the output they make is dropped, `preRoll / tempoRatio` frames of it.
   */
  preRoll: number;
}

export type ToRenderWorker =
  | StartMessage
  /** `r` is absent for one channel. The buffers are transferred. */
  | { type: 'block'; l: Float32Array; r?: Float32Array }
  | { type: 'end' };

export type FromRenderWorker =
  /** The engine is loaded and aligned: the page may send blocks. */
  | { type: 'ready'; delay: number; ms: number }
  /** One input block has been consumed. */
  | { type: 'ack' }
  /** `n` output frames, in order. The buffers are transferred. */
  | { type: 'out'; l: Float32Array; r?: Float32Array; n: number }
  | { type: 'done'; computeMs: number }
  | { type: 'error'; message: string; memory: boolean };
