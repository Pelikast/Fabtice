// Repair of the beat sequence, between the beat picking and the bars.
//
// Why. The beats are the network's peaks, taken as they are (« minimal »
// post-processing: no tempo model). Where the network loses the pulse for a
// moment (a wind solo over a faint rhythm section, a worn passage of an old
// record) it can drop a beat, add one, or follow another rate for a few
// beats. The app's grid is a list of beats with ONE first downbeat and ONE
// metre (`grid/beats.ts#tempoMapFromBeats`): bars are counted every N beats
// from that downbeat. A single beat too many or too few therefore shifts every
// bar after it, and the bar-by-bar tempo curve shows a bump where the beats
// are too close or too far apart.
//
// Two repairs, both pure:
//
//   1. Tempo (the owner's rule). A short deviation of the beat intervals that
//      comes back to the tempo before it is not believed: its beats are
//      replaced by beats at the surrounding tempo, as many as the surrounding
//      tempo implies. A new tempo that holds (longer than `maxBeats`), a slow
//      change (each interval close to its neighbours: rubato, ritardando,
//      accelerando), a passage that does not last a whole number of beats at
//      the surrounding tempo (a fermata), or one at the very start or end of
//      the piece (a free introduction, a final ritardando) is kept. The
//      downbeat evidence on both sides has the last word: when it says that
//      the beats as found keep the bars in place, they are kept.
//
//   2. Bars. Where the downbeat evidence after a passage says the bars have
//      moved by one or two beats although the tempo did not deviate enough
//      for the first repair (a slow slip of the network onto another beat),
//      the passage nearest that change whose duration is the corrected number
//      of beats at the surrounding tempo is refilled with that number.
//
// Then a single bar phase is chosen from the whole piece (`bestPhase`): a
// local accident can no longer decide the bars of everything after it.
//
// The thresholds are measured (`repair.cases.ts`, `repair.eval.test.ts`,
// app/README.md « Réparation des temps »).

import type { RepairedPassage } from '../types';
import { inferMeter } from './meter';

export interface RepairOptions {
  /** Beat intervals on each side for the local tempo of an interval. */
  window: number;
  /** An interval is out of tempo when |ln(interval / local interval)| exceeds this. */
  flag: number;
  /** In-tempo intervals allowed between two out-of-tempo ones of the same passage. */
  gap: number;
  /** Beats the kept ends of a passage may be moved outwards, in all, to find the best fit. */
  extend: number;
  /** Intervals on each side of a passage that give the tempo before and after it. */
  context: number;
  /** Of which at least this many must be in tempo (else: start or end of the piece, nothing is done). */
  contextMin: number;
  /** A side is in tempo when every in-tempo interval is within this of their median (|ln|). */
  steady: number;
  /** The tempo after the passage is the tempo before it when |ln(after / before)| is at most this. */
  back: number;
  /** Longest passage repaired, in beats of the surrounding tempo: beyond, a tempo that holds. */
  maxBeats: number;
  /** The passage must last a whole number of beats at the surrounding tempo, within this many beats. */
  fit: number;
  /** The same, for the bar repair (led by the downbeat evidence, which then has to agree). */
  barFit: number;
  /** Downbeat evidence (log-likelihood, nats) needed to overrule the timing decision. */
  veto: number;
  /** Bars on each side of a passage whose downbeat evidence is weighed. */
  bars: number;
  /** Largest bar shift (in beats) the bar repair corrects. */
  maxShift: number;
  /** Also refill a passage whose count is right (only its beats' placing deviates). */
  regularize: boolean;
}

export const REPAIR: RepairOptions = {
  window: 12,
  flag: Math.log(1.3),
  gap: 3,
  extend: 0,
  context: 8,
  contextMin: 4,
  steady: Math.log(1.2),
  back: Math.log(1.2),
  maxBeats: 16,
  fit: 0.2,
  barFit: 0.3,
  veto: 2,
  bars: 12,
  maxShift: 2,
  regularize: true,
};

