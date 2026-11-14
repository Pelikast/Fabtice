// The tempo curve of the ruler (« Tempo » row), bar by bar.
//
// An analysed map has one segment per beat; drawn segment by segment its line
// would shake at every beat (the timing of real players). The ruler draws one
// point per bar instead, as the mockup does (`TEMPO_CURVE`, a dot per bar
// joined by a smooth line): the bar's average tempo.

import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { barStartTime, meterAtBar, timeToBar } from './tempoMap';

export interface TempoPoint {
  bar: number;
  /** Start and end of the bar, source time. */
  start: Seconds;
  end: Seconds;
  /** Average tempo over the bar: beats of the bar × 60 / its duration. */
  bpm: number;
}

/** One point per bar touching [from, to] (bars may start before `from`). Constant maps give a flat curve. */
export function tempoCurve(map: TempoMap, from: Seconds, to: Seconds, maxPoints = 20000): TempoPoint[] {
  const out: TempoPoint[] = [];
  if (!(to >= from)) return out;
  for (let bar = timeToBar(map, from).bar; out.length < maxPoints; bar++) {
    const start = barStartTime(map, bar);
    if (start > to) break;
    const end = barStartTime(map, bar + 1);
    out.push({ bar, start, end, bpm: (meterAtBar(map, bar).numerator * 60) / (end - start) });
  }
  return out;
}

/** Lowest and highest tempo of a curve, at least `minSpan` BPM apart (a flat line sits in the middle). */
export function curveRange(points: readonly TempoPoint[], minSpan = 8): { lo: number; hi: number } {
  if (points.length === 0) return { lo: 0, hi: minSpan };
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.bpm);
    hi = Math.max(hi, p.bpm);
  }
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    return { lo: mid - minSpan / 2, hi: mid + minSpan / 2 };
  }
  return { lo, hi };
}
