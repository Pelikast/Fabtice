// The on-device library of known chord charts (« grilles des standards »): download of the
// collections listed in `collections.json`, what is kept, and the lookup of a chart by title.
// No React, no DOM: `findStandard` can be called from the analysis side.
//
// Where the text comes from
//  - Mac app: the main process fetches (`window.fabtice.standardsFetchText`, fixed host list,
//    redirects only to such hosts, size cap). Every page of a collection can be tried.
//  - Web app: a page cannot read another site, except the pinned copies on
//    `raw.githubusercontent.com` (CORS `*`). The other pages are skipped, silently; a collection
//    with no readable page is reported as such, and `importStandardsFile` is the way in.
//
// A page is a failure, silently, and the next one is tried, when: it cannot be fetched, it is a
// login page or has no `irealb://` link, no playlist passes `selectPlaylists` (name, `minTunes`).
// A forum thread that only links to attached `.html` files is followed one level.
//
// What is kept: per collection, the raw links of the playlists kept (`libraryStore.ts`); the charts
// are parsed on demand and the title index is built on the first lookup, then cached in memory
// until the library changes.

import { getDesktopBridge, type DesktopBridge } from '../platform/desktopBridge';
import {
  bundledCollectionList,
  loadCollectionList,
  selectPlaylists,
  type CollectionList,
  type CollectionPage,
  type CollectionSpec,
  type LoadedCollectionList,
} from './collections';
import { extractIRealLinks, extractPlaylistFileLinks, readIRealPlaylists, type StandardChart } from './irealRead';
import { openCollectionStore, type CollectionStore, type StoredCollection } from './libraryStore';
import { buildTitleIndex, findTitle, type FindOptions, type TitleIndex, type TitleMatchKind } from './match';

// ---------------------------------------------------------------- the list of collections

let current: LoadedCollectionList | null = null;
let loading: Promise<LoadedCollectionList> | null = null;

/** The `fetch` the list is read with: the Mac app's main process when there is one (its page policy allows few hosts), else the page's own. */
function listFetch(): typeof fetch | undefined {
  const bridge = getDesktopBridge();
  const fetchText = bridge?.standardsFetchText;
  if (!bridge || typeof fetchText !== 'function') return undefined;
  return (async (input: RequestInfo | URL) => {
    const r = await fetchText.call(bridge, String(input));
    if (!r.ok) return new Response(null, { status: r.error === 'http' ? (r.status ?? 500) : 599 });
    return new Response(r.text, { status: 200 });
  }) as typeof fetch;
}

/** The list in use: the bundled one until the remote one has been fetched (`refreshCollectionList`). */
export function getCollectionList(): LoadedCollectionList {
  return current ?? { list: bundledCollectionList(), source: 'bundled', problem: null };
}

/**
 * Fetches the remote list once (the bundled one stays in use if that fails); never rejects. `force`: read it again
 * (« Vérifier les mises à jour de grilles »), whatever was read before; `fetchFn` is for the tests.
 */
export function refreshCollectionList(options: { force?: boolean; fetchFn?: typeof fetch } = {}): Promise<LoadedCollectionList> {
  if (options.force) loading = null;
  loading ??= loadCollectionList({ fetchFn: options.fetchFn ?? listFetch() }).then((l) => (current = l));
  return loading;
}

/** For tests: forget the list fetched so far, or put one in place. */
export function resetCollectionList(next: LoadedCollectionList | null = null): void {
  current = next;
  loading = null;
}

// ---------------------------------------------------------------- where a page can be read

/** Hosts whose files a web page may read (they send `Access-Control-Allow-Origin: *`). */
const CORS_HOSTS: readonly string[] = ['raw.githubusercontent.com'];

export interface Environment {
  /** The Mac app's bridge, or null on the web. */
  bridge: Pick<DesktopBridge, 'standardsFetchText'> | null;
  fetchFn: typeof fetch | null;
}

function defaultEnvironment(): Environment {
  return { bridge: getDesktopBridge(), fetchFn: typeof fetch === 'function' ? fetch.bind(globalThis) : null };
}

