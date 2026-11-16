// The percentage of the chart download. The work is a handful of collections of very different sizes, so the
// true figure (collections finished over collections asked) moves in a few big steps; the percentage shown
// instead creeps forward between two steps (never past the next one before it is real), so that it advances
// steadily, as every long wait of the app does.

import type { DownloadProgress } from './library';

/** How far into the next step the figure may creep before the collection is really finished. */
const CREEP_LIMIT = 0.92;
/** The time, in ms, in which the figure covers about two thirds of the way to its limit. */
const CREEP_TIME_MS = 6000;

/** Collections finished (kept, failed or cancelled) and collections asked. */
export function finishedOf(progress: Pick<DownloadProgress, 'rows'>): { finished: number; total: number } {
  const finished = progress.rows.filter((r) => r.state === 'kept' || r.state === 'failed' || r.state === 'cancelled').length;
  return { finished, total: progress.rows.length };
}

/** The figure shown after `dtMs` more: never behind the real one, never past the creeping limit, never backwards. */
export function smoothFraction(shown: number, finished: number, total: number, dtMs: number): number {
  if (total <= 0) return 0;
  const real = finished / total;
  const limit = Math.min(1, (finished + CREEP_LIMIT) / total);
  if (finished >= total) return 1;
  const from = Math.max(shown, real);
  return Math.min(limit, from + (limit - from) * (1 - Math.exp(-dtMs / CREEP_TIME_MS)));
}
