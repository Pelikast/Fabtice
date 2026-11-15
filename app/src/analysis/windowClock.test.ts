import { describe, expect, it } from 'vitest';
import { createWindowClock, DEFAULT_WINDOW_SECONDS } from './windowClock';

/** Plays a list of window durations (s) through a clock, sampling every `step` seconds. */
function play(durations: number[], prior?: number, step = 0.5) {
  const clock = createWindowClock(prior);
  const total = durations.length;
  let t = 0;
  clock.report(0, total, t * 1000);
  const samples: { t: number; f: number; done: number }[] = [];
  durations.forEach((d, i) => {
    const end = t + d;
    for (let s = t + step; s < end; s += step) samples.push({ t: s, f: clock.fraction(s * 1000), done: i });
    t = end;
    clock.report(i + 1, total, t * 1000);
    samples.push({ t, f: clock.fraction(t * 1000), done: i + 1 });
  });
  return { clock, samples, total };
}

describe('window clock (steady progress of the fine chord model)', () => {
  it('starts near 0 and ends at 1 only when the last window is reported', () => {
    const { samples } = play([10, 10, 10]);
    expect(samples[0]!.f).toBeGreaterThanOrEqual(0);
    expect(samples[0]!.f).toBeLessThan(0.2);
    const before = samples.filter((s) => s.done < 3);
    expect(Math.max(...before.map((s) => s.f))).toBeLessThan(1);
    expect(samples[samples.length - 1]!.f).toBe(1);
  });

  it('never goes back, even with irregular windows and a wrong prior', () => {
    for (const prior of [1, 5, 45, 400]) {
      const { samples } = play([8, 30, 4, 22, 22, 3, 40, 9], prior);
      samples.forEach((s, i) => i && expect(s.f).toBeGreaterThanOrEqual(samples[i - 1]!.f));
    }
  });

  it('never goes past the next window boundary before it is reported', () => {
    // A very slow window against a short prior: the estimate flattens just below the boundary.
    const { samples, total } = play([2, 2, 200, 2], 2);
    for (const s of samples) if (s.done < total) expect(s.f).toBeLessThan((s.done + 1) / total);
  });

  it('advances smoothly: with regular windows the steps stay small', () => {
    const { samples, total } = play([12, 12, 12, 12, 12, 12], 12, 0.25);
    let worst = 0;
    samples.forEach((s, i) => i && (worst = Math.max(worst, s.f - samples[i - 1]!.f)));
    expect(worst).toBeLessThan(0.25 / 12 / total + 0.02);
    // Within the second window the estimate follows the first window's duration.
    const mid = samples.find((s) => s.t >= 18)!;
    expect(mid.f).toBeGreaterThan(1.3 / total);
    expect(mid.f).toBeLessThan(1.7 / total);
  });

  it('learns the duration from the windows before it (the prior only serves the first)', () => {
    expect(play([10, 10, 10, 10], 45).clock.windowSeconds()).toBeCloseTo(10, 5);
    expect(play([30, 30, 30], 5).clock.windowSeconds()).toBeCloseTo(30, 5);
  });

  it('uses the default when no prior is given, and ignores reports out of order', () => {
    expect(createWindowClock().windowSeconds()).toBe(DEFAULT_WINDOW_SECONDS);
    const c = createWindowClock(10);
    c.report(0, 4, 0);
    c.report(2, 4, 20_000);
    const f = c.fraction(20_000);
    c.report(1, 4, 21_000); // late duplicate: ignored
    expect(c.fraction(21_000)).toBeGreaterThanOrEqual(f);
  });

  it('says nothing before the worker has spoken, and stays bounded if the run is cancelled', () => {
    const c = createWindowClock(10);
    expect(c.fraction(5000)).toBe(0);
    c.report(0, 4, 0);
    expect(c.fraction(5000)).toBeGreaterThan(0);
    // Cancelled: nothing more is reported, whatever time goes by the fraction stays below the next boundary.
    expect(c.fraction(1e9)).toBeLessThan(0.25);
  });
});