/** Can this page's text be had here? Always in the Mac app (when it can fetch); on the web only for hosts that allow it. */
export function canReadPage(page: Pick<CollectionPage, 'url'>, env: Environment = defaultEnvironment()): boolean {
  if (typeof env.bridge?.standardsFetchText === 'function') return true;
  try {
    return env.fetchFn !== null && CORS_HOSTS.includes(new URL(page.url).hostname);
  } catch {
    return false;
  }
}

/** The pages of a collection that can be read here, in order. */
export function readablePages(spec: CollectionSpec, env: Environment = defaultEnvironment()): CollectionPage[] {
  return spec.pages.filter((p) => canReadPage(p, env));
}

/** True when the collection can be downloaded directly here (otherwise: import a file). */
export function isDownloadable(spec: CollectionSpec, env: Environment = defaultEnvironment()): boolean {
  return readablePages(spec, env).length > 0;
}

/** Fetches a page's text; rejects on any failure. */
export type TextFetcher = (url: string, signal?: AbortSignal) => Promise<string>;

export const MAX_TEXT_BYTES = 25 * 1024 * 1024;
const WEB_TIMEOUT_MS = 60_000;

/** The fetcher of this environment: the bridge in the Mac app, else a plain CORS fetch (no credentials). */
export function textFetcher(env: Environment = defaultEnvironment()): TextFetcher {
  const bridge = env.bridge;
  if (bridge && typeof bridge.standardsFetchText === 'function') {
    const fetchText = bridge.standardsFetchText.bind(bridge);
    return async (url, signal) => {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const r = await fetchText(url);
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (!r.ok) throw new Error(r.error);
      return r.text;
    };
  }
  const fetchFn = env.fetchFn;
  return async (url, signal) => {
    if (!fetchFn) throw new Error('no fetch');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), WEB_TIMEOUT_MS);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetchFn(url, { signal: timeout.signal, credentials: 'omit', cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_TEXT_BYTES) throw new Error('too large');
      const text = await res.text();
      if (text.length > MAX_TEXT_BYTES) throw new Error('too large');
      return text;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

// ---------------------------------------------------------------- reading a page

/** What a page gives for one collection: the links of the playlists kept, and their tune count. */
export interface PageResult {
  links: string[];
  tunes: number;
  /** The address the playlists were read from (the page, or the attached file). */
  source: string;
}

/** At most this many attached files are followed from a forum page. */
export const MAX_ATTACHMENTS = 8;

/** The playlists of a text that pass the collection's check, as their raw links; null when none does. */
export function pickPlaylists(spec: Pick<CollectionSpec, 'playlistName' | 'minTunes'>, text: string): { links: string[]; tunes: number } | null {
  const playlists = readIRealPlaylists(text);
  if (playlists.length === 0) return null;
  const links = extractIRealLinks(text);
  const kept = selectPlaylists(spec, playlists);
  if (kept.length === 0) return null;
  const picked = kept.map((p) => links[playlists.indexOf(p)]).filter((l): l is string => typeof l === 'string');
  if (picked.length !== kept.length) return null;
  return { links: picked, tunes: kept.reduce((n, p) => n + p.songs.length, 0) };
}

/**
 * One page of a collection: its own links, else (a forum thread) the attached files it points to, one
 * level only. Rejects when the text cannot be had (abort included); resolves with null when the page
 * is not it (a login page, no link, a wrong or truncated playlist).
 */
export async function readPage(spec: CollectionSpec, page: CollectionPage, fetchText: TextFetcher, signal?: AbortSignal): Promise<PageResult | null> {
  const text = await fetchText(page.url, signal);
  const own = pickPlaylists(spec, text);
  if (own) return { ...own, source: page.url };
  if (!page.followAttachments) return null;
  for (const file of extractPlaylistFileLinks(text, page.url).slice(0, MAX_ATTACHMENTS)) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let attached: string;
    try {
      attached = await fetchText(file, signal);
    } catch (e) {
      if (isAbort(e, signal)) throw e;
      continue; // one attachment missing or refused: the next one
    }
    const picked = pickPlaylists(spec, attached);
    if (picked) return { ...picked, source: file };
  }
  return null;
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof DOMException && e.name === 'AbortError');
}

// ---------------------------------------------------------------- the download

export type CollectionState = 'waiting' | 'fetching' | 'kept' | 'failed' | 'cancelled';

