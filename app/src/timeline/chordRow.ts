// The « Accords » row of the ruler, as pure functions: which chords the row
// writes, and where. No DOM and no store (the widths of the labels are given by
// the caller, which measures them in the page); tested in `chordRow.test.ts`.
//
// What the row shows, from the chart's own bars (`store/chartSelectors.ts#
// selectChartBars`), so both views agree:
//   - a chord that repeats the one before it is not written again;
//   - zoomed in (stride 1) each chord stands at its beat, 9 px after the bar
//     line when it starts the bar (the mockup's `.accord` padding), and a second
//     chord of the bar goes at its own beat, or just after the first one when
//     they would touch; a chord that does not fit before the next bar's first
//     chord is left out (bar-first chords have priority);
//   - when the bars get narrow the whole row is first written smaller (18, then
//     16, then 14.5 px: the size of a bar with two chords, the least that stays
//     comfortable), all labels at once, before any chord is dropped;
//   - zoomed out further, where even the smallest size does not fit, the row
//     thins out as the bar numbers do, in a regular way: one label every 2, 4,
//     8… bars (the smallest stride that gives the widest label room), each
//     label being the chord in force at that bar line.
// Size and stride never depend on what is scrolled into view but on the zoom,
// the narrowest bar and the widest label of the piece, so nothing flickers
// while scrolling or playing.

import { MAX_LINES } from '../grid/lines';
import { barStartTime, timeToBar } from '../grid/tempoMap';
import { timeOfBeatInBar, type ChartBar } from '../chart/layout';
import { sameChord } from '../harmony/chord';
import type { ChordSymbol } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { barStride } from './geometry';

/** Space between the bar line and a chord that starts the bar (mockup `.accord`: 9 px). */
export const PAD_BAR_PX = 9;
/** Same for a chord that starts inside a bar (mockup `.accord.deux`: 6 px). */
export const PAD_MID_PX = 6;
/** Least space between two labels. */
export const LABEL_GAP_PX = 8;

/**
 * Font sizes of the row, from the comfortable one down to the smallest that is
 * still easy to read (the mockup's `.accord` and `.accord.deux`); the index is
 * the row's « size level ». A label of a bar with two chords is always the
 * smallest size.
 */
export const ROW_SIZES_PX = [18, 16, 14.5] as const;
export const SMALLEST_SIZE = ROW_SIZES_PX.length - 1;

/** One chord of the row. */
export interface RowChord {
  /** Stable identity: « bar:beat ». */
  id: string;
  chord: ChordSymbol | null;
  doubtful: boolean;
  bar: number;
  /** 0-based beat in the bar. */
  beatInBar: number;
  /** Source time of the beat on the grid in force. */
  time: Seconds;
  /** Ordering key: bar × 16 + beat in bar. */
  order: number;
  /** The bar holds several written chords: written smaller, as the mockup's `.accord.deux`. */
  small: boolean;
}

/** The bar-and-beat ordering key (a bar has at most seven beats). */
export const orderKey = (bar: number, beatInBar: number): number => bar * 16 + beatInBar;

/**
 * The chords the row writes, in order: those of the chart's bars without the
 * ones that only repeat the chord before.
 */
export function rowChords(bars: readonly ChartBar[], map: TempoMap): RowChord[] {
  const out: RowChord[] = [];
  let previous: ChordSymbol | null | undefined;
  for (const bar of bars) {
    const kept: RowChord[] = [];
    for (const c of bar.chords) {
      if (previous !== undefined && sameChord(previous, c.chord)) continue;
      previous = c.chord;
      kept.push({
        id: `${bar.bar}:${c.beatInBar}`,
        chord: c.chord,
        doubtful: c.doubtful,
        bar: bar.bar,
        beatInBar: c.beatInBar,
        time: c.beatInBar === 0 ? bar.start : timeOfBeatInBar(map, bar.bar, c.beatInBar),
        order: orderKey(bar.bar, c.beatInBar),
        small: false,
      });
    }
    if (kept.length > 1) for (const k of kept) k.small = true;
    out.push(...kept);
  }
  return out;
}

// ---------------------------------------------------------------- placement

export interface PlacedChord {
  item: RowChord;
  /** Left edge of the label, in pixels from the left edge of the view. */
  x: number;
  /** Width of the label, as measured. */
  width: number;
  /** Unique within one placement (a chord in force at several kept bars appears once per bar). */
  key: string;
}

export interface ChordRowInput {
  items: readonly RowChord[];
  map: TempoMap;
  /** Left edge of the view (source time), pixels per second and width of the view. */
  t0: Seconds;
  pps: number;
  viewW: number;
  /** Measured width of a label written at a size level, in CSS pixels. */
  widthOf: (item: RowChord, size: number) => number;
  /** Widest label of the piece at each size level (decides the size and the stride). */
  maxWidths: readonly number[];
  /** How far outside the view labels are still placed. */
  margin?: number;
}

