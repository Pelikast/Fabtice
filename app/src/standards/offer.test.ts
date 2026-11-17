// The start-up message of the chord charts (its four paths), « Tout télécharger » with a failure in the middle,
// « Vérifier les mises à jour de grilles » (nothing new, a new collection, a collection that changed) and the
// sentences that end a run. Fake pages only (`testFixtures.ts`).

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateCollectionList, type CollectionList } from './collections';
import { isDownloadable, resetCollectionList, resetLibraryCache, standardsStatus, type Environment, type TextFetcher } from './library';
import { MemoryCollectionStore, resetCollectionStore } from './libraryStore';
import {
  acceptMessage,
  acknowledgeLastWord,
  checkStandardsUpdates,
  declineMessage,
  dismissStandardsResult,
  downloadAllStandards,
  downloadOneStandard,
  downloadableCollections,
  finishMessage,
  initStandards,
  markLaunched,
  messageStep,
  removeStandard,
  reportText,
  resetStandardsState,
  setDontShow,
  setPrefStorage,
  setStandardsDeps,
  standardsStore,
  type PrefStorage,
  type StandardsState,
} from './offer';
import { link, LOGIN_PAGE, officialPage, tunes } from './testFixtures';

const OFFICIAL = 'https://www.irealpro.com/main-playlists/';
const FORUM = 'https://forums.irealpro.com/threads/1/';
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
const SPEC = { summary: 'Une phrase.', licence: 'l', licenceUnclear: true, genres: ['jazz'], recommended: true, sourcePage: OFFICIAL };
const spec = (id: string, name: string, minTunes: number, pages: ReturnType<typeof page>[], playlistName: string | null = name) => ({ ...SPEC, id, name, tunes: null, minTunes, playlistName, pages });

const JAZZ = spec('jazz', 'Jazz', 8, [page(OFFICIAL, 'official'), page(MIRROR, 'mirror')]);
const LATIN = spec('latin', 'Latin', 4, [page(OFFICIAL, 'official')]);
const BLUES = spec('blues', 'Blues', 4, [page(FORUM, 'forum', true)]);
const WEBONLY = spec('webonly', 'Web only', 4, [page(MIRROR, 'mirror')]);
const listOf = (...specs: object[]): CollectionList => validateCollectionList({ version: 1, updated: '2026-11-16', collections: specs });

const MAC: Environment = { bridge: { standardsFetchText: async () => ({ ok: false, error: 'network' }) }, fetchFn: null };
const WEB: Environment = { bridge: null, fetchFn: (async () => new Response('')) as typeof fetch };

const playlist = (name: string, count: number, prefix = name) => ({ name, songs: tunes(count, `${prefix} Tune`) });
const jazzPage = officialPage([playlist('Jazz', 10), playlist('Latin', 5)]);

function fakeFetch(pages: Record<string, string | Error>) {
  const fetchText: TextFetcher = async (url) => {
    const v = pages[url];
    if (v === undefined) throw new Error('HTTP 404');
    if (v instanceof Error) throw v;
    return v;
  };
  return { fetchText, pages };
}

function memoryPrefs(): PrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

let store: MemoryCollectionStore;
let prefs: ReturnType<typeof memoryPrefs>;

/** A launch of the app: what `main.tsx` does, with the fake store and the fake pages. */
async function launch(options: { list: CollectionList; env: Environment; fetch: ReturnType<typeof fakeFetch>; message?: boolean }) {
  resetCollectionList({ list: options.list, source: 'remote', problem: null });
  setStandardsDeps({ download: { env: options.env, fetchText: options.fetch.fetchText, store, now: () => new Date('2026-11-16T10:00:00Z') }, can: (s) => isDownloadable(s, options.env) });
  await initStandards({ remoteList: false, message: options.message ?? true });
  markLaunched();
}

const state = (): StandardsState => standardsStore.getState();
const step = (o: { otherWindowOpen?: boolean; downloadable?: number } = {}) => messageStep(state(), { otherWindowOpen: o.otherWindowOpen ?? false, downloadable: o.downloadable ?? 5 });

beforeEach(() => {
  store = new MemoryCollectionStore();
  resetCollectionStore(store);
  resetLibraryCache();
  resetStandardsState();
  resetCollectionList(null);
  prefs = memoryPrefs();
  setPrefStorage(prefs);
});

