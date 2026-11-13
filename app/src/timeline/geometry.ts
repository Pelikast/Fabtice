// Pure maths of the timeline: the visible time range, zoom anchoring, Auto
// fitting, following the playhead, bar thinning and the hit-testing of loop
// selection. No DOM, no store: everything is in source seconds and CSS pixels,
// and everything is tested in `geometry.test.ts`.
//
// The view is described by `t0` (source time at the left edge of the lanes)
// and `pps` (pixels per second): x = (t - t0) * pps.

import { barsOfRange, loopFromBars } from '../grid/lines';
import { barToBeat, clamp, timeToBar, timeToBeat } from '../grid/tempoMap';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { clampScale, clampTrackHeight } from '../view/zoom';

// ---------------------------------------------------------------- scroll and zoom

export const timeToX = (t: Seconds, t0: Seconds, pps: number): number => (t - t0) * pps;
export const xToTime = (x: number, t0: Seconds, pps: number): Seconds => t0 + x / pps;

/** Keeps the view inside the piece: the left edge never goes before 0 nor past the last full page. */
export function clampT0(t0: Seconds, duration: Seconds, viewW: number, pps: number): Seconds {
  const max = Math.max(0, duration - viewW / pps);
  return clamp(t0, 0, max);
}

/** New left edge after a scale change that keeps the time under `anchorX` where it is. */
export function zoomAround(t0: Seconds, pps: number, nextPps: number, anchorX: number): Seconds {
  const anchorTime = t0 + anchorX / pps;
  return anchorTime - anchorX / nextPps;
}

/**
 * Where a zoom made with the sliders is anchored: the playhead when it is in
 * view, else the middle of the view.
 */
export function sliderAnchorX(position: Seconds, t0: Seconds, pps: number, viewW: number): number {
  const x = timeToX(position, t0, pps);
  return x >= 0 && x <= viewW ? x : viewW / 2;
}

/** Wheel zoom factor: ctrl/⌘ + wheel and trackpad pinch (deltaY in pixels). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -40, 40) * 0.012);
}

/** Wheel deltas in pixels, whatever the unit the browser reports. */
export function wheelPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

// ---------------------------------------------------------------- Auto

export interface FitInput {
  duration: Seconds;
  /** Width of the lanes column, CSS pixels. */
  viewW: number;
  /** Height of the vertical scroller. */
  viewH: number;
  trackCount: number;
  rulerHeight: number;
  /** Room kept under the last track (display tools). */
  foot: number;
}

/**
 * Scale and lane height that show the whole piece and all the tracks without
 * overflow, within the limits of the zoom sliders. When a limit stops the fit
 * (a very long piece in a narrow window) the view just overflows and scrolls.
 */
export function fitToView(input: FitInput): { pxPerSecond: number; trackHeight: number } | null {
  const { duration, viewW, viewH, trackCount, rulerHeight, foot } = input;
  if (!(duration > 0) || viewW <= 0 || viewH <= 0 || trackCount <= 0) return null;
  const pxPerSecond = clampScale(viewW / duration);
  const trackHeight = clampTrackHeight(Math.floor((viewH - rulerHeight - foot) / trackCount));
  return { pxPerSecond, trackHeight };
}

/** Phone default: one bar is 86 px wide. */
export function pxPerSecondForBarWidth(barWidth: number, barSeconds: Seconds): number {
  return clampScale(barWidth / barSeconds);
}

// ---------------------------------------------------------------- following the playhead

export interface FollowInput {
  t0: Seconds;
  position: Seconds;
  pps: number;
  viewW: number;
  duration: Seconds;
  /** The playhead turns the page when it gets within this many pixels of the right edge. */
  edgePx?: number;
  /** After the turn, the playhead sits this many pixels from the left edge. */
  leadPx?: number;
}

export const FOLLOW_EDGE_PX = 28;

/**
 * Turns the page: the new left edge when the playhead left the view (passed the
 * right edge, or wrapped back before the left one), null when it is fine.
 */
