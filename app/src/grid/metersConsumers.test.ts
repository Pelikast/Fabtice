// The consumers of `grid/` follow the signatures bar by bar (C13): default
// accents for every legal signature, metronome clicks and count-in across a
// change, the sub-grid and the magnet, loops and how they are written, the
// tempo curve.

import { describe, expect, it } from 'vitest';
import { METER_DENOMINATORS, METER_NUMERATOR, type Meter } from '../model/tempoMap';
import { formatLoop, describePoint } from './loopText';
import { barLines, isSubGridVisible, loopFromBars, metronomeClicks, snapTime, subGridLines, subGridSpacingPx } from './lines';
import { adjacentLine, loopCoverage, wholeBarsOf } from './loops';
import { withMeterForBar } from './meters';
import {
  CLICK_ACCENT,
  CLICK_NORMAL,
  CLICK_SOFT,
  countInClicks,
  defaultGrouping,
  defaultPattern,
  groupingChoices,
  isValidPattern,
  metronomeClickTrack,
  parseMeterKey,
  patternFor,
} from './metronome';
import { tempoCurve } from './tempoCurve';
import { constantTempoMap } from './tempoMap';

const m = (numerator: number, denominator: number): Meter => ({ numerator, denominator });
const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' });
/** 4/4 at 120, bar 3 (index 2) in 7/8: from 4 s to 5.75 s, eighths of 0.25 s. */
const seven = withMeterForBar(c44, 2, m(7, 8));
const r = (x: number) => Math.round(x * 1e6) / 1e6;
const QUARTERS = { subdivision: 1, triplets: false } as const;

describe('default accents for every legal signature', () => {
  it('right length, first beat accented, groups adding up, for all 64 × 4 signatures', () => {
    for (let n = METER_NUMERATOR.min; n <= METER_NUMERATOR.max; n++) {
      for (const d of METER_DENOMINATORS) {
        const meter = m(n, d);
        const p = defaultPattern(meter);
        expect(p.levels).toHaveLength(n);
        expect(p.levels[0]).toBe('accent');
        expect(p.levels.slice(1).every((l) => l === 'normal' || l === 'soft')).toBe(true);
        expect(p.grouping.reduce((a, b) => a + b, 0)).toBe(n);
        expect(isValidPattern(p, meter)).toBe(true);
        expect(groupingChoices(meter).length).toBeLessThanOrEqual(6);
      }
    }
  });

  it('sensible groupings: 7/8 = 2+2+3, 5/4 = 3+2, 11/16 = 3+3+3+2, compound by threes, long x/4 in fours', () => {
    expect(defaultGrouping(m(7, 8))).toEqual([2, 2, 3]);
    expect(defaultGrouping(m(5, 4))).toEqual([3, 2]);
    expect(defaultGrouping(m(11, 16))).toEqual([3, 3, 3, 2]);
    expect(defaultGrouping(m(7, 16))).toEqual([2, 2, 3]);
    expect(defaultGrouping(m(12, 16))).toEqual([3, 3, 3, 3]);
    expect(defaultGrouping(m(9, 8))).toEqual([3, 3, 3]);
    expect(defaultGrouping(m(10, 4))).toEqual([4, 3, 3]);
    expect(defaultGrouping(m(16, 4))).toEqual([4, 4, 4, 4]);
    expect(defaultGrouping(m(1, 4))).toEqual([1]);
    expect(defaultGrouping(m(64, 32)).reduce((a, b) => a + b, 0)).toBe(64);
    expect(groupingChoices(m(64, 32))).toEqual([defaultGrouping(m(64, 32))]);
  });

  it('patterns kept by key accept the new signatures, and only legal ones', () => {
    expect(parseMeterKey('64/32')).toEqual(m(64, 32));
    expect(parseMeterKey('7/16')).toEqual(m(7, 16));
    expect(parseMeterKey('4/3')).toBeNull();
    expect(parseMeterKey('0/4')).toBeNull();
    const mine = { grouping: [3, 4], levels: ['accent', 'soft', 'soft', 'normal', 'soft', 'soft', 'soft'] as const };
    expect(patternFor({ '7/16': { grouping: [3, 4], levels: [...mine.levels] } }, m(7, 16)).grouping).toEqual([3, 4]);
  });
});

