import { describe, expect, it } from 'vitest';
import { followTarget } from './useFollowLine';

// A view 600 px high, lines 92 px high, a sheet 2000 px high.
const input = (top: number, scrollTop = 500) => ({ top, height: 92, viewHeight: 600, scrollTop, scrollMax: 1400 });

describe('following the line being played', () => {
  it('leaves the sheet alone while the line and the next one are in view', () => {
    expect(followTarget(input(100))).toBeNull();
    expect(followTarget(input(300))).toBeNull();
  });

  it('turns the page when the next line would fall below the fold', () => {
    const to = followTarget(input(420));
    expect(to).not.toBeNull();
    // The line goes to about a quarter of the way down, so what follows is in view.
    expect(to).toBeCloseTo(500 + 420 - 600 * 0.28, 5);
  });

  it('comes back when the playhead wraps above the view (loop)', () => {
    const to = followTarget(input(-250));
    expect(to).toBeCloseTo(500 - 250 - 168, 5);
  });

  it('never scrolls past either end of the sheet', () => {
    expect(followTarget({ top: -50, height: 92, viewHeight: 600, scrollTop: 100, scrollMax: 1400 })).toBe(0);
    expect(followTarget({ top: 450, height: 92, viewHeight: 600, scrollTop: 1300, scrollMax: 1400 })).toBe(1400);
  });

  it('does nothing when it could not move the sheet (the last lines of the piece)', () => {
    expect(followTarget({ top: 450, height: 92, viewHeight: 600, scrollTop: 1400, scrollMax: 1400 })).toBeNull();
  });
});
