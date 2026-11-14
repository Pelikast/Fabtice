// Fine progress of « Appliquer » and of the audio export (0…1), kept out of
// the app store like the analysis' and the separation's.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface RenderProgressState {
  /** « Appliquer »: 0…1 over every track. */
  apply: number;
  /** « Exporter le son »: 0…1 over every file. */
  export: number;
}

export const renderProgressStore = createStore<RenderProgressState>()(() => ({ apply: 0, export: 0 }));

export function setApplyProgress(apply: number): void {
  renderProgressStore.setState({ apply });
}

export function setExportProgress(value: number): void {
  renderProgressStore.setState({ export: value });
}

export function useRenderProgress<T>(selector: (s: RenderProgressState) => T): T {
  return useStore(renderProgressStore, selector);
}