/** Why a collection could not be had (for an honest sentence). */
export type FailureReason =
  /** The web app cannot read any of its pages: import a file. */
  | 'file-needed'
  /** Every page that could be tried failed or was not the right one. */
  | 'not-found';

/**
 * What a kept collection did to the library: `new` (it was not there), `updated` (the page now gives other
 * charts than the ones kept), `same` (nothing changed: it is not written again).
 */
export type CollectionChange = 'new' | 'updated' | 'same';

export interface CollectionOutcome {
  id: string;
  name: string;
  state: 'kept' | 'failed' | 'cancelled';
  /** Set when `state` is `kept`. */
  change: CollectionChange | null;
  tunes: number;
  reason: FailureReason | null;
  /** The host label of the page it came from (« GitHub »), when kept. */
  host: string | null;
}

export interface DownloadProgress {
  /** One entry per collection asked, in order. */
  rows: { id: string; name: string; state: CollectionState; tunes: number; /** Host label of the page being tried. */ host: string | null; page: number; pages: number }[];
  /** Collections finished (kept, failed) over collections asked: 0…1. */
  fraction: number;
}

export interface DownloadResult {
  outcomes: CollectionOutcome[];
  /** Tunes written by this run (a collection found unchanged is not counted). */
  tunes: number;
  cancelled: boolean;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  /** Default: the list in use (`getCollectionList`). */
  list?: CollectionList;
  env?: Environment;
  fetchText?: TextFetcher;
  store?: CollectionStore;
  now?: () => Date;
}

/**
 * Downloads the collections `ids` (unknown ids are ignored) and keeps each one that works. For each
 * collection the readable pages are tried in order; the first that gives a playlist passing the
 * check wins. Pages shared by several collections are fetched once per run. Never rejects: what could
 * not be had is in the outcomes. An abort stops after the current fetch and keeps what is already kept.
 */
export async function downloadCollections(ids: readonly string[], options: DownloadOptions = {}): Promise<DownloadResult> {
  const env = options.env ?? defaultEnvironment();
  const fetchText = options.fetchText ?? textFetcher(env);
  const list = options.list ?? getCollectionList().list;
  const store = options.store ?? (await openCollectionStore());
  const now = options.now ?? (() => new Date());
  const { signal } = options;
  const specs = ids.map((id) => list.collections.find((c) => c.id === id)).filter((c): c is CollectionSpec => !!c);
  // What is kept already: a collection read again that gives the same charts is not written again.
  const before = new Map<string, StoredCollection>();
  try {
    for (const r of await store.list()) before.set(r.id, r);
  } catch {
    // unreadable storage: everything counts as new
  }

  const rows: DownloadProgress['rows'] = specs.map((c) => ({ id: c.id, name: c.name, state: 'waiting', tunes: 0, host: null, page: 0, pages: readablePages(c, env).length }));
  const emit = (): void => {
    const finished = rows.filter((r) => r.state === 'kept' || r.state === 'failed' || r.state === 'cancelled').length;
    options.onProgress?.({ rows: rows.map((r) => ({ ...r })), fraction: rows.length === 0 ? 1 : finished / rows.length });
  };
  emit();

  // A page shared by several collections (the official page holds four lists) is fetched once.
  const cache = new Map<string, Promise<string>>();
  const cached: TextFetcher = (url, s) => {
    let p = cache.get(url);
    if (!p) {
      p = fetchText(url, s);
      cache.set(url, p);
      p.catch(() => cache.delete(url)); // a failure is not remembered (an abort or a hiccup)
    }
    return p;
  };

  const outcomes: CollectionOutcome[] = [];
  let tunes = 0;
  let cancelled = false;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const row = rows[i]!;
    if (signal?.aborted) {
      cancelled = true;
      row.state = 'cancelled';
      outcomes.push({ id: spec.id, name: spec.name, state: 'cancelled', change: null, tunes: 0, reason: null, host: null });
      continue;
    }
    const pages = readablePages(spec, env);
    let kept: { result: PageResult; host: string } | null = null;
    row.state = 'fetching';
    for (let k = 0; k < pages.length && !kept; k++) {
      const page = pages[k]!;
      row.page = k + 1;
      row.host = page.host;
      emit();
      try {
        const result = await readPage(spec, page, cached, signal);
        if (result) kept = { result, host: page.host };
      } catch (e) {
        if (isAbort(e, signal)) {
          cancelled = true;
          break;
        }
        // any other failure: silently on to the next page
      }
    }
    if (cancelled && !kept) {
      row.state = 'cancelled';
      outcomes.push({ id: spec.id, name: spec.name, state: 'cancelled', change: null, tunes: 0, reason: null, host: null });
      continue;
    }
    if (kept) {
      const record: StoredCollection = { id: spec.id, name: spec.name, tunes: kept.result.tunes, source: kept.result.source, date: now().toISOString(), links: kept.result.links.join('\n') };
      const old = before.get(spec.id);
      const change: CollectionChange = !old ? 'new' : old.links === record.links ? 'same' : 'updated';
      try {
        if (change !== 'same') {
          await store.put(record);
          invalidateIndex();
          tunes += record.tunes;
        }
        row.state = 'kept';
        row.tunes = record.tunes;
        outcomes.push({ id: spec.id, name: spec.name, state: 'kept', change, tunes: record.tunes, reason: null, host: kept.host });
      } catch {
        row.state = 'failed';
        outcomes.push({ id: spec.id, name: spec.name, state: 'failed', change: null, tunes: 0, reason: 'not-found', host: null });
      }
    } else {
      row.state = 'failed';
      outcomes.push({ id: spec.id, name: spec.name, state: 'failed', change: null, tunes: 0, reason: pages.length === 0 ? 'file-needed' : 'not-found', host: null });
    }
    emit();
  }
  emit();
  return { outcomes, tunes, cancelled };
}

