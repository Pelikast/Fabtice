// The library of known charts: download (official page, forum thread with attachments, login page,
// too few tunes, order of the pages, abort), what is kept, lookup by title, file import, and the
// memory fallback when IndexedDB is not available. Fake pages only (`testFixtures.ts`).

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateCollectionList, type CollectionList } from './collections';
import {
  canReadPage,
  downloadCollections,
  findStandard,
  importStandardsFile,
  isDownloadable,
  pickPlaylists,
  readablePages,
  removeStandards,
  resetLibraryCache,
  standardsStatus,
  textFetcher,
  type DownloadProgress,
  type Environment,
  type TextFetcher,
} from './library';
import { IdbCollectionStore, MemoryCollectionStore, openCollectionStore, resetCollectionStore, type CollectionStore } from './libraryStore';
import { forumPage, link, LOGIN_PAGE, officialPage, playlistFile, tunes } from './testFixtures';

const OFFICIAL = 'https://www.irealpro.com/main-playlists/';
const FORUM = 'https://forums.irealpro.com/threads/1/';
const ATTACH = 'https://forums.irealpro.com/attachments/jazz-html.5/';
const MIRROR = 'https://raw.githubusercontent.com/o/r/0123456789abcdef0123456789abcdef01234567/jazz.txt';

const page = (url: string, role: 'official' | 'forum' | 'mirror', follow = false) => ({
  url,
  kind: role === 'mirror' ? 'ireal-url-file' : 'html-with-ireal-links',
  role,
  host: role === 'mirror' ? 'GitHub' : role === 'official' ? 'irealpro.com' : 'forum',
  verified: false,
  followAttachments: follow,
  note: 'n',
});

const SPEC = {
  summary: 'Une phrase.',
  licence: 'l',
  licenceUnclear: true,
  genres: [],
  recommended: true,
  sourcePage: OFFICIAL,
};

function makeList(): CollectionList {
  return validateCollectionList({
    version: 1,
    updated: '2026-11-15',
    collections: [
      { ...SPEC, id: 'jazz', name: 'Jazz', tunes: 10, minTunes: 8, playlistName: 'Jazz 10', pages: [page(OFFICIAL, 'official'), page(FORUM, 'forum', true), page(MIRROR, 'mirror')] },
      { ...SPEC, id: 'latin', name: 'Latin', tunes: 5, minTunes: 4, playlistName: 'Latin 5', pages: [page(OFFICIAL, 'official'), page(FORUM, 'forum', true)] },
      { ...SPEC, id: 'trad', name: 'Trad', tunes: null, minTunes: 3, playlistName: null, pages: [page(FORUM, 'forum', true)] },
    ],
  });
}

/** A fetcher over a table of pages; an `Error` value (or a missing entry) fails. Records the calls. */
function fakeFetch(pages: Record<string, string | Error>) {
  const calls: string[] = [];
  const fetchText: TextFetcher = async (url) => {
    calls.push(url);
    const v = pages[url];
    if (v === undefined) throw new Error('HTTP 404');
    if (v instanceof Error) throw v;
    return v;
  };
  return { fetchText, calls };
}

const MAC: Environment = { bridge: { standardsFetchText: async () => ({ ok: false, error: 'network' }) }, fetchFn: null };
const WEB: Environment = { bridge: null, fetchFn: (async () => new Response('')) as typeof fetch };

const jazzSongs = [...tunes(9, 'Jazz Tune'), { title: 'Autumn Leaves', composer: 'Kosma Joseph' }];
const jazzPlaylist = { name: 'Jazz 10', songs: jazzSongs };
const latinPlaylist = { name: 'Latin 5', songs: tunes(5, 'Latin Tune') };

let store: CollectionStore;
beforeEach(() => {
  store = new MemoryCollectionStore();
  resetCollectionStore(store);
  resetLibraryCache();
});