export type { RepairedPassage };

export interface RepairResult {
  beats: number[];
  repairs: RepairedPassage[];
}

/** Probability that a downbeat falls at time t (the network's downbeat output there). */
export type DownbeatAt = (t: number) => number;

function median(values: number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2;
}

const intervals = (beats: readonly number[]) => beats.slice(1).map((t, i) => t - beats[i]!);

/**
 * Out-of-tempo intervals: each interval against the median of its neighbours,
 * twice (the second time without the intervals the first pass found out of
 * tempo, over a wider window, so that a burst does not make its own tempo).
 */
export function outOfTempo(beats: readonly number[], o: RepairOptions = REPAIR): boolean[] {
  const d = intervals(beats);
  const n = d.length;
  const ref1 = d.map((_, i) => {
    const v: number[] = [];
    for (let j = Math.max(0, i - o.window); j <= Math.min(n - 1, i + o.window); j++) if (j !== i) v.push(d[j]!);
    return v.length ? median(v) : d[i]!;
  });
  const flag1 = d.map((x, i) => Math.abs(Math.log(x / ref1[i]!)) > o.flag);
  return d.map((x, i) => {
    const v: number[] = [];
    for (let j = Math.max(0, i - 2 * o.window); j <= Math.min(n - 1, i + 2 * o.window); j++) if (j !== i && !flag1[j]) v.push(d[j]!);
    const ref = v.length >= 3 ? median(v) : ref1[i]!;
    return Math.abs(Math.log(x / ref)) > o.flag;
  });
}

/**
 * The tempo (median interval) on one side of beat `at`: up to `context`
 * intervals, the in-tempo ones only; null when they are too few or not
 * steady (median deviation above `steady`: a free introduction, the very
 * start or end of the piece).
 */
function sideInterval(d: readonly number[], bad: readonly boolean[], at: number, dir: -1 | 1, o: RepairOptions): number | null {
  const v: number[] = [];
  for (let k = 0; k < o.context; k++) {
    const j = dir < 0 ? at - 1 - k : at + k;
    if (j < 0 || j >= d.length) return null; // too near the start or the end of the piece
    if (!bad[j]) v.push(d[j]!);
  }
  if (v.length < o.contextMin) return null;
  const p = median(v);
  return Math.max(...v.map((x) => Math.abs(Math.log(x / p)))) <= o.steady ? p : null;
}

/** `count` intervals from `t0` to `t1`, going from `p0` to `p1` and scaled to fit exactly: the inner beats. */
export function fillBeats(t0: number, t1: number, count: number, p0: number, p1: number): number[] {
  const p = Array.from({ length: count }, (_, j) => p0 + ((p1 - p0) * (j + 0.5)) / count);
  const scale = (t1 - t0) / p.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let t = t0;
  for (let j = 0; j < count - 1; j++) {
    t += p[j]! * scale;
    out.push(t);
  }
  return out;
}

const clampLog = (q: number) => {
  const x = Math.min(0.98, Math.max(0.02, q));
  return { on: Math.log(x), off: Math.log(1 - x) };
};

/** Log-likelihood of a downbeat-probability sequence for each bar phase φ (beat i at position (i + φ) mod m, 0 = downbeat). */
export function phaseScores(probs: readonly number[], m: number): number[] {
  const s = new Array<number>(m).fill(0);
  probs.forEach((q, i) => {
    const e = clampLog(q);
    for (let phi = 0; phi < m; phi++) s[phi]! += (i + phi) % m === 0 ? e.on : e.off;
  });
  return s;
}

/** The single bar phase that fits the whole piece best: index of the first beat numbered 1. */
export function bestPhase(probs: readonly number[], m: number): number {
  const s = phaseScores(probs, m);
  let phi = 0;
  for (let k = 1; k < m; k++) if (s[k]! > s[phi]!) phi = k;
  // Beat i is a downbeat when (i + phi) % m === 0.
  return (m - phi) % m;
}

