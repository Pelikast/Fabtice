// The small per-device settings of the tabbed « Réglages » (C7) that have no other home: what happens at
// launch, whether a new piece is analysed at once, whether the chord analysis leans on the known charts of
// standards, and « Rétablir les réglages d'origine ». They are kept on the device by `store/preferences.ts`.

import type { LaunchBehaviour } from '../model/project';
import { resetPreferences } from './preferences';
import { appStore } from './store';

const set = appStore.setState;

/** « À l'ouverture »: reopen the kept piece (the habit), or open the « Nouveau projet » window. */
export function setAtLaunch(atLaunch: LaunchBehaviour): void {
  set((s) => ({ settings: { ...s.settings, atLaunch } }));
}

/** « Analyser dès l'import ». */
export function setAnalyseOnImport(analyseOnImport: boolean): void {
  set((s) => ({ settings: { ...s.settings, analyseOnImport } }));
}

/** « S'appuyer sur les grilles connues des standards ». */
export function setUseKnownCharts(useKnownCharts: boolean): void {
  set((s) => ({ settings: { ...s.settings, useKnownCharts } }));
}

/** « Rétablir les réglages d'origine »: the preferences of this device only (see `resetPreferences`). */
export function resetDeviceSettings(): void {
  resetPreferences(appStore);
}
