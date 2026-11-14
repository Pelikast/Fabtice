// What an analysis produced, kept exactly as it came out and never edited.
// The user's changes live apart, in `model/corrections.ts`, so the app can
// always tell « not analysed yet » (no result), « analysed » (a result, no
// correction) and « corrected by hand » (a correction over the result).
//
// Positions are source time in seconds (the original recording), so a result
// stays valid whatever the grid corrections done afterwards.

import type { ChordSymbol, Key } from './harmony';
import type { Seconds } from './project';
import type { Meter } from './tempoMap';

/** Bump when the shape below changes; older results are dropped by the document migration. */
export const ANALYSIS_RESULT_VERSION = 1;

/** A number in 0…1: how sure the analysis is (1 = sure). Not a calibrated probability unless said so. */
export type Confidence = number;

/** The beat grid found by the analysis. */
export interface AnalysedBeats {
  /** Source time of every beat, ascending, at least two. */
  times: Seconds[];
  /** Index in `times` of the first downbeat (« mesure 1, temps 1 »); earlier beats are a pick-up. */
  downbeat: number;
  meter: Meter;
  /** How sure the meter is (the decoder's score margin between meters). */
  meterConfidence: Confidence;
}

export interface AnalysedKey extends Key {
  confidence: Confidence;
  /** Next best readings, most likely first (relative minor, dominant…), for the correction menu. */
  alternatives: (Key & { confidence: Confidence })[];
}

export interface AnalysedTuning {
  /**
   * Distance of the recording from A = 440 Hz, in cents, −50…+50
   * (+30 means A ≈ 447.7 Hz: the recording sounds a bit high).
   */
  cents: number;
  /** Agreement of the spectral peaks, 0…1 (the prototype's resultant length). */
  confidence: Confidence;
}

/** One chord of the analysis: it starts at `time` and lasts until the next one. */
export interface AnalysedChord {
  time: Seconds;
  /** Null for « N.C. » (no chord: silence, drum break, spoken intro). */
  chord: ChordSymbol | null;
  confidence: Confidence;
  /**
   * Shown as doubtful (quietly, never in ember). The analyser decides, with
   * its own calibration (the prototype: geometric-mean posterior < 0.35).
   */
  doubtful: boolean;
  /** Next best readings, most likely first, for the chord editor. */
  alternatives: ChordSymbol[];
}

/** Who produced a result; shown in diagnostics, never in the main screen. */
export interface AnalyserInfo {
  /** `mock` for the stand-in, `fabtice` for the real analyser. */
  id: string;
  version: string;
  /** Model identifiers used (see `analysis/types.ts#AnalysisModelInfo`). */
  models: string[];
}

export interface AnalysisResult {
  version: typeof ANALYSIS_RESULT_VERSION;
  analyser: AnalyserInfo;
  /** ISO date. */
  analysedAt: string;
  /** Length of the audio that was analysed. */
  duration: Seconds;
  beats: AnalysedBeats;
  key: AnalysedKey | null;
  tuning: AnalysedTuning | null;
  /** Ascending by time. Empty when no harmony was found. */
  chords: AnalysedChord[];
}
