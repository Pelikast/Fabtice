// `ProjectStorage` on IndexedDB.
//
// Database `fabtice`, version 2, four object stores:
//   `project`  one record under the key `current`:
//              { schema, document }  — the `ProjectDocument` (small JSON);
//   `audio`    one record per audio id: { bytes, mimeType, fileName } — the
//              original file as imported, stored as an ArrayBuffer;
//   `pcm`      (version 2, lot 3) the samples of the separated tracks, in
//              blocks: key [audioId, block], value { l, r, chunks } — 16
//              chunks of 32 768 frames per block (1 MB per channel), each
//              channel an ArrayBuffer of 16-bit samples (`r` null for mono);
//   `pcmInfo`  (version 2) one record per stored track: { frames,
//              sampleRate, channelCount, mono, blocks, bytes }, written LAST,
//              so a track whose write was cut short has no info and is
//              never read (`pruneTrackAudio` sweeps its blocks).
// One project at a time: `replaceCurrent` rewrites the stores in a single
// transaction, so a failure (full disk, closed tab) leaves the previous
// project whole.
//
// Why IndexedDB for the separated tracks, not the origin private file system:
// it is the store the app already relies on in every context it runs in
// (http(s) pages, the Mac app's `fabtice://app` origin, workers), with the
// same quota and the same persistent-storage grant, and one place to clear
// when a new piece replaces the old one; the private file system's writable
// streams arrived late in Safari. Values of a few MB are kept by the browser
// outside the database proper, like the original audio already is (see
// `transact`). The end-to-end check of the Mac app
// (`desktop/test/e2e/separated-storage.test.js`) writes tens of MB through
// both, quits, relaunches and reads them back.

import { CHUNK, newChunkChannel, pcmFromChunks, type Chunk, type PcmAudio } from '../audio/pcm';
import type { ProjectDocument } from '../model/document';
import { readDocument, STORAGE_SCHEMA } from './documentFormat';
import { StorageError, type ProjectStorage, type StorageEstimate, type StoredAudio } from './ProjectStorage';

export const DB_NAME = 'fabtice';
export const DB_VERSION = 2;
const PROJECT = 'project';
const AUDIO = 'audio';
const PCM = 'pcm';
const PCM_INFO = 'pcmInfo';
const CURRENT = 'current';
/** Chunks per stored block (16 x 32 768 frames = 1 MB per channel). */
export const CHUNKS_PER_BLOCK = 16;
/** Blocks written per transaction (a few tens of MB at most in flight). */
const BLOCKS_PER_WRITE = 8;

interface PcmBlock {
  l: ArrayBuffer;
  r: ArrayBuffer | null;
  chunks: number;
}

export interface PcmInfo {
  frames: number;
  sampleRate: number;
  channelCount: 1 | 2;
  mono: boolean;
  blocks: number;
  bytes: number;
}

const blockRange = (audioId: string) => IDBKeyRange.bound([audioId, 0], [audioId, Number.MAX_SAFE_INTEGER]);
const isBuffer = (v: unknown): v is ArrayBuffer => Object.prototype.toString.call(v) === '[object ArrayBuffer]';

