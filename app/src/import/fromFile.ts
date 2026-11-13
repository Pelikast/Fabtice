import { decodeAudioBytes, type DecodeOptions } from './decode';
import { isSupportedAudioFile, titleFromFileName } from './formats';
import { MAX_FILE_BYTES } from './limits';
import { ImportError, type ImportOptions, type ImportedPiece } from './types';

/** Test hooks: everything else is the real thing. */
export type FileImportDeps = Pick<DecodeOptions, 'decodeWebAudio'>;

/** Reads a file into memory, reporting progress and honouring cancellation. */
async function readBytes(file: File, title: string, options: ImportOptions): Promise<ArrayBuffer> {
  const report = (fraction: number | null) => options.onProgress?.({ phase: 'reading', fraction, title });
  report(0);
  if (typeof file.stream !== 'function') return file.arrayBuffer();
  const out = new Uint8Array(file.size);
  const reader = file.stream().getReader();
  let at = 0;
  let lastPercent = -1;
  for (;;) {
    if (options.signal?.aborted) {
      void reader.cancel().catch(() => {});
      throw new ImportError('cancelled');
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > out.length) throw new ImportError('read-failed', 'the file grew while it was read');
    out.set(value, at);
    at += value.length;
    const percent = Math.floor((at / Math.max(1, file.size)) * 100);
    if (percent !== lastPercent) {
      lastPercent = percent;
      report(at / Math.max(1, file.size));
    }
  }
  if (at !== out.length) throw new ImportError('read-failed', 'the file shrank while it was read');
  return out.buffer;
}

/**
 * Imports an audio file chosen or dropped by the user (web and Mac app):
 * reads the bytes (`reading`), decodes them to 48 kHz PCM (`decoding`), keeps
 * the bytes as `original` for project storage. Rejects with an `ImportError`.
 */
export async function importFromFile(file: File, options: ImportOptions = {}, deps: FileImportDeps = {}): Promise<ImportedPiece> {
  if (!isSupportedAudioFile(file.name, file.type)) throw new ImportError('unsupported-format', file.name);
  if (options.signal?.aborted) throw new ImportError('cancelled');
  const title = titleFromFileName(file.name);
  if (file.size === 0) throw new ImportError('empty-audio');
  if (file.size > MAX_FILE_BYTES) throw new ImportError('too-large', `${file.size} bytes`);

  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(file, title, options);
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('read-failed', e instanceof Error ? e.message : String(e));
  }

  const audio = await decodeAudioBytes(bytes, {
    signal: options.signal,
    onProgress: options.onProgress,
    title,
    decodeWebAudio: deps.decodeWebAudio,
  });
  return {
    title,
    source: { kind: 'file', fileName: file.name },
    original: { bytes, mimeType: file.type, fileName: file.name },
    audio,
    duration: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
  };
}
