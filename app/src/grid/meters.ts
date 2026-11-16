// Time signatures bar by bar (C13): the commands of « Changer la signature
// rythmique » as pure functions over a tempo map, how the signature changes
// are placed again on a grid that changed, and what the interface reads
// (the signature in force at a bar or a time, the list of changes).
//
// The rules (see also `model/tempoMap.ts` for « la noire reste la noire »):
//   - the BEAT TIMES NEVER MOVE: a signature only changes where the bar
//     lines are (chords, sections and loops are kept in seconds and stay
//     with the music). From the changed bar on, bar lines are counted again
//     from that bar line;
//   - « Changement permanent à partir de cette mesure » (`withMeterFrom`):
//     the signature holds until the next change that already existed (or the
//     end);
//   - « Changement uniquement pour cette mesure » (`withMeterForBar`): the
//     bar after it gets back the signature it had before;
//   - a later change that already existed keeps its TIME: it goes to the bar
//     line of the new grid nearest to where it was, at least one bar after
//     the change before it; exactly halfway between two bar lines, it keeps
//     its bar number. (Keeping bar numbers instead would move the change in
//     the music: a 3/4 passage that starts at 1:30 would start elsewhere as
//     soon as a bar before it is shortened.)
//   - a change to the signature already in force is no change: no entry;
//     `meters[0]` stays `{ bar: 0, beat: 0 }`; bars before the first downbeat
//     (pick-up) have the first signature, they cannot get one of their own;
//   - changing the denominator of bar 0 renumbers the whole map so that the
//     quarter stays the quarter (4/4 -> 6/8 on bar 1: the map then counts
//     eighths, twice as many beats, same times).
//
// Where the signatures live: in the grid in force (`tempoMap.meters`), the
// first one included. The analysis gives a single meter; every later change
// is the user's. When a grid is computed again (a manual tempo action,
// « Revenir à l'analyse », a manual tempo action undone), `withMetersOf`
// places the user's changes again on the new grid by time.

import type { Seconds } from '../model/project';
import { isValidMeter, type Meter, type MeterChange, type TempoMap, type TempoOrigin } from '../model/tempoMap';
import { barStartTime, beatUnit, feltUnits, meterAtBar, meterChangesFromBars, sameMeter, timeToBar, timeToBeat } from './tempoMap';

/** Who made the grid once corrected by hand: analysed beats become `corrected`, anything else `manual`. */
export function correctedOrigin(origin: TempoOrigin): TempoOrigin {
  return origin === 'analysis' || origin === 'corrected' ? 'corrected' : 'manual';
}

/** A signature change to place by its position in the music. */
export interface FloatingMeter {
  /** Its position, in beats of the map being built. */
  beat: number;
  meter: Meter;
  /** Its bar before the edit: it wins when the position is exactly halfway between two bar lines. */
  bar?: number;
}

const TIE = 1e-6;

/**
 * The meter changes of a map: `first` at bar 0, then `fixed` at their bars
 * (ascending, from bar 1), then each of `floating` (ascending positions) on
 * the bar line nearest to its position, at least one bar after the change
 * before it. Redundant changes are dropped. Bar lengths follow the rule of
 * `model/tempoMap.ts`, the map counting `first.denominator`.
 */
export function placeMeters(first: Meter, fixed: readonly { bar: number; meter: Meter }[], floating: readonly FloatingMeter[]): MeterChange[] {
  const unit = first.denominator;
  const len = (m: Meter) => (m.numerator * unit) / m.denominator;
  const raw: MeterChange[] = [{ bar: 0, beat: 0, meter: first }];
  let prev = raw[0]!;
  for (const f of fixed) {
    if (f.bar <= prev.bar) continue;
    prev = { bar: f.bar, beat: prev.beat + (f.bar - prev.bar) * len(prev.meter), meter: f.meter };
    raw.push(prev);
  }
  for (const f of floating) {
    const l = len(prev.meter);
    const rel = (f.beat - prev.beat) / l;
    let j = Math.round(rel);
    const lo = Math.floor(rel + TIE);
    if (f.bar !== undefined && Math.abs(rel - lo - 0.5) < TIE) {
      if (prev.bar + lo + 1 === f.bar) j = lo + 1;
      else if (prev.bar + lo === f.bar) j = lo;
    }
    j = Math.max(1, j);
    prev = { bar: prev.bar + j, beat: prev.beat + j * l, meter: f.meter };
    raw.push(prev);
  }
  return meterChangesFromBars(raw);
}

function sameList(a: readonly MeterChange[], b: readonly MeterChange[]): boolean {
  return a.length === b.length && a.every((m, i) => m.bar === b[i]!.bar && Math.abs(m.beat - b[i]!.beat) < 1e-9 && sameMeter(m.meter, b[i]!.meter));
}

/** True when bar `bar` can be given a signature of its own (« mesure 1 » or later, a legal signature). */
export function canSetMeterAt(bar: number, meter?: Meter): boolean {
  return Number.isInteger(bar) && bar >= 0 && (meter === undefined || isValidMeter(meter));
}

