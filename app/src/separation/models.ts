// The list of separation tools: a small JSON document kept in this repository
// (`./models.json`), fetched at launch from its raw public address so that a
// tool can be withdrawn (or added) without publishing a new version of the
// app; the copy bundled in the app is the fallback.
//
// Strict validation (`validateModelList`): an entry is accepted only with a
// pinned https address on an allowed host (Hugging Face, at a 40-hex
// revision), a SHA-256 and a positive size; anything else in the document is
// refused. A remote document that fails the check is ignored as a whole (the
// bundled list is used), never half-trusted.
//
// The Mac app fetches it the same way: its security policy
// (`desktop/src/protocol.js`, `connect-src`) allows `https://raw.githubusercontent.com`
// for this one document. Any failure (refused, 404, invalid) keeps the bundled
// list, without a word on screen.

import { isStemId } from '../model/separation';
import bundled from './models.json';
import type { ModelListSource, SeparationModelList, SeparationModelSpec } from './types';

/** Raw public address of `models.json` on the main branch. */
export const REMOTE_MODEL_LIST_URL = 'https://raw.githubusercontent.com/Pelikast/Fabtice/main/app/src/separation/models.json';

/** The fetch at launch gives up after this long (the bundled list is then used). */
export const MODEL_LIST_TIMEOUT_MS = 6000;

/** Hosts a tool may be downloaded from (the separator's security policy allows them too). */
export const ALLOWED_HOSTS: readonly string[] = ['huggingface.co'];

/** `https://huggingface.co/<owner>/<repo>/resolve/<40-hex revision>/<path>`: a pinned file, nothing else. */
const PINNED_HF = /^https:\/\/huggingface\.co\/[A-Za-z0-9][\w.-]*\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[\w./-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
/** Largest tool accepted (bytes): a guard against a wrong number, not a policy. */
const MAX_BYTES = 2_000_000_000;

export class ModelListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelListError';
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 400): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function bad(what: string): never {
  throw new ModelListError(`separation tools list: ${what}`);
}

function checkSourcePage(page: unknown, at: string): string {
  if (!isStr(page) || !/^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/?$/.test(page)) bad(`${at}: source page`);
  return page;
}

function checkModel(m: unknown, i: number): SeparationModelSpec {
  const at = `model ${i}`;
  if (!isRec(m)) bad(`${at}: not an object`);
  if (!isStr(m.id) || !ID.test(m.id)) bad(`${at}: id`);
  if (!isStr(m.name, 80) || !isStr(m.label, 40) || !isStr(m.summary)) bad(`${m.id}: name, label or summary`);
  if (m.kind !== 'main' && m.kind !== 'detail') bad(`${m.id}: kind`);
  if (m.kind === 'detail' && !isStemId(m.input)) bad(`${m.id}: input of a detail tool`);
  if (m.kind === 'main' && m.input !== undefined) bad(`${m.id}: a main tool has no input`);
  if (!Array.isArray(m.stems) || m.stems.length < 2 || !m.stems.every(isStemId) || new Set(m.stems).size !== m.stems.length) bad(`${m.id}: stems`);
  if (typeof m.quality !== 'number' || !Number.isInteger(m.quality)) bad(`${m.id}: quality`);
  const f = m.file;
  if (!isRec(f) || !isStr(f.url, 500) || !PINNED_HF.test(f.url)) bad(`${m.id}: file address must be a pinned https address`);
  const host = new URL(f.url).hostname;
  if (!ALLOWED_HOSTS.includes(host)) bad(`${m.id}: host ${host} not allowed`);
  if (!isStr(f.host, 40)) bad(`${m.id}: host label`);
  if (!isPos(f.bytes) || !Number.isInteger(f.bytes) || f.bytes > MAX_BYTES) bad(`${m.id}: size`);
  if (!isStr(f.sha256) || !SHA256.test(f.sha256)) bad(`${m.id}: SHA-256`);
  checkSourcePage(m.sourcePage, m.id);
  if (!isStr(m.licence) || typeof m.licenceUnclear !== 'boolean') bad(`${m.id}: licence`);
  const sp = m.speed;
  if (!isRec(sp) || !(sp.gpu === null || isPos(sp.gpu)) || !isPos(sp.cpu) || typeof sp.measured !== 'boolean' || !isStr(sp.device)) bad(`${m.id}: speed`);
  if (!isPos(m.memoryBytes)) bad(`${m.id}: memory`);
  if (!isRec(m.config)) bad(`${m.id}: config`);
  return {
    id: m.id,
    name: m.name,
    label: m.label,
    summary: m.summary,
    kind: m.kind,
    ...(m.kind === 'detail' ? { input: m.input as SeparationModelSpec['input'] } : {}),
    stems: [...(m.stems as SeparationModelSpec['stems'])],
    quality: m.quality,
    file: { url: f.url, host: f.host, bytes: f.bytes, sha256: f.sha256 },
    sourcePage: m.sourcePage as string,
    licence: m.licence,
    licenceUnclear: m.licenceUnclear,
    speed: { gpu: sp.gpu as number | null, cpu: sp.cpu as number, measured: sp.measured as boolean, device: sp.device as string },
    memoryBytes: m.memoryBytes,
    config: m.config,
  };
}

