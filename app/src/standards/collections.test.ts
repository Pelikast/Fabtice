import { describe, expect, it } from 'vitest';
import bundled from './collections.json';
import {
  bundledCollectionList,
  CollectionListError,
  COLLECTION_HOSTS,
  loadCollectionList,
  REMOTE_COLLECTION_LIST_URL,
  selectPlaylists,
  validateCollectionList,
  checkCollectionUrl,
} from './collections';

const clone = (): any => JSON.parse(JSON.stringify(bundled));

describe('the bundled list', () => {
  it('passes the strict check and offers what the owner asked for', () => {
    const list = bundledCollectionList();
    expect(list.version).toBe(1);
    expect(list.collections.length).toBeGreaterThanOrEqual(6);
    const ids = list.collections.map((c) => c.id);
    for (const id of ['jazz-1460', 'brazilian-220', 'latin-50', 'blues-50', 'dixieland-trad']) expect(ids).toContain(id);
    expect(list.collections.filter((c) => c.recommended).map((c) => c.id)).toEqual(expect.arrayContaining(['jazz-1460', 'brazilian-220', 'dixieland-trad']));
    for (const c of list.collections) {
      expect(c.pages.length).toBeGreaterThan(0);
      expect(c.summary.endsWith('.')).toBe(true);
      expect(c.licenceUnclear).toBe(true);
      expect(c.minTunes).toBeGreaterThan(0);
      if (c.tunes !== null) expect(c.minTunes).toBeLessThanOrEqual(c.tunes);
    }
  });

  it('holds no chart, only addresses: a few kilobytes and no iReal link', () => {
    const text = JSON.stringify(bundled);
    expect(text.length).toBeLessThan(20_000);
    expect(text).not.toMatch(/irealb(?:ook)?:\/\/\S/);
    expect(text).not.toMatch(/1r34LbKcu7/);
  });

  it('points to the official page first, then the forum, then copies; the unverified are marked so', () => {
    const jazz = bundledCollectionList().collections.find((c) => c.id === 'jazz-1460')!;
    expect(jazz.pages.map((p) => p.role)).toEqual(['official', 'forum', 'mirror']);
    expect(jazz.pages[0]!.url).toBe('https://www.irealpro.com/main-playlists/');
    expect(jazz.pages[0]!.verified).toBe(false);
    expect(jazz.pages[1]!.followAttachments).toBe(true);
    expect(jazz.pages[2]!.kind).toBe('ireal-url-file');
    expect(jazz.pages[2]!.verified).toBe(true);
    // every official or forum address is unverified from the sandbox that wrote the list
    for (const c of bundledCollectionList().collections) for (const p of c.pages) if (p.role !== 'mirror') expect(p.verified).toBe(false);
    for (const c of bundledCollectionList().collections) for (const p of c.pages) expect(COLLECTION_HOSTS).toContain(new URL(p.url).hostname);
  });
});

describe('the strict check', () => {
  const mutate = (change: (doc: any) => void): void => {
    const doc = clone();
    change(doc);
    expect(() => validateCollectionList(doc)).toThrow(CollectionListError);
  };

  it('refuses a document that is not the right shape', () => {
    expect(() => validateCollectionList(null)).toThrow(CollectionListError);
    expect(() => validateCollectionList([])).toThrow(CollectionListError);
    mutate((d) => (d.version = 2));
    mutate((d) => (d.updated = ''));
    mutate((d) => (d.collections = 'x'));
    mutate((d) => d.collections.push(structuredClone(d.collections[0])));
    mutate((d) => (d.collections[0].id = 'Bad Id'));
    mutate((d) => (d.collections[0].name = ''));
    mutate((d) => (d.collections[0].tunes = -1));
    mutate((d) => (d.collections[0].tunes = 1.5));
    mutate((d) => (d.collections[0].minTunes = 99999));
    mutate((d) => (d.collections[0].playlistName = 3));
    mutate((d) => (d.collections[0].recommended = 'yes'));
    mutate((d) => (d.collections[0].genres = 'jazz'));
    mutate((d) => (d.collections[0].licence = ''));
    mutate((d) => (d.collections[0].pages = []));
    mutate((d) => d.collections[0].pages.push(structuredClone(d.collections[0].pages[0])));
  });

  it('refuses addresses that are not https on an allowed host, with no credentials, port or fragment', () => {
    mutate((d) => (d.collections[0].pages[0].url = 'http://www.irealpro.com/main-playlists/'));
    mutate((d) => (d.collections[0].pages[0].url = 'https://evil.example/main-playlists/'));
    mutate((d) => (d.collections[0].pages[0].url = 'https://irealpro.com.evil.example/'));
    mutate((d) => (d.collections[0].pages[0].url = 'https://user:pass@www.irealpro.com/'));
    mutate((d) => (d.collections[0].pages[0].url = 'https://www.irealpro.com:8443/'));
    mutate((d) => (d.collections[0].pages[0].url = 'https://www.irealpro.com/#x'));
    mutate((d) => (d.collections[0].pages[0].url = 'not an address'));
    mutate((d) => (d.collections[0].pages[0].url = 'javascript:alert(1)'));
    mutate((d) => (d.collections[0].sourcePage = 'http://www.irealpro.com/'));
    expect(() => checkCollectionUrl('https://forums.irealpro.com/threads/1/', 't')).not.toThrow();
  });

  it('wants a copy on GitHub to be pinned to a revision, and only a copy to be there', () => {
    mutate((d) => (d.collections[0].pages[2].url = 'https://raw.githubusercontent.com/infojunkie/ireal-musicxml/main/test/data/jazz1460.txt'));
    mutate((d) => (d.collections[0].pages[2].url = 'https://raw.githubusercontent.com/infojunkie/ireal-musicxml/3101d352/test/data/jazz1460.txt'));
    mutate((d) => (d.collections[0].pages[0].role = 'mirror'));
    mutate((d) => (d.collections[0].pages[2].role = 'bogus'));
    mutate((d) => (d.collections[0].pages[2].kind = 'zip'));
    mutate((d) => (d.collections[0].pages[2].followAttachments = true));
    mutate((d) => (d.collections[0].pages[0].verified = 'yes'));
    mutate((d) => (d.collections[0].pages[0].note = ''));
    mutate((d) => (d.collections[0].pages[0].host = ''));
  });

  it('accepts a withdrawn list (no collection at all)', () => {
    const doc = clone();
    doc.collections = [];
    expect(validateCollectionList(doc).collections).toEqual([]);
  });

  it('returns a copy, not the document it was given', () => {
    const doc = clone();
    const list = validateCollectionList(doc);
    doc.collections[0].name = 'changed';
    expect(list.collections[0]!.name).not.toBe('changed');
  });
});

