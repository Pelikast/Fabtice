// Contract of the analyser: what the app calls to analyse a piece. The real
// analyser (Web Worker, ONNX Runtime, model download and cache, from the
// prototype `web/spikes/analyse/`) implements `Analyzer`; until then
// `MockAnalyzer` (./mock.ts) stands in. The app only goes through
// `getAnalyzer()` (./index.ts) and `analysis/runner.ts`.
//
// Units: audio is the decoded piece at 48 kHz (`ENGINE_SAMPLE_RATE`), Float32
// per channel, as in `audio/registry.ts`. Times in the result are source
// seconds. The result is `model/analysis.ts#AnalysisResult`.

import type { AnalysisResult } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { Meter } from '../model/tempoMap';

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

export interface AnalysisProgress {
  step: AnalysisStep;
  /** Progress of the whole analysis, 0…1, never going back. */
  fraction: number;
  /** Present during `download`. */
  download?: DownloadProgress;
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
  /** Called often (at least every few hundred ms while working). Never throws into the analyser. */
  onProgress?: (p: AnalysisProgress) => void;
  /** Aborts the analysis: `analyse()` then rejects with `AnalysisError('cancelled')` quickly. */
  signal?: AbortSignal;
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
  models(): Promise<AnalysisModelInfo[]>;
  /**
   * Analyses a piece. Resolves with a complete result; rejects with an
   * `AnalysisError`. Only one analysis runs at a time: a second call while one
   * runs may reject with `failed` (the runner never does that).
   */
  analyse(request: AnalysisRequest): Promise<AnalysisResult>;
  /** Frees the worker and models. */
  dispose(): void;
}
