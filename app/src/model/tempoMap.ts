// Tempo map: how source time maps to bars and beats.
//
// It is built for a variable tempo: the analysis (lot 2) fills it with one
// segment per analysed beat (`grid/beats.ts#tempoMapFromBeats`), so bar lines
// fall exactly on the analysed beats; the manual entry of lot 1 makes one
// constant segment from a tempo and a first downbeat. All the arithmetic lives
// in `grid/`.
//
// Units
//   - Time is source time in seconds (position in the original recording).
//   - A "beat" of the map (`TempoSegment.beat`, `TempoSegment.bpm`,
//     `MeterChange.beat`) is one unit of the denominator of the FIRST meter
//     (`meters[0]`): a quarter note in a piece that starts in 4/4, an eighth
//     in one that starts in 6/8. Beats are counted from the first downbeat:
//     beat 0 is the first downbeat, negative beats are before it (pick-up).
//   - Bars are counted from 0 internally: bar 0 starts at beat 0 and is shown
//     as « mesure 1 ». Bars before the first downbeat have negative indices.
//
// Mixed denominators: « la noire reste la noire » (C13)
//   An eighth lasts half a quarter, whatever the signatures. A bar of n/d
//   lasts n × d0 / d beats of the map, d0 being the first meter's
//   denominator: in a piece that starts in 4/4, a 6/8 bar lasts three
//   quarters (its six eighths divide the analysed quarter beats in two, and
//   its bar lines fall on analysed beats), a 7/16 bar 1.75 quarters, a 64/32
//   bar eight. Inside a bar, beats are counted in the bar's own denominator
//   (`grid/tempoMap.ts#BarPosition`): the metronome clicks the six eighths of
//   a 6/8 bar, its chords sit on those eighths, « 3.4 » is its fourth eighth.
//   Changing the denominator of the first meter with « Changer la signature
//   rythmique » renumbers the whole map so that the quarter stays the quarter
//   (twice as many beats for x/8, same times: `grid/meters.ts`). The metronome
//   panel's choice of a meter for the whole piece keeps its rule of lot 4:
//   the beat the analysis found is the beat a musician counts (the dotted
//   quarter in 6/8), see `grid/corrections.ts#withMeter`. A single-meter
//   piece reads exactly as before.
//
// Before the first downbeat (pick-up)
//   The first tempo segment and the first meter extend backwards: bar −1 is
//   the bar that ends on the first downbeat (shown as « 0 », the pick-up bar),
//   bar −2 is shown as « −1 », and so on. Display number = index + 1. Pick-up
//   bars always have the first meter.

import type { Seconds } from './project';

/**
 * A time signature. Stored meters (document version 6) are legal when
 * `isValidMeter` says so: an integer numerator 1…64 over 4, 8, 16 or 32, and
 * every consumer follows them, bar by bar (`grid/meters.ts`). The metronome
 * panel's list for the whole piece stays narrower (2 to 12 over 4 or 8:
 * `grid/metronome.ts#isAllowedMeter`).
 */
export interface Meter {
  /** Beats per bar: an integer in `METER_NUMERATOR` (1…64). */
  numerator: number;
  /** Beat unit (4 = quarter note, 8 = eighth…): one of `METER_DENOMINATORS`. */
  denominator: number;
}

/** Numerators a stored meter may have (« 1 à 64 »). */
export const METER_NUMERATOR = { min: 1, max: 64 } as const;
/** Denominators a stored meter may have. */
export const METER_DENOMINATORS: readonly number[] = [4, 8, 16, 32];

/** True for a meter the document may hold: integer numerator 1…64 over 4, 8, 16 or 32. */
export function isValidMeter(m: unknown): m is Meter {
  if (typeof m !== 'object' || m === null) return false;
  const { numerator, denominator } = m as Record<string, unknown>;
  return (
    typeof numerator === 'number' && Number.isInteger(numerator) && numerator >= METER_NUMERATOR.min && numerator <= METER_NUMERATOR.max &&
    typeof denominator === 'number' && METER_DENOMINATORS.includes(denominator)
  );
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
  /** Beat position of that bar line, in beats of the map (redundant, for lookups; may be fractional after a 7/8 bar). */
  beat: number;
  meter: Meter;
}

/**
 * Who set the grid in force:
 *   - `default`: nobody yet (120 BPM, 4/4, downbeat at 0; the transport speaks in %);
 *   - `manual`: the user, with the lot 1 panel (constant tempo, a downbeat time);
 *   - `analysis`: the analysed beats, untouched;
 *   - `corrected`: the analysed beats, corrected by hand (first beat moved,
 *     tempo doubled or halved, meter changed). A new analysis keeps it.
 */
export type TempoOrigin = 'default' | 'manual' | 'analysis' | 'corrected';
export const TEMPO_ORIGINS: readonly TempoOrigin[] = ['default', 'manual', 'analysis', 'corrected'];

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
