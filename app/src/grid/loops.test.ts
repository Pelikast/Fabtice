import { describe, expect, it } from 'vitest';
import {
  MIN_LOOP_SECONDS,
  adjacentLine,
  constantTempoMap,
  loopCoverage,
  loopFromBars,
  loopFromDrag,
  loopWithEdgeAt,
  snapTime,
  variableTempoMap,
  wholeBarsOf,
} from './index';

// 120 BPM, 4/4, first downbeat at 0: a beat lasts 0.5 s, a bar 2 s, a sixteenth 0.125 s.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const DURATION = 60;
const SIXTEENTHS = { subdivision: 4, triplets: false } as const;
const EIGHTH_TRIPLETS = { subdivision: 2, triplets: true } as const;
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('adjacentLine', () => {
  it('finds the next and the previous line of the sub-grid, across bars', () => {
    close(adjacentLine(map, 2.5, 1, SIXTEENTHS), 2.625);
    close(adjacentLine(map, 2.5, -1, SIXTEENTHS), 2.375);
    // From a bar line: forward is the first line inside the bar, back is the last line of the bar before.
    close(adjacentLine(map, 4, 1, SIXTEENTHS), 4.125);
    close(adjacentLine(map, 4, -1, SIXTEENTHS), 3.875);
    // Between two lines: the line either side.
    close(adjacentLine(map, 2.55, 1, SIXTEENTHS), 2.625);
    close(adjacentLine(map, 2.55, -1, SIXTEENTHS), 2.5);
  });

  it('follows the triplet grid, and its shorter last step', () => {
    close(adjacentLine(map, 0, 1, EIGHTH_TRIPLETS), 0.5 / 3);
    close(adjacentLine(map, 1.5, 1, EIGHTH_TRIPLETS), 1.5 + 0.5 / 3);
    const quarterTriplets = { subdivision: 1, triplets: true } as const; // 3 lines per 2 beats
    const three = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    // 3/4: lines at 0, 2/3, 4/3, 2 beats, then the last step runs to the bar line at 3 beats.
    close(adjacentLine(three, 1.0, 1, quarterTriplets), 4 / 3); // 8/3 beats
    close(adjacentLine(three, 4 / 3, 1, quarterTriplets), 1.5); // the last step is shorter: to the bar line
    close(adjacentLine(three, 1.0, -1, quarterTriplets), 2 / 3);
  });
});

describe('selecting a loop with the magnet', () => {
  it('goes from beat 2 of bar 2 to the 4th sixteenth of beat 3 of bar 4 on a sixteenth sub-grid', () => {
    const r = loopFromDrag(map, 2.56, 7.34, DURATION, SIXTEENTHS);
    close(r.start, 2.5); // bar 2, beat 2
    close(r.end, 7.375); // bar 4, beat 3 + three sixteenths
  });

  it('does the same with triplets: from beat 2 of bar 2 to the third triplet of beat 3 of bar 4', () => {
    const r = loopFromDrag(map, 2.52, 7.31, DURATION, EIGHTH_TRIPLETS);
    close(r.start, 2.5);
    close(r.end, 7 + (2 * 0.5) / 3);
  });

  it('works dragging backwards', () => {
    expect(loopFromDrag(map, 7.34, 2.56, DURATION, SIXTEENTHS)).toEqual(loopFromDrag(map, 2.56, 7.34, DURATION, SIXTEENTHS));
  });

  it('is free when the magnet is off', () => {
    const r = loopFromDrag(map, 2.5731, 7.3419, DURATION, null);
    expect(r).toEqual({ start: 2.5731, end: 7.3419 });
  });

  it('keeps the playhead snapping and the loop snapping the same', () => {
    for (const t of [2.56, 3.1, 7.34, 11.97]) {
      const r = loopFromDrag(map, 1, t, DURATION, SIXTEENTHS);
      expect(r.end).toBe(snapTime(map, t, SIXTEENTHS));
    }
  });

  it('grows a tiny drag to one line of the sub-grid, towards the pointer, then to the minimum length', () => {
    // Press and release on the same line: one step of the grid (a sixteenth, 125 ms, is over the minimum).
    const a = loopFromDrag(map, 2.51, 2.52, DURATION, SIXTEENTHS);
    close(a.start, 2.5);
    close(a.end, 2.625);
    const back = loopFromDrag(map, 2.51, 2.49, DURATION, SIXTEENTHS);
    close(back.start, 2.375);
    close(back.end, 2.5);
    // Thirty-second notes at 120 are 62 ms: two steps get to the minimum.
    const fine = loopFromDrag(map, 2.51, 2.52, DURATION, { subdivision: 8, triplets: false });
    expect(fine.end - fine.start).toBeGreaterThanOrEqual(MIN_LOOP_SECONDS);
    close(fine.end - fine.start, 0.125);
  });

  it('grows a tiny free drag to the minimum length, towards the pointer', () => {
    const r = loopFromDrag(map, 5, 5.01, DURATION, null);
    close(r.start, 5);
    close(r.end, 5 + MIN_LOOP_SECONDS);
    const l = loopFromDrag(map, 5, 4.99, DURATION, null);
    close(l.end, 5);
    close(l.start, 5 - MIN_LOOP_SECONDS);
  });

  it('stays inside the piece', () => {
    const r = loopFromDrag(map, 58, 90, DURATION, SIXTEENTHS);
    expect(r.end).toBe(DURATION);
    const end = loopFromDrag(map, 59.99, 99, DURATION, null);
    expect(end.end).toBe(DURATION);
    expect(end.end - end.start).toBeGreaterThanOrEqual(MIN_LOOP_SECONDS - 1e-9);
    const start = loopFromDrag(map, 0.01, -5, DURATION, null);
    expect(start.start).toBe(0);
    expect(start.end - start.start).toBeGreaterThanOrEqual(MIN_LOOP_SECONDS - 1e-9);
  });
});

