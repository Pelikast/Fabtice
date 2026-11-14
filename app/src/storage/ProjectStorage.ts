// Contract for keeping the current project on the device, so that reopening
// the app brings the piece back as it was left (CLAUDE.md: automatic local
// save at every action). One project at a time in lot 1. The implementation is
// `indexedDb.ts` (IndexedDB), `memoryStorage.ts` serves the tests.
//
// What is stored
//   - the project document (small JSON, rewritten often, debounced by the
//     caller, see `keeper.ts`);
//   - the ORIGINAL audio bytes as imported (the m4a, mp3, flac… file), once
//     per audio, so the piece can be decoded again at next launch. Decoded PCM
//     of the original is never stored (it decodes again, deterministically);
//   - the SEPARATED tracks (lot 3) as 16-bit samples (`saveTrackAudio`), in
//     blocks, under their own audio ids: they cannot be computed again in
//     seconds, so they come back at the next launch as they are (no decoding).
//
// Errors: every method rejects with a `StorageError` on failure; callers keep
// working in memory and tell the user that the piece will not be kept.

import type { PcmAudio } from '../audio/pcm';
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

  /**
   * The document of the project open at last exit, or null if none, or if it
   * was written by an unknown (newer) version. Older versions are migrated.
   * Rejects with `corrupt` if what is stored cannot be read.
   */
  loadCurrent(): Promise<ProjectDocument | null>;

  /** Replaces the current project's document. Cheap enough to call after every action (debounced). */
  saveCurrent(doc: ProjectDocument): Promise<void>;

  /**
   * Makes a new project the current one: its document and audio replace the
   * previous project's, all or nothing (on failure the previous project is
   * untouched). The keys of `audio` are the `AudioRef.id`s of the document.
   */
  replaceCurrent(doc: ProjectDocument, audio: ReadonlyMap<string, StoredAudio>): Promise<void>;

  /** Stores an audio file under an id (`AudioRef.id`); called once at import. */
  saveAudio(audioId: string, audio: StoredAudio): Promise<void>;

  /** Reads an audio file back, or null if it is gone. */
  loadAudio(audioId: string): Promise<StoredAudio | null>;

  /** Forgets the current project and every stored audio (« Nouveau projet » after confirmation). */
  clearCurrent(): Promise<void>;

  // ------------------------------------------------------------ separated tracks (lot 3)

  /**
   * Keeps a separated track's samples (16-bit, as held in memory) under its
   * audio id, replacing what was there. Written in blocks of a few MB; the
   * track becomes readable only once its last block is written (a write cut
   * short leaves nothing readable, never half a track). `replaceCurrent` and
   * `clearCurrent` delete every stored track.
   */
  saveTrackAudio(audioId: string, pcm: PcmAudio): Promise<void>;

  /** A stored track, in the in-memory form (shared memory when the page has it), or null if absent or incomplete. */
  loadTrackAudio(audioId: string): Promise<PcmAudio | null>;

  /** Deletes stored tracks (« Libérer la place », a new separation); unknown ids are ignored. */
  deleteTrackAudio(audioIds: readonly string[]): Promise<void>;

  /** Deletes every stored track whose id is not in `keep` (left-overs of a write cut short). */
  pruneTrackAudio(keep: ReadonlySet<string>): Promise<void>;

  /** What the stored tracks take: their sample bytes, by id. */
  trackAudioUsage(): Promise<{ bytes: number; ids: string[] }>;
}