/** Copies `count` chunks of one channel (shared memory) into one plain buffer: shared memory cannot be stored. */
function packChannel(chunks: readonly Chunk[], from: number, count: number, right: boolean): ArrayBuffer {
  const out = new Int16Array(count * CHUNK);
  for (let i = 0; i < count; i++) out.set(right ? chunks[from + i]!.r! : chunks[from + i]!.l, i * CHUNK);
  return out.buffer;
}

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
      // Once we have answered « blocked » the caller has moved on: a database that opens
      // later must not stay open (it would hold up the next upgrade), so it is closed.
      let answered = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT)) db.createObjectStore(PROJECT);
        if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
        // Version 2 (lot 3): the separated tracks.
        if (!db.objectStoreNames.contains(PCM)) db.createObjectStore(PCM);
        if (!db.objectStoreNames.contains(PCM_INFO)) db.createObjectStore(PCM_INFO);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (answered) {
          db.close();
          return;
        }
        answered = true;
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
      request.onerror = () => {
        answered = true;
        reject(toStorageError(request.error, 'unavailable'));
      };
      request.onblocked = () => {
        answered = true;
        reject(new StorageError('unavailable', 'database blocked by another tab'));
      };
    });
    this.opening = attempt;
    attempt.catch(() => {
      if (this.opening === attempt) this.opening = null;
    });
    return attempt;
  }

  /**
   * Runs `work` in one transaction. A read resolves with the result of its
   * request, as soon as that request succeeds; a write resolves once the
   * transaction has committed.
   *
   * A read must NOT take its result when the transaction completes: the browser
   * keeps large values (a whole piece of audio) apart and delivers them a
   * little later, so the transaction can complete while the request is still
   * pending. Reading `request.result` then throws, and nothing ever answered:
   * a stored piece of real size never came back at launch.
   */
  private async transact<T>(mode: IDBTransactionMode, stores: string[], work: (tx: IDBTransaction) => IDBRequest | null): Promise<T | undefined> {
    const db = await this.open();
    return new Promise<T | undefined>((resolve, reject) => {
      let tx: IDBTransaction | undefined;
      let last: IDBRequest | null = null;
      const reading = mode === 'readonly';
      try {
        tx = db.transaction(stores, mode);
        last = work(tx);
        if (reading) {
          const request = last;
          if (request) request.onsuccess = () => resolve(request.result as T);
        } else {
          // Commit now rather than when the event loop is next idle: a page that is
          // being closed (the save on « page hidden ») would otherwise lose the write.
          (tx as IDBTransaction & { commit?: () => void }).commit?.();
        }
      } catch (e) {
        // A request that throws (data that cannot be stored) leaves the transaction alive: cancel what it did.
        try {
          tx?.abort();
        } catch {
          // already finished
        }
        return reject(toStorageError(e));
      }
      tx.oncomplete = () => {
        if (!reading || !last) resolve(undefined);
      };
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
    await this.transact('readwrite', [PROJECT, AUDIO, PCM, PCM_INFO], (tx) => {
      const audioStore = tx.objectStore(AUDIO);
      audioStore.clear();
      // A new piece: the previous piece's separated tracks go with it.
      tx.objectStore(PCM).clear();
      tx.objectStore(PCM_INFO).clear();
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
    await this.transact('readwrite', [PROJECT, AUDIO, PCM, PCM_INFO], (tx) => {
      tx.objectStore(AUDIO).clear();
      tx.objectStore(PCM).clear();
      tx.objectStore(PCM_INFO).clear();
      return tx.objectStore(PROJECT).clear();
    });
  }

  // ---------------------------------------------------------------- separated tracks

  async saveTrackAudio(audioId: string, pcm: PcmAudio): Promise<void> {
    // Unreadable from the first byte written until the last: the info goes first, and comes back last.
    await this.transact('readwrite', [PCM, PCM_INFO], (tx) => {
      tx.objectStore(PCM).delete(blockRange(audioId));
      return tx.objectStore(PCM_INFO).delete(audioId);
    });
    const blocks = Math.ceil(pcm.chunks.length / CHUNKS_PER_BLOCK);
    for (let b0 = 0; b0 < blocks; b0 += BLOCKS_PER_WRITE) {
      await this.transact('readwrite', [PCM], (tx) => {
        const store = tx.objectStore(PCM);
        let last: IDBRequest | null = null;
        for (let b = b0; b < Math.min(blocks, b0 + BLOCKS_PER_WRITE); b++) {
          const from = b * CHUNKS_PER_BLOCK;
          const count = Math.min(CHUNKS_PER_BLOCK, pcm.chunks.length - from);
          const block: PcmBlock = { l: packChannel(pcm.chunks, from, count, false), r: pcm.mono ? null : packChannel(pcm.chunks, from, count, true), chunks: count };
          last = store.put(block, [audioId, b]);
        }
        return last;
      });
    }
    const info: PcmInfo = { frames: pcm.frames, sampleRate: pcm.sampleRate, channelCount: pcm.channelCount, mono: pcm.mono, blocks, bytes: pcm.bytes };
    await this.transact('readwrite', [PCM_INFO], (tx) => tx.objectStore(PCM_INFO).put(info, audioId));
  }

  async loadTrackAudio(audioId: string): Promise<PcmAudio | null> {
    const info = await this.transact<PcmInfo | undefined>('readonly', [PCM_INFO], (tx) => tx.objectStore(PCM_INFO).get(audioId));
    if (info === undefined || info === null) return null;
    if (typeof info !== 'object' || typeof info.frames !== 'number' || typeof info.blocks !== 'number' || typeof info.sampleRate !== 'number') {
      throw new StorageError('corrupt', 'stored track: unreadable info');
    }
    const expected = Math.ceil(info.frames / CHUNK);
    const chunks: Chunk[] = [];
    for (let b = 0; b < info.blocks; b++) {
      // One request per transaction, its result taken when the request succeeds (large values come late).
      const block = await this.transact<PcmBlock | undefined>('readonly', [PCM], (tx) => tx.objectStore(PCM).get([audioId, b]));
      if (!block || !isBuffer(block.l) || (block.r !== null && !isBuffer(block.r)) || block.l.byteLength !== block.chunks * CHUNK * 2) {
        throw new StorageError('corrupt', `stored track ${audioId}: block ${b} missing or damaged`);
      }
      for (let c = 0; c < block.chunks; c++) {
        const l = newChunkChannel();
        l.set(new Int16Array(block.l, c * CHUNK * 2, CHUNK));
        let r: Int16Array | null = null;
        if (block.r) {
          r = newChunkChannel();
          r.set(new Int16Array(block.r, c * CHUNK * 2, CHUNK));
        }
        chunks.push({ l, r });
      }
    }
    if (chunks.length !== expected) throw new StorageError('corrupt', `stored track ${audioId}: ${chunks.length} chunks, ${expected} expected`);
    try {
      return pcmFromChunks(chunks, info.frames, info.sampleRate, info.channelCount === 1 ? 1 : 2);
    } catch (e) {
      throw new StorageError('corrupt', `stored track ${audioId}: ${(e as Error).message}`);
    }
  }

  async deleteTrackAudio(audioIds: readonly string[]): Promise<void> {
    if (audioIds.length === 0) return;
    await this.transact('readwrite', [PCM, PCM_INFO], (tx) => {
      let last: IDBRequest | null = null;
      for (const id of audioIds) {
        tx.objectStore(PCM).delete(blockRange(id));
        last = tx.objectStore(PCM_INFO).delete(id);
      }
      return last;
    });
  }

  async pruneTrackAudio(keep: ReadonlySet<string>): Promise<void> {
    const keys = await this.transact<IDBValidKey[]>('readonly', [PCM], (tx) => tx.objectStore(PCM).getAllKeys());
    const ids = new Set<string>();
    for (const k of keys ?? []) if (Array.isArray(k) && typeof k[0] === 'string' && !keep.has(k[0])) ids.add(k[0]);
    const infos = await this.transact<IDBValidKey[]>('readonly', [PCM_INFO], (tx) => tx.objectStore(PCM_INFO).getAllKeys());
    for (const k of infos ?? []) if (typeof k === 'string' && !keep.has(k)) ids.add(k);
    await this.deleteTrackAudio([...ids]);
  }

  async trackAudioUsage(): Promise<{ bytes: number; ids: string[] }> {
    const infos = await this.transact<PcmInfo[]>('readonly', [PCM_INFO], (tx) => tx.objectStore(PCM_INFO).getAll());
    const keys = await this.transact<IDBValidKey[]>('readonly', [PCM_INFO], (tx) => tx.objectStore(PCM_INFO).getAllKeys());
    const bytes = (infos ?? []).reduce((n, i) => n + (typeof i?.bytes === 'number' ? i.bytes : 0), 0);
    return { bytes, ids: (keys ?? []).filter((k): k is string => typeof k === 'string') };
  }
}
