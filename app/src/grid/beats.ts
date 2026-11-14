// Tempo maps made from beat times (the analysis), and back.
//
// An analysed grid is a list of beat times plus the index of the first
// downbeat. It becomes a tempo map with one constant segment per beat
// interval, so every analysed beat is exactly an integer beat of the map and
// bar lines fall exactly on analysed beats. The first interval's tempo extends
// backwards (pick-up) and the last one forwards, as for any map.

import type { Seconds } from '../model/project';
import type { Meter, TempoMap, TempoOrigin, TempoSegment } from '../model/tempoMap';
import { beatToTime, DEFAULT_METER, timeToBeat } from './tempoMap';

/** Beats closer than this are merged (analysis noise); a beat lasts at least 60/1000 s. */
export const MIN_BEAT_GAP = 0.06;

/**
 * A tempo map whose integer beats are `times`, `times[downbeat]` being beat 0
 * (« mesure 1 »). Throws when fewer than two usable beats are given.
 */
export function tempoMapFromBeats(times: readonly Seconds[], downbeat: number, meter: Meter = DEFAULT_METER, origin: TempoOrigin = 'analysis'): TempoMap {
  // Keep strictly increasing, finite times; the downbeat index follows the kept beats.
  const kept: Seconds[] = [];
  let first = 0;
  times.forEach((t, i) => {
    if (!Number.isFinite(t)) return;
    const last = kept[kept.length - 1];
    if (last !== undefined && t - last < MIN_BEAT_GAP) return;
    if (i <= downbeat) first = kept.length;
    kept.push(t);
  });
  if (kept.length < 2) throw new RangeError('a beat grid needs at least two beats');
  const segments: TempoSegment[] = [];
  for (let i = 0; i + 1 < kept.length; i++) {
    segments.push({ time: kept[i]!, beat: i - first, bpm: 60 / (kept[i + 1]! - kept[i]!) });
  }
  return { origin, segments, meters: [{ bar: 0, beat: 0, meter: { ...meter } }] };
}

/** Source times of the integer beats of the map whose time lies in [from, to]. */
export function beatTimes(map: TempoMap, from: Seconds, to: Seconds): Seconds[] {
  const out: Seconds[] = [];
  if (!(to >= from)) return out;
  for (let b = Math.ceil(timeToBeat(map, from) - 1e-7); out.length < 200000; b++) {
    const t = beatToTime(map, b);
    if (t > to + 1e-9) break;
    if (t >= from - 1e-9) out.push(t);
  }
  return out;
}

/**
 * The grid of a map as the analyser takes it back (`analysis/types.ts`,
 * `AnalysisRequest.grid`): its beats over [0, duration] and the index of the
 * first downbeat among them.
 */
export function beatGridOf(map: TempoMap, duration: Seconds): { times: Seconds[]; downbeat: number; meter: Meter } {
  const times = beatTimes(map, 0, duration);
  const t0 = beatToTime(map, 0);
  let downbeat = times.findIndex((t) => Math.abs(t - t0) < 1e-6);
  if (downbeat < 0) downbeat = Math.max(0, times.findIndex((t) => t > t0));
  return { times, downbeat, meter: { ...map.meters[0]!.meter } };
}
