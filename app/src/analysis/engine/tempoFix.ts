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
import { bestPhase } from './repair';

export type TempoFixKind = 'continuity' | 'fresh';

export interface TempoFixRequest {
  kind: TempoFixKind;
  /** Source time where the chosen bar starts: a downbeat of `grid`. */
  from: number;
  /** The grid in force (beats, first downbeat, metre). */
  grid: GridHint;
  /**
   * The chosen bar starts between two beats of the grid in force (after a bar with an odd number
   * of eighths) and was added to `grid` as a beat: it stays where it is, and « Corriger » tracks the
   * beats from it instead of from the beat before it.
   */
  anchored?: boolean;
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
  /** Bars in a row, each within `steadyRatio` of the one before, for a stretch to give the tempo. */
  steadyBars: number;
  /** |ln| between neighbouring bars of a steady stretch. */
  steadyRatio: number;
  /** `follow`: beat by beat, peaks far from where a beat is due ignored; `dp`: the best path over the whole rest. */
  tracker: 'follow' | 'dp';
  /** Following: a network peak is taken for the next beat only within this share of a beat of where it is due. */
  near: number;
  /** Following: how much of each beat's lateness or earliness goes into the beat length held. */
  gain: number;
  /** Following: weakest network peak (logit) taken for a beat. */
  floor: number;
  /** After handing back, a bar of the grid in force this far (|ln|) from the tempo held takes the tracking again. */
  retake: number;
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
  steadyBars: 4,
  steadyRatio: Math.log(1.1),
  tracker: 'follow',
  near: 0.2,
  gain: 0.1,
  floor: -2,
  retake: Math.log(1.2),
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

/** Bar lengths of the grid in force, and where a steady stretch ends (bars k − steadyBars + 1 … k). */
function stretches(grid: GridHint, o: TempoFixOptions) {
  const m = grid.meter.numerator;
  const t = grid.times;
  const starts: number[] = [];
  for (let i = grid.downbeat; i + m < t.length; i += m) starts.push(i);
  const L = starts.map((i) => t[i + m]! - t[i]!);
  const steady = L.map((_, k) => {
    if (k < o.steadyBars - 1) return false;
    for (let q = k - o.steadyBars + 2; q <= k; q++) if (Math.abs(Math.log(L[q]! / L[q - 1]!)) >= o.steadyRatio) return false;
    return true;
  });
  return { starts, L, steady };
}

/** The bars just before the chosen bar are a steady stretch (`steadyBars` bars, each within `steadyRatio` of the one before). */
export function steadyBefore(grid: GridHint, fromIdx: number, o: TempoFixOptions = TEMPO_FIX): boolean {
  const { starts, steady } = stretches(grid, o);
  const bar = starts.findIndex((i) => i >= fromIdx);
  const at = bar < 0 ? steady.length : bar;
  return at >= 1 && steady[at - 1]!;
}

/**
 * The tempo to hold from the chosen bar (beat period, s): the bars just before it when they are a steady
 * stretch; else the nearest steady stretch before it, else the nearest after it, else the usual beat of the
 * whole grid. Never a quarter away from the piece's usual beat (the bars before may be at another level).
 */
export function referencePeriod(grid: GridHint, fromIdx: number, o: TempoFixOptions = TEMPO_FIX): number {
  const m = grid.meter.numerator;
  const t = grid.times;
  const usual = median(t.slice(1).map((x, i) => x - t[i]!));
  const { starts, L, steady } = stretches(grid, o);
  const bar = starts.findIndex((i) => i >= fromIdx);
  const at = bar < 0 ? L.length : bar; // bars 0 … at − 1 lie before the chosen bar
  const period = (k: number) => median(L.slice(k - o.steadyBars + 1, k + 1)) / m;
  let p = NaN;
  if (steadyBefore(grid, fromIdx, o)) p = periodBefore(t, fromIdx, o.context);
  for (let k = at - 2; !(p > 0) && k >= 0; k--) if (steady[k]) p = period(k);
  for (let k = at + o.steadyBars - 1; !(p > 0) && k < L.length; k++) if (steady[k]) p = period(k);
  if (!(p > 0)) p = usual;
  return Math.abs(Math.log(p / usual)) < Math.log(1.25) ? p : usual;
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
 * Beats from `t0` (a beat) to about `tEnd`, the tempo `period` (s) held: each
 * beat is due one beat length after the one before; the strongest network
 * peak within `near` of a beat of that place is taken for it, otherwise it
 * falls where it is due. The beat length held moves by `gain` of each
 * beat's lateness or earliness, and stays within `window` of `period`. A
 * peak further away is ignored, not followed: a row of strong off-beats (a
 * swung eighth on a worn record) cannot draw the beats onto it, and a slow
 * drift is still followed.
 */
export function followBeats(act: BeatActivations, t0: number, tEnd: number, period: number, o: TempoFixOptions = TEMPO_FIX): number[] {
  const peaks = pickPeaks(act.beat).filter((f) => act.beat[f]! >= o.floor).map((f) => ({ t: refinePeak(act.beat, f) / act.fps, v: act.beat[f]! }));
  const out = [t0];
  let d = period;
  let j = 0;
  while (out[out.length - 1]! < tEnd - 0.5 * d) {
    const last = out[out.length - 1]!;
    const due = last + d;
    while (j < peaks.length && peaks[j]!.t < due - o.near * d) j++;
    let best: { t: number; v: number } | null = null;
    for (let q = j; q < peaks.length && peaks[q]!.t <= due + o.near * d; q++) if (!best || peaks[q]!.v > best.v) best = peaks[q]!;
    const t = best ? best.t : due;
    d = Math.min(period * (1 + o.window), Math.max(period / (1 + o.window), d + o.gain * (t - due)));
    out.push(t);
  }
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
    const held = referencePeriod(grid, fromIdx, o);
    if (!(held > 0)) return grid;
    // Track from the chosen bar; hand back to the grid in force where they agree for `rejoinBars` bars; take the
    // tracking again at the next bar of the grid in force that is away from the tempo held, and so on.
    let out = req.anchored ? [...prefix, t0] : prefix.slice();
    let start = fromIdx;
    let t = t0;
    for (let round = 0; round < 32; round++) {
      // From the beat before the bar (it stays): the bar's own start is followed too, it may be the beat that
      // went wrong (an off-beat taken for the downbeat).
      const track = (from: number) =>
        o.tracker === 'follow' ? followBeats(act, from, last, held, o) : placeTracked(act, trackBeats(act.beat, Math.round(from * act.fps), Math.round(last * act.fps), held * act.fps, o), o).map((x, i) => (i ? x : from));
      const tracked = out.length ? track(out[out.length - 1]!).slice(1) : track(t);
      if (!tracked.length) break;
      const k = o.toEnd ? null : rejoinIndex(tracked, grid, start, o.rejoinBars);
      const j = k !== null && k > 0 ? grid.times.findIndex((x) => Math.abs(x - tracked[k]!) <= TOL) : -1;
      if (j <= start) {
        out = [...out, ...tracked];
        break;
      }
      out = [...out, ...tracked.slice(0, k!)];
      // The grid in force from j on, until a bar of it is away from the tempo held.
      let next = -1;
      for (let i = j; i + m < grid.times.length; i += m) {
        if (Math.abs(Math.log((grid.times[i + m]! - grid.times[i]!) / (m * held))) >= o.retake) {
          next = i;
          break;
        }
      }
      if (next < 0) {
        out = [...out, ...grid.times.slice(j)];
        break;
      }
      out = [...out, ...grid.times.slice(j, next)];
      start = next;
      t = grid.times[next]!;
    }
    const result = merged(out.slice(0, fromIdx), out.slice(fromIdx), grid, fromIdx);
    if (steadyBefore(grid, fromIdx, o)) return result;
    // Too little steady history before the bar to trust its bar lines either: the bar phase the downbeats
    // heard over the whole piece agree with best.
    const d = bestPhase(result.times.map((x) => downProbAt(act, x)), m);
    return { ...result, downbeat: d };
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
