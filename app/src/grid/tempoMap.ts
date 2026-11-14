// Tempo map arithmetic: source time <-> beats <-> bars. Pure functions.
// See `model/tempoMap.ts` for units and the pick-up convention.

import type { Seconds } from '../model/project';
import type { Meter, MeterChange, TempoMap, TempoOrigin, TempoSegment } from '../model/tempoMap';

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const DEFAULT_BPM = 120;
export const NUMERATOR_MIN = 2;
export const NUMERATOR_MAX = 7;
export const DEFAULT_METER: Meter = { numerator: 4, denominator: 4 };

/** Tolerance in beats: positions this close to a line count as on it (float noise). */
export const BEAT_EPSILON = 1e-7;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface ConstantTempo {
  bpm: number;
  /** Source time of the first downbeat (start of « mesure 1 »). May be negative or after 0. */
  firstDownbeat: Seconds;
  meter: Meter;
  origin: TempoOrigin;
}

/** A map with one tempo and one meter: what lot 1 builds from the manual entry. */
export function constantTempoMap({ bpm, firstDownbeat, meter, origin }: ConstantTempo): TempoMap {
  if (!(bpm > 0)) throw new RangeError(`invalid tempo ${bpm}`);
  if (!(meter.numerator >= 1 && meter.denominator >= 1)) throw new RangeError('invalid meter');
  return {
    origin,
    segments: [{ time: firstDownbeat, beat: 0, bpm }],
    meters: [{ bar: 0, beat: 0, meter: { ...meter } }],
  };
}

/** The grid used until the user (or the analysis) sets one: 120 BPM, 4/4, downbeat at 0. */
export function defaultTempoMap(): TempoMap {
  return constantTempoMap({ bpm: DEFAULT_BPM, firstDownbeat: 0, meter: DEFAULT_METER, origin: 'default' });
}

/**
 * Builds a variable map from tempo changes given by time (lot 2 and later).
 * `changes[0].time` is where beat `firstBeat` falls; each later change starts
 * a new constant segment. Meters are given by bar.
 */
export function variableTempoMap(
  changes: { time: Seconds; bpm: number }[],
  meters: { bar: number; meter: Meter }[],
  origin: TempoOrigin,
  firstBeat = 0,
): TempoMap {
  if (changes.length === 0) throw new RangeError('a tempo map needs at least one segment');
  const sorted = [...changes].sort((a, b) => a.time - b.time);
  const segments: TempoSegment[] = [];
  let beat = firstBeat;
  sorted.forEach((c, i) => {
    if (!(c.bpm > 0)) throw new RangeError(`invalid tempo ${c.bpm}`);
    if (i > 0) {
      const prev = sorted[i - 1]!;
      beat += ((c.time - prev.time) * prev.bpm) / 60;
    }
    segments.push({ time: c.time, beat, bpm: c.bpm });
  });
  const ms = [...meters].sort((a, b) => a.bar - b.bar);
  if (ms.length === 0 || ms[0]!.bar !== 0) ms.unshift({ bar: 0, meter: DEFAULT_METER });
  const out: MeterChange[] = [];
  ms.forEach((m, i) => {
    const prev = out[i - 1];
    const b = prev ? prev.beat + (m.bar - prev.bar) * prev.meter.numerator : 0;
    out.push({ bar: m.bar, beat: b, meter: { ...m.meter } });
  });
  return { origin, segments, meters: out };
}

// ---------------------------------------------------------------- lookups

