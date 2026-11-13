// Launch: reopening the project kept on the device.
//
//   nothing stored        -> the new-piece dialog;
//   a project stored      -> « Ouverture de « titre »… » (the dialog only
//                            appears if it takes more than a moment), the
//                            original audio is decoded again, the project
//                            is restored under the same ids;
//   any failure           -> the stored project is dropped, the dialog opens
//                            with one calm sentence. A marker kept in
//                            localStorage while a restore runs also covers a
//                            page the system killed in the middle (out of
//                            memory on a phone): the next launch does not try
//                            again, so a piece that cannot be reopened never
//                            traps the user in a loop.

import type { DecodedAudio } from '../audio/registry';
import { decodeAudioBytes } from '../import/decode';
import { ImportError } from '../import/types';
import { t } from '../i18n';
import { openNewPiece, restoreProject, setDialogNotice, setImportStatus } from '../store/actions';
import { appStore } from '../store/store';
import type { ProjectKeeper } from './keeper';
import { StorageError, type ProjectStorage, type StoredAudio } from './ProjectStorage';

/** The dialog appears only if reopening takes longer than this. */
export const RESTORE_DIALOG_DELAY_MS = 250;

export interface RestoreMarker {
  get(): string | null;
  set(projectId: string): void;
  clear(): void;
}

const MARKER_KEY = 'fabtice.restoring';

/** Marker in localStorage; harmless when storage is blocked. */
export const localStorageMarker: RestoreMarker = {
  get() {
    try {
      return window.localStorage.getItem(MARKER_KEY);
    } catch {
      return null;
    }
  },
  set(id) {
    try {
      window.localStorage.setItem(MARKER_KEY, id);
    } catch {
      // not kept: only the crash protection is lost
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(MARKER_KEY);
    } catch {
      // see above
    }
  },
};

export interface RestoreDeps {
  storage: ProjectStorage;
  keeper: ProjectKeeper;
  marker?: RestoreMarker;
  /** Replaces the real decoder (tests). */
  decode?: (stored: StoredAudio, onFraction: (fraction: number | null) => void) => Promise<DecodedAudio>;
}

export type RestoreOutcome = 'restored' | 'none' | 'failed';

export async function restoreAtLaunch(deps: RestoreDeps): Promise<RestoreOutcome> {
  const { storage, keeper } = deps;
  const marker = deps.marker ?? localStorageMarker;
  const decode =
    deps.decode ??
    ((stored, onFraction) =>
      decodeAudioBytes(stored.bytes, { onProgress: (p) => onFraction(p.fraction) }));

  const fail = async (title: string | null): Promise<RestoreOutcome> => {
    await storage.clearCurrent().catch(() => {});
    marker.clear();
    setImportStatus({ kind: 'idle' });
    setDialogNotice(title ? t('restore.failed', { title }) : t('restore.failedUnknown'));
    openNewPiece();
    return 'failed';
  };

  let doc;
  try {
    doc = await storage.loadCurrent();
  } catch (e) {
    // Unreadable record: say so. Storage simply unavailable: start as a new user would.
    if (e instanceof StorageError && e.code === 'corrupt') return fail(null);
    openNewPiece();
    return 'none';
  }
  // Nothing to reopen, or the user was faster than the device (a file already dropped): leave things be.
  if (!doc || doc.project.source.kind === 'demo' || appStore.getState().project !== null || appStore.getState().ui.import.kind === 'busy') {
    if (appStore.getState().project === null && appStore.getState().ui.import.kind !== 'busy') openNewPiece();
    return 'none';
  }
  const title = doc.project.title;
  if (marker.get() === doc.project.id) return fail(title);

  marker.set(doc.project.id);
  const show = (fraction: number | null) => setImportStatus({ kind: 'busy', progress: { phase: 'restoring', fraction, title } });
  show(null);
  const timer = setTimeout(openNewPiece, RESTORE_DIALOG_DELAY_MS);
  try {
    const audio = new Map<string, DecodedAudio>();
    for (const track of doc.tracks) {
      const stored = await storage.loadAudio(track.audio.id);
      if (!stored) throw new ImportError('read-failed', `no stored audio ${track.audio.id}`);
      audio.set(track.audio.id, await decode(stored, show));
    }
    await restoreProject(doc, audio);
    keeper.adopt(doc.project.id);
    marker.clear();
    return 'restored';
  } catch {
    return fail(title);
  } finally {
    clearTimeout(timer);
  }
}
