// Keys: conventional spelling of the tonic, names, transposition.

import type { Key, KeyMode, PitchClass } from '../model/harmony';
import type { MinorNotation } from '../model/project';
import { noteText, noteTextFr, pc, type NoteName } from './pitch';

/**
 * Tonic spelling as players write the key signature: flats for F, B♭, E♭,
 * A♭, D♭, G♭ major; sharps for G, D, A, E, B major. Minor keys: C♯, F♯, G♯
 * minor with sharps, E♭ and B♭ minor with flats.
 */
const MAJOR_TONIC: NoteName[] = [
  { letter: 'C', accidental: 0 }, { letter: 'D', accidental: -1 }, { letter: 'D', accidental: 0 },
  { letter: 'E', accidental: -1 }, { letter: 'E', accidental: 0 }, { letter: 'F', accidental: 0 },
  { letter: 'G', accidental: -1 }, { letter: 'G', accidental: 0 }, { letter: 'A', accidental: -1 },
  { letter: 'A', accidental: 0 }, { letter: 'B', accidental: -1 }, { letter: 'B', accidental: 0 },
];
const MINOR_TONIC: NoteName[] = [
  { letter: 'C', accidental: 0 }, { letter: 'C', accidental: 1 }, { letter: 'D', accidental: 0 },
  { letter: 'E', accidental: -1 }, { letter: 'E', accidental: 0 }, { letter: 'F', accidental: 0 },
  { letter: 'F', accidental: 1 }, { letter: 'G', accidental: 0 }, { letter: 'G', accidental: 1 },
  { letter: 'A', accidental: 0 }, { letter: 'B', accidental: -1 }, { letter: 'B', accidental: 0 },
];

/** Used to spell chords while no key is known (not analysed, none chosen). */
export const NEUTRAL_KEY: Key = { tonic: 0, mode: 'major' };

export function keyTonicName(key: Key): NoteName {
  return (key.mode === 'minor' ? MINOR_TONIC : MAJOR_TONIC)[pc(key.tonic)]!;
}

export function transposeKey(key: Key, semitones: number): Key {
  return { tonic: pc(key.tonic + semitones), mode: key.mode };
}

export function sameKey(a: Key | null, b: Key | null): boolean {
  return a === b || (a !== null && b !== null && pc(a.tonic) === pc(b.tonic) && a.mode === b.mode);
}

/** The relative key (A minor <-> C major). */
export function relativeKey(key: Key): Key {
  return key.mode === 'major' ? { tonic: pc(key.tonic + 9), mode: 'minor' } : { tonic: pc(key.tonic + 3), mode: 'major' };
}

/** Short chart-style name: « A♭ », « Fm » or « F– » (minor notation setting). */
export function keyLabel(key: Key, minor: MinorNotation = 'm'): string {
  return noteText(keyTonicName(key)) + (key.mode === 'minor' ? minor : '');
}

const MODE_FR: Record<KeyMode, string> = { major: 'majeur', minor: 'mineur' };

/** French name: « La♭ majeur », « Fa♯ mineur ». */
export function keyNameFr(key: Key): string {
  return `${noteTextFr(keyTonicName(key))} ${MODE_FR[key.mode]}`;
}

/** The 24 keys in the order of a correction menu: major keys C to B, then minor keys. */
export function allKeys(): Key[] {
  const out: Key[] = [];
  for (const mode of ['major', 'minor'] as const) for (let t: PitchClass = 0; t < 12; t++) out.push({ tonic: t, mode });
  return out;
}
