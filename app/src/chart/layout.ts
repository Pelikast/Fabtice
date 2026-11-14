// Layout of the « Grille d'accords », as pure functions (tested in
// layout.test.ts): which chords are in force (analysis and hand corrections
// merged), which bar each falls in, section letters and double bars, lines of
// four bars. Nothing here knows about React, the store or the screen.
//
// Chords and sections are stored in source time (seconds). Here they are put
// on the grid in force: a chord goes to the NEAREST BEAT, a section to the
// NEAREST BAR LINE. That is how they stay with the music when the grid is
// corrected (first beat moved, tempo doubled…).

import { barStartTime, barToBeat, beatToBar, beatToTime, meterAtBar, timeToBar, timeToBeat } from '../grid/tempoMap';
import { barsOfRange } from '../grid/lines';
import type { AnalysedChord } from '../model/analysis';
import type { Corrections, SectionMark } from '../model/corrections';
import type { ChordSymbol } from '../model/harmony';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';

/** Bars per line of the chart (DESIGN.md, mockup). */
export const BARS_PER_LINE = 4;

/** A chord in force, wherever it comes from. */
export interface ChartChord {
  /** Stored position (source time). */
  time: Seconds;
  /** Nearest beat of the grid in force (beats from the first downbeat). */
  beat: number;
  chord: ChordSymbol | null;
  origin: 'analysis' | 'manual';
  /** Analysis only (null for a hand chord). */
  confidence: number | null;
  doubtful: boolean;
  /** Analysis' next best readings (empty for a hand chord). */
  alternatives: ChordSymbol[];
}

export function nearestBeat(map: TempoMap, time: Seconds): number {
  return Math.round(timeToBeat(map, time));
}

/** Whole beats [first, end) covered by a hand span, on the grid in force. */
function spanBeats(map: TempoMap, span: TimeRange): [number, number] {
  return [nearestBeat(map, span.start), nearestBeat(map, span.end)];
}

/**
 * The chords in force: analysed chords outside the stretches the user rewrote,
 * plus the hand chords, ordered by beat. When two chords land on the same beat
 * the later one in time wins (it is the one heard after the beat).
 */
export function resolveChords(map: TempoMap, analysed: readonly AnalysedChord[] | null, corrections: Corrections): ChartChord[] {
  const spans = corrections.handSpans.map((s) => spanBeats(map, s));
  const hidden = (beat: number) => spans.some(([a, b]) => beat >= a && beat < b);
  const out: ChartChord[] = [];
  for (const c of analysed ?? []) {
    const beat = nearestBeat(map, c.time);
    if (hidden(beat)) continue;
    out.push({ time: c.time, beat, chord: c.chord, origin: 'analysis', confidence: c.confidence, doubtful: c.doubtful, alternatives: c.alternatives });
  }
  for (const c of corrections.chords) {
    out.push({ time: c.time, beat: nearestBeat(map, c.time), chord: c.chord, origin: 'manual', confidence: null, doubtful: false, alternatives: [] });
  }
  out.sort((a, b) => a.beat - b.beat || a.time - b.time);
  const unique: ChartChord[] = [];
  for (const c of out) {
    if (unique.length && unique[unique.length - 1]!.beat === c.beat) unique[unique.length - 1] = c;
    else unique.push(c);
  }
  return unique;
}

/** A chord as placed in its bar. */
export interface BarChord extends ChartChord {
  /** 0-based beat in the bar where it starts (0 = on the bar line). */
  beatInBar: number;
}

export interface ChartBar {
  /** Bar index (0 = « mesure 1 », negative = pick-up). */
  bar: number;
  start: Seconds;
  end: Seconds;
  /** Beats in this bar. */
  beats: number;
  /** Chords starting in this bar, in order. */
  chords: BarChord[];
  /** No chord starts here but one is going on: the chart writes the bar-repeat sign. */
  repeat: boolean;
  /** Section letter starting at this bar, or null. */
  section: string | null;
  /** A double bar line before this bar: a section starts here and it is not the first bar of the chart. */
  doubleBar: boolean;
}

