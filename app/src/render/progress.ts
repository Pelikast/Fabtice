// Fine progress of « Appliquer » and of the audio export (0…1), kept out of
// the app store like the analysis' and the separation's.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface RenderProgressState {
  /** « Appliquer »: 0…1 over every track (by frames: the work is proportional). */
  apply: number;
  /** When the current « Appliquer » began (ms), for the time left; 0 when none. */
  applyStartedAt: number;
  /** « Exporter le son »: 0…1 over every file. */
  export: number;
}

export const renderProgressStore = createStore<RenderProgressState>()(() => ({ apply: 0, applyStartedAt: 0, export: 0 }));

export function setApplyProgress(apply: number): void {
  renderProgressStore.setState({ apply });
}

/** « Appliquer » begins: progress back to 0 and the clock started. */
export function startApplyProgress(): void {
  renderProgressStore.setState({ apply: 0, applyStartedAt: Date.now() });
}

/** Seconds left from the time spent and the fraction done; null while it is too early to say. */
export function secondsLeft(elapsedMs: number, fraction: number): number | null {
  if (elapsedMs < 5000 || fraction < 0.03 || fraction >= 1) return null;
  return (elapsedMs / 1000) * ((1 - fraction) / fraction);
}

export function setExportProgress(value: number): void {
  renderProgressStore.setState({ export: value });
}

export function useRenderProgress<T>(selector: (s: RenderProgressState) => T): T {
  return useStore(renderProgressStore, selector);
}
