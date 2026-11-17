// Contract of the audio export (« Exporter le son », lot 3).
//
//   what      the mix (one file, as heard: mute, solo and volume applied), or
//             the tracks the user ticked: one file per track at its own full
//             level, all in one archive, or one file mixing them at their
//             volumes (mute and solo ignored);
//   range     the whole piece or the loop only;
//   key/tempo the ones chosen in the transport, rendered with the best engine
//             (the offline renderer, `render/types.ts`), or the applied
//             render as it is when it matches (no second computation);
//   format    wav, mp3, flac: one `AudioEncoder` each, with the choices of the
//             format (Wave: sampling rate and quantization; mp3: constant bit
//             rate) in `output`.
// `plan.ts` decides what files to make (pure, tested); `run.ts` renders, mixes,
// encodes and packs them; `deliver.ts` hands the file to the user.

import type { PcmAudio } from '../../audio/pcm';
import type { AudioFormat, WaveBits } from '../../model/audioExport';
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
   * `sampleRate`, `bits`: Wave only (the audio's own rate and 16 bits when
   * absent); `kbps`: mp3 only (constant bit rate, 320 when absent).
   */
  encode(audio: PcmAudio, options: EncodeOptions): Promise<Blob>;
}

export interface EncodeOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  title?: string;
  sampleRate?: number;
  bits?: WaveBits;
  kbps?: number;
}

/** The choices of the format of a plan. `sampleRate` null: the audio's own (48 kHz). Wave uses `sampleRate` and `bits`, mp3 `kbps`. */
export interface ExportOutput {
  sampleRate: number | null;
  bits: WaveBits;
  kbps: number;
}

/** What a plan without `output` (the first form of the contract) means: 48 kHz, 16 bits, 320 kbit/s. */
export const DEFAULT_OUTPUT: ExportOutput = { sampleRate: null, bits: 16, kbps: 320 };

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
  /** The format's own choices; absent = `DEFAULT_OUTPUT`. */
  output?: ExportOutput;
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