/** Index of the last element whose key is <= value (0 if none). */
function lastAtOrBefore<T>(items: readonly T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  if (hi <= 0 || key(items[0]!) > value) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (key(items[mid]!) <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function segmentAtTime(map: TempoMap, t: Seconds): TempoSegment {
  return map.segments[lastAtOrBefore(map.segments, t, (s) => s.time)]!;
}

function segmentAtBeat(map: TempoMap, beat: number): TempoSegment {
  return map.segments[lastAtOrBefore(map.segments, beat, (s) => s.beat)]!;
}

function meterChangeAtBeat(map: TempoMap, beat: number): MeterChange {
  return map.meters[lastAtOrBefore(map.meters, beat + BEAT_EPSILON, (m) => m.beat)]!;
}

function meterChangeAtBar(map: TempoMap, bar: number): MeterChange {
  return map.meters[lastAtOrBefore(map.meters, bar, (m) => m.bar)]!;
}

/** Beat position (fractional) of a source time. */
export function timeToBeat(map: TempoMap, t: Seconds): number {
  const s = segmentAtTime(map, t);
  return s.beat + ((t - s.time) * s.bpm) / 60;
}

/** Source time of a beat position. */
export function beatToTime(map: TempoMap, beat: number): Seconds {
  const s = segmentAtBeat(map, beat);
  return s.time + ((beat - s.beat) * 60) / s.bpm;
}

/** Tempo in force at a source time. */
export function bpmAt(map: TempoMap, t: Seconds): number {
  return segmentAtTime(map, t).bpm;
}

export function meterAtBar(map: TempoMap, bar: number): Meter {
  return meterChangeAtBar(map, bar).meter;
}

/** Beat position of the start of a bar. */
export function barToBeat(map: TempoMap, bar: number): number {
  const m = meterChangeAtBar(map, bar);
  return m.beat + (bar - m.bar) * m.meter.numerator;
}

export interface BarPosition {
  /** Bar index (0 = « mesure 1 », negative before the first downbeat). */
  bar: number;
  /** Beats elapsed since the start of the bar, fractional, 0 <= beatInBar < numerator. */
  beatInBar: number;
  meter: Meter;
}

/** Bar and beat-in-bar of a beat position. */
export function beatToBar(map: TempoMap, beat: number): BarPosition {
  const m = meterChangeAtBeat(map, beat);
  const n = m.meter.numerator;
  const bar = m.bar + Math.floor((beat - m.beat) / n + BEAT_EPSILON / n);
  const beatInBar = Math.max(0, beat - (m.beat + (bar - m.bar) * n));
  return { bar, beatInBar, meter: m.meter };
}

export function timeToBar(map: TempoMap, t: Seconds): BarPosition {
  return beatToBar(map, timeToBeat(map, t));
}

export function barStartTime(map: TempoMap, bar: number): Seconds {
  return beatToTime(map, barToBeat(map, bar));
}

/** Source time of the first downbeat (start of « mesure 1 »). */
export function firstDownbeat(map: TempoMap): Seconds {
  return beatToTime(map, 0);
}

/**
 * The tempo a musician would name for the piece: the tempo of a constant map,
 * the duration-weighted median for a variable one (`duration` bounds the last
 * segment; without it, the plain median of the segment tempos).
 */
export function nominalBpm(map: TempoMap, duration?: Seconds): number {
  const segs = map.segments;
  if (segs.length === 1) return segs[0]!.bpm;
  // An analysed map has one segment per beat and React selectors ask often: memoised per map.
  let cached = nominalCache.get(map);
  if (!cached) nominalCache.set(map, (cached = new Map()));
  const hit = cached.get(duration);
  if (hit !== undefined) return hit;
  const value = weightedMedianBpm(segs, duration);
  cached.set(duration, value);
  return value;
}

const nominalCache = new WeakMap<TempoMap, Map<Seconds | undefined, number>>();

function weightedMedianBpm(segs: readonly TempoSegment[], duration?: Seconds): number {
  const weighted = segs.map((s, i) => {
    const next = segs[i + 1];
    const end = next ? next.time : duration ?? s.time;
    return { bpm: s.bpm, w: duration === undefined ? 1 : Math.max(0, end - Math.max(0, s.time)) };
  });
  weighted.sort((a, b) => a.bpm - b.bpm);
  const total = weighted.reduce((sum, x) => sum + x.w, 0);
  if (total <= 0) return weighted[Math.floor(weighted.length / 2)]!.bpm;
  let acc = 0;
  for (const x of weighted) {
    acc += x.w;
    if (acc >= total / 2) return x.bpm;
  }
  return weighted[weighted.length - 1]!.bpm;
}

/** Highest tempo of the map (decides how dense the sub-grid can get). */
export function maxBpm(map: TempoMap): number {
  return map.segments.reduce((m, s) => Math.max(m, s.bpm), 0);
}

export interface ManualGridChange {
  bpm?: number;
  firstDownbeat?: Seconds;
  numerator?: number;
}

/**
 * Applies the manual entry of lot 1 (tempo, first downbeat, beats per bar) and
 * returns a constant map marked `manual`. Values are clamped to the allowed ranges.
 */
export function withManualGrid(map: TempoMap, change: ManualGridChange): TempoMap {
  const meter = map.meters[0]!.meter;
  const bpm = clamp(change.bpm ?? nominalBpm(map), BPM_MIN, BPM_MAX);
  const numerator = Math.round(clamp(change.numerator ?? meter.numerator, NUMERATOR_MIN, NUMERATOR_MAX));
  return constantTempoMap({
    bpm,
    firstDownbeat: change.firstDownbeat ?? firstDownbeat(map),
    meter: { numerator, denominator: meter.denominator },
    origin: 'manual',
  });
}