function edit(map: TempoMap, bar: number, meter: Meter, onlyThisBar: boolean): TempoMap {
  if (!canSetMeterAt(bar, meter)) return map;
  const old = map.meters;
  const next = meterAtBar(map, bar + 1);
  // A new denominator on bar 0: the whole map counts the new note value (the quarter stays the quarter).
  const f = bar === 0 ? meter.denominator / beatUnit(map) : 1;
  const first = bar === 0 ? meter : old[0]!.meter;
  const fixed = old.filter((m) => m.bar > 0 && m.bar < bar).map((m) => ({ bar: m.bar, meter: m.meter }));
  if (bar > 0) fixed.push({ bar, meter });
  if (onlyThisBar) fixed.push({ bar: bar + 1, meter: next });
  const after = onlyThisBar ? bar + 1 : bar;
  const floating = old.filter((m) => m.bar > after).map((m) => ({ beat: m.beat * f, meter: m.meter, bar: m.bar }));
  const meters = placeMeters({ ...first }, fixed, floating);
  if (f === 1 && sameList(meters, old)) return map;
  const segments = map.segments.map((s) => (f === 1 ? { ...s } : { time: s.time, beat: s.beat * f, bpm: s.bpm * f }));
  return { origin: correctedOrigin(map.origin), segments, meters };
}

/** « Changement permanent à partir de cette mesure »: `meter` from bar `bar` until the next change (or the end). */
export function withMeterFrom(map: TempoMap, bar: number, meter: Meter): TempoMap {
  return edit(map, bar, meter, false);
}

/** « Changement uniquement pour cette mesure »: `meter` for bar `bar`, then the signature bar `bar + 1` had. */
export function withMeterForBar(map: TempoMap, bar: number, meter: Meter): TempoMap {
  return edit(map, bar, meter, true);
}

/** The change that starts exactly at bar `bar`, or null (bar 0 always has the first signature). */
export function meterChangeAt(map: TempoMap, bar: number): MeterChange | null {
  return map.meters.find((m) => m.bar === bar) ?? null;
}

/** Removes the change at bar `bar` (> 0): the signature before it goes on until the next change. Same map when there is none. */
export function withoutMeterChange(map: TempoMap, bar: number): TempoMap {
  if (bar <= 0 || !meterChangeAt(map, bar)) return map;
  return edit(map, bar, meterAtBar(map, bar - 1), false);
}

/** The signature in force at a source time (the first one before the first downbeat). */
export function meterAtTime(map: TempoMap, t: Seconds): Meter {
  return timeToBar(map, t).meter;
}

/** A signature as the interface lists it. */
export interface MeterChangeView {
  /** Bar index (0 = « mesure 1 »). */
  bar: number;
  /** Source time of its bar line. */
  time: Seconds;
  meter: Meter;
  /** False for the signature of the first bar, true for a change. */
  change: boolean;
  /** A change for this bar only: the next bar goes back to the signature before it. */
  single: boolean;
}

const listCache = new WeakMap<TempoMap, MeterChangeView[]>();

/** Every signature of the map, the first one included, as listed (the same array for the same map: safe in a selector). */
export function meterChangeList(map: TempoMap): MeterChangeView[] {
  const hit = listCache.get(map);
  if (hit) return hit;
  const ms = map.meters;
  const out = ms.map((m, i) => {
    const next = ms[i + 1];
    const before = ms[i - 1];
    return {
      bar: m.bar,
      time: barStartTime(map, m.bar),
      meter: { ...m.meter },
      change: i > 0,
      single: i > 0 && next !== undefined && next.bar === m.bar + 1 && sameMeter(next.meter, before!.meter),
    };
  });
  listCache.set(map, out);
  return out;
}

/**
 * The signature changes of `source` (all but the first) placed on `target`
 * by time, on the nearest bar lines (see the head of this file). The first
 * signature stays `target`'s; `target`'s own changes are replaced. Same map
 * when nothing changes.
 */
export function withMetersOf(target: TempoMap, source: TempoMap): TempoMap {
  if (source.meters.length <= 1 && target.meters.length <= 1) return target;
  const floating = source.meters.slice(1).map((m) => ({ beat: timeToBeat(target, barStartTime(source, m.bar)), meter: m.meter, bar: m.bar }));
  const meters = placeMeters({ ...target.meters[0]!.meter }, [], floating);
  if (sameList(meters, target.meters)) return target;
  return { origin: target.origin === 'analysis' ? 'corrected' : target.origin, segments: target.segments, meters };
}

/**
 * The signature that covers most of the piece (by time, up to `duration`;
 * without it, the first): the tempo is shown and typed per its felt beat, so
 * that one bar of 6/8 in a 4/4 piece does not change how the tempo reads.
 */
export function mainMeter(map: TempoMap, duration?: Seconds): Meter {
  const ms = map.meters;
  if (ms.length === 1 || duration === undefined) return ms[0]!.meter;
  const weight = new Map<string, { meter: Meter; w: number }>();
  ms.forEach((m, i) => {
    const start = i === 0 ? 0 : barStartTime(map, m.bar);
    const next = ms[i + 1];
    const end = Math.min(duration, next ? barStartTime(map, next.bar) : duration);
    const key = `${m.meter.numerator}/${m.meter.denominator}`;
    const e = weight.get(key) ?? { meter: m.meter, w: 0 };
    e.w += Math.max(0, end - Math.max(0, start));
    weight.set(key, e);
  });
  let best: { meter: Meter; w: number } | null = null;
  for (const e of weight.values()) if (!best || e.w > best.w + 1e-9) best = e;
  return best!.meter;
}

/**
 * Map beats per beat the tempo is shown in: the felt beat of the main
 * signature (`mainMeter`), measured in the map's beats (a dotted quarter in
 * a map counting quarters: 1.5). 1 in x/4 pieces, 3 in 6/8 pieces, as before.
 */
export function feltBeat(map: TempoMap, duration?: Seconds): number {
  const m = mainMeter(map, duration);
  return (feltUnits(m) * beatUnit(map)) / m.denominator;
}