describe('the start-up message: when it comes', () => {
  const FETCH = () => fakeFetch({ [OFFICIAL]: jazzPage });

  it('asks while nothing was ever downloaded, once the start-up is over', async () => {
    resetCollectionList({ list: listOf(JAZZ), source: 'remote', problem: null });
    setStandardsDeps({ download: { store } });
    await initStandards({ remoteList: false, message: true });
    expect(step()).toBeNull(); // the kept piece may still be reopening
    markLaunched();
    expect(step()).toBe('ask');
  });

  it('waits for the other windows (one at a time) and has nothing to offer when this device can download nothing', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    expect(step({ otherWindowOpen: true })).toBeNull();
    expect(step({ otherWindowOpen: false })).toBe('ask');
    expect(step({ downloadable: 0 })).toBeNull();
  });

  it('does not exist on a page that did not ask for it (test addresses)', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH(), message: false });
    expect(step()).toBeNull();
  });

  it('web: « tous » is what the web can read; with nothing readable there is no message', async () => {
    const list = listOf(JAZZ, LATIN, BLUES, WEBONLY);
    expect(downloadableCollections(list, (s) => isDownloadable(s, WEB)).map((c) => c.id)).toEqual(['jazz', 'webonly']);
    expect(downloadableCollections(list, (s) => isDownloadable(s, MAC)).map((c) => c.id)).toEqual(['jazz', 'latin', 'blues', 'webonly']);
    const noneOnWeb = listOf(LATIN, BLUES);
    expect(downloadableCollections(noneOnWeb, (s) => isDownloadable(s, WEB))).toHaveLength(0);
    await launch({ list: noneOnWeb, env: WEB, fetch: FETCH() });
    expect(step({ downloadable: downloadableCollections(noneOnWeb, (s) => isDownloadable(s, WEB)).length })).toBeNull();
  });

  it('path « Non merci » without the box: hidden for this launch, back at the next', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    expect(step()).toBe('ask');
    declineMessage();
    expect(step()).toBeNull();
    expect(prefs.data.size).toBe(0);
    // The next launch: a new page, the same device.
    resetStandardsState();
    setPrefStorage(prefs);
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    expect(step()).toBe('ask');
  });

  it('path « Non merci » with the box: the last word, then never again', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    setDontShow(true);
    declineMessage();
    expect(step()).toBe('last');
    expect(prefs.data.get('fabtice.standards.offer.v1')).toBe('declined');
    acknowledgeLastWord();
    expect(step()).toBeNull();
    resetStandardsState();
    setPrefStorage(prefs);
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    expect(step()).toBeNull();
    expect(state().declined).toBe(true);
  });

  it('path « Oui »: downloads, shows the result, and never asks again once something is kept', async () => {
    const f = FETCH();
    await launch({ list: listOf(JAZZ, LATIN), env: MAC, fetch: f });
    expect(step()).toBe('ask');
    const done = acceptMessage();
    expect(step()).toBe('running');
    await done;
    expect(step()).toBe('done');
    const report = (state().run as { report: Parameters<typeof reportText>[0] }).report;
    expect(reportText(report)).toBe('Tout est téléchargé : 2 recueils, 15 grilles gardées sur cet appareil.');
    finishMessage();
    expect(step()).toBeNull();
    expect((await standardsStatus(store)).collections.map((c) => c.id)).toEqual(['jazz', 'latin']);
    // A later launch: something is kept, no message.
    resetStandardsState();
    setPrefStorage(prefs);
    await launch({ list: listOf(JAZZ, LATIN), env: MAC, fetch: f });
    expect(step()).toBeNull();
  });

  it('the window can be left while the download goes on, and the result waits in the settings', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: FETCH() });
    const done = acceptMessage();
    standardsStore.setState({ follow: false });
    expect(step()).toBeNull();
    await done;
    expect(state().run.kind).toBe('done');
    expect(step()).toBeNull();
    dismissStandardsResult();
    expect(state().run.kind).toBe('idle');
  });

  it('when nothing could be had, the question is not asked again straight away', async () => {
    await launch({ list: listOf(JAZZ), env: MAC, fetch: fakeFetch({}) });
    await acceptMessage();
    expect(reportText((state().run as { report: Parameters<typeof reportText>[0] }).report)).toContain('Aucune grille n’a pu être téléchargée');
    finishMessage();
    expect(step()).toBeNull();
  });
});

