// « Correction de la courbe en tapant le tempo » (C12): the pure parts of what
// the screen plays and records. Where playback starts (a number of bars before
// the chosen one), which clicks sound before the chosen bar and none from it,
// which taps count. The screen itself is `components/TapFixDialog.tsx`, what
// it does to the engine `ui/tapFixSession.ts`, the computation
// `analysis/tapFix.ts`. All times are source seconds.

import type { ClickTrack } from '../audio/AudioEngine';
import type { MeterPattern } from '../model/metronome';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { countInClicks, metronomeClickTrack, type CountIn } from './metronome';
import { barStartTime, beatToTime, timeToBeat } from './tempoMap';

/** Bars of count-in offered: 0 allowed, one by default. */
export const TAP_COUNT_IN = { min: 0, max: 4, default: 1 } as const;

/** The click that falls on the chosen bar must not sound: the track stops this far before it. */
const CUT_BEFORE = 1e-4;

/** A whole number of bars in range; anything else (empty field, text) is the default. */
export function clampTapCountIn(value: number | string): number {
  const n = typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value.replace(',', '.'))) : value;
  if (!Number.isFinite(n)) return TAP_COUNT_IN.default;
  return Math.min(TAP_COUNT_IN.max, Math.max(TAP_COUNT_IN.min, Math.round(n)));
}

export interface TapFixStart {
  /** Where playback starts: the start of the bar `countInBars` before the chosen one (the chosen one with 0). */
  start: Seconds;
  /** Start of the chosen bar: from here the user taps. */
  barTime: Seconds;
  /** Clicks alone before `start`, only for the bars the piece does not have before the chosen one; null when none. */
  countIn: CountIn | null;
}

/**
 * Where to start so that `countInBars` bars of the grid come before the chosen bar. Near the start of the piece
 * (fewer bars than asked before the chosen one) it starts at the first bar that is inside the piece and the
 * missing bars are counted by clicks alone first, in the rhythm of the grid there.
 */
export function tapFixStart(map: TempoMap, bar: number, countInBars: number, patterns: Readonly<Record<string, MeterPattern>>): TapFixStart {
  const n = clampTapCountIn(countInBars);
  const barTime = barStartTime(map, bar);
  let startBar = bar - n;
  while (startBar < bar && barStartTime(map, startBar) < -1e-6) startBar++;
  const start = Math.max(0, barStartTime(map, startBar));
  const missing = startBar - (bar - n);
  return { start, barTime, countIn: missing > 0 ? countInClicks(map, start, missing, patterns) : null };
}

/**
 * The clicks heard while tapping: the grid's own beats up to the chosen bar, none from it (with the user's accents). The
 * click that would fall on the bar line itself is left out.
 */
export function tapFixClicks(map: TempoMap, barTime: Seconds, patterns: Readonly<Record<string, MeterPattern>>): ClickTrack {
  return metronomeClickTrack(map, 0, barTime - CUT_BEFORE, patterns);
}

/** How far past the last placed beat « Vérifier en écoutant » goes on: two beats of the grid there. */
export const VERIFY_TAIL_BEATS = 2;

export interface TapFixVerify extends TapFixStart {
  /** Where the listening stops: a little after the last beat placed from the taps, at most the end of the piece. */
  stop: Seconds;
}

/** « Vérifier en écoutant »: the same start as the taps' (the grid before the chosen bar is the same), on the candidate grid, up to a little after `end`. */
export function tapFixVerify(map: TempoMap, bar: number, end: Seconds, countInBars: number, patterns: Readonly<Record<string, MeterPattern>>, duration: Seconds): TapFixVerify {
  const s = tapFixStart(map, bar, countInBars, patterns);
  const tail = beatToTime(map, timeToBeat(map, end) + VERIFY_TAIL_BEATS);
  return { ...s, stop: Math.min(duration, Number.isFinite(tail) && tail > end ? tail : end + 1) };
}

/**
 * The taps with `t` added, or the same list when it does not count: a tap before the chosen bar is ignored (it is
 * the count-in, or a stray touch). Kept in order of arrival.
 */
export function recordTap(taps: readonly Seconds[], t: Seconds, barTime: Seconds): readonly Seconds[] {
  if (!Number.isFinite(t) || t < barTime) return taps;
  return [...taps, t];
}
