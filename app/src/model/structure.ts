// The structure of the piece (document version 6): its mode (Jazz or Pop),
// its parts (Intro, Thème 1, Solo (Piano)…) and its section letters (A, B…,
// whose suite is the form, AABA). Plain data; detection and screen come later.
//
// Two layers, as for the chords:
//   - what the analysis found: `AnalysisResult.structure` (`DetectedStructure`),
//     kept as it came out, null until the structure is looked for;
//   - what the user corrected: `Corrections.structure` (`StructureCorrections`).
//     A new analysis never touches it.
//
// Letters and parts
//   The section letters are the chart's boxed labels on bar lines
//   (`Corrections.sections`, `SectionMark`, lot 2): one notion, unchanged for
//   the chart, the markers and the exports. The detected structure brings its
//   own letters in the same shape (`DetectedStructure.sections`). A part does
//   not store letters: the letters it covers are the letters in force whose
//   bar lies inside it (« Thème 1 (AABA) »). Correcting the letters is placing
//   or removing section marks, as today.
//
// Merge rules (what is in force: `store/structureSelectors.ts`; commands: `store/structureActions.ts`)
//   - Mode: the hand choice unless `auto`; then the detected mode; Jazz when
//     nothing was detected.
//   - Letters: the user's (`Corrections.sections`) when there is at least one,
//     or when the user edited the letters (`lettersByHand`, so that deleting
//     every letter on purpose stays deleted); otherwise the detected ones.
//   - Parts: the user's parts are always shown. A detected part is hidden
//     when it starts inside a hand stretch (`StructureCorrections.spans`);
//     a detected part kept ends, at the latest, where the next hand stretch
//     starts. Editing a detected part copies it into the hand layer and adds
//     its stretch, so a new analysis changes only the parts nobody touched.
//
// Positions are source time in seconds, like the chords and the sections.

import type { SectionMark } from './corrections';
import type { Seconds, TimeRange } from './project';

/** How the parts are named: Jazz (Thème, Solo, Pont, Spécial…) or Pop (Couplet, Refrain, Pont…). */
export type StructureMode = 'jazz' | 'pop';
export const STRUCTURE_MODES: readonly StructureMode[] = ['jazz', 'pop'];

/** « Mode » as chosen by the user: `auto` follows the analysis. */
export type StructureModeChoice = 'auto' | StructureMode;
export const STRUCTURE_MODE_CHOICES: readonly StructureModeChoice[] = ['auto', 'jazz', 'pop'];

/**
 * Kinds of part, with fixed names: Intro, Thème, Solo, Pont, Spécial, Outro,
 * and in Pop mode Couplet, Refrain. Any kind may be used in either mode.
 */
export type PartType = 'intro' | 'theme' | 'solo' | 'bridge' | 'special' | 'outro' | 'verse' | 'chorus';
export const PART_TYPES: readonly PartType[] = ['intro', 'theme', 'solo', 'bridge', 'special', 'outro', 'verse', 'chorus'];
/** The kinds offered in each mode, in the order a menu shows them. */
export const PART_TYPES_BY_MODE: Readonly<Record<StructureMode, readonly PartType[]>> = {
  jazz: ['intro', 'theme', 'solo', 'bridge', 'special', 'outro'],
  pop: ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'],
};

/**
 * Who plays a part (« Solo (Guitare) »): an instrument id, lowercase ASCII
 * (`PART_INSTRUMENT_PATTERN`). The ids below are the known ones; another id
 * that fits the pattern is kept (shown as the part without instrument by an
 * app that does not know it). `winds` is « Vents »: a wind instrument, which
 * one is not sure.
 */
export type PartInstrument = string;
export const PART_INSTRUMENTS: readonly PartInstrument[] = [
  'voice', 'guitar', 'piano', 'bass', 'drums', 'winds', 'trumpet', 'saxophone', 'trombone', 'clarinet', 'flute', 'violin', 'vibraphone', 'organ',
];
export const WINDS_UNSURE: PartInstrument = 'winds';
export const PART_INSTRUMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** One part of the piece, from `start` to `end` (source seconds, usually bar lines). */
export interface StructurePart {
  /** Unique in its list; a part copied into the hand layer gets a new one. */
  id: string;
  type: PartType;
  /** 1, 2… for « Thème 1 », « Solo 2 »; null when the part is not numbered. */
  number: number | null;
  /** Who plays it (`PartInstrument`); null when not known (« Solo 1 »). */
  instrument: PartInstrument | null;
  start: Seconds;
  /** After `start`. */
  end: Seconds;
}

/** The structure found by the analysis (stage 5 fills it). */
export interface DetectedStructure {
  mode: StructureMode;
  /** « Forme globale »: the letters of one chorus, in order (« AABC »); '' when not found. Not editable. */
  form: string;
  /** Section letters found, one per bar line where a section starts, ascending (same shape as `Corrections.sections`). */
  sections: SectionMark[];
  /** Ascending by start, never overlapping; gaps allowed. */
  parts: StructurePart[];
}

/** What the user corrected in the structure. */
export interface StructureCorrections {
  /** « Mode »; `auto` = the detected one (Jazz when none). */
  mode: StructureModeChoice;
  /** Parts written or corrected by hand, ascending by start, never overlapping. */
  parts: StructurePart[];
  /**
   * Stretches whose parts are the user's, ascending, never overlapping: the
   * detected parts starting inside them are hidden. A stretch with no hand
   * part means « no part here » (a detected part deleted).
   */
  spans: TimeRange[];
  /**
   * The user edited the section letters: `Corrections.sections` is the whole
   * list in force, even when empty. False (and no letter by hand): the
   * detected letters are shown.
   */
  lettersByHand: boolean;
}

export function emptyStructureCorrections(): StructureCorrections {
  return { mode: 'auto', parts: [], spans: [], lettersByHand: false };
}

/** Form letters (« AABA »): capitals A to Z only. */
export const FORM_PATTERN = /^[A-Z]*$/;
