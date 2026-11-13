import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { sampleDocument } from '../test/sampleDocument';
import { DB_NAME, IndexedDbStorage } from './indexedDb';
import { StorageError, type StoredAudio } from './ProjectStorage';

const audio = (bytes: number[], fileName = 'a.mp3'): StoredAudio => ({ bytes: new Uint8Array(bytes).buffer, mimeType: 'audio/mpeg', fileName });

function fresh() {
  const factory = new IDBFactory();
  return { factory, storage: new IndexedDbStorage(factory, undefined) };
}

/** Puts raw records where the storage keeps them, to simulate other versions and damage. */
function poke(factory: IDBFactory, store: 'project' | 'audio', key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, 1);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof StorageError ? e.code : 'other';
  }
  return 'no error';
}

describe('IndexedDB project storage', () => {
  it('is available, and empty at first', async () => {
    const { storage } = fresh();
    expect(await storage.isAvailable()).toBe(true);
    expect(await storage.loadCurrent()).toBeNull();
    expect(await storage.loadAudio('audio-1')).toBeNull();
  });

  it('keeps a project: document and original bytes round-trip', async () => {
    const { storage } = fresh();
    const doc = sampleDocument();
    await storage.replaceCurrent(doc, new Map([['audio-1', audio([1, 2, 3, 250], 'Blues.mp3')]]));
    expect(await storage.loadCurrent()).toEqual(doc);
    const back = await storage.loadAudio('audio-1');
    expect(Array.from(new Uint8Array(back!.bytes))).toEqual([1, 2, 3, 250]);
    expect(back).toMatchObject({ mimeType: 'audio/mpeg', fileName: 'Blues.mp3' });
  });

  it('survives closing and reopening the database (a new launch)', async () => {
    const { factory, storage } = fresh();
    await storage.replaceCurrent(sampleDocument(), new Map([['audio-1', audio([7])]]));
    const reopened = new IndexedDbStorage(factory, undefined);
    expect((await reopened.loadCurrent())?.project.title).toBe('Blues du dimanche');
    expect(Array.from(new Uint8Array((await reopened.loadAudio('audio-1'))!.bytes))).toEqual([7]);
  });

  it('saveCurrent rewrites the document only', async () => {
    const { storage } = fresh();
    await storage.replaceCurrent(sampleDocument(), new Map([['audio-1', audio([1])]]));
    await storage.saveCurrent(sampleDocument({ playback: { semitones: -5, cents: 0, tempoRatio: 1, metronome: false } }));
    expect((await storage.loadCurrent())?.playback.semitones).toBe(-5);
    expect(await storage.loadAudio('audio-1')).not.toBeNull();
  });

  it('a new project replaces the previous one, audio included', async () => {
    const { storage } = fresh();
    await storage.replaceCurrent(sampleDocument(), new Map([['old-audio', audio([1])]]));
    const next = sampleDocument({ project: { ...sampleDocument().project, id: 'project-2', title: 'Autre' } });
    await storage.replaceCurrent(next, new Map([['new-audio', audio([2])]]));
    expect((await storage.loadCurrent())?.project.id).toBe('project-2');
    expect(await storage.loadAudio('old-audio')).toBeNull();
    expect(await storage.loadAudio('new-audio')).not.toBeNull();
  });

  it('replaceCurrent is all or nothing: a failing write leaves the previous project whole', async () => {
    const { storage } = fresh();
    await storage.replaceCurrent(sampleDocument(), new Map([['old-audio', audio([1])]]));
    // A function cannot be cloned: the transaction fails.
    const poison = { bytes: (() => {}) as unknown as ArrayBuffer, mimeType: '', fileName: '' };
    expect(await codeOf(storage.replaceCurrent(sampleDocument({ project: { ...sampleDocument().project, id: 'project-2' } }), new Map([['new-audio', poison]])))).toBe('io');
    expect((await storage.loadCurrent())?.project.id).toBe('project-1');
    expect(await storage.loadAudio('old-audio')).not.toBeNull();
    expect(await storage.loadAudio('new-audio')).toBeNull();
  });

  it('clearCurrent forgets everything', async () => {
    const { storage } = fresh();
    await storage.replaceCurrent(sampleDocument(), new Map([['audio-1', audio([1])]]));
    await storage.clearCurrent();
    expect(await storage.loadCurrent()).toBeNull();
    expect(await storage.loadAudio('audio-1')).toBeNull();
  });

  it('saveAudio stores one more audio', async () => {
    const { storage } = fresh();
    await storage.saveAudio('stem-1', audio([5, 6]));
    expect(Array.from(new Uint8Array((await storage.loadAudio('stem-1'))!.bytes))).toEqual([5, 6]);
  });

  it('ignores a record of a newer storage layout, reports an unreadable one', async () => {
    const { factory, storage } = fresh();
    await storage.isAvailable();
    await poke(factory, 'project', 'current', { schema: 2, document: { whatever: true } });
    expect(await storage.loadCurrent()).toBeNull();
    await poke(factory, 'project', 'current', 'garbage');
    expect(await codeOf(storage.loadCurrent())).toBe('corrupt');
    await poke(factory, 'project', 'current', { schema: 1, document: { version: 1, project: 3 } });
    expect(await codeOf(storage.loadCurrent())).toBe('corrupt');
  });

  it('ignores a document of a newer version', async () => {
    const { factory, storage } = fresh();
    await storage.isAvailable();
    await poke(factory, 'project', 'current', { schema: 1, document: { ...sampleDocument(), version: 7 } });
    expect(await storage.loadCurrent()).toBeNull();
  });

  it('reports an audio record that is not bytes', async () => {
    const { factory, storage } = fresh();
    await storage.isAvailable();
    await poke(factory, 'audio', 'x', { bytes: 'no' });
    expect(await codeOf(storage.loadAudio('x'))).toBe('corrupt');
  });

  it('without IndexedDB: unavailable, with a clear error code', async () => {
    const storage = new IndexedDbStorage(undefined, undefined);
    expect(await storage.isAvailable()).toBe(false);
    expect(await codeOf(storage.saveCurrent(sampleDocument()))).toBe('unavailable');
    expect(await codeOf(storage.loadCurrent())).toBe('unavailable');
  });

  it('a browser that refuses to open the database: unavailable', async () => {
    const refusing = {
      open() {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const storage = new IndexedDbStorage(refusing, undefined);
    expect(await storage.isAvailable()).toBe(false);
    expect(await codeOf(storage.replaceCurrent(sampleDocument(), new Map()))).toBe('unavailable');
  });

  it('a full disk is reported as « quota »', async () => {
    const { factory } = fresh();
    const storage = new IndexedDbStorage(factory, undefined);
    await storage.isAvailable();
    // Make the next put fail the way a full disk does.
    const real = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(await codeOf(storage.saveCurrent(sampleDocument()))).toBe('quota');
    } finally {
      IDBObjectStore.prototype.put = real;
    }
  });

  it('asks for persistent storage and reports the answer', async () => {
    let asked = 0;
    const manager = { persisted: async () => false, persist: async () => (asked++, true), estimate: async () => ({ usage: 10, quota: 1000 }) } as unknown as StorageManager;
    const storage = new IndexedDbStorage(new IDBFactory(), manager);
    expect(await storage.requestPersistence()).toBe(true);
    expect(asked).toBe(1);
    expect(await storage.estimate()).toEqual({ usage: 10, quota: 1000, persisted: false });
    expect(await new IndexedDbStorage(new IDBFactory(), undefined).requestPersistence()).toBe(false);
  });
});
