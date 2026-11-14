// Launch: reopening the project kept on the device.
//
//   nothing stored        -> the new-piece dialog;
//   a project stored      -> « Ouverture de « titre »… » (the dialog only
//                            appears if it takes more than a moment), the
//                            original audio is read, decoded again, the
//                            separated instruments (lot 3) are read back as
//                            they were kept (no computation), and the
//                            project is restored under the same ids. Each step
//                            (the document, the audio, the decoding, the
//                            engine) has its own generous time limit and the
//                            screen says which one is under way: a restore can
//                            never wait for ever;
//   any failure or time-out -> the new-piece dialog opens with one calm
//                            sentence. The stored project is KEPT (a transient
//                            problem must never cost the user their work), and
//                            the dialog offers « Rouvrir « titre » » and, more
//                            discreetly, « Oublier ce morceau »;
//   separated instruments that cannot be read back (deleted by the browser,
//                            damaged, too slow) -> the piece opens WHOLE, the
//                            separation summary is dropped, and one calm
//                            sentence says the instruments can be separated
//                            again: the piece itself is never lost for them;
//   a launch that was killed during a restore (the marker kept in
//                            localStorage: out of memory on a phone, a crash)
//                            -> no automatic new attempt, so a piece that
//                            cannot be reopened never traps the user in a
//                            loop; the same offer is shown instead.
//
// A new successful import replaces the stored project (`keeper.ts`).

import { toPcm, type DecodedAudio, type PcmAudio } from '../audio/registry';
import type { ProjectDocument } from '../model/document';
import { decodeAudioBytes } from '../import/decode';
import { ImportError, type RestoreStep } from '../import/types';
import { t } from '../i18n';
import { emptySeparation } from '../model/separation';
import type { Track } from '../model/project';
import { closeProject, openNewPiece, restoreProject, setDialogNotice, setImportStatus, setReopenOffer } from '../store/actions';
import { setSeparationNotice } from '../store/separationActions';
import { appStore } from '../store/store';
import type { ProjectKeeper } from './keeper';
import { StorageError, type ProjectStorage, type StoredAudio } from './ProjectStorage';
import { StepTimeout, withTimeout } from './timeout';

/** The dialog appears only if reopening takes longer than this. */
export const RESTORE_DIALOG_DELAY_MS = 250;

/**
 * Time limits of each step, in milliseconds. Generous on purpose (a long piece
 * on an old machine is slow, not broken); they only exist so that a step that
 * never answers cannot keep the user in front of « Ouverture… » for ever.
 */
export interface RestoreLimits {
  /** Reading the stored document. */
  document: number;
  /** Reading the original audio from the device, per track. */
  read: number;
  /** Decoding it again, per track. */
  decode: number;
  /** Reading one separated instrument back (16-bit samples, no decoding). */
  instrument: number;
  /** Handing the tracks to the audio engine. */
  prepare: number;
  /** Forgetting the stored piece. */
  forget: number;
}

export const RESTORE_LIMITS: RestoreLimits = { document: 20_000, read: 60_000, decode: 180_000, instrument: 60_000, prepare: 60_000, forget: 20_000 };

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
  /** Replaces the time limits (tests). */
  limits?: Partial<RestoreLimits>;
}

/**
 * `restored`: the piece is open. `none`: nothing to reopen (the new-piece
 * dialog is open). `failed`: a piece is kept but was not opened; the dialog
 * offers to open it again or forget it.
 */
export type RestoreOutcome = 'restored' | 'none' | 'failed';

/** Why a kept piece is offered instead of opened: picks the sentence. */
type Reason = 'failed' | 'slow' | 'interrupted';

function sentenceFor(title: string | null, reason: Reason): string {
  if (title === null) return t('restore.failedUnknown');
  return t(reason === 'slow' ? 'restore.slow' : reason === 'interrupted' ? 'restore.interrupted' : 'restore.failed', { title });
}

