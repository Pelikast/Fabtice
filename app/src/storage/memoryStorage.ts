// `ProjectStorage` in memory, behind the same interface as IndexedDB. For
// tests: it round-trips documents through JSON like a real store, and can be
// told to fail (`failWith`) to exercise the « the piece will not be kept »
// paths. The app itself never falls back to it (that would pretend to keep
// what is lost at the next launch).

import type { ProjectDocument } from '../model/document';
import { readDocument } from './documentFormat';
import { StorageError, type ProjectStorage, type StorageErrorCode, type StorageEstimate, type StoredAudio } from './ProjectStorage';

export class MemoryStorage implements ProjectStorage {
  /** The stored document as JSON text, like a real store would hold it. */
  json: string | null = null;
  readonly audio = new Map<string, StoredAudio>();
  /** When set, every call fails with this code. */
  failWith: StorageErrorCode | null = null;
  persistenceGranted = true;
  persistenceRequests = 0;
  /** Counts the document writes (`saveCurrent` and `replaceCurrent`). */
  writes = 0;

  private check(): void {
    if (this.failWith) throw new StorageError(this.failWith, `memory storage set to fail: ${this.failWith}`);
  }

  async isAvailable(): Promise<boolean> {
    return this.failWith !== 'unavailable';
  }

  async requestPersistence(): Promise<boolean> {
    this.persistenceRequests++;
    return this.persistenceGranted;
  }

  async estimate(): Promise<StorageEstimate> {
    return { usage: null, quota: null, persisted: this.persistenceGranted };
  }

  async loadCurrent(): Promise<ProjectDocument | null> {
    this.check();
    if (this.json === null) return null;
    return readDocument(JSON.parse(this.json));
  }

  async saveCurrent(doc: ProjectDocument): Promise<void> {
    this.check();
    this.writes++;
    this.json = JSON.stringify(doc);
  }

  async replaceCurrent(doc: ProjectDocument, audio: ReadonlyMap<string, StoredAudio>): Promise<void> {
    this.check();
    this.writes++;
    this.json = JSON.stringify(doc);
    this.audio.clear();
    for (const [id, a] of audio) this.audio.set(id, a);
  }

  async saveAudio(audioId: string, audio: StoredAudio): Promise<void> {
    this.check();
    this.audio.set(audioId, audio);
  }

  async loadAudio(audioId: string): Promise<StoredAudio | null> {
    this.check();
    return this.audio.get(audioId) ?? null;
  }

  async clearCurrent(): Promise<void> {
    this.check();
    this.json = null;
    this.audio.clear();
  }
}
