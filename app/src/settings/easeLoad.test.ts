// « Alléger le travail pour l'appareil »: the pure rules, and the pause between slices with a fake clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_SLEEP_MS, createSleeper, createThrottle, easePlan, isEased, loadShare, pauseAfterMs, reducedThreads, stretchedSeconds } from './easeLoad';

describe('the share', () => {
  it('is 1 when the case is unticked, whatever the percentage', () => {
    expect(loadShare({ easeLoad: false, easeLoadPercent: 75 })).toBe(1);
    expect(loadShare({ easeLoad: false, easeLoadPercent: 20 })).toBe(1);
  });
  it('is the percentage when it is ticked', () => {
    expect(loadShare({ easeLoad: true, easeLoadPercent: 75 })).toBe(0.75);
    expect(loadShare({ easeLoad: true, easeLoadPercent: 20 })).toBe(0.2);
    expect(loadShare({ easeLoad: true, easeLoadPercent: 99 })).toBe(0.99);
  });
  it('never leaves 0.2…1, whatever the stored value', () => {
    expect(loadShare({ easeLoad: true, easeLoadPercent: 5 })).toBe(0.2);
    expect(loadShare({ easeLoad: true, easeLoadPercent: 250 })).toBe(1);
    expect(loadShare({ easeLoad: true, easeLoadPercent: Number.NaN })).toBe(1);
  });
  it('isEased only below 1', () => {
    expect(isEased(1)).toBe(false);
    expect(isEased(undefined)).toBe(false);
    expect(isEased(0.75)).toBe(true);
  });
});

describe('pauseAfterMs', () => {
  it('is slice × (1 − share) / share', () => {
    expect(pauseAfterMs(1000, 0.75)).toBeCloseTo(333.33, 1);
    expect(pauseAfterMs(1000, 0.5)).toBeCloseTo(1000, 6);
    expect(pauseAfterMs(27_000, 0.75)).toBeCloseTo(9000, 6);
    expect(pauseAfterMs(1000, 0.2)).toBeCloseTo(4000, 6);
    expect(pauseAfterMs(1000, 0.99)).toBeCloseTo(10.1, 1);
  });
  it('is nothing at full speed, or for an empty slice', () => {
    expect(pauseAfterMs(1000, 1)).toBe(0);
    expect(pauseAfterMs(0, 0.5)).toBe(0);
    expect(pauseAfterMs(-5, 0.5)).toBe(0);
    expect(pauseAfterMs(Number.NaN, 0.5)).toBe(0);
  });
  it('makes work the share of the time: work / (work + pause) = share', () => {
    for (const share of [0.2, 0.5, 0.75, 0.99]) {
      const work = 1234;
      expect(work / (work + pauseAfterMs(work, share))).toBeCloseTo(share, 9);
    }
  });
});

describe('reducedThreads', () => {
  it('is max(1, round(threads × share))', () => {
    expect(reducedThreads(8, 0.75)).toBe(6);
    expect(reducedThreads(8, 0.5)).toBe(4);
    expect(reducedThreads(4, 0.75)).toBe(3);
    expect(reducedThreads(3, 0.75)).toBe(2);
    expect(reducedThreads(4, 0.2)).toBe(1);
    expect(reducedThreads(1, 0.2)).toBe(1);
    expect(reducedThreads(8, 0.99)).toBe(8);
  });
  it('leaves the threads alone at full speed and never gives zero', () => {
    expect(reducedThreads(8, 1)).toBe(8);
    expect(reducedThreads(0, 0.2)).toBe(1);
  });
});

describe('easePlan', () => {
  it('has no reduction and no pause at full speed', () => {
    expect(easePlan(4, 1)).toEqual({ units: 4, duty: 1 });
  });
  it('with one unit, the pause makes up the share itself (the plain rule)', () => {
    expect(easePlan(1, 0.75)).toEqual({ units: 1, duty: 0.75 });
    expect(easePlan(1, 0.2)).toEqual({ units: 1, duty: 0.2 });
  });
  it('keeps the average at the share: reduced / units × duty = share, when the rounding does not undershoot', () => {
    for (const [units, share] of [
      [8, 0.5],
      [8, 0.75],
      [6, 0.5],
      [4, 0.5],
      [7, 0.5],
      [8, 0.2],
      [4, 0.99],
    ] as const) {
      const p = easePlan(units, share);
      const average = (p.units / units) * p.duty;
      // Rounded down below the share: the duty is capped at 1 (no pause), the average is then the thread ratio.
      if (p.duty < 1) expect(average).toBeCloseTo(share, 9);
      else expect(average).toBeLessThanOrEqual(share + 1e-9 + 0.5 / units);
    }
  });
  it('does not rest twice for the same saving (6 threads of 8 at 75 %: no pause on top)', () => {
    expect(easePlan(8, 0.75)).toEqual({ units: 6, duty: 1 });
  });
  it('rests for what a rounded-up reduction does not take (2 of 3 threads at 50 %)', () => {
    const p = easePlan(3, 0.5); // round(1.5) = 2 of 3 units: 67 %, so the pause makes up 0.5 × 3 / 2
    expect(p.units).toBe(2);
    expect(p.duty).toBeCloseTo(0.75, 9);
  });
});

