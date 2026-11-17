// « Alléger le travail pour l'appareil »: the share the store holds, for the main thread (the runners read it when
// a computation starts; the screens read it to lengthen the durations they announce). The workers never import
// this file: they are handed the number.

import { appStore, useApp, type AppState } from '../store/store';
import { loadShare } from './easeLoad';

/** The share of the device's capacity to use now: 1 at full speed, else 0.2 to 0.99. */
export function currentLoadShare(s: AppState = appStore.getState()): number {
  return loadShare(s.settings);
}

/** The same, for a screen (it re-renders when the case or the slider changes). */
export function useLoadShare(): number {
  const on = useApp((s) => s.settings.easeLoad);
  const percent = useApp((s) => s.settings.easeLoadPercent);
  return loadShare({ easeLoad: on, easeLoadPercent: percent });
}
