// Hand edits of the chart as pure functions over `Corrections` (tested in
// edits.test.ts); `store/harmonyActions.ts` applies them to the store.
//
// Every chord edit works on WHOLE BARS: the bar becomes « written by hand »
// (a hand span over it) and holds exactly the chords given. Analysed chords
// starting in it are hidden from then on, including after a new analysis.

import type { Corrections, HandChord, SectionMark } from '../model/corrections';
import type { ChordSymbol } from '../model/harmony';
import type { Seconds, TimeRange } from '../model/project';
import type { Meter, TempoMap } from '../model/tempoMap';
import { barStartTime, beatToBar, meterAtBar } from '../grid/tempoMap';
import { maxBarChords, nearestSlot, sectionBar, slotsPerBeat, timeOfBeatInBar, toPlace, type BarChord } from './layout';

/** One chord of a bar as the editor gives it. */
export interface BarEntry {
  /** 0-based beat in the bar where the chord starts, in half beats (1.5: the middle of beat 2). */
  beatInBar: number;
  /** Null for « N.C. ». */
  chord: ChordSymbol | null;
}

/** Longest section label kept. */
export const SECTION_LABEL_MAX = 12;

const EPS = 1e-6;

/** Adds a span to a sorted list of disjoint spans, merging what touches it. */
export function addSpan(spans: readonly TimeRange[], span: TimeRange): TimeRange[] {
  let { start, end } = span;
  const out: TimeRange[] = [];
  for (const s of spans) {
    if (s.end < start - EPS || s.start > end + EPS) out.push(s);
    else {
      start = Math.min(start, s.start);
      end = Math.max(end, s.end);
    }
  }
  out.push({ start, end });
  return out.sort((a, b) => a.start - b.start);
}

/** Removes a span from a sorted list of disjoint spans (cutting the ones it overlaps). */
export function removeSpan(spans: readonly TimeRange[], span: TimeRange): TimeRange[] {
  const out: TimeRange[] = [];
  for (const s of spans) {
    if (s.end <= span.start + EPS || s.start >= span.end - EPS) {
      out.push(s);
      continue;
    }
    if (s.start < span.start - EPS) out.push({ start: s.start, end: span.start });
    if (s.end > span.end + EPS) out.push({ start: span.end, end: s.end });
  }
  return out;
}

/** The time span of a bar on the grid in force. */
export function barSpan(map: TempoMap, bar: number): TimeRange {
  return { start: barStartTime(map, bar), end: barStartTime(map, bar + 1) };
}

/** The bar a stored chord is shown in: the bar of its place on the grid (as `chart/layout.ts` does). */
export function barOfChord(map: TempoMap, time: Seconds): number {
  return beatToBar(map, nearestSlot(map, time)).bar;
}

/**
 * Writes bar `bar` by hand with exactly `entries` (an empty list: no chord
 * starts in this bar, the previous one goes on). Entries outside the bar or
 * on the same place as another are dropped (the last one wins), and so are
 * those past the most a bar holds (`layout.ts#maxBarChords`: eight). A place is a
 * beat or, in a bar of quarter notes, the middle of one (`layout.ts#slotsPerBeat`).
 */
export function withBarChords(c: Corrections, map: TempoMap, bar: number, entries: readonly BarEntry[]): Corrections {
  const span = barSpan(map, bar);
  const meter = meterAtBar(map, bar);
  const beats = meter.numerator;
  const inBar = (h: HandChord) => barOfChord(map, h.time) === bar;
  const byBeat = new Map<number, ChordSymbol | null>();
  for (const e of entries) {
    const b = toPlace(e.beatInBar, meter);
    if (b >= 0 && b < beats) byBeat.set(b, e.chord);
  }
  const kept = [...byBeat.entries()].sort((x, y) => x[0] - y[0]).slice(0, maxBarChords(meter));
  const added: HandChord[] = kept.map(([b, chord]) => ({ time: timeOfBeatInBar(map, bar, b), chord }));
  const chords = [...c.chords.filter((h) => !inBar(h)), ...added].sort((a, b) => a.time - b.time);
  return { ...c, chords, handSpans: addSpan(c.handSpans, span) };
}

/** True when the user rewrote bar `bar` by hand (it can be given back to the analysis). */
export function hasBarEdit(c: Corrections, map: TempoMap, bar: number): boolean {
  const span = barSpan(map, bar);
  return c.handSpans.some((s) => s.end > span.start + EPS && s.start < span.end - EPS);
}

/** What is left of a bar's chords when it holds a single chord: the chosen one, on the bar line. */
export function mergedEntries(entries: readonly BarEntry[], keep: number): BarEntry[] {
  const kept = entries[Math.min(Math.max(keep, 0), entries.length - 1)];
  return kept ? [{ beatInBar: 0, chord: kept.chord }] : [];
}

/** The entries of a bar as shown now (to edit from what the user sees). */
export function entriesOf(chords: readonly BarChord[]): BarEntry[] {
  return chords.map((c) => ({ beatInBar: c.beatInBar, chord: c.chord }));
}

/** Gives bar `bar` back to the analysis: its hand chords and its hand span go. */
export function withoutBarEdit(c: Corrections, map: TempoMap, bar: number): Corrections {
  return { ...c, chords: c.chords.filter((h) => barOfChord(map, h.time) !== bar), handSpans: removeSpan(c.handSpans, barSpan(map, bar)) };
}

