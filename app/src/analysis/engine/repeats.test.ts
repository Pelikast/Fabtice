// Repeats of the form on synthetic evidence: the form is found, a bar the
// network misheard is helped by the other choruses, a reharmonised bar whose
// own evidence is clear keeps its chord, and a piece without repeats is left
// alone.

import { describe, expect, it } from 'vitest';
import { applyEvidence, barsOf } from './evidence';
import { findRepeats } from './repeats';
import { best, ix, numbersFor, rng, unit } from './structure.fixtures';

// a blues in F, one chord per bar
const BLUES: number[] = [ix(5, '7'), ix(10, '7'), ix(5, '7'), ix(5, '7'), ix(10, '7'), ix(10, '7'), ix(5, '7'), ix(2, '7'), ix(7, 'min7'), ix(0, '7'), ix(5, '7'), ix(0, '7')];

/** `choruses` passes of a 12-bar form, `p` on the right chord, with changes by (chorus, bar). */
type Change = { c: number | null; p: number; second?: [number, number] };

function piece(choruses: number, p: number, changes: Map<string, Change> = new Map(), intro: number[] = [], seed = 1) {
  const r = rng(seed);
  const chords: number[] = [];
  const units = [];
  for (const c of intro) for (let k = 0; k < 4; k++) {
    units.push(unit(c, p, r));
    chords.push(c);
  }
  for (let ch = 0; ch < choruses; ch++) {
    for (let b = 0; b < BLUES.length; b++) {
      const ov = changes.get(`${ch}:${b}`);
      for (let k = 0; k < 4; k++) {
        units.push(unit(ov ? ov.c : BLUES[b]!, ov ? ov.p : p, r, 0, ov?.second ?? null));
        chords.push(BLUES[b]!);
      }
    }
  }
  return { units, numbers: numbersFor(units.length / 4, 4), chords };
}

describe('bars of a grid', () => {
  it('puts the beats before the first downbeat in a pickup', () => {
    const l = barsOf([3, 4, 1, 2, 3, 4, 1, 2]);
    expect(l.pickup).toEqual([0, 1]);
    expect(l.bars).toEqual([[2, 3, 4, 5], [6, 7]]);
    expect(l.barOfBeat).toEqual([-1, -1, 0, 0, 0, 0, 1, 1]);
  });
});

describe('repeats of the form', () => {
  it('finds a 12-bar form over four choruses', () => {
    const { units, numbers } = piece(4, 0.6);
    const r = findRepeats(units, numbers);
    expect(r.formLength).toBe(12);
    expect(r.choruses.map((c) => c.start)).toEqual([0, 12, 24, 36]);
    expect(r.support.every((s) => s > 0)).toBe(true);
  });

  it('helps a bar the network misheard, from the other choruses', () => {
    // chorus 2, bar 8: the network hears nothing clear there
    // chorus 3, bar 4: the network prefers C7 to the F7 played, but only just
    const changes = new Map<string, Change>([['1:8', { c: null, p: 0 }], ['2:3', { c: ix(0, '7'), p: 0.3, second: [ix(5, '7'), 0.2] }]]);
    const { units, numbers, chords } = piece(4, 0.6, changes);
    const before = best(units);
    const misheard = 12 * 4 + 8 * 4;
    expect(before[misheard]).not.toBe(chords[misheard]);
    const r = findRepeats(units, numbers);
    const after = best(applyEvidence(units, [r.source]));
    for (let k = 0; k < 4; k++) expect(after[misheard + k]).toBe(chords[misheard + k]);
    // the near miss is put right by the other choruses
    const weak = 24 * 4 + 3 * 4;
    expect(after[weak]).toBe(chords[weak]);
  });

  it('keeps a reharmonised bar whose own evidence is clear', () => {
    // chorus 3, bar 7: a tritone substitute (Ab7 for D7), clearly heard
    const sub = ix(8, '7');
    const { units, numbers } = piece(4, 0.6, new Map<string, Change>([['2:7', { c: sub, p: 0.9 }]]));
    const r = findRepeats(units, numbers);
    const after = best(applyEvidence(units, [r.source]));
    const at = 24 * 4 + 7 * 4;
    for (let k = 0; k < 4; k++) expect(after[at + k]).toBe(sub);
  });

  it('leaves the intro out of the form', () => {
    const intro = [ix(1, 'maj7'), ix(3, 'min7'), ix(6, '7'), ix(11, 'min')];
    const { units, numbers } = piece(4, 0.6, new Map(), intro);
    const r = findRepeats(units, numbers);
    expect(r.formLength).toBe(12);
    expect(r.choruses[0]!.start).toBe(4);
    // the first two intro bars have no partner (their neighbourhood matches nothing)
    expect(r.support[0]).toBe(0);
    expect(r.support[1]).toBe(0);
  });

  it('does nothing on a piece without repeats', () => {
    const rand = rng(7);
    const units = [];
    for (let b = 0; b < 48; b++) {
      const c = Math.floor(rand() * 168);
      for (let k = 0; k < 4; k++) units.push(unit(c, 0.6, rand));
    }
    const r = findRepeats(units, numbersFor(48, 4));
    expect(r.formLength).toBeNull();
    expect(r.source.weight.every((w) => w === 0)).toBe(true);
    expect(applyEvidence(units, [r.source])).toEqual(units);
  });

  it('does nothing on a single pass', () => {
    const { units, numbers } = piece(1, 0.6);
    const r = findRepeats(units, numbers);
    expect(r.formLength).toBeNull();
    expect(r.source.logp.every((l) => l === null)).toBe(true);
  });
});
