// The list of chart collections (« recueils ») the app can download to know the
// chords of jazz standards: a small JSON document kept in this repository
// (`./collections.json`), fetched at launch from its raw public address so that an
// address can be corrected, or a collection withdrawn, without publishing a new
// version of the app; the copy bundled in the app is the fallback. Same approach
// as the separation tools (`../separation/models.ts`).
//
// The repository holds NO chart: only where to find them. The app offers the
// download in one click, says in one sentence what it is for, and keeps the
// result on the device.
//
// Strict validation (`validateCollectionList`): a page is accepted only on an
// allowed host, over https, without credentials or port; a mirror on GitHub only
// pinned to a 40-hex revision. A document that fails the check is ignored as a
// whole (the bundled list is used), never half-trusted.
//
// Who downloads what (this module does not download anything):
//  - the Mac app: the main process fetches each `pages` entry in order until one
//    gives a playlist that passes `minTunes` (a page cannot read another site);
//  - the web version: the pages (except the GitHub mirrors, which send CORS
//    headers) are not readable from a page; it offers to import the file the user
//    saved (`readIRealText` reads it).

import bundled from './collections.json';

/** Raw public address of `collections.json` on the main branch. */
export const REMOTE_COLLECTION_LIST_URL = 'https://raw.githubusercontent.com/Pelikast/Fabtice/main/app/src/standards/collections.json';

/** The fetch at launch gives up after this long (the bundled list is then used). */
export const COLLECTION_LIST_TIMEOUT_MS = 6000;

/**
 * Hosts a collection may be downloaded from. The Mac app's main process does the
 * download, so its page security policy is not involved; the list is still kept
 * short on purpose.
 */
export const COLLECTION_HOSTS: readonly string[] = [
  'www.irealpro.com',
  'irealpro.com',
  'forums.irealpro.com',
  'www.irealb.com',
  'irealb.com',
  'raw.githubusercontent.com',
];

/**
 * - `html-with-ireal-links`: an HTML page (or a file saved from one) whose links are `irealb://…`
 *   (`extractIRealLinks`); with `followAttachments`, the page only points to `.html` attachments of
 *   the same site that hold such links (`extractPlaylistFileLinks`), a forum thread.
 * - `ireal-url-file`: a plain text file that is the `irealb://…` link itself.
 */
export type CollectionPageKind = 'html-with-ireal-links' | 'ireal-url-file';
/** `official`: irealpro.com; `forum`: a thread of the iReal Pro forum; `mirror`: a copy elsewhere. */
export type CollectionPageRole = 'official' | 'forum' | 'mirror';

export interface CollectionPage {
  url: string;
  kind: CollectionPageKind;
  role: CollectionPageRole;
  /** Short label of the host shown to the user (« irealpro.com », « GitHub »). */
  host: string;
  /** The address was fetched and its content read from the environment this list was written in. */
  verified: boolean;
  followAttachments: boolean;
  /** French remark on how to read the page (diagnostics, documentation). */
  note: string;
}

export interface CollectionSpec {
  id: string;
  name: string;
  /** One sentence in French. */
  summary: string;
  /** Number of tunes, when known. */
  tunes: number | null;
  /** A downloaded playlist with fewer tunes than this is not this collection (truncated or wrong page). */
  minTunes: number;
  /** Name of the playlist inside the page (« Jazz 1460 »), when the page holds several; null when any is fine. */
  playlistName: string | null;
  genres: string[];
  /** Offered by default at the first launch. */
  recommended: boolean;
  /** Public page where a person can look at the collection. */
  sourcePage: string;
  licence: string;
  licenceUnclear: boolean;
  /** Where to get it, in order of preference. */
  pages: CollectionPage[];
}

export interface CollectionList {
  version: 1;
  updated: string;
  collections: CollectionSpec[];
}

export type CollectionListSource = 'bundled' | 'remote';

export class CollectionListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionListError';
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 600): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const GITHUB_PINNED = /^\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\/[\w./-]+$/;
/** Largest tune count accepted: a guard against a wrong number, not a policy. */
const MAX_TUNES = 20_000;

function bad(what: string): never {
  throw new CollectionListError(`collection list: ${what}`);
}

/** The address checks every page and `sourcePage` must pass. Throws on the first problem. */
export function checkCollectionUrl(value: unknown, at: string): string {
  if (!isStr(value, 500)) bad(`${at}: address`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return bad(`${at}: not an address`);
  }
  if (url.protocol !== 'https:') bad(`${at}: https only`);
  if (url.username !== '' || url.password !== '' || url.port !== '') bad(`${at}: no credentials or port`);
  if (!COLLECTION_HOSTS.includes(url.hostname)) bad(`${at}: host ${url.hostname} not allowed`);
  if (url.hostname === 'raw.githubusercontent.com' && !GITHUB_PINNED.test(url.pathname)) bad(`${at}: a GitHub address must be pinned to a 40-hex revision`);
  if (url.hash !== '') bad(`${at}: no fragment`);
  return value;
}

