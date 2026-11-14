// Contract of the offline renderer: the best-quality change of key and tempo,
// computed ahead of time (not live). Used by « Appliquer » (`./controller.ts`)
// and by the audio export (`export/audio/`). The real one is Rubber Band R3
// « finer » (GPL, the prototype's binary) in a Web Worker (`./rubberband.ts`);
// `MockRenderer` (./mock.ts) stands in for the tests, the demo and Node.
//
// Units: audio in and out is the app's in-memory form (`audio/pcm.ts`,
// 16-bit, 48 kHz). Read the input with `readPcm` (a range at a time); build the
// output with `PcmWriter`. Never keep the input.

import type { PcmAudio } from '../audio/pcm';
import type { TimeRange } from '../model/project';

export interface RenderRequest {
  /** The track's audio (from the registry; do not modify, do not keep). */
  audio: PcmAudio;
  /** Transposition, semitones (−12…+12) plus cents (−50…+50). */
  semitones: number;
  cents: number;
  /** Tempo as a ratio of the original (0.25…2): the output lasts `duration / tempoRatio`. */
  tempoRatio: number;
  /** Keep the timbre (formants) while transposing. Ignored when `supportsFormants` is false. */
  formants: boolean;
  /** Source range to render, seconds; the whole audio when absent (the loop, for an export). */
  range?: TimeRange;
  /** 0…1, never going back; called at least every second while working. */
  onProgress?: (fraction: number) => void;
  /** Cancels: `render()` rejects quickly with `RenderError('cancelled')`. */
  signal?: AbortSignal;
}

export type RenderErrorCode = 'cancelled' | 'memory' | 'unsupported' | 'failed';

export class RenderError extends Error {
  constructor(
    readonly code: RenderErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RenderError';
  }
}

export interface OfflineRenderer {
  /** `mock` or `rubberband`, for diagnostics. */
  readonly kind: string;
  /** True when « Conserver le timbre » is honoured (the advanced setting is offered only then). */
  readonly supportsFormants: boolean;
  /**
   * How many `render()` calls may usefully run at the same time (one worker
   * each, bounded by the cores and by memory). Absent or 1: one at a time.
   * « Appliquer » renders its tracks that many at once.
   */
  readonly parallel?: number;
  /**
   * Renders one track. The output, at the input's rate and with its channel
   * layout:
   *   - lasts exactly `round(rangeFrames / tempoRatio)` frames;
   *   - is ALIGNED: output frame `k` is source time `range.start + k *
   *     tempoRatio / sampleRate` (the renderer compensates its own delay, no
   *     pre-roll, no silence added), so tracks rendered separately stay
   *     together and the player can map positions linearly;
   *   - starts and ends without a click.
   * Rejects with a `RenderError`.
   */
  render(request: RenderRequest): Promise<PcmAudio>;
}
