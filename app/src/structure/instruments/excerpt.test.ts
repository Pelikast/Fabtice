import { describe, expect, it } from 'vitest';
import reference from './fixtures/reference.json';
import { excerptWindows, windowPlan, WINDOW_PEAK } from './excerpt';
import { MAX_WINDOWS } from './model';
import { TEST_SAMPLE_RATE, testSignal, type TestSignalKind } from './testSignals';

describe('windowPlan', () => {
  const sr = 1000;
  it('reads a short excerpt whole, and nothing under a second', () => {
    expect(windowPlan(6000, sr)).toEqual([{ from: 0, to: 6000 }]);
    expect(windowPlan(900, sr)).toEqual([]);
  });

  it('reads 10 s every 5 s, the end included when it is long enough', () => {
    expect(windowPlan(20000, sr)).toEqual([{ from: 0, to: 10000 }, { from: 5000, to: 15000 }, { from: 10000, to: 20000 }]);
    expect(windowPlan(21000, sr).map((w) => w.from)).toEqual([0, 5000, 10000]);
    expect(windowPlan(24000, sr).map((w) => w.from)).toEqual([0, 5000, 10000, 14000]);
  });

  it('spreads at most MAX_WINDOWS windows over a long solo', () => {
    const plan = windowPlan(600_000, sr);
    expect(plan).toHaveLength(MAX_WINDOWS);
    expect(plan[0]!.from).toBe(0);
    expect(plan[plan.length - 1]!.to).toBe(600_000);
  });
});

describe('excerptWindows', () => {
  it('leaves silence out', () => {
    expect(excerptWindows(new Float32Array(48000 * 12), 48000)).toEqual([]);
    expect(excerptWindows(new Float32Array(0), 48000)).toEqual([]);
  });

  it('leaves out a window much quieter than the loudest', () => {
    const sr = 16000;
    const x = new Float32Array(sr * 20);
    for (let i = 0; i < sr * 10; i++) x[i] = 0.5 * Math.sin(i * 0.1);
    for (let i = sr * 15; i < sr * 20; i++) x[i] = 0.001 * Math.sin(i * 0.1);
    // Windows at 0, 5 and 10 s: the last one holds only the very quiet tail.
    expect(excerptWindows(x, sr)).toHaveLength(2);
  });

  it('resamples to 16 kHz as the bench does, at a peak of 0.5', () => {
    for (const kind of ['reed', 'plucked'] as TestSignalKind[]) {
      const ref = reference.signals[kind];
      const x = testSignal(kind, reference.seconds);
      [100, 5000, 44100, 200000].forEach((i, k) => expect(x[i]).toBeCloseTo(ref.input[k]!, 5));
      const [w] = excerptWindows(x, TEST_SAMPLE_RATE);
      expect(w!.length).toBe(Math.floor((x.length * 16000) / TEST_SAMPLE_RATE));
      expect(Math.max(...w!.map(Math.abs))).toBeCloseTo(WINDOW_PEAK, 5);
      ref.resampled_index.forEach((i, k) => expect(Math.abs(w![i]! - ref.resampled[k]!)).toBeLessThan(0.01));
    }
  });
});
