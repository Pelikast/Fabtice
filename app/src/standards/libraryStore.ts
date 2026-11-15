// Where the downloaded chart collections are kept on the device: a database of its own
// (`fabtice-standards`, same approach as the tools' databases in `analysis/models/store.ts`), one
// record per collection holding the RAW link text (the `irealb://…` links of the playlists kept,
// a few hundred kilobytes for the biggest) with its name, tune count, source and date. The charts
// are parsed on demand (`library.ts`): the reader takes about 150 ms for 1460 tunes.
//
// This is device data, not project data: nothing here goes into a `.fabtice` document.
// If IndexedDB cannot be used (blocked storage, private window) the library lives in memory for
// this page and the collections are downloaded again next time.

export interface StoredCollection {
  /** A collection id of `collections.json`, or `file:<name>` for a file the user imported. */
  id: string;
  name: string;
  /** Number of tunes in `links`. */
  tunes: number;
  /** Where it came from: the address of the page (`https://…`), or `file:<name>`. */
  source: string;
  /** ISO date of the download or the import. */
  date: string;
  /** The `irealb://` links of the playlists kept, one per line. */
  links: string;
}

export interface CollectionStore {
  /** True when the records survive a reload (IndexedDB); false for the memory fallback. */
  readonly persistent: boolean;
  list(): Promise<StoredCollection[]>;
  put(record: StoredCollection): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export const STANDARDS_DB = 'fabtice-standards';
const STORE = 'collections';
const DB_VERSION = 1;

export class MemoryCollectionStore implements CollectionStore {
  readonly persistent = false;
  private readonly records = new Map<string, StoredCollection>();
  async list() {
    return [...this.records.values()].map((r) => ({ ...r }));
  }
  async put(record: StoredCollection) {
    this.records.set(record.id, { ...record });
  }
  async delete(id: string) {
    this.records.delete(id);
  }
  async clear() {
    this.records.clear();
  }
}

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

const isRecord = (v: unknown): v is StoredCollection => {
  const r = v as Partial<StoredCollection> | null;
  return !!r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.tunes === 'number' && typeof r.source === 'string' && typeof r.date === 'string' && typeof r.links === 'string';
};

export class IdbCollectionStore implements CollectionStore {
  readonly persistent = true;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly dbName: string = STANDARDS_DB,
  ) {}

  private db(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = this.factory.open(this.dbName, DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      open.onsuccess = () => {
        const db = open.result;
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

  async list(): Promise<StoredCollection[]> {
    const db = await this.db();
    const all = (await wrap(db.transaction(STORE).objectStore(STORE).getAll())) as unknown[];
    return all.filter(isRecord);
  }

  async put(record: StoredCollection): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await done(tx);
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
  }
}

let shared: CollectionStore | null = null;
let fallback: MemoryCollectionStore | null = null;

/** IndexedDB when it works (checked by really opening it), memory otherwise; one store for the whole page. */
export async function openCollectionStore(): Promise<CollectionStore> {
  if (shared) return shared;
  let store: CollectionStore;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB');
    const idb = new IdbCollectionStore(indexedDB);
    await idb.list(); // opens the database
    store = idb;
  } catch {
    fallback ??= new MemoryCollectionStore();
    store = fallback;
  }
  shared = store;
  return store;
}

/** For tests: choose the store (or forget the one chosen so far with `null`). */
export function resetCollectionStore(next: CollectionStore | null = null): void {
  shared = next;
  if (next === null) fallback = null;
}
