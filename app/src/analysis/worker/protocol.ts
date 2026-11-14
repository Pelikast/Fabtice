// Messages between the analyser (main thread) and its worker.
//
// One worker per analysis: it is created when an analysis starts and
// terminated when it ends (result, error or cancellation). ONNX Runtime's
// WebAssembly memory never shrinks, so the only way to give everything back
// is to end the worker; the small outputs of the networks that a later
// « re-decode on the user's grid » needs are kept by the main thread.

import type { AnalysisResult } from '../../model/analysis';
import type { Key } from '../../model/harmony';
import type { BeatModelChoice } from '../models';
import type { NetworkOutputs } from '../engine/pipeline';
import type { AnalysisErrorCode, AnalysisStep, DownloadProgress, GridHint } from '../types';

export interface AnalyseRequestMessage {
  type: 'analyse';
  /** Mono mix of the piece at `sampleRate` (TRANSFERRED: the sender keeps nothing). */
  mono: Float32Array;
  sampleRate: number;
  beatModel: BeatModelChoice;
  grid: GridHint | null;
  key: Key | null;
  /** Length of the piece in seconds. */
  duration: number;
}

/** Decoding only, on the outputs of an earlier analysis of the same audio (the user's grid or key). */
export interface DecodeRequestMessage {
  type: 'decode';
  outputs: NetworkOutputs;
  duration: number;
  models: string[];
  grid: GridHint | null;
  key: Key | null;
}

export type ToWorker = AnalyseRequestMessage | DecodeRequestMessage | { type: 'cancel' };

export type FromWorker =
  /** First message of an analysis: how many bytes have to be downloaded (0: all tools are kept). */
  | { type: 'plan'; downloadBytes: number }
  /** A step began. */
  | { type: 'step'; step: AnalysisStep }
  /** Progress inside the current step, 0…1; `download` in the download step. */
  | { type: 'progress'; step: AnalysisStep; fraction: number; download?: DownloadProgress }
  | { type: 'result'; result: AnalysisResult; outputs: NetworkOutputs | null; models: string[] }
  | { type: 'error'; code: AnalysisErrorCode; message: string };