export interface ChordRowPlacement {
  /** Size level of the whole row (index in `ROW_SIZES_PX`; 0 = the comfortable size). */
  size: number;
  /** 1 = every chord where it is; 2, 4, 8… = one label every n bars. */
  stride: number;
  placed: PlacedChord[];
}

/** Index of the first item whose order is >= `key` (items are ordered). */
function lowerBound(items: readonly RowChord[], key: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.order < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The item in force at the start of `bar`: the last one at or before the bar line. */
export function inForceAt(items: readonly RowChord[], bar: number): RowChord | null {
  const i = lowerBound(items, orderKey(bar, 0) + 1) - 1;
  return i >= 0 ? items[i]! : null;
}

/** Shortest bar of the piece up to `lastBar`, in seconds (cached per tempo map: it does not depend on the view). */
const shortestBars = new WeakMap<TempoMap, Map<number, number>>();
export function shortestBarSeconds(map: TempoMap, lastBar: number): number {
  let byLast = shortestBars.get(map);
  if (!byLast) shortestBars.set(map, (byLast = new Map()));
  const hit = byLast.get(lastBar);
  if (hit !== undefined) return hit;
  let shortest = Infinity;
  let prev = barStartTime(map, 0);
  const last = Math.min(Math.max(0, lastBar), MAX_LINES);
  for (let bar = 1; bar <= last + 1; bar++) {
    const t = barStartTime(map, bar);
    shortest = Math.min(shortest, t - prev);
    prev = t;
  }
  byLast.set(lastBar, shortest);
  return shortest;
}

/** Stride of the row for a spacing between bar lines and a widest label. */
export function chordStride(barGapPx: number, maxWidth: number): number {
  return barStride(barGapPx, maxWidth + LABEL_GAP_PX);
}

/**
 * Size level and stride for a spacing between bar lines and the widest label at
 * each size: the first (largest) size at which every chord fits, else the
 * smallest size with a stride.
 */
export function chooseRowSize(barGapPx: number, maxWidths: readonly number[]): { size: number; stride: number } {
  for (let size = 0; size < maxWidths.length; size++) {
    if (chordStride(barGapPx, maxWidths[size]!) === 1) return { size, stride: 1 };
  }
  const size = Math.max(0, maxWidths.length - 1);
  return { size, stride: chordStride(barGapPx, maxWidths[size] ?? 0) };
}

export function placeChordRow(input: ChordRowInput): ChordRowPlacement {
  const { items, map, t0, pps, viewW } = input;
  const margin = input.margin ?? 120;
  const placed: PlacedChord[] = [];
  if (items.length === 0 || !(pps > 0) || viewW <= 0) return { size: 0, stride: 1, placed };

  const ta = Math.max(0, t0 - margin / pps);
  const tb = t0 + (viewW + margin) / pps;
  const firstBar = timeToBar(map, ta).bar;
  const lastBar = timeToBar(map, tb).bar;
  // The whole piece decides (its narrowest bar, its widest label), never what is in view.
  const { size, stride } = chooseRowSize(shortestBarSeconds(map, items[items.length - 1]!.bar) * pps, input.maxWidths);
  const widthOf = (item: RowChord) => input.widthOf(item, size);
  const xOfTime = (t: Seconds) => (t - t0) * pps;
  const visible = (x: number, w: number) => x + w >= -margin && x <= viewW + margin;

  if (stride > 1) {
    // One label per kept bar line: the chord in force there, unless it is the one just before.
    let bar = Math.floor(firstBar / stride) * stride;
    let before = inForceAt(items, bar - stride);
    for (; bar <= lastBar; bar += stride) {
      const item = inForceAt(items, bar);
      const written = item !== null && !(before !== null && sameChord(before.chord, item.chord));
      if (item !== null) before = item;
      if (!written) continue;
      const w = widthOf(item);
      const x = xOfTime(barStartTime(map, bar)) + PAD_BAR_PX;
      if (visible(x, w)) placed.push({ item, x, width: w, key: `${item.id}@${bar}` });
    }
    return { size, stride, placed };
  }

  // Every chord where it is. Start a little before the view so a label that straddles the left edge is there.
  const from = Math.max(0, lowerBound(items, orderKey(firstBar, 0)) - 1);
  let lastEnd = -Infinity;
  for (let i = from; i < items.length; i++) {
    const item = items[i]!;
    if (item.bar > lastBar + 1) break;
    const w = widthOf(item);
    const first = item.beatInBar === 0;
    let x = xOfTime(item.time) + (first ? PAD_BAR_PX : PAD_MID_PX);
    if (!first) {
      x = Math.max(x, lastEnd + LABEL_GAP_PX);
      // Not before the next chord that starts a bar: that one has priority.
      let next = i + 1;
      while (next < items.length && items[next]!.beatInBar !== 0) next++;
      const nextBar = next < items.length ? items[next]! : null;
      if (nextBar && x + w + LABEL_GAP_PX > xOfTime(nextBar.time) + PAD_BAR_PX) continue;
    }
    lastEnd = x + w;
    if (visible(x, w)) placed.push({ item, x, width: w, key: item.id });
  }
  return { size, stride, placed };
}
