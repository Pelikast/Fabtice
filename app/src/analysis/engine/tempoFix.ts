// The two manual tempo actions of the bar menu (the owner's request of
// 15 November), on the beat network's kept outputs. Both keep every beat
// before the chosen bar exactly as it is, and the chosen bar's start (a
// downbeat of the grid in force) stays a downbeat.
//
//   - `continuity` (« Corriger un changement de tempo indésirable »): the
//     tempo and the bar length of the bars before the chosen bar go on. The
//     beats are tracked forward on the network's beat output with the period
//     held near the tempo before (a window of ±`window`, a cost on every
//     change of the period from one beat to the next and on the distance
//     from the tempo before): a slow drift is followed, a jump to another
//     metrical level is impossible. Bars are counted every m beats from the
//     chosen bar. This is where a continuity tracker is the right tool: as a
//     default for a whole piece it picks the wrong level (measured, app/README
//     « Temps menés par les premiers temps »), here the level is given by the
//     bars before. By design it overrides a real tempo change after the bar.
//     It runs until the tracked beats rejoin the grid in force for
//     `rejoinBars` bars in the same bar phase; from there the grid in force
//     is kept (`toEnd`: to the end of the piece).
//   - `fresh` (« Réanalyser le tempo à partir de cette mesure »): the whole
//     beat analysis (`gridFromBeats`: peaks, bar-led repair, beat repair,
//     displaced runs) on the network's outputs from the chosen bar on, as if
//     the piece began there, nothing carried from before but the metre and
//     the chosen bar as a downbeat.
//
// Pure; the worker runs it on the kept outputs, the tests on recorded ones.

import type { GridHint } from '../types';
import { downProbAt, pickPeaks, refinePeak, type BeatActivations } from './beats';
import { gridFromBeats } from './pipeline';

export type TempoFixKind = 'continuity' | 'fresh';

export interface TempoFixRequest {
  kind: TempoFixKind;
  /** Source time where the chosen bar starts: a downbeat of `grid`. */
  from: number;
  /** The grid in force (beats, first downbeat, metre). */
  grid: GridHint;
}

export interface TempoFixOptions {
  /** Period window around the tempo before (|ratio − 1|). */
  window: number;
  /** Cost of a change of the period between two beats: `change` × ln(d / d′)². */
  change: number;
  /** Cost of the distance from the tempo before: `drift` × ln(d / P)², per beat. */
  drift: number;
  /** Beat output (logit) clipped to ± this when scored. */
  clip: number;
  /** A tracked beat is moved onto a network peak within this many frames. */
  peakFrames: number;
  /** Largest change of the period from one beat to the next, in frames. */
  step: number;
  /** Bars the tracked beats must agree with the grid in force (same beats, same bars) to hand back to it. */
  rejoinBars: number;
  /** Run to the end of the piece instead. */
  toEnd: boolean;
  /** Intervals before the chosen bar that give its tempo (at least two). */
  context: number;
}

export const TEMPO_FIX: TempoFixOptions = {
  window: 0.2,
  change: 100,
  drift: 20,
  clip: 8,
  peakFrames: 2,
  step: 1,
  rejoinBars: 8,
  toEnd: false,
  context: 8,
};

const TOL = 0.07;

function median(values: readonly number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2) : NaN;
}

/** Index of the beat of `times` at `t` (within 1 ms), or −1. */
function indexAt(times: readonly number[], t: number): number {
  let best = -1;
  for (let i = 0; i < times.length; i++) if (Math.abs(times[i]! - t) < 1e-3 && (best < 0 || Math.abs(times[i]! - t) < Math.abs(times[best]! - t))) best = i;
  return best;
}

/** The tempo (beat period, s) of the bars before `at`: median of up to `context` intervals ending there. */
export function periodBefore(times: readonly number[], at: number, context: number): number {
  const d: number[] = [];
  for (let i = at; i > 0 && d.length < context; i--) d.push(times[i]! - times[i - 1]!);
  if (d.length >= 2) return median(d);
  // The chosen bar is the first one: the usual beat of the whole grid in force.
  return median(times.slice(1).map((t, i) => t - times[i]!));
}

