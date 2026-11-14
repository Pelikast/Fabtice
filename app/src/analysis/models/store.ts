// Where the downloaded analysis tools are kept on the device.
//
// IndexedDB, in a database of its own (`fabtice-analysis-tools`). Chosen over
// the Cache Storage the prototype used because it is the one store that works
// the same in every context the app runs in: http(s) pages (dev server,
// Netlify, localhost) and the Mac app's `fabtice://app` origin, in a page and
// in a worker, in Chrome, Safari and Firefox. The Cache Storage keys requests
// by URL and refuses non-http(s) schemes for the request, and its availability
// on a custom scheme depends on the engine; IndexedDB needs nothing but the
// origin (the app's own storage already relies on it in the Mac app).
//
// Two kinds of records:
//   - `files`: a complete model, checked against its SHA-256 when it was
//     stored (and checked again each time it is loaded);
//   - `parts`: the pieces of a download in progress, in order, so that a
//     download interrupted by the network or by a closed page resumes where
//     it stopped.
//
// If IndexedDB cannot be used (blocked storage, private window), the analysis
// still works: it keeps the files in memory for this page and downloads them
// again next time.

export interface StoredFile {
  id: string;
  bytes: number;
  sha256: string;
  data: ArrayBuffer;
}

export interface ModelStore {
  /** A complete file, or null. */
  getFile(id: string): Promise<StoredFile | null>;
  /** Whether a complete file of exactly this size and digest is stored (nothing is read back). */
  hasFile(id: string, bytes: number, sha256: string): Promise<boolean>;
  putFile(file: StoredFile): Promise<void>;
  deleteFile(id: string): Promise<void>;
  /** The pieces of an interrupted download, in order. */
  readParts(id: string): Promise<ArrayBuffer[]>;
  putPart(id: string, index: number, data: ArrayBuffer): Promise<void>;
  clearParts(id: string): Promise<void>;
  /** Removes every file and every part (diagnostics, tests). */
  clearAll(): Promise<void>;
  /** The complete files kept, with their size (nothing is read back). */
  listFiles(): Promise<{ id: string; bytes: number }[]>;
}

/** Memory only: the fallback, and what the unit tests use. */
export class MemoryModelStore implements ModelStore {
  readonly files = new Map<string, StoredFile>();
  readonly parts = new Map<string, ArrayBuffer[]>();
  async getFile(id: string) {
    return this.files.get(id) ?? null;
  }
  async hasFile(id: string, bytes: number, sha256: string) {
    const f = this.files.get(id);
    return !!f && f.bytes === bytes && f.sha256 === sha256;
  }
  async putFile(file: StoredFile) {
    this.files.set(file.id, file);
  }
  async deleteFile(id: string) {
    this.files.delete(id);
  }
  async readParts(id: string) {
    const out: ArrayBuffer[] = [];
    for (const part of this.parts.get(id) ?? []) {
      if (!part) break; // only an unbroken run from the first is usable
      out.push(part);
    }
    return out;
  }
  async putPart(id: string, index: number, data: ArrayBuffer) {
    const list = this.parts.get(id) ?? [];
    list[index] = data;
    this.parts.set(id, list);
  }
  async clearParts(id: string) {
    this.parts.delete(id);
  }
  async clearAll() {
    this.files.clear();
    this.parts.clear();
  }
  async listFiles() {
    return [...this.files.values()].map((f) => ({ id: f.id, bytes: f.bytes }));
  }
}

/** The analysis tools' database. The separation tools have their own (`separation/index.ts#SEPARATION_TOOLS_DB`), same layout. */
export const ANALYSIS_TOOLS_DB = 'fabtice-analysis-tools';
const DB_VERSION = 1;

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

interface PartRecord {
  id: string;
  index: number;
  data: ArrayBuffer;
}

export interface ModelStoreOptions {
  /**
   * Keep each complete file as a `Blob` (the separation tools, up to 353 MB):
   * the browser keeps its bytes on disk, so checking that a file is there, or
   * listing the files, never reads it into memory; only `getFile` does.
   * Off for the analysis tools (small, kept as they always were).
   */
  blobs?: boolean;
}

/** A stored record: the bytes as an ArrayBuffer, or as a Blob (`ModelStoreOptions.blobs`). */
interface FileRecord {
  id: string;
  bytes: number;
  sha256: string;
  data: ArrayBuffer | Blob;
}

const recordBytes = (data: unknown): number => (data instanceof ArrayBuffer ? data.byteLength : typeof Blob !== 'undefined' && data instanceof Blob ? data.size : -1);

