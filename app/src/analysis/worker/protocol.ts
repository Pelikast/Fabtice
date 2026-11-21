// Messages between the analyser (main thread) and its worker.
//
// One worker per analysis: it is created when an analysis starts and
// terminated when it ends (result, error or cancellation). ONNX Runtime's
// WebAssembly memory never shrinks, so the only way to give everything back
// is to end the worker; the small outputs of the networks that a later
// « re-decode on the user's grid » needs are kept by the main thread.

import type { AnalysisResult } from '../../model/analysis';
import type { Key } from '../../model/harmony';
import type { BeatModelChoice, ChordModelChoice } from '../models';
import type { KnownCharts } from '../engine/chart';
import type { NetworkOutputs } from '../engine/pipeline';
import type { ManualTempoFix } from '../engine/tapGrid';
import type { AnalysisErrorCode, AnalysisStep, ChordWindowProgress, DownloadProgress, GridHint } from '../types';

export interface AnalyseRequestMessage {
  type: 'analyse';
  /** Mono mix of the piece at `sampleRate` (TRANSFERRED: the sender keeps nothing). */
  mono: Float32Array;
  sampleRate: number;
  beatModel: BeatModelChoice;
  chordModel: ChordModelChoice;
  /**
   * With the fine chord model: both channels of the piece at `sampleRate` (TRANSFERRED; one
   * entry for a mono piece). Empty with CREMA, which listens to `mono` only.
   */
  stereo: Float32Array[];
  /**
   * 1.0.1, « Écouter aussi les instruments séparés », with the fine model only: the separated parts
   * (not the drums) in mono at `sampleRate` (TRANSFERRED). The worker hears each with CREMA, keeps
   * the ones that carry the harmony (`engine/listen.ts#selectHarmony`), and runs the fine model once
   * more on their remix with the bass (`engine/chart.ts#HarmonyListening`).
   */
  stems?: { name: string; mono: Float32Array }[];
  /** Test hook only (`?echec-accords=memoire|session`): the fine chord model fails on purpose. */
  simulateChordFailure?: string | null;
  grid: GridHint | null;
  key: Key | null;
  known: KnownCharts | null;
  /** 1.0.3, « Chercher aussi les accords entre deux temps » (`engine/halfBeats.ts`); absent: one chord per beat at most. */
  halfBeats?: boolean;
  /** Length of the piece in seconds. */
  duration: number;
  /** A manual tempo action: the grid from its bar on is computed from the networks' outputs. */
  tempoFix?: ManualTempoFix | null;
  /** « Alléger »: the share of the device's capacity to use (0.2…0.99), absent at full speed. */
  loadShare?: number;
}

/** Decoding only, on the outputs of an earlier analysis of the same audio (the user's grid or key). */
export interface DecodeRequestMessage {
  type: 'decode';
  outputs: NetworkOutputs;
  duration: number;
  models: string[];
  grid: GridHint | null;
  key: Key | null;
  known: KnownCharts | null;
  halfBeats?: boolean;
  tempoFix?: ManualTempoFix | null;
}

export type ToWorker = AnalyseRequestMessage | DecodeRequestMessage | { type: 'cancel' };

export type FromWorker =
  /** First message of an analysis: how many bytes have to be downloaded (0: all tools are kept). */
  | { type: 'plan'; downloadBytes: number }
  /** A step began. */
  | { type: 'step'; step: AnalysisStep }
  /** Progress inside the current step, 0…1; `download` in the download step. */
  | { type: 'progress'; step: AnalysisStep; fraction: number; download?: DownloadProgress; chordWindow?: ChordWindowProgress }
  | { type: 'result'; result: AnalysisResult; outputs: NetworkOutputs | null; models: string[] }
  | { type: 'error'; code: AnalysisErrorCode; message: string };
