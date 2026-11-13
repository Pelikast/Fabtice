// Text formatting of times and musical positions, as the mockup shows them.
// Locale-neutral except for the decimal separator, which callers can pass.

import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { barsOfRange } from './lines';
import { timeToBar } from './tempoMap';

/** Typographic minus sign, used for every negative number shown. */
export const MINUS = '−';
/** En dash between two bar numbers (« boucle 5–8 »). */
export const RANGE_DASH = '–';

/** Clock time with tenths: 16.04 -> « 0:16,0 », 75.36 -> « 1:15,4 ». */
export function formatClock(t: Seconds, decimal = ','): string {
  const sign = t < 0 ? MINUS : '';
  const tenths = Math.round(Math.abs(t) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const secs = Math.floor(rest / 10);
  return `${sign}${minutes}:${String(secs).padStart(2, '0')}${decimal}${rest % 10}`;
}

/** Length of a piece for the top bar: « 4 min 33 », « 4 min », « 45 s ». */
export function formatDuration(t: Seconds): string {
  const total = Math.max(0, Math.round(t));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes === 0) return `${secs} s`;
  return secs === 0 ? `${minutes} min` : `${minutes} min ${String(secs).padStart(2, '0')}`;
}

/** Number shown for a bar index: index + 1, so the pick-up bar (−1) shows « 0 ». */
export function formatBarNumber(bar: number): string {
  const n = bar + 1;
  return n < 0 ? `${MINUS}${-n}` : String(n);
}

export interface PositionText {
  /** « mesure N » */
  bar: string;
  /** « temps N », 1-based */
  beat: string;
}

export function formatPosition(map: TempoMap, t: Seconds): PositionText {
  const pos = timeToBar(map, t);
  return { bar: formatBarNumber(pos.bar), beat: String(Math.floor(pos.beatInBar + 1e-6) + 1) };
}

/** Bars covered by a loop: « 5–8 », or « 5 » for a single bar. */
export function formatLoopBars(map: TempoMap, range: TimeRange): string {
  const { first, last } = barsOfRange(map, range);
  return first === last ? formatBarNumber(first) : `${formatBarNumber(first)}${RANGE_DASH}${formatBarNumber(last)}`;
}

/** Signed integer with a typographic minus: « +5 », « 0 », « −3 ». */
export function formatSigned(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `${MINUS}${-n}`;
}
