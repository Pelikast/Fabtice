// Layout of the « Grille d'accords », as pure functions (tested in
// layout.test.ts): which chords are in force (analysis and hand corrections
// merged), which bar each falls in, section letters and double bars, lines of
// four bars. Nothing here knows about React, the store or the screen.
//
// Chords and sections are stored in source time (seconds). Here they are put
// on the grid in force: a chord goes to the NEAREST BEAT, a section to the
// NEAREST BAR LINE. That is how they stay with the music when the grid is
// corrected (first beat moved, tempo doubled…).
//
// Signatures bar by bar (C13): a beat is a beat of the bar's own signature
// (the eighths of a 6/8 bar in a 4/4 piece), every bar keeps the width of the
// others whatever its length (as in a Real Book), and the signature is
// written in the bar where it changes, and in the first bar when the piece
// has more than one.

import { approachTargets } from '../harmony/chord';
import { barBeatToBeat, barStartTime, barToBeat, beatToBar, beatToTime, meterAtBar, sameMeter, timeToBar, timeToBeat } from '../grid/tempoMap';
import { loopCoverage, type LoopCoverage } from '../grid/loops';
import type { AnalysedChord } from '../model/analysis';
import type { Corrections, SectionMark } from '../model/corrections';
import type { ChordSymbol, Key, KeyChange } from '../model/harmony';
import type { Seconds, TimeRange } from '../model/project';
import type { Meter, TempoMap } from '../model/tempoMap';

/** Bars per line of the chart (DESIGN.md, mockup). */
export const BARS_PER_LINE = 4;

/** A chord in force, wherever it comes from. */
export interface ChartChord {
  /** Stored position (source time). */
  time: Seconds;
  /** Nearest beat of the grid in force (map beats from the first downbeat; a beat of its bar's own signature, so fractional after a 7/8 bar). */
  beat: number;
  chord: ChordSymbol | null;
  origin: 'analysis' | 'manual';
  /** Analysis only (null for a hand chord). */
  confidence: number | null;
  doubtful: boolean;
  /** Analysis' next best readings (empty for a hand chord). */
  alternatives: ChordSymbol[];
}

/** The beat nearest `time`, a beat of the bar's own signature, as a map beat position. */
export function nearestBeat(map: TempoMap, time: Seconds): number {
  const beat = timeToBeat(map, time);
  if (map.meters.length === 1) return Math.round(beat);
  const pos = beatToBar(map, beat);
  const k = Math.round(pos.beatInBar);
  return k >= pos.meter.numerator ? barToBeat(map, pos.bar + 1) : barBeatToBeat(map, pos.bar, k);
}

const sameBeat = (a: number, b: number) => Math.abs(a - b) < 1e-9;

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
    if (unique.length && sameBeat(unique[unique.length - 1]!.beat, c.beat)) unique[unique.length - 1] = c;
    else unique.push(c);
  }
  return unique;
}

/** A chord as placed in its bar. */
export interface BarChord extends ChartChord {
  /** 0-based beat in the bar where it starts (0 = on the bar line). */
  beatInBar: number;
  /**
   * The chord it goes to, when one is known (`harmony/chord.ts#approachTargets`: the next chord of
   * another root, across bar lines; absent at the end and before a « N.C. »): what spells a chord that
   * slides down a half step to it (« B♭7 » before Am7).
   */
  next?: ChordSymbol;
}

export interface ChartBar {
  /** Bar index (0 = « mesure 1 », negative = pick-up). */
  bar: number;
  start: Seconds;
  end: Seconds;
  /** Beats in this bar (the numerator of its signature). */
  beats: number;
  /** Its signature. */
  meter: Meter;
  /**
   * The signature written in the bar: where it changes, and in the first bar
   * of the chart when the piece has more than one; null elsewhere (a piece
   * with one signature has it in the title line only).
   */
  signature: Meter | null;
  /** Chords starting in this bar, in order. */
  chords: BarChord[];
  /** No chord starts here but one is going on: the chart writes the bar-repeat sign. */
  repeat: boolean;
  /** Section letter starting at this bar, or null. */
  section: string | null;
  /** A double bar line before this bar: a section starts here and it is not the first bar of the chart. */
  doubleBar: boolean;
  /**
   * C10: a later key passage in force starts at this bar (the bar line nearest the change, as for a
   * section): the new key, as stored (concert pitch, original key); null elsewhere. The chart, the
   * ruler and the print write it above the bar; the bars from here on are spelled in it.
   */
  keyChange: Key | null;
}

