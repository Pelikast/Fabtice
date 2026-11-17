// Whether the « Dossier pour Logic Pro » window is on screen: a store of its own, outside the app's store (the
// window is not part of the piece). `ui/windows.ts` counts it among the windows in the way.

import { createStore } from 'zustand/vanilla';

export const logicDialog = createStore<{ open: boolean }>()(() => ({ open: false }));

export function openExportLogic(): void {
  logicDialog.setState({ open: true });
}

export function closeExportLogic(): void {
  logicDialog.setState({ open: false });
}
