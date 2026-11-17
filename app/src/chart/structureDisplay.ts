// What the « Grille d'accords » shows (C14) and how a part sits on the chart,
// as pure functions (tested in structureDisplay.test.ts).
//
//   - the display (`ChartDisplay`): the whole chart, the simplified chart, or
//     one part; a part that is gone leaves the chart in full;
//   - a part on the chart: from the bar line nearest its start, up to (not
//     including) the bar line nearest its end (the same rule as the letters of
//     a part: `store/structureSelectors.ts#lettersIn`); a part that reaches the
//     end of the piece takes the last bar;
//   - the bars of a part as numbers a musician reads (« mesures 9 à 24 »: the
//     index + 1) and back to times, for the window that corrects the limits.
//
// Positions are source time in seconds; bar indexes are those of the chart
// (`ChartBar.bar`: 0 = « mesure 1 », negative = pick-up).

import { barStartTime, timeToBar } from '../grid/tempoMap';
import type { Seconds } from '../model/project';
import type { StructurePart } from '../model/structure';
import type { TempoMap } from '../model/tempoMap';
import type { ChartDisplay } from '../store/store';
import { sectionBar, type ChartBar } from './layout';

export const FULL_DISPLAY: ChartDisplay = { kind: 'full' };

/** A part that ends this close to the end of the piece reaches its last bar. */
const END_EPS: Seconds = 0.05;

/** The display to show: a part that is not in the list any more gives the whole chart. */
export function resolveDisplay(display: ChartDisplay, parts: readonly Pick<StructurePart, 'id'>[]): ChartDisplay {
  if (display.kind !== 'part') return display;
  return parts.some((p) => p.id === display.id) ? display : FULL_DISPLAY;
}

export function sameDisplay(a: ChartDisplay, b: ChartDisplay): boolean {
  return a.kind === b.kind && (a.kind !== 'part' || a.id === (b as { id: string }).id);
}

export interface PartBars {
  /** Index of the first bar. */
  first: number;
  /** Index of the bar where it ends, not included (always after `first`). */
  end: number;
}

/**
 * The bars a part covers on the chart in force. `lastBar` is the index of the
 * last bar of the chart, `duration` the length of the piece.
 */
export function partBars(map: TempoMap, part: Pick<StructurePart, 'start' | 'end'>, duration: Seconds, lastBar: number): PartBars {
  const first = sectionBar(map, part.start);
  const end = part.end >= duration - END_EPS ? lastBar + 1 : sectionBar(map, part.end);
  return { first, end: Math.max(end, first + 1) };
}

/** The bars of the chart that belong to a part, the first one without the double bar of a section start. */
export function barsOfRange(bars: readonly ChartBar[], range: PartBars): ChartBar[] {
  const kept = bars.filter((b) => b.bar >= range.first && b.bar < range.end);
  const head = kept[0];
  return head && head.doubleBar ? [{ ...head, doubleBar: false }, ...kept.slice(1)] : kept;
}

/** « 9 à 24 » for a part, as musicians count the bars (index + 1; the pick-up bar is « 0 »). */
export interface BarNumbers {
  first: number;
  last: number;
}

export function partBarNumbers(range: PartBars): BarNumbers {
  return { first: range.first + 1, last: range.end };
}

/**
 * The limits of a part from the bar numbers typed (first and last bar, both
 * included), on the grid in force: from the start of the first to the start
 * of the bar after the last (the end of the piece when that is later).
 * Null when the numbers are not whole, out of the chart's bars, or reversed.
 */
export function limitsFromNumbers(map: TempoMap, numbers: BarNumbers, chart: { firstBar: number; lastBar: number }, duration: Seconds): { start: Seconds; end: Seconds } | null {
  const { first, last } = numbers;
  if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
  if (first - 1 < chart.firstBar || last - 1 > chart.lastBar || last < first) return null;
  const start = Math.max(0, barStartTime(map, first - 1));
  const end = Math.min(duration, barStartTime(map, last));
  return end > start ? { start, end } : null;
}

/** The first and last bar index of a chart (an empty chart has none). */
export function chartBounds(bars: readonly ChartBar[]): { firstBar: number; lastBar: number } | null {
  const a = bars[0];
  const z = bars[bars.length - 1];
  return a && z ? { firstBar: a.bar, lastBar: z.bar } : null;
}

/**
 * The limits « Ajouter une partie » starts from: the loop when there is one
 * (its bar lines), else from the bar under the playhead to the end of the
 * free stretch there (the next part, or the end of the piece), at least one bar.
 */
export function defaultNewLimits(input: {
  map: TempoMap;
  loop: { start: Seconds; end: Seconds } | null;
  position: Seconds;
  parts: readonly Pick<StructurePart, 'start' | 'end'>[];
  duration: Seconds;
  lastBar: number;
}): { start: Seconds; end: Seconds } {
  const { map, loop, position, parts, duration, lastBar } = input;
  const barTime = (bar: number) => Math.min(duration, Math.max(0, barStartTime(map, bar)));
  if (loop) {
    const range = partBars(map, loop, duration, lastBar);
    return { start: barTime(range.first), end: barTime(range.end) };
  }
  // The bar the playhead is in (not the nearest bar line).
  const first = Math.min(lastBar, Math.max(0, timeToBar(map, position).bar));
  const start = barTime(first);
  // The end of the stretch: where the next part starts, or where the part under the playhead ends.
  const stops = parts.flatMap((p) => (p.start > start + 1e-3 ? [p.start] : p.end > start + 1e-3 ? [p.end] : []));
  const next = stops.reduce((m, x) => Math.min(m, x), duration);
  const end = Math.max(next, barTime(first + 1));
  return { start, end: Math.min(duration, end) };
}
