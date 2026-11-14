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
    return [...(this.parts.get(id) ?? [])];
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
}

const DB_NAME = 'fabtice-analysis-tools';
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

export class IdbModelStore implements ModelStore {
  private opening: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = this.factory.open(DB_NAME, DB_VERSION);
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
    const rec = (await wrap(db.transaction('files').objectStore('files').get(id))) as StoredFile | undefined;
    return rec && rec.data instanceof ArrayBuffer ? rec : null;
  }

  async hasFile(id: string, bytes: number, sha256: string): Promise<boolean> {
    const db = await this.db();
    const rec = (await wrap(db.transaction('files').objectStore('files').get(id))) as StoredFile | undefined;
    return !!rec && rec.bytes === bytes && rec.sha256 === sha256 && rec.data instanceof ArrayBuffer && rec.data.byteLength === bytes;
  }

  async putFile(file: StoredFile): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(file);
    await done(tx);
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
let shared: ModelStore | null = null;
const fallback = new MemoryModelStore();

export async function openModelStore(): Promise<ModelStore> {
  if (shared) return shared;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    const idb = new IdbModelStore();
    await idb.hasFile('probe', 0, ''); // opens the database
    shared = idb;
  } catch {
    shared = fallback;
  }
  return shared;
}

/** For tests: forget the store chosen so far. */
export function resetModelStore(next: ModelStore | null = null): void {
  shared = next;
}
