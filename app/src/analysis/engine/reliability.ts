// One probability that a decoded chord is right (root and colour), from every
// source of evidence: the network's own posterior, the decoder's, the repeats
// of the form (`repeats.ts`) and the known chart (`knownChart.ts`). A logistic
// model over a few features, fitted on the development half of the chord
// bench (web/spikes/accords/, `banc/structure.ts`) and checked on the other
// half; « doubtful » then means « more likely wrong than right » (p < 0.5).
//
// The features are absent-aware: a source that is not there (no form found,
// no chart, or a chart rejected) contributes exactly 0, so the model is the
// same function with or without it. A new source (bass, separated stems)
// adds one or two features and a refit.

import { N_CHORDS, type PooledUnit } from './chords';
import type { ChordSegment } from './decode';
import { foldedClass, unitProbs } from './evidence';
import type { ChartFit } from './knownChart';
import type { RepeatAnalysis } from './repeats';

export interface ReliabilityFeatures {
  /** log of the geometric mean of the network's own posterior for the chord over the segment (before any structural evidence). */
  logNet: number;
  /** log of the decoder's marginal for the chord (mean over the segment). */
  logPost: number;
  /** The network's margin: log p(chord) − log p(best other chord), mean over the segment. */
  margin: number;
  /** 1 when the segment has repeat partners; then the mixture's probability of the chord (mean), else 0. */
  hasRepeats: number;
  repeatAgree: number;
  /** 1 when an accepted chart covers the segment (local fit > 0); its chord equal to the decoded one (exact / root and family), weighted by the local fit. */
  hasChart: number;
  chartExact: number;
  chartFamily: number;
  /** log of the segment's length in beats. */
  logBeats: number;
}

export const FEATURE_NAMES: (keyof ReliabilityFeatures)[] = ['logNet', 'logPost', 'margin', 'hasRepeats', 'repeatAgree', 'hasChart', 'chartExact', 'chartFamily', 'logBeats'];

/**
 * Coefficients of the logistic model, fitted on the development half of the bench (banc/partage.json,
 * shared with the other chord work; repeats and known chart both on; each of the four conditions —
 * synthetic clean, synthetic old record, GuitarSet, GuitarSet old record — weighing the same; small
 * ridge), by `node dist/structure.mjs --fit`. On the held-out half: Brier 0.177 (the network's
 * geometric mean read as a probability: 0.257), mean calibration gap 4.3 % (13.6 %).
 */
export const RELIABILITY_MODEL: { intercept: number; coef: Record<keyof ReliabilityFeatures, number> } = {
  intercept: 0.7313,
  coef: {
    logNet: 0.2113,
    logPost: 0.99,
    margin: 0.5034,
    hasRepeats: -0.2914,
    repeatAgree: 1.0482,
    hasChart: -0.245,
    chartExact: 4.8626,
    chartFamily: -0.2177,
    logBeats: -0.5324,
  },
};

/** Features of each segment. `raw`: the network's units before any structural evidence. */
export function reliabilityFeatures(
  segments: readonly ChordSegment[],
  raw: readonly PooledUnit[],
  repeats: RepeatAnalysis | null,
  chart: ChartFit | null,
): ReliabilityFeatures[] {
  const probs = raw.map(unitProbs);
  return segments.map((s) => {
    const n = s.beats.length;
    let geo = 0;
    let margin = 0;
    let rep = 0;
    let repN = 0;
    let ch = 0;
    let chExact = 0;
    let chFam = 0;
    const fc = foldedClass(s.chord);
    for (const b of s.beats) {
      const u = raw[b]!;
      geo += u.logp[s.chord]! / n;
      const p = probs[b]!;
      let other = 0;
      for (let c = 0; c < N_CHORDS; c++) if (c !== s.chord && p[c]! > other) other = p[c]!;
      margin += (Math.log(p[s.chord]! + 1e-9) - Math.log(other + 1e-9)) / n;
      const mix = repeats?.mixture[b];
      if (mix) {
        rep += mix[s.chord]!;
        repN++;
      }
      const cc = chart?.accepted ? chart.chordOfBeat[b] : null;
      const fit = chart?.accepted ? chart.fitOfBeat[b]! : 0;
      if (cc !== null && cc !== undefined && fit > 0) {
        ch += fit;
        if (cc === s.chord) chExact += fit;
        if (foldedClass(cc) === fc) chFam += fit;
      }
    }
    let post = 0;
    // the decoder's posterior is the segment's own mean marginal
    post = Math.log(Math.max(1e-9, s.posterior));
    return {
      logNet: geo,
      logPost: post,
      margin,
      hasRepeats: repN ? 1 : 0,
      repeatAgree: repN ? rep / repN : 0,
      hasChart: ch > 0 ? 1 : 0,
      chartExact: chExact / n,
      chartFamily: chFam / n,
      logBeats: Math.log(n),
    };
  });
}

/** Probability that the chord is right (root and colour). */
export function reliability(f: ReliabilityFeatures, model = RELIABILITY_MODEL): number {
  let z = model.intercept;
  for (const k of FEATURE_NAMES) z += model.coef[k] * f[k];
  return 1 / (1 + Math.exp(-z));
}

/** « Doubtful »: more likely wrong than right. */
export const RELIABILITY_DOUBT = 0.5;