describe('loading the list', () => {
  const answer = (body: string, status = 200): typeof fetch => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('uses the remote list when it passes the check', async () => {
    const remote = clone();
    remote.collections = remote.collections.slice(2);
    remote.updated = '2027-01-01';
    const got = await loadCollectionList({ fetchFn: answer(JSON.stringify(remote)) });
    expect(got.source).toBe('remote');
    expect(got.problem).toBeNull();
    expect(got.list.collections).toHaveLength(remote.collections.length);
    const withdrawn = await loadCollectionList({ fetchFn: answer(JSON.stringify({ ...remote, collections: [] })) });
    expect(withdrawn.source).toBe('remote');
    expect(withdrawn.list.collections).toEqual([]);
  });

  it('keeps the bundled list on any failure, without a word on screen', async () => {
    const bad = clone();
    bad.collections[0].pages[0].url = 'http://www.irealpro.com/';
    for (const fetchFn of [
      answer(JSON.stringify(bad)),
      answer('not json'),
      answer('{}', 404),
      answer('x'.repeat(300_000)),
      (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    ]) {
      const got = await loadCollectionList({ fetchFn });
      expect(got.source).toBe('bundled');
      expect(got.problem).not.toBeNull();
      expect(got.list).toEqual(bundledCollectionList());
    }
  });

  it('asks for the raw document of the main branch, without credentials', async () => {
    let seen: { url: string; init: RequestInit | undefined } | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify(bundled));
    }) as unknown as typeof fetch;
    await loadCollectionList({ fetchFn });
    expect(seen!.url).toBe(REMOTE_COLLECTION_LIST_URL);
    expect(REMOTE_COLLECTION_LIST_URL).toMatch(/^https:\/\/raw\.githubusercontent\.com\/Pelikast\/Fabtice\/main\/app\/src\/standards\/collections\.json$/);
    expect(seen!.init?.credentials).toBe('omit');
  });
});

describe('which playlists of a page are the collection', () => {
  const pl = (name: string | null, n: number) => ({ name, songs: { length: n } });
  const jazz = { playlistName: 'Jazz 1460', minTunes: 1100 };

  it('takes the playlist named for the collection, names compared without case or spaces', () => {
    const page = [pl('Blues 50', 54), pl('Jazz1460', 1460), pl('Pop 400', 403)];
    expect(selectPlaylists(jazz, page)).toEqual([page[1]]);
    expect(selectPlaylists({ playlistName: 'Blues 50', minTunes: 40 }, page)).toEqual([page[0]]);
    expect(selectPlaylists({ playlistName: 'Jazz 1460', minTunes: 1100 }, [pl('JAZZ 1460 (new)', 1300), pl('Jazz 1460', 1460)])).toEqual([pl('Jazz 1460', 1460)]);
  });

  it('gives nothing when the name is not there or the playlist is too short (a truncated download)', () => {
    expect(selectPlaylists(jazz, [pl('Blues 50', 54)])).toEqual([]);
    expect(selectPlaylists(jazz, [pl(null, 1460)])).toEqual([]);
    expect(selectPlaylists(jazz, [pl('Jazz 1460', 400)])).toEqual([]);
    expect(selectPlaylists(jazz, [])).toEqual([]);
  });

  it('keeps every playlist of a thread that names none, when together they are enough', () => {
    const thread = { playlistName: null, minTunes: 50 };
    const lists = [pl('Dixieland Tunes 1', 233), pl(null, 40), pl('Trad 2', 10)];
    expect(selectPlaylists(thread, lists)).toEqual(lists);
    expect(selectPlaylists(thread, [pl('Tiny', 20)])).toEqual([]);
  });
});
