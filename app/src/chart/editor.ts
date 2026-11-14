// What the chord editor works with, as pure functions (tested in
// editor.test.ts): its open/closed state, how a click on root, quality,
// extension or bass changes a chord, and the lists it offers, spelled for the
// key and instrument the chart is displayed in. Everything here is in
// DISPLAYED pitch; `store/harmonyActions.ts` brings it back to concert pitch
// in the original key when it stores it.

import { chord as makeChord, sortExtensions } from '../harmony';
import { keyTonicName } from '../harmony/key';
import { spellInKey, type NoteName } from '../harmony/pitch';
import { spellingKey, type DisplayContext } from '../harmony/display';
import { CHORD_EXTENSIONS, type ChordExtension, type ChordQuality, type ChordSymbol, type KeyMode, type PitchClass } from '../model/harmony';
import { sameStop, type Stop } from './stops';

// ---------------------------------------------------------------- open / closed

/** How the editor was opened: a keyboard opens it on the text field, a finger does not pull up the on-screen keyboard. */
export type OpenedBy = 'mouse' | 'touch' | 'keyboard';

/** Where the focus goes when it opens: the text field (typing a symbol), the section field, or the editor itself. */
export type EditorFocus = 'panel' | 'field' | 'section';

export interface EditorState {
  /** The chord being edited; null when closed. */
  target: Stop | null;
  focus: EditorFocus;
  /** Text already typed when the editor opened by typing (« B » of « Bbm7 »). */
  seed: string;
  /** The extensions and bass note are showing. */
  more: boolean;
  by: OpenedBy;
}

export const CLOSED: EditorState = { target: null, focus: 'panel', seed: '', more: false, by: 'mouse' };

export type EditorAction =
  | { type: 'open'; stop: Stop; by: OpenedBy; focus?: EditorFocus; seed?: string }
  | { type: 'close' }
  /** Another chord of the same bar. */
  | { type: 'select'; index: number }
  | { type: 'more'; open: boolean }
  /** The bar now holds `count` chords (after a split, a merge or a removal): keep the target valid. */
  | { type: 'fit'; count: number };

export function reduceEditor(state: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'open':
      // Moving to another chord keeps the options panel as it was.
      return { target: a.stop, focus: a.focus ?? (a.by === 'keyboard' ? 'field' : 'panel'), seed: a.seed ?? '', more: state.target ? state.more : false, by: a.by };
    case 'close':
      return CLOSED;
    case 'select':
      return state.target ? { ...state, target: { bar: state.target.bar, index: a.index }, focus: 'panel', seed: '' } : state;
    case 'more':
      return { ...state, more: a.open };
    case 'fit': {
      if (!state.target) return state;
      const index = a.count === 0 ? -1 : Math.min(Math.max(state.target.index, 0), a.count - 1);
      return index === state.target.index ? state : { ...state, target: { bar: state.target.bar, index } };
    }
  }
}

export const isEditing = (state: EditorState, stop: Stop): boolean => sameStop(state.target, stop);

/** True for a key press that starts typing a chord symbol: a root letter, or « N » for no chord. */
export function startsChordSymbol(key: string): boolean {
  return /^[A-GNa-gn]$/.test(key);
}

// ---------------------------------------------------------------- what the editor offers

/**
 * Qualities, in the order a player looks for them: the common ones first.
 * `maj` is the plain triad.
 */
export const QUALITY_CHOICES: readonly ChordQuality[] = [
  'maj', 'maj7', '7', 'maj6',
  'min', 'min7', 'min6', 'hdim7',
  'dim7', 'dim', 'aug', 'aug7',
  'sus4', '7sus4', 'sus2', 'minmaj7',
];

/** Extensions in the order a chart writes them (6, 5ths, 9ths, 11ths, 13ths, alt). */
export const EXTENSION_CHOICES: readonly ChordExtension[] = sortExtensions([...CHORD_EXTENSIONS]);

export interface NoteChoice {
  /** Displayed pitch class. */
  pc: PitchClass;
  note: NoteName;
}

/** The twelve notes from C, spelled for the key the chart is written in (A♭ key: A♭, B♭, D♭…). */
export function noteChoices(ctx: DisplayContext): NoteChoice[] {
  const tonic = keyTonicName(spellingKey(ctx));
  return Array.from({ length: 12 }, (_, pc) => ({ pc, note: spellInKey(pc, tonic) }));
}

// ---------------------------------------------------------------- changing a chord

export type ChordPatch =
  | { root: PitchClass }
  | { quality: ChordQuality }
  | { toggle: ChordExtension }
  | { bass: PitchClass | null };

/**
 * The chord after one click of the editor. From « N.C. » or nothing (a bar
 * where the chord just goes on has none of its own), the chord starts as a
 * major triad on `fallbackRoot`.
 */
export function patchChord(base: ChordSymbol | null | undefined, patch: ChordPatch, fallbackRoot: PitchClass = 0): ChordSymbol {
  const from = base ?? makeChord(fallbackRoot, 'maj');
  if ('root' in patch) return makeChord(patch.root, from.quality, from.extensions, from.bass);
  if ('quality' in patch) return makeChord(from.root, patch.quality, from.extensions, from.bass);
  if ('bass' in patch) return makeChord(from.root, from.quality, from.extensions, patch.bass);
  const has = from.extensions.includes(patch.toggle);
  const extensions = has ? from.extensions.filter((e) => e !== patch.toggle) : sortExtensions([...from.extensions, patch.toggle]);
  return makeChord(from.root, from.quality, extensions, from.bass);
}

// ---------------------------------------------------------------- keys

export interface KeyChoice {
  /** Displayed tonic (pitch class). */
  tonic: PitchClass;
  mode: KeyMode;
}

/** The twelve keys of a mode, from C (the tonic's spelling comes from `harmony/key.ts#keyLabel`). */
export function keyChoices(mode: KeyMode): KeyChoice[] {
  return Array.from({ length: 12 }, (_, tonic) => ({ tonic, mode }));
}
