// Canvas drawing of the timeline: grid, waveform, ruler. Stateless functions
// that paint the visible time range [t0, t0 + w / pps] on a canvas already
// scaled by the device pixel ratio (coordinates are CSS pixels).

import {
  MAX_LINES,
  barsOfRange,
  isSubGridVisible,
  subGridLines,
  type SubGridOptions,
} from '../grid/lines';
import { barStartTime, nominalBpm, timeToBar } from '../grid/tempoMap';
import { tempoCurve, type TempoPoint } from '../grid/tempoCurve';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import {
  MIN_BAR_LABEL_GAP_PX,
  MIN_BAR_LINE_GAP_PX,
  barKept,
  barNumber,
  barStride,
  tempoRange,
} from './geometry';
import { columnPeaks, type PeakPyramid } from './peaks';
import { RULER_ROW_HEIGHT } from './layout';

export interface Colors {
  papier: string;
  papierFonce: string;
  trait: string;
  traitFin: string;
  encre: string;
  encreDouce: string;
  /** Bar lines on the lanes: ink at 26 %. */
  barre: string;
  /** Bar ticks inside the loop band. */
  barreBoucle: string;
}

export const DEFAULT_COLORS: Colors = {
  papier: '#f4ecdf',
  papierFonce: '#eadfcd',
  trait: '#d8c8b0',
  traitFin: '#e6dac6',
  encre: '#2b1f17',
  encreDouce: '#6a5646',
  barre: 'rgba(43, 31, 23, 0.26)',
  barreBoucle: 'rgba(43, 31, 23, 0.25)',
};

/** Reads the design tokens (they never change at run time, so once is enough). */
export function readColors(el: Element): Colors {
  const style = getComputedStyle(el);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    papier: get('--papier', DEFAULT_COLORS.papier),
    papierFonce: get('--papier-fonce', DEFAULT_COLORS.papierFonce),
    trait: get('--trait', DEFAULT_COLORS.trait),
    traitFin: get('--trait-fin', DEFAULT_COLORS.traitFin),
    encre: get('--encre', DEFAULT_COLORS.encre),
    encreDouce: get('--encre-douce', DEFAULT_COLORS.encreDouce),
    barre: get('--barre', DEFAULT_COLORS.barre),
    barreBoucle: DEFAULT_COLORS.barreBoucle,
  };
}

export interface ViewFrame {
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
  t0: Seconds;
  pps: number;
}

/** A 1 CSS px vertical line, aligned on device pixels so it stays crisp at any ratio. */
function vline(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, dpr: number): void {
  ctx.fillRect(Math.round(x * dpr) / dpr, y0, 1, y1 - y0);
}

// ---------------------------------------------------------------- bars in view

interface BarMark {
  bar: number;
  time: Seconds;
}

/**
 * The bars touching [ta, tb]: the one that contains `ta` (it may start before)
 * through the first one starting after `tb`, so spacings are known at the edges.
 */
export function barsInView(map: TempoMap, ta: Seconds, tb: Seconds): BarMark[] {
  const out: BarMark[] = [];
  for (let bar = timeToBar(map, ta).bar; out.length < MAX_LINES; bar++) {
    const time = barStartTime(map, bar);
    out.push({ bar, time });
    if (time > tb) break;
  }
  return out;
}

/** Smallest spacing between two consecutive bar lines, in pixels. */
export function minBarGapPx(bars: BarMark[], pps: number): number {
  let gap = Infinity;
  for (let i = 1; i < bars.length; i++) gap = Math.min(gap, (bars[i]!.time - bars[i - 1]!.time) * pps);
  return gap;
}

// ---------------------------------------------------------------- grid

export interface GridParams extends ViewFrame, SubGridOptions {
  map: TempoMap;
  duration: Seconds;
  colors: Colors;
}