export function followT0(input: FollowInput): Seconds | null {
  const { t0, position, pps, viewW, duration } = input;
  const edge = input.edgePx ?? FOLLOW_EDGE_PX;
  const lead = input.leadPx ?? Math.min(viewW * 0.12, 120);
  const x = timeToX(position, t0, pps);
  if (x >= 0 && x <= viewW - edge) return null;
  const next = clampT0(position - lead / pps, duration, viewW, pps);
  return Math.abs(next - t0) < 1e-9 ? null : next;
}

// ---------------------------------------------------------------- bar thinning

/** Spacing under which bar lines are thinned out. */
export const MIN_BAR_LINE_GAP_PX = 6;
/** Spacing a bar number needs (digits, left padding and some air). */
export const MIN_BAR_LABEL_GAP_PX = 40;

/**
 * Regular thinning of bars when they get crowded: the smallest power of two
 * (1, 2, 4, 8…) that brings the spacing of the kept bars to `minGapPx`.
 */
export function barStride(gapPx: number, minGapPx: number): number {
  if (!(gapPx > 0)) return 1 << 30;
  let stride = 1;
  while (gapPx * stride < minGapPx && stride < 1 << 30) stride *= 2;
  return stride;
}

/** True for the bars kept by a stride (bar 0, « mesure 1 », is always kept). */
export function barKept(bar: number, stride: number): boolean {
  return (((bar % stride) + stride) % stride) === 0;
}

/** Displayed number of a bar index (the pick-up bar before « mesure 1 » reads 0). */
export const barNumber = (bar: number): number => bar + 1;

// ---------------------------------------------------------------- loop selection

export const DRAG_THRESHOLD_PX = 4;
/** Grab distance of a loop edge: precise with a mouse, wider for a finger. */
export const EDGE_GRAB_PX = { mouse: 6, touch: 14 } as const;

export type LoopEdge = 'start' | 'end';

/** Which edge of the loop (in pixels) a pointer at `x` grabs, if any; the nearest wins. */
export function hitLoopEdge(x: number, startX: number, endX: number, tolerance: number): LoopEdge | null {
  const ds = Math.abs(x - startX);
  const de = Math.abs(x - endX);
  if (ds > tolerance && de > tolerance) return null;
  return ds <= de ? 'start' : 'end';
}

/** The bar under a time, the time clamped to the piece (the last bar stays selectable). */
export function barAtTime(map: TempoMap, t: Seconds, duration: Seconds): number {
  return timeToBar(map, clamp(t, 0, Math.max(0, duration - 1e-6))).bar;
}

/** Loop from the bar where a drag started to the bar where it is now (either order). */
export function loopFromDrag(map: TempoMap, startTime: Seconds, nowTime: Seconds, duration: Seconds): TimeRange {
  return loopFromBars(map, barAtTime(map, startTime, duration), barAtTime(map, nowTime, duration));
}

/** Index of the bar line nearest to a time (bar `n` starts at line `n`). */
export function nearestBarLine(map: TempoMap, t: Seconds): number {
  const beat = timeToBeat(map, t);
  const { bar } = timeToBar(map, t);
  const here = barToBeat(map, bar);
  const next = barToBeat(map, bar + 1);
  return beat - here <= next - beat ? bar : bar + 1;
}

/**
 * Loop after dragging one of its edges to time `t`, bar by bar: the edge goes
 * to the nearest bar line, and the loop keeps at least one bar.
 */
export function adjustLoopEdge(map: TempoMap, region: TimeRange, edge: LoopEdge, t: Seconds, duration: Seconds): TimeRange {
  const { first, last } = barsOfRange(map, region);
  let line = nearestBarLine(map, clamp(t, 0, duration));
  if (edge === 'start') {
    line = Math.min(line, last); // at least bar `last` remains
    return loopFromBars(map, line, last);
  }
  line = Math.max(line, first + 1); // the end line comes after the first bar
  return loopFromBars(map, first, line - 1);
}

// ---------------------------------------------------------------- tempo curve

/** Tempo range mapped onto the tempo row: at least 8 BPM tall and centred, so a constant tempo is a flat line in the middle. */
export function tempoRange(bpms: number[]): { lo: number; hi: number } {
  const lo = Math.min(...bpms);
  const hi = Math.max(...bpms);
  const span = Math.max(hi - lo, 8);
  const mid = (hi + lo) / 2;
  return { lo: mid - span / 2, hi: mid + span / 2 };
}