describe('where a page can be read', () => {
  it('reads every page in the Mac app, only the GitHub copies on the web', () => {
    const [jazz, latin] = makeList().collections;
    expect(readablePages(jazz!, MAC).map((p) => p.url)).toEqual([OFFICIAL, FORUM, MIRROR]);
    expect(readablePages(jazz!, WEB).map((p) => p.url)).toEqual([MIRROR]);
    expect(isDownloadable(latin!, MAC)).toBe(true);
    expect(isDownloadable(latin!, WEB)).toBe(false);
    expect(canReadPage({ url: OFFICIAL }, { bridge: null, fetchFn: null })).toBe(false);
    expect(canReadPage({ url: MIRROR }, { bridge: null, fetchFn: null })).toBe(false);
  });
});

describe('picking playlists from a text', () => {
  it('keeps the named playlist as its raw link, and nothing when it is too short', () => {
    const html = officialPage([jazzPlaylist, latinPlaylist]);
    const spec = makeList().collections[0]!;
    const picked = pickPlaylists(spec, html)!;
    expect(picked.tunes).toBe(10);
    expect(picked.links).toEqual([link(jazzSongs, 'Jazz 10')]);
    expect(pickPlaylists({ ...spec, minTunes: 11 }, html)).toBeNull();
    expect(pickPlaylists(spec, LOGIN_PAGE)).toBeNull();
    expect(pickPlaylists(spec, '')).toBeNull();
  });
});

