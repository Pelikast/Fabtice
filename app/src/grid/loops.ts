// Loops that are not made of whole bars: selecting and dragging them with the
// magnet (the active sub-grid) or freely, what a loop covers, and the shortest
// loop allowed. Pure functions over a tempo map; all times are source seconds.
//
// A loop is stored as a plain time range in source seconds (`LoopState`), so
// it stays on the music whatever happens to the grid afterwards; only its
// reading in bars and beats changes when the grid is corrected.

import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { subGridStep, snapTime, type SubGridOptions } from './lines';
import { BEAT_EPSILON, barToBeat, beatScale, beatToTime, clamp, meterAtBar, timeToBar, timeToBeat } from './tempoMap';

/**
 * The shortest loop the timeline will make. The engine ignores anything under
 * 2048 frames (43 ms) and a loop that short is not one a musician can use; a
 * click without a drag never gets here (it moves the playhead).
 */
export const MIN_LOOP_SECONDS = 0.1;

/** A loop edge or end is « on » a bar line, a beat or a sub-grid line within this many beats. */
export const LINE_TOLERANCE_BEATS = 0.005;

/** The edge of a loop that is being dragged. */
export type LoopEdge = 'start' | 'end';

/** Sub-grid options when the magnet is on, null when selection is free. */
export type LoopSnap = SubGridOptions | null;

/**
 * The line of the active sub-grid next to `t`, strictly after it (`dir` 1) or
 * strictly before it (`dir` −1). Bar lines are lines. The pattern restarts at
 * each bar, as `subGridLines` and `snapTime` have it.
 */
export function adjacentLine(map: TempoMap, t: Seconds, dir: 1 | -1, opts: SubGridOptions): Seconds {
  const pos = timeToBar(map, t);
  const step = subGridStep(opts);
  const n = pos.meter.numerator;
  const sc = beatScale(map, pos.meter);
  const startBeat = barToBeat(map, pos.bar);
  if (dir === 1) {
    const k = Math.floor(pos.beatInBar / step + BEAT_EPSILON) + 1;
    return beatToTime(map, startBeat + Math.min(n, k * step) * sc);
  }
  const k = Math.ceil(pos.beatInBar / step - BEAT_EPSILON) - 1;
  if (k >= 0) return beatToTime(map, startBeat + k * step * sc);
  // Before the first line of the bar: the last line of the bar before (in its own beats).
  const before = timeToBar(map, beatToTime(map, startBeat - BEAT_EPSILON * 4));
  const m = before.meter.numerator;
  const last = Math.ceil(m / step - BEAT_EPSILON) - 1;
  return beatToTime(map, barToBeat(map, before.bar) + last * step * beatScale(map, before.meter));
}

/** Moves along the lines until the span is at least `MIN_LOOP_SECONDS` (the walk is bounded). */
function walk(map: TempoMap, from: Seconds, dir: 1 | -1, enough: (t: Seconds) => boolean, opts: SubGridOptions): Seconds {
  let t = from;
  for (let i = 0; i < 256 && !enough(t); i++) {
    const next = adjacentLine(map, t, dir, opts);
    if (!(dir === 1 ? next > t : next < t)) break;
    t = next;
  }
  return t;
}

/** The point a drag is at: snapped to the sub-grid when the magnet is on, else the free time; always inside the piece. */
export function dragPoint(map: TempoMap, t: Seconds, duration: Seconds, snap: LoopSnap): Seconds {
  const free = clamp(t, 0, duration);
  return snap ? clamp(snapTime(map, free, snap), 0, duration) : free;
}

/**
 * Brings a range to at least `MIN_LOOP_SECONDS`, growing it on the side the
 * drag is moving to (`dir`), or the other side when the piece ends there.
 * With the magnet on, the new bound is the next line of the sub-grid.
 */
function atLeastMinimum(map: TempoMap, range: TimeRange, dir: 1 | -1, duration: Seconds, snap: LoopSnap): TimeRange {
  let { start, end } = range;
  if (end - start >= MIN_LOOP_SECONDS) return range;
  const grow = (d: 1 | -1) => {
    if (d === 1) {
      end = snap ? walk(map, end, 1, (t) => t - start >= MIN_LOOP_SECONDS, snap) : start + MIN_LOOP_SECONDS;
      end = Math.min(end, duration);
    } else {
      start = snap ? walk(map, start, -1, (t) => end - t >= MIN_LOOP_SECONDS, snap) : end - MIN_LOOP_SECONDS;
      start = Math.max(start, 0);
    }
  };
  grow(dir);
  if (end - start < MIN_LOOP_SECONDS) grow(dir === 1 ? -1 : 1);
  return { start, end };
}

