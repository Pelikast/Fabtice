// Whether the « Projet Ableton Live » window is on screen: a store of its own, outside the app's store (the
// window is not part of the piece), as the Logic one. `ui/windows.ts` counts it among the windows in the way.

import { createStore } from 'zustand/vanilla';

export const abletonDialog = createStore<{ open: boolean }>()(() => ({ open: false }));

export function openExportAbleton(): void {
  abletonDialog.setState({ open: true });
}

export function closeExportAbleton(): void {
  abletonDialog.setState({ open: false });
}
