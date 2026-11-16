// « Annuler » / « Rétablir » (C11) and the « modified since the last save »
// state of the open project (C5).
//
// The mechanism is generic: it follows the store, compares the undoable part
// of the state before and after each change (by reference, slice by slice) and
// keeps the part as it was before. No action has to know about it.
//
// What is undoable, by slice (whatever fields a slice gains later):
//   - `corrections` (chords, sections, key, tuning, tempo fixes, and what
//     version 6 adds there: key changes, structure), `tempoMap` (every grid
//     correction, meters and signatures), `loop`, `markers`, `playback`
//     (semitones, cents, tempo ratio, metronome on/off), `metronome`;
//   - the mix of the tracks (mute, solo, volume), wherever a track is: shown,
//     set aside, or in another kept separation. It is kept as a table by
//     track id and given back by id: a track that is gone is skipped, a track
//     that is new is left as it is;
//   - `analysis`, but only inside an explicit step (`transact`): the manual
//     tempo actions (`store/tempoFixActions.ts`) change the grid, the tempo
//     fixes and the analysed chords together, and one undo gives back all three.
//
// Not undoable: import, separation (`separation`, `tracks` other than their
// mix), a full analysis, the applied render (`keptRender`), app settings
// (`settings`), the view, `exportPrefs`, `ui`, the transport and run states.
//
// History rules:
//   - a full analysis (`analysis` changed outside `transact`) clears the
//     history: no step recorded before it may bring back a grid or a chord
//     reading that contradicts the new result;
//   - a project change (new, open, reopen at launch, close) clears it too;
//   - a separation, a swap of the shown set, the render: no step, the history
//     stays (the mix goes back by track id);
//   - a gesture (a pointer held down, or `beginGesture` / `endGesture`,
//     `transact`) is one step; rapid changes of the same continuous field
//     (a slider moved with the keyboard, « + » pressed several times) within
//     `COALESCE_MS` are one step too;
//   - at most `HISTORY_LIMIT` steps, the oldest dropped.
//
// « Modified » (C5): the open project is modified when its undoable part
// differs from the one at the save point (`markSaved`), or when a change that
// cannot be undone but is part of the project happened since (analysis,
// separation, applied render). Undoing back to the save point reads « not
// modified » again, unless such a change happened in between. A new piece
// (import, autosaved piece reopened at launch) starts modified: it was never
// saved to a `.fab` file (or nothing says the file still matches); the demo
// piece starts unmodified. Opening a `.fab` must call `markSaved()` once the
// piece is in place. Not saved in the document.

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { t, type MessageKey } from '../i18n';
import type { Track } from '../model/project';
import { appStore, type AppState, type AppStore } from './store';

/** How many steps can be undone. */
export const HISTORY_LIMIT = 100;
/** Changes of the same continuous field closer than this make one step. */
export const COALESCE_MS = 500;

/** The undoable slices, compared by reference. */
const SLICES = ['corrections', 'tempoMap', 'loop', 'markers', 'playback', 'metronome', 'analysis'] as const;
type SliceName = (typeof SLICES)[number];
/** Slices compared one level deeper: the field that changed names the step and decides the coalescing. */
const DEEP: ReadonlySet<SliceName> = new Set<SliceName>(['corrections', 'playback', 'metronome']);

type MixField = 'mute' | 'solo' | 'volume';
const MIX_FIELDS: readonly MixField[] = ['mute', 'solo', 'volume'];
export type TrackMix = Pick<Track, MixField>;
type MixTable = ReadonlyMap<string, TrackMix>;

/** The undoable part of the state. Slices are shared with the store (structural sharing: cheap). */
interface Snapshot extends Pick<AppState, SliceName> {
  /** Mix by track id, over every track the project holds. */
  mix: MixTable;
  /** Where `mix` was read from (to avoid reading it again when they did not change). */
  mixFrom: { tracks: AppState['tracks']; separation: AppState['separation'] };
}

interface Step {
  /** The undoable part as it was before the step (undo stack) or after it (redo stack). */
  snapshot: Snapshot;
  /** What the step changed, for « Annuler : … » (an `history.what.*` key). */
  what: MessageKey;
  /** The fields it changed (for coalescing). */
  key: string;
  coalescible: boolean;
  /** Last time it was extended (ms). */
  at: number;
}