/** How well the downbeats around a passage agree with one way of filling it (best phase, nats). */
function evidence(beats: readonly number[], s: number, e: number, inner: readonly number[], m: number, o: RepairOptions, downAt: DownbeatAt): number {
  const w = o.bars * m;
  const times = [...beats.slice(Math.max(0, s - w), s + 1), ...inner, ...beats.slice(e, Math.min(beats.length, e + w + 1))];
  return Math.max(...phaseScores(times.map(downAt), m));
}

interface Candidate {
  s: number;
  e: number;
  inner: number[];
  cause: RepairedPassage['cause'];
}

function apply(beats: readonly number[], cands: Candidate[]): number[] {
  const out: number[] = [];
  let i = 0;
  for (const c of cands.slice().sort((a, b) => a.s - b.s)) {
    while (i <= c.s) out.push(beats[i++]!);
    out.push(...c.inner);
    i = c.e;
  }
  while (i < beats.length) out.push(beats[i++]!);
  return out;
}

/** The tempo repair (the owner's rule). `m`: beats per bar, for the downbeat evidence. */
export function repairTempo(beats: readonly number[], m: number, downAt: DownbeatAt | null, o: RepairOptions = REPAIR): RepairResult {
  if (beats.length < 2 * o.contextMin + 2) return { beats: beats.slice(), repairs: [] };
  const d = intervals(beats);
  const bad = outOfTempo(beats, o);
  // Passages: runs of out-of-tempo intervals, at most `gap` in-tempo ones apart.
  const runs: [number, number][] = [];
  for (let i = 0; i < d.length; i++) {
    if (!bad[i]) continue;
    const last = runs[runs.length - 1];
    if (last && i - last[1] <= o.gap + 1) last[1] = i;
    else runs.push([i, i]);
  }
  const cands: Candidate[] = [];
  const repairs: RepairedPassage[] = [];
  let previousEnd = 0;
  for (const [a, b] of runs) {
    // The two beats kept on either side: the run's ends, or (`extend` > 0, off by default:
    // measured, it breaks more than it mends without downbeat evidence) a few beats further out.
    let pick: { s: number; e: number; before: number; after: number; k: number; misfit: number } | null = null;
    for (let ext = 0; ext <= o.extend; ext++) {
      for (let ds = 0; ds <= ext; ds++) {
        const s = a - ds;
        const e = b + 1 + ext - ds;
        if (s < previousEnd || e >= beats.length) continue;
        const before = sideInterval(d, bad, s, -1, o);
        const after = sideInterval(d, bad, e, 1, o);
        if (before === null || after === null) continue; // start or end of the piece
        if (Math.abs(Math.log(after / before)) > o.back) continue; // the tempo does not come back
        const span = beats[e]! - beats[s]!;
        const p = Math.sqrt(before * after);
        const k = Math.round(span / p);
        if (k < 1 || k > o.maxBeats) continue; // a tempo that holds
        const misfit = Math.abs(span / p - k);
        if (misfit > o.fit) continue; // not a whole number of beats: a fermata, a real bend
        // Moved ends only to correct a count (a passage whose count is right is refilled as found, or kept).
        if (ext > 0 && k === e - s) continue;
        if (!pick || misfit < pick.misfit - 0.05) pick = { s, e, before, after, k, misfit };
      }
    }
    if (!pick) continue;
    const { s, e, before, after, k } = pick;
    const found = e - s;
    if (found === 1 && k === 1) continue; // one interval, nothing inside to place
    const inner = fillBeats(beats[s]!, beats[e]!, k, before, after);
    if (found === k && !o.regularize) continue; // the count is right: the bars are not moved, the beats stay as found
    if (downAt) {
      const asFound = evidence(beats, s, e, beats.slice(s + 1, e), m, o, downAt);
      const asFilled = evidence(beats, s, e, inner, m, o, downAt);
      if (asFound - asFilled > o.veto) continue; // the downbeats say the bars are right as found
    }
    cands.push({ s, e, inner, cause: 'tempo' });
    previousEnd = e;
    repairs.push({ start: beats[s]!, end: beats[e]!, found: found - 1, placed: k - 1, cause: 'tempo' });
  }
  return { beats: apply(beats, cands), repairs };
}

