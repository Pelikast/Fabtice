// Tempo map arithmetic: source time <-> beats <-> bars. Pure functions.
// See `model/tempoMap.ts` for units, the pick-up convention and the rule of
// mixed denominators (« la noire reste la noire »): map beats count the note
// value of the FIRST signature's denominator, and a bar of n/d lasts
// n × d0 / d map beats (`barBeats`). Positions inside a bar
// (`BarPosition.beatInBar`) are counted in the bar's own beats.

import type { Seconds } from '../model/project';
import type { Meter, MeterChange, TempoMap, TempoOrigin, TempoSegment } from '../model/tempoMap';

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const DEFAULT_BPM = 120;
/** Beats per bar the « Tempo et mesures » panel offers (the signatures of a piece go further: `model/tempoMap.ts`). */
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
  return { origin, segments, meters: meterChangesFromBars(ms) };
}

export function sameMeter(a: Meter, b: Meter): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

/**
 * Meter changes from bars and meters: the beat of each bar line, by the rule
 * of `model/tempoMap.ts` (a bar of n/d lasts n × d0 / d map beats, d0 being
 * the first meter's denominator). `list[0]` is the meter of bar 0; later
 * entries must have ascending bars (one that does not is skipped); an entry
 * with the meter already in force is no change and is dropped.
 */
export function meterChangesFromBars(list: readonly { bar: number; meter: Meter }[]): MeterChange[] {
  const first = list[0]!.meter;
  const unit = first.denominator;
  const out: MeterChange[] = [{ bar: 0, beat: 0, meter: { ...first } }];
  for (const m of list.slice(1)) {
    const prev = out[out.length - 1]!;
    if (!(m.bar > prev.bar) || sameMeter(prev.meter, m.meter)) continue;
    const beat = prev.beat + ((m.bar - prev.bar) * prev.meter.numerator * unit) / prev.meter.denominator;
    out.push({ bar: m.bar, beat, meter: { ...m.meter } });
  }
  return out;
}

// ---------------------------------------------------------------- the beats of each meter

/**
 * The note value the beats of the map count: the denominator of its first
 * signature (4 = quarter notes). Tempo segments are in these beats per minute.
 */
export function beatUnit(map: TempoMap): number {
  return map.meters[0]!.meter.denominator;
}

/** Map beats per beat of `meter`: 1 for the first signature's denominator, ½ for an x/8 bar in a map counting quarters. */
export function beatScale(map: TempoMap, meter: Meter): number {
  return beatUnit(map) / meter.denominator;
}

/** Length of one bar of `meter`, in map beats (a 6/8 bar in a map counting quarters: 3). */
export function barBeats(map: TempoMap, meter: Meter): number {
  return meter.numerator * beatScale(map, meter);
}

/** 6/8, 9/8, 12/8 (and 6/16, 12/16…): the beat felt is three units of the denominator (a dotted value). */
export function isCompound(m: Meter): boolean {
  return m.denominator >= 8 && m.numerator >= 6 && m.numerator % 3 === 0;
}

/**
 * Units of the denominator per beat a musician counts (and a beat tracker
 * finds): 1 in x/4; 3 in compound meters (the dotted quarter of 6/8, 9/8,
 * 12/8; the dotted eighth of 12/16); else the quarter (2 in 7/8, 4 in 7/16).
 * The tempo is shown and typed per felt beat (`store/derived.ts`), and
 * changing the meter of the whole piece in the metronome panel renumbers the
 * beats so that the felt beat stays on the music (`grid/corrections.ts#withMeter`).
 */
export function feltUnits(m: Meter): number {
  if (m.denominator === 4) return 1;
  return isCompound(m) ? 3 : m.denominator / 4;
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
  return m.beat + (bar - m.bar) * barBeats(map, m.meter);
}

/** Beat position (map beats) of beat `beatInBar` (in the bar's own beats, fractional) of bar `bar`. */
export function barBeatToBeat(map: TempoMap, bar: number, beatInBar: number): number {
  return barToBeat(map, bar) + beatInBar * beatScale(map, meterAtBar(map, bar));
}

export interface BarPosition {
  /** Bar index (0 = « mesure 1 », negative before the first downbeat). */
  bar: number;
  /**
   * Beats elapsed since the start of the bar, counted in the bar's OWN beats
   * (units of its denominator: eighths in a 6/8 bar, whatever the map
   * counts), fractional, 0 <= beatInBar < numerator.
   */
  beatInBar: number;
  meter: Meter;
}

/** Bar and beat-in-bar of a beat position. */
export function beatToBar(map: TempoMap, beat: number): BarPosition {
  const m = meterChangeAtBeat(map, beat);
  const len = barBeats(map, m.meter);
  const bar = m.bar + Math.floor((beat - m.beat) / len + BEAT_EPSILON / len);
  const beatInBar = Math.max(0, beat - (m.beat + (bar - m.bar) * len)) / beatScale(map, m.meter);
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
 * The beats per bar are those of the first signature. Later signature changes
 * keep their BAR NUMBERS: a typed tempo or downbeat moves the beat times
 * themselves, so the bar is what still says where a change is in the music.
 */
export function withManualGrid(map: TempoMap, change: ManualGridChange): TempoMap {
  const meter = map.meters[0]!.meter;
  // Tempos are bounded per beat a musician counts: in 6/8 a grid beat is an eighth (lot 4, `feltUnits`).
  const felt = feltUnits(meter);
  const bpm = clamp(change.bpm ?? nominalBpm(map), BPM_MIN * felt, BPM_MAX * felt);
  // A meter set in the metronome panel (up to 12 beats) is kept unless the beats per bar are changed here.
  const numerator = change.numerator === undefined ? meter.numerator : Math.round(clamp(change.numerator, NUMERATOR_MIN, NUMERATOR_MAX));
  const out = constantTempoMap({
    bpm,
    firstDownbeat: change.firstDownbeat ?? firstDownbeat(map),
    meter: { numerator, denominator: meter.denominator },
    origin: 'manual',
  });
  if (map.meters.length === 1) return out;
  return { ...out, meters: meterChangesFromBars([out.meters[0]!, ...map.meters.slice(1)]) };
}