/** What the menu shows. */
export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  /** « Annuler : volume de la piste », or null when there is nothing to undo (the menu then shows « Annuler », greyed). */
  undoLabel: string | null;
  /** « Rétablir : volume de la piste », or null. */
  redoLabel: string | null;
  /** The open project changed since its last save point (C5). False when no project is open. */
  modified: boolean;
}

export interface HistoryOptions {
  limit?: number;
  coalesceMs?: number;
  now?: () => number;
  /** Called after an undo or a redo put a state back (the app brings the playhead into a restored loop). */
  afterRestore?: (state: AppState, before: AppState) => void;
}

// ---------------------------------------------------------------- labels

/** First match wins: what a step is called, from the fields it changed. */
const LABELS: readonly [RegExp, MessageKey][] = [
  [/^analysis$/, 'history.what.tempoFix'],
  [/^tempoMap$/, 'history.what.grid'],
  [/^corrections\.tempoFixes$/, 'history.what.tempoFix'],
  [/^corrections\.(chords|handSpans)$/, 'history.what.chords'],
  [/^corrections\.sections$/, 'history.what.sections'],
  [/^corrections\.key/, 'history.what.key'],
  [/^corrections\.tuning/, 'history.what.tuning'],
  [/^corrections\.struct/, 'history.what.structure'],
  [/^corrections\./, 'history.what.corrections'],
  [/^markers$/, 'history.what.markers'],
  [/^loop$/, 'history.what.loop'],
  [/^mix\.volume\./, 'history.what.volume'],
  [/^mix\.mute\./, 'history.what.mute'],
  [/^mix\.solo\./, 'history.what.solo'],
  [/^playback\.semitones$/, 'history.what.semitones'],
  [/^playback\.cents$/, 'history.what.cents'],
  [/^playback\.tempoRatio$/, 'history.what.tempo'],
  [/^playback\.metronome$/, 'history.what.metronomeOn'],
  [/^playback\./, 'history.what.playback'],
  [/^metronome\./, 'history.what.metronome'],
];

/** Fields a slider or a repeated « + » moves continuously: rapid changes of one of them are one step. */
const CONTINUOUS = /^(mix\.volume\.|playback\.(cents|tempoRatio)$|metronome\.(volume|acceleration)$|loop$|corrections\.tuningCents$)/;

/** The name of a step that changed these fields. */
export function labelFor(fields: readonly string[]): MessageKey {
  for (const [re, key] of LABELS) if (fields.some((f) => re.test(f))) return key;
  return 'history.what.change';
}

// ---------------------------------------------------------------- snapshots

function shallowEqual(a: object | null, b: object | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

function loopEqual(a: AppState['loop'], b: AppState['loop']): boolean {
  if (a === b) return true;
  if (a.enabled !== b.enabled) return false;
  if (!a.region || !b.region) return a.region === b.region;
  return a.region.start === b.region.start && a.region.end === b.region.end;
}

/** Same content for the history (a slice copied without change is the same slice). */
function sameSlice(name: SliceName, a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (name === 'loop') return loopEqual(a as AppState['loop'], b as AppState['loop']);
  if (DEEP.has(name)) return shallowEqual(a as object | null, b as object | null);
  return false;
}

function sameMix(a: TrackMix, b: TrackMix): boolean {
  return a.mute === b.mute && a.solo === b.solo && a.volume === b.volume;
}

function mixTablesEqual(a: MixTable, b: MixTable): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, m] of a) {
    const o = b.get(id);
    if (!o || !sameMix(m, o)) return false;
  }
  return true;
}

function readMix(s: Pick<AppState, 'tracks' | 'separation'>): Map<string, TrackMix> {
  const table = new Map<string, TrackMix>();
  const add = (tr: Track) => table.set(tr.id, { mute: tr.mute, solo: tr.solo, volume: tr.volume });
  for (const tr of s.tracks) add(tr);
  for (const tr of s.separation.aside) add(tr);
  for (const o of s.separation.others) for (const tr of o.tracks) add(tr);
  return table;
}