/** Bar lines (ink at 26 %) and, while they are 5 px apart or more, the sub-grid. Lines stop at the end of the piece. */
export function drawGrid(ctx: CanvasRenderingContext2D, p: GridParams): void {
  const { w, h, dpr, t0, pps, map, duration } = p;
  ctx.clearRect(0, 0, w, h);
  const ta = Math.max(0, t0);
  const tb = Math.min(duration, t0 + w / pps);
  if (!(tb > ta)) return;

  if (isSubGridVisible(map, pps, p)) {
    ctx.fillStyle = p.colors.traitFin;
    for (const line of subGridLines(map, ta, tb, p)) vline(ctx, (line.time - t0) * pps, 0, h, dpr);
  }

  const bars = barsInView(map, ta, tb);
  const stride = barStride(minBarGapPx(bars, pps), MIN_BAR_LINE_GAP_PX);
  ctx.fillStyle = p.colors.barre;
  for (const { bar, time } of bars) {
    if (time < ta || time > tb || !barKept(bar, stride)) continue;
    vline(ctx, (time - t0) * pps, 0, h, dpr);
  }
}

// ---------------------------------------------------------------- waveform

const WAVE_MARGIN = 7;
/** Display curve: quiet passages stay readable (a pure power law, 1 = linear). */
const WAVE_CURVE = 0.8;
/** Loudest gain applied by the per-track normalisation. */
const MAX_GAIN = 8;

let scratchPeak = new Float32Array(0);
let scratchRms = new Float32Array(0);

export interface WaveParams extends ViewFrame {
  pyramid: PeakPyramid;
  color: string;
}

/** Display gain of a track: its loudest peak reaches the lane's full height. */
export function waveGain(maxPeak: number): number {
  return Math.min(MAX_GAIN, 1 / Math.max(maxPeak, 1e-4));
}

/**
 * Two tones as in the mockup: light crests (the peak envelope, 38 %) and the
 * solid body (the RMS envelope, 95 %), mirrored around the lane's middle.
 */