export interface ChartInput {
  map: TempoMap;
  chords: readonly ChartChord[];
  sections: readonly SectionMark[];
  /** Length of the piece: the chart goes to the bar that contains its end. */
  duration: Seconds;
}

/** The bar a section mark belongs to: the bar line nearest to its time. */
export function sectionBar(map: TempoMap, time: Seconds): number {
  const pos = timeToBar(map, time);
  return pos.beatInBar > pos.meter.numerator / 2 ? pos.bar + 1 : pos.bar;
}

/**
 * Every bar of the chart, from bar 0 (or the first pick-up bar that holds a
 * chord or a section) to the bar containing the end of the piece (or the last
 * chord, if later).
 */
export function chartBars({ map, chords, sections, duration }: ChartInput): ChartBar[] {
  const byBar = new Map<number, BarChord[]>();
  let first = 0;
  let last = Math.max(0, timeToBar(map, Math.max(0, duration - 1e-6)).bar);
  for (const c of chords) {
    const pos = beatToBar(map, c.beat);
    const list = byBar.get(pos.bar) ?? [];
    list.push({ ...c, beatInBar: Math.round(pos.beatInBar) });
    byBar.set(pos.bar, list);
    first = Math.min(first, pos.bar);
    last = Math.max(last, pos.bar);
  }
  const sectionAt = new Map<number, string>();
  for (const s of sections) {
    const bar = sectionBar(map, s.time);
    sectionAt.set(bar, s.label);
    first = Math.min(first, bar);
  }
  // The chord going on when the chart starts (a chord before the first bar shown cannot exist: `first` covers them).
  let going: ChordSymbol | null | undefined;
  const out: ChartBar[] = [];
  for (let bar = first; bar <= last; bar++) {
    const own = byBar.get(bar) ?? [];
    const section = sectionAt.get(bar) ?? null;
    out.push({
      bar,
      start: barStartTime(map, bar),
      end: barStartTime(map, bar + 1),
      beats: meterAtBar(map, bar).numerator,
      chords: own,
      repeat: own.length === 0 && going !== undefined && going !== null,
      section,
      doubleBar: section !== null && bar !== first,
    });
    if (own.length) going = own[own.length - 1]!.chord;
  }
  return out;
}

export interface ChartLine {
  /** The bars of the line, `BARS_PER_LINE` at most (the last line and the pick-up line may be shorter). */
  bars: ChartBar[];
  /** The line of pick-up bars, before « mesure 1 ». */
  pickup: boolean;
}

/** Lines of four bars starting at « mesure 1 »; pick-up bars get a line of their own. */
export function chartLines(bars: readonly ChartBar[], perLine = BARS_PER_LINE): ChartLine[] {
  const lines: ChartLine[] = [];
  const pickup = bars.filter((b) => b.bar < 0);
  if (pickup.length) lines.push({ bars: pickup, pickup: true });
  const rest = bars.filter((b) => b.bar >= 0);
  for (let i = 0; i < rest.length; i += perLine) lines.push({ bars: rest.slice(i, i + perLine), pickup: false });
  return lines;
}

/** Bars covered by the loop (inclusive), or null when there is no loop to show. */
export function loopBars(map: TempoMap, region: TimeRange | null, enabled: boolean): { first: number; last: number } | null {
  return region && enabled ? barsOfRange(map, region) : null;
}

/** Bar index and progress through it (0…1) at a source time: drives the current-bar hairline. */
export function barProgress(map: TempoMap, time: Seconds): { bar: number; progress: number } {
  const pos = timeToBar(map, time);
  return { bar: pos.bar, progress: Math.min(1, Math.max(0, pos.beatInBar / pos.meter.numerator)) };
}

/** Source time of beat `beatInBar` (0-based) of bar `bar`. */
export function timeOfBeatInBar(map: TempoMap, bar: number, beatInBar: number): Seconds {
  return beatToTime(map, barToBeat(map, bar) + beatInBar);
}
