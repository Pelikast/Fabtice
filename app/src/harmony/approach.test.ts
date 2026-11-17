// The spelling of a chord that slides down a half step to the next one (`chord.ts#rootName`,
// `approachTargets`, `pitch.ts#upperNeighbour`): « Bm B♭7 | Am7 G♯7 | C♯m7♭5 » in B minor, as the
// cahier writes it, whatever the key, the transposition or the instrument.

import { describe, expect, it } from 'vitest';
import type { ChordSymbol, Key } from '../model/harmony';
import { approachTargets, chord, chordText } from './chord';
import { displayChordText, displayContext } from './display';
import { noteText, upperNeighbour } from './pitch';

const k = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });
const B_MINOR = k(11, 'minor');
/** Each chord of a sequence written with its target, in `key`. */
const written = (seq: (ChordSymbol | null)[], key: Key) => {
  const next = approachTargets(seq);
  return seq.map((c, i) => chordText(c, { key, next: next[i] }));
};

describe('a chord a half step above the next one is named after it', () => {
  it('the cahier\'s « Bm B♭7 | Am7 G♯7 | C♯m7♭5 » in B minor', () => {
    const seq = [chord(11, 'min'), chord(10, '7'), chord(9, 'min7'), chord(8, '7'), chord(1, 'hdim7')];
    expect(written(seq, B_MINOR)).toEqual(['Bm', 'B♭7', 'Am7', 'G♯7', 'C♯m7♭5']);
    // without its target (the key alone): A♯7
    expect(chordText(chord(10, '7'), { key: B_MINOR })).toBe('A♯7');
  });

  it('a tritone substitute and a chromatic approach, in sharp and flat keys', () => {
    // C major: D♭7 → C△; E major: F7 → E△ (not E♯7); B major: G7 → F♯△
    expect(written([chord(1, '7'), chord(0, 'maj7')], k(0))).toEqual(['D♭7', 'C△']);
    expect(written([chord(5, '7'), chord(4, 'maj7')], k(4))).toEqual(['F7', 'E△']);
    expect(written([chord(7, '7'), chord(6, 'maj7')], k(11))).toEqual(['G7', 'F♯△']);
    // D7 → C♯m7♭5 in A major (D natural over C♯, the letter above)
    expect(written([chord(2, '7'), chord(1, 'hdim7')], k(9))).toEqual(['D7', 'C♯m7♭5']);
  });

  it('never a double accidental nor C♭, F♭, E♯, B♯: the key\'s spelling then', () => {
    // B7 → B♭△ in B♭: the letter above B♭ is C, « C♭7 » is refused: B7
    expect(written([chord(11, '7'), chord(10, 'maj7')], k(10))).toEqual(['B7', 'B♭△']);
    // G7 → G♭△ in G♭: the letter above G♭ is A, « A♭♭ » impossible: G7
    expect(written([chord(7, '7'), chord(6, 'maj7')], k(6))).toEqual(['G7', 'G♭△']);
    expect(upperNeighbour(11, { letter: 'B', accidental: -1 })).toBeNull();
    expect(upperNeighbour(7, { letter: 'G', accidental: -1 })).toBeNull();
    expect(noteText(upperNeighbour(10, { letter: 'A', accidental: 0 })!)).toBe('B♭');
  });

  it('a fifth above its target, or a half step below it, keeps the key\'s spelling', () => {
    // G♯7 → C♯m7♭5 in B minor; C♯°7 → Dm7 in C (the passing diminished, already raised); C♯7 → Dm7 in C
    expect(written([chord(8, '7'), chord(1, 'hdim7')], B_MINOR)).toEqual(['G♯7', 'C♯m7♭5']);
    expect(written([chord(1, 'dim7'), chord(2, 'min7')], k(0))).toEqual(['C♯°7', 'Dm7']);
    expect(written([chord(1, '7'), chord(2, 'min7')], k(0))).toEqual(['D♭7', 'Dm7']);
  });
});

describe('the target of each chord in a sequence', () => {
  it('the next chord of another root, across repeats of the same root, none at the end or before N.C.', () => {
    const bb7 = chord(10, '7');
    const bbm = chord(10, 'min7');
    const a = chord(9, 'min7');
    expect(approachTargets([bb7, bb7, a])).toEqual([a, a, null]);
    // the same root in another colour looks further on too
    expect(approachTargets([bb7, bbm, a])).toEqual([a, a, null]);
    expect(approachTargets([bb7, null, a])).toEqual([null, null, null]);
    expect(approachTargets([a, bb7])).toEqual([bb7, null]);
    expect(approachTargets([])).toEqual([]);
  });

  it('a chromatic chord repeated in the next bar is spelled the same in both bars', () => {
    expect(written([chord(10, '7'), chord(10, '7'), chord(9, 'min7')], B_MINOR)).toEqual(['B♭7', 'B♭7', 'Am7']);
    // before N.C. or at the end, the key decides
    expect(written([chord(10, '7'), null], B_MINOR)).toEqual(['A♯7', 'N.C.']);
  });
});

describe('the rule works on the written pitches (transposed, B♭ and E♭ instruments)', () => {
  it('« B♭7 → Am7 » in B minor is « C7 → B » for a B♭ instrument, « G7 → F♯ » for an E♭ one, « B7 → B♭ » a half step up', () => {
    const next = chord(9, 'min7');
    const sib = displayContext(B_MINOR, 0, 'sib', 'm');
    const mib = displayContext(B_MINOR, 0, 'mib', 'm');
    const up = displayContext(B_MINOR, 1, 'ut', 'm');
    expect(displayChordText(chord(10, '7'), sib, next)).toBe('C7');
    expect(displayChordText(chord(10, '7'), mib, next)).toBe('G7');
    expect(displayChordText(chord(10, '7'), up, next)).toBe('B7');
    expect(displayChordText(chord(9, 'min7'), up)).toBe('B♭m7');
    // a transposition that would ask for C♭ (B7 → B♭m7 in a flat key) keeps the key's B
    expect(displayChordText(chord(10, '7'), displayContext(k(10), 1, 'ut', 'm'), next)).toBe('B7');
  });
});
