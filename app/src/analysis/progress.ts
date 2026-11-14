// Fine progress of the running analysis (fraction, bytes downloaded), kept
// OUT of the app store on purpose: it changes many times a second, and every
// change of the app store wakes its subscribers (the autosave postpones its
// write while the state keeps changing). The app store only holds the coarse
// status (`AppState.analysisRun`: running, step, error), which changes a few
// times per analysis.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { DownloadProgress } from './types';

export interface AnalysisProgressState {
  /** 0…1 for the whole analysis. */
  fraction: number;
  /** Set while models are downloaded (first time only). */
  download: DownloadProgress | null;
}

export const analysisProgressStore = createStore<AnalysisProgressState>()(() => ({ fraction: 0, download: null }));

export function setAnalysisProgress(p: AnalysisProgressState): void {
  analysisProgressStore.setState(p);
}

/** React hook on the fine progress; keep selectors narrow (primitives). */
export function useAnalysisProgress<T>(selector: (s: AnalysisProgressState) => T): T {
  return useStore(analysisProgressStore, selector);
}
