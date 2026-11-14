// The app's storage: one IndexedDB-backed `ProjectStorage` and one keeper,
// created on first use. `startStorage()` (called once from `main.tsx`) makes
// the keeper follow the store and reopens the project kept on the device.

import { openNewPiece, setStorageNotice } from '../store/actions';
import { appStore } from '../store/store';
import { IndexedDbStorage } from './indexedDb';
import { ProjectKeeper } from './keeper';
import type { ProjectStorage } from './ProjectStorage';
import { forgetKept, reopenKept, restoreAtLaunch, type RestoreOutcome } from './restore';

export * from './ProjectStorage';
export { ProjectKeeper } from './keeper';
export { forgetKept, reopenKept, restoreAtLaunch } from './restore';

let storage: ProjectStorage | null = null;
let keeper: ProjectKeeper | null = null;

export function getProjectStorage(): ProjectStorage {
  storage ??= new IndexedDbStorage();
  return storage;
}

export function getKeeper(): ProjectKeeper {
  keeper ??= new ProjectKeeper(appStore, getProjectStorage(), { onNotice: setStorageNotice });
  return keeper;
}

/** Replaces the app's storage (tests). Must come before `getKeeper()`. */
export function replaceProjectStorage(next: ProjectStorage): void {
  storage = next;
  keeper = null;
}

/**
 * Autosave on, then the stored project reopened (or the new-piece dialog).
 * Never rejects: whatever goes wrong, the user ends on the new-piece dialog.
 */
export function startStorage(): Promise<RestoreOutcome> {
  const k = getKeeper();
  k.start();
  return restoreAtLaunch({ storage: getProjectStorage(), keeper: k }).catch(() => {
    openNewPiece();
    return 'none' as const;
  });
}

/** « Rouvrir » in the dialog: another attempt at the kept piece. Never rejects. */
export function reopenKeptPiece(): Promise<RestoreOutcome> {
  return reopenKept({ storage: getProjectStorage(), keeper: getKeeper() }).catch(() => {
    openNewPiece();
    return 'none' as const;
  });
}

/** « Oublier ce morceau » in the dialog, once confirmed. Resolves false if it could not be forgotten. */
export function forgetKeptPiece(): Promise<boolean> {
  return forgetKept({ storage: getProjectStorage() }).catch(() => false);
}
