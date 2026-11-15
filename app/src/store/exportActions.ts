// « Exporter le son » (lot 3), as the store sees it: the dialog and the last
// choices (kept with the piece). The export itself is `export/audio/`.

import type { ExportPreferences } from '../model/audioExport';
import { appStore } from './store';

export function openExportAudio(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, exportAudioOpen: true, panel: 'none' } }));
}

export function closeExportAudio(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, exportAudioOpen: false } }));
}

export function setExportPrefs(patch: Partial<ExportPreferences>): void {
  appStore.setState((s) => ({ exportPrefs: { ...s.exportPrefs, ...patch } }));
}

/** « Imprimer la grille »: opens its small dialog (orientation, size, « Imprimer… », « Enregistrer en PDF… »). */
export function openPrint(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } }));
}

export function closePrint(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, printOpen: false } }));
}

/** Lot 4, « Enregistrer le projet… »: its small dialog (with or without the instruments, then the file). */
export function openSaveProject(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, saveProjectOpen: true, panel: 'none' } }));
}

export function closeSaveProject(): void {
  appStore.setState((s) => ({ ui: { ...s.ui, saveProjectOpen: false } }));
}
