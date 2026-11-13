// Bar lines, sub-grid lines, snapping, loops from bars, metronome clicks.
// Pure functions over a tempo map; all times are source seconds.

import type { Seconds, Subdivision, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import {
  BEAT_EPSILON,
  barStartTime,
  barToBeat,
  beatToBar,
  beatToTime,
  maxBpm,
  meterAtBar,
  timeToBar,
  timeToBeat,
} from './tempoMap';

/** Below this spacing the sub-grid is not drawn (DESIGN.md). */
export const SUBGRID_MIN_SPACING_PX = 5;

/** Hard cap on the lines returned by one call, whatever the range asked. */
export const MAX_LINES = 20000;

export interface SubGridOptions {
  subdivision: Subdivision;
  triplets: boolean;
}

/**
 * Sub-grid lines per beat. Triplets multiply by 1.5, as in the mockup:
 * eighths + triplets = eighth-note triplets (3 per beat), sixteenths +
 * triplets = sextuplets (6), quarters + triplets = quarter-note triplets
 * (3 per 2 beats).
 */
export function linesPerBeat({ subdivision, triplets }: SubGridOptions): number {
  return subdivision * (triplets ? 1.5 : 1);
}

/** Distance between two sub-grid lines, in beats. */
export function subGridStep(opts: SubGridOptions): number {
  return 1 / linesPerBeat(opts);
}

/**
 * Smallest on-screen distance between two sub-grid lines at this zoom, using
 * the fastest tempo of the map. The timeline hides the sub-grid when this is
 * below `SUBGRID_MIN_SPACING_PX`.
 */
export function subGridSpacingPx(map: TempoMap, pxPerSecond: number, opts: SubGridOptions): number {
  const secondsPerBeat = 60 / maxBpm(map);
  return pxPerSecond * secondsPerBeat * subGridStep(opts);
}

export function isSubGridVisible(map: TempoMap, pxPerSecond: number, opts: SubGridOptions): boolean {
  return subGridSpacingPx(map, pxPerSecond, opts) >= SUBGRID_MIN_SPACING_PX;
}

export interface BarLine {
  time: Seconds;
  /** Index of the bar that starts here (0 = « mesure 1 »). */
  bar: number;
}

/** Bar lines whose time lies in [t0, t1]. */
export function barLines(map: TempoMap, t0: Seconds, t1: Seconds): BarLine[] {
  const out: BarLine[] = [];
  if (!(t1 >= t0)) return out;
  let bar = timeToBar(map, t0).bar;
  if (barStartTime(map, bar) < t0 - 1e-9) bar += 1;
  for (let t = barStartTime(map, bar); t <= t1 + 1e-9 && out.length < MAX_LINES; t = barStartTime(map, ++bar)) {
    out.push({ time: t, bar });
  }
  return out;
}

export interface SubLine {
  time: Seconds;
  /** Bar that contains the line. */
  bar: number;
  /** Position in the bar, in beats (never 0: bar lines are not repeated). */
  beatInBar: number;
  /** True when the line falls on a beat. */
  onBeat: boolean;
}

/**
 * Sub-grid lines in [t0, t1], bar lines excluded. The pattern restarts at each
 * bar line, so a step that does not divide the bar (quarter-note triplets in
 * 3/4) leaves a shorter last step instead of drifting across bars.
 */
export function subGridLines(map: TempoMap, t0: Seconds, t1: Seconds, opts: SubGridOptions): SubLine[] {
  const out: SubLine[] = [];
  if (!(t1 >= t0)) return out;
  const step = subGridStep(opts);
  const lastBar = timeToBar(map, t1).bar;
  for (let bar = timeToBar(map, t0).bar; bar <= lastBar && out.length < MAX_LINES; bar++) {
    const startBeat = barToBeat(map, bar);
    const n = meterAtBar(map, bar).numerator;
    for (let k = 1; k * step < n - BEAT_EPSILON && out.length < MAX_LINES; k++) {
      const beatInBar = k * step;
      const time = beatToTime(map, startBeat + beatInBar);
      if (time < t0 - 1e-9 || time > t1 + 1e-9) continue;
      out.push({ time, bar, beatInBar, onBeat: Math.abs(beatInBar - Math.round(beatInBar)) < 1e-6 });
    }
  }
  return out;
}

/**
 * Snaps a time to the nearest line of the active sub-grid (bar lines
 * included). Used by the magnet; when it is off, callers keep the free time.
 */
export function snapTime(map: TempoMap, t: Seconds, opts: SubGridOptions): Seconds {
  const pos = timeToBar(map, t);
  const step = subGridStep(opts);
  const n = pos.meter.numerator;
  const startBeat = barToBeat(map, pos.bar);
  const below = Math.floor(pos.beatInBar / step + BEAT_EPSILON) * step;
  const above = Math.min(n, below + step);
  const best = pos.beatInBar - below <= above - pos.beatInBar ? below : above;
  return beatToTime(map, startBeat + best);
}

/** Loop covering whole bars, `firstBar` to `lastBar` inclusive (either order). */
export function loopFromBars(map: TempoMap, firstBar: number, lastBar: number): TimeRange {
  const a = Math.min(firstBar, lastBar);
  const b = Math.max(firstBar, lastBar);
  return { start: barStartTime(map, a), end: barStartTime(map, b + 1) };
}

/** First and last bar touched by a range (the end is exclusive). */
export function barsOfRange(map: TempoMap, range: TimeRange): { first: number; last: number } {
  const first = timeToBar(map, range.start).bar;
  const endBeat = timeToBeat(map, range.end);
  const last = Math.max(first, beatToBar(map, endBeat - 1e-6).bar);
  return { first, last };
}

/** Clips a range to [0, duration]; null if nothing is left. */
export function clipRange(range: TimeRange, duration: Seconds): TimeRange | null {
  const start = Math.max(0, Math.min(range.start, range.end));
  const end = Math.min(duration, Math.max(range.start, range.end));
  return end > start ? { start, end } : null;
}

export interface MetronomeClicks {
  /** Source times of the beats, ascending. */
  times: Float64Array;
  /** 1 on the first beat of a bar (accented click), 0 elsewhere. */
  accents: Uint8Array;
}

/** One click per beat in [from, to), with the downbeats accented. */
export function metronomeClicks(map: TempoMap, from: Seconds, to: Seconds): MetronomeClicks {
  const times: number[] = [];
  const accents: number[] = [];
  let beat = Math.ceil(timeToBeat(map, from) - BEAT_EPSILON);
  for (let t = beatToTime(map, beat); t < to && times.length < 1_000_000; t = beatToTime(map, ++beat)) {
    if (t < from) continue;
    times.push(t);
    accents.push(beatToBar(map, beat).beatInBar < BEAT_EPSILON * 10 ? 1 : 0);
  }
  return { times: Float64Array.from(times), accents: Uint8Array.from(accents) };
}
