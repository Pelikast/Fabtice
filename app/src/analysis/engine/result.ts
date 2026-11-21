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
import type { HalfBeatChord } from './halfBeats';
import { firstDownbeat, type Grid } from './grid';
import type { KeyEstimate } from './key';
import type { MeterScore } from './meter';
import type { RepairedPassage } from './repair';
import type { AnalysisEvidence, ListenedResult, RepairedBeats } from '../types';
import { RELIABILITY_DOUBT } from './reliability';
import type { TuningEstimate } from './tuning';

/** Below this geometric-mean posterior a chord is shown as doubtful (calibrated on GuitarSet). */
export const DOUBT = 0.35;

/** Version of the analyser's musical logic; bump it when a constant or an algorithm changes. */
export const ANALYSER_VERSION = '5';

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
  /** Passages whose beats the repair replaced (`repair.ts`); none for the user's grid. */
  repairs?: readonly RepairedPassage[];
  duration: number;
  models: readonly string[];
  now?: Date;
  /** Per segment: probability that the chord is right (`reliability.ts`); when given, it is the confidence and « doubtful » is below 0.5. */
  reliability?: readonly number[];
  /** 1.0.3: the beats that hold two chords (`halfBeats.ts`): written between two beats in the result. */
  halves?: readonly HalfBeatChord[];
  /** What the analysis listened to (`chart.ts#ChartEvidence`), kept in the result. */
  evidence?: AnalysisEvidence;
}

/**
 * The chords of the segments with the chords found between two beats put in (1.0.3). A chord lasts
 * until the next one, so a beat split in two may need its own chord written again after the half:
 *   - `second` (own chord, then X from the middle): X at the middle, and the own chord again on
 *     the next beat when the segment goes on;
 *   - `first` (X on the beat, own chord from the middle): X on the beat, the own chord at the middle
 *     (moved there when the beat started its segment).
 */
export function withHalfBeats(chords: readonly AnalysedChord[], segments: readonly ChordSegment[], halves: readonly HalfBeatChord[], beats: readonly number[]): AnalysedChord[] {
  if (!halves.length) return [...chords];
  const out: AnalysedChord[] = chords.map((c) => ({ ...c }));
  const segmentOf = new Map<number, number>();
  segments.forEach((s, k) => s.beats.forEach((b) => segmentOf.set(b, k)));
  // A beat that starts with another chord needs no reminder of the chord before it.
  const startsOther = new Set(halves.filter((h) => h.half === 'first').map((h) => h.beat));
  for (const h of halves) {
    const k = segmentOf.get(h.beat);
    const start = beats[h.beat];
    if (k === undefined || start === undefined) continue;
    const seg = segments[k]!;
    const own = out[k]!;
    const half: AnalysedChord = { time: 0, chord: symbolOf(h.chord), confidence: h.p, doubtful: h.p < RELIABILITY_DOUBT, alternatives: [] };
    if (h.half === 'second') {
      out.push({ ...half, time: h.time });
      const next = beats[h.beat + 1];
      if (seg.beats.includes(h.beat + 1) && next !== undefined && !startsOther.has(h.beat + 1)) out.push({ ...chords[k]!, time: next });
    } else {
      out.push({ ...half, time: start });
      if (seg.beats[0] === h.beat) own.time = h.time;
      else out.push({ ...chords[k]!, time: h.time });
    }
  }
  return out.sort((a, b) => a.time - b.time);
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
  const beats: RepairedBeats = {
    times: [...r.grid.beats],
    downbeat: r.downbeat ?? firstDownbeat(r.grid),
    meter: { numerator: r.grid.beatsPerBar, denominator: 4 },
    meterConfidence: r.gridIsHint ? 1 : (r.meterScores[0]?.prob ?? 0.5),
  };
  if (r.repairs?.length) beats.repaired = r.repairs.map((p) => ({ start: p.start, end: p.end, found: p.found, placed: p.placed, cause: p.cause }));
  const onBeats: AnalysedChord[] = r.segments.map((s, k) => {
    const suggestions = s.extensions.map((e) => e.name);
    const symbol = symbolOf(s.chord, suggestions, s.bass ? s.bass.pc : null);
    const rel = r.reliability?.[k];
    return {
      time: s.t0,
      chord: symbol,
      confidence: rel ?? s.confidence,
      doubtful: rel !== undefined ? rel < RELIABILITY_DOUBT : s.confidence < DOUBT,
      alternatives: s.alternatives.map((a) => symbolOf(a.chord)).filter((c): c is ChordSymbol => c !== null),
    };
  });
  const chords = withHalfBeats(onBeats, r.segments, r.halves ?? [], r.grid.beats);
  const out: ListenedResult = {
    version: ANALYSIS_RESULT_VERSION,
    analyser: { id: 'fabtice', version: ANALYSER_VERSION, models: [...r.models] },
    analysedAt: (r.now ?? new Date()).toISOString(),
    duration: r.duration,
    beats,
    key,
    // Modulations and structure are not looked for by this analyser yet.
    keyChanges: [],
    tuning: r.tuning.peaks > 0 ? { cents: r.tuning.cents, confidence: r.tuning.confidence } : null,
    chords,
    structure: null,
  };
  if (r.evidence) out.evidence = r.evidence;
  return out;
}

/** Qualities of the engine as the app names them (a compile-time check that they all exist there). */
export const ENGINE_QUALITIES: readonly ChordQuality[] = QUALS;
