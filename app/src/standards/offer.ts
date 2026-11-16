// State of the offer to download the chord charts of standards (the opening screen and the settings
// entry): what is on the device, which collections are ticked, the download in progress and its
// result, and the two ways of not being asked again (« Plus tard » for this visit, « Ne plus
// proposer » kept on the device). A small store of its own: this is device data, not project data,
// and nothing here goes into a `.fab` document.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  downloadCollections,
  getCollectionList,
  importStandardsFile,
  isDownloadable,
  refreshCollectionList,
  removeStandards,
  standardsStatus,
  type DownloadProgress,
  type DownloadResult,
  type ImportFailure,
  type StandardsStatus,
  type TextFile,
} from './library';

export type StandardsRun =
  | { kind: 'idle' }
  | { kind: 'running'; progress: DownloadProgress }
  | { kind: 'done'; result: DownloadResult; status: StandardsStatus };

export type StandardsImportNote = { kind: 'ok'; tunes: number } | { kind: 'error'; reason: ImportFailure } | null;

export interface StandardsState {
  /** What is kept on the device; null until it has been read. */
  status: StandardsStatus | null;
  /** The collections ticked; null means the default choice (the recommended ones that can be downloaded here). */
  ticked: string[] | null;
  run: StandardsRun;
  importNote: StandardsImportNote;
  /** « Plus tard »: hidden for this visit only. */
  postponed: boolean;
  /** « Ne plus proposer »: kept on the device. */
  declined: boolean;
  /** The settings window (reached from « Réglages → Avancé »). */
  panelOpen: boolean;
  /** Bumped when the remote list of collections has replaced the bundled one (components redraw). */
  listVersion: number;
}

const DECLINED_KEY = 'fabtice.standards.offer.v1';

function readDeclined(): boolean {
  try {
    return window.localStorage.getItem(DECLINED_KEY) === 'declined';
  } catch {
    return false;
  }
}

function writeDeclined(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(DECLINED_KEY, 'declined');
    else window.localStorage.removeItem(DECLINED_KEY);
  } catch {
    // storage unavailable: asked again next time
  }
}

export function initialStandardsState(): StandardsState {
  return { status: null, ticked: null, run: { kind: 'idle' }, importNote: null, postponed: false, declined: false, panelOpen: false, listVersion: 0 };
}

export const standardsStore = createStore<StandardsState>()(() => initialStandardsState());

export function useStandards<T>(selector: (state: StandardsState) => T): T {
  return useStore(standardsStore, selector);
}

const set = (patch: Partial<StandardsState>): void => standardsStore.setState(patch);

/** The collections ticked now: the user's choice, else the recommended ones that this device can download. */
export function tickedCollections(state: Pick<StandardsState, 'ticked'>): string[] {
  if (state.ticked) return state.ticked;
  return getCollectionList()
    .list.collections.filter((c) => c.recommended && isDownloadable(c))
    .map((c) => c.id);
}

/** Should the opening screen propose the download? Nothing on the device, not declined, not postponed; or a run to show. */
export function offerVisible(state: StandardsState): boolean {
  if (state.run.kind !== 'idle') return true;
  return state.status !== null && state.status.total === 0 && !state.declined && !state.postponed;
}

/**
 * At launch: what is on the device, the « Ne plus proposer » choice, and (unless `remoteList` is false: the
 * test and demo addresses) the remote list of collections, the bundled one staying in use if it cannot be had.
 */
export async function initStandards(options: { remoteList?: boolean } = {}): Promise<void> {
  set({ declined: readDeclined() });
  await refreshStandardsStatus();
  if (options.remoteList !== false) {
    await refreshCollectionList();
    set({ listVersion: standardsStore.getState().listVersion + 1 });
  }
}

export async function refreshStandardsStatus(): Promise<void> {
  set({ status: await standardsStatus() });
}

export function toggleTicked(id: string): void {
  const now = tickedCollections(standardsStore.getState());
  set({ ticked: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] });
}

let controller: AbortController | null = null;

/** Downloads the ticked collections: real progress per collection, then an honest result. */
export async function startStandardsDownload(): Promise<void> {
  if (standardsStore.getState().run.kind === 'running') return;
  const ids = tickedCollections(standardsStore.getState());
  if (ids.length === 0) return;
  controller = new AbortController();
  set({ importNote: null, run: { kind: 'running', progress: { rows: [], fraction: 0 } } });
  const result = await downloadCollections(ids, {
    signal: controller.signal,
    onProgress: (progress) => set({ run: { kind: 'running', progress } }),
  });
  controller = null;
  const status = await standardsStatus();
  set({ status, run: { kind: 'done', result, status } });
}

export function cancelStandardsDownload(): void {
  controller?.abort();
}

/** The result has been read: back to the quiet state (the offer disappears once something is kept). */
export function dismissStandardsResult(): void {
  // Nothing could be had: do not propose the same thing again straight away (it comes back at the next visit).
  const empty = (standardsStore.getState().status?.total ?? 0) === 0;
  set({ run: { kind: 'idle' }, importNote: null, ...(empty ? { postponed: true } : {}) });
}

export function postponeOffer(): void {
  set({ postponed: true });
}

export function declineOffer(): void {
  writeDeclined(true);
  set({ declined: true });
}

/** From the settings: asking again is possible any time. */
export function openStandardsPanel(): void {
  set({ panelOpen: true, ticked: null, importNote: null });
}

export function closeStandardsPanel(): void {
  if (standardsStore.getState().run.kind === 'done') set({ run: { kind: 'idle' } });
  set({ panelOpen: false, importNote: null });
}

/** Keeps the charts of a file the user chose (the web fallback, and a convenience in the Mac app). */
export async function importStandards(file: TextFile): Promise<void> {
  const result = await importStandardsFile(file);
  const status = await standardsStatus();
  set({ status, importNote: result.ok ? { kind: 'ok', tunes: result.tunes } : { kind: 'error', reason: result.reason } });
}

export async function forgetStandards(): Promise<void> {
  await removeStandards();
  set({ status: await standardsStatus(), run: { kind: 'idle' }, importNote: null });
}

/** For tests. */
export function resetStandardsState(): void {
  controller?.abort();
  controller = null;
  standardsStore.setState(initialStandardsState(), true);
}
