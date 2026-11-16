// State of the chord charts of standards (« grilles des standards ») on the screen side: what is on the
// device, the download in progress and its result, and the message offered at start-up.
//
//   - The start-up message (C9): « Voulez-vous importer automatiquement les grilles des standards de
//     iReal Pro ? », at every launch while nothing is kept on the device, unless « Ne plus afficher ce
//     message » was ticked. « Oui (recommandé) » downloads every collection this device can download,
//     with no choice of detail. `messageStep` says which of its four steps is on screen (nothing, the
//     question, the download, the result, the last word after « Non merci » with the box ticked).
//   - « Réglages → Avancé »: the same download (« Tout télécharger »), one collection at a time, and
//     « Vérifier les mises à jour de grilles », which reads the list again and installs what is new.
//
// A small store of its own: this is device data, not project data, and nothing here goes into a `.fab`
// document. The download itself is `library.ts` (`downloadCollections`).

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { t, type MessageKey } from '../i18n';
import type { CollectionList, CollectionSpec } from './collections';
import {
  downloadCollections,
  getCollectionList,
  importStandardsFile,
  isDownloadable,
  refreshCollectionList,
  removeStandards,
  standardsStatus,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
  type ImportFailure,
  type StandardsStatus,
  type TextFile,
} from './library';

/** The download in progress. `origin`: the start-up message, or « Réglages → Avancé ». */
export type RunOrigin = 'message' | 'settings';
/** `all`: every collection this device can download; `update`: « Vérifier les mises à jour »; `one`: a single collection. */
export type RunOp = 'all' | 'update' | 'one';

/** What a finished run says, as numbers; `reportText` makes the sentence. */
export interface RunReport {
  op: RunOp;
  /** Collections the list holds, and how many of them are kept on the device after the run. */
  listed: number;
  keptListed: number;
  /** Tunes kept on the device after the run (all collections). */
  tunes: number;
  /** Collections of this run: new, replaced by a newer version, found unchanged, that failed. */
  added: number;
  updated: number;
  same: number;
  failed: number;
  /** Collections of the list this device cannot download at all (the web app, no readable page). */
  fileOnly: number;
  cancelled: boolean;
  /** « Vérifier les mises à jour »: the list could not be read again (the one in use stayed). */
  listProblem: boolean;
  /** The name of the collection, for a run on a single one. */
  subject: string | null;
}

export type StandardsRun =
  | { kind: 'idle' }
  | { kind: 'running'; op: RunOp; origin: RunOrigin; progress: DownloadProgress; /** The list is being read (update). */ reading: boolean }
  | { kind: 'done'; op: RunOp; origin: RunOrigin; result: DownloadResult; status: StandardsStatus; report: RunReport };

export type StandardsImportNote = { kind: 'ok'; tunes: number } | { kind: 'error'; reason: ImportFailure } | null;

export interface StandardsState {
  /** What is kept on the device; null until it has been read. */
  status: StandardsStatus | null;
  run: StandardsRun;
  importNote: StandardsImportNote;
  /** Bumped when the remote list of collections has replaced the one in use (components redraw). */
  listVersion: number;
  /** The start-up message exists in this page (not on the test addresses, unless asked). */
  messageEnabled: boolean;
  /** The start-up is over (the kept project is reopened or not): the message may come. */
  launched: boolean;
  /** « Non merci » without the box: hidden until the next launch. */
  postponed: boolean;
  /** « Ne plus afficher ce message », kept on the device. */
  declined: boolean;
  /** The box of the message, ticked now. */
  dontShow: boolean;
  /** « Non merci » with the box: the last word (« Ce choix reste disponible… ») is on screen. */
  lastWord: boolean;
  /** The message's window shows the download it started (until it is closed: the download goes on). */
  follow: boolean;
}

export function initialStandardsState(): StandardsState {
  return {
    status: null,
    run: { kind: 'idle' },
    importNote: null,
    listVersion: 0,
    messageEnabled: false,
    launched: false,
    postponed: false,
    declined: false,
    dontShow: false,
    lastWord: false,
    follow: false,
  };
}

export const standardsStore = createStore<StandardsState>()(() => initialStandardsState());

export function useStandards<T>(selector: (state: StandardsState) => T): T {
  return useStore(standardsStore, selector);
}

const set = (patch: Partial<StandardsState>): void => standardsStore.setState(patch);
const get = (): StandardsState => standardsStore.getState();

// ---------------------------------------------------------------- what is remembered on the device

/** Where the two small memories below live; `localStorage` unless a test puts another. */
export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function localPrefs(): PrefStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