describe('downloadCollections', () => {
  it('keeps what an official page holds, fetching a shared page once, and reports progress', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist, latinPlaylist]) });
    const seen: DownloadProgress[] = [];
    const r = await downloadCollections(['jazz', 'latin'], { list: makeList(), env: MAC, fetchText: f.fetchText, store, onProgress: (p) => seen.push(p), now: () => new Date('2026-11-15T10:00:00Z') });
    expect(r.cancelled).toBe(false);
    expect(r.tunes).toBe(15);
    expect(r.outcomes.map((o) => [o.id, o.state, o.tunes, o.host])).toEqual([['jazz', 'kept', 10, 'irealpro.com'], ['latin', 'kept', 5, 'irealpro.com']]);
    expect(f.calls).toEqual([OFFICIAL]);
    expect(seen[0]!.rows.map((x) => x.state)).toEqual(['waiting', 'waiting']);
    expect(seen[0]!.fraction).toBe(0);
    expect(seen.at(-1)!.fraction).toBe(1);
    expect(seen.some((p) => p.rows[0]!.state === 'fetching' && p.rows[0]!.host === 'irealpro.com')).toBe(true);
    const status = await standardsStatus(store);
    expect(status.total).toBe(15);
    expect(status.persistent).toBe(false);
    expect(status.collections.map((c) => [c.id, c.tunes, c.source, c.date])).toEqual([['jazz', 10, OFFICIAL, '2026-11-15T10:00:00.000Z'], ['latin', 5, OFFICIAL, '2026-11-15T10:00:00.000Z']]);
  });

  it('follows the attached file of a forum thread, one level', async () => {
    const f = fakeFetch({ [OFFICIAL]: LOGIN_PAGE, [FORUM]: forumPage(['/attachments/jazz-html.5/', '/attachments/other.6/']), [ATTACH]: playlistFile(jazzSongs, 'Jazz 10') });
    const r = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(r.outcomes[0]).toMatchObject({ state: 'kept', tunes: 10, host: 'forum' });
    expect(f.calls).toEqual([OFFICIAL, FORUM, ATTACH]);
    expect((await standardsStatus(store)).collections[0]!.source).toBe(ATTACH);
  });

  it('does not follow an attachment of an attachment, and skips a missing attachment', async () => {
    const f = fakeFetch({
      [FORUM]: forumPage(['/attachments/gone.1/', '/attachments/jazz-html.5/']),
      [ATTACH]: forumPage(['/attachments/deeper.9/']),
      'https://forums.irealpro.com/attachments/deeper.9/': playlistFile(jazzSongs, 'Jazz 10'),
    });
    const r = await downloadCollections(['trad'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(r.outcomes[0]).toMatchObject({ state: 'failed', reason: 'not-found' });
    expect(f.calls).not.toContain('https://forums.irealpro.com/attachments/deeper.9/');
  });

  it('falls through a login page, a page without a link and a too short playlist to the next page, in order', async () => {
    const f = fakeFetch({ [OFFICIAL]: LOGIN_PAGE, [FORUM]: officialPage([{ name: 'Jazz 10', songs: tunes(3) }]), [MIRROR]: link(jazzSongs, 'Jazz 10') });
    const r = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(f.calls).toEqual([OFFICIAL, FORUM, MIRROR]);
    expect(r.outcomes[0]).toMatchObject({ state: 'kept', tunes: 10, host: 'GitHub' });
  });

  it('falls through a page that fails to load', async () => {
    const f = fakeFetch({ [OFFICIAL]: new Error('network'), [FORUM]: new Error('HTTP 403'), [MIRROR]: link(jazzSongs, 'Jazz 10') });
    const r = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(r.outcomes[0]!.state).toBe('kept');
  });

  it('stops at the first page that works', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]), [MIRROR]: link(jazzSongs, 'Jazz 10') });
    await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(f.calls).toEqual([OFFICIAL]);
  });

  it('says plainly what failed, and still keeps the others', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]) });
    const r = await downloadCollections(['jazz', 'latin', 'trad'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(r.outcomes.map((o) => [o.id, o.state, o.reason])).toEqual([['jazz', 'kept', null], ['latin', 'failed', 'not-found'], ['trad', 'failed', 'not-found']]);
    expect(r.tunes).toBe(10);
    expect((await standardsStatus(store)).collections.map((c) => c.id)).toEqual(['jazz']);
  });

  it('on the web reads only the GitHub copy and asks for a file for the others', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]), [MIRROR]: link(jazzSongs, 'Jazz 10') });
    const r = await downloadCollections(['jazz', 'latin'], { list: makeList(), env: WEB, fetchText: f.fetchText, store });
    expect(f.calls).toEqual([MIRROR]);
    expect(r.outcomes.map((o) => [o.id, o.state, o.reason])).toEqual([['jazz', 'kept', null], ['latin', 'failed', 'file-needed']]);
  });

  it('ignores unknown ids and handles an empty request', async () => {
    const f = fakeFetch({});
    expect((await downloadCollections(['nope'], { list: makeList(), env: MAC, fetchText: f.fetchText, store })).outcomes).toEqual([]);
    expect((await downloadCollections([], { list: makeList(), env: MAC, fetchText: f.fetchText, store })).cancelled).toBe(false);
  });

  it('stops on abort, keeps what is already kept and marks the rest cancelled', async () => {
    const abort = new AbortController();
    const calls: string[] = [];
    const fetchText: TextFetcher = async (url, signal) => {
      calls.push(url);
      if (url === OFFICIAL) return officialPage([jazzPlaylist]);
      abort.abort();
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      throw new Error('unexpected');
    };
    const r = await downloadCollections(['jazz', 'latin', 'trad'], { list: makeList(), env: MAC, fetchText, store, signal: abort.signal });
    // `jazz` is kept from the official page; `latin` then asks the forum, which aborts.
    expect(r.cancelled).toBe(true);
    expect(r.outcomes.map((o) => [o.id, o.state])).toEqual([['jazz', 'kept'], ['latin', 'cancelled'], ['trad', 'cancelled']]);
    expect((await standardsStatus(store)).collections.map((c) => c.id)).toEqual(['jazz']);
    // Already aborted before the start: nothing is fetched.
    const before = calls.length;
    const again = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText, store, signal: abort.signal });
    expect(again.cancelled).toBe(true);
    expect(calls.length).toBe(before);
  });

  it('replaces a collection already kept', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]) });
    await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect((await standardsStatus(store)).collections).toHaveLength(1);
  });
});

