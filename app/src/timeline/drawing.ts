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
import { barStartTime, bpmAt, nominalBpm, timeToBar } from '../grid/tempoMap';
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
  /** Y of the tempo row (0) and of the bars row. */
  tempoTop: number;
  mesuresTop: number;
}

export function drawRuler(ctx: CanvasRenderingContext2D, p: RulerParams): void {
  ctx.clearRect(0, 0, p.w, p.h);
  drawTempoRow(ctx, p);
  drawBarsRow(ctx, p);
}

/**
 * The tempo line, as in the mockup: a dashed reference at the tempo of the
 * piece and the solid curve with a dot where the tempo changes. A constant
 * tempo is a flat line, in the middle of the row.
 */
function drawTempoRow(ctx: CanvasRenderingContext2D, p: RulerParams): void {
  const { w, t0, pps, map, duration } = p;
  const top = p.tempoTop;
  const h = RULER_ROW_HEIGHT.tempo;
  const bpms = map.segments.map((s) => s.bpm);
  const { lo, hi } = tempoRange(bpms);
  const y = (bpm: number) => top + h - 6 - ((bpm - lo) / (hi - lo)) * (h - 12);
  const xMin = Math.max(0, (0 - t0) * pps);
  const xMax = Math.min(w, (duration - t0) * pps);
  if (xMax <= xMin) return;

  ctx.strokeStyle = p.colors.trait;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(xMin, Math.round(y(nominalBpm(map, duration))) + 0.5);
  ctx.lineTo(xMax, Math.round(y(nominalBpm(map, duration))) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Segments overlapping the view.
  ctx.strokeStyle = p.colors.encreDouce;
  ctx.fillStyle = p.colors.encreDouce;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const startBpm = bpmAt(map, Math.max(0, t0));
  ctx.moveTo(xMin, y(startBpm));
  let prevBpm = startBpm;
  const dots: [number, number][] = [];
  for (const seg of map.segments) {
    const x = (seg.time - t0) * pps;
    if (seg.time <= Math.max(0, t0) || seg.time >= duration) continue;
    if (x > w + 12) break;
    const r = Math.min(8, Math.max(2, (x - xMin) / 2));
    ctx.lineTo(x - r, y(prevBpm));
    ctx.bezierCurveTo(x, y(prevBpm), x, y(seg.bpm), x + r, y(seg.bpm));
    dots.push([x, y(seg.bpm)]);
    prevBpm = seg.bpm;
  }
  ctx.lineTo(xMax, y(prevBpm));
  ctx.stroke();
  for (const [x, yy] of dots) {
    ctx.beginPath();
    ctx.arc(x, yy, 2, 0, Math.PI * 2);
    ctx.fill();
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
