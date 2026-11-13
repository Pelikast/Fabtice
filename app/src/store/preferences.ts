// Per-device preferences kept in localStorage: minor-chord notation and the
// display habits (follow, sub-grid, triplets, magnet). Best effort only:
// storage may be missing or blocked, and the app works the same without it.

import type { AppStore, AppState } from './store';

const KEY = 'fabtice.preferences.v1';

interface Preferences {
  minorNotation?: AppState['settings']['minorNotation'];
  follow?: boolean;
  subdivision?: AppState['view']['subdivision'];
  triplets?: boolean;
  snap?: boolean;
}

function read(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Preferences) : {};
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
  triplets: s.view.triplets,
  snap: s.view.snap,
});

/** Restores the saved preferences into the store, then saves them on every change. */
export function persistPreferences(store: AppStore): () => void {
  const p = read();
  store.setState((s) => ({
    settings: { ...s.settings, ...(p.minorNotation === 'm' || p.minorNotation === '–' ? { minorNotation: p.minorNotation } : {}) },
    view: {
      ...s.view,
      ...(typeof p.follow === 'boolean' ? { follow: p.follow } : {}),
      ...([1, 2, 4, 8].includes(p.subdivision as number) ? { subdivision: p.subdivision } : {}),
      ...(typeof p.triplets === 'boolean' ? { triplets: p.triplets } : {}),
      ...(typeof p.snap === 'boolean' ? { snap: p.snap } : {}),
    },
  }));
  let last = JSON.stringify(pick(store.getState()));
  return store.subscribe((s) => {
    const next = JSON.stringify(pick(s));
    if (next !== last) {
      last = next;
      write(pick(s));
    }
  });
}
