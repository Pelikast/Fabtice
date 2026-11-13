// Tempo map: how source time maps to bars and beats.
//
// It is built for a variable tempo (lot 2 fills it from the beat analysis), but
// lot 1 only ever creates one constant segment from a tempo and a first
// downbeat entered by hand. All the arithmetic lives in `grid/`.
//
// Units
//   - Time is source time in seconds (position in the original recording).
//   - A "beat" is one unit of the meter denominator (a quarter note in 4/4);
//     beats are counted from the first downbeat: beat 0 is the first downbeat,
//     negative beats are before it (pick-up).
//   - Bars are counted from 0 internally: bar 0 starts at beat 0 and is shown
//     as « mesure 1 ». Bars before the first downbeat have negative indices.
//
// Before the first downbeat (pick-up)
//   The first tempo segment and the first meter extend backwards: bar −1 is
//   the bar that ends on the first downbeat (shown as « 0 », the pick-up bar),
//   bar −2 is shown as « −1 », and so on. Display number = index + 1.

import type { Seconds } from './project';

export interface Meter {
  /** Beats per bar, 2…7 in lot 1. */
  numerator: number;
  /** Beat unit; only 4 in lot 1, kept for 6/8, 12/8… later. */
  denominator: number;
}

/**
 * A stretch of constant tempo, valid from `time` until the next segment.
 * The first segment also extends backwards before its start.
 */
export interface TempoSegment {
  /** Source time where the segment starts. */
  time: Seconds;
  /** Beat position at `time` (fractional allowed); redundant with the times
   *  and tempos of the earlier segments, kept for O(log n) lookups both ways. */
  beat: number;
  /** Tempo in beats per minute. */
  bpm: number;
}

/** A meter in force from a bar line on. */
export interface MeterChange {
  /** Bar index where the meter starts (0 for the first one). */
  bar: number;
  /** Beat position of that bar line (redundant, for lookups). */
  beat: number;
  meter: Meter;
}

/** Who set the grid: nobody yet, the user, or the analysis (lot 2). */
export type TempoOrigin = 'default' | 'manual' | 'analysis';

/**
 * Invariants (enforced by the builders in `grid/tempoMap.ts`):
 *   - `segments` is non-empty and sorted by time; segment i's `beat` equals the
 *     beat reached by segment i−1 at segment i's time;
 *   - `meters` is non-empty, sorted, `meters[0]` is `{ bar: 0, beat: 0 }`;
 *     meter changes fall on bar lines.
 */
export interface TempoMap {
  origin: TempoOrigin;
  segments: TempoSegment[];
  meters: MeterChange[];
}
