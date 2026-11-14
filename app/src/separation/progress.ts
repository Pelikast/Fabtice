// Fine progress of the running separation (fraction, remaining time, bytes
// downloaded), kept OUT of the app store like the analysis' (it changes
// several times a second; the app store only holds the coarse status,
// `AppState.separationRun`).

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface SeparationProgressState {
  /** 0…1 for the whole run. */
  fraction: number;
  /** Remaining time in seconds, as the separator measures it; null until known. */
  remainingSeconds: number | null;
  /** Set while the tool is downloaded (first use only). */
  download: { loaded: number; total: number } | null;
}

export const separationProgressStore = createStore<SeparationProgressState>()(() => ({ fraction: 0, remainingSeconds: null, download: null }));

export function setSeparationProgress(p: SeparationProgressState): void {
  separationProgressStore.setState(p);
}

/** React hook on the fine progress; keep selectors narrow (primitives). */
export function useSeparationProgress<T>(selector: (s: SeparationProgressState) => T): T {
  return useStore(separationProgressStore, selector);
}
