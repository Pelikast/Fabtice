// Contract for keeping the current project on the device, so that reopening
// the app brings the piece back as it was left (CLAUDE.md: automatic local
// save at every action). Interface only in lot 1; the implementation (likely
// IndexedDB for the document and the origin private file system for audio,
// as the separation spike does for large models) comes later.
//
// What is stored
//   - the project document (small JSON, rewritten often, debounced by the caller);
//   - the ORIGINAL audio bytes as imported (the m4a, mp3, flac… file), once
//     per audio, so the piece can be decoded again at next launch. Decoded PCM
//     is never stored (too large); separated tracks (lot 3) may be stored
//     under their own audio ids.
//
// Errors: every method rejects with a `StorageError` on failure; callers keep
// working in memory and may tell the user that the piece will not be kept.

import type { ProjectDocument } from '../model/document';

export interface StoredAudio {
  /** The bytes exactly as imported. */
  bytes: ArrayBuffer;
  /** MIME type when known (« audio/mp4 », « audio/mpeg »…), else empty. */
  mimeType: string;
  /** Original file name, for display and re-export. */
  fileName: string;
}

export interface StorageEstimate {
  /** Bytes used by Fabtice on this device, if the browser says. */
  usage: number | null;
  /** Bytes the browser lets Fabtice use, if it says. */
  quota: number | null;
  /** True once the browser granted persistent storage (not evicted under pressure). */
  persisted: boolean;
}

export type StorageErrorCode = 'unavailable' | 'quota' | 'corrupt' | 'io';

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface ProjectStorage {
  /** False in private browsing or when the browser blocks storage. */
  isAvailable(): Promise<boolean>;

  /** Asks the browser to keep the data under storage pressure; resolves to the outcome. */
  requestPersistence(): Promise<boolean>;

  estimate(): Promise<StorageEstimate>;

  /** The document of the project open at last exit, or null if none (or unreadable: then rejects with `corrupt`). */
  loadCurrent(): Promise<ProjectDocument | null>;

  /** Replaces the current project's document. Cheap enough to call after every action (debounced). */
  saveCurrent(doc: ProjectDocument): Promise<void>;

  /** Stores an audio file under an id (`AudioRef.id`); called once at import. */
  saveAudio(audioId: string, audio: StoredAudio): Promise<void>;

  /** Reads an audio file back, or null if it is gone. */
  loadAudio(audioId: string): Promise<StoredAudio | null>;

  /** Forgets the current project and every stored audio (« Nouveau projet » after confirmation). */
  clearCurrent(): Promise<void>;
}