export interface ChartInput {
  map: TempoMap;
  chords: readonly ChartChord[];
  sections: readonly SectionMark[];
  /** Length of the piece: the chart goes to the bar that contains its end. */
  duration: Seconds;
  /** C10: the modulations in force (`store/keySelectors.ts#keyChangesInForce`), ascending; none when absent. */
  keyChanges?: readonly KeyChange[];
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
export function chartBars({ map, chords, sections, duration, keyChanges = [] }: ChartInput): ChartBar[] {
  const byBar = new Map<number, BarChord[]>();
  let first = 0;
  let last = Math.max(0, timeToBar(map, Math.max(0, duration - 1e-6)).bar);
  const targets = approachTargets(chords.map((c) => c.chord));
  for (const [i, c] of chords.entries()) {
    const pos = beatToBar(map, c.beat);
    const list = byBar.get(pos.bar) ?? [];
    const next = targets[i];
    list.push({ ...c, beatInBar: Math.round(pos.beatInBar), ...(next ? { next } : {}) });
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
  // A modulation belongs to the bar line nearest to it (the last one wins when two land on the same bar).
  const keyAt = new Map<number, Key>();
  for (const k of keyChanges) keyAt.set(sectionBar(map, k.time), k.key);
  // The chord going on when the chart starts (a chord before the first bar shown cannot exist: `first` covers them).
  let going: ChordSymbol | null | undefined;
  const out: ChartBar[] = [];
  const several = map.meters.length > 1;
  let previous: Meter | null = null;
  for (let bar = first; bar <= last; bar++) {
    const own = byBar.get(bar) ?? [];
    const section = sectionAt.get(bar) ?? null;
    const meter = meterAtBar(map, bar);
    const written = several && (previous === null || !sameMeter(previous, meter));
    previous = meter;
    out.push({
      bar,
      start: barStartTime(map, bar),
      end: barStartTime(map, bar + 1),
      beats: meter.numerator,
      meter: { ...meter },
      signature: written ? { ...meter } : null,
      chords: own,
      repeat: own.length === 0 && going !== undefined && going !== null,
      section,
      doubleBar: section !== null && bar !== first,
      keyChange: bar > first ? (keyAt.get(bar) ?? null) : null,
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

/**
 * Bars touched by the loop (inclusive) and how much of the first and last
 * one is inside it (fractions of the bar), or null when there is no loop to show.
 */
export function loopBars(map: TempoMap, region: TimeRange | null, enabled: boolean): LoopCoverage | null {
  return region && enabled ? loopCoverage(map, region) : null;
}

/** The part of bar `bar` that is looped, as fractions of its width (a whole bar: 0 to 1), or null when none of it is. */
export function loopedPart(loop: LoopCoverage | null, bar: number): { from: number; to: number } | null {
  if (!loop || bar < loop.first || bar > loop.last) return null;
  return { from: bar === loop.first ? loop.from : 0, to: bar === loop.last ? loop.to : 1 };
}

/** The loop coverage as a string and back: a selector must return something React can compare. */
export const loopKey = (l: LoopCoverage | null): string => (l ? `${l.first}:${l.last}:${l.from}:${l.to}` : '');
export function loopFromKey(key: string): LoopCoverage | null {
  if (!key) return null;
  const [first, last, from, to] = key.split(':').map(Number) as [number, number, number, number];
  return { first, last, from, to };
}

/** Bar index and progress through it (0…1) at a source time: drives the current-bar hairline. */
export function barProgress(map: TempoMap, time: Seconds): { bar: number; progress: number } {
  const pos = timeToBar(map, time);
  return { bar: pos.bar, progress: Math.min(1, Math.max(0, pos.beatInBar / pos.meter.numerator)) };
}

/** Source time of beat `beatInBar` (0-based) of bar `bar`. */
export function timeOfBeatInBar(map: TempoMap, bar: number, beatInBar: number): Seconds {
  return beatToTime(map, barBeatToBeat(map, bar, beatInBar));
}

/**
 * The chord going on at the start of bar `bar` (the last one written before
 * it); undefined when none, null when the last one is « N.C. ».
 */
export function chordGoingOn(bars: readonly ChartBar[], bar: number): ChordSymbol | null | undefined {
  let going: ChordSymbol | null | undefined;
  for (const b of bars) {
    if (b.bar >= bar) break;
    if (b.chords.length) going = b.chords[b.chords.length - 1]!.chord;
  }
  return going;
}
