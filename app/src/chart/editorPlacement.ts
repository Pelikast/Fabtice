// Where the chord editor goes on a computer, as a pure function (tested in
// editorPlacement.test.ts). All coordinates are in the scrolling sheet's
// content space (y grows downward from the top of the scrollable content).
//
// Order of preference, always keeping the bar being edited in view and the
// whole editor inside the visible part of the sheet (which stops at the
// transport bar):
//   1. under the bar, then over it, with the sheet where it is;
//   2. beside the bar (right, then left);
//   3. under the bar again after scrolling the sheet (bar and editor together);
//   4. last resort, the editor taller than the window: it gets a maximum
//      height and scrolls inside, beside the bar if there is room, else under it.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlaceInput {
  /** The visible part of the sheet: its scroll position and client size. */
  view: Box;
  /** The bar being edited. */
  cell: Box;
  /** The editor at its natural size (no maximum height). */
  size: { width: number; height: number };
  /** Space between the bar and the editor. */
  gap?: number;
  /** Space kept between the editor (or the bar) and the edge of the view. */
  margin?: number;
}

export type Side = 'below' | 'above' | 'right' | 'left';

export interface Placement {
  left: number;
  top: number;
  /** Set when the editor does not fit as it is: it scrolls inside. Null otherwise. */
  maxHeight: number | null;
  /** Where the sheet must be scrolled to (equal to `view.top` when it does not move). */
  scrollTop: number;
  side: Side;
}

export function placeEditor({ view, cell, size, gap = 6, margin = 8 }: PlaceInput): Placement {
  const { width: W, height: H } = size;
  const cellBottom = cell.top + cell.height;
  const cellRight = cell.left + cell.width;
  const viewLeft = view.left + margin;
  const viewRight = view.left + view.width - margin;
  const avail = view.height - 2 * margin;

  /** Smallest scroll that brings [top, bottom] into the view (the top wins when it does not fit). */
  const bring = (from: number, top: number, bottom: number) => {
    let s = from;
    if (bottom > s + view.height - margin) s = bottom + margin - view.height;
    if (top < s + margin) s = top - margin;
    return Math.max(0, s);
  };
  const clampLeft = (x: number) => Math.max(viewLeft, Math.min(x, viewRight - W));
  const make = (side: Side, left: number, top: number, scrollTop: number, maxHeight: number | null = null): Placement => ({ left, top, maxHeight, scrollTop, side });
  const fitsAround = (s: number, top: number, bottom: number) => top >= s + margin - 0.5 && bottom <= s + view.height - margin + 0.5;

  // The bar itself must be in view, whatever happens next.
  const s0 = bring(view.top, cell.top, cellBottom);

  const left = clampLeft(cell.left);
  const belowTop = cellBottom + gap;
  const aboveTop = cell.top - gap - H;
  if (H <= avail) {
    if (fitsAround(s0, belowTop, belowTop + H)) return make('below', left, belowTop, s0);
    if (fitsAround(s0, aboveTop, aboveTop + H)) return make('above', left, aboveTop, s0);
    const side = beside(cell, cellRight, W, viewLeft, viewRight, gap);
    if (side) {
      const top = Math.max(s0 + margin, Math.min(cell.top, s0 + view.height - margin - H));
      return make(side.side, side.left, top, s0);
    }
    if (cell.height + gap + H <= avail) {
      const s = bring(s0, cell.top, belowTop + H);
      return make('below', left, belowTop, s);
    }
  }

  // Taller than the window (or no way to fit it): it scrolls inside.
  const side = beside(cell, cellRight, W, viewLeft, viewRight, gap);
  if (side) return make(side.side, side.left, s0 + margin, s0, avail);
  // Under the bar, the bar brought to the top of the view; or over it with the bar at the bottom, if that gives more room.
  const roomUnder = avail - cell.height - gap;
  const sTop = Math.max(0, cell.top - margin);
  return make('below', left, belowTop, sTop, Math.max(120, roomUnder));
}

/** Right of the bar, else left of it, when the editor's width fits there. */
function beside(cell: Box, cellRight: number, W: number, viewLeft: number, viewRight: number, gap: number): { side: Side; left: number } | null {
  if (cellRight + gap + W <= viewRight) return { side: 'right', left: cellRight + gap };
  if (cell.left - gap - W >= viewLeft) return { side: 'left', left: cell.left - gap - W };
  return null;
}
