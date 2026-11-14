// Contract of the audio export (« Exporter le son », lot 3).
//
//   what      the mix (one file, as heard: mute, solo and volume applied) or
//             the tracks (one file per chosen track at its own full level,
//             all in one archive);
//   range     the whole piece or the loop only;
//   key/tempo the ones chosen in the transport, rendered with the best engine
//             (the offline renderer, `render/types.ts`), or the applied
//             render as it is when it matches (no second computation);
//   format    wav, mp3, flac: one `AudioEncoder` each.
// `plan.ts` decides what files to make (pure, tested); `run.ts` renders, mixes,
// encodes and packs them; `deliver.ts` hands the file to the user.

import type { PcmAudio } from '../../audio/pcm';
import type { AudioFormat } from '../../model/audioExport';
import type { TimeRange } from '../../model/project';

/** Encodes one audio into a file. */
export interface AudioEncoder {
  readonly format: AudioFormat;
  /** File extension, without the dot. */
  readonly extension: string;
  readonly mimeType: string;
  /**
   * Encodes 16-bit PCM (`PcmAudio`, read with `readPcm` a block at a time:
   * never a whole Float32 copy of a long piece) into the file's bytes.
   * `onProgress` 0…1; rejects with `ExportError('cancelled')` on abort, or with
   * `ExportError('encoder-missing')` when the encoder itself could not be started.
   * `title`: written in the file's tag when the format has one (mp3, flac).
   */
  encode(audio: PcmAudio, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal; title?: string }): Promise<Blob>;
}

/** One track of a file, with the gain it is mixed at (1 for a track exported on its own). */
export interface ExportSource {
  trackId: string;
  audioId: string;
  gain: number;
}

export interface ExportFileSpec {
  /** File name, with its extension. */
  name: string;
  /** The title written in the file's tag (the name without its extension). */
  title: string;
  /** The tracks summed into this file. */
  sources: ExportSource[];
}

export interface ExportPlan {
  format: AudioFormat;
  /** Source time to export (the whole piece, or the loop). */
  range: TimeRange;
  semitones: number;
  cents: number;
  tempoRatio: number;
  formants: boolean;
  files: ExportFileSpec[];
  /** Several files: packed into this archive (a .zip), else null. */
  archiveName: string | null;
}

export type ExportErrorCode = 'cancelled' | 'nothing' | 'encoder-missing' | 'memory' | 'failed';

export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExportError';
  }
}

/** What the export hands back: the one file to save. */
export interface ExportedFile {
  blob: Blob;
  name: string;
}
