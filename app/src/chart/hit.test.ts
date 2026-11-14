import { describe, expect, it } from 'vitest';
import { barAtPoint, selectionRange, type CellBox } from './hit';

// Two lines of four bars, then a last line of two: 100 × 90 cells, lines 100 px apart.
const cells: CellBox[] = [];
for (let bar = 0; bar < 10; bar++) cells.push({ bar, x: (bar % 4) * 100, y: Math.floor(bar / 4) * 100, w: 100, h: 90 });

describe('bar under a point', () => {
  it('inside a cell', () => {
    expect(barAtPoint(cells, 10, 10)).toBe(0);
    expect(barAtPoint(cells, 350, 50)).toBe(3);
    expect(barAtPoint(cells, 150, 120)).toBe(5);
  });

  it('a cell includes its left edge and not its right one', () => {
    expect(barAtPoint(cells, 100, 10)).toBe(1);
    expect(barAtPoint(cells, 99.9, 10)).toBe(0);
  });

  it('in the gap between two lines: the nearer line', () => {
    expect(barAtPoint(cells, 50, 93)).toBe(0);
    expect(barAtPoint(cells, 50, 98)).toBe(4);
  });

  it('above the first line and below the last one', () => {
    expect(barAtPoint(cells, 250, -40)).toBe(2);
    expect(barAtPoint(cells, 50, 900)).toBe(8);
  });

  it('left or right of a line: its first or last bar (also on a short last line)', () => {
    expect(barAtPoint(cells, -30, 150)).toBe(4);
    expect(barAtPoint(cells, 460, 150)).toBe(7);
    expect(barAtPoint(cells, 390, 250)).toBe(9);
  });

  it('works on bars numbered from a pick-up bar', () => {
    const pick: CellBox[] = [{ bar: -1, x: 0, y: 0, w: 100, h: 90 }, ...cells.map((c) => ({ ...c, y: c.y + 100 }))];
    expect(barAtPoint(pick, 30, 30)).toBe(-1);
    expect(barAtPoint(pick, 30, 130)).toBe(0);
  });

  it('nothing to hit', () => {
    expect(barAtPoint([], 10, 10)).toBeNull();
  });
});

describe('selection across lines', () => {
  it('goes from the bar a drag started on to the one it is on, either direction', () => {
    expect(selectionRange(2, 6)).toEqual({ first: 2, last: 6 });
    expect(selectionRange(6, 2)).toEqual({ first: 2, last: 6 });
    expect(selectionRange(3, 3)).toEqual({ first: 3, last: 3 });
  });

  it('a drag from the bottom line back up the page, through the gaps', () => {
    const path = [[350, 250], [350, 92], [120, 97], [120, 40]];
    const bars = path.map(([x, y]) => barAtPoint(cells, x!, y!)!);
    expect(bars).toEqual([9, 3, 5, 1]);
    expect(selectionRange(9, bars[3]!)).toEqual({ first: 1, last: 9 });
  });
});
