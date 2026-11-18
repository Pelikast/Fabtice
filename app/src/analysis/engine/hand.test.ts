import { describe, expect, it } from 'vitest';
import { N_CHORDS, NO_CHORD, type PooledUnit } from './chords';
import { HAND, handSource } from './hand';
import type { RepeatAnalysis } from './repeats';

const unit = (i: number): PooledUnit => ({
  t0: i,
  t1: i + 1,
  logp: new Float64Array(N_CHORDS).fill(Math.log(1 / N_CHORDS)),
  pitch: new Float64Array(12),
  bass: new Float64Array(13),
  frames: 10,
});

describe('hand chords as evidence', () => {
  // Two bars of 4/4 paired by the repeats; the user wrote G7 (index 7 * 14 + quality of « 7 ») on bar 0.
  const units = Array.from({ length: 8 }, (_, i) => unit(i));
  const numbers = [1, 2, 3, 4, 1, 2, 3, 4];
  const rep = { partners: [[{ bar: 1, weight: 1 }], [{ bar: 0, weight: 1 }]] } as unknown as RepeatAnalysis;
  const g7 = 7 * 14 + 2;

  it('weighs strongly on its own beats and, by the repeats, on the partner bar', () => {
    const src = handSource(units, numbers, [{ time: 0, chord: g7 }, { time: 4, chord: NO_CHORD }], rep);
    expect(src.weight.slice(0, 4).every((w) => w === HAND.own)).toBe(true);
    // Bar 1 has a hand chord too (« N.C. » from 4 s): written, so not overridden by bar 0.
    expect(src.weight[4]).toBe(HAND.own);
  });

  it('only on the bars written by hand, and on their partners', () => {
    const src = handSource(units, numbers, [{ time: 0, chord: g7 }], rep);
    expect(src.weight[0]).toBe(HAND.own);
    // Bar 1: no hand chord starts there, the audio is in full doubt: partner weight.
    expect(src.weight[4]).toBeCloseTo(HAND.partner * (0.25 + 0.75 * (1 - 1 / N_CHORDS)), 6);
    const best = src.logp[4]!.indexOf(Math.max(...src.logp[4]!));
    expect(best).toBe(g7);
  });
});
