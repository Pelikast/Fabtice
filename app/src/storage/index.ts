// The app's storage: one IndexedDB-backed `ProjectStorage` and one keeper,
// created on first use. `startStorage()` (called once from `main.tsx`) makes
// the keeper follow the store and reopens the project kept on the device.

import { setStorageNotice } from '../store/actions';
import { appStore } from '../store/store';
import { IndexedDbStorage } from './indexedDb';
import { ProjectKeeper } from './keeper';
import type { ProjectStorage } from './ProjectStorage';
import { restoreAtLaunch, type RestoreOutcome } from './restore';

export * from './ProjectStorage';
export { ProjectKeeper } from './keeper';
export { restoreAtLaunch } from './restore';

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

/** Autosave on, then the stored project reopened (or the new-piece dialog). */
export function startStorage(): Promise<RestoreOutcome> {
  const k = getKeeper();
  k.start();
  return restoreAtLaunch({ storage: getProjectStorage(), keeper: k });
}