let prefs: PrefStorage | null | undefined;
const storage = (): PrefStorage | null => (prefs === undefined ? localPrefs() : prefs);

/** For tests. */
export function setPrefStorage(next: PrefStorage | null | undefined): void {
  prefs = next;
}

/** « Ne plus afficher ce message » (the key keeps the name it had when the offer was a card). */
const DECLINED_KEY = 'fabtice.standards.offer.v1';
/**
 * The collections the app has already offered, downloaded or let go of: « Vérifier les mises à jour » installs
 * only the ones that are not in there (a collection removed on purpose does not come back by itself).
 */
const KNOWN_KEY = 'fabtice.standards.known.v1';

function readDeclined(): boolean {
  try {
    return storage()?.getItem(DECLINED_KEY) === 'declined';
  } catch {
    return false;
  }
}

function writeDeclined(value: boolean): void {
  try {
    if (value) storage()?.setItem(DECLINED_KEY, 'declined');
    else storage()?.removeItem(DECLINED_KEY);
  } catch {
    // storage unavailable: asked again next time
  }
}

function readKnown(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(KNOWN_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function addKnown(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const known = readKnown();
  for (const id of ids) known.add(id);
  try {
    storage()?.setItem(KNOWN_KEY, JSON.stringify([...known]));
  } catch {
    // storage unavailable: the next check may offer them again
  }
}

// ---------------------------------------------------------------- what this device can download

/** The collections of the list in use that this device can download directly (every one in the Mac app). */
export function downloadableCollections(list: CollectionList = getCollectionList().list, can: (spec: CollectionSpec) => boolean = isDownloadable): CollectionSpec[] {
  return list.collections.filter((c) => can(c));
}

// ---------------------------------------------------------------- the start-up message

/** What the message's window shows now: nothing, the question, the download, its result, or the last word. */
export type MessageStep = 'ask' | 'running' | 'done' | 'last' | null;

/**
 * The step of the message. The question comes only when the start-up is over, nothing is kept on the device, it was
 * neither declined nor postponed, this device can download something, and no other window is in the way (it waits
 * its turn: one window at a time). The three other steps belong to what the user started in it.
 */
export function messageStep(state: StandardsState, context: { otherWindowOpen: boolean; downloadable: number }): MessageStep {
  if (!state.messageEnabled) return null;
  if (state.follow) {
    if (state.run.kind === 'running' && state.run.origin === 'message') return 'running';
    if (state.run.kind === 'done' && state.run.origin === 'message') return 'done';
  }
  if (state.lastWord) return 'last';
  if (state.run.kind !== 'idle' || !state.launched || context.otherWindowOpen) return null;
  if (state.status === null || state.status.collections.length > 0) return null;
  if (state.declined || state.postponed || context.downloadable === 0) return null;
  return 'ask';
}

/** « Non merci », « Échap »: with the box ticked the choice is kept for good (and the last word comes), else the message returns at the next launch. */
export function declineMessage(): void {
  if (get().dontShow) {
    writeDeclined(true);
    set({ declined: true, lastWord: true, dontShow: false });
  } else {
    set({ postponed: true });
  }
}

export function setDontShow(value: boolean): void {
  set({ dontShow: value });
}

/** « OK » on the last word. */
export function acknowledgeLastWord(): void {
  set({ lastWord: false });
}

/** « Oui (recommandé) »: every collection this device can download, the window following the progress. */
export function acceptMessage(): Promise<void> {
  set({ follow: true, dontShow: false });
  return downloadAllStandards('message');
}

/** The window is closed while the download goes on (its progress and result are in « Réglages → Avancé »). */
export function leaveMessageRunning(): void {
  set({ follow: false });
}

/** « Terminer » on the result of the message. */
export function finishMessage(): void {
  set({ follow: false });
  dismissStandardsResult();
}

// ---------------------------------------------------------------- start-up

export interface InitOptions {
  /** Fetch the remote list of collections (false on the test and demo addresses). Default true. */
  remoteList?: boolean;
  /** The start-up message exists in this page. Default false: only the real app and the pages that ask for it. */
  message?: boolean;
}

/**
 * At launch: what is on the device, the « Ne plus afficher ce message » choice, and the remote list of collections
 * (the bundled one staying in use if it cannot be had).
 */
export async function initStandards(options: InitOptions = {}): Promise<void> {
  set({ declined: readDeclined(), messageEnabled: options.message === true });
  await refreshStandardsStatus();
  if (options.remoteList !== false) {
    await refreshCollectionList();
    set({ listVersion: get().listVersion + 1 });
  }
}

/** The start-up of the app is over (the kept piece reopened, or not): the message may come. */
export function markLaunched(): void {
  set({ launched: true });
}

export async function refreshStandardsStatus(): Promise<void> {
  set({ status: await standardsStatus(deps.download?.store) });
}

// ---------------------------------------------------------------- downloading

/** The way in for tests: where the pages come from and where the charts go. */
export interface StandardsDeps {
  download?: Pick<DownloadOptions, 'env' | 'fetchText' | 'store' | 'now'>;
  refreshList?: (options: { force: true }) => Promise<{ list: CollectionList; source: 'bundled' | 'remote'; problem: string | null }>;
  can?: (spec: CollectionSpec) => boolean;
}
let deps: StandardsDeps = {};
/** Puts these deps in force, over the ones already there. */
export function setStandardsDeps(next: StandardsDeps): void {
  deps = { ...deps, ...next };
}

let controller: AbortController | null = null;

const idleProgress = (): DownloadProgress => ({ rows: [], fraction: 0 });

/** The numbers of a finished run, for its sentence. */
export function buildReport(args: {
  op: RunOp;
  list: CollectionList;
  result: DownloadResult;
  status: StandardsStatus;
  can?: (spec: CollectionSpec) => boolean;
  listProblem?: boolean;
}): RunReport {
  const { list, result, status } = args;
  const can = args.can ?? isDownloadable;
  const kept = new Set(status.collections.map((c) => c.id));
  return {
    op: args.op,
    listed: list.collections.length,
    keptListed: list.collections.filter((c) => kept.has(c.id)).length,
    tunes: status.total,
    added: result.outcomes.filter((o) => o.state === 'kept' && o.change === 'new').length,
    updated: result.outcomes.filter((o) => o.state === 'kept' && o.change === 'updated').length,
    same: result.outcomes.filter((o) => o.state === 'kept' && o.change === 'same').length,
    failed: result.outcomes.filter((o) => o.state === 'failed').length,
    fileOnly: list.collections.filter((c) => !can(c) && !kept.has(c.id)).length,
    cancelled: result.cancelled,
    listProblem: args.listProblem === true,
    subject: args.op === 'one' ? (result.outcomes[0]?.name ?? null) : null,
  };
}

/** « 1 recueil » / « 3 recueils »: the key `base` has a `.one` and an `.other` form. */
function tp(base: string, n: number, params: Record<string, string | number> = {}): string {
  return t(`${base}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n: count(n), ...params });
}
const count = (n: number): string => new Intl.NumberFormat(t('meta.locale')).format(n);

/** The simple sentence that ends a run (the message, and the line under the buttons of « Réglages → Avancé »). */
export function reportText(r: RunReport): string {
  const numbers = { n: count(r.keptListed), total: count(r.listed), tunes: count(r.tunes) };
  if (r.op === 'one') {
    if (r.cancelled) return t('standards.report.cancelled');
    return r.added + r.updated + r.same > 0 ? t('standards.report.oneKept', { name: r.subject ?? '' }) : t('standards.report.oneFailed', { name: r.subject ?? '' });
  }
  if (r.op === 'update') {
    if (r.cancelled) return t('standards.report.cancelled');
    const done = [r.added > 0 ? tp('standards.report.added', r.added) : null, r.updated > 0 ? tp('standards.report.updated', r.updated) : null].filter((x): x is string => x !== null);
    if (done.length === 0 && r.failed === 0) return t('standards.report.upToDate');
    if (done.length === 0 && r.same === 0) return r.listProblem ? t('standards.report.checkFailedList') : t('standards.report.checkFailed');
    const lead = done.length > 0 ? `${done.join(t('standards.report.and'))}.` : t('standards.report.upToDateExcept');
    return r.failed > 0 ? `${lead} ${tp('standards.report.notChecked', r.failed)}` : lead;
  }
  if (r.cancelled) return r.keptListed > 0 ? `${t('standards.report.cancelled')} ${tp('standards.report.kept', r.keptListed, numbers)}` : t('standards.report.cancelled');
  if (r.keptListed === 0) return t('standards.report.none');
  if (r.keptListed === r.listed) return tp('standards.report.all', r.listed, numbers);
  const tails: string[] = [];
  if (r.failed > 0) tails.push(t('standards.report.retry'));
  if (r.fileOnly > 0) tails.push(t('standards.report.fileOrMac'));
  return tails.length === 0 ? tp('standards.report.kept', r.keptListed, numbers) : `${tp('standards.report.kept', r.keptListed, numbers)} ${t('standards.report.others')} ${tails.join(t('standards.report.or'))}.`;
}

async function startRun(op: RunOp, origin: RunOrigin, pick: (list: CollectionList, status: StandardsStatus) => string[], options: { readList?: boolean } = {}): Promise<void> {
  if (get().run.kind === 'running') return;
  controller = new AbortController();
  const signal = controller.signal;
  set({ importNote: null, run: { kind: 'running', op, origin, progress: idleProgress(), reading: options.readList === true } });
  let listProblem = false;
  let list = getCollectionList().list;
  if (options.readList) {
    const loaded = await (deps.refreshList ?? ((o) => refreshCollectionList(o)))({ force: true });
    listProblem = loaded.source === 'bundled' && loaded.problem !== null;
    list = loaded.list;
    set({ listVersion: get().listVersion + 1 });
  }
  const before = await standardsStatus(deps.download?.store);
  const ids = signal.aborted ? [] : pick(list, before);
  addKnown(ids);
  const result =
    ids.length === 0
      ? { outcomes: [], tunes: 0, cancelled: signal.aborted }
      : await downloadCollections(ids, {
          ...deps.download,
          list,
          signal,
          onProgress: (progress) => set({ run: { kind: 'running', op, origin, progress, reading: false } }),
        });
  controller = null;
  const status = await standardsStatus(deps.download?.store);
  const report = buildReport({ op, list, result, status, can: deps.can, listProblem });
  set({ status, run: { kind: 'done', op, origin, result, status, report } });
}

/** Every collection this device can download (« Oui (recommandé) », « Tout télécharger »), a failure not stopping the others. */
export function downloadAllStandards(origin: RunOrigin = 'settings'): Promise<void> {
  return startRun('all', origin, (list) => downloadableCollections(list, deps.can).map((c) => c.id));
}

/** One collection of the list, from its row in « Réglages → Avancé ». */
export function downloadOneStandard(id: string): Promise<void> {
  return startRun('one', 'settings', (list) => list.collections.filter((c) => c.id === id).map((c) => c.id));
}

/**
 * « Vérifier les mises à jour de grilles »: reads the list of collections again, then downloads the collections
 * the app has not offered yet (new in the list) and reads the kept ones again, replacing those whose charts
 * changed. A collection removed on purpose, or imported from a file, is left alone.
 */
export function checkStandardsUpdates(): Promise<void> {
  const can = (): ((spec: CollectionSpec) => boolean) => deps.can ?? isDownloadable;
  return startRun(
    'update',
    'settings',
    (list, status) => {
      const known = readKnown();
      const kept = new Map(status.collections.map((c) => [c.id, c]));
      return downloadableCollections(list, can()).flatMap((c) => {
        const k = kept.get(c.id);
        if (k) return k.fromFile ? [] : [c.id];
        return known.has(c.id) ? [] : [c.id];
      });
    },
    { readList: true },
  );
}

export function cancelStandardsDownload(): void {
  controller?.abort();
}

/** The result has been read: back to the quiet state (the question comes again at the next launch if nothing could be had). */
export function dismissStandardsResult(): void {
  const empty = (get().status?.collections.length ?? 0) === 0;
  set({ run: { kind: 'idle' }, importNote: null, follow: false, ...(empty ? { postponed: true } : {}) });
}

/** Keeps the charts of a file the user chose (the web fallback, and a convenience in the Mac app). */
export async function importStandards(file: TextFile): Promise<void> {
  const result = await importStandardsFile(file, deps.download ? { store: deps.download.store, now: deps.download.now } : {});
  const status = await standardsStatus(deps.download?.store);
  if (result.ok) addKnown(result.added.map((a) => a.id));
  set({ status, importNote: result.ok ? { kind: 'ok', tunes: result.tunes } : { kind: 'error', reason: result.reason } });
}

/** One collection removed from the device (and not offered again by « Vérifier les mises à jour »). */
export async function removeStandard(id: string): Promise<void> {
  await removeStandards([id], deps.download?.store);
  addKnown([id]);
  set({ status: await standardsStatus(deps.download?.store), importNote: null });
}

/** Everything removed (« Libérer » of « Place sur cet appareil »). */
export async function forgetStandards(): Promise<void> {
  await removeStandards(undefined, deps.download?.store);
  set({ status: await standardsStatus(deps.download?.store), run: { kind: 'idle' }, importNote: null });
}

/** For tests. */
export function resetStandardsState(): void {
  controller?.abort();
  controller = null;
  deps = {};
  prefs = undefined;
  standardsStore.setState(initialStandardsState(), true);
}
