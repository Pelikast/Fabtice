// `ProjectStorage` on IndexedDB.
//
// Database `fabtice`, version 1, two object stores:
//   `project`  one record under the key `current`:
//              { schema, document }  — the `ProjectDocument` (small JSON);
//   `audio`    one record per audio id: { bytes, mimeType, fileName } — the
//              original file as imported, stored as an ArrayBuffer.
// One project at a time: `replaceCurrent` rewrites both stores in a single
// transaction, so a failure (full disk, closed tab) leaves the previous
// project whole.

import type { ProjectDocument } from '../model/document';
import { readDocument, STORAGE_SCHEMA } from './documentFormat';
import { StorageError, type ProjectStorage, type StorageEstimate, type StoredAudio } from './ProjectStorage';

export const DB_NAME = 'fabtice';
export const DB_VERSION = 1;
const PROJECT = 'project';
const AUDIO = 'audio';
const CURRENT = 'current';

interface ProjectRecord {
  schema: number;
  document: ProjectDocument;
}

/** The browser's reply to a failed request, in our terms. */
function toStorageError(e: unknown, fallback: 'io' | 'unavailable' = 'io'): StorageError {
  if (e instanceof StorageError) return e;
  const name = e instanceof Error || (typeof DOMException !== 'undefined' && e instanceof DOMException) ? (e as Error).name : '';
  const message = e instanceof Error ? e.message : String(e);
  if (name === 'QuotaExceededError') return new StorageError('quota', message);
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotSupportedError') return new StorageError('unavailable', message);
  return new StorageError(fallback, message);
}

export class IndexedDbStorage implements ProjectStorage {
  private opening: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
    private readonly storageManager: StorageManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    const factory = this.factory;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory) return reject(new StorageError('unavailable', 'IndexedDB is missing'));
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return reject(toStorageError(e, 'unavailable'));
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT)) db.createObjectStore(PROJECT);
        if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database, or the browser clearing it: reopen next time.
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        db.onclose = () => {
          this.opening = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(toStorageError(request.error, 'unavailable'));
      request.onblocked = () => reject(new StorageError('unavailable', 'database blocked by another tab'));
    });
    this.opening = attempt;
    attempt.catch(() => {
      if (this.opening === attempt) this.opening = null;
    });
    return attempt;
  }

  /** Runs `work` in one transaction and resolves with its result once the transaction has committed. */
  private async transact<T>(mode: IDBTransactionMode, stores: string[], work: (tx: IDBTransaction) => IDBRequest | null): Promise<T | undefined> {
    const db = await this.open();
    return new Promise<T | undefined>((resolve, reject) => {
      let tx: IDBTransaction;
      let last: IDBRequest | null = null;
      try {
        tx = db.transaction(stores, mode);
        last = work(tx);
      } catch (e) {
        return reject(toStorageError(e));
      }
      tx.oncomplete = () => resolve(last ? (last.result as T) : undefined);
      tx.onerror = () => reject(toStorageError(tx.error ?? last?.error));
      tx.onabort = () => reject(toStorageError(tx.error ?? last?.error));
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.open();
      return true;
    } catch {
      return false;
    }
  }

  async requestPersistence(): Promise<boolean> {
    try {
      if (!this.storageManager?.persist) return false;
      if (this.storageManager.persisted && (await this.storageManager.persisted())) return true;
      return await this.storageManager.persist();
    } catch {
      return false;
    }
  }

  async estimate(): Promise<StorageEstimate> {
    let usage: number | null = null;
    let quota: number | null = null;
    let persisted = false;
    try {
      const e = await this.storageManager?.estimate?.();
      usage = e?.usage ?? null;
      quota = e?.quota ?? null;
      persisted = (await this.storageManager?.persisted?.()) ?? false;
    } catch {
      // the browser does not say
    }
    return { usage, quota, persisted };
  }

  async loadCurrent(): Promise<ProjectDocument | null> {
    const record = await this.transact<ProjectRecord | undefined>('readonly', [PROJECT], (tx) => tx.objectStore(PROJECT).get(CURRENT));
    if (record === undefined || record === null) return null;
    if (typeof record !== 'object' || record.schema !== STORAGE_SCHEMA) {
      if (typeof record === 'object' && typeof record.schema === 'number' && record.schema > STORAGE_SCHEMA) return null;
      throw new StorageError('corrupt', 'stored project: unreadable record');
    }
    return readDocument(record.document);
  }

  async saveCurrent(doc: ProjectDocument): Promise<void> {
    const record: ProjectRecord = { schema: STORAGE_SCHEMA, document: doc };
    await this.transact('readwrite', [PROJECT], (tx) => tx.objectStore(PROJECT).put(record, CURRENT));
  }

  async replaceCurrent(doc: ProjectDocument, audio: ReadonlyMap<string, StoredAudio>): Promise<void> {
    const record: ProjectRecord = { schema: STORAGE_SCHEMA, document: doc };
    await this.transact('readwrite', [PROJECT, AUDIO], (tx) => {
      const audioStore = tx.objectStore(AUDIO);
      audioStore.clear();
      for (const [id, a] of audio) audioStore.put(a, id);
      return tx.objectStore(PROJECT).put(record, CURRENT);
    });
  }

  async saveAudio(audioId: string, audio: StoredAudio): Promise<void> {
    await this.transact('readwrite', [AUDIO], (tx) => tx.objectStore(AUDIO).put(audio, audioId));
  }

  async loadAudio(audioId: string): Promise<StoredAudio | null> {
    const stored = await this.transact<StoredAudio | undefined>('readonly', [AUDIO], (tx) => tx.objectStore(AUDIO).get(audioId));
    if (stored === undefined || stored === null) return null;
    if (Object.prototype.toString.call(stored.bytes) !== '[object ArrayBuffer]') throw new StorageError('corrupt', 'stored audio: unreadable record');
    return stored;
  }

  async clearCurrent(): Promise<void> {
    await this.transact('readwrite', [PROJECT, AUDIO], (tx) => {
      tx.objectStore(AUDIO).clear();
      return tx.objectStore(PROJECT).clear();
    });
  }
}
