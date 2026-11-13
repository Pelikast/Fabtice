// « Battre le tempo »: tempo from the times of the user's taps.

import { BPM_MAX, BPM_MIN } from './tempoMap';

/** A pause longer than this starts a new series of taps. */
export const TAP_RESET_MS = 2000;
/** Only the most recent taps count, so the estimate follows the user. */
export const TAP_WINDOW = 8;

/**
 * Keeps the taps of the current series: drops everything before a pause
 * longer than `TAP_RESET_MS`, then keeps the last `TAP_WINDOW` taps.
 */
export function addTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const series = last !== undefined && now - last <= TAP_RESET_MS && now > last ? [...taps, now] : [now];
  return series.slice(-TAP_WINDOW);
}

/**
 * Tempo of a series of tap times (milliseconds), from the median interval so
 * one hesitant tap does not pull it. Null until there are two taps. Rounded
 * to a tenth and clamped to the allowed range.
 */
export function tapTempo(taps: readonly number[]): number | null {
  if (taps.length < 2) return null;
  const intervals = taps.slice(1).map((t, i) => t - taps[i]!).filter((d) => d > 0).sort((a, b) => a - b);
  if (intervals.length === 0) return null;
  const mid = intervals.length >> 1;
  const median = intervals.length % 2 ? intervals[mid]! : (intervals[mid - 1]! + intervals[mid]!) / 2;
  const bpm = Math.round((600000 / median)) / 10;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
}
