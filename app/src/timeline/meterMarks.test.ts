import { describe, expect, it } from 'vitest';
import { meterChangeList, withMeterForBar, withMeterFrom } from '../grid/meters';
import { constantTempoMap } from '../grid/tempoMap';
import { describeMeterMarks, layoutMeterMarks, meterMarkViews, MeterMarkSet, numberLeftAfter } from './meterMarks';

const base = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }); // 2 s per bar
const measure = (s: string) => 7 * s.length;

function marks(map = base, pps = 50, w = 1000, t0 = 0) {
  const set = new MeterMarkSet();
  layoutMeterMarks(set, map, meterMarkViews(meterChangeList(map)), t0, pps, w, measure);
  return set;
}

describe('signatures on the ruler', () => {
  it('writes nothing for a piece with a single signature', () => {
    expect(marks().count).toBe(0);
  });

  it('writes bar 1 and the bar where the signature changes', () => {
    const map = withMeterFrom(base, 4, { numerator: 7, denominator: 8 });
    const set = marks(map);
    expect(describeMeterMarks(set)).toBe('1:4/4 5:7/8');
    expect(set.items[1]!.x).toBeCloseTo(4 * 2 * 50 + 9, 6);
    expect(numberLeftAfter(set.items[1]!)).toBeCloseTo(4 * 2 * 50 + 9 + 7 + 6, 6);
  });

  it('writes the change and the return for « only this bar »', () => {
    const map = withMeterForBar(base, 2, { numerator: 5, denominator: 4 });
    expect(describeMeterMarks(marks(map))).toBe('1:4/4 3:5/4 4:4/4');
  });

  it('keeps a signature whose bar started off to the left, stuck to the edge, and drops what is off the view', () => {
    const map = withMeterFrom(base, 4, { numerator: 7, denominator: 8 });
    // 7/8 bars last 1.75 s from 8 s: the view from 9 s starts in the first of them.
    const set = marks(map, 50, 300, 9);
    expect(describeMeterMarks(set)).toBe('5:7/8');
    expect(set.items[0]!.x).toBe(4);
  });

  it('leaves a signature out when it does not fit in its bar, instead of overlapping', () => {
    const map = withMeterFrom(base, 4, { numerator: 12, denominator: 8 });
    expect(marks(map, 4).count).toBe(0);
    expect(marks(map, 50).count).toBe(2);
  });
});
