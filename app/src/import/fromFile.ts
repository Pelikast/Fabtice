import { isSupportedAudioFile } from './formats';
import { ImportError, type ImportOptions, type ImportedPiece } from './types';

/**
 * Imports an audio file chosen or dropped by the user (web and Mac app).
 *
 * To implement: read the bytes (progress `reading`), decode them with an
 * AudioContext or OfflineAudioContext at 48 kHz (`decoding`), keep the bytes
 * as `original`. Rejects with an `ImportError`.
 *
 * Lot 1 stub: checks the format, then rejects with `not-implemented`.
 */
export async function importFromFile(file: File, options: ImportOptions = {}): Promise<ImportedPiece> {
  if (!isSupportedAudioFile(file.name, file.type)) throw new ImportError('unsupported-format', file.name);
  if (options.signal?.aborted) throw new ImportError('cancelled');
  options.onProgress?.({ phase: 'reading', fraction: null, title: file.name });
  throw new ImportError('not-implemented', 'file import is wired by the integration step');
}