// ---------------------------------------------------------------- what is on the device

export interface StandardsStatus {
  collections: { id: string; name: string; tunes: number; source: string; date: string; fromFile: boolean }[];
  /** Tunes over all collections kept (a tune present in two is counted twice). */
  total: number;
  /** False when the browser's storage is unavailable: the library lives in memory until the page is closed. */
  persistent: boolean;
}

export async function standardsStatus(store?: CollectionStore): Promise<StandardsStatus> {
  const s = store ?? (await openCollectionStore());
  let records: StoredCollection[] = [];
  try {
    records = await s.list();
  } catch {
    // unreadable storage: as if empty
  }
  records.sort((a, b) => a.name.localeCompare(b.name));
  return {
    collections: records.map((r) => ({ id: r.id, name: r.name, tunes: r.tunes, source: r.source, date: r.date, fromFile: r.id.startsWith('file:') || r.source.startsWith('file:') })),
    total: records.reduce((n, r) => n + r.tunes, 0),
    persistent: s.persistent,
  };
}

/** Forgets the collections `ids`, or everything. */
export async function removeStandards(ids?: readonly string[], store?: CollectionStore): Promise<void> {
  const s = store ?? (await openCollectionStore());
  if (!ids) await s.clear();
  else for (const id of ids) await s.delete(id);
  invalidateIndex();
}

// ---------------------------------------------------------------- importing a file

export type ImportFailure = 'too-large' | 'unreadable' | 'no-chart';

export type ImportResult = { ok: true; added: { id: string; name: string; tunes: number }[]; tunes: number } | { ok: false; reason: ImportFailure };

/** What `importStandardsFile` needs of a file (a `File`, or any object of that shape). */
export interface TextFile {
  name: string;
  size: number;
  text(): Promise<string>;
}

const FILE_ID_MAX = 80;

/**
 * Keeps the charts of a file the user chose: an `.html` page or `.txt` file exported from iReal Pro, or
 * saved from the forum. A playlist that is one of the known collections (by its name, and it passes
 * `minTunes`) replaces it; what is left is kept under the file's name. Nothing is kept, and the reason
 * is given, when the file holds no readable chart.
 */
