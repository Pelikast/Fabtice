// The small per-device settings of the tabbed « Réglages » (C7) that have no other home: what happens at
// launch, whether a new piece is analysed at once, whether the chord analysis leans on the known charts of
// standards, whether the modulations and the structure are detected, and « Rétablir les réglages d'origine ». They are kept on the device by `store/preferences.ts`.

import { EASE_LOAD_MAX, EASE_LOAD_MIN, type LaunchBehaviour } from '../model/project';
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

/** « Détecter les modulations » (stage 5): off, the detected modulations go at the next refresh of the harmony pass. */
export function setDetectModulations(detectModulations: boolean): void {
  set((s) => ({ settings: { ...s.settings, detectModulations } }));
}

/** « Structure automatique du morceau » (stage 5): off, the detected structure goes at the next refresh. */
export function setAutoStructure(autoStructure: boolean): void {
  set((s) => ({ settings: { ...s.settings, autoStructure } }));
}

/** « Alléger le travail pour l'appareil » (stage 6, C2): the case, kept from one time to the next. */
export function setEaseLoad(easeLoad: boolean): void {
  set((s) => ({ settings: { ...s.settings, easeLoad } }));
}

/** The slider of « Alléger » (Réglages → Avancé): a whole percentage from 20 to 99. */
export function setEaseLoadPercent(percent: number): void {
  const easeLoadPercent = Math.min(EASE_LOAD_MAX, Math.max(EASE_LOAD_MIN, Math.round(percent)));
  set((s) => ({ settings: { ...s.settings, easeLoadPercent } }));
}

/** « Vérifier à chaque ouverture » (stage 6, C16). */
export function setCheckUpdatesAtLaunch(checkUpdatesAtLaunch: boolean): void {
  set((s) => ({ settings: { ...s.settings, checkUpdatesAtLaunch } }));
}

/** « Rétablir les réglages d'origine »: the preferences of this device only (see `resetPreferences`). */
export function resetDeviceSettings(): void {
  resetPreferences(appStore);
}