/** The undoable part of `s`; slices with the same content as in `base` keep `base`'s (so that references compare). */
function snapshotOf(s: AppState, base: Snapshot | null): Snapshot {
  const out = {} as Snapshot;
  for (const name of SLICES) {
    const v = s[name];
    (out as unknown as Record<string, unknown>)[name] = base && sameSlice(name, base[name], v) ? base[name] : v;
  }
  if (base && base.mixFrom.tracks === s.tracks && base.mixFrom.separation === s.separation) {
    out.mix = base.mix;
  } else {
    const mix = readMix(s);
    out.mix = base && mixTablesEqual(base.mix, mix) ? base.mix : mix;
  }
  out.mixFrom = { tracks: s.tracks, separation: s.separation };
  return out;
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return SLICES.every((name) => sameSlice(name, a[name], b[name])) && mixTablesEqual(a.mix, b.mix);
}

/** The fields that differ between two snapshots (`corrections.chords`, `loop`, `mix.volume.<track id>`…). */
function changedFields(a: Snapshot, b: Snapshot): string[] {
  const fields: string[] = [];
  for (const name of SLICES) {
    const x = a[name];
    const y = b[name];
    if (sameSlice(name, x, y)) continue;
    if (DEEP.has(name) && x && y) {
      const ox = x as unknown as Record<string, unknown>;
      const oy = y as unknown as Record<string, unknown>;
      const keys = new Set([...Object.keys(ox), ...Object.keys(oy)]);
      for (const k of keys) if (ox[k] !== oy[k]) fields.push(`${name}.${k}`);
    } else fields.push(name);
  }
  if (a.mix !== b.mix) {
    // Only tracks present on both sides: a track that comes or goes is a separation, not a mix change.
    for (const [id, m] of b.mix) {
      const o = a.mix.get(id);
      if (!o) continue;
      for (const f of MIX_FIELDS) if (o[f] !== m[f]) fields.push(`mix.${f}.${id}`);
    }
  }
  return fields;
}

function withMix(tracks: Track[], mix: MixTable): Track[] {
  let changed = false;
  const out = tracks.map((tr) => {
    const m = mix.get(tr.id);
    if (!m || sameMix(m, tr)) return tr;
    changed = true;
    return { ...tr, mute: m.mute, solo: m.solo, volume: m.volume };
  });
  return changed ? out : tracks;
}

/** The store patch that puts `snap` back (the mix by track id, wherever the track is). */
function patchFor(s: AppState, snap: Snapshot): Partial<AppState> {
  const patch: Partial<AppState> = {};
  for (const name of SLICES) {
    if (s[name] !== snap[name]) (patch as Record<string, unknown>)[name] = snap[name];
  }
  const tracks = withMix(s.tracks, snap.mix);
  if (tracks !== s.tracks) patch.tracks = tracks;
  const aside = withMix(s.separation.aside, snap.mix);
  let othersChanged = false;
  const others = s.separation.others.map((o) => {
    const tr = withMix(o.tracks, snap.mix);
    if (tr === o.tracks) return o;
    othersChanged = true;
    return { ...o, tracks: tr };
  });
  if (aside !== s.separation.aside || othersChanged) patch.separation = { ...s.separation, aside, others: othersChanged ? others : s.separation.others };
  return patch;
}

/** A different project is in the store (new, opened, reopened, closed); a title edit is not one. */
function projectChanged(s: AppState, prev: AppState): boolean {
  if (s.project === prev.project) return false;
  return s.project?.id !== prev.project?.id || s.tracks !== prev.tracks;
}

/** Whether a project starts « modified » when it comes in: anything but the demo (never saved to a file). */
function startsModified(s: AppState): boolean {
  return s.project !== null && s.project.source.kind !== 'demo';
}

// ---------------------------------------------------------------- the history

export class StoreHistory {
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private undos: Step[] = [];
  private redos: Step[] = [];
  /** The undoable part as the history last saw it. */
  private last: Snapshot;
  /** The undoable part at the save point. */
  private savePoint: Snapshot;
  /** A change that cannot be undone but belongs to the project happened since the save point. */
  private dirty: boolean;
  /** The step the last recorded change went into (the only one later changes may extend). */
  private open: Step | null = null;
  private gestures: (MessageKey | null)[] = [];
  /** Inside `transact`: the analysis may change as part of the step. */
  private explicit = 0;
  private applying = false;
  private stopFn: (() => void) | null = null;
  readonly status: StoreApi<HistoryStatus>;

  constructor(
    private readonly store: AppStore,
    private readonly options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? HISTORY_LIMIT;
    this.coalesceMs = options.coalesceMs ?? COALESCE_MS;
    this.now = options.now ?? (() => Date.now());
    const s = store.getState();
    this.last = snapshotOf(s, null);
    this.savePoint = this.last;
    this.dirty = startsModified(s);
    this.status = createStore<HistoryStatus>()(() => this.computeStatus());
  }