export function drawWave(ctx: CanvasRenderingContext2D, p: WaveParams): void {
  const { w, h, dpr, t0, pps, pyramid } = p;
  ctx.clearRect(0, 0, w, h);
  const perPx = dpr >= 1.5 ? 2 : 1;
  const columns = Math.ceil(w * perPx) + 1;
  if (scratchPeak.length < columns) {
    scratchPeak = new Float32Array(columns);
    scratchRms = new Float32Array(columns);
  }
  columnPeaks(pyramid, t0, 1 / (pps * perPx), columns, scratchPeak, scratchRms);

  let first = 0;
  while (first < columns && scratchPeak[first]! < 0) first++;
  let last = columns - 1;
  while (last >= first && scratchPeak[last]! < 0) last--;
  if (last <= first) return;

  const gain = waveGain(pyramid.maxPeak);
  const mid = h / 2;
  const reach = Math.max(2, h / 2 - WAVE_MARGIN);
  const stepX = 1 / perPx;
  const level = (v: number) => Math.min(1, Math.pow(Math.min(1, v * gain), WAVE_CURVE));

  const trace = (values: Float32Array, alpha: number, minHalf: number) => {
    ctx.beginPath();
    ctx.moveTo(first * stepX, mid);
    for (let i = first; i <= last; i++) ctx.lineTo(i * stepX, mid - Math.max(minHalf, level(values[i]!) * reach));
    for (let i = last; i >= first; i--) ctx.lineTo(i * stepX, mid + Math.max(minHalf, level(values[i]!) * reach));
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fill();
  };
  ctx.fillStyle = p.color;
  trace(scratchPeak, 0.38, 0.5);
  trace(scratchRms, 0.95, 0);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- ruler

export interface RulerParams extends ViewFrame {
  map: TempoMap;
  duration: Seconds;
  loop: TimeRange | null;
  /** The loop is on: bars inside it are printed in full ink. */
  loopEnabled: boolean;
  colors: Colors;
  /** Y of the tempo row (0), of the chords row (null when there are no chords) and of the bars row. */
  tempoTop: number;
  accordsTop: number | null;
  /** Stride of the chord row (`chordRow.ts`): its bar lines follow it, so no line cuts through a label. */
  chordStride?: number;
  mesuresTop: number;
}

export function drawRuler(ctx: CanvasRenderingContext2D, p: RulerParams): void {
  ctx.clearRect(0, 0, p.w, p.h);
  drawTempoRow(ctx, p);
  if (p.accordsTop !== null) drawChordsRow(ctx, p, p.accordsTop);
  drawBarsRow(ctx, p);
}

// ---------------------------------------------------------------- tempo curve

/** Under this spread (BPM) a tempo curve is a constant tempo: a flat line, no dots. */
const FLAT_SPREAD_BPM = 0.5;
/** Points closer than this (px) are thinned out of the line; dots need more room. */
const MIN_POINT_GAP_PX = 3;
const MIN_DOT_GAP_PX = 24;

interface WholeCurve {
  points: TempoPoint[];
  firstBar: number;
  lo: number;
  hi: number;
  flat: boolean;
  nominal: number;
}

const curves = new WeakMap<TempoMap, Map<Seconds, WholeCurve>>();

/**
 * The tempo curve of the whole piece, one point per bar, with the scale it is
 * drawn on. Computed once per map: the scale must not change while scrolling.
 */
export function wholeCurve(map: TempoMap, duration: Seconds): WholeCurve {
  let byDuration = curves.get(map);
  if (!byDuration) curves.set(map, (byDuration = new Map()));
  const hit = byDuration.get(duration);
  if (hit) return hit;
  const points = tempoCurve(map, 0, duration);
  const nominal = nominalBpm(map, duration);
  let min = nominal;
  let max = nominal;
  let spread = 0;
  for (const pt of points) {
    min = Math.min(min, pt.bpm);
    max = Math.max(max, pt.bpm);
  }
  for (const pt of points) spread = Math.max(spread, Math.abs(pt.bpm - points[0]!.bpm));
  const { lo, hi } = tempoRange([min, max]);
  const curve: WholeCurve = { points, firstBar: points[0]?.bar ?? 0, lo, hi, flat: spread < FLAT_SPREAD_BPM, nominal };
  byDuration.set(duration, curve);
  return curve;
}

/**
 * The tempo row, as in the mockup: a dotted reference at the tempo of the
 * piece, and over it the thin ink curve, one point per bar (the bar's average
 * tempo, at the middle of the bar), joined smoothly, with a small dot on the
 * bars that have room for one. A constant tempo is a flat line, no dots.
 */
function drawTempoRow(ctx: CanvasRenderingContext2D, p: RulerParams): void {
  const { w, t0, pps, map, duration } = p;
  const top = p.tempoTop;
  const h = RULER_ROW_HEIGHT.tempo;
  const curve = wholeCurve(map, duration);
  if (curve.points.length === 0) return;
  const y = (bpm: number) => top + h - 6 - ((bpm - curve.lo) / (curve.hi - curve.lo)) * (h - 12);
  const xMin = Math.max(0, (0 - t0) * pps);
  const xMax = Math.min(w, (duration - t0) * pps);
  if (xMax <= xMin) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(xMin, top, xMax - xMin, h);
  ctx.clip();

  ctx.strokeStyle = p.colors.trait;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  const yRef = Math.round(y(curve.nominal)) + 0.5;
  ctx.moveTo(xMin, yRef);
  ctx.lineTo(xMax, yRef);
  ctx.stroke();
  ctx.setLineDash([]);

  // The points around the view (one more on each side, so the curve enters and leaves smoothly).
  const { points, firstBar } = curve;
  const ta = Math.max(0, t0);
  const tb = Math.min(duration, t0 + w / pps);
  const i0 = Math.max(0, timeToBar(map, ta).bar - firstBar - 1);
  const i1 = Math.min(points.length - 1, timeToBar(map, tb).bar - firstBar + 1);
  let gap = Infinity;
  for (let i = i0; i <= i1; i++) gap = Math.min(gap, (points[i]!.end - points[i]!.start) * pps);
  const lineStride = barStride(gap, MIN_POINT_GAP_PX);
  const dotStride = barStride(gap, MIN_DOT_GAP_PX);
  const kept: { x: number; y: number; bar: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    const pt = points[i]!;
    if (!barKept(pt.bar, lineStride)) continue;
    kept.push({ x: ((pt.start + pt.end) / 2 - t0) * pps, y: y(pt.bpm), bar: pt.bar });
  }
  if (kept.length === 0) {
    ctx.restore();
    return;
  }

  ctx.strokeStyle = p.colors.encreDouce;
  ctx.fillStyle = p.colors.encreDouce;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const first = kept[0]!;
  ctx.moveTo(Math.min(first.x, xMin), first.y);
  ctx.lineTo(first.x, first.y);
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1]!;
    const b = kept[i]!;
    const cx = (a.x + b.x) / 2;
    ctx.bezierCurveTo(cx, a.y, cx, b.y, b.x, b.y);
  }
  const last = kept[kept.length - 1]!;
  ctx.lineTo(Math.max(last.x, xMax), last.y);
  ctx.stroke();

  if (!curve.flat) {
    for (const d of kept) {
      if (!barKept(d.bar, dotStride) || d.x < xMin + 2 || d.x > xMax - 2) continue;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- chords row

/** The faint bar lines behind the chord labels (the mockup's `.accord` left border). */
function drawChordsRow(ctx: CanvasRenderingContext2D, p: RulerParams, top: number): void {
  const { w, dpr, t0, pps, map, duration } = p;
  const ta = Math.max(0, t0);
  const tb = Math.min(duration, t0 + w / pps);
  if (!(tb > ta)) return;
  const bars = barsInView(map, ta, tb);
  const stride = Math.max(p.chordStride ?? 1, barStride(minBarGapPx(bars, pps), MIN_BAR_LINE_GAP_PX));
  ctx.fillStyle = p.colors.traitFin;
  for (const { bar, time } of bars) {
    if (time < ta || time > tb || !barKept(bar, stride)) continue;
    vline(ctx, (time - t0) * pps, top, top + RULER_ROW_HEIGHT.accords, dpr);
  }
}

export const RULER_FONT = '600 11px "Instrument Sans", "Helvetica Neue", Arial, sans-serif';

/** Bar ticks and numbers of the « Mesures » row, thinned out regularly when crowded. */
function drawBarsRow(ctx: CanvasRenderingContext2D, p: RulerParams): void {
  const { w, dpr, t0, pps, map, duration } = p;
  const top = p.mesuresTop;
  const h = RULER_ROW_HEIGHT.mesures;
  const ta = Math.max(0, t0);
  const tb = Math.min(duration, t0 + w / pps);
  if (!(tb > ta)) return;
  const bars = barsInView(map, ta, tb);
  const gap = minBarGapPx(bars, pps);
  const tickStride = barStride(gap, MIN_BAR_LINE_GAP_PX);
  const labelStride = Math.max(tickStride, barStride(gap, MIN_BAR_LABEL_GAP_PX));
  const loopBars = p.loop && p.loopEnabled ? barsOfRange(map, p.loop) : null;
  const inLoop = (bar: number) => loopBars !== null && bar >= loopBars.first && bar <= loopBars.last;

  ctx.font = RULER_FONT;
  ctx.textBaseline = 'middle';
  for (const { bar, time } of bars) {
    const x = (time - t0) * pps;
    if (x > w) break;
    if (!barKept(bar, tickStride)) continue;
    if (time >= ta) {
      ctx.fillStyle = inLoop(bar) ? p.colors.barreBoucle : p.colors.trait;
      vline(ctx, x, top, top + h, dpr);
    }
    if (!barKept(bar, labelStride)) continue;
    const text = String(barNumber(bar));
    const width = ctx.measureText(text).width;
    let tx = x + 9;
    if (tx < 4) {
      // The bar started off to the left: its number stays in view while the bar does.
      const end = (barStartTime(map, bar + labelStride) - t0) * pps;
      tx = 4;
      if (end - tx < width + 8) continue;
    }
    ctx.fillStyle = inLoop(bar) ? p.colors.encre : p.colors.encreDouce;
    ctx.fillText(text, tx, top + h / 2 + 0.5);
  }
}
