import { describe, expect, it } from 'vitest';
import { placeEditor, type Box, type Placement } from './editorPlacement';

const view = (height: number, top = 0, width = 1280): Box => ({ left: 0, top, width, height });
const cell = (top: number, left = 434): Box => ({ left, top, width: 206, height: 92 });
const M = 8;

/** The editor, as placed, lies inside the view once the sheet is scrolled where the placement says. */
function inside(p: Placement, v: Box, size: { width: number; height: number }) {
  const h = p.maxHeight === null ? size.height : Math.min(size.height, p.maxHeight);
  return p.top >= p.scrollTop + M - 1 && p.top + h <= p.scrollTop + v.height - M + 1 && p.left >= v.left + M - 1 && p.left + size.width <= v.left + v.width - M + 1;
}
const cellVisible = (p: Placement, c: Box, v: Box) => c.top >= p.scrollTop && c.top + c.height <= p.scrollTop + v.height;
const overlaps = (p: Placement, c: Box, size: { width: number; height: number }) => {
  const h = p.maxHeight === null ? size.height : Math.min(size.height, p.maxHeight);
  return p.left < c.left + c.width && p.left + size.width > c.left && p.top < c.top + c.height && p.top + h > c.top;
};

describe('placeEditor', () => {
  const size = { width: 372, height: 400 };

  it('goes under the bar when there is room, without moving the sheet', () => {
    const v = view(650);
    const p = placeEditor({ view: v, cell: cell(72), size });
    expect(p.side).toBe('below');
    expect(p.top).toBe(72 + 92 + 6);
    expect(p.scrollTop).toBe(0);
    expect(p.maxHeight).toBeNull();
  });

  it('goes over the bar when there is no room under it', () => {
    const v = view(650);
    const c = cell(520);
    const p = placeEditor({ view: v, cell: c, size });
    expect(p.side).toBe('above');
    expect(p.top).toBe(520 - 6 - 400);
    expect(inside(p, v, size)).toBe(true);
  });

  it('goes beside the bar when neither under nor over fits', () => {
    const v = view(490);
    const c = cell(200);
    const tall = { width: 372, height: 460 };
    const p = placeEditor({ view: v, cell: c, size: tall });
    expect(['right', 'left']).toContain(p.side);
    expect(inside(p, v, tall)).toBe(true);
    expect(overlaps(p, c, tall)).toBe(false);
    expect(cellVisible(p, c, v)).toBe(true);
  });

  it('scrolls the sheet when it is the only way to keep bar and editor together (narrow window)', () => {
    const v = view(600, 0, 400);
    const c = cell(300, 100);
    const p = placeEditor({ view: v, cell: c, size: { width: 372, height: 400 } });
    expect(p.side).toBe('below');
    expect(p.scrollTop).toBeGreaterThan(0);
    expect(cellVisible(p, c, v)).toBe(true);
    expect(inside(p, v, { width: 372, height: 400 })).toBe(true);
  });

  it('as a last resort, caps the height and scrolls inside, never outside the view', () => {
    const v = view(440);
    const c = cell(100);
    const huge = { width: 372, height: 800 };
    const p = placeEditor({ view: v, cell: c, size: huge });
    expect(p.maxHeight).not.toBeNull();
    expect(p.maxHeight!).toBeLessThanOrEqual(440 - 2 * M);
    expect(inside(p, v, huge)).toBe(true);
    expect(overlaps(p, c, huge)).toBe(false);
    expect(cellVisible(p, c, v)).toBe(true);
  });

  it('last resort with no room beside: under the bar, bar brought to the top', () => {
    const v = view(440, 0, 420);
    const c = cell(100, 40);
    const huge = { width: 372, height: 800 };
    const p = placeEditor({ view: v, cell: c, size: huge });
    expect(p.side).toBe('below');
    expect(p.scrollTop).toBe(100 - M);
    expect(p.top + (p.maxHeight ?? huge.height)).toBeLessThanOrEqual(p.scrollTop + 440 - M + 1);
    expect(cellVisible(p, c, v)).toBe(true);
  });

  it('brings a bar that is out of view back into view', () => {
    const v = view(650, 400);
    const c = cell(100);
    const p = placeEditor({ view: v, cell: c, size });
    expect(p.scrollTop).not.toBe(400);
    expect(cellVisible(p, c, v)).toBe(true);
    expect(inside(p, v, size)).toBe(true);
  });

  it('keeps the editor inside the window horizontally', () => {
    const v = view(650);
    const p = placeEditor({ view: v, cell: cell(72, 1000), size });
    expect(p.left + size.width).toBeLessThanOrEqual(1280 - M);
  });

  it('holds for every bar position and window size down to 960×640', () => {
    for (const [w, h] of [[1280, 650], [960, 490], [1100, 560]] as const) {
      for (const height of [380, 470, 560, 700, 900]) {
        for (let top = 72; top <= 72 + 6 * 92; top += 92) {
          for (const left of [0, 206, 412, 618].map((x) => x + (w - 824) / 2)) {
            const v = view(h, 0, w);
            const c = cell(top, left);
            const sz = { width: 372, height };
            const p = placeEditor({ view: v, cell: c, size: sz });
            const ok = inside(p, v, sz) && cellVisible(p, c, v) && !overlaps(p, c, sz);
            expect(ok, `${w}x${h} editor ${height} bar at ${top},${left}: ${JSON.stringify(p)}`).toBe(true);
          }
        }
      }
    }
  });
});
