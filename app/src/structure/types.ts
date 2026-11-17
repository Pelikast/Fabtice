// Stage 5 of 1.0.0 (« Harmonie »): the shared contracts of the harmony pass.
//
// The harmony pass finds the modulations (`AnalysisResult.keyChanges`) and the
// structure of the piece (`AnalysisResult.structure`), and writes the
// « Grille complète simplifiée ». It is a set of PURE functions of the chart
// in force (bars of the grid in force + chords in force), run on the main
// thread after every change of the grid or of the chords: a full analysis, a
// tempo correction (by ear or tapped), a signature change, a chord written by
// hand, undo and redo. It never reads or writes the user's corrections of the
// keys or of the structure: the merge is `store/keySelectors.ts` and
// `store/structureSelectors.ts`, as since stage 1.
//
// No general-purpose model: the form comes from the repeats of the chart and
// from the known chart of the standard; theme or solo and the instrument come
// from the separated tracks; a small instrument-recognition model only tells
// the winds apart.
//
// Who writes what (see `v1/PLAN.md`, « Étape 5 »):
//   - `keys.ts`        `detectKeyChanges`                       (modulations)
//   - `form.ts`…       `detectStructure`                        (form, letters, parts, mode)
//   - `simplify.ts`    `simplifyChart`                          (written chart + played ↔ written)
//   - `evidence.ts`    `StructureEvidence` from the audio       (who plays where)
//   - `instruments/`   `InstrumentRecognizer`                   (which wind instrument)
//   - `refresh.ts`     the runner that calls them and stores the result
//
// Positions are source seconds; bar numbers are those of the chart
// (`chart/layout.ts#ChartBar.bar`: 0 = « mesure 1 », negative = pick-up).