/**
 * The loop while a selection is dragged: from the point where the press was to
 * the point where the pointer is now, either order. With the magnet on both
 * are snapped to the active sub-grid; off, they are free. Never shorter than
 * `MIN_LOOP_SECONDS` (with the magnet on: the next line of the sub-grid that
 * gets there), growing towards where the pointer is.
 */
export function loopFromDrag(map: TempoMap, pressTime: Seconds, nowTime: Seconds, duration: Seconds, snap: LoopSnap): TimeRange {
  const a = dragPoint(map, pressTime, duration, snap);
  const b = dragPoint(map, nowTime, duration, snap);
  const forward = nowTime >= pressTime;
  return atLeastMinimum(map, { start: Math.min(a, b), end: Math.max(a, b) }, forward ? 1 : -1, duration, snap);
}

/**
 * The loop after one of its edges is dragged to time `t`: the edge goes to the
 * nearest line of the sub-grid (magnet on) or to `t` (off), and the loop keeps
 * at least `MIN_LOOP_SECONDS`; the other edge does not move.
 */
export function loopWithEdgeAt(map: TempoMap, region: TimeRange, edge: LoopEdge, t: Seconds, duration: Seconds, snap: LoopSnap): TimeRange {
  const p = dragPoint(map, t, duration, snap);
  if (edge === 'start') {
    if (region.end - p >= MIN_LOOP_SECONDS) return { start: p, end: region.end };
    return { start: snap ? walk(map, p, -1, (x) => region.end - x >= MIN_LOOP_SECONDS, snap) : region.end - MIN_LOOP_SECONDS, end: region.end };
  }
  if (p - region.start >= MIN_LOOP_SECONDS) return { start: region.start, end: p };
  return { start: region.start, end: snap ? walk(map, p, 1, (x) => x - region.start >= MIN_LOOP_SECONDS, snap) : region.start + MIN_LOOP_SECONDS };
}

/**
 * What a loop covers of the bars it touches: the first and last bar, and the
 * part of each that is inside, as fractions of the bar (in beats, so a bar
 * keeps its proportions whatever the tempo does inside it): `from` is where the
 * loop starts in the first bar (0 = at its line), `to` where it ends in the
 * last bar (1 = at its end). Every bar in between is covered whole.
 */
export interface LoopCoverage {
  first: number;
  last: number;
  from: number;
  to: number;
}

export function loopCoverage(map: TempoMap, range: TimeRange): LoopCoverage {
  let a = timeToBar(map, range.start);
  // A start a hair before a bar line is on that line.
  if (a.meter.numerator - a.beatInBar < LINE_TOLERANCE_BEATS) a = timeToBar(map, beatToTime(map, barToBeat(map, a.bar + 1)));
  const first = a.bar;
  let from = a.beatInBar / a.meter.numerator;
  if (from < LINE_TOLERANCE_BEATS / a.meter.numerator) from = 0;
  // The end is exclusive: an end on a bar line belongs to the bar before.
  const endBeat = timeToBeat(map, range.end);
  const e = timeToBar(map, beatToTime(map, endBeat - LINE_TOLERANCE_BEATS));
  const last = Math.max(first, e.bar);
  // In the last bar's own beats, as `from` is in the first bar's.
  const lastMeter = meterAtBar(map, last);
  const endInBar = (endBeat - barToBeat(map, last)) / beatScale(map, lastMeter);
  let to = clamp(endInBar / lastMeter.numerator, 0, 1);
  if (1 - to < LINE_TOLERANCE_BEATS / lastMeter.numerator) to = 1;
  return { first, last, from: Math.round(from * 10000) / 10000, to: Math.round(to * 10000) / 10000 };
}

/** The whole bars a range is exactly made of (both ends on bar lines), or null when it starts or ends inside a bar. */
export function wholeBarsOf(map: TempoMap, range: TimeRange): { first: number; last: number } | null {
  const c = loopCoverage(map, range);
  return c.from === 0 && c.to === 1 ? { first: c.first, last: c.last } : null;
}