describe('dragging an edge of a loop', () => {
  const region = { start: 2.5, end: 7.375 };

  it('snaps the edge to the sub-grid, the other edge staying put', () => {
    const s = loopWithEdgeAt(map, region, 'start', 2.94, DURATION, SIXTEENTHS);
    close(s.start, 3);
    expect(s.end).toBe(7.375);
    const e = loopWithEdgeAt(map, region, 'end', 9.19, DURATION, SIXTEENTHS);
    close(e.end, 9.25);
    expect(e.start).toBe(2.5);
  });

  it('is free when the magnet is off', () => {
    expect(loopWithEdgeAt(map, region, 'end', 9.1913, DURATION, null)).toEqual({ start: 2.5, end: 9.1913 });
    expect(loopWithEdgeAt(map, region, 'start', 3.0417, DURATION, null)).toEqual({ start: 3.0417, end: 7.375 });
  });

  it('keeps the minimum length when an edge is pushed through the other', () => {
    const crushed = loopWithEdgeAt(map, region, 'start', 30, DURATION, SIXTEENTHS);
    expect(crushed.end).toBe(7.375);
    expect(7.375 - crushed.start).toBeGreaterThanOrEqual(MIN_LOOP_SECONDS);
    close(crushed.start, 7.25); // the line before that gets there
    const free = loopWithEdgeAt(map, region, 'end', 0, DURATION, null);
    close(free.end, 2.5 + MIN_LOOP_SECONDS);
  });

  it('can start from a loop that is not on the sub-grid (it was drawn free)', () => {
    const odd = { start: 2.5731, end: 7.3419 };
    const r = loopWithEdgeAt(map, odd, 'start', 2.9, DURATION, SIXTEENTHS);
    close(r.start, 2.875);
    expect(r.end).toBe(7.3419);
  });
});

describe('what a loop covers', () => {
  it('whole bars: from the line of the first to the end of the last', () => {
    const r = loopFromBars(map, 4, 7);
    expect(loopCoverage(map, r)).toEqual({ first: 4, last: 7, from: 0, to: 1 });
    expect(wholeBarsOf(map, r)).toEqual({ first: 4, last: 7 });
  });

  it('a loop inside bars: the first and last bar are partly covered', () => {
    const c = loopCoverage(map, { start: 2.5, end: 7.375 });
    expect(c.first).toBe(1);
    expect(c.last).toBe(3);
    close(c.from, 0.25); // beat 2 of 4
    close(c.to, 0.6875, 1e-3); // 2.75 beats into bar 4
    expect(wholeBarsOf(map, { start: 2.5, end: 7.375 })).toBeNull();
  });

  it('a loop inside one bar', () => {
    const c = loopCoverage(map, { start: 2.5, end: 3 });
    expect(c.first).toBe(1);
    expect(c.last).toBe(1);
    close(c.from, 0.25);
    close(c.to, 0.5);
  });

  it('an end on a bar line belongs to the bar before; a start a hair before a line is on it', () => {
    expect(loopCoverage(map, { start: 2.5, end: 6 })).toMatchObject({ first: 1, last: 2, to: 1 });
    expect(loopCoverage(map, { start: 1.9999, end: 6 })).toMatchObject({ first: 1, last: 2, from: 0, to: 1 });
  });

  it('works on a variable tempo, in beats', () => {
    const v = variableTempoMap(
      [
        { time: 0, bpm: 100 },
        { time: 2.4, bpm: 120 },
        { time: 4.4, bpm: 140 },
      ],
      [{ bar: 0, meter: { numerator: 4, denominator: 4 } }],
      'analysis',
    );
    // Bar 1 starts at 2.4 s, where the tempo is 120: its second beat is 0.5 s later.
    const c = loopCoverage(v, { start: 2.9, end: 4.4 });
    expect(c.first).toBe(1);
    close(c.from, 0.25, 1e-6);
    // 4.4 s is the start of bar 2 (4 beats of 0.5 s after 2.4): the loop ends on that line.
    expect(c.last).toBe(1);
    expect(c.to).toBe(1);
  });
});