describe('the web fetcher', () => {
  it('reads a text with no credentials, and fails on an HTTP error or a huge file', async () => {
    const seen: RequestInit[] = [];
    const ok = textFetcher({ bridge: null, fetchFn: (async (_u: unknown, init: RequestInit) => (seen.push(init), new Response('hello'))) as typeof fetch });
    expect(await ok(MIRROR)).toBe('hello');
    expect(seen[0]!.credentials).toBe('omit');
    const missing = textFetcher({ bridge: null, fetchFn: (async () => new Response('x', { status: 404 })) as typeof fetch });
    await expect(missing(MIRROR)).rejects.toThrow('HTTP 404');
    const huge = textFetcher({ bridge: null, fetchFn: (async () => new Response('x', { headers: { 'content-length': String(26 * 1024 * 1024) } })) as typeof fetch });
    await expect(huge(MIRROR)).rejects.toThrow('too large');
    const nothing = textFetcher({ bridge: null, fetchFn: null });
    await expect(nothing(MIRROR)).rejects.toThrow();
  });

  it('goes through the bridge in the Mac app and turns its typed errors into rejections', async () => {
    const asked: string[] = [];
    const mac = textFetcher({
      bridge: { standardsFetchText: async (u) => (asked.push(u), u === MIRROR ? { ok: true, text: 'from the bridge', url: u, bytes: 15 } : { ok: false, error: 'host-not-allowed' }) },
      fetchFn: null,
    });
    expect(await mac(MIRROR)).toBe('from the bridge');
    await expect(mac('https://evil.example/')).rejects.toThrow('host-not-allowed');
    expect(asked).toHaveLength(2);
  });
});

describe('what is kept, and finding a chart by title', () => {
  async function keepJazz() {
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist, latinPlaylist]) });
    await downloadCollections(['jazz', 'latin'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
  }

  it('finds a chart from a noisy video title, with its collection', async () => {
    await keepJazz();
    const found = await findStandard('Bill Evans - Autumn Leaves (1959) [Remastered]', { store });
    expect(found).toHaveLength(1);
    expect(found[0]!.chart.title).toBe('Autumn Leaves');
    expect(found[0]!.chart.bars.length).toBeGreaterThan(0);
    expect(found[0]!.collectionId).toBe('jazz');
    expect(found[0]!.score).toBeGreaterThanOrEqual(0.88);
    expect(await findStandard('Something Entirely Different', { store })).toEqual([]);
  });

  it('rebuilds its index when the library changes', async () => {
    expect(await findStandard('Autumn Leaves', { store })).toEqual([]);
    await keepJazz();
    expect(await findStandard('Autumn Leaves', { store })).toHaveLength(1);
    await removeStandards(['jazz'], store);
    expect(await findStandard('Autumn Leaves', { store })).toEqual([]);
    expect((await standardsStatus(store)).collections.map((c) => c.id)).toEqual(['latin']);
    await removeStandards(undefined, store);
    expect((await standardsStatus(store)).total).toBe(0);
  });

  it('keeps one chart when two collections hold the same tune', async () => {
    const dup = { name: 'Latin 5', songs: [...tunes(4, 'Latin Tune'), { title: 'Autumn Leaves', composer: 'Kosma Joseph' }] };
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist, dup]) });
    await downloadCollections(['jazz', 'latin'], { list: makeList(), env: MAC, fetchText: f.fetchText, store });
    expect(await findStandard('Autumn Leaves', { store })).toHaveLength(1);
  });

  it('works through the default store too (the shared one)', async () => {
    await keepJazz();
    expect(await findStandard('Autumn Leaves')).toHaveLength(1);
  });
});

