// Chord symbols: vocabulary facts, transposition, spelling and the parts a
// chart writes (root, quality, raised extensions, bass), following DESIGN.md:
// triangle for major 7, « m » or « – » for minor, accidentals tight against
// the root, extensions raised.

import {
  CHORD_EXTENSIONS,
  CHORD_QUALITIES,
  type ChordExtension,
  type ChordQuality,
  type ChordSymbol,
  type Key,
  type PitchClass,
} from '../model/harmony';
import type { MinorNotation } from '../model/project';
import { keyTonicName, NEUTRAL_KEY } from './key';
import { FLAT, noteText, pc, SHARP, spellInKey, type NoteName } from './pitch';

/** Chord tones (semitones above the root), as in the prototype's `QUAL_PCS`. */
export const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], aug: [0, 4, 8], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], minmaj7: [0, 3, 7, 11],
  maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], dim7: [0, 3, 6, 9], hdim7: [0, 3, 6, 10],
  '7sus4': [0, 5, 7, 10], aug7: [0, 4, 8, 10],
};

/** Broad family, for menus and for the export mapping. */
export type ChordFamily = 'major' | 'minor' | 'dominant' | 'diminished' | 'suspended' | 'augmented';

export const QUALITY_FAMILY: Record<ChordQuality, ChordFamily> = {
  maj: 'major', maj7: 'major', maj6: 'major',
  min: 'minor', min7: 'minor', minmaj7: 'minor', min6: 'minor',
  '7': 'dominant', aug7: 'augmented', aug: 'augmented',
  dim: 'diminished', dim7: 'diminished', hdim7: 'diminished',
  sus2: 'suspended', sus4: 'suspended', '7sus4': 'suspended',
};

export function isChordQuality(v: unknown): v is ChordQuality {
  return typeof v === 'string' && (CHORD_QUALITIES as readonly string[]).includes(v);
}

export function isChordExtension(v: unknown): v is ChordExtension {
  return typeof v === 'string' && (CHORD_EXTENSIONS as readonly string[]).includes(v);
}

export function chord(root: PitchClass, quality: ChordQuality, extensions: ChordExtension[] = [], bass: PitchClass | null = null): ChordSymbol {
  return { root: pc(root), quality, extensions: [...extensions], bass: bass === null || pc(bass) === pc(root) ? null : pc(bass) };
}

export function sameChord(a: ChordSymbol | null, b: ChordSymbol | null): boolean {
  if (a === null || b === null) return a === b;
  return a.root === b.root && a.quality === b.quality && a.bass === b.bass &&
    a.extensions.length === b.extensions.length && a.extensions.every((e, i) => e === b.extensions[i]);
}

/** Same root and quality: what the analysis gets right or wrong (extensions aside). */
export function sameRootAndQuality(a: ChordSymbol | null, b: ChordSymbol | null): boolean {
  if (a === null || b === null) return a === b;
  return a.root === b.root && a.quality === b.quality;
}

export function transposeChord(c: ChordSymbol, semitones: number): ChordSymbol {
  return { ...c, extensions: [...c.extensions], root: pc(c.root + semitones), bass: c.bass === null ? null : pc(c.bass + semitones) };
}

// ---------------------------------------------------------------- display parts

/** One piece of the quality: text at 74 % (accidentals inside get the music font), or the major-7 triangle. */
export type QualityPart = { kind: 'text'; text: string } | { kind: 'triangle' };

/** What a chart writes for one chord, already spelled and transposed. */
export interface ChordParts {
  root: NoteName;
  quality: QualityPart[];
  /** Raised, in order, with ♭ and ♯ (« ♭9 », « 13 »). */
  extensions: string[];
  bass: NoteName | null;
}

export interface ChordDisplayOptions {
  /** Key in which the chord is read (already transposed); spells the root and bass. Default: C major. */
  key?: Key | null;
  minor?: MinorNotation;
}

const tri: QualityPart = { kind: 'triangle' };
const txt = (text: string): QualityPart => ({ kind: 'text', text });

function qualityParts(q: ChordQuality, m: MinorNotation): QualityPart[] {
  switch (q) {
    case 'maj': return [];
    case 'min': return [txt(m)];
    case 'aug': return [txt('+')];
    case 'dim': return [txt('°')];
    case 'sus2': return [txt('sus2')];
    case 'sus4': return [txt('sus4')];
    case '7': return [txt('7')];
    case 'maj7': return [tri];
    case 'min7': return [txt(`${m}7`)];
    case 'minmaj7': return [txt(m), tri];
    case 'maj6': return [txt('6')];
    case 'min6': return [txt(`${m}6`)];
    case 'dim7': return [txt('°7')];
    case 'hdim7': return [txt(`${m}7${FLAT}5`)];
    case '7sus4': return [txt('7sus4')];
    case 'aug7': return [txt('+7')];
  }
}

/** « b9 » -> « ♭9 », « #11 » -> « ♯11 ». */
export function extensionText(e: ChordExtension): string {
  return e.replace('b', FLAT).replace('#', SHARP);
}

export function chordParts(c: ChordSymbol, opts: ChordDisplayOptions = {}): ChordParts {
  const tonic = keyTonicName(opts.key ?? NEUTRAL_KEY);
  return {
    root: spellInKey(c.root, tonic, { passingDiminished: c.quality === 'dim7' || c.quality === 'dim' }),
    quality: qualityParts(c.quality, opts.minor ?? 'm'),
    extensions: c.extensions.map(extensionText),
    bass: c.bass === null ? null : spellInKey(c.bass, tonic),
  };
}

/** Plain one-line text: « A♭△ », « Fm7 », « E♭7(13) », « C7(♭9, ♯11)/E », « N.C. ». For titles, labels and tests. */
export function chordText(c: ChordSymbol | null, opts: ChordDisplayOptions = {}): string {
  if (c === null) return NO_CHORD_TEXT;
  const p = chordParts(c, opts);
  const q = p.quality.map((x) => (x.kind === 'triangle' ? '△' : x.text)).join('');
  const ext = p.extensions.length ? `(${p.extensions.join(', ')})` : '';
  return `${noteText(p.root)}${q}${ext}${p.bass ? `/${noteText(p.bass)}` : ''}`;
}

export const NO_CHORD_TEXT = 'N.C.';
