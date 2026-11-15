// Repeats of the form as soft chord evidence (CLAUDE.md, analysis, means 2:
// « profiter des reprises, sans recopier bêtement »).
//
// 1. Every bar gets a picture of its harmony: per beat, the network's chord
//    distribution folded to root × family (so a maj7 played as a 6, or a 9
//    added on the second chorus, still looks alike).
// 2. Bar-to-bar similarity (Bhattacharyya, mean over the beats). For each lag
//    L (in bars), the mean similarity of bar i with bar i + L: the lags of
//    the form stand out (12 for a blues, 32 for an AABA standard, 8 inside
//    it…). Only lags that stand out well above the others are kept.
// 3. Two bars at a kept lag are partners when their NEIGHBOURHOOD matches
//    (the bars around them, the bar itself left out: a bar the network
//    misheard still gets help from the bars around it, and an intro, a coda
//    or a tag, whose neighbourhood matches nothing, gets none).
// 4. Each beat gets the mixture of its own distribution and its partners'
//    (same position in the bar), as evidence of weight `weight`. Because the
//    beat's own reading is part of the mixture, a bar whose own evidence is
//    clear keeps its chord even when every other chorus plays another one
//    (a reharmonisation): the penalty for disagreeing with the others is at
//    most weight × log(1 + partners). Where the bar's own evidence hesitates,
//    the other choruses decide.
//
// No lag stands out (a single pass, a through-composed piece) → no evidence.
// Pure; costs O(bars² × beats per bar × 61).

import { N_CHORDS, type PooledUnit } from './chords';
import { barsOf, bhattacharyya, fold, unitProbs, type BarLayout, type EvidenceSource } from './evidence';

export interface RepeatOptions {
  /** Shortest lag considered, in bars. */
  minLag: number;
  /** A lag is kept when it stands out from the lags 2 to 4 away by this many robust deviations… */
  lagZ: number;
  /** …and by at least this much (similarity units). */
  lagMargin: number;
  /** Floor of the lags' robust spread (similarity units). */
  minSpread: number;
  /** At least this many lags must be measurable (else: no form; a single pass of 16 bars has 5). */
  minLags: number;
  /** A lag needs at least this many bar pairs. */
  minPairs: number;
  /** Bars on each side of the pair that make its neighbourhood. */
  window: number;
  /** Neighbourhood similarity below which two bars are not partners; full partners from `simHigh`. */
  simLow: number;
  simHigh: number;
  /** Weight of the pooled evidence (see `evidence.ts`). */
  weight: number;
  /** Floor of the mixture (keeps log finite). */
  floor: number;
}

export const REPEAT_DEFAULTS: RepeatOptions = {
  minLag: 4,
  lagZ: 3,
  lagMargin: 0.1,
  minSpread: 0.04,
  minPairs: 8,
  minLags: 6,
  window: 2,
  simLow: 0.2,
  simHigh: 0.5,
  weight: 1,
  floor: 1e-4,
};

export interface LagScore {
  lag: number;
  /** Mean similarity of the bar pairs at this lag. */
  score: number;
  /** In robust deviations above the median lag. */
  z: number;
}

