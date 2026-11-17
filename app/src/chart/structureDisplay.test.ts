import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import type { ChartBar } from './layout';
import { barsOfRange, chartBounds, defaultNewLimits, limitsFromNumbers, partBarNumbers, partBars, resolveDisplay, sameDisplay } from './structureDisplay';

// 120 BPM, 4/4, first downbeat at 0: bar n starts at 2n seconds. 24 bars = 48 s.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const DURATION = 48;
const LAST = 23;
const part = (start: number, end: number) => ({ start, end });

function bars(from = 0, to = LAST): ChartBar[] {
  const out: ChartBar[] = [];
  for (let bar = from; bar <= to; bar++) {
    out.push({ bar, start: bar * 2, end: bar * 2 + 2, beats: 4, meter: { numerator: 4, denominator: 4 }, signature: null, chords: [], repeat: false, section: null, doubleBar: bar % 4 === 2 && bar > from, keyChange: null });
  }
  return out;
}

describe('the display in force', () => {
  const parts = [{ id: 'a' }, { id: 'b' }];
  it('keeps the whole chart and the simplified chart', () => {
    expect(resolveDisplay({ kind: 'full' }, parts)).toEqual({ kind: 'full' });
    expect(resolveDisplay({ kind: 'simplified' }, [])).toEqual({ kind: 'simplified' });
  });
  it('keeps a part that is still there', () => {
    expect(resolveDisplay({ kind: 'part', id: 'b' }, parts)).toEqual({ kind: 'part', id: 'b' });
  });
  it('falls back to the whole chart when the part is gone', () => {
    expect(resolveDisplay({ kind: 'part', id: 'z' }, parts)).toEqual({ kind: 'full' });
    expect(resolveDisplay({ kind: 'part', id: 'a' }, [])).toEqual({ kind: 'full' });
  });
  it('compares displays', () => {
    expect(sameDisplay({ kind: 'full' }, { kind: 'full' })).toBe(true);
    expect(sameDisplay({ kind: 'part', id: 'a' }, { kind: 'part', id: 'a' })).toBe(true);
    expect(sameDisplay({ kind: 'part', id: 'a' }, { kind: 'part', id: 'b' })).toBe(false);
    expect(sameDisplay({ kind: 'full' }, { kind: 'simplified' })).toBe(false);
  });
});

describe('a part on the chart', () => {
  it('goes from the bar line nearest its start up to the one nearest its end', () => {
    expect(partBars(map, part(4, 20), DURATION, LAST)).toEqual({ first: 2, end: 10 });
    // A limit a little off the bar line is read as that bar line.
    expect(partBars(map, part(4.3, 19.6), DURATION, LAST)).toEqual({ first: 2, end: 10 });
  });
  it('takes the last bar when it reaches the end of the piece', () => {
    expect(partBars(map, part(44, 48), DURATION, LAST)).toEqual({ first: 22, end: 24 });
    // The piece ends inside its last bar: the part still includes it.
    expect(partBars(map, part(44, 47.9), 47.9, LAST)).toEqual({ first: 22, end: 24 });
  });
  it('is at least one bar', () => {
    expect(partBars(map, part(4, 4.2), DURATION, LAST)).toEqual({ first: 2, end: 3 });
  });
  it('shows its bars with their numbers, the first without the double bar', () => {
    const shown = barsOfRange(bars(), { first: 2, end: 10 });
    expect(shown.map((b) => b.bar)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shown[0]!.doubleBar).toBe(false);
    expect(shown.find((b) => b.bar === 6)!.doubleBar).toBe(true);
  });
  it('is empty outside the chart', () => {
    expect(barsOfRange(bars(), { first: 30, end: 34 })).toEqual([]);
  });
});

describe('bars as a musician counts them, and back to times', () => {
  it('numbers a part from 1', () => {
    expect(partBarNumbers({ first: 2, end: 10 })).toEqual({ first: 3, last: 10 });
    expect(partBarNumbers({ first: 0, end: 1 })).toEqual({ first: 1, last: 1 });
  });
  const chart = { firstBar: 0, lastBar: LAST };
  it('turns first and last bar into times on the grid in force', () => {
    expect(limitsFromNumbers(map, { first: 3, last: 10 }, chart, DURATION)).toEqual({ start: 4, end: 20 });
    expect(limitsFromNumbers(map, { first: 1, last: 24 }, chart, DURATION)).toEqual({ start: 0, end: 48 });
  });
  it('follows a grid that is not 120 BPM, 4/4', () => {
    const other = constantTempoMap({ bpm: 90, firstDownbeat: 1, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    // A bar lasts 3 beats of 2/3 s: 2 s; bar index 2 starts at 1 + 4.
    expect(limitsFromNumbers(other, { first: 3, last: 3 }, chart, 100)).toEqual({ start: 5, end: 7 });
  });
  it('refuses what is not a part of the chart', () => {
    expect(limitsFromNumbers(map, { first: 0, last: 3 }, chart, DURATION)).toBeNull();
    expect(limitsFromNumbers(map, { first: 5, last: 4 }, chart, DURATION)).toBeNull();
    expect(limitsFromNumbers(map, { first: 2, last: 25 }, chart, DURATION)).toBeNull();
    expect(limitsFromNumbers(map, { first: 1.5, last: 3 }, chart, DURATION)).toBeNull();
    expect(limitsFromNumbers(map, { first: NaN, last: 3 }, chart, DURATION)).toBeNull();
  });
  it('allows the pick-up bar when the chart has one', () => {
    expect(limitsFromNumbers(map, { first: 0, last: 2 }, { firstBar: -1, lastBar: LAST }, DURATION)).toEqual({ start: 0, end: 4 });
  });
  it('reads the first and last bar of a chart', () => {
    expect(chartBounds(bars(-1, 5))).toEqual({ firstBar: -1, lastBar: 5 });
    expect(chartBounds([])).toBeNull();
  });
});

describe('where « Ajouter une partie » starts', () => {
  const base = { map, duration: DURATION, lastBar: LAST };
  it('from the loop, on its bar lines', () => {
    expect(defaultNewLimits({ ...base, loop: { start: 8.1, end: 15.9 }, position: 0, parts: [] })).toEqual({ start: 8, end: 16 });
  });
  it('else from the bar the playhead is in to the next part', () => {
    const parts = [part(0, 8), part(20, 30)];
    expect(defaultNewLimits({ ...base, loop: null, position: 9.5, parts })).toEqual({ start: 8, end: 20 });
  });
  it('else to the end of the piece when nothing follows', () => {
    expect(defaultNewLimits({ ...base, loop: null, position: 40, parts: [part(0, 8)] })).toEqual({ start: 40, end: 48 });
  });
  it('inside a part: to its end', () => {
    expect(defaultNewLimits({ ...base, loop: null, position: 10, parts: [part(8, 16), part(16, 24)] })).toEqual({ start: 10, end: 16 });
  });
  it('is at least one bar, even at the very end', () => {
    const r = defaultNewLimits({ ...base, loop: null, position: 47.5, parts: [] });
    expect(r.end).toBeGreaterThan(r.start);
    expect(r.end).toBeLessThanOrEqual(DURATION);
  });
});