describe('importStandardsFile', () => {
  const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text });

  it('keeps a known collection under its own id and the rest under the file name', async () => {
    const text = officialPage([jazzPlaylist, { name: 'My Own List', songs: tunes(2, 'Own') }]);
    const r = await importStandardsFile(file('export.html', text), { list: makeList(), store });
    expect(r).toEqual({
      ok: true,
      tunes: 12,
      added: [
        { id: 'jazz', name: 'Jazz', tunes: 10 },
        { id: 'file:export.html', name: 'My Own List', tunes: 2 },
      ],
    });
    const status = await standardsStatus(store);
    expect(status.collections.map((c) => [c.id, c.fromFile])).toEqual([['jazz', true], ['file:export.html', true]]);
    expect(await findStandard('Own 2', { store })).toHaveLength(1);
  });

  it('refuses what holds no chart, a file too large, and an unreadable file', async () => {
    expect(await importStandardsFile(file('page.html', LOGIN_PAGE), { list: makeList(), store })).toEqual({ ok: false, reason: 'no-chart' });
    expect(await importStandardsFile(file('empty.txt', ''), { list: makeList(), store })).toEqual({ ok: false, reason: 'no-chart' });
    expect(await importStandardsFile(file('big.html', 'x', 26 * 1024 * 1024), { list: makeList(), store })).toEqual({ ok: false, reason: 'too-large' });
    const broken = { name: 'x.html', size: 3, text: async () => Promise.reject(new Error('read')) };
    expect(await importStandardsFile(broken, { list: makeList(), store })).toEqual({ ok: false, reason: 'unreadable' });
    expect((await standardsStatus(store)).total).toBe(0);
  });

  it('keeps a single link file (what iReal Pro exports)', async () => {
    const r = await importStandardsFile(file('list.txt', link(tunes(3, 'Solo'), 'Little List')), { list: makeList(), store });
    expect(r).toMatchObject({ ok: true, tunes: 3 });
  });
});

describe('the stores', () => {
  it('IndexedDB: keeps records across stores of the same database, and reports itself persistent', async () => {
    const factory = new IDBFactory();
    const a = new IdbCollectionStore(factory, 'test-standards');
    const rec = { id: 'jazz', name: 'Jazz', tunes: 1, source: 's', date: 'd', links: 'irealb://x' };
    await a.put(rec);
    expect(a.persistent).toBe(true);
    const b = new IdbCollectionStore(factory, 'test-standards'); // « after a reload »
    expect(await b.list()).toEqual([rec]);
    await b.delete('jazz');
    expect(await a.list()).toEqual([]);
    await a.put(rec);
    await a.clear();
    expect(await b.list()).toEqual([]);
  });

  it('falls back on memory when IndexedDB is not available, and the library still works', async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error simulating a browser with no IndexedDB
    delete globalThis.indexedDB;
    try {
      resetCollectionStore(null);
      const s = await openCollectionStore();
      expect(s.persistent).toBe(false);
      const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]) });
      const r = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText });
      expect(r.tunes).toBe(10);
      const status = await standardsStatus();
      expect(status).toMatchObject({ total: 10, persistent: false });
      expect(await findStandard('Autumn Leaves')).toHaveLength(1);
    } finally {
      globalThis.indexedDB = saved;
      resetCollectionStore(null);
    }
  });

  it('falls back on memory when opening the database fails', async () => {
    const saved = globalThis.indexedDB;
    globalThis.indexedDB = { open: () => { throw new Error('blocked'); } } as unknown as IDBFactory;
    try {
      resetCollectionStore(null);
      expect((await openCollectionStore()).persistent).toBe(false);
    } finally {
      globalThis.indexedDB = saved;
      resetCollectionStore(null);
    }
  });

  it('a failing store never throws out of the status or the lookup', async () => {
    const broken: CollectionStore = {
      persistent: true,
      list: async () => { throw new Error('boom'); },
      put: async () => { throw new Error('boom'); },
      delete: async () => {},
      clear: async () => {},
    };
    expect(await standardsStatus(broken)).toEqual({ collections: [], total: 0, persistent: true });
    expect(await findStandard('Autumn Leaves', { store: broken })).toEqual([]);
    const f = fakeFetch({ [OFFICIAL]: officialPage([jazzPlaylist]) });
    const r = await downloadCollections(['jazz'], { list: makeList(), env: MAC, fetchText: f.fetchText, store: broken });
    expect(r.outcomes[0]).toMatchObject({ state: 'failed' });
  });
});