export interface RepeatAnalysis {
  layout: BarLayout;
  /** Lags kept, best first. */
  lags: LagScore[];
  /** Every lag's score (diagnostics). */
  allLags: LagScore[];
  /** The form's length in bars (the best kept lag; null: no form found). */
  formLength: number | null;
  /** First bar of each chorus (bar index), when a form was found. Bars before the first are an intro, after the last chorus a coda. */
  choruses: { start: number; end: number }[];
  /** Partners of each bar: other bar and weight in (0, 1]. */
  partners: { bar: number; weight: number }[][];
  /** Sum of the partners' weights, per bar. */
  support: number[];
  /** The evidence: per beat the log of the mixture (null where the bar has no partner), and its weight. */
  source: EvidenceSource;
  /** Per beat, the probability the mixture gives to each chord (null: none): for the reliability. */
  mixture: (Float64Array | null)[];
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Similarity of two bars: mean over the beat positions both have. */
function barSimilarity(a: readonly number[], b: readonly number[], folded: readonly Float64Array[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let k = 0; k < n; k++) s += bhattacharyya(folded[a[k]!]!, folded[b[k]!]!);
  return s / n;
}

/** Find the repeats of the form and the evidence they give. `numbers`: beat numbers of the grid (1 = downbeat). */
export function findRepeats(units: readonly PooledUnit[], numbers: readonly number[], options: Partial<RepeatOptions> = {}): RepeatAnalysis {
  const o = { ...REPEAT_DEFAULTS, ...options };
  const layout = barsOf(numbers);
  const nb = layout.bars.length;
  const probs = units.map(unitProbs);
  const folded = probs.map(fold);
  const none: RepeatAnalysis = {
    layout,
    lags: [],
    allLags: [],
    formLength: null,
    choruses: [],
    partners: layout.bars.map(() => []),
    support: layout.bars.map(() => 0),
    source: { name: 'repeats', logp: units.map(() => null), weight: units.map(() => 0) },
    mixture: units.map(() => null),
  };
  if (nb < o.minLag + o.minPairs) return none;
  // bar similarity matrix
  const S: Float64Array[] = layout.bars.map(() => new Float64Array(nb));
  for (let i = 0; i < nb; i++) {
    S[i]![i] = 1;
    for (let j = i + 1; j < nb; j++) {
      const v = barSimilarity(layout.bars[i]!, layout.bars[j]!, folded);
      S[i]![j] = v;
      S[j]![i] = v;
    }
  }
  // relative to the piece's own background: two unrelated bars are not at 0
  // (the network's leftover mass overlaps), so similarities are measured from
  // the median pair (0) to identical bars (1)
  const off: number[] = [];
  for (let i = 0; i < nb; i++) for (let j = i + 1; j < nb; j++) off.push(S[i]![j]!);
  const bg = Math.min(0.95, median(off));
  for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) S[i]![j] = Math.max(0, (S[i]![j]! - bg) / (1 - bg));
  // lag scores: mean similarity at each lag, then how much it stands out
  // from the lags 2 to 4 away (a vamp makes every short lag alike, the
  // similarity decays with the lag: only a peak means a repeat). Lags ±1 are
  // left out of the reference, so a peak spread over three lags (a beat lost
  // or added somewhere shifts the bars by one) still counts.
  const maxLag = nb - Math.max(o.minPairs, Math.ceil(nb / 3));
  // too few lags to tell a peak from the rest (a single pass of a 16-bar form): no form
  if (maxLag - o.minLag + 1 < o.minLags) return none;
  const raw: number[] = [0];
  for (let L = 1; L <= nb - 1; L++) {
    let s = 0;
    for (let i = 0; i + L < nb; i++) s += S[i]![i + L]!;
    raw.push(s / (nb - L));
  }
  const all: LagScore[] = [];
  for (let L = 1; L <= maxLag; L++) {
    const ref: number[] = [];
    for (const d of [-4, -3, -2, 2, 3, 4]) if (L + d >= 1 && L + d <= nb - 1) ref.push(raw[L + d]!);
    all.push({ lag: L, score: raw[L]!, z: raw[L]! - median(ref) });
  }
  const peaks = all.filter((x) => x.lag >= o.minLag).map((x) => x.z);
  // (with few lags the spread says little: it has a floor)
  const spread = Math.max(o.minSpread, median(peaks.map((v) => Math.abs(v - median(peaks)))) * 1.4826);
  for (const x of all) x.z /= spread;
  const kept = all
    .filter((x) => x.lag >= o.minLag && x.z >= o.lagZ && x.z * spread >= o.lagMargin)
    // local maxima only, within ±2 lags (the neighbours of a peak are its shadow)
    .filter((x) => all.every((y) => Math.abs(y.lag - x.lag) > 2 || y.lag === x.lag || y.z <= x.z))
    .sort((a, b) => b.z - a.z);
  if (!kept.length) return { ...none, allLags: all };
  // the form: among kept lags close to the best, the shortest (12 rather than its multiple 24)
  const topZ = kept[0]!.z;
  const formLength = kept.filter((x) => x.z >= 0.6 * topZ).reduce((m, x) => Math.min(m, x.lag), Infinity);
  // lags searched for partners: those kept and the multiples of the form (later choruses), each ±1 bar
  const lagSet = new Set<number>(kept.map((x) => x.lag));
  for (let k = 2; k * formLength < nb; k++) lagSet.add(k * formLength);
  const near = (i: number, j: number): number => {
    let s = 0;
    let n = 0;
    for (let d = -o.window; d <= o.window; d++) {
      if (d === 0) continue;
      const a = i + d;
      const b = j + d;
      if (a < 0 || b < 0 || a >= nb || b >= nb) continue;
      s += S[a]![b]!;
      n++;
    }
    return n ? s / n : 0;
  };
  const partners: { bar: number; weight: number }[][] = layout.bars.map(() => []);
  for (let i = 0; i < nb; i++) {
    const seen = new Set<number>();
    for (const L of lagSet) {
      for (const sign of [-1, 1]) {
        // the best of j = i ± (L − 1, L, L + 1): bars shifted by a lost or added beat still meet
        let bestJ = -1;
        let bestSim = -1;
        for (const e of [0, -1, 1]) {
          const j = i + sign * (L + e);
          if (j < 0 || j >= nb || j === i) continue;
          const v = near(i, j);
          if (v > bestSim + 1e-9) {
            bestSim = v;
            bestJ = j;
          }
        }
        if (bestJ < 0 || seen.has(bestJ)) continue;
        const w = Math.max(0, Math.min(1, (bestSim - o.simLow) / (o.simHigh - o.simLow)));
        if (w > 0) {
          partners[i]!.push({ bar: bestJ, weight: w });
          seen.add(bestJ);
        }
      }
    }
  }
  const support = partners.map((p) => p.reduce((s, x) => s + x.weight, 0));
  // choruses: from the first bar that has a partner at the form's lag to the last one
  const choruses: { start: number; end: number }[] = [];
  // (a bar of a chorus resembles its partner itself, not only around it: an intro bar next to the first chorus does not)
  const atForm = (i: number) => partners[i]!.some((p) => { const r = Math.abs(p.bar - i) % formLength; return (r <= 1 || r >= formLength - 1) && S[i]![p.bar]! >= o.simHigh; });
  let first = -1;
  let last = -1;
  for (let i = 0; i < nb; i++) if (atForm(i)) {
    if (first < 0) first = i;
    last = i;
  }
  if (first >= 0) for (let s = first; s <= last; s += formLength) choruses.push({ start: s, end: Math.min(s + formLength, last + 1) - 1 });
  // the evidence: mixture of the beat's own distribution and its partners' at the same position
  const logp: (Float64Array | null)[] = units.map(() => null);
  const weight = units.map(() => 0);
  const mixture: (Float64Array | null)[] = units.map(() => null);
  for (let i = 0; i < nb; i++) {
    if (!partners[i]!.length) continue;
    const beats = layout.bars[i]!;
    for (let k = 0; k < beats.length; k++) {
      const b = beats[k]!;
      const mix = Float64Array.from(probs[b]!);
      let tot = 1;
      for (const p of partners[i]!) {
        const pb = layout.bars[p.bar]![k];
        if (pb === undefined) continue;
        const q = probs[pb]!;
        for (let c = 0; c < N_CHORDS; c++) mix[c]! += p.weight * q[c]!;
        tot += p.weight;
      }
      if (tot === 1) continue;
      const l = new Float64Array(N_CHORDS);
      for (let c = 0; c < N_CHORDS; c++) {
        mix[c] = (1 - o.floor) * (mix[c]! / tot) + o.floor / N_CHORDS;
        l[c] = Math.log(mix[c]!);
      }
      logp[b] = l;
      weight[b] = o.weight;
      mixture[b] = mix;
    }
  }
  return { layout, lags: kept, allLags: all, formLength, choruses, partners, support, source: { name: 'repeats', logp, weight }, mixture };
}
