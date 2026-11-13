import type { DesktopBridge } from '../platform/desktopBridge';
import { ImportError, type ImportOptions, type ImportedPiece } from './types';

/**
 * Imports a YouTube link through the Mac app (`window.fabtice`).
 *
 * To implement: `bridge.extract(link)` with `onExtractProgress` mapped to
 * `fetching-info` and `downloading` (percent / 100); when the result says
 * `needsYtdlp`, run `bridge.ytdlpInstall()` with `installing` progress and
 * retry once; map `refused` to `link-refused` and other failures to
 * `link-failed` (detail: the French `error` text); decode `audio` like a file
 * (`decoding`). Source: `{ kind: 'link', url, channel }`, title from `meta.title`.
 *
 * Lot 1 stub: rejects with `not-available` outside the Mac app, else `not-implemented`.
 */
export async function importFromLink(link: string, bridge: DesktopBridge | null, options: ImportOptions = {}): Promise<ImportedPiece> {
  if (!bridge) throw new ImportError('not-available');
  if (!link.trim()) throw new ImportError('link-invalid');
  if (options.signal?.aborted) throw new ImportError('cancelled');
  options.onProgress?.({ phase: 'fetching-info', fraction: null });
  throw new ImportError('not-implemented', 'link import is wired by the integration step');
}
