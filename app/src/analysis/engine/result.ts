// From the engine's output to the app's `AnalysisResult` (model/analysis.ts):
// qualities as the prototype names them (the app's `ChordQuality` has the same
// names), extension suggestions as `ChordExtension`s (« sus4 + 7 » becomes the
// quality `7sus4`), the bass note, and « doubtful » by the prototype's own
// calibration (geometric mean of the network's frame posterior < 0.35).

import { chord } from '../../harmony/chord';
import { sortExtensions } from '../../harmony/parse';
import { ANALYSIS_RESULT_VERSION, type AnalysedChord, type AnalysedKey, type AnalysisResult } from '../../model/analysis';
import type { ChordExtension, ChordQuality, ChordSymbol, Key } from '../../model/harmony';
import { NO_CHORD, QUALS, chordQual, chordRoot } from './chords';
import type { ChordSegment } from './decode';
import { firstDownbeat, type Grid } from './grid';
import type { KeyEstimate } from './key';
import type { MeterScore } from './meter';
import type { TuningEstimate } from './tuning';

/** Below this geometric-mean posterior a chord is shown as doubtful (calibrated on GuitarSet). */
export const DOUBT = 0.35;

/** Version of the analyser's musical logic; bump it when a constant or an algorithm changes. */
export const ANALYSER_VERSION = '1';

const APP_EXTENSIONS = new Set<string>(['6', 'b9', '9', '#9', '11', '#11', 'b5', '#5', 'b13', '13', 'alt']);

/** A chord of the engine's vocabulary as the app's symbol (null for « no chord »). */
export function symbolOf(index: number, suggestions: readonly string[] = [], bass: number | null = null): ChordSymbol | null {
  if (index === NO_CHORD) return null;
  const root = chordRoot(index);
  let quality: ChordQuality = chordQual(index)!;
  const extensions: ChordExtension[] = [];
  for (const name of suggestions) {
    // « sus4 + 7 » is the app's own quality 7sus4; « sus2 + 7 » has none and is dropped.
    if (name === '7') {
      if (quality === 'sus4') quality = '7sus4';
      continue;
    }
    if (APP_EXTENSIONS.has(name) && !extensions.includes(name as ChordExtension)) extensions.push(name as ChordExtension);
  }
  return chord(root, quality, sortExtensions(extensions), bass);
}

export function keyOf(k: { tonic: number; minor: boolean }): Key {
  return { tonic: k.tonic, mode: k.minor ? 'minor' : 'major' };
}

export interface ResultInput {
  grid: Grid;
  /** Index of the first downbeat when it is not the first beat numbered 1 (a grid the user made). */
  downbeat?: number;
  meterScores: readonly MeterScore[];
  /** True when the grid is the user's: its meter is then certain. */
  gridIsHint: boolean;
  key: KeyEstimate;
  /** The user's key: the result says so. */
  keyIsHint: boolean;
  tuning: TuningEstimate;
  segments: readonly ChordSegment[];
  duration: number;
  models: readonly string[];
  now?: Date;
}

export function toAnalysisResult(r: ResultInput): AnalysisResult {
  const best = r.key.best;
  const key: AnalysedKey = r.keyIsHint
    ? { ...keyOf(best), confidence: 1, alternatives: [] }
    : {
        ...keyOf(best),
        confidence: best.p ?? 0,
        alternatives: r.key.ranked.slice(1).map((k) => ({ ...keyOf(k), confidence: k.p ?? 0 })),
      };
  const chords: AnalysedChord[] = r.segments.map((s) => {
    const suggestions = s.extensions.map((e) => e.name);
    const symbol = symbolOf(s.chord, suggestions, s.bass ? s.bass.pc : null);
    return {
      time: s.t0,
      chord: symbol,
      confidence: s.confidence,
      doubtful: s.confidence < DOUBT,
      alternatives: s.alternatives.map((a) => symbolOf(a.chord)).filter((c): c is ChordSymbol => c !== null),
    };
  });
  return {
    version: ANALYSIS_RESULT_VERSION,
    analyser: { id: 'fabtice', version: ANALYSER_VERSION, models: [...r.models] },
    analysedAt: (r.now ?? new Date()).toISOString(),
    duration: r.duration,
    beats: {
      times: [...r.grid.beats],
      downbeat: r.downbeat ?? firstDownbeat(r.grid),
      meter: { numerator: r.grid.beatsPerBar, denominator: 4 },
      meterConfidence: r.gridIsHint ? 1 : (r.meterScores[0]?.prob ?? 0.5),
    },
    key,
    tuning: r.tuning.peaks > 0 ? { cents: r.tuning.cents, confidence: r.tuning.confidence } : null,
    chords,
  };
}

/** Qualities of the engine as the app names them (a compile-time check that they all exist there). */
export const ENGINE_QUALITIES: readonly ChordQuality[] = QUALS;
