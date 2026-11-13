// Runs an import from the dialog: progress and errors go to the store
// (`ui.import`), success opens the piece. One import at a time.

import { t } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';
import { openImportedPiece, setImportStatus } from '../store/actions';
import { importFromFile } from './fromFile';
import { importFromLink } from './fromLink';
import { ImportError, type ImportOptions, type ImportedPiece } from './types';

let running: AbortController | null = null;

async function run(task: (options: ImportOptions) => Promise<ImportedPiece>): Promise<void> {
  running?.abort();
  const controller = new AbortController();
  running = controller;
  setImportStatus({ kind: 'busy', progress: { phase: 'reading', fraction: null } });
  try {
    const piece = await task({
      signal: controller.signal,
      onProgress: (progress) => {
        if (running === controller) setImportStatus({ kind: 'busy', progress });
      },
    });
    if (running !== controller) return;
    setImportStatus({ kind: 'busy', progress: { phase: 'preparing', fraction: null, title: piece.title } });
    await openImportedPiece(piece);
  } catch (e) {
    if (running !== controller) return;
    if (e instanceof ImportError && e.code === 'cancelled') {
      setImportStatus({ kind: 'idle' });
      return;
    }
    const code = e instanceof ImportError ? e.code : null;
    // Only the Mac app's texts are meant for the user; other details are technical.
    const detail = e instanceof ImportError && (code === 'link-refused' || code === 'link-failed') ? e.detail : null;
    setImportStatus({ kind: 'error', message: code ? t(`import.error.${code}`) : t('import.error.unknown'), detail });
  } finally {
    if (running === controller) running = null;
  }
}

export function startFileImport(file: File): Promise<void> {
  return run((options) => importFromFile(file, options));
}

export function startLinkImport(link: string): Promise<void> {
  return run((options) => importFromLink(link, getDesktopBridge(), options));
}

/** « Annuler »: aborts the running import and returns to the dialog's first screen. */
export function cancelImport(): void {
  running?.abort();
  running = null;
  setImportStatus({ kind: 'idle' });
}