describe('the metronome across a change of signature', () => {
  it('each bar clicks the beats of its own signature, with its accents', () => {
    const track = metronomeClickTrack(seven, 3, 8, {});
    expect([...track.times].map(r)).toEqual([3, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5, 5.75, 6.25, 6.75, 7.25, 7.75]);
    const N = CLICK_NORMAL;
    const A = CLICK_ACCENT;
    const S = CLICK_SOFT;
    // 4/4: accent then normal; 7/8 as 2+2+3: accent, soft, normal, soft, normal, soft, soft
    expect([...track.accents]).toEqual([N, N, A, S, N, S, N, S, S, A, N, N, N, A]);
    const plain = metronomeClicks(seven, 3, 8);
    expect([...plain.times].map(r)).toEqual([...track.times].map(r));
    expect([...plain.accents]).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('a loop on the 7/8 bar clicks seven eighths, its count-in too', () => {
    const loop = loopFromBars(seven, 2, 2);
    expect(loop).toEqual({ start: 4, end: 5.75 });
    expect(metronomeClickTrack(seven, loop.start, loop.end, {}).times).toHaveLength(7);
    const count = countInClicks(seven, 4, 1, {})!;
    expect([...count.offsets].map(r)).toEqual([1.75, 1.5, 1.25, 1, 0.75, 0.5, 0.25]);
    expect(count.levels[0]).toBe(CLICK_ACCENT);
    expect(count.levels).toHaveLength(7);
    // A count-in before the 4/4 bar after it: four quarters.
    expect([...countInClicks(seven, 5.75, 1, {})!.offsets].map(r)).toEqual([2, 1.5, 1, 0.5]);
  });
});

describe('sub-grid, magnet and loops across a change', () => {
  it('the sub-grid divides each bar’s own beats from its bar line', () => {
    expect(subGridLines(seven, 4, 5.75, QUARTERS).map((l) => r(l.time))).toEqual([4.25, 4.5, 4.75, 5, 5.25, 5.5]);
    expect(subGridLines(seven, 5.75, 7.75, QUARTERS).map((l) => r(l.time))).toEqual([6.25, 6.75, 7.25]);
    expect(barLines(seven, 3, 8).map((l) => [l.bar, l.time])).toEqual([[2, 4], [3, 5.75], [4, 7.75]]);
    // The smallest beat counts for the density: eighths at 120 are 0.25 s.
    expect(subGridSpacingPx(seven, 100, QUARTERS)).toBe(25);
    expect(isSubGridVisible(withMeterForBar(c44, 2, m(64, 32)), 50, QUARTERS)).toBe(false);
  });

  it('the magnet snaps to eighths in the 7/8 bar and to quarters around it', () => {
    expect(snapTime(seven, 4.6, QUARTERS)).toBe(4.5);
    expect(snapTime(seven, 4.13, QUARTERS)).toBe(4.25);
    expect(snapTime(seven, 6.1, QUARTERS)).toBe(6.25);
    expect(snapTime(seven, 5.7, QUARTERS)).toBe(5.75);
    expect(adjacentLine(seven, 5.6, 1, QUARTERS)).toBe(5.75);
    expect(adjacentLine(seven, 5.75, -1, QUARTERS)).toBe(5.5);
    expect(adjacentLine(seven, 4, -1, QUARTERS)).toBe(3.5);
  });

  it('a loop across the change: what it covers, how it is written', () => {
    const c = loopCoverage(seven, { start: 4.5, end: 6.25 });
    expect(c.first).toBe(2);
    expect(c.last).toBe(3);
    expect(c.from).toBeCloseTo(2 / 7, 4);
    expect(c.to).toBe(0.25);
    expect(wholeBarsOf(seven, { start: 4, end: 7.75 })).toEqual({ first: 2, last: 3 });
    expect(describePoint(seven, 5)).toEqual({ bar: 2, beat: 5, sub: null, approx: false });
    expect(describePoint(seven, 4.125)).toEqual({ bar: 2, beat: 1, sub: { rank: 2, count: 2 }, approx: false });
    expect(formatLoop(seven, { start: 4.5, end: 6.25 }).text).toBe('3.3 à 4.2');
    expect(formatLoop(seven, { start: 4, end: 7.75 }).text).toBe('3–4');
  });

  it('the tempo curve reads the quarter’s tempo in a 7/8 or 6/8 bar', () => {
    expect(tempoCurve(seven, 0, 10).map((p) => r(p.bpm))).toEqual([120, 120, 120, 120, 120, 120]);
    expect(tempoCurve(withMeterForBar(c44, 1, m(6, 8)), 0, 6).map((p) => r(p.bpm))).toEqual([120, 120, 120, 120]);
  });
});
