// Hand edits of the chart as pure functions over `Corrections` (tested in
// edits.test.ts); `store/harmonyActions.ts` applies them to the store.
//
// Every chord edit works on WHOLE BARS: the bar becomes « written by hand »
// (a hand span over it) and holds exactly the chords given. Analysed chords
// starting in it are hidden from then on, including after a new analysis.

import type { Corrections, HandChord, SectionMark } from '../model/corrections';
import type { ChordSymbol } from '../model/harmony';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { barStartTime, beatToBar, meterAtBar } from '../grid/tempoMap';
import { nearestBeat, sectionBar, timeOfBeatInBar, type BarChord } from './layout';

/** One chord of a bar as the editor gives it. */
export interface BarEntry {
  /** 0-based beat in the bar where the chord starts. */
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

/** The bar a stored chord is shown in: the bar of its nearest beat (as `chart/layout.ts` does). */
export function barOfChord(map: TempoMap, time: Seconds): number {
  return beatToBar(map, nearestBeat(map, time)).bar;
}

/**
 * Writes bar `bar` by hand with exactly `entries` (an empty list: no chord
 * starts in this bar, the previous one goes on). Entries outside the bar or
 * on the same beat as another are dropped (the last one wins).
 */
export function withBarChords(c: Corrections, map: TempoMap, bar: number, entries: readonly BarEntry[]): Corrections {
  const span = barSpan(map, bar);
  const beats = meterAtBar(map, bar).numerator;
  const inBar = (h: HandChord) => barOfChord(map, h.time) === bar;
  const byBeat = new Map<number, ChordSymbol | null>();
  for (const e of entries) {
    const b = Math.round(e.beatInBar);
    if (b >= 0 && b < beats) byBeat.set(b, e.chord);
  }
  const added: HandChord[] = [...byBeat.entries()].map(([b, chord]) => ({ time: timeOfBeatInBar(map, bar, b), chord }));
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