  /** Starts following the store. Returns the stop function. */
  start(): () => void {
    if (this.stopFn) return this.stopFn;
    this.reset();
    const off = this.store.subscribe((s, prev) => this.onChange(s, prev));
    this.stopFn = () => {
      off();
      this.stopFn = null;
    };
    return this.stopFn;
  }

  /** Stops following the store. */
  stop(): void {
    this.stopFn?.();
  }

  // ------------------------------------------------------------ commands

  undo(): boolean {
    return this.move(this.undos, this.redos);
  }

  redo(): boolean {
    return this.move(this.redos, this.undos);
  }

  /** Starts a gesture: every change until the matching `endGesture` is one step, named `label` if given. */
  beginGesture(label: MessageKey | null = null): void {
    // A gesture never extends the step made just before it.
    if (!this.gestures.length) this.open = null;
    this.gestures.push(label);
  }

  endGesture(): void {
    if (!this.gestures.length) return;
    this.gestures.pop();
    if (!this.gestures.length) this.open = null;
  }

  /** Runs `fn` (synchronous) as one step, named `label` if given. The analysis may change inside it (manual tempo actions). */
  transact<T>(label: MessageKey | null, fn: () => T): T {
    this.beginGesture(label);
    this.explicit++;
    try {
      return fn();
    } finally {
      this.explicit--;
      this.endGesture();
    }
  }

  /** Forgets every step and sets the save point here; `modified` says how the project starts. */
  reset(opts: { modified?: boolean } = {}): void {
    const s = this.store.getState();
    this.undos = [];
    this.redos = [];
    this.open = null;
    this.last = snapshotOf(s, this.last);
    this.savePoint = this.last;
    this.dirty = opts.modified ?? startsModified(s);
    this.publish();
  }

  /** The project was just written to its file (or opened from it): not modified from here. */
  markSaved(): void {
    this.last = snapshotOf(this.store.getState(), this.last);
    this.savePoint = this.last;
    this.dirty = false;
    this.publish();
  }

  /** Something that belongs to the project changed and cannot be undone (for callers the generic rules do not see). */
  markModified(): void {
    this.dirty = true;
    this.publish();
  }

  getStatus(): HistoryStatus {
    return this.status.getState();
  }

  // ------------------------------------------------------------ internals

  private move(from: Step[], to: Step[]): boolean {
    const step = from.pop();
    if (!step) return false;
    const before = this.store.getState();
    to.push({ ...step, snapshot: this.last, at: 0 });
    this.open = null;
    this.applying = true;
    try {
      this.store.setState(patchFor(before, step.snapshot));
    } finally {
      this.applying = false;
    }
    const after = this.store.getState();
    // The restored part as it was, and the mix of tracks that came since read from the store.
    this.last = snapshotOf(after, step.snapshot);
    this.publish();
    this.options.afterRestore?.(after, before);
    return true;
  }

  private onChange(s: AppState, prev: AppState): void {
    if (this.applying) return;
    if (projectChanged(s, prev)) {
      this.reset();
      return;
    }
    const next = snapshotOf(s, this.last);
    const fields = changedFields(this.last, next);
    const before = this.last;
    this.last = next;
    if (s.separation !== prev.separation || s.keptRender !== prev.keptRender) this.dirty = true;
    if (fields.includes('analysis') && !this.explicit) {
      // A full analysis: earlier steps could bring back a grid or chords that contradict it.
      this.dirty = true;
      this.undos = [];
      this.redos = [];
      this.open = null;
      this.publish();
      return;
    }
    if (fields.length && s.project) this.record(before, next, fields);
    this.publish();
  }

  private record(before: Snapshot, after: Snapshot, fields: string[]): void {
    const now = this.now();
    const key = [...fields].sort().join('|');
    const top = this.undos[this.undos.length - 1];
    const inGesture = this.gestures.length > 0;
    const extend =
      top !== undefined &&
      top === this.open &&
      (inGesture || (top.coalescible && top.key === key && now - top.at <= this.coalesceMs));
    if (extend) {
      top.at = now;
      // Back where the step started (a slider brought back): no step at all.
      if (sameSnapshot(top.snapshot, after)) {
        this.undos.pop();
        this.open = null;
      }
      return;
    }
    const label = this.gestures.find((l) => l !== null) ?? labelFor(fields);
    const step: Step = { snapshot: before, what: label, key, coalescible: !inGesture && fields.every((f) => CONTINUOUS.test(f)), at: now };
    this.undos.push(step);
    if (this.undos.length > this.limit) this.undos.splice(0, this.undos.length - this.limit);
    this.redos = [];
    this.open = step;
  }

