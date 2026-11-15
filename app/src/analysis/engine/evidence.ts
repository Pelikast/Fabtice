// Shared vocabulary of the « structural » chord evidence (repeats of the form,
// known chart): bars of a beat grid, per-beat chord distributions, and how
// several sources of evidence are added to the network's own.
//
// The contract, for every source: per beat, a log-probability over the 169
// chord classes of `chords.ts` (`L_s`) and a weight `w_s ≥ 0`. The evidence
// handed to the decoder is
//
//     logp'(b, c) = log softmax( logp_net(b, c) + Σ_s w_s(b) · L_s(b, c) )
//
// i.e. a product of experts in which each source is tempered by its weight
// (a weight of 0 changes nothing; 1 is a full independent observation). A
// source never replaces the network: where the network is sure, a tempered
// source barely moves it; where the network hesitates, the sources decide.
// All functions are pure.

import { N_CHORDS, NO_CHORD, chordQual, chordRoot, type EngineQuality, type PooledUnit } from './chords';

/** Bars of a grid: beat indices per bar. Beats before the first downbeat form the pickup. */
export interface BarLayout {
  /** Beat indices of each bar, from the first downbeat on (the last bar may be short). */
  bars: number[][];
  /** Beats before the first downbeat (a pickup), not in any bar. */
  pickup: number[];
  /** Bar of each beat (-1 for the pickup). */
  barOfBeat: number[];
  /** Position of each beat in its bar, 0-based (from `numbers`). */
  posOfBeat: number[];
}

/** Bars from the beat numbers of the grid (1 = downbeat). */
export function barsOf(numbers: readonly number[]): BarLayout {
  const bars: number[][] = [];
  const pickup: number[] = [];
  const barOfBeat: number[] = [];
  const posOfBeat: number[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i]!;
    posOfBeat.push(n - 1);
    if (n === 1) bars.push([]);
    const cur = bars[bars.length - 1];
    if (!cur) {
      pickup.push(i);
      barOfBeat.push(-1);
      continue;
    }
    cur.push(i);
    barOfBeat.push(bars.length - 1);
  }
  return { bars, pickup, barOfBeat, posOfBeat };
}

/** Normalised probabilities of a unit's evidence (softmax of its mean log posterior). */
export function unitProbs(u: PooledUnit): Float64Array {
  let m = -Infinity;
  for (let c = 0; c < N_CHORDS; c++) if (u.logp[c]! > m) m = u.logp[c]!;
  const p = new Float64Array(N_CHORDS);
  let s = 0;
  for (let c = 0; c < N_CHORDS; c++) {
    p[c] = Math.exp(u.logp[c]! - m);
    s += p[c]!;
  }
  for (let c = 0; c < N_CHORDS; c++) p[c]! /= s;
  return p;
}

/** Family of a quality: major (maj, 6, maj7, 7), minor, diminished, augmented, suspended. */
export const FAMILY_OF: Record<EngineQuality, number> = {
  maj: 0, maj6: 0, maj7: 0, '7': 0,
  min: 1, min6: 1, min7: 1, minmaj7: 1,
  dim: 2, dim7: 2, hdim7: 2,
  aug: 3,
  sus2: 4, sus4: 4,
};
export const N_FAMILIES = 5;
/** Root × family classes, plus « no chord » last. */
export const N_FOLDED = 12 * N_FAMILIES + 1;

/** Folded class (root × family, or N) of a chord index. */
export function foldedClass(c: number): number {
  if (c === NO_CHORD) return N_FOLDED - 1;
  return chordRoot(c) * N_FAMILIES + FAMILY_OF[chordQual(c)!];
}

/** Probabilities folded to root × family. */
export function fold(p: ArrayLike<number>): Float64Array {
  const f = new Float64Array(N_FOLDED);
  for (let c = 0; c < N_CHORDS; c++) f[foldedClass(c)]! += p[c]!;
  return f;
}

/** Bhattacharyya coefficient of two distributions (1 = identical, 0 = disjoint). */
export function bhattacharyya(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i]! * b[i]!);
  return s;
}

export function logSumExp(v: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < v.length; i++) if (v[i]! > m) m = v[i]!;
  if (m === -Infinity) return m;
  let z = 0;
  for (let i = 0; i < v.length; i++) z += Math.exp(v[i]! - m);
  return m + Math.log(z);
}

/** One source of evidence: per beat a log-distribution (or null: nothing) and its weight. */
export interface EvidenceSource {
  name: string;
  /** Per beat: log-probabilities over the 169 classes (any additive constant), or null. */
  logp: (Float64Array | null)[];
  /** Per beat weight, ≥ 0. */
  weight: number[];
}

/**
 * The units with the sources added (see the contract at the top). `pitch`,
 * `bass` and `frames` are kept; `logp` is the normalised sum, scaled back to
 * the total mass of the network's own (a geometric mean over frames sums to
 * a little under 1): the shift is a constant per beat, which the decoder
 * does not see, and a unit with no evidence is returned as it was.
 */
export function applyEvidence(units: readonly PooledUnit[], sources: readonly EvidenceSource[]): PooledUnit[] {
  return units.map((u, b) => {
    const acc = Float64Array.from(u.logp);
    let touched = false;
    for (const s of sources) {
      const l = s.logp[b];
      const w = s.weight[b] ?? 0;
      if (!l || !(w > 0)) continue;
      touched = true;
      for (let c = 0; c < N_CHORDS; c++) acc[c]! += w * l[c]!;
    }
    if (!touched) return u;
    const shift = logSumExp(u.logp) - logSumExp(acc);
    for (let c = 0; c < N_CHORDS; c++) acc[c]! += shift;
    return { ...u, logp: acc };
  });
}
