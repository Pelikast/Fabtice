import { t } from '../i18n';
import type { DesktopBridge, ExtractMeta, ExtractResult } from '../platform/desktopBridge';
import { decodeAudioBytes, type DecodeOptions } from './decode';
import { installTool } from './tool';
import { ImportError, type ImportOptions, type ImportProgress, type ImportedPiece } from './types';

/** Test hooks: everything else is the real thing. */
export type LinkImportDeps = Pick<DecodeOptions, 'decodeWebAudio'>;

const MIME_BY_EXTENSION: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** A file name for the kept copy: the title, without characters a disk dislikes. */
function fileNameFor(title: string, meta: ExtractMeta): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'morceau';
  return `${base}.${meta.ext || 'm4a'}`;
}

/**
 * What a failed extraction means. The Mac app answers with a French sentence
 * and no code; a refusal is flagged, the other cases are told apart by the
 * sentences of `desktop/src/main.js`.
 */
function failureFrom(result: Extract<ExtractResult, { ok: false }>): ImportError {
  if (result.refused) return new ImportError('link-refused', result.error);
  if (result.error.startsWith('Lien non reconnu')) return new ImportError('link-invalid', result.error);
  if (result.error.startsWith('Une importation est déjà en cours')) return new ImportError('busy', result.error);
  return new ImportError('link-failed', result.error);
}

/**
 * Imports a YouTube link through the Mac app (`window.fabtice`), in this order:
 *   1. the tool's status; if yt-dlp is missing, it is installed first
 *      (`installing`, a download of a small free tool, done once);
 *   2. the extraction: `fetching-info` (looking the piece up), `starting-download`
 *      (the tool is starting; nothing to measure yet), `downloading` with a real
 *      percentage, or with the amount received when the total is unknown; an
 *      answer `needsYtdlp` installs the tool and retries once;
 *   3. the returned bytes are decoded like a file (`decoding`).
 * The extraction itself cannot be aborted: the signal is honoured before it
 * starts and once it is over, not during it.
 */
export async function importFromLink(
  link: string,
  bridge: DesktopBridge | null,
  options: ImportOptions = {},
  deps: LinkImportDeps = {},
): Promise<ImportedPiece> {
  if (!bridge) throw new ImportError('not-available');
  const url = link.trim();
  if (!url) throw new ImportError('link-invalid');
  const { signal } = options;
  if (signal?.aborted) throw new ImportError('cancelled');

  let title: string | undefined;
  const report = (progress: ImportProgress) => options.onProgress?.({ ...progress, title: progress.title ?? title });

  report({ phase: 'fetching-info', fraction: null });
  let installedHere = false;
  const install = async () => {
    await installTool(bridge, 'installing', report);
    installedHere = true;
  };

  let toolMissing = false;
  try {
    toolMissing = !(await bridge.ytdlpStatus()).installed;
  } catch {
    // Unknown: let the extraction say whether the tool is there.
  }
  if (toolMissing) await install();
  if (signal?.aborted) throw new ImportError('cancelled');

  const extractOnce = async (): Promise<ExtractResult> => {
    report({ phase: 'fetching-info', fraction: null });
    const off = bridge.onExtractProgress((p) => {
      if (p.phase === 'download') {
        if (p.meta?.title) title = p.meta.title;
        // A percentage only when there is one; else the amount received; else nothing to measure yet.
        const fraction = typeof p.percent === 'number' && Number.isFinite(p.percent) ? Math.min(1, Math.max(0, p.percent / 100)) : null;
        const received = typeof p.receivedBytes === 'number' && Number.isFinite(p.receivedBytes) ? p.receivedBytes : null;
        if (fraction !== null) report({ phase: 'downloading', fraction });
        else if (received !== null) report({ phase: 'downloading', fraction: null, received });
        else report({ phase: 'starting-download', fraction: null });
      } else if (p.phase === 'prepare') {
        if (p.meta?.title) title = p.meta.title;
        report({ phase: 'starting-download', fraction: null });
      } else {
        report({ phase: 'fetching-info', fraction: null });
      }
    });
    try {
      return await bridge.extract(url);
    } catch (e) {
      throw new ImportError('link-failed', e instanceof Error ? e.message : String(e));
    } finally {
      off();
    }
  };

  let result = await extractOnce();
  if (!result.ok && result.needsYtdlp) {
    if (installedHere) throw new ImportError('needs-ytdlp', result.error);
    await install();
    result = await extractOnce();
    if (!result.ok && result.needsYtdlp) throw new ImportError('needs-ytdlp', result.error);
  }
  if (!result.ok) throw failureFrom(result);
  if (signal?.aborted) throw new ImportError('cancelled');
  if (!result.audio || result.audio.byteLength === 0) throw new ImportError('link-failed', 'the Mac app returned no audio');

  const pieceTitle = result.meta.title?.trim() || t('import.untitled');
  // Own copy of the bytes for storage; the decoder takes its own again.
  const bytes = result.audio.slice().buffer;
  const audio = await decodeAudioBytes(bytes, { signal, onProgress: options.onProgress, title: pieceTitle, decodeWebAudio: deps.decodeWebAudio });
  return {
    title: pieceTitle,
    source: { kind: 'link', url, channel: result.meta.channel },
    original: { bytes, mimeType: MIME_BY_EXTENSION[result.meta.ext ?? ''] ?? '', fileName: fileNameFor(pieceTitle, result.meta) },
    audio,
    duration: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
  };
}