  private computeStatus(): HistoryStatus {
    const u = this.undos[this.undos.length - 1];
    const r = this.redos[this.redos.length - 1];
    const hasProject = this.store.getState().project !== null;
    return {
      canUndo: !!u,
      canRedo: !!r,
      undoLabel: u ? t('history.undoWhat', { what: t(u.what) }) : null,
      redoLabel: r ? t('history.redoWhat', { what: t(r.what) }) : null,
      modified: hasProject && (this.dirty || !sameSnapshot(this.last, this.savePoint)),
    };
  }

  private publish(): void {
    const next = this.computeStatus();
    const cur = this.status.getState();
    if (!shallowEqual(cur, next)) this.status.setState(next, true);
  }
}

// ---------------------------------------------------------------- the app-wide history

let app: StoreHistory | null = null;
let fallbackStatus: StoreApi<HistoryStatus> | null = null;

/** Starts the history of the app store (`main.tsx`, tests). Returns the stop function. */
export function startHistory(store: AppStore = appStore, options: HistoryOptions = {}): () => void {
  stopHistory();
  const h = new StoreHistory(store, options);
  app = h;
  const stop = h.start();
  return () => {
    stop();
    if (app === h) app = null;
  };
}

export function stopHistory(): void {
  app?.stop();
  app = null;
}

/** The running history, or null (tests that do not start one). */
export function getHistory(): StoreHistory | null {
  return app;
}

/** « Annuler »: true when a step was undone. */
export function undo(): boolean {
  return app?.undo() ?? false;
}

/** « Rétablir »: true when a step was redone. */
export function redo(): boolean {
  return app?.redo() ?? false;
}

export function beginGesture(label: MessageKey | null = null): void {
  app?.beginGesture(label);
}

export function endGesture(): void {
  app?.endGesture();
}

/** Runs `fn` as one undo step (see `StoreHistory.transact`); without a running history, just runs it. */
export function transact<T>(label: MessageKey | null, fn: () => T): T {
  return app ? app.transact(label, fn) : fn();
}

/** Forgets the history (a project change the generic rule cannot see). */
export function resetHistory(opts: { modified?: boolean } = {}): void {
  app?.reset(opts);
}

/** To call once the project was written to its `.fab` file, or opened from one. */
export function markSaved(): void {
  app?.markSaved();
}

export function markModified(): void {
  app?.markModified();
}

const NOTHING: HistoryStatus = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, modified: false };

export function historyStatus(): HistoryStatus {
  return app ? app.getStatus() : NOTHING;
}

export function canUndo(): boolean {
  return historyStatus().canUndo;
}

export function canRedo(): boolean {
  return historyStatus().canRedo;
}

export function undoLabel(): string | null {
  return historyStatus().undoLabel;
}

export function redoLabel(): string | null {
  return historyStatus().redoLabel;
}

/** The open project changed since its last save point (C5). */
export function isModified(): boolean {
  return historyStatus().modified;
}

/** Follows the status (the Mac menu bar greys its entries out). Returns the unsubscribe function. */
export function subscribeHistory(listener: (status: HistoryStatus) => void): () => void {
  return statusStore().subscribe(listener);
}

function statusStore(): StoreApi<HistoryStatus> {
  if (app) return app.status;
  fallbackStatus ??= createStore<HistoryStatus>()(() => NOTHING);
  return fallbackStatus;
}

/** React hook: the history status (or one field of it, with a selector). */
export function useHistoryStatus(): HistoryStatus;
export function useHistoryStatus<T>(selector: (s: HistoryStatus) => T): T;
export function useHistoryStatus<T>(selector?: (s: HistoryStatus) => T): T | HistoryStatus {
  return useStore(statusStore(), (selector ?? ((s: HistoryStatus) => s)) as (s: HistoryStatus) => T | HistoryStatus);
}

/** React hook: whether the open project is modified. */
export function useIsModified(): boolean {
  return useStore(statusStore(), (s) => s.modified);
}
