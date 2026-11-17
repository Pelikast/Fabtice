// Per-device preferences kept in localStorage: minor-chord notation, the
// display habits (follow, sub-grid, triplets, magnet), the advanced settings
// (separation tool, formants) and, since the tabbed « Réglages » (C7), what
// happens at launch, whether a new piece is analysed at once and whether the
// chord analysis leans on the known charts of standards. Best effort only:
// storage may be missing or blocked, and the app works the same without it.

import { setChordModelChoice } from '../analysis/chordModel';
import { DEFAULT_SUBDIVISION, defaultAppSettings, type LaunchBehaviour } from '../model/project';
import type { AppStore, AppState } from './store';

const KEY = 'fabtice.preferences.v1';

/**
 * Version of the sub-grid choice kept. Raised to 2 with « Blanches » and the new default « Noires » (C3):
 * a sub-grid saved before it goes back, once, to the default so that the new default is seen.
 */
export const SUBDIVISION_VERSION = 2;

const SUBDIVISIONS = [0.5, 1, 2, 4, 8];

interface Preferences {
  minorNotation?: AppState['settings']['minorNotation'];
  follow?: boolean;
  subdivision?: AppState['view']['subdivision'];
  /** The marker of the one-time return to « Noires » (see `SUBDIVISION_VERSION`). */
  subdivisionVersion?: number;
  triplets?: boolean;
  snap?: boolean;
  separationModel?: string;
  formants?: boolean;
  atLaunch?: LaunchBehaviour;
  analyseOnImport?: boolean;
  useKnownCharts?: boolean;
  detectModulations?: boolean;
  autoStructure?: boolean;
}

function read(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Preferences) : {};
  } catch {
    return {};
  }
}

function write(p: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: preferences simply are not kept
  }
}

const pick = (s: AppState): Preferences => ({
  minorNotation: s.settings.minorNotation,
  follow: s.view.follow,
  subdivision: s.view.subdivision,
  subdivisionVersion: SUBDIVISION_VERSION,
  triplets: s.view.triplets,
  snap: s.view.snap,
  separationModel: s.settings.advanced.separationModel,
  formants: s.settings.advanced.formants,
  atLaunch: s.settings.atLaunch,
  analyseOnImport: s.settings.analyseOnImport,
  useKnownCharts: s.settings.useKnownCharts,
  detectModulations: s.settings.detectModulations,
  autoStructure: s.settings.autoStructure,
});

/** Restores the saved preferences into the store, then saves them on every change. */
export function persistPreferences(store: AppStore): () => void {
  const p = read();
  // A sub-grid saved before « Blanches » and the new default goes back, once, to « Noires ».
  const keepSubdivision = p.subdivisionVersion === SUBDIVISION_VERSION && SUBDIVISIONS.includes(p.subdivision as number);
  store.setState((s) => ({
    settings: {
      ...s.settings,
      ...(p.minorNotation === 'm' || p.minorNotation === '–' ? { minorNotation: p.minorNotation } : {}),
      ...(p.atLaunch === 'lastProject' || p.atLaunch === 'newProject' ? { atLaunch: p.atLaunch } : {}),
      ...(typeof p.analyseOnImport === 'boolean' ? { analyseOnImport: p.analyseOnImport } : {}),
      ...(typeof p.useKnownCharts === 'boolean' ? { useKnownCharts: p.useKnownCharts } : {}),
      ...(typeof p.detectModulations === 'boolean' ? { detectModulations: p.detectModulations } : {}),
      ...(typeof p.autoStructure === 'boolean' ? { autoStructure: p.autoStructure } : {}),
      advanced: {
        ...s.settings.advanced,
        // A tool id that is no longer listed falls back to the automatic choice when used (`separation/device.ts#resolveModel`).
        ...(typeof p.separationModel === 'string' && /^(auto|[a-z0-9-]{1,41})$/.test(p.separationModel) ? { separationModel: p.separationModel } : {}),
        ...(typeof p.formants === 'boolean' ? { formants: p.formants } : {}),
      },
    },
    view: {
      ...s.view,
      ...(typeof p.follow === 'boolean' ? { follow: p.follow } : {}),
      ...(keepSubdivision ? { subdivision: p.subdivision } : {}),
      ...(typeof p.triplets === 'boolean' ? { triplets: p.triplets } : {}),
      ...(typeof p.snap === 'boolean' ? { snap: p.snap } : {}),
    },
  }));
  let last = JSON.stringify(pick(store.getState()));
  // The marker of the return to « Noires » is written at once: it must not wait for the next change.
  if (p.subdivisionVersion !== SUBDIVISION_VERSION) write(pick(store.getState()));
  return store.subscribe((s) => {
    const next = JSON.stringify(pick(s));
    if (next !== last) {
      last = next;
      write(pick(s));
    }
  });
}

/**
 * « Rétablir les réglages d'origine » (Réglages → Avancé): every preference of this device goes back to its
 * default (the chord model included, which has its own key). The piece, its own settings and the downloaded
 * files are not touched.
 */
export function resetPreferences(store: AppStore): void {
  store.setState((s) => ({
    settings: defaultAppSettings(),
    view: { ...s.view, follow: true, subdivision: DEFAULT_SUBDIVISION, triplets: false, snap: true },
  }));
  setChordModelChoice('crema');
}
