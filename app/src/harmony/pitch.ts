// Pitch classes and their spelling. A pitch class (0…11) has no name of its
// own: « B♭ » or « A♯ » depends on the key it is read in. Spelling here is by
// scale degree, as a jazz chart does it:
//
//   offset from the tonic   0  1   2  3   4  5  6   7  8   9  10  11
//   degree                  1  ♭2  2  ♭3  3  4  ♯4  5  ♭6  6  ♭7  7
//
// The same table serves major and minor keys (in A minor: B♭7 is ♭II7, E7 is
// V7, G♯°7 is vii°7, F♯m7♭5 is vi of the melodic minor). A diminished seventh
// on ♭2, ♭3 or ♭6 is the passing chord between two degrees and is spelled as a
// raised degree instead (C, C♯°7, Dm7 — not D♭°7).
//
// Readability for the player first: a spelling that would need a double
// accidental, or C♭, F♭, E♯, B♯, gives the plain enharmonic name (B, E, F, C).

import type { PitchClass } from '../model/harmony';

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
/** −1 flat, 0 natural, +1 sharp. */
export type Accidental = -1 | 0 | 1;

/** A spelled note: letter and accidental. */
export interface NoteName {
  letter: Letter;
  accidental: Accidental;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC: Record<Letter, PitchClass> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const FLAT = '♭';
export const SHARP = '♯';

/** Brings any integer to 0…11. */
export function pc(n: number): PitchClass {
  return ((Math.round(n) % 12) + 12) % 12;
}

export function isPitchClass(n: unknown): n is PitchClass {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 12;
}

export function pitchClassOf(note: NoteName): PitchClass {
  return pc(LETTER_PC[note.letter] + note.accidental);
}

/** Default names, when no key says otherwise. */
const FLAT_NAMES: NoteName[] = [
  { letter: 'C', accidental: 0 }, { letter: 'D', accidental: -1 }, { letter: 'D', accidental: 0 },
  { letter: 'E', accidental: -1 }, { letter: 'E', accidental: 0 }, { letter: 'F', accidental: 0 },
  { letter: 'G', accidental: -1 }, { letter: 'G', accidental: 0 }, { letter: 'A', accidental: -1 },
  { letter: 'A', accidental: 0 }, { letter: 'B', accidental: -1 }, { letter: 'B', accidental: 0 },
];
const SHARP_NAMES: NoteName[] = [
  { letter: 'C', accidental: 0 }, { letter: 'C', accidental: 1 }, { letter: 'D', accidental: 0 },
  { letter: 'D', accidental: 1 }, { letter: 'E', accidental: 0 }, { letter: 'F', accidental: 0 },
  { letter: 'F', accidental: 1 }, { letter: 'G', accidental: 0 }, { letter: 'G', accidental: 1 },
  { letter: 'A', accidental: 0 }, { letter: 'A', accidental: 1 }, { letter: 'B', accidental: 0 },
];

export function flatName(p: PitchClass): NoteName {
  return FLAT_NAMES[pc(p)]!;
}

export function sharpName(p: PitchClass): NoteName {
  return SHARP_NAMES[pc(p)]!;
}

/** Scale degree (0 = 1st … 6 = 7th) of each semitone offset from the tonic. */
const DEGREE_OF_OFFSET = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;
/** Passing diminished chords: ♭2 -> ♯1, ♭3 -> ♯2, ♭6 -> ♯5. */
const RAISED_DEGREE: Partial<Record<number, number>> = { 1: 0, 3: 1, 8: 4 };

/** Letters a reader would rather not meet: C♭, F♭, E♯, B♯. */
function awkward(n: NoteName): boolean {
  return (n.accidental === -1 && (n.letter === 'C' || n.letter === 'F')) || (n.accidental === 1 && (n.letter === 'E' || n.letter === 'B'));
}

/** Plain enharmonic of an awkward or impossible name: the natural note when there is one. */
function plainName(p: PitchClass, preferSharp: boolean): NoteName {
  const natural = LETTERS.find((l) => LETTER_PC[l] === pc(p));
  if (natural) return { letter: natural, accidental: 0 };
  return preferSharp ? sharpName(p) : flatName(p);
}

export interface SpellOptions {
  /** Spell as the passing diminished chord (raised degree) where it applies. */
  passingDiminished?: boolean;
}

/**
 * Name of pitch class `p` read in a key whose tonic is spelled `tonic`.
 * Deterministic, never a double accidental.
 */
export function spellInKey(p: PitchClass, tonic: NoteName, opts: SpellOptions = {}): NoteName {
  const offset = pc(p - pitchClassOf(tonic));
  const raised = opts.passingDiminished ? RAISED_DEGREE[offset] : undefined;
  const degree = raised ?? DEGREE_OF_OFFSET[offset]!;
  const letter = LETTERS[(LETTERS.indexOf(tonic.letter) + degree) % 7]!;
  let acc = pc(p - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  const preferSharp = tonic.accidental === 1;
  if (acc < -1 || acc > 1) return plainName(p, preferSharp);
  const name: NoteName = { letter, accidental: acc as Accidental };
  return awkward(name) ? plainName(p, preferSharp) : name;
}

/** « B♭ », « F♯ », « C ». */
export function noteText(n: NoteName): string {
  return n.letter + (n.accidental === -1 ? FLAT : n.accidental === 1 ? SHARP : '');
}

const FRENCH: Record<Letter, string> = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** French note name: « Si♭ », « Fa♯ », « Do ». */
export function noteTextFr(n: NoteName): string {
  return FRENCH[n.letter] + (n.accidental === -1 ? FLAT : n.accidental === 1 ? SHARP : '');
}

/** Reads « Bb », « B♭ », « bb », « F# », « f♯ », « C » (letter then optional accidental). */
export function parseNoteName(text: string): NoteName | null {
  const m = /^([A-Ga-g])([b♭#♯]?)$/.exec(text.trim());
  if (!m) return null;
  const letter = m[1]!.toUpperCase() as Letter;
  const a = m[2];
  return { letter, accidental: a === 'b' || a === '♭' ? -1 : a === '#' || a === '♯' ? 1 : 0 };
}
