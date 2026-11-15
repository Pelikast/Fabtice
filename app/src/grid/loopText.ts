// How a loop is written for a musician, in the transport, the export dialog
// and the exported file names.
//
// Whole bars keep the short form « 5–8 » (or « 5 »). Any other loop is written
// as two points, « 2.2 à 4.3 (4e double) »: bar.beat, and when the point is
// between two beats, the rank of the subdivision of that beat and its note
// value in brackets (« 4e double » is the fourth sixteenth of the beat,
// « 2e croche » the off-beat eighth, « 2e triolet » the second of three).
// A point is a line, not a cell: the loop ends where its last point is, so
// « 2.2 à 4.3 » plays up to the beginning of beat 3 of bar 4.
// A point that is on none of these lines (a free selection) is written with
// « ≈ » and the nearest sixteenth.

import { t } from '../i18n';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { formatBarNumber, formatLoopBars } from './format';
import { LINE_TOLERANCE_BEATS, wholeBarsOf } from './loops';
import { barToBeat, beatToTime, timeToBar } from './tempoMap';

/** Divisions of a beat a point can be named by, coarsest first (eighths, triplets, sixteenths, sextuplets, thirty-seconds, twelfths). */
const DIVISIONS = [2, 3, 4, 6, 8, 12] as const;
type Division = (typeof DIVISIONS)[number];

export interface PointDescription {
  /** Bar index (0 = « mesure 1 »). */
  bar: number;
  /** Beat of the bar, 1-based. */
  beat: number;
  /** Where in the beat, when it is between two beats: rank (2…count) among `count` equal divisions. */
  sub: { rank: number; count: Division } | null;
  /** True when the point is on none of the named lines: shown as the nearest sixteenth. */
  approx: boolean;
}

/** Bar, beat and subdivision of a source time. */
export function describePoint(map: TempoMap, time: Seconds): PointDescription {
  let pos = timeToBar(map, time);
  // A point a hair before a bar line is on that line.
  if (pos.meter.numerator - pos.beatInBar < LINE_TOLERANCE_BEATS) pos = timeToBar(map, beatToTime(map, barToBeat(map, pos.bar + 1)));
  let beat0 = Math.floor(pos.beatInBar + LINE_TOLERANCE_BEATS);
  const f = Math.max(0, pos.beatInBar - beat0);
  if (f < LINE_TOLERANCE_BEATS || pos.beatInBar - beat0 < 0) return { bar: pos.bar, beat: beat0 + 1, sub: null, approx: false };
  for (const count of DIVISIONS) {
    const k = f * count;
    if (Math.abs(k - Math.round(k)) < LINE_TOLERANCE_BEATS * count) {
      return { bar: pos.bar, beat: beat0 + 1, sub: { rank: Math.round(k) + 1, count }, approx: false };
    }
  }
  // Not on a named line: the nearest sixteenth.
  const q = Math.round(f * 4);
  if (q === 4) beat0 += 1;
  return { bar: pos.bar, beat: beat0 + 1, sub: q % 4 === 0 ? null : { rank: (q % 4) + 1, count: 4 }, approx: true };
}

const subName = (count: Division) => t(`loop.sub.${count}` as const);

/** « 4.3 », « 4.3 (4e double) », « ≈4.3 (2e double) ». */
export function formatPoint(p: PointDescription): string {
  const base = `${formatBarNumber(p.bar)}.${p.beat}`;
  const sub = p.sub ? ` (${t('loop.rank', { n: p.sub.rank })} ${subName(p.sub.count)})` : '';
  return `${p.approx ? '≈' : ''}${base}${sub}`;
}

/** « mesure 4, temps 3, 4e double »: the same point in full, for a tooltip or a screen reader. */
export function formatPointLong(p: PointDescription): string {
  const sub = p.sub ? `, ${t('loop.rank', { n: p.sub.rank })} ${subName(p.sub.count)}` : '';
  return `${t('pos.bar')} ${formatBarNumber(p.bar)}, ${t('pos.beat')} ${p.beat}${sub}${p.approx ? `, ${t('loop.about')}` : ''}`;
}

export interface LoopText {
  /** True when the loop is made of whole bars (« 5–8 »). */
  whole: boolean;
  /** The short form, shown in the transport, the export dialog and the file names. */
  text: string;
  /** The same in full words, for a tooltip or a screen reader. */
  long: string;
}

/** How a loop is written (see the head of this file). */
export function formatLoop(map: TempoMap, range: TimeRange): LoopText {
  const bars = wholeBarsOf(map, range);
  if (bars) {
    const a = formatBarNumber(bars.first);
    const b = formatBarNumber(bars.last);
    return {
      whole: true,
      text: formatLoopBars(map, range),
      long: bars.first === bars.last ? `${t('pos.bar')} ${a}` : t('loop.longBars', { a, b }),
    };
  }
  const a = describePoint(map, range.start);
  const b = describePoint(map, range.end);
  return {
    whole: false,
    text: t('loop.span', { a: formatPoint(a), b: formatPoint(b) }),
    long: t('loop.longSpan', { a: formatPointLong(a), b: formatPointLong(b) }),
  };
}
