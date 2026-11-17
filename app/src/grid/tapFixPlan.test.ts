import { describe, expect, it } from 'vitest';
import { TAP_COUNT_IN, clampTapCountIn, recordTap, tapFixClicks, tapFixStart, tapFixVerify, tapsFromBar, tapsWindowStart } from './tapFixPlan';
import { barStartTime, constantTempoMap, variableTempoMap } from './tempoMap';

// 120 BPM in 4/4: a beat every half second, a bar every two seconds; the first downbeat at 0.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'analysis' });
const patterns = {};

describe('the count-in field', () => {
  it('is one bar by default, zero is allowed, four is the most', () => {
    expect(TAP_COUNT_IN.default).toBe(1);
    expect(clampTapCountIn('')).toBe(1);
    expect(clampTapCountIn('abc')).toBe(1);
    expect(clampTapCountIn('0')).toBe(0);
    expect(clampTapCountIn(0)).toBe(0);
    expect(clampTapCountIn('2')).toBe(2);
    expect(clampTapCountIn('2,4')).toBe(2);
    expect(clampTapCountIn('9')).toBe(4);
    expect(clampTapCountIn('-3')).toBe(0);
  });
});

describe('where playback starts', () => {
  it('count-in bars before the chosen bar', () => {
    const s = tapFixStart(map, 5, 1, patterns);
    expect(s.barTime).toBeCloseTo(10, 9);
    expect(s.start).toBeCloseTo(8, 9);
    expect(s.countIn).toBeNull();
    expect(tapFixStart(map, 5, 3, patterns).start).toBeCloseTo(4, 9);
  });

  it('with 0 bars: at the chosen bar, no count-in at all', () => {
    const s = tapFixStart(map, 5, 0, patterns);
    expect(s.start).toBeCloseTo(s.barTime, 9);
    expect(s.countIn).toBeNull();
  });

  it('near the start of the piece: from the first bar, the missing bars counted by clicks alone', () => {
    const s = tapFixStart(map, 1, 3, patterns);
    expect(s.start).toBeCloseTo(0, 9);
    expect(s.barTime).toBeCloseTo(2, 9);
    // 3 bars asked, 1 available before the chosen bar: 2 bars of 4 clicks come first, a beat apart
    expect(s.countIn?.offsets.length).toBe(8);
    expect(Math.min(...(s.countIn?.offsets ?? []))).toBeCloseTo(0.5, 9);
    // the first bar of the piece itself: all the bars are clicks alone
    const first = tapFixStart(map, 0, 1, patterns);
    expect(first.start).toBeCloseTo(0, 9);
    expect(first.countIn?.offsets.length).toBe(4);
  });

  it('follows a moving grid: the bar before is the grid\'s own', () => {
    const moving = variableTempoMap([{ time: 0, bpm: 120 }, { time: 8, bpm: 60 }], [{ bar: 0, meter: { numerator: 4, denominator: 4 } }], 'analysis');
    const s = tapFixStart(moving, 5, 1, patterns);
    expect(s.start).toBeCloseTo(barStartTime(moving, 4), 9);
    expect(s.barTime).toBeCloseTo(barStartTime(moving, 5), 9);
    expect(s.barTime - s.start).toBeCloseTo(4, 6); // a bar at 60 BPM
  });
});

describe('the clicks while tapping', () => {
  it('follow the grid and stop exactly at the chosen bar', () => {
    const bar = 5;
    const { barTime } = tapFixStart(map, bar, 1, patterns);
    const clicks = tapFixClicks(map, barTime, patterns);
    const times = [...clicks.times];
    expect(times.length).toBe(bar * 4); // beats of bars 0 to 4
    expect(times[0]).toBeCloseTo(0, 9);
    expect(times[times.length - 1]).toBeCloseTo(barTime - 0.5, 9);
    expect(times.some((t) => t >= barTime - 1e-9)).toBe(false);
    // on the grid: a click every half second
    times.forEach((t, i) => expect(t).toBeCloseTo(i * 0.5, 9));
  });

  it('the downbeat keeps its accent, as the user\'s pattern says', () => {
    const clicks = tapFixClicks(map, 4, patterns);
    expect([...clicks.accents].slice(0, 5)).toEqual([1, 0, 0, 0, 1]);
  });

  it('on the first bar there is nothing to click', () => {
    expect(tapFixClicks(map, 0, patterns).times.length).toBe(0);
  });

  it('a moving grid: the last click is the beat before the chosen bar', () => {
    const moving = variableTempoMap([{ time: 0, bpm: 120 }, { time: 8, bpm: 60 }], [{ bar: 0, meter: { numerator: 4, denominator: 4 } }], 'analysis');
    const barTime = barStartTime(moving, 6);
    const times = [...tapFixClicks(moving, barTime, patterns).times];
    expect(times[times.length - 1]).toBeCloseTo(barTime - 1, 6);
    expect(times.length).toBe(6 * 4);
  });
});

describe('« Vérifier en écoutant »', () => {
  it('starts like the taps did and stops a little after the last beat placed', () => {
    const v = tapFixVerify(map, 5, 14.2, 1, patterns, 60);
    expect(v.start).toBeCloseTo(8, 9);
    expect(v.stop).toBeCloseTo(14.2 + 1, 6); // two beats of 0.5 s
    expect(v.stop).toBeGreaterThan(14.2);
  });

  it('never goes past the end of the piece', () => {
    expect(tapFixVerify(map, 5, 14.2, 1, patterns, 14.5).stop).toBe(14.5);
  });
});

describe('the taps along the count-in', () => {
  it('the window of taps starts two bars before the chosen bar, not before the piece', () => {
    expect(tapsWindowStart(map, 5)).toBeCloseTo(6, 9);
    expect(tapsWindowStart(map, 1)).toBe(0);
  });

  it('the counter counts the taps from the chosen bar on only', () => {
    expect(tapsFromBar([8.02, 8.5, 10, 10.52, 11.03], 10)).toBe(3);
    expect(tapsFromBar([], 10)).toBe(0);
    expect(tapsFromBar([9.99], 10)).toBe(0);
  });
});

describe('the taps', () => {
  it('a tap earlier than the window is ignored, from it on it is kept (the line itself too)', () => {
    let taps: readonly number[] = [];
    taps = recordTap(taps, 8.5, 10);
    expect(taps).toEqual([]);
    taps = recordTap(taps, 9.999, 10);
    expect(taps).toEqual([]);
    taps = recordTap(taps, 10, 10);
    taps = recordTap(taps, 10.52, 10);
    taps = recordTap(taps, 11.03, 10);
    expect(taps).toEqual([10, 10.52, 11.03]);
  });

  it('the list is left as it was when a tap does not count, and a new one is returned when it does', () => {
    const before: readonly number[] = [10.1];
    expect(recordTap(before, 3, 10)).toBe(before);
    expect(recordTap(before, Number.NaN, 10)).toBe(before);
    const after = recordTap(before, 10.6, 10);
    expect(after).not.toBe(before);
    expect(before).toEqual([10.1]);
  });
});