/** Places (or with `label` null, removes) the section letter of bar `bar`. One per bar. */
export function withSection(c: Corrections, map: TempoMap, bar: number, label: string | null): Corrections {
  const rest = c.sections.filter((s) => sectionBar(map, s.time) !== bar);
  const text = label?.trim().slice(0, SECTION_LABEL_MAX) ?? '';
  const sections: SectionMark[] = text ? [...rest, { time: barStartTime(map, bar), label: text }] : rest;
  return { ...c, sections: sections.sort((a, b) => a.time - b.time) };
}

/** Where a bar is split in two: the middle beat (beat 3 in 4/4, beat 2 in 3/4). */
export function splitBeat(beats: number): number {
  return Math.max(1, Math.floor(beats / 2));
}

/** The step between two places of a bar of `meter`, in beats: half a beat in 4/4, a beat in 6/8 (`layout.ts#slotsPerBeat`). */
export const placeStep = (meter: Meter): number => 1 / slotsPerBeat(meter);

const QUARTERS: Meter = { numerator: 4, denominator: 4 };

/**
 * The places (0-based beats; in half beats in a bar of quarter notes) a chord of a bar can be moved
 * to: between the chord before it and the chord after it, so that the chords keep their order (and
 * their rank in the editor). The place the chord is on is one of them. `meter`: the bar's signature
 * (default: quarter notes, `beats` of them).
 */
export function movableBeats(entries: readonly BarEntry[], index: number, beats: number, meter: Meter = QUARTERS): number[] {
  if (index < 0 || index >= entries.length) return [];
  const step = placeStep(meter);
  const before = index > 0 ? entries[index - 1]!.beatInBar + step : 0;
  const after = index < entries.length - 1 ? entries[index + 1]!.beatInBar - step : beats - step;
  const out: number[] = [];
  for (let b = Math.max(0, before); b <= Math.min(beats - step, after) + 1e-9; b += step) out.push(b);
  return out;
}

/** The entries of a bar with the `index`-th chord moved to `beatInBar` (unchanged when that place is not one it can go to). */
export function withChordMoved(entries: readonly BarEntry[], index: number, beatInBar: number, beats: number, meter: Meter = QUARTERS): BarEntry[] {
  if (!movableBeats(entries, index, beats, meter).includes(beatInBar)) return [...entries];
  return entries.map((e, i) => (i === index ? { ...e, beatInBar } : e));
}

/** The place a new chord takes in the free stretch from `from` to `to` (places `step` apart): its middle, on a beat when it can be. */
function placeBetween(from: number, to: number, step: number): number | null {
  const gap = to - from;
  if (gap < 2 * step - 1e-9) return null;
  const mid = from + gap / 2;
  // The very middle when it is a beat, or when the room is too short to hold a beat (« 1 et », between 1 and 2).
  if (Number.isInteger(mid) || (gap < 3 * step && Number.isInteger(mid / step))) return mid;
  // The beat nearest the middle (the earlier one on a tie: beat 2 of a 3/4 bar), when it is inside the room.
  const near = Math.ceil(mid - 0.5);
  for (const beat of [near, near === Math.floor(mid) ? near + 1 : near - 1]) if (beat > from + 1e-9 && beat < to - 1e-9) return beat;
  return Math.round(mid / step) * step;
}

/**
 * One more chord in a bar (1.0.3: up to eight): it goes after the `index`-th chord, in the middle
 * of the room up to the next one (the middle beat of a whole bar, as a Real Book writes the second
 * chord), and starts as a copy of the chord sounding there, so nothing changes until the user
 * names it. When there is no room right after it, it takes the middle of the widest room of the
 * bar. Null when the bar is full (`layout.ts#maxBarChords`) or holds no chord yet.
 */
export function withChordAdded(entries: readonly BarEntry[], index: number, beats: number, meter: Meter = { numerator: beats, denominator: 4 }): { entries: BarEntry[]; index: number } | null {
  if (entries.length === 0 || entries.length >= maxBarChords(meter)) return null;
  const step = placeStep(meter);
  const at = Math.min(Math.max(index, 0), entries.length - 1);
  const end = (i: number) => (i + 1 < entries.length ? entries[i + 1]!.beatInBar : beats);
  let after = at;
  let place = placeBetween(entries[at]!.beatInBar, end(at), step);
  if (place === null) {
    // The widest room of the bar: after a chord, or before the first one (the chord going on then lasts until it).
    let widest = 0;
    for (let i = -1; i < entries.length; i++) {
      const from = i < 0 ? 0 : entries[i]!.beatInBar;
      const to = i < 0 ? entries[0]!.beatInBar : end(i);
      const p = i < 0 ? (to > 0 ? 0 : null) : placeBetween(from, to, step);
      if (p !== null && to - from > widest + 1e-9) {
        widest = to - from;
        place = p;
        after = i;
      }
    }
  }
  if (place === null) return null;
  const source = entries[Math.max(after, 0)]!;
  const added: BarEntry = { beatInBar: place, chord: source.chord };
  const out = [...entries.slice(0, after + 1), added, ...entries.slice(after + 1)];
  return { entries: out, index: after + 1 };
}