function checkPage(p: unknown, id: string, i: number): CollectionPage {
  const at = `${id}: page ${i}`;
  if (!isRec(p)) bad(`${at}: not an object`);
  const url = checkCollectionUrl(p.url, at);
  if (p.kind !== 'html-with-ireal-links' && p.kind !== 'ireal-url-file') bad(`${at}: kind`);
  if (p.role !== 'official' && p.role !== 'forum' && p.role !== 'mirror') bad(`${at}: role`);
  if (!isStr(p.host, 40)) bad(`${at}: host label`);
  if (typeof p.verified !== 'boolean' || typeof p.followAttachments !== 'boolean') bad(`${at}: flags`);
  if (p.followAttachments && p.kind !== 'html-with-ireal-links') bad(`${at}: only an HTML page can point to attachments`);
  if (!isStr(p.note, 800)) bad(`${at}: note`);
  if (p.role === 'mirror' && new URL(url).hostname !== 'raw.githubusercontent.com') bad(`${at}: a mirror is a pinned GitHub file`);
  return { url, kind: p.kind, role: p.role, host: p.host, verified: p.verified, followAttachments: p.followAttachments, note: p.note };
}

function checkCollection(c: unknown, i: number): CollectionSpec {
  const at = `collection ${i}`;
  if (!isRec(c)) bad(`${at}: not an object`);
  if (!isStr(c.id) || !ID.test(c.id)) bad(`${at}: id`);
  const id = c.id;
  if (!isStr(c.name, 80) || !isStr(c.summary, 400)) bad(`${id}: name or summary`);
  if (!(c.tunes === null || (isPosInt(c.tunes) && c.tunes <= MAX_TUNES))) bad(`${id}: tunes`);
  if (!isPosInt(c.minTunes) || c.minTunes > MAX_TUNES || (c.tunes !== null && c.minTunes > c.tunes)) bad(`${id}: minTunes`);
  if (!(c.playlistName === null || isStr(c.playlistName, 80))) bad(`${id}: playlistName`);
  if (!Array.isArray(c.genres) || c.genres.length > 10 || !c.genres.every((g) => isStr(g, 40))) bad(`${id}: genres`);
  if (typeof c.recommended !== 'boolean' || typeof c.licenceUnclear !== 'boolean') bad(`${id}: flags`);
  const sourcePage = checkCollectionUrl(c.sourcePage, `${id}: sourcePage`);
  if (!isStr(c.licence, 400)) bad(`${id}: licence`);
  if (!Array.isArray(c.pages) || c.pages.length === 0 || c.pages.length > 8) bad(`${id}: pages`);
  const pages = c.pages.map((p, k) => checkPage(p, id, k));
  if (new Set(pages.map((p) => p.url)).size !== pages.length) bad(`${id}: duplicate pages`);
  return {
    id,
    name: c.name,
    summary: c.summary,
    tunes: c.tunes as number | null,
    minTunes: c.minTunes,
    playlistName: c.playlistName as string | null,
    genres: [...(c.genres as string[])],
    recommended: c.recommended,
    sourcePage,
    licence: c.licence,
    licenceUnclear: c.licenceUnclear,
    pages,
  };
}

/** Checks a list document strictly and returns a clean copy; throws `CollectionListError` on the first problem. */
export function validateCollectionList(raw: unknown): CollectionList {
  if (!isRec(raw)) bad('not an object');
  if (raw.version !== 1) bad(`unknown version ${String(raw.version)}`);
  if (!isStr(raw.updated, 40)) bad('date');
  if (!Array.isArray(raw.collections) || raw.collections.length > 50) bad('collections');
  const collections = raw.collections.map(checkCollection);
  if (new Set(collections.map((c) => c.id)).size !== collections.length) bad('duplicate ids');
  return { version: 1, updated: raw.updated, collections };
}

/** The list bundled in the app (checked by the unit tests, so it never fails here). */
export function bundledCollectionList(): CollectionList {
  return validateCollectionList(bundled);
}

export interface LoadedCollectionList {
  list: CollectionList;
  source: CollectionListSource;
  /** Why the remote list was not used (diagnostics only, English). */
  problem: string | null;
}

export interface LoadCollectionOptions {
  fetchFn?: typeof fetch;
  url?: string;
  timeoutMs?: number;
}

/**
 * The remote list if it can be fetched and passes the check, else the bundled one.
 * Never rejects. An EMPTY remote list is valid: every collection was withdrawn.
 */
export async function loadCollectionList(options: LoadCollectionOptions = {}): Promise<LoadedCollectionList> {
  const fetchFn = options.fetchFn ?? (typeof fetch === 'function' ? fetch : null);
  const fallback = (problem: string): LoadedCollectionList => ({ list: bundledCollectionList(), source: 'bundled', problem });
  if (!fetchFn) return fallback('no fetch');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? COLLECTION_LIST_TIMEOUT_MS);
  try {
    const res = await fetchFn(options.url ?? REMOTE_COLLECTION_LIST_URL, { signal: abort.signal, cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return fallback(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 200_000) return fallback('too large');
    return { list: validateCollectionList(JSON.parse(text)), source: 'remote', problem: null };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What to keep of the playlists read from a page, for a collection: the playlist whose name starts
 * with `playlistName` (case and spaces ignored; the largest if several), or, when the collection
 * names none (a forum thread with several lists), all of them. Nothing (empty) when what is left has
 * fewer than `minTunes` tunes in all: a truncated download or the wrong page.
 */
export function selectPlaylists<T extends { name: string | null; songs: { length: number } }>(spec: Pick<CollectionSpec, 'playlistName' | 'minTunes'>, playlists: readonly T[]): T[] {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
  let kept: T[];
  if (spec.playlistName !== null) {
    const want = norm(spec.playlistName);
    const best = playlists
      .filter((p) => p.name !== null && norm(p.name).startsWith(want))
      .sort((a, b) => b.songs.length - a.songs.length)[0];
    kept = best ? [best] : [];
  } else kept = [...playlists];
  return kept.reduce((n, p) => n + p.songs.length, 0) >= spec.minTunes ? kept : [];
}