/**
 * Beats from frame `f0` (a beat) to about `fEnd`, one every d frames with d
 * near `p` (frames): dynamic programming over (frame, period), scored by the
 * network's beat output, with costs on period changes and on the distance from
 * `p`. Returns the beat frames.
 */
export function trackBeats(beat: ArrayLike<number>, f0: number, fEnd: number, p: number, o: TempoFixOptions = TEMPO_FIX): number[] {
  const dMin = Math.max(2, Math.floor(p / (1 + o.window)));
  const dMax = Math.max(dMin, Math.ceil(p * (1 + o.window)));
  const D = dMax - dMin + 1;
  const end = Math.min(beat.length - 1, fEnd + dMax);
  const F = end - f0 + 1;
  if (F <= dMin) return [f0];
  const best = new Float64Array(F * D).fill(-Infinity);
  const back = new Int16Array(F * D).fill(-1);
  const score = (f: number) => Math.max(-o.clip, Math.min(o.clip, beat[f]!));
  const lp = Math.log(p);
  const cost = new Float64Array(D);
  for (let a = 0; a < D; a++) cost[a] = o.drift * (Math.log(dMin + a) - lp) ** 2;
  const trans = new Float64Array(D * D);
  for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) trans[a * D + b] = o.change * (Math.log((dMin + a) / (dMin + b)) ** 2);
  // The anchor: a beat at f0, as if the previous interval were p; the next beat comes from it.
  for (let a = 0; a < D; a++) {
    const f = dMin + a;
    if (f >= F) break;
    best[f * D + a] = score(f0 + f) - cost[a]! - o.change * Math.log((dMin + a) / p) ** 2;
    back[f * D + a] = -2;
  }
  for (let f = dMin; f < F; f++) {
    for (let a = 0; a < D; a++) {
      const prevF = f - (dMin + a);
      if (prevF < dMin) continue;
      let bv = -Infinity;
      let bi = -1;
      const row = prevF * D;
      // The period moves by at most `step` frames from one beat to the next: no jump, a slow drift.
      for (let b = Math.max(0, a - o.step); b <= Math.min(D - 1, a + o.step); b++) {
        const v = best[row + b]!;
        if (v === -Infinity) continue;
        const w = v - trans[a * D + b]!;
        if (w > bv) {
          bv = w;
          bi = b;
        }
      }
      if (bi < 0) continue;
      const v = bv + score(f0 + f) - cost[a]!;
      if (v > best[f * D + a]!) {
        best[f * D + a] = v;
        back[f * D + a] = bi;
      }
    }
  }
  // The last beat: the best state near fEnd.
  let bf = -1;
  let ba = -1;
  let bv = -Infinity;
  for (let f = Math.max(dMin, fEnd - f0 - dMax); f <= Math.min(F - 1, fEnd - f0 + Math.floor(dMax / 2)); f++) {
    for (let a = 0; a < D; a++) {
      // Normalised by the number of beats would favour nothing: every path has about the same count.
      const v = best[f * D + a]!;
      if (v > bv) {
        bv = v;
        bf = f;
        ba = a;
      }
    }
  }
  if (bf < 0) return [f0];
  const frames: number[] = [];
  let f = bf;
  let a = ba;
  for (;;) {
    frames.push(f0 + f);
    const b = back[f * D + a]!;
    if (b === -2) break;
    if (b < 0) break;
    f -= dMin + a;
    a = b;
  }
  frames.push(f0);
  return frames.reverse();
}

/** Tracked frames to times: onto a network peak when one is near, the others spaced between those. */
export function placeTracked(act: BeatActivations, frames: readonly number[], o: TempoFixOptions = TEMPO_FIX): number[] {
  const peaks = pickPeaks(act.beat);
  const times: (number | null)[] = frames.map((f, k) => {
    if (k === 0) return f / act.fps;
    let near: number | null = null;
    for (const p of peaks) {
      if (Math.abs(p - f) <= o.peakFrames && (near === null || Math.abs(p - f) < Math.abs(near - f))) near = p;
      if (p > f + o.peakFrames) break;
    }
    return near === null ? null : refinePeak(act.beat, near) / act.fps;
  });
  const out: number[] = [];
  for (let k = 0; k < times.length; k++) {
    if (times[k] !== null) {
      out.push(times[k]!);
      continue;
    }
    let a = k - 1;
    while (a > 0 && times[a] === null) a--;
    let b = k + 1;
    while (b < times.length && times[b] === null) b++;
    if (b >= times.length) {
      out.push(frames[k]! / act.fps);
      continue;
    }
    const ta = a === k - 1 ? out[a]! : (times[a] ?? frames[a]! / act.fps);
    out.push(ta + ((times[b]! - ta) * (k - a)) / (b - a));
  }
  for (let k = 1; k < out.length; k++) if (out[k]! <= out[k - 1]! + 1e-3) out[k] = out[k - 1]! + 1e-3;
  return out;
}

