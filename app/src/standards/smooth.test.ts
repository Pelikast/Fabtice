// The percentage of the chart download advances steadily between two real steps, never past the next one.

import { describe, expect, it } from 'vitest';
import { finishedOf, smoothFraction } from './smooth';

const row = (state: 'waiting' | 'fetching' | 'kept' | 'failed' | 'cancelled') => ({ id: state, name: state, state, tunes: 0, host: null, page: 0, pages: 1 });

describe('smoothFraction', () => {
  it('counts the collections finished, a failure included', () => {
    expect(finishedOf({ rows: [row('kept'), row('failed'), row('fetching'), row('waiting')] })).toEqual({ finished: 2, total: 4 });
  });

  it('creeps forward at each tick, never backwards and never past the next real step', () => {
    let shown = 0;
    const seen: number[] = [];
    for (let i = 0; i < 100; i++) {
      shown = smoothFraction(shown, 0, 4, 200);
      seen.push(shown);
    }
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]!)).toBe(true);
    expect(seen[0]).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThan(0.25);
  });

  it('jumps to the real figure when a collection finishes, and ends at 1', () => {
    expect(smoothFraction(0.1, 1, 4, 200)).toBeGreaterThanOrEqual(0.25);
    expect(smoothFraction(0.5, 4, 4, 200)).toBe(1);
    expect(smoothFraction(0.5, 0, 0, 200)).toBe(0);
  });
});
