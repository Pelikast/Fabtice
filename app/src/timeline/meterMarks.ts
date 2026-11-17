// Time signatures on the ruler of « Pistes » (C13): where each one is written in the « Mesures » row, and
// whether it fits. Pure and allocation-free once warm (the pool is reused), because the ruler is redrawn on
// every frame of a scroll or a zoom.
//
// The rule is the chord chart's (`chart/layout.ts`): a signature is written at the bar where it changes, and at
// bar 1 when the piece has more than one; a piece with a single signature shows nothing. The figures are
// stacked, as on paper, right of the bar line; the bar's number moves right to make room. A signature that
// does not fit inside its bar (with a small margin before the next bar line) is left out: never an overlap.

import { barStartTime } from '../grid/tempoMap';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import type { MeterChangeView } from '../store/meterActions';

/** The figures' font: the chart's (`--titre`), bolder than the bar numbers so that they read as a signature. */
export const SIGNATURE_FONT = '600 12px "Fraunces", "Iowan Old Style", Georgia, serif';
/** Space between the bar line and the figures (the bar numbers use the same). */
export const SIGNATURE_PAD_PX = 9;
/** Space kept between the figures and what follows (the bar number, the next bar line). */
export const SIGNATURE_GAP_PX = 8;
/** Where a signature sticks to when its bar started off to the left of the view. */
const STICK_PX = 4;

export interface MeterMark {
  bar: number;
  numerator: number;
  denominator: number;
  /** Left edge of the figures, in CSS pixels of the ruler. */
  x: number;
  /** Width of the wider figure. */
  width: number;
  /** X of the bar's end (the next bar line). */
  end: number;
}

/** The marks of one drawing, in a pool reused from frame to frame (`count` of them are valid). */
export class MeterMarkSet {
  readonly items: MeterMark[] = [];
  count = 0;
}

const NONE: readonly MeterChangeView[] = [];

/** The signatures to consider: none unless the piece has more than one (as the chart does). */
export function meterMarkViews(list: readonly MeterChangeView[]): readonly MeterChangeView[] {
  return list.length > 1 ? list : NONE;
}

/** Fills `set` for the view [t0, t0 + w / pps]; `measure` gives the width of a figure's text in the signature font. */
export function layoutMeterMarks(set: MeterMarkSet, map: TempoMap, views: readonly MeterChangeView[], t0: Seconds, pps: number, w: number, measure: (text: string) => number): void {
  set.count = 0;
  for (const v of views) {
    const x = (v.time - t0) * pps;
    if (x > w) break;
    const end = (barStartTime(map, v.bar + 1) - t0) * pps;
    if (end < 0) continue;
    const left = Math.max(x + SIGNATURE_PAD_PX, STICK_PX);
    const width = Math.max(measure(String(v.meter.numerator)), measure(String(v.meter.denominator)));
    if (end - left < width + SIGNATURE_GAP_PX) continue;
    let m = set.items[set.count];
    if (!m) set.items[set.count] = m = { bar: 0, numerator: 0, denominator: 0, x: 0, width: 0, end: 0 };
    m.bar = v.bar;
    m.numerator = v.meter.numerator;
    m.denominator = v.meter.denominator;
    m.x = left;
    m.width = width;
    m.end = end;
    set.count++;
  }
}

/** What the browser checks read (`data-signatures` on the timeline): « 1:4/4 5:7/8 », bars as shown. */
export function describeMeterMarks(set: MeterMarkSet): string {
  let s = '';
  for (let i = 0; i < set.count; i++) {
    const m = set.items[i]!;
    s += `${i ? ' ' : ''}${m.bar + 1}:${m.numerator}/${m.denominator}`;
  }
  return s;
}

/** Where a bar's number starts when a signature is written in that bar. */
export function numberLeftAfter(mark: MeterMark): number {
  return mark.x + mark.width + SIGNATURE_GAP_PX;
}