import type { AnalysedKeyChange } from '../model/analysis';
import type { ChordSymbol, Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { StemId } from '../model/separation';
import type { DetectedStructure, PartInstrument, PartType, StructureModeChoice } from '../model/structure';
import type { Meter } from '../model/tempoMap';
import type { StandardChart } from '../standards/irealRead';

/** One chord of a bar, as the pass reads it. */
export interface HarmonyChord {
  /** Beat in the bar, 0-based, in beats of the bar's own signature. */
  beat: number;
  /** Null for « N.C. ». */
  chord: ChordSymbol | null;
  /** Shown as doubtful by the analysis (always false for a hand chord). */
  doubtful: boolean;
  /** Written or confirmed by the user: to be trusted over anything else. */
  byHand: boolean;
}

/** One bar of the chart in force. */
export interface HarmonyBar {
  /** Chart bar number: 0 = « mesure 1 », negative = pick-up. */
  bar: number;
  start: Seconds;
  end: Seconds;
  /** Number of beats (the numerator of `meter`). */
  beats: number;
  meter: Meter;
  /** The chords that START in this bar, ascending by beat. */
  chords: HarmonyChord[];
  /** The chord still sounding at the bar line when none starts on beat 0 (null: none, or N.C.). */
  carried: ChordSymbol | null;
}

/** A known chart of the standard, found by the title (transient: never stored). */
export interface KnownStandard {
  chart: StandardChart;
  /** 0…1, how well the title matched. */
  titleScore: number;
}

/**
 * What the audio says, bar by bar, about who plays (built by `evidence.ts`,
 * cached per audio). Every array has one entry per bar of `HarmonyInput.bars`,
 * in the same order. The producer and the consumer are the same agent: the
 * fields below may grow, the three first ones are the contract.
 */
export interface StructureEvidence {
  /** Mean level (linear RMS) of each separated track per bar; null without a separation in memory. */
  stems: Partial<Record<StemId, Float32Array>> | null;
  /** Coarse timbre of the whole mix per bar (`bands` values per bar, log energies), for the « no separation » case. */
  timbre: { bands: number; data: Float32Array };
  /** The instrument heard in the track where the winds fall (« Autres »), per bar; null when the recogniser was not run. */
  winds: (InstrumentGuess | null)[] | null;
}

/** One reading of the instrument recogniser. */
export interface InstrumentGuess {
  /** An id of `model/structure.ts#PART_INSTRUMENTS` (`winds` when it is a wind instrument but which one is not sure). */
  instrument: PartInstrument;
  /** 0…1; under the recogniser's own threshold the instrument is already `winds`. */
  confidence: number;
}

/** The small instrument-recognition model (`instruments/`). */
export interface InstrumentRecognizer {
  /**
   * Reads one excerpt (mono, any sample rate, a few seconds to a whole solo)
   * and says which instrument leads. Null when nothing is played. Never throws
   * for a missing model: it resolves to null and the part stays « Solo (Vents) ».
   */
  recognise(mono: Float32Array, sampleRate: number, signal?: AbortSignal): Promise<InstrumentGuess | null>;
}

/** Everything the pass reads. */
export interface HarmonyInput {
  /** Every bar of the chart in force, ascending, pick-up bars included. */
  bars: HarmonyBar[];
  duration: Seconds;
  /** The main key in force (the user's, else the analysis'); null when unknown. */
  key: Key | null;
  /** How sure the main key is (1 when the user chose it). */
  keyConfidence: number;
  /** Known charts found by the title, best first; empty when none (recueils not downloaded, title unknown). */
  known: KnownStandard[];
  /** Null when the audio could not be read (the pass then works from the chords alone). */
  evidence: StructureEvidence | null;
  /** « Mode » as chosen by the user: the detector names the parts in that mode (`auto`: it picks the likeliest). */
  mode: StructureModeChoice;
}

/** `detectKeyChanges`: the later passages, ascending, each on a bar line after the first bar. */
export type KeyChangeDetector = (input: HarmonyInput) => AnalysedKeyChange[];

/** `detectStructure`: null when nothing can be said (no chords, too short). `keyChanges` are those in force. */
export type StructureDetector = (input: HarmonyInput, keyChanges: readonly { time: Seconds; key: Key }[]) => DetectedStructure | null;

// ---------------------------------------------------------------------------
// « Grille complète simplifiée »: the written chart and how the playing maps to it.

export interface WrittenChord {
  /** Beat in the bar, 0-based. */
  beat: number;
  chord: ChordSymbol | null;
}

/** One bar as written on the simplified chart. */
export interface WrittenBar {
  /** Index in `SimplifiedChart.bars`. */
  index: number;
  beats: number;
  meter: Meter;
  /** Written at this bar when the signature changes here (as `ChartBar.signature`). */
  signature: Meter | null;
  /** Simplified chords; empty with `simile`. */
  chords: WrittenChord[];
  /** « % »: same as the bar before. */
  simile: boolean;
  /** A modulation written above this bar (the new key), else null. */
  keyChange: Key | null;
  /** Every played bar this written bar stands for (chart bar numbers, ascending): at least one. */
  played: number[];
}

/** One block of the simplified chart: « Intro : », « A : », « B : »… */
export interface WrittenSection {
  /** Stable for the same chart (« intro », « A », « B »…): used as a DOM key and by the print layout. */
  id: string;
  /** The heading: a section letter, or a part type for what lies outside the form (intro, outro, a special). */
  label: { letter: string } | { part: PartType };
  /** Indices in `SimplifiedChart.bars`, ascending and contiguous. */
  bars: number[];
  /** `[ … ]xN` when the same written passage is played N times in a row inside one chorus (AA → x2); 1 otherwise. */
  times: number;
  /**
   * Added by the structure pass (optional): 2, 3… when the same letter is
   * written again because its last bars differ (first and second endings:
   * rhythm changes write A, then A2 ending on the tonic). Absent for the
   * first way a letter is written. The heading may show it (« A2 »).
   */
  variant?: number;
}

/** Where a played bar is written. */
export interface WrittenPlace {
  /** Index in `SimplifiedChart.bars`. */
  written: number;
  /** 1-based: which time this written bar is being played (the « numéro de la reprise » shown while playing). */
  pass: number;
  /** How many times it is played in all. */
  passes: number;
}

/** One entry of the line « Forme : Intro, Thème Chant (AABC), Solo Piano (AABC)… ». */
export interface FormEntry {
  /** Id of the part in force (`PartInForce.id`). */
  partId: string;
  /** Letters covered by the part (« AABC »); '' for an intro or an outro. */
  letters: string;
}

export interface SimplifiedChart {
  form: FormEntry[];
  sections: WrittenSection[];
  bars: WrittenBar[];
  /** Chart bar number → where it is written. A played bar missing from the map is not written (never happens for a bar with chords). */
  places: ReadonlyMap<number, WrittenPlace>;
}

/** What `simplifyChart` reads: the chart in force and the structure IN FORCE (hand corrections included). */
export interface SimplifyInput {
  bars: HarmonyBar[];
  /** Section letters in force as chart bar numbers, ascending. */
  sections: { bar: number; label: string }[];
  /** Parts in force as chart bar ranges [firstBar, endBar), ascending. */
  parts: { id: string; type: PartType; firstBar: number; endBar: number; letters: string[] }[];
  /** Modulations in force as chart bar numbers, ascending (the main key is not in the list). */
  keyChanges: { bar: number; key: Key }[];
  known: KnownStandard[];
}