/** Checks a list document strictly and returns a clean copy; throws `ModelListError` on the first problem. */
export function validateModelList(raw: unknown): SeparationModelList {
  if (!isRec(raw)) bad('not an object');
  if (raw.version !== 1) bad(`unknown version ${String(raw.version)}`);
  if (!isStr(raw.updated, 40)) bad('date');
  if (!Array.isArray(raw.models) || raw.models.length > 50) bad('models');
  const models = raw.models.map(checkModel);
  const ids = new Set(models.map((m) => m.id));
  if (ids.size !== models.length) bad('duplicate ids');
  return { version: 1, updated: raw.updated, models };
}

/** The list bundled in the app (checked by the unit tests, so it never fails here). */
export function bundledModelList(): SeparationModelList {
  return validateModelList(bundled);
}

export interface LoadedModelList {
  list: SeparationModelList;
  source: ModelListSource;
  /** Why the remote list was not used (diagnostics only, English). */
  problem: string | null;
}

export interface LoadOptions {
  fetchFn?: typeof fetch;
  url?: string;
  timeoutMs?: number;
}

/**
 * The remote list if it can be fetched and passes the check, else the bundled
 * one. Never rejects. An EMPTY remote list is valid: every tool was withdrawn.
 */
export async function loadModelList(options: LoadOptions = {}): Promise<LoadedModelList> {
  const fetchFn = options.fetchFn ?? (typeof fetch === 'function' ? fetch : null);
  const fallback = (problem: string): LoadedModelList => ({ list: bundledModelList(), source: 'bundled', problem });
  if (!fetchFn) return fallback('no fetch');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? MODEL_LIST_TIMEOUT_MS);
  try {
    const res = await fetchFn(options.url ?? REMOTE_MODEL_LIST_URL, { signal: abort.signal, cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return fallback(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 200_000) return fallback('too large');
    return { list: validateModelList(JSON.parse(text)), source: 'remote', problem: null };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- the list in use (app-wide)

let current: LoadedModelList = { list: { version: 1, updated: '', models: [] }, source: 'bundled', problem: 'not loaded yet' };
let loaded = false;
let loading: Promise<LoadedModelList> | null = null;
const listeners = new Set<() => void>();

/** The list in use: the bundled one until the remote one has been fetched (`refreshModelList`). */
export function getModelList(): LoadedModelList {
  if (!loaded) {
    current = { list: bundledModelList(), source: 'bundled', problem: 'not fetched yet' };
    loaded = true;
  }
  return current;
}

/** Fetches the remote list once (launch); listeners hear when it replaces the bundled one. */
export function refreshModelList(options?: LoadOptions): Promise<LoadedModelList> {
  loading ??= loadModelList(options).then((l) => {
    current = l;
    loaded = true;
    listeners.forEach((fn) => fn());
    return l;
  });
  return loading;
}

/** Replaces the list in use (tests, `?demo`). */
export function setModelList(next: LoadedModelList | null): void {
  current = next ?? { list: bundledModelList(), source: 'bundled', problem: null };
  loaded = true;
  loading = next ? Promise.resolve(current) : null;
  listeners.forEach((fn) => fn());
}

export function onModelListChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A tool of the list in use, or null (withdrawn or unknown). */
export function findModel(id: string): SeparationModelSpec | null {
  return getModelList().list.models.find((m) => m.id === id) ?? null;
}
