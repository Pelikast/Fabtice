// Contract of the analyser: what the app calls to analyse a piece. The real
// analyser (Web Worker, ONNX Runtime, model download and cache, from the
// prototype `web/spikes/analyse/`) implements `Analyzer`; until then
// `MockAnalyzer` (./mock.ts) stands in. The app only goes through
// `getAnalyzer()` (./index.ts) and `analysis/runner.ts`.
//
// Units: audio is the decoded piece at 48 kHz (`ENGINE_SAMPLE_RATE`), Float32
// per channel, as in `audio/registry.ts`. Times in the result are source
// seconds. The result is `model/analysis.ts#AnalysisResult`.

import type { AnalysedBeats, AnalysisResult } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { Meter } from '../model/tempoMap';
import type { KnownCharts } from './engine/chart';
import type { ManualTempoFix, TappedInfo } from './engine/tapGrid';
import type { ChordModelChoice } from './models';

/** One downloadable model (shown to the user before and during the first download). */
export interface AnalysisModelInfo {
  /** Stable id (`beat-this-small0`, `crema-chords`…), also listed in `AnalysisResult.analyser.models`. */
  id: string;
  /** Name as its authors give it (« Beat This! », « CREMA »). */
  name: string;
  /** What it does, in French, for the user (« temps et premiers temps », « accords »). */
  role: string;
  /** Where it is downloaded from (an https URL at a pinned revision). */
  url: string;
  /** Host shown to the user (« Hugging Face »). */
  host: string;
  /** Licence as known (« MIT », « BSD-2-Clause »). */
  licence: string;
  /** Download size in bytes. */
  bytes: number;
  /** Already on this device (cache): no download needed. */
  cached: boolean;
}

/** Steps reported while analysing, in this order (some may be skipped). */
export type AnalysisStep =
  /** Downloading models (first time only); see `AnalysisProgress.download`. */
  | 'download'
  /** Loading models, resampling the audio. */
  | 'prepare'
  | 'tuning'
  | 'beats'
  | 'chords'
  /** Key, chart decoding, cleaning up. */
  | 'finish';

export const ANALYSIS_STEPS: readonly AnalysisStep[] = ['download', 'prepare', 'tuning', 'beats', 'chords', 'finish'];

export interface DownloadProgress {
  /** The model being downloaded now. */
  modelId: string;
  /** Bytes received over all models to download in this run, and their total. */
  loaded: number;
  total: number;
}

/** The fine chord model's windows (30 s each): 3 done out of 12. */
export interface ChordWindowProgress {
  done: number;
  total: number;
  /**
   * Steady progress of the whole chord step, 0…1 (never going back): the windows done plus an
   * estimate of the current one. Added by the analyser (`windowClock.ts`), not by the worker.
   */
  fraction?: number;
}

export interface AnalysisProgress {
  step: AnalysisStep;
  /** Progress of the whole analysis, 0…1, never going back. */
  fraction: number;
  /** Present during `download`. */
  download?: DownloadProgress;
  /** Present while the fine chord model listens (`chords` step). */
  chordWindow?: ChordWindowProgress;
}

/**
 * A passage of the piece whose beats the analyser did not believe (a short
 * tempo accident of the beat network, or bars that had moved) and replaced by
 * beats at the surrounding tempo (`engine/repair.ts`).
 */
export interface RepairedPassage {
  /** Source times of the two beats kept on either side. */
  start: Seconds;
  end: Seconds;
  /** Beats the network had strictly between them. */
  found: number;
  /** Beats put there instead. */
  placed: number;
  /**
   * `tempo`: a short deviation of the tempo; `bar`: the downbeats after it had moved;
   * `level`: bars of the network's downbeats that held another number of beats
   * (half or double tempo, a lost or an extra beat), re-gridded (`engine/bars.ts`);
   * `shift`: a run of beats placed early or late that came back, moved into place (`engine/displaced.ts`);
   * `steady`: an abrupt and brief change of the bar length between two stable stretches, re-gridded
   * at their tempo (`engine/steady.ts`, the last safety net).
   */
  cause: 'tempo' | 'bar' | 'level' | 'shift' | 'steady';
}

/**
 * The beats of a result of the real analyser. `repaired` is an optional extra
 * field of `AnalysedBeats` (absent when nothing was repaired, and in results
 * stored before it existed): the stored format does not change, and the
 * interface can show those passages later.
 */
export interface RepairedBeats extends AnalysedBeats {
  repaired?: RepairedPassage[];
}

/** The passages the analysis repaired, if the result says so. */
export function repairedPassages(result: AnalysisResult): RepairedPassage[] {
  const r = (result.beats as RepairedBeats).repaired;
  return Array.isArray(r) ? r : [];
}

/**
 * What the chord analysis listened to besides the mix, for one line in the
 * interface: the separated parts heard as carrying the harmony, where the
 * bass line was read, the length of the form when its repeats were found, the
 * known chart used. An optional extra field of the result (absent in results
 * stored before it existed); the stored format does not change.
 */
