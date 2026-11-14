// The project keeper: keeps the open project on the device as it changes.
//
//   - A new piece is stored once, after it has opened successfully:
//     `keepNewProject()` writes its original audio and its document in one
//     transaction, replacing the previous project.
//   - From then on every change of the project document (title, tempo map,
//     loop, key, tempo, mixes, view settings that belong to the document) is
//     saved shortly after it happens: debounced, with a ceiling so that a long
//     gesture (dragging a zoom slider) still gets saved, one write at a time,
//     never awaited by the interface. `flush()` saves at once (page hidden).
//   - The demo piece is never kept.
//   - When the device refuses (private window, storage blocked or full), the
//     app carries on; `onNotice` tells the interface, which shows one calm
//     sentence, once.

import type { ProjectDocument } from '../model/document';
import { documentChanged, toProjectDocument } from '../store/document';
import type { AppState, AppStore, StorageNotice } from '../store/store';
import { StorageError, type ProjectStorage, type StoredAudio } from './ProjectStorage';
import { withTimeout } from './timeout';

export interface KeeperOptions {
  /** Quiet time after the last change before saving. */
  delayMs?: number;
  /** Longest a pending change waits while changes keep coming. */
  maxWaitMs?: number;
  /** Told when saving starts failing (`'full'`, `'unavailable'`) and when it works again (null). */
  onNotice?: (notice: StorageNotice | null) => void;
  /** A write that has not finished after this long is given up on, so that later saves are not stuck behind it. */
  writeTimeoutMs?: number;
}

export const AUTOSAVE_DELAY_MS = 700;
export const AUTOSAVE_MAX_WAIT_MS = 5000;
/** Generous: a long piece is tens of MB to write; a write that never answers must still not block every later save. */
export const WRITE_TIMEOUT_MS = 120_000;

export class ProjectKeeper {
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  private readonly writeTimeoutMs: number;
  /** The project whose document may be autosaved: set once its audio is stored. */
  private attached: string | null = null;
  /** The state the device holds, to tell whether anything changed since. */
  private saved: AppState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPending = 0;
  private chain: Promise<void> = Promise.resolve();
  private persistenceAsked = false;
  private noticed: StorageNotice | null = null;
  private stop: (() => void) | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly storage: ProjectStorage,
    private readonly options: KeeperOptions = {},
  ) {
    this.delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
    this.maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
    this.writeTimeoutMs = options.writeTimeoutMs ?? WRITE_TIMEOUT_MS;
  }

  /** Id of the project being autosaved, or null while none is (yet). */
  get attachedProject(): string | null {
    return this.attached;
  }

  /** Starts following the store, and saves when the page is hidden. Returns the stop function. */
  start(): () => void {
    if (this.stop) return this.stop;
    const off = this.store.subscribe((state, prev) => this.onChange(state, prev));
    const onHide = () => void this.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', onVisibility);
    }
    this.stop = () => {
      off();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.stop = null;
    };
    return this.stop;
  }

  /**
   * To call once a freshly imported piece is open and playable: keeps its
   * original audio (`originals`, by `AudioRef.id`) and document, replacing the
   * stored project. Never rejects; failure becomes a notice and the previous
   * project is dropped too, so that the next launch does not reopen a piece
   * the user has moved on from.
   */
  async keepNewProject(originals: ReadonlyMap<string, StoredAudio>): Promise<void> {
    this.cancelTimer();
    this.attached = null;
    let state: AppState;
    let doc: ProjectDocument | null;
    try {
      state = this.store.getState();
      doc = toProjectDocument(state);
    } catch {
      return;
    }
    if (!doc || doc.project.source.kind === 'demo') return;
    if (!this.persistenceAsked) {
      this.persistenceAsked = true;
      void this.storage.requestPersistence().catch(() => false);
    }
    const written = doc;
    await this.enqueue(async () => {
      try {
        await withTimeout(this.storage.replaceCurrent(written, originals), this.writeTimeoutMs, 'write');
        this.attached = written.project.id;
        this.saved = state;
        this.notify(null);
      } catch (e) {
        this.notify(noticeFor(e));
        await withTimeout(this.storage.clearCurrent(), this.writeTimeoutMs, 'write').catch(() => {});
      }
    });
    // Changes made while the audio was being written.
    if (this.attached) this.onChange(this.store.getState(), state);
  }

  /** The stored project is the one now open (after a restore): autosave it from here. */
  adopt(projectId: string): void {
    this.cancelTimer();
    this.attached = projectId;
    this.saved = this.store.getState();
  }

  /** Forgets what is attached (a new piece is being opened). */
  detach(): void {
    this.cancelTimer();
    this.attached = null;
  }

  /** Saves a pending change now. Resolves when the write has finished (or failed). */
  flush(): Promise<void> {
    if (this.timer === null) return this.chain;
    this.cancelTimer();
    return this.enqueueSave();
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private onChange(state: AppState, prev: AppState): void {
    if (state.project?.id !== this.attached) {
      // A piece is opening (or none is open): its document is written by `keepNewProject`.
      if (prev.project?.id !== state.project?.id) this.cancelTimer();
      return;
    }
    if (this.saved && !documentChanged(state, this.saved)) {
      this.cancelTimer();
      return;
    }
    const now = Date.now();
    if (this.timer === null) this.firstPending = now;
    else clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.delayMs, this.firstPending + this.maxWaitMs - now));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.enqueueSave();
    }, wait);
  }

  private enqueueSave(): Promise<void> {
    return this.enqueue(async () => {
      try {
        const state = this.store.getState();
        const doc: ProjectDocument | null = toProjectDocument(state);
        if (!doc || doc.project.id !== this.attached) return;
        if (this.saved && !documentChanged(state, this.saved)) return;
        await withTimeout(this.storage.saveCurrent(doc), this.writeTimeoutMs, 'write');
        this.saved = state;
        this.notify(null);
      } catch (e) {
        this.notify(noticeFor(e));
      }
    });
  }

  /**
   * Runs `job` after the writes already queued. The queue never rejects (a
   * failing job must not poison every later save, nor surface as an unhandled
   * rejection when nobody awaits it).
   */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job).catch(() => {});
    this.chain = run;
    return run;
  }

  private notify(notice: StorageNotice | null): void {
    if (notice === this.noticed) return;
    this.noticed = notice;
    this.options.onNotice?.(notice);
  }
}

function noticeFor(e: unknown): StorageNotice {
  return e instanceof StorageError && e.code === 'quota' ? 'full' : 'unavailable';
}
