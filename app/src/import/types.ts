// Import boundary: turning a file or a link into a decoded piece (reading,
// yt-dlp through the Mac app, decoding to 48 kHz), with its progress and
// error shapes.

import type { DecodedAudio } from '../audio/registry';
import type { ProjectSource, Seconds } from '../model/project';
import type { StoredAudio } from '../storage/ProjectStorage';

export type ImportPhase =
  /** Mac app: yt-dlp is being downloaded and verified before the first link import. */
  | 'installing'
  /** Mac app: yt-dlp is being replaced by a newer version, on the user's request. */
  | 'updating'
  /** Mac app: yt-dlp reads the video's details. */
  | 'fetching-info'
  /** Mac app: the audio is downloaded. */
  | 'downloading'
  /** The file is read into memory. */
  | 'reading'
  /** The audio is decoded and resampled to 48 kHz. */
  | 'decoding'
  /** Tracks are handed to the engine. */
  | 'preparing'
  /** Launch: the piece kept on the device is being opened again (not an import). */
  | 'restoring';

export interface ImportProgress {
  phase: ImportPhase;
  /** 0…1 when measurable, null for an indeterminate phase. */
  fraction: number | null;
  /** Name of what is being imported (file name or video title) once known. */
  title?: string;
}

export interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  /** Aborting rejects with `ImportError('cancelled')`. */
  signal?: AbortSignal;
}

/** The result of an import: what the app needs to open the piece. */
export interface ImportedPiece {
  /** Title proposed for the project (file name without extension, or the video title). */
  title: string;
  source: ProjectSource;
  /** Bytes as imported, for project storage. */
  original: StoredAudio;
  /** Decoded at the engine rate (48 kHz), one or two channels. */
  audio: DecodedAudio;
  duration: Seconds;
}

export type ImportErrorCode =
  /** Not one of mp3, wav, aiff, m4a, flac. */
  | 'unsupported-format'
  /** The browser could not read the file from the disk. */
  | 'read-failed'
  /** The file is damaged or not really audio: the decoder refused it. */
  | 'decode-failed'
  /** Decoded to nothing: no sound at all. */
  | 'empty-audio'
  /** Longer than `MAX_DURATION_SECONDS`. */
  | 'too-long'
  /** Larger than `MAX_FILE_BYTES`, or too big for the device's memory once decoded. */
  | 'too-large'
  /** Mac app: the text is not a link it recognises. */
  | 'link-invalid'
  /** Mac app: refused on purpose (live stream, unknown duration, over 20 minutes). */
  | 'link-refused'
  /** Mac app: yt-dlp still missing after its installation. */
  | 'needs-ytdlp'
  /** Mac app: yt-dlp could not be downloaded or verified. */
  | 'install-failed'
  /** Mac app: yt-dlp could not be replaced by its newer version. */
  | 'update-failed'
  /** Mac app: yt-dlp failed. */
  | 'link-failed'
  /** Mac app: the app is already extracting another link. */
  | 'busy'
  /** Link import asked for outside the Mac app. */
  | 'not-available'
  /** The tracks could not be handed to the audio engine. */
  | 'prepare-failed'
  | 'cancelled';

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    /** French text from the Mac app (yt-dlp errors), shown under the generic message; else technical detail. */
    readonly detail: string | null = null,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ImportError';
  }
}