export interface AnalysisEvidence {
  /** Parts of the separation judged harmony-carrying and listened to (empty: the mix only). */
  harmonyStems: string[];
  /** `stem`: the separated bass; `band`: the bass register of the mix; null: not used. */
  bass: 'stem' | 'band' | null;
  /** Bars of the form, when its repeats were found. */
  formBars: number | null;
  knownChart: { title: string; collection: string | null } | null;
}

/** Why the fine chord model could not be used for an analysis (the default one read the chords). */
export type ChordFallback = 'download' | 'memory' | 'failed';

/**
 * Which chord model read the chords: an optional extra field of the result (absent in
 * results stored before it existed, which were all read by CREMA). `fallback`: the fine model
 * was chosen but could not run, CREMA read the chords instead.
 */
export interface ResultChordModel {
  id: string;
  fallback?: ChordFallback;
}

export interface ListenedResult extends AnalysisResult {
  evidence?: AnalysisEvidence;
  chordModel?: ResultChordModel;
  /** The tapped correction (C12): what was found about the taps. Not kept with the analysis (`analysis/tapFix.ts`). */
  tapped?: TappedInfo;
}

/** The chord model of a result (CREMA for results stored before the choice existed). */
export function resultChordModel(result: AnalysisResult): ResultChordModel {
  const c = (result as ListenedResult).chordModel;
  return c && typeof c === 'object' && typeof c.id === 'string' ? c : { id: 'crema-chords' };
}

/** What the analysis listened to, if the result says so. */
export function analysisEvidence(result: AnalysisResult): AnalysisEvidence | null {
  const e = (result as ListenedResult).evidence;
  return e && typeof e === 'object' ? e : null;
}

/** A grid the analysis must keep (the user corrected it): only the chords are decoded on it. */
export interface GridHint {
  times: Seconds[];
  /** Index in `times` of the first downbeat. */
  downbeat: number;
  meter: Meter;
}

export interface AnalysisRequest {
  /** Decoded audio at 48 kHz, one Float32Array per channel (not copied: do not modify it). */
  channels: readonly Float32Array[];
  sampleRate: number;
  /**
   * Identifies the audio (`AudioRef.id`): an analyser may keep its network
   * outputs for it, so a second request on the same audio with a `grid` or
   * `key` hint only re-runs the cheap decoding (the prototype's « regrid »).
   */
  audioId: string;
  /** Keep this grid (the user's): the result's `beats` must be this grid. */
  grid?: GridHint | null;
  /** Keep this key (the user's) for the chord decoding; the result's `key` must be it. */
  key?: Key | null;
  /** Known charts whose title matches the piece's (`knownCharts.ts`): plain data, a few kB. */
  knownCharts?: KnownCharts | null;
  /**
   * Which chord model reads the chords (default `crema`). With `fine`, `channels` should hold
   * both channels of the piece: the fine model listens in stereo.
   */
  chordModel?: ChordModelChoice;
  /** Called often (at least every few hundred ms while working). Never throws into the analyser. */
  onProgress?: (p: AnalysisProgress) => void;
  /** Aborts the analysis: `analyse()` then rejects with `AnalysisError('cancelled')` quickly. */
  signal?: AbortSignal;
  /**
   * A manual tempo action of the bar menu (`engine/tempoFix.ts`): the grid is
   * computed from the network's outputs from `from` on (`grid` is then the grid
   * in force, kept before `from`), and the chords are decoded on it. The
   * result's `beats` is that new grid.
   */
  tempoFix?: ManualTempoFix | null;
  /**
   * « Alléger le travail pour l'appareil » (`settings/easeLoad.ts`): the share of the device's capacity to use, on
   * average, 0.2 to 0.99; absent or 1 is full speed. Read when the analysis starts. The analyser rests between
   * its pieces of work and uses fewer threads; the results are the same, only the schedule changes.
   */
  loadShare?: number;
}

export type AnalysisErrorCode =
  /** The request was aborted. */
  | 'cancelled'
  /** A model could not be downloaded (network, integrity check). */
  | 'download-failed'
  /** This browser cannot run the analysis (no WebAssembly, no worker…). */
  | 'unsupported'
  /** The device ran out of memory. */
  | 'memory'
  /** The audio is too short or silent to analyse. */
  | 'no-music'
  /** Anything else. */
  | 'failed';

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;
  constructor(code: AnalysisErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

export interface Analyzer {
  /** `mock` or `fabtice`; copied into `AnalysisResult.analyser.id`. */
  readonly id: string;
  /** The models this analyser uses, with their source, size, licence and whether they are cached. */
  models(chordModel?: ChordModelChoice): Promise<AnalysisModelInfo[]>;
  /**
   * Analyses a piece. Resolves with a complete result; rejects with an
   * `AnalysisError`. Only one analysis runs at a time: a second call while one
   * runs may reject with `failed` (the runner never does that).
   */
  analyse(request: AnalysisRequest): Promise<AnalysisResult>;
  /** Frees the worker and models. */
  dispose(): void;
}
