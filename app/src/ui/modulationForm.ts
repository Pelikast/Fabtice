// The window « Changer de tonalité » / « Modifier la modulation » (C10): what the fields mean and what is
// wrong with them, as pure functions (tested in modulationForm.test.ts). The key is the one stored (concert
// pitch, original key: the window converts what the user picks with `harmonyActions.untransposeKeyForStorage`);
// the bar is the number musicians read (index + 1), so the first bar a modulation may start at is « 2 ».

import { sectionBar } from '../chart/layout';
import { barStartTime } from '../grid/tempoMap';
import { sameKey } from '../harmony/key';
import type { Key, KeyChange } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { wholeNumber } from './partForm';

/** What the window reads of the piece. */
export interface ModulationEnv {
  map: TempoMap;
  duration: Seconds;
  /** First and last bar index of the chart: a modulation starts after the first one, up to the last. */
  chart: { firstBar: number; lastBar: number };
  /** The main key (the first passage), null when unknown. */
  main: Key | null;
  /** The modulations in force, ascending. */
  list: readonly KeyChange[];
}

export type ModulationProblem = 'bar' | 'taken' | 'same';

export type ModulationCheck = { ok: true; bar: number; time: Seconds } | { ok: false; problem: ModulationProblem };

/** The key in force just before bar index `bar`, among the modulations `list` (the main key when none comes before). */
export function keyBefore(map: TempoMap, main: Key | null, list: readonly KeyChange[], bar: number): Key | null {
  let found = main;
  for (const c of list) {
    if (sectionBar(map, c.time) < bar) found = c.key;
    else break;
  }
  return found;
}

/** The first and last bar numbers a modulation may be given (`null` when the chart is too short for one). */
export function modulationBarRange(chart: ModulationEnv['chart']): { min: number; max: number } | null {
  const min = chart.firstBar + 2;
  const max = chart.lastBar + 1;
  return max >= min ? { min, max } : null;
}

/**
 * Whether the fields make a modulation: the bar number (text, as typed), the key (stored), and the time of the
 * modulation being edited (`null` for a new one). `same`: the key is the one of the passage before, which would
 * be no modulation at all.
 */
export function checkModulation(env: ModulationEnv, input: { barText: string; key: Key; editing: Seconds | null }): ModulationCheck {
  const n = wholeNumber(input.barText);
  const index = n - 1;
  if (!Number.isInteger(index) || index <= env.chart.firstBar || index > env.chart.lastBar) return { ok: false, problem: 'bar' };
  const time = barStartTime(env.map, index);
  if (!(time > 1e-3 && time < env.duration)) return { ok: false, problem: 'bar' };
  const others = input.editing === null ? env.list : env.list.filter((c) => Math.abs(c.time - input.editing!) > 1e-3);
  if (others.some((c) => sectionBar(env.map, c.time) === index)) return { ok: false, problem: 'taken' };
  const before = keyBefore(env.map, env.main, others, index);
  if (before && sameKey(before, input.key)) return { ok: false, problem: 'same' };
  return { ok: true, bar: index, time };
}