/**
 * The bar repair: where the metre's path (which may restart the bar, at a
 * cost) restarts it, look for the passage before that restart whose duration
 * is the corrected number of beats at the surrounding tempo, and refill it.
 */
export function repairBars(beats: readonly number[], m: number, downAt: DownbeatAt, o: RepairOptions = REPAIR): RepairResult {
  let cur = beats.slice();
  const repairs: RepairedPassage[] = [];
  for (let round = 0; round < 8; round++) {
    const numbers = inferMeter(cur.map(downAt), { fixed: m }).numbers;
    const d = intervals(cur);
    const bad = outOfTempo(cur, o);
    let done = false;
    for (let i = 1; i < numbers.length && !done; i++) {
      const expected = (numbers[i - 1]! % m) + 1;
      if (numbers[i] === expected) continue;
      const missing = (((numbers[i]! - expected) % m) + m) % m; // beats missing before i
      const shifts = [missing, missing - m].filter((x) => x !== 0 && Math.abs(x) <= o.maxShift);
      let best: (Candidate & { misfit: number }) | null = null;
      // The accident lies somewhere between the last bar the metre found in the old phase and the first in the new one.
      const lo = Math.max(1, i - o.maxBeats - m);
      const hi = Math.min(cur.length - 2, i + o.maxBeats + m);
      for (let s = lo; s < hi; s++) {
        const before = sideInterval(d, bad, s, -1, o);
        if (before === null) continue;
        for (let e = s + 1; e <= hi && e - s <= o.maxBeats; e++) {
          const after = sideInterval(d, bad, e, 1, o);
          if (after === null || Math.abs(Math.log(after / before)) > o.back) continue;
          const p = Math.sqrt(before * after);
          const span = cur[e]! - cur[s]!;
          for (const shift of shifts) {
            const k = e - s + shift;
            if (k < 1 || k > o.maxBeats) continue;
            const misfit = Math.abs(span / p - k);
            if (misfit > o.barFit) continue;
            if (best && (misfit > best.misfit + 1e-9 || (Math.abs(misfit - best.misfit) <= 1e-9 && e - s >= best.e - best.s))) continue;
            best = { s, e, inner: fillBeats(cur[s]!, cur[e]!, k, before, after), cause: 'bar', misfit };
          }
        }
      }
      if (!best) continue;
      const asFound = evidence(cur, best.s, best.e, cur.slice(best.s + 1, best.e), m, o, downAt);
      const asFilled = evidence(cur, best.s, best.e, best.inner, m, o, downAt);
      if (asFilled - asFound < o.veto) continue;
      repairs.push({ start: cur[best.s]!, end: cur[best.e]!, found: best.e - best.s - 1, placed: best.inner.length, cause: 'bar' });
      cur = apply(cur, [best]);
      done = true;
    }
    if (!done) break;
  }
  return { beats: cur, repairs };
}

/** Both repairs, in order. Without downbeat evidence only the tempo repair runs, on timing alone. */
export function repairBeats(beats: readonly number[], m: number, downAt: DownbeatAt | null, o: RepairOptions = REPAIR): RepairResult {
  const tempo = repairTempo(beats, m, downAt, o);
  if (!downAt) return tempo;
  const bars = repairBars(tempo.beats, m, downAt, o);
  return { beats: bars.beats, repairs: [...tempo.repairs, ...bars.repairs].sort((a, b) => a.start - b.start) };
}
