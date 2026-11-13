import { describe, expect, it } from 'vitest';
import { LIMITER_CEILING, LIMITER_DELAY, Limiter } from './limiter';

const SR = 48000;

function process(lim: Limiter, l: Float32Array, r: Float32Array): void {
  for (let i = 0; i < l.length; i += 128) lim.process(l.subarray(i, i + 128), r.subarray(i, i + 128), Math.min(128, l.length - i));
}

describe('safety limiter', () => {
  it('is a pure delay below the ceiling (bit exact)', () => {
    const lim = new Limiter(SR);
    const n = SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = 0.88 * Math.sin((2 * Math.PI * 220 * i) / SR);
      r[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / SR);
    }
    const l0 = Float32Array.from(l);
    const r0 = Float32Array.from(r);
    process(lim, l, r);
    for (let i = LIMITER_DELAY; i < n; i++) {
      expect(l[i]).toBe(l0[i - LIMITER_DELAY]);
      expect(r[i]).toBe(r0[i - LIMITER_DELAY]);
    }
    expect(lim.takeMinGain()).toBe(1);
  });

  it('never exceeds the ceiling, whatever the input', () => {
    const lim = new Limiter(SR);
    const n = 3 * SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    let seed = 1;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let i = 0; i < n; i++) {
      // loud sine, a burst of noise, then a single huge sample
      l[i] = 2.5 * Math.sin((2 * Math.PI * 100 * i) / SR) + (i > SR && i < SR + 4000 ? 3 * rnd() : 0);
      r[i] = 0.3 * rnd();
    }
    l[2 * SR] = 40;
    process(lim, l, r);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
    expect(peak).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
    expect(peak).toBeGreaterThan(LIMITER_CEILING * 0.95); // it limits, it does not mute
  });

  it('recovers after a peak: quiet material comes back to gain 1', () => {
    const lim = new Limiter(SR);
    const n = 3 * SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const loud = i > 1000 && i < 3000;
      l[i] = (loud ? 3 : 0.3) * Math.sin((2 * Math.PI * 440 * i) / SR);
    }
    const l0 = Float32Array.from(l);
    process(lim, l, r);
    // a second after the peak the signal is untouched again (release about 80 ms)
    for (let i = Math.round(1.0 * SR); i < n; i++) expect(l[i]).toBe(l0[i - LIMITER_DELAY]);
  });

  it('reduces the gain smoothly around a swell (no step in the gain)', () => {
    const lim = new Limiter(SR);
    const n = 24000;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); // 0 -> 1 -> 0
      l[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / SR) + 2.2 * env * Math.sin((2 * Math.PI * 100 * i) / SR);
    }
    const x = Float32Array.from(l);
    process(lim, l, r);
    let maxJump = 0;
    let prev = 1;
    let peak = 0;
    for (let i = LIMITER_DELAY; i < n; i++) {
      peak = Math.max(peak, Math.abs(l[i]!));
      const xi = x[i - LIMITER_DELAY]!;
      if (Math.abs(xi) < 0.3) continue;
      const g = l[i]! / xi;
      maxJump = Math.max(maxJump, Math.abs(g - prev));
      prev = g;
    }
    expect(peak).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
    expect(maxJump).toBeLessThan(0.05); // a hard clip would jump by whole tenths
  });
});
