// The chord vocabulary of iReal Pro, and the mapping from the app's chords.
// See IREAL-FORMAT.md (« Chords ») for the sources and the reasoning.
//
// iReal Pro writes a chord as root + quality text + optional « /bass »: `Bb`,
// `C^7`, `D-7`, `G7b9`, `Bh7`, `F#o7`, `Eb^7#11`, `C-^7`, `Ab69`, `Csus`. A
// fixed list of quality texts is what its editor produces and what its player
// understands. Each row below pairs such a text with what it means in the
// app's vocabulary (quality + extensions), so the same table encodes and, in
// the tests, decodes.

import { sortExtensions } from '../harmony/parse';
import type { ChordExtension, ChordQuality, ChordSymbol } from '../model/harmony';
import type { NoteName } from '../harmony/pitch';

export interface IRealQuality {
  /** The text after the root (« 7b9 », « ^7 », « h7 »). */
  text: string;
  quality: ChordQuality;
  /** Extensions this text spells (a set; order does not matter). */
  ext: readonly ChordExtension[];
}

const row = (text: string, quality: ChordQuality, ...ext: ChordExtension[]): IRealQuality => ({ text, quality, ext });

/**
 * Every quality text the export may write. Within one quality, rows with the
 * most extensions come first; between rows of equal size the order is the
 * preference (« 13 » before « 11 » before « 9 »: the richer chord implies the
 * poorer one).
 */
export const IREAL_QUALITIES: readonly IRealQuality[] = [
  row('', 'maj'),
  row('add9', 'maj', '9'),
  row('6', 'maj6'),
  row('69', 'maj6', '9'),
  row('^7', 'maj7'),
  row('^9#11', 'maj7', '9', '#11'),
  row('^13', 'maj7', '13'),
  row('^9', 'maj7', '9'),
  row('^7#11', 'maj7', '#11'),
  row('^7#5', 'maj7', '#5'),
  row('-', 'min'),
  row('-b6', 'min', 'b13'),
  row('-#5', 'min', '#5'),
  row('-6', 'min6'),
  row('-69', 'min6', '9'),
  row('-7', 'min7'),
  row('-11', 'min7', '11'),
  row('-9', 'min7', '9'),
  row('-7b5', 'min7', 'b5'),
  row('-^7', 'minmaj7'),
  row('-^9', 'minmaj7', '9'),
  row('o', 'dim'),
  row('o7', 'dim7'),
  row('h7', 'hdim7'),
  row('h9', 'hdim7', '9'),
  row('+', 'aug'),
  row('2', 'sus2'),
  row('sus', 'sus4'),
  row('7sus', '7sus4'),
  row('7b9sus', '7sus4', 'b9'),
  row('7b13sus', '7sus4', 'b13'),
  row('13sus', '7sus4', '13'),
  row('9sus', '7sus4', '9'),
  row('7', '7'),
  row('7b9b13', '7', 'b9', 'b13'),
  row('7b9#11', '7', 'b9', '#11'),
  row('7b9#9', '7', 'b9', '#9'),
  row('7b9#5', '7', 'b9', '#5'),
  row('7b9b5', '7', 'b9', 'b5'),
  row('7#9#11', '7', '#9', '#11'),
  row('7#9#5', '7', '#9', '#5'),
  row('7#9b5', '7', '#9', 'b5'),
  row('13#11', '7', '13', '#11'),
  row('13b9', '7', '13', 'b9'),
  row('13#9', '7', '13', '#9'),
  row('9#11', '7', '9', '#11'),
  row('9b5', '7', '9', 'b5'),
  row('9#5', '7', '9', '#5'),
  row('7alt', '7', 'alt'),
  row('13', '7', '13'),
  row('11', '7', '11'),
  row('9', '7', '9'),
  row('7b9', '7', 'b9'),
  row('7#9', '7', '#9'),
  row('7#11', '7', '#11'),
  row('7b13', '7', 'b13'),
  row('7b5', '7', 'b5'),
  row('7#5', '7', '#5'),
];

/** Text → meaning, for the decoder of the tests. */
export const IREAL_TEXT_MEANING: ReadonlyMap<string, IRealQuality> = new Map(IREAL_QUALITIES.map((q) => [q.text, q]));

/**
 * Qualities iReal has no text for, folded onto the nearest one before the
 * lookup: C+7 is written C7#5 (the same notes), a major triad « with a 6 » is
 * the major sixth, a minor triad with a 6 the minor sixth, a dominant with a 6
 * a 13.
 */
function fold(chord: ChordSymbol): { quality: ChordQuality; ext: ChordExtension[] } {
  let quality = chord.quality;
  let ext = [...chord.extensions];
  const has6 = ext.includes('6');
  if (quality === 'aug7') {
    quality = '7';
    ext.push('#5');
  } else if (has6 && (quality === 'maj' || quality === 'min')) {
    quality = quality === 'maj' ? 'maj6' : 'min6';
  } else if (has6 && quality === '7') {
    ext.push('13');
  }
  ext = ext.filter((e) => e !== '6');
  return { quality, ext };
}

/** The row used for a chord: the one of its quality that spells the most of its extensions. */
export function iRealQualityFor(chord: ChordSymbol): IRealQuality {
  const { quality, ext } = fold(chord);
  let best: IRealQuality | null = null;
  for (const q of IREAL_QUALITIES) {
    if (q.quality !== quality || !q.ext.every((e) => ext.includes(e))) continue;
    if (best === null || q.ext.length > best.ext.length) best = q;
  }
  // Every quality has its plain row, so there is always one.
  return best!;
}

/** The chord as iReal Pro will read it back: what the export writes is exactly this (the documented approximation). */
export function iRealCanonical(chord: ChordSymbol): ChordSymbol {
  const q = iRealQualityFor(chord);
  return { root: chord.root, quality: q.quality, extensions: sortExtensions([...q.ext]), bass: chord.bass };
}

/** « Bb », « F# » for a spelled note. */
export function iRealNote(n: NoteName): string {
  return `${n.letter}${n.accidental < 0 ? 'b' : n.accidental > 0 ? '#' : ''}`;
}
