// The signal-processing parts of the port against the prototype's own
// values (`fixtures/prototype-values.json`, made by `fixtures/make-fixtures.mjs`
// from `web/spikes/analyse/lib/` on the inputs of `fixtures/inputs.mjs`).

import { describe, expect, it } from 'vitest';
import { fft } from './fft';
import { mixToMono, resampleRatio, resampleRatioAsync, resampledLength } from './resample';
import { estimateTuning } from './tuning';
import { tonePiece } from './fixtures/inputs.mjs';
import values from './fixtures/prototype-values.json';

const close = (actual: ArrayLike<number>, expected: readonly number[], digits = 9) => {
  expect(actual.length).toBe(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};

describe('fft', () => {
  it('gives the prototype\'s spectrum', () => {
    const re = Float64Array.from(values.fft.input);
    const im = new Float64Array(64);
    fft(re, im);
    close(re, values.fft.re, 10);
    close(im, values.fft.im, 10);
  });

  it('puts a pure tone in its bin', () => {
    const n = 256;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 10 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mag = Array.from(re, (r, k) => Math.hypot(r, im[k]!));
    expect(mag[10]).toBeCloseTo(n / 2, 6);
    expect(mag[n - 10]).toBeCloseTo(n / 2, 6);
    expect(mag[11]).toBeLessThan(1e-6);
  });
});

describe('resampling', () => {
  const x = tonePiece(44100, 0.5, 0, 6);

  it('is the prototype\'s windowed-sinc resampler (tuning correction, ratio > 1)', () => {
    const y = resampleRatio(x, values.resample.ratio);
    expect(y.length).toBe(values.resample.length);
    close(y.slice(100, 108), values.resample.head, 8);
    close(y.slice(-8), values.resample.tail, 8);
    expect(Array.from(y).reduce((a, b) => a + b, 0)).toBeCloseTo(values.resample.sum, 5);
  });

  it('is the prototype\'s resampler for the 48 kHz to 22.05 kHz step, with 32 taps', () => {
    const y = resampleRatio(x, 48000 / 22050, 32);
    expect(y.length).toBe(values.resample.down.length);
    close(y.slice(100, 108), values.resample.down.head, 8);
    close(y.slice(-8), values.resample.down.tail, 8);
  });

  it('keeps the pitch of a tone when going from 48 kHz to 22.05 kHz', () => {
    const sr = 48000;
    const tone = Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / sr));
    const y = resampleRatio(tone, sr / 22050, 32);
    expect(y.length).toBe(resampledLength(tone.length, sr / 22050));
    // Count the upward zero crossings: about 1000 in the second.
    let crossings = 0;
    for (let i = 1; i < y.length; i++) if (y[i - 1]! < 0 && y[i]! >= 0) crossings++;
    expect(Math.abs(crossings - 1000)).toBeLessThanOrEqual(2);
    // And the level stays about the same away from the ends.
    const mid = y.slice(2000, 8000);
    expect(Math.max(...mid)).toBeGreaterThan(0.97);
    expect(Math.max(...mid)).toBeLessThan(1.03);
  });

  it('removes what 22.05 kHz cannot hold (no alias)', () => {
    const sr = 48000;
    const tone = Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * 15000 * i) / sr));
    const y = resampleRatio(tone, sr / 22050, 32).slice(2000, 8000);
    expect(Math.max(...y.map(Math.abs))).toBeLessThan(0.02);
  });

  it('gives the same samples in slices as in one go', async () => {
    const whole = resampleRatio(x, 1.0875, 20);
    let calls = 0;
    const sliced = await resampleRatioAsync(x, 1.0875, 20, () => void calls++, 4096);
    expect(calls).toBeGreaterThan(3);
    expect(Array.from(sliced)).toEqual(Array.from(whole));
  });

  it('mixes channels to their mean, in slices', () => {
    const l = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const r = Float32Array.from([3, 2, 1, 0, -1, -2]);
    const out = new Float32Array(6);
    mixToMono([l, r], out, 0, 3);
    mixToMono([l, r], out, 3, 6);
    expect(Array.from(out)).toEqual([2, 2, 2, 2, 2, 2]);
    const mono = new Float32Array(6);
    mixToMono([l], mono);
    expect(Array.from(mono)).toEqual(Array.from(l));
  });
});

describe('tuning', () => {
  const cases = { sharp30: [22050, 6, 30, 1], flat17: [22050, 6, -17, 7], inTune: [22050, 6, 0, 8] } as const;
  for (const [name, args] of Object.entries(cases)) {
    it(`finds what the prototype finds (${name})`, () => {
      const t = estimateTuning(tonePiece(args[0], args[1], args[2], args[3]), 22050);
      const want = values.tuning[name as keyof typeof cases];
      expect(t.cents).toBeCloseTo(want.cents, 9);
      expect(t.refHz).toBeCloseTo(want.refHz, 9);
      expect(t.confidence).toBeCloseTo(want.confidence, 9);
      expect(t.peakiness).toBeCloseTo(want.peakiness, 6);
      expect(t.peaks).toBe(want.peaks);
    });
  }

  it('is close to the real offset of the tones', () => {
    expect(estimateTuning(tonePiece(22050, 6, 30, 1), 22050).cents).toBeGreaterThan(29);
    expect(estimateTuning(tonePiece(22050, 6, 30, 1), 22050).cents).toBeLessThan(31.5);
    expect(estimateTuning(tonePiece(22050, 6, -17, 7), 22050).cents).toBeCloseTo(-17, 0);
  });

  it('says nothing for silence or a clip too short to hold one frame', () => {
    expect(estimateTuning(new Float32Array(22050 * 3), 22050)).toEqual(values.tuning.silence);
    expect(estimateTuning(new Float32Array(1000), 22050)).toEqual(values.tuning.tooShort);
  });
});
