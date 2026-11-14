// Hit-testing of the chart, as pure functions over measured boxes (tested in
// hit.test.ts): which bar is under a point, also when the point is in the gap
// between lines or past the last bar, so that a drag across lines can pick
// bars in either direction.

/** A bar cell, in any one coordinate system (the chart's, so that scrolling does not matter). */
export interface CellBox {
  bar: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SAME_LINE_PX = 2;

interface Line {
  y: number;
  bottom: number;
  cells: CellBox[];
}

function toLines(cells: readonly CellBox[]): Line[] {
  const lines: Line[] = [];
  for (const c of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(c.y - last.y) <= SAME_LINE_PX) {
      last.cells.push(c);
      last.bottom = Math.max(last.bottom, c.y + c.h);
    } else lines.push({ y: c.y, bottom: c.y + c.h, cells: [c] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * The bar under (x, y). Inside a cell: that cell. Above the first line: the
 * first line; below the last: the last; in a gap between lines: the nearer
 * line. Within a line, left of it picks the first bar, right of it the last.
 * Null when there are no cells.
 */
export function barAtPoint(cells: readonly CellBox[], x: number, y: number): number | null {
  const lines = toLines(cells);
  if (!lines.length) return null;
  let line = lines.find((l) => y >= l.y && y < l.bottom);
  if (!line) {
    let best = Infinity;
    for (const l of lines) {
      const d = y < l.y ? l.y - y : y - l.bottom;
      if (d < best) {
        best = d;
        line = l;
      }
    }
  }
  const row = line!.cells;
  const inside = row.find((c) => x >= c.x && x < c.x + c.w);
  if (inside) return inside.bar;
  return (x < row[0]!.x ? row[0]! : row[row.length - 1]!).bar;
}

/** Bars from the one a drag started on to the one it is on now, either direction, across lines. */
export function selectionRange(anchor: number, bar: number): { first: number; last: number } {
  return { first: Math.min(anchor, bar), last: Math.max(anchor, bar) };
}