describe('« Tout télécharger »', () => {
  it('keeps what works and goes on after one that fails in the middle', async () => {
    const f = fakeFetch({ [OFFICIAL]: officialPage([playlist('Jazz', 10), playlist('Blues', 5)]), [FORUM]: LOGIN_PAGE });
    // Jazz (official) works, Latin (official page has no such list) fails, Blues (forum: a login page) fails, Trad works.
    const TRAD = spec('trad', 'Blues', 4, [page(OFFICIAL, 'official')]);
    await launch({ list: listOf(JAZZ, LATIN, BLUES, TRAD), env: MAC, fetch: f });
    const seen: number[] = [];
    const unsubscribe = standardsStore.subscribe((s) => s.run.kind === 'running' && seen.push(Math.round(s.run.progress.fraction * 100)));
    await downloadAllStandards('settings');
    unsubscribe();
    const run = state().run;
    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;
    expect(run.result.outcomes.map((o) => [o.id, o.state])).toEqual([['jazz', 'kept'], ['latin', 'failed'], ['blues', 'failed'], ['trad', 'kept']]);
    expect(Math.max(...seen)).toBe(100);
    expect((await standardsStatus(store)).collections.map((c) => c.id).sort()).toEqual(['jazz', 'trad']);
    expect(run.report).toMatchObject({ failed: 2, added: 2, keptListed: 2, listed: 4, fileOnly: 0 });
    expect(reportText(run.report)).toBe('2 recueils sur 4 téléchargés : 15 grilles gardées sur cet appareil. Les autres peuvent être réessayés dans Réglages → Avancé.');
  });

  it('web: says honestly that the others come with the Mac app or a file', async () => {
    const f = fakeFetch({ [MIRROR]: link(tunes(10, 'Jazz Tune'), 'Jazz') });
    await launch({ list: listOf(JAZZ, LATIN, BLUES), env: WEB, fetch: f });
    await downloadAllStandards('message');
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(run.report).toMatchObject({ keptListed: 1, listed: 3, fileOnly: 2, failed: 0 });
    expect(reportText(run.report)).toBe('1 recueil sur 3 téléchargé : 10 grilles gardées sur cet appareil. Les autres se téléchargent dans l’app Mac ou s’importent par fichier.');
  });

  it('one collection from its row, and removal that « Vérifier » respects', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage });
    await launch({ list: listOf(JAZZ, LATIN), env: MAC, fetch: f });
    await downloadOneStandard('latin');
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(reportText(run.report)).toBe('« Latin » est gardé sur cet appareil.');
    dismissStandardsResult();
    await removeStandard('latin');
    expect((await standardsStatus(store)).collections).toHaveLength(0);
  });
});

describe('« Vérifier les mises à jour de grilles »', () => {
  const refresh = (list: CollectionList) => async () => ({ list, source: 'remote' as const, problem: null });

  async function installed(f: ReturnType<typeof fakeFetch>, list = listOf(JAZZ, LATIN)) {
    await launch({ list, env: MAC, fetch: f });
    await downloadAllStandards('message');
    dismissStandardsResult();
  }

  it('finds nothing new: « Tout est à jour. » and writes nothing', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage });
    await installed(f);
    const before = await store.list();
    setStandardsDeps({ refreshList: refresh(listOf(JAZZ, LATIN)) });
    await checkStandardsUpdates();
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(reportText(run.report)).toBe('Tout est à jour.');
    expect(await store.list()).toEqual(before);
  });

  it('installs a collection that is new in the list', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage, [FORUM]: link(tunes(6, 'Blues Tune'), 'Blues') });
    await installed(f);
    const next = listOf(JAZZ, LATIN, spec('blues', 'Blues', 4, [page(OFFICIAL, 'official'), page(FORUM, 'forum', true)]));
    f.pages[OFFICIAL] = officialPage([playlist('Jazz', 10), playlist('Latin', 5), playlist('Blues', 6)]);
    setStandardsDeps({ refreshList: refresh(next) });
    await checkStandardsUpdates();
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(run.report).toMatchObject({ added: 1, updated: 0 });
    expect(reportText(run.report)).toBe('1 recueil ajouté.');
    expect((await store.list()).map((r) => r.id).sort()).toEqual(['blues', 'jazz', 'latin']);
  });

  it('replaces a kept collection whose charts changed, and says so', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage });
    await installed(f);
    f.pages[OFFICIAL] = officialPage([playlist('Jazz', 12), playlist('Latin', 5)]);
    setStandardsDeps({ refreshList: refresh(listOf(JAZZ, LATIN)) });
    await checkStandardsUpdates();
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(run.report).toMatchObject({ added: 0, updated: 1, same: 1 });
    expect(reportText(run.report)).toBe('1 recueil mis à jour.');
    expect((await store.list()).find((r) => r.id === 'jazz')?.tunes).toBe(12);
  });

  it('does not bring back what was removed on purpose, nor touch what came from a file', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage });
    await installed(f);
    await removeStandard('latin');
    setStandardsDeps({ refreshList: refresh(listOf(JAZZ, LATIN)) });
    await checkStandardsUpdates();
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(reportText(run.report)).toBe('Tout est à jour.');
    expect((await store.list()).map((r) => r.id)).toEqual(['jazz']);
  });

  it('says plainly when nothing could be checked', async () => {
    const f = fakeFetch({ [OFFICIAL]: jazzPage });
    await installed(f);
    f.pages[OFFICIAL] = new Error('offline');
    setStandardsDeps({ refreshList: async () => ({ list: listOf(JAZZ, LATIN), source: 'bundled' as const, problem: 'offline' }) });
    await checkStandardsUpdates();
    const run = state().run;
    if (run.kind !== 'done') throw new Error('not done');
    expect(reportText(run.report)).toContain('La liste des recueils n’a pas pu être relue');
  });
});
