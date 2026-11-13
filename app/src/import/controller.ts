// Runs an import from the dialog: progress and errors go to the store
// (`ui.import`), success opens the piece and has it kept on the device.
//
// One import at a time: while one runs, another request is ignored. Only the
// phases where nothing is waiting on the Mac app can be cancelled; the
// extraction and the tool's download cannot be interrupted (the bridge has no
// way to), and the dialog says so instead of offering a button that lies.

import { t } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';
import { openImportedPiece, setDialogNotice, setImportStatus, setToolUpdateAvailable } from '../store/actions';
import { appStore } from '../store/store';
import { getKeeper } from '../storage';
import type { StoredAudio } from '../storage/ProjectStorage';
import { importFromFile } from './fromFile';
import { importFromLink } from './fromLink';
import { installTool, isToolUpdateAvailable } from './tool';
import { ImportError, type ImportOptions, type ImportPhase, type ImportedPiece } from './types';

interface Job {
  controller: AbortController;
  phase: ImportPhase;
}

let running: Job | null = null;

/** True while an import (or a tool update) is under way. */
export function isImportRunning(): boolean {
  return running !== null;
}

/** Phases that « Annuler » can stop: reading and decoding happen in this page only. */
export function isCancellablePhase(phase: ImportPhase): boolean {
  return phase === 'reading' || phase === 'decoding';
}

/** The Mac app's own sentence is shown for refusals only (live stream, too long); other details are technical. */
const SHOWS_APP_TEXT: ReadonlySet<string> = new Set(['link-refused']);

function fail(e: unknown): void {
  if (e instanceof ImportError && e.code === 'cancelled') {
    setImportStatus({ kind: 'idle' });
    return;
  }
  const code = e instanceof ImportError ? e.code : null;
  const detail = e instanceof ImportError && SHOWS_APP_TEXT.has(e.code) ? e.detail : null;
  setImportStatus({ kind: 'error', message: code ? t(`import.error.${code}`) : t('import.error.unknown'), detail });
}

async function run(task: (options: ImportOptions) => Promise<ImportedPiece>): Promise<void> {
  if (running) return;
  const job: Job = { controller: new AbortController(), phase: 'reading' };
  running = job;
  setDialogNotice(null);
  setImportStatus({ kind: 'busy', progress: { phase: job.phase, fraction: null } });
  try {
    const piece = await task({
      signal: job.controller.signal,
      onProgress: (progress) => {
        if (running !== job) return;
        job.phase = progress.phase;
        setImportStatus({ kind: 'busy', progress });
      },
    });
    if (running !== job) return;
    job.phase = 'preparing';
    setImportStatus({ kind: 'busy', progress: { phase: 'preparing', fraction: null, title: piece.title } });
    try {
      await openImportedPiece(piece);
    } catch (e) {
      throw new ImportError('prepare-failed', e instanceof Error ? e.message : String(e));
    }
    // The previous piece is replaced on the device only now that the new one is open.
    const s = appStore.getState();
    const originals = new Map<string, StoredAudio>(s.tracks.map((tr) => [tr.audio.id, piece.original]));
    void getKeeper().keepNewProject(originals);
  } catch (e) {
    if (running === job) fail(e);
  } finally {
    if (running === job) running = null;
  }
}

export function startFileImport(file: File): Promise<void> {
  return run((options) => importFromFile(file, options));
}

export function startLinkImport(link: string): Promise<void> {
  return run((options) => importFromLink(link, getDesktopBridge(), options));
}

/**
 * « Annuler »: stops the running import and returns to the dialog's first
 * screen, but only where that is true (`isCancellablePhase`); otherwise nothing happens.
 * With nothing running it just clears a stale progress view.
 */
export function cancelImport(): void {
  if (running) {
    if (!isCancellablePhase(running.phase)) return;
    running.controller.abort();
    running = null;
  }
  setImportStatus({ kind: 'idle' });
}

/** Mac app: replaces the import tool by its newer version, on the user's request. */
export async function startToolUpdate(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge || running) return;
  const job: Job = { controller: new AbortController(), phase: 'updating' };
  running = job;
  setDialogNotice(null);
  setImportStatus({ kind: 'busy', progress: { phase: 'updating', fraction: null } });
  try {
    await installTool(bridge, 'updating', (progress) => setImportStatus({ kind: 'busy', progress }));
    setToolUpdateAvailable(false);
    setImportStatus({ kind: 'idle' });
  } catch (e) {
    fail(e);
  } finally {
    if (running === job) running = null;
  }
}

/** Launch, Mac app: proposes the update (a discreet line in the dialog) if one exists. Never blocks, never throws. */
export async function checkToolUpdate(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  if (await isToolUpdateAvailable(bridge)) setToolUpdateAvailable(true);
}