export class IdbModelStore implements ModelStore {
  private opening: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly dbName: string = ANALYSIS_TOOLS_DB,
    private readonly options: ModelStoreOptions = {},
  ) {}

  private db(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = this.factory.open(this.dbName, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('parts')) db.createObjectStore('parts', { keyPath: ['id', 'index'] });
      };
      open.onsuccess = () => {
        const db = open.result;
        // Another tab upgrading or the browser closing the connection: reopen next time.
        db.onclose = () => (this.opening = null);
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        resolve(db);
      };
      open.onerror = () => reject(open.error ?? new Error('IndexedDB cannot be opened'));
      open.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    this.opening.catch(() => (this.opening = null));
    return this.opening;
  }

  async getFile(id: string): Promise<StoredFile | null> {
    const db = await this.db();
    const rec = (await wrap(db.transaction('files').objectStore('files').get(id))) as FileRecord | undefined;
    if (!rec) return null;
    if (rec.data instanceof ArrayBuffer) return rec as StoredFile;
    if (typeof Blob !== 'undefined' && rec.data instanceof Blob) return { id: rec.id, bytes: rec.bytes, sha256: rec.sha256, data: await rec.data.arrayBuffer() };
    return null;
  }

  async hasFile(id: string, bytes: number, sha256: string): Promise<boolean> {
    const db = await this.db();
    const rec = (await wrap(db.transaction('files').objectStore('files').get(id))) as FileRecord | undefined;
    return !!rec && rec.bytes === bytes && rec.sha256 === sha256 && recordBytes(rec.data) === bytes;
  }

  async putFile(file: StoredFile): Promise<void> {
    const db = await this.db();
    const record: FileRecord = this.options.blobs ? { ...file, data: new Blob([file.data]) } : file;
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(record);
    await done(tx);
  }

  async listFiles(): Promise<{ id: string; bytes: number }[]> {
    const db = await this.db();
    const all = (await wrap(db.transaction('files').objectStore('files').getAll())) as FileRecord[];
    return all.filter((r) => recordBytes(r.data) === r.bytes).map((r) => ({ id: r.id, bytes: r.bytes }));
  }

  async deleteFile(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    await done(tx);
  }

  async readParts(id: string): Promise<ArrayBuffer[]> {
    const db = await this.db();
    const all = (await wrap(db.transaction('parts').objectStore('parts').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])))) as PartRecord[];
    // Only an unbroken run from 0 is usable.
    const out: ArrayBuffer[] = [];
    for (const rec of all.sort((a, b) => a.index - b.index)) {
      if (rec.index !== out.length || !(rec.data instanceof ArrayBuffer)) break;
      out.push(rec.data);
    }
    return out;
  }

  async putPart(id: string, index: number, data: ArrayBuffer): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('parts', 'readwrite');
    tx.objectStore('parts').put({ id, index, data } satisfies PartRecord);
    await done(tx);
  }

  async clearParts(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('parts', 'readwrite');
    tx.objectStore('parts').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    await done(tx);
  }

  async clearAll(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['files', 'parts'], 'readwrite');
    tx.objectStore('files').clear();
    tx.objectStore('parts').clear();
    await done(tx);
  }
}

/**
 * The store to use here: IndexedDB when it works (checked by really opening
 * it), memory otherwise. The memory fallback is shared by the whole page.
 */
const shared = new Map<string, ModelStore>();
const fallbacks = new Map<string, MemoryModelStore>();

/**
 * The store of one family of tools (`dbName`: the analysis tools by default;
 * the separation tools pass `SEPARATION_TOOLS_DB`): one database each, so
 * that each family's room can be shown and freed on its own.
 */
export async function openModelStore(dbName: string = ANALYSIS_TOOLS_DB, options: ModelStoreOptions = {}): Promise<ModelStore> {
  const known = shared.get(dbName);
  if (known) return known;
  let store: ModelStore;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    const idb = new IdbModelStore(indexedDB, dbName, options);
    await idb.hasFile('probe', 0, ''); // opens the database
    store = idb;
  } catch {
    store = fallbacks.get(dbName) ?? new MemoryModelStore();
    fallbacks.set(dbName, store as MemoryModelStore);
  }
  shared.set(dbName, store);
  return store;
}

/** For tests: forget the store chosen so far. */
export function resetModelStore(next: ModelStore | null = null, dbName: string = ANALYSIS_TOOLS_DB): void {
  if (next) shared.set(dbName, next);
  else shared.delete(dbName);
}