export async function importStandardsFile(file: TextFile, options: { list?: CollectionList; store?: CollectionStore; now?: () => Date } = {}): Promise<ImportResult> {
  if (file.size > MAX_TEXT_BYTES) return { ok: false, reason: 'too-large' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const links = extractIRealLinks(text);
  const playlists = readIRealPlaylists(text);
  if (playlists.every((p) => p.songs.length === 0)) return { ok: false, reason: 'no-chart' };
  const list = options.list ?? getCollectionList().list;
  const store = options.store ?? (await openCollectionStore());
  const date = (options.now ?? (() => new Date()))().toISOString();
  const left = new Set(playlists.map((_, i) => i));
  const added: { id: string; name: string; tunes: number }[] = [];
  const source = `file:${file.name.slice(0, FILE_ID_MAX)}`;
  try {
    for (const spec of list.collections) {
      if (spec.playlistName === null) continue;
      const mine = playlists.map((p, i) => ({ p, i })).filter(({ i }) => left.has(i));
      const kept = selectPlaylists(spec, mine.map((m) => m.p));
      if (kept.length === 0) continue;
      const picked = mine.filter((m) => kept.includes(m.p));
      const tunes = picked.reduce((n, m) => n + m.p.songs.length, 0);
      await store.put({ id: spec.id, name: spec.name, tunes, source, date, links: picked.map((m) => links[m.i]).join('\n') });
      added.push({ id: spec.id, name: spec.name, tunes });
      for (const m of picked) left.delete(m.i);
    }
    const rest = [...left].filter((i) => playlists[i]!.songs.length > 0);
    if (rest.length > 0) {
      const tunes = rest.reduce((n, i) => n + playlists[i]!.songs.length, 0);
      const name = rest.map((i) => playlists[i]!.name).find((n) => n) ?? file.name.replace(/\.[^.]+$/, '');
      const id = `file:${file.name.slice(0, FILE_ID_MAX)}`;
      await store.put({ id, name, tunes, source, date, links: rest.map((i) => links[i]).join('\n') });
      added.push({ id, name, tunes });
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  invalidateIndex();
  return { ok: true, added, tunes: added.reduce((n, a) => n + a.tunes, 0) };
}

// ---------------------------------------------------------------- finding a chart by title

export interface StandardCandidate {
  chart: StandardChart;
  /** In [0, 1]; at least the threshold (see `match.ts`). */
  score: number;
  kind: TitleMatchKind;
  viaAlias: string | null;
  collectionId: string;
  collectionName: string;
}

interface IndexedChart {
  chart: StandardChart;
  collectionId: string;
  collectionName: string;
}

let generation = 0;
let indexPromise: Promise<{ index: TitleIndex<IndexedChart>; generation: number }> | null = null;
let indexStore: CollectionStore | null = null;

function invalidateIndex(): void {
  generation++;
  indexPromise = null;
}

/** For tests. */
export function resetLibraryCache(): void {
  invalidateIndex();
  indexStore = null;
}

async function buildIndex(store: CollectionStore): Promise<TitleIndex<IndexedChart>> {
  let records: StoredCollection[] = [];
  try {
    records = await store.list();
  } catch {
    records = [];
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const entries: { id: string; title: string; composer: string; data: IndexedChart }[] = [];
  for (const r of records) {
    for (const playlist of readIRealPlaylists(r.links)) {
      for (const chart of playlist.songs) {
        // The same tune in two collections (or a file imported twice) is kept once.
        const key = `${chart.rawTitle}|${chart.composerRaw}|${chart.keyText}|${chart.writtenBars}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ id: `${r.id}#${chart.index}`, title: chart.rawTitle, composer: chart.composerRaw, data: { chart, collectionId: r.id, collectionName: r.name } });
      }
    }
  }
  return buildTitleIndex(entries);
}

/**
 * The charts of the library whose title matches `title` (a noisy title from a video is fine), best
 * first, none below the threshold (a wrong chart is worse than none). Empty when the library is empty
 * or unavailable. The index is built on the first call and kept until the library changes.
 */
export async function findStandard(title: string, options: FindOptions & { store?: CollectionStore } = {}): Promise<StandardCandidate[]> {
  const store = options.store ?? (await openCollectionStore());
  if (indexStore !== store) {
    indexStore = store;
    invalidateIndex();
  }
  const wanted = generation;
  indexPromise ??= buildIndex(store).then((index) => ({ index, generation: wanted }));
  const { index } = await indexPromise;
  return findTitle(index, title, options).map((m) => {
    const data = m.entry.data!;
    return { chart: data.chart, score: m.score, kind: m.kind, viaAlias: m.viaAlias, collectionId: data.collectionId, collectionName: data.collectionName };
  });
}