/** The dialog with its offer: the piece stays on the device, the user chooses. */
function offer(title: string | null, reason: Reason): void {
  setImportStatus({ kind: 'idle' });
  setReopenOffer({ title });
  setDialogNotice(sentenceFor(title, reason));
  openNewPiece();
}

/** The user (or another import) got there first: nothing to do with the kept piece. */
function userIsBusy(): boolean {
  const s = appStore.getState();
  return s.project !== null || s.ui.import.kind === 'busy';
}

function resolve(deps: RestoreDeps) {
  const limits = { ...RESTORE_LIMITS, ...deps.limits };
  const marker = deps.marker ?? localStorageMarker;
  const decode =
    deps.decode ??
    ((stored: StoredAudio, onFraction: (fraction: number | null) => void) =>
      decodeAudioBytes(stored.bytes, { onProgress: (p) => onFraction(p.fraction) }));
  return { ...deps, limits, marker, decode };
}

/**
 * One attempt at opening the kept document `doc`, with the screen telling the
 * step under way. Resolves `restored`, or `failed` after having shown the
 * offer; never rejects, never waits longer than the sum of the limits.
 */
async function attempt(deps: ReturnType<typeof resolve>, doc: ProjectDocument): Promise<RestoreOutcome> {
  const { storage, keeper, marker, decode, limits } = deps;
  const title = doc.project.title;
  marker.set(doc.project.id);
  let current = true;
  const show = (step: RestoreStep, fraction: number | null) => {
    if (current) setImportStatus({ kind: 'busy', progress: { phase: 'restoring', fraction, title, step } });
  };
  show('reading', null);
  const timer = setTimeout(openNewPiece, RESTORE_DIALOG_DELAY_MS);
  try {
    const audio = new Map<string, PcmAudio>();
    const all: Track[] = [...doc.tracks, ...doc.separation.aside];
    // The original: read, decoded again, converted at once to the in-memory form (one Float32 copy at a time).
    for (const track of all.filter((tr) => tr.audio.origin !== 'separated')) {
      show('reading', null);
      const stored = await withTimeout(storage.loadAudio(track.audio.id), limits.read, 'read');
      if (!stored) throw new ImportError('read-failed', `no stored audio ${track.audio.id}`);
      show('decoding', null);
      audio.set(track.audio.id, toPcm(await withTimeout(decode(stored, (fraction) => show('decoding', fraction)), limits.decode, 'decode')));
    }
    // The separated instruments, as they were kept. Any of them missing: the piece opens whole.
    let opened = doc;
    let instrumentsLost = false;
    const separated = all.filter((tr) => tr.audio.origin === 'separated');
    try {
      for (const track of separated) {
        show('instruments', null);
        const pcm = await withTimeout(storage.loadTrackAudio(track.audio.id), limits.instrument, 'read');
        if (!pcm) throw new Error(`no stored instrument ${track.audio.id}`);
        audio.set(track.audio.id, pcm);
      }
    } catch {
      instrumentsLost = true;
      for (const tr of separated) audio.delete(tr.audio.id);
      opened = wholePieceOf(doc);
    }
    // Another piece was opened meanwhile (a file dropped on the window): that one stays.
    if (appStore.getState().project !== null) {
      current = false;
      marker.clear();
      return 'none';
    }
    show('preparing', null);
    await withTimeout(restoreProject(opened, audio, () => current), limits.prepare, 'prepare');
    keeper.adopt(doc.project.id);
    marker.clear();
    if (instrumentsLost) setSeparationNotice(t('separation.lostAtRestore'));
    // Left-overs (a separation cut short, instruments no longer referenced): swept quietly, never awaited.
    const keep = new Set([...opened.tracks, ...opened.separation.aside].filter((tr) => tr.audio.origin === 'separated').map((tr) => tr.audio.id));
    void storage.pruneTrackAudio(keep).catch(() => {});
    return 'restored';
  } catch (e) {
    current = false;
    // The piece is kept; only what this attempt had put on screen goes away.
    if (appStore.getState().project?.id === doc.project.id) closeProject();
    marker.clear();
    offer(title, e instanceof StepTimeout ? 'slow' : 'failed');
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The document with the whole piece shown and no separation: what opens when
 * the kept instruments cannot be read back. The whole-piece track keeps its mix.
 */
export function wholePieceOf(doc: ProjectDocument): ProjectDocument {
  if (doc.separation.result === null) return doc;
  const whole = doc.separation.showing === 'whole' ? doc.tracks : doc.separation.aside;
  return { ...doc, tracks: whole, separation: emptySeparation() };
}

/** Reads the kept document within its limit; `unreadable` says why when it cannot be read. */
async function loadDocument(deps: ReturnType<typeof resolve>): Promise<{ doc: ProjectDocument | null; unreadable: Reason | null }> {
  try {
    return { doc: await withTimeout(deps.storage.loadCurrent(), deps.limits.document, 'document'), unreadable: null };
  } catch (e) {
    if (e instanceof StepTimeout) return { doc: null, unreadable: 'slow' };
    // A damaged record is kept and offered (the title is unknown). Storage that is simply unavailable
    // (private window, blocked): start as a new user would.
    if (e instanceof StorageError && (e.code === 'corrupt' || e.code === 'io')) return { doc: null, unreadable: 'failed' };
    return { doc: null, unreadable: null };
  }
}

export async function restoreAtLaunch(rawDeps: RestoreDeps): Promise<RestoreOutcome> {
  const deps = resolve(rawDeps);
  const { marker } = deps;
  const { doc, unreadable } = await loadDocument(deps);
  if (unreadable) {
    if (userIsBusy()) return 'none';
    offer(null, unreadable);
    return 'failed';
  }
  // Nothing to reopen, or the user was faster than the device (a file already dropped): leave things be.
  if (!doc || doc.project.source.kind === 'demo' || userIsBusy()) {
    if (!userIsBusy()) openNewPiece();
    return 'none';
  }
  // Killed during the last attempt: do not try again by ourselves, let the user decide.
  // The marker stays until the user chooses (open again, or forget), so that quitting without choosing
  // does not make the next launch try again by itself.
  if (marker.get() === doc.project.id) {
    offer(doc.project.title, 'interrupted');
    return 'failed';
  }
  return attempt(deps, doc);
}

/** « Rouvrir « titre » »: the user asks again. The marker of an earlier cut-short attempt does not stop them. */
export async function reopenKept(rawDeps: RestoreDeps): Promise<RestoreOutcome> {
  const deps = resolve(rawDeps);
  if (appStore.getState().ui.import.kind === 'busy') return 'none';
  setDialogNotice(null);
  const { doc, unreadable } = await loadDocument(deps);
  if (unreadable) {
    offer(null, unreadable);
    return 'failed';
  }
  if (!doc || doc.project.source.kind === 'demo') {
    // Gone since the offer was made (cleaned by the browser, forgotten from another window).
    setReopenOffer(null);
    setImportStatus({ kind: 'idle' });
    openNewPiece();
    return 'none';
  }
  return attempt(deps, doc);
}

/** « Oublier ce morceau »: the stored piece and its audio are deleted, on the user's word. Resolves false if they could not be. */
export async function forgetKept(rawDeps: Pick<RestoreDeps, 'storage' | 'marker' | 'limits'>): Promise<boolean> {
  const limits = { ...RESTORE_LIMITS, ...rawDeps.limits };
  const marker = rawDeps.marker ?? localStorageMarker;
  try {
    await withTimeout(rawDeps.storage.clearCurrent(), limits.forget, 'forget');
  } catch {
    setDialogNotice(t('restore.forgetFailed'));
    return false;
  }
  marker.clear();
  setReopenOffer(null);
  setDialogNotice(null);
  return true;
}