/**
 * Where the tracked beats (from the chosen bar, `m` beats per bar) agree with
 * the grid in force for `bars` bars in the same bar phase: the index in
 * `tracked` from which the grid in force is kept (null: never).
 */
export function rejoinIndex(tracked: readonly number[], grid: GridHint, fromIdx: number, bars: number): number | null {
  const m = grid.meter.numerator;
  const g = grid.times;
  const need = bars * m;
  let run = 0;
  let j = fromIdx;
  for (let k = 0; k < tracked.length; k++) {
    while (j < g.length - 1 && g[j + 1]! <= tracked[k]! + TOL) j++;
    const same = Math.abs(g[j]! - tracked[k]!) <= TOL;
    // The same bar phase: the grid's beat j is a downbeat exactly when the tracked beat k is.
    const phase = ((((j - grid.downbeat) % m) + m) % m === 0) === (k % m === 0);
    run = same && phase ? run + 1 : 0;
    if (run >= need && k > m) {
      // Handed back at the first downbeat of the stretch in agreement.
      const start = k - run + 1;
      return Math.ceil(start / m) * m;
    }
  }
  return null;
}

function merged(prefix: readonly number[], rest: readonly number[], grid: GridHint, fromIdx: number): GridHint {
  const times = [...prefix, ...rest];
  const downbeat = grid.downbeat < fromIdx ? grid.downbeat : fromIdx;
  return { times, downbeat, meter: grid.meter };
}

/** The grid after one of the two actions (see the header). */
export function applyTempoFix(act: BeatActivations, req: TempoFixRequest, o: TempoFixOptions = TEMPO_FIX): GridHint {
  const { grid, from } = req;
  const m = grid.meter.numerator;
  let fromIdx = indexAt(grid.times, from);
  if (fromIdx < 0) fromIdx = grid.times.findIndex((t) => t > from);
  if (fromIdx < 0) return grid;
  const t0 = grid.times[fromIdx]!;
  const prefix = grid.times.slice(0, fromIdx);
  const last = grid.times[grid.times.length - 1]!;
  const P = periodBefore(grid.times, fromIdx, o.context);
  if (!(P > 0)) return grid;
  if (req.kind === 'continuity') {
    const frames = trackBeats(act.beat, Math.round(t0 * act.fps), Math.round(last * act.fps), P * act.fps, o);
    const tracked = placeTracked(act, frames, o);
    tracked[0] = t0;
    if (!o.toEnd) {
      const k = rejoinIndex(tracked, grid, fromIdx, o.rejoinBars);
      if (k !== null && k > 0) {
        const at = tracked[k]!;
        const j = grid.times.findIndex((t) => Math.abs(t - at) <= TOL);
        if (j > fromIdx) return merged(prefix, [...tracked.slice(0, k), ...grid.times.slice(j)], grid, fromIdx);
      }
    }
    return merged(prefix, tracked, grid, fromIdx);
  }
  // Fresh: the analysis of the beats from the chosen bar on, as if the piece began there.
  const downAt = (t: number) => (t < t0 - 0.1 ? 0.02 : downProbAt(act, t));
  const peaks = pickPeaks(act.beat).map((f) => refinePeak(act.beat, f) / act.fps);
  const found = [t0, ...peaks.filter((t) => t > t0 + 0.25 * P && t <= last + P)];
  const g = gridFromBeats(found, downAt, undefined, undefined, undefined, [m]).grid;
  let beats = g.beats.filter((t) => t >= t0 - 1e-6);
  if (!beats.length || Math.abs(beats[0]! - t0) > 1e-6) beats = [t0, ...beats.filter((t) => t > t0 + 0.25 * P)];
  return merged(prefix, beats, grid, fromIdx);
}
