// From what is stored (concert pitch, original key) to what is shown: the
// transport's transposition plus the instrument the chart is written for.

import type { ChordSymbol, Instrument, Key } from '../model/harmony';
import type { MinorNotation } from '../model/project';
import { chordParts, chordText, transposeChord, type ChordParts } from './chord';
import { NEUTRAL_KEY, transposeKey } from './key';

/**
 * Semitones an instrument reads above concert pitch: a B♭ instrument (trumpet,
 * tenor saxophone, clarinet) reads a major second higher, an E♭ instrument
 * (alto and baritone saxophone) a major sixth higher.
 */
export const INSTRUMENT_OFFSET: Record<Instrument, number> = { ut: 0, sib: 2, mib: 9 };

/** Everything needed to write a chord as the user should read it. */
export interface DisplayContext {
  /** Semitones from the stored (concert, original) chord to the written one. */
  shift: number;
  /** The key the written chords are spelled in (null when no key is known). */
  key: Key | null;
  minor: MinorNotation;
}

/**
 * The display context for a piece in `key` (null if unknown), played
 * `semitones` away from the original, written for `instrument`.
 */
export function displayContext(key: Key | null, semitones: number, instrument: Instrument, minor: MinorNotation): DisplayContext {
  const shift = semitones + INSTRUMENT_OFFSET[instrument];
  return { shift, key: key ? transposeKey(key, shift) : null, minor };
}

/**
 * The key written chords are spelled in. Without a known key: C major moved by
 * the same shift, so the spelling still follows the transposition like a key.
 */
export function spellingKey(ctx: DisplayContext): Key {
  return ctx.key ?? transposeKey(NEUTRAL_KEY, ctx.shift);
}

/** The chord as written: transposed by the context's shift, spelled in its key. */
export function displayChord(c: ChordSymbol, ctx: DisplayContext): { chord: ChordSymbol; parts: ChordParts } {
  const written = transposeChord(c, ctx.shift);
  return { chord: written, parts: chordParts(written, { key: spellingKey(ctx), minor: ctx.minor }) };
}

/** One-line text of a stored chord as written in this context (« B♭7(♭9) », « N.C. »). */
export function displayChordText(c: ChordSymbol | null, ctx: DisplayContext): string {
  return c === null ? chordText(null) : chordText(transposeChord(c, ctx.shift), { key: spellingKey(ctx), minor: ctx.minor });
}
