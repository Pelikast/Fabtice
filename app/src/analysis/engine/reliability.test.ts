// The reliability model: absent sources weigh nothing, agreeing sources raise
// the probability, a clear network posterior counts more than a hesitant one.

import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES, RELIABILITY_DOUBT, RELIABILITY_MODEL, reliability, reliabilityFeatures, type ReliabilityFeatures } from './reliability';
import type { ChordSegment } from './decode';
import { ix, rng, unit } from './structure.fixtures';

const seg = (chord: number, beats: number[], posterior = 0.8): ChordSegment => ({
  chord, beats, t0: 0, t1: 1, posterior, confidence: 0.5, alternatives: [], pitch: [], extensions: [], bass: null,
});

const plain: ReliabilityFeatures = { logNet: Math.log(0.4), logPost: Math.log(0.8), margin: 1, hasRepeats: 0, repeatAgree: 0, hasChart: 0, chartExact: 0, chartFamily: 0, logBeats: Math.log(4) };

describe('reliability', () => {
  it('is a probability, higher when the network is surer', () => {
    const lo = reliability({ ...plain, logNet: Math.log(0.1), margin: -0.5 });
    const hi = reliability({ ...plain, logNet: Math.log(0.8), margin: 3 });
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    expect(hi).toBeGreaterThan(lo);
    expect(RELIABILITY_DOUBT).toBe(0.5);
  });

  it('rises when the chart and the other choruses agree with the chord', () => {
    const withChart = reliability({ ...plain, hasChart: 1, chartExact: 1, chartFamily: 1 });
    const againstChart = reliability({ ...plain, hasChart: 1, chartExact: 0, chartFamily: 0 });
    expect(withChart).toBeGreaterThan(againstChart);
    const withRepeats = reliability({ ...plain, hasRepeats: 1, repeatAgree: 0.9 });
    const againstRepeats = reliability({ ...plain, hasRepeats: 1, repeatAgree: 0.05 });
    expect(withRepeats).toBeGreaterThan(againstRepeats);
  });

  it('computes features from the segments, with absent sources at zero', () => {
    const r = rng(5);
    const c = ix(7, '7');
    const units = [unit(c, 0.6, r), unit(c, 0.6, r), unit(ix(0, 'maj7'), 0.3, r)];
    const f = reliabilityFeatures([seg(c, [0, 1]), seg(ix(0, 'maj7'), [2])], units, null, null);
    expect(f).toHaveLength(2);
    expect(f[0]!.logNet).toBeCloseTo(Math.log(0.6), 6);
    expect(f[0]!.margin).toBeGreaterThan(0);
    expect(f[0]!.hasRepeats).toBe(0);
    expect(f[0]!.hasChart).toBe(0);
    expect(f[0]!.chartExact).toBe(0);
    expect(f[1]!.logBeats).toBe(0);
    for (const k of FEATURE_NAMES) expect(Number.isFinite(RELIABILITY_MODEL.coef[k])).toBe(true);
  });
});