describe('stretchedSeconds', () => {
  it('is seconds / share, and the same at full speed', () => {
    expect(stretchedSeconds(100, 0.75)).toBeCloseTo(133.33, 1);
    expect(stretchedSeconds(100, 0.5)).toBe(200);
    expect(stretchedSeconds(100, 1)).toBe(100);
    expect(stretchedSeconds(100, undefined as unknown as number)).toBe(100);
  });
});

describe('createThrottle', () => {
  it('is null at full speed: the caller has no pause code to run', () => {
    expect(createThrottle({ share: 1 })).toBeNull();
  });

  it('sleeps for the time the slice took, scaled by the share', async () => {
    let clock = 0;
    const slept: number[] = [];
    const throttle = createThrottle({
      share: 0.75,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    })!;
    throttle.mark();
    clock = 3000; // a slice of 3 s
    expect(await throttle.pause()).toBeCloseTo(1000, 6);
    clock += 3000; // the rest is over at 4000: another slice of 3 s
    expect(await throttle.pause()).toBeCloseTo(1000, 6);
    expect(slept).toHaveLength(2);
    expect(slept[0]).toBeCloseTo(1000, 6);
    expect(throttle.rested).toBeCloseTo(2000, 6);
  });

  it('does not count the rest itself as work: the next slice starts when the rest ends', async () => {
    let clock = 0;
    const throttle = createThrottle({
      share: 0.5,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    })!;
    throttle.mark();
    clock += 200;
    await throttle.pause(); // rests 200, the clock is at 400
    clock += 200;
    expect(await throttle.pause()).toBeCloseTo(200, 6);
  });

  it('adds up the pauses too short to sleep and sleeps them together', async () => {
    let clock = 0;
    const slept: number[] = [];
    const throttle = createThrottle({ share: 0.5, now: () => clock, sleep: async (ms) => void slept.push(ms) })!;
    throttle.mark();
    // 2 ms slices owe 2 ms each: 3 of them stay under the threshold, the 4th crosses it.
    for (let i = 0; i < 3; i++) {
      clock += 2;
      expect(await throttle.pause()).toBe(0);
    }
    expect(slept).toEqual([]);
    clock += 2;
    expect(await throttle.pause()).toBeCloseTo(8, 6);
    expect(MIN_SLEEP_MS).toBe(8);
    expect(slept).toHaveLength(1);
  });

  it('the total rest over a run is the work × (1 − share) / share', async () => {
    let clock = 0;
    const throttle = createThrottle({
      share: 0.75,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    })!;
    throttle.mark();
    let work = 0;
    for (let i = 0; i < 40; i++) {
      const slice = 500 + (i % 5) * 100;
      clock += slice;
      work += slice;
      await throttle.pause();
    }
    expect(throttle.rested).toBeCloseTo(pauseAfterMs(work, 0.75), 3);
    expect(work / (work + throttle.rested)).toBeCloseTo(0.75, 6);
  });
});

describe('the sleeper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sleeps for the time asked', async () => {
    const sleeper = createSleeper();
    let done = false;
    void sleeper.sleep(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it('wake() ends the sleep at once, whatever time was left', async () => {
    const sleeper = createSleeper();
    let done = false;
    void sleeper.sleep(60_000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    sleeper.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a throttle on a sleeper rests with fake timers and is woken by a cancellation', async () => {
    const sleeper = createSleeper();
    const clock = { t: 0 };
    const throttle = createThrottle({ share: 0.5, now: () => clock.t, sleep: sleeper.sleep })!;
    throttle.mark();
    clock.t = 20_000;
    let rested = false;
    void throttle.pause().then(() => (rested = true));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(rested).toBe(false);
    sleeper.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(rested).toBe(true);
  });
});
