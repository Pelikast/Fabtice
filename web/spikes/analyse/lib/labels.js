// Display names: jazz chord symbols spelled for the key, French key names.
import { NO_CHORD, chordRoot, chordQual } from './chords.js';

const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const FR_MAJ = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const FR_MIN = ['do', 'do♯', 'ré', 'mi♭', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'si♭', 'si'];
const SHARP_MAJ = new Set([7, 2, 9, 4, 11]);
const SHARP_MIN = new Set([4, 11, 6, 1, 8]);

export function usesSharps(key) {
  if (!key) return false;
  return key.minor ? SHARP_MIN.has(key.tonic) : SHARP_MAJ.has(key.tonic);
}

export const pcName = (pc, key) => (usesSharps(key) ? SHARP : FLAT)[pc];

const QSYM = {
  maj: '', min: 'm', aug: '+', dim: '°', sus2: 'sus2', sus4: 'sus4', '7': '7', maj7: 'maj7', min7: 'm7',
  minmaj7: 'm(maj7)', maj6: '6', min6: 'm6', dim7: '°7', hdim7: 'm7♭5',
};

export function chordName(c, key) {
  if (c === NO_CHORD) return 'N.C.';
  return pcName(chordRoot(c), key) + QSYM[chordQual(c)];
}

// Symbol with suggested extensions folded in, e.g. G7 + 9, 13 -> "G7(9, 13)".
export function chordWithSuggestions(seg, key) {
  let s = chordName(seg.chord, key);
  if (seg.extensions && seg.extensions.length) s += '(' + seg.extensions.map((e) => e.name.replace('b', '♭').replace('#', '♯')).join(', ') + ')';
  if (seg.bass) s += '/' + pcName(seg.bass.pc, key);
  return s;
}

export function keyName(k) {
  return k.minor ? `${FR_MIN[k.tonic]} mineur` : `${FR_MAJ[k.tonic]} majeur`;
}

export function keyShort(k) {
  return pcName(k.tonic, k) + (k.minor ? 'm' : '');
}
