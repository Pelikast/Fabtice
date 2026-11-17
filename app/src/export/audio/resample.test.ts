// The sampling-rate converter of the Wave export: measured, not assumed.

import { describe, expect, it } from 'vitest';
import { SincResampler } from './resample';

const sine = (n: number, rate: number, hz: number, amp = 0.5, phase = 0) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate + phase);
  return a;
};

/** Converts a whole signal, block by block (as the encoder does). */
function convert(src: Float32Array, inRate: number, outRate: number, block = 4096): Float32Array {
  const rs = new SincResampler(inRate, outRate);
  const total = rs.outFrames(src.length);
  const out = new Float32Array(total);
  const read = (start: number, buf: Float32Array) => {
    for (let i = 0; i < buf.length; i++) {
      const k = start + i;
      buf[i] = k >= 0 && k < src.length ? src[k]! : 0;
    }
  };
  let scratch: Float32Array | undefined;
  for (let s = 0; s < total; s += block) scratch = rs.renderBlock(read, s, out.subarray(s, Math.min(total, s + block)), scratch);
  return out;
}

/** Amplitude of the component at `hz` over frames [from, to) (a single-bin Fourier sum). */
function amplitudeAt(x: Float32Array, rate: number, hz: number, from: number, to: number): number {
  let re = 0;
  let im = 0;
  for (let i = from; i < to; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / (to - from - 1)); // Hann: keeps the neighbours out of the bin
    re += w * x[i]! * Math.cos((2 * Math.PI * hz * i) / rate);
    im += w * x[i]! * Math.sin((2 * Math.PI * hz * i) / rate);
  }
  let wsum = 0;
  for (let i = from; i < to; i++) wsum += 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - from)) / (to - from - 1));
  return (2 * Math.hypot(re, im)) / wsum;
}

const db = (ratio: number) => 20 * Math.log10(Math.max(ratio, 1e-12));

describe('SincResampler', () => {
  it('does nothing to equal rates', () => {
    expect(new SincResampler(48000, 48000).identity).toBe(true);
    expect(new SincResampler(48000, 44100).identity).toBe(false);
  });

  it('gives the length the rates say', () => {
    expect(new SincResampler(48000, 44100).outFrames(48000)).toBe(44100);
    expect(new SincResampler(48000, 96000).outFrames(48000)).toBe(96000);
    expect(new SincResampler(48000, 88200).outFrames(48000 * 12)).toBe(88200 * 12);
    expect(new SincResampler(48000, 44100).outFrames(12 * 48000)).toBe(12 * 44100);
  });

  it('keeps a constant a constant (unit gain at DC, every phase)', () => {
    const c = new Float32Array(20000).fill(0.37);
    for (const rate of [44100, 88200, 96000]) {
      const o = convert(c, 48000, rate);
      let worst = 0;
      for (let i = 400; i < o.length - 400; i++) worst = Math.max(worst, Math.abs(o[i]! - 0.37));
      expect(worst, `${rate}`).toBeLessThan(1e-5);
    }
  });

  for (const [rate, hz] of [
    [44100, 1000],
    [44100, 15000],
    [88200, 1000],
    [88200, 17000],
    [96000, 440],
    [96000, 19000],
  ] as const) {
    it(`a ${hz} Hz sine stays a ${hz} Hz sine at ${rate} Hz (error below -90 dB)`, () => {
      const seconds = 1;
      const src = sine(48000 * seconds, 48000, hz, 0.5, 0.3);
      const o = convert(src, 48000, rate);
      expect(o.length).toBe(rate * seconds);
      // The ideal sine sampled at the new rate, from the same origin in time.
      let err = 0;
      let sig = 0;
      for (let i = 1000; i < o.length - 1000; i++) {
        const ideal = 0.5 * Math.sin((2 * Math.PI * hz * i) / rate + 0.3);
        err += (o[i]! - ideal) ** 2;
        sig += ideal ** 2;
      }
      expect(db(Math.sqrt(err / sig))).toBeLessThan(-90);
    });
  }

  it('is flat to 20 kHz going down to 44.1 kHz (within 0.05 dB)', () => {
    for (const hz of [100, 5000, 10000, 15000, 18000, 20000]) {
      const o = convert(sine(48000, 48000, hz, 0.5), 48000, 44100);
      const a = amplitudeAt(o, 44100, hz, 3000, 40000);
      expect(Math.abs(db(a / 0.5)), `${hz} Hz`).toBeLessThan(0.05);
    }
  });

  it('does not fold what is above the new Nyquist frequency back into the band (48 → 44.1 kHz)', () => {
    // 23 kHz and 22.5 kHz are above 22.05: unfiltered they would come back at 21.1 and 21.6 kHz.
    for (const [hz, alias] of [
      [23000, 21100],
      [22500, 21600],
      [23900, 20200],
    ] as const) {
      const o = convert(sine(48000, 48000, hz, 0.5), 48000, 44100);
      const a = amplitudeAt(o, 44100, alias, 3000, 40000);
      expect(db(a / 0.5), `${hz} Hz folding at ${alias} Hz`).toBeLessThan(-80);
    }
  });

  it('adds no image above the input Nyquist frequency going up (48 → 96 and 88.2 kHz)', () => {
    // A 20 kHz tone would leave an image at 28 kHz (48 - 20) in a zero-stuffed or linear conversion.
    for (const rate of [96000, 88200]) {
      const o = convert(sine(48000, 48000, 20000, 0.5), 48000, rate);
      const image = amplitudeAt(o, rate, 28000, 3000, rate - 3000);
      expect(db(image / 0.5), `${rate}`).toBeLessThan(-80);
      const kept = amplitudeAt(o, rate, 20000, 3000, rate - 3000);
      expect(Math.abs(db(kept / 0.5))).toBeLessThan(0.05);
    }
  });

  it('gives the same samples whatever the blocks (the source is read wider on each side)', () => {
    const src = sine(30000, 48000, 3000, 0.4);
    const a = convert(src, 48000, 44100, 777);
    const b = convert(src, 48000, 44100, 32768);
    expect(a.length).toBe(b.length);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    expect(worst).toBe(0);
  });

  it('96 kHz from 48 kHz keeps the original samples at the even frames', () => {
    const src = sine(5000, 48000, 7000, 0.5);
    const o = convert(src, 48000, 96000);
    for (let i = 100; i < 4900; i++) expect(Math.abs(o[2 * i]! - src[i]!)).toBeLessThan(1e-6);
  });

  it('converts any ratio (a source at 44.1 kHz to 48 kHz, and an odd one)', () => {
    for (const [from, to] of [
      [44100, 48000],
      [22050, 48000],
    ] as const) {
      const o = convert(sine(from, from, 1000, 0.5), from, to);
      let err = 0;
      let sig = 0;
      for (let i = 1000; i < o.length - 1000; i++) {
        const ideal = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / to);
        err += (o[i]! - ideal) ** 2;
        sig += ideal ** 2;
      }
      expect(db(Math.sqrt(err / sig)), `${from} to ${to}`).toBeLessThan(-90);
    }
  });
});
