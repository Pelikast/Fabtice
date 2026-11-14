// What the device keeps of the analysis tools: files, pieces of downloads in
// progress, and the fall back to memory when IndexedDB cannot be used.

import 'fake-indexeddb/auto'; // the globals IndexedDB code expects (IDBKeyRange…)
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IdbModelStore, MemoryModelStore, openModelStore, resetModelStore, type ModelStore } from './store';

const buf = (...values: number[]) => Uint8Array.from(values).buffer as ArrayBuffer;

function suite(name: string, make: () => ModelStore) {
  describe(name, () => {
    it('keeps a complete file and says whether a given size and digest is there', async () => {
      const s = make();
      expect(await s.getFile('a')).toBeNull();
      await s.putFile({ id: 'a', bytes: 3, sha256: 'abc', data: buf(1, 2, 3) });
      expect(await s.hasFile('a', 3, 'abc')).toBe(true);
      expect(await s.hasFile('a', 4, 'abc')).toBe(false);
      expect(await s.hasFile('a', 3, 'other')).toBe(false);
      expect(await s.hasFile('b', 3, 'abc')).toBe(false);
      expect(Array.from(new Uint8Array((await s.getFile('a'))!.data))).toEqual([1, 2, 3]);
      await s.deleteFile('a');
      expect(await s.getFile('a')).toBeNull();
    });

    it('keeps the pieces of a download in order, per file, and clears them', async () => {
      const s = make();
      await s.putPart('a', 1, buf(3, 4));
      await s.putPart('a', 0, buf(1, 2));
      await s.putPart('b', 0, buf(9));
      expect((await s.readParts('a')).map((p) => Array.from(new Uint8Array(p)))).toEqual([[1, 2], [3, 4]]);
      expect((await s.readParts('b')).length).toBe(1);
      await s.clearParts('a');
      expect(await s.readParts('a')).toEqual([]);
      expect((await s.readParts('b')).length).toBe(1);
    });

    it('only trusts an unbroken run of pieces from the first', async () => {
      const s = make();
      await s.putPart('a', 0, buf(1));
      await s.putPart('a', 2, buf(3)); // 1 is missing
      expect((await s.readParts('a')).length).toBe(1);
    });

    it('forgets everything on demand', async () => {
      const s = make();
      await s.putFile({ id: 'a', bytes: 1, sha256: 'x', data: buf(1) });
      await s.putPart('b', 0, buf(1));
      await s.clearAll();
      expect(await s.getFile('a')).toBeNull();
      expect(await s.readParts('b')).toEqual([]);
    });

    it('lists the complete files and their size', async () => {
      const s = make();
      await s.putFile({ id: 'a', bytes: 3, sha256: 'x', data: buf(1, 2, 3) });
      await s.putFile({ id: 'b', bytes: 1, sha256: 'y', data: buf(4) });
      await s.putPart('c', 0, buf(1));
      expect((await s.listFiles()).sort((p, q) => p.id.localeCompare(q.id))).toEqual([
        { id: 'a', bytes: 3 },
        { id: 'b', bytes: 1 },
      ]);
    });
  });
}

suite('the memory store', () => new MemoryModelStore());
suite('the IndexedDB store', () => new IdbModelStore(new IDBFactory()));
// The separation tools (up to 353 MB) are kept as Blobs: checked and listed without reading them back.
suite('the IndexedDB store, files kept as Blobs', () => new IdbModelStore(new IDBFactory(), 'blobs', { blobs: true }));

describe('the IndexedDB store, across page loads', () => {
  it('finds again on the same database what an earlier instance kept', async () => {
    const factory = new IDBFactory();
    await new IdbModelStore(factory).putFile({ id: 'a', bytes: 2, sha256: 'x', data: buf(7, 8) });
    await new IdbModelStore(factory).putPart('b', 0, buf(5));
    const later = new IdbModelStore(factory);
    expect(await later.hasFile('a', 2, 'x')).toBe(true);
    expect((await later.readParts('b')).length).toBe(1);
  });

  it('does not take a record that lost its bytes for a kept file', async () => {
    const factory = new IDBFactory();
    const s = new IdbModelStore(factory);
    await s.putFile({ id: 'a', bytes: 5, sha256: 'x', data: buf(1, 2) }); // 2 bytes where 5 are announced
    expect(await s.hasFile('a', 5, 'x')).toBe(false);
  });
});

describe('openModelStore', () => {
  it('uses IndexedDB when it works', async () => {
    resetModelStore();
    const g = globalThis as { indexedDB?: IDBFactory };
    const before = g.indexedDB;
    g.indexedDB = new IDBFactory();
    try {
      expect(await openModelStore()).toBeInstanceOf(IdbModelStore);
    } finally {
      g.indexedDB = before;
      resetModelStore();
    }
  });

  it('falls back to memory (shared) when IndexedDB is missing or fails', async () => {
    resetModelStore();
    const g = globalThis as { indexedDB?: unknown };
    const before = g.indexedDB;
    g.indexedDB = undefined;
    try {
      const first = await openModelStore();
      expect(first).toBeInstanceOf(MemoryModelStore);
      await first.putFile({ id: 'a', bytes: 1, sha256: 'x', data: buf(1) });
      resetModelStore();
      g.indexedDB = {
        open() {
          throw new Error('blocked');
        },
      };
      const second = await openModelStore();
      expect(second).toBeInstanceOf(MemoryModelStore);
      expect(await second.hasFile('a', 1, 'x')).toBe(true); // the same memory
    } finally {
      g.indexedDB = before;
      resetModelStore();
    }
  });
});
