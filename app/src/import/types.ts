// Import boundary: turning a file or a link into a decoded piece.
// Lot 1 defines the entry points and their progress/error shapes; the real
// work (reading, yt-dlp through the Mac app, decoding to 48 kHz) is wired later.

import type { DecodedAudio } from '../audio/registry';
import type { ProjectSource, Seconds } from '../model/project';
import type { StoredAudio } from '../storage/ProjectStorage';

export type ImportPhase =
  /** Mac app: yt-dlp is being downloaded and verified before the first link import. */
  | 'installing'
  /** Mac app: yt-dlp reads the video's details. */
  | 'fetching-info'
  /** Mac app: the audio is downloaded. */
  | 'downloading'
  /** The file is read into memory. */
  | 'reading'
  /** The audio is decoded and resampled to 48 kHz. */
  | 'decoding'
  /** Tracks are handed to the engine. */
  | 'preparing';

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
  /** The browser could not decode the file. */
  | 'decode-failed'
  /** Longer than the app accepts. */
  | 'too-long'
  /** Mac app: the text is not a link it recognises. */
  | 'link-invalid'
  /** Mac app: refused on purpose (live stream, unknown duration, over 20 minutes). */
  | 'link-refused'
  /** Mac app: yt-dlp must be installed first. */
  | 'needs-ytdlp'
  /** Mac app: yt-dlp failed. */
  | 'link-failed'
  /** Link import asked for outside the Mac app. */
  | 'not-available'
  | 'cancelled'
  /** Lot 1 stubs. */
  | 'not-implemented';

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
