// « Enregistrer » and « Enregistrer sous… » (C5).
//
//   saveProject()    overwrites the file of the open project, without a window
//                    unless it takes a while (a new separation to encode); a
//                    project with no file (never saved, or its file is gone, or
//                    the browser cannot write one) goes to « Enregistrer sous… ».
//   saveProjectAs()  the dialog « Enregistrer le projet » (what goes in), then
//                    the system's save panel (Mac app: native panel through the
//                    main process; Chromium: `showSaveFilePicker`); the file
//                    chosen becomes the project's file. Without either (Safari,
//                    Firefox) the dialog ends on a link that downloads the file.
//
// Both resolve `'saved' | 'cancelled' | 'failed'` (the alert « Enregistrer »
// uses it: it only goes on when the project was saved).
//
// How the file is written, whatever the destination:
//   - fast: the earlier file of the project (its directory and manifest are read
//     first) lends the entries that are still the same audio, copied as they are;
//     only what is new is encoded (a new separation, a new kept render). If a
//     copied entry does not read back as recorded, the file is written again
//     from the start without borrowing anything;
//   - safe: nothing replaces the old file before the new one is complete and
//     flushed. Mac app: a temporary file beside it, renamed over it by the main
//     process (`desktop/src/project-writer.js`). Chromium: `createWritable()`
//     writes to a swap file until `close()`. Any failure or cancellation leaves
//     the old file as it was;
//   - honest: the project reads « saved » only if it did not change while the
//     file was being written (a change meanwhile leaves it « modified »).

import { createStore } from 'zustand/vanilla';
import { yieldToMain } from '../audio/pcm';
import { getDesktopBridge, type DesktopBridge } from '../platform/desktopBridge';
import { appStore, gridInForce, type AppState } from '../store/store';
import { markSaved } from '../store/history';
import { clearCurrentFile, getCurrentFile, setCurrentFile, type FileRef } from './currentFile';
import { projectFileName, ProjectFileError, readReusableFile, ReuseError, writeProjectFile, type FlacEncode } from './fileFormat';
import { canSaveToFile, canWrite, pickSaveHandle, type FileHandle } from './fileSystem';
import { appEncoder, blobSink, bufferedSink, gatherProject, parallelism, ProjectSaveError, saveRefusal } from './save';
import { blobSource, type ByteSink, type ByteSource } from './zip';

export type SaveOutcome = 'saved' | 'cancelled' | 'failed';

export interface SaveRunOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Replaces libFLAC (tests). */
  encode?: FlacEncode;
}

// ---------------------------------------------------------------- destinations

/** Where the bytes of a save go. Nothing replaces the earlier file before `commit`. */
interface Destination {
  sink: ByteSink & { flush(): Promise<void>; reset(): void };
  /** Starts the file again from its first byte (the first attempt borrowed an entry that did not read back). */
  restart(): Promise<void>;
  /** The file is complete: it replaces the earlier one. */
  commit(): Promise<{ name: string }>;
  /** The save is given up or failed: nothing remains, the earlier file is as it was. */
  abort(): Promise<void>;
  /** What becomes the project's file once committed (null: nothing, a download). */
  ref: FileRef | null;
}

const failed = (what: unknown): ProjectSaveError => (what instanceof ProjectSaveError ? what : new ProjectSaveError('failed', what instanceof Error ? what.message : String(what)));

/**
 * Mac app. `choose` asks for the place now (the system's panel); `current` opens its temporary file when the first
 * bytes come, after the encoding, so that none sits beside the project while it works.
 * Resolves null when the user closed the panel.
 */
async function desktopDestination(bridge: DesktopBridge, projectId: string, mode: 'current' | 'choose', suggestedName: string): Promise<Destination | null> {
  let session: string | null = null;
  const begin = async (): Promise<void> => {
    const r = await bridge.beginProjectSave!({ projectId, target: mode, suggestedName });
    if (!r.ok) {
      if (r.reason === 'cancelled') throw new ProjectSaveError('cancelled');
      throw new ProjectSaveError(r.reason === 'no-file' ? 'no-file' : 'failed', r.reason);
    }
    session = r.session;
  };
  if (mode === 'choose') {
    try {
      await begin();
    } catch (e) {
      if (e instanceof ProjectSaveError && e.code === 'cancelled') return null;
      throw e;
    }
  }
  const inner: ByteSink = {
    async write(chunk) {
      if (session === null) await begin();
      const r = await bridge.writeProjectSave!(session!, chunk);
      if (!r.ok) {
        session = null;
        throw new ProjectSaveError(r.reason === 'too-large' ? 'too-large' : 'failed', r.reason);
      }
    },
  };
  const sink = bufferedSink(inner);
  return {
    sink,
    ref: { kind: 'desktop' },
    async restart() {
      sink.reset();
      if (session !== null) {
        const r = await bridge.restartProjectSave!(session);
        if (!r.ok) throw new ProjectSaveError('failed', r.reason);
      }
    },
    async commit() {
      if (session === null) await begin();
      const r = await bridge.finishProjectSave!(session!);
      session = null;
      if (!r.ok) throw new ProjectSaveError('failed', r.reason);
      return { name: r.name };
    },
    async abort() {
      const s = session;
      session = null;
      if (s !== null) await bridge.abortProjectSave!(s).catch(() => {});
    },
  };
}

/** Chromium: a file handle. `createWritable()` writes to a swap file until `close()`: the file is whole or untouched. */
function handleDestination(handle: FileHandle): Destination {
  let writable: Awaited<ReturnType<FileHandle['createWritable']>> | null = null;
  const inner: ByteSink = {
    async write(chunk) {
      writable ??= await handle.createWritable();
      await writable.write(chunk);
    },
  };
  const sink = bufferedSink(inner);
  const drop = async () => {
    const w = writable;
    writable = null;
    sink.reset();
    if (w) await w.abort().catch(() => {});
  };
  return {
    sink,
    ref: { kind: 'handle', handle },
    restart: drop,
    async commit() {
      // An empty file is never closed as « saved »: the zip always has bytes.
      if (!writable) throw new ProjectSaveError('failed', 'nothing written');
      // Kept until the close succeeds: a failed one is aborted (its swap file removed), the file stays as it was.
      await writable.close();
      writable = null;
      return { name: handle.name };
    },
    abort: drop,
  };
}

/** No way to write a file (Safari, Firefox, an older Mac app): the bytes are gathered, then offered as a download. */
function downloadDestination(name: string): Destination & { blob(): Blob } {
  let sink = blobSink();
  const buffered = bufferedSink({ write: (c) => sink.write(c) });
  return {
    sink: buffered,
    ref: null,
    async restart() {
      buffered.reset();
      sink = blobSink();
    },
    async commit() {
      return { name };
    },
    async abort() {},
    blob: () => sink.blob(),
  };
}

// ---------------------------------------------------------------- the earlier file

/** The earlier file of the open project as a source to copy entries from, or null (no file, gone, unreadable). */
async function earlierFile(): Promise<ByteSource | null> {
  const file = getCurrentFile();
  if (!file) return null;
  try {
    if (file.ref.kind === 'desktop') {
      const bridge = getDesktopBridge();
      const info = await bridge?.projectFileInfo?.(file.projectId);
      if (!bridge || !info || !bridge.readCurrentProjectFile) return null;
      const id = file.projectId;
      return {
        size: info.size,
        read: async (offset, length) => {
          const out = new Uint8Array(length);
          let at = 0;
          while (at < length) {
            const n = Math.min(16 * 1024 * 1024, length - at);
            const part = await bridge.readCurrentProjectFile!(id, offset + at, n);
            out.set(part, at);
            at += part.length;
            if (part.length < n) return out.subarray(0, at);
          }
          return out;
        },
      };
    }
    return blobSource(await file.ref.handle.getFile());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the write itself

/** The parts of the state a file holds, by reference: if they are the same afterwards, nothing changed meanwhile. */
function stateOfFile(s: AppState): unknown[] {
  return [s.project, s.tracks, gridInForce(s), s.loop, s.playback, s.analysis, s.corrections, s.separation, s.metronome, s.markers, s.keptRender, s.exportPrefs, s.view];
}
const sameState = (a: unknown[], b: unknown[]) => a.every((x, i) => x === b[i]);

/** What a failure of the writing means for the page. */
function explain(e: unknown, signal?: AbortSignal): ProjectSaveError {
  if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return new ProjectSaveError('cancelled');
  if (e instanceof ProjectSaveError) return e;
  if (e instanceof ProjectFileError && e.code === 'too-large') return new ProjectSaveError('too-large', e.message);
  return failed(e);
}

interface Written {
  name: string;
  /** The project did not change while the file was being written: it can read « saved ». */
  complete: boolean;
}

/** Writes the open project to `dest`, borrowing from `earlier`. The earlier file is replaced only on success. */
async function write(dest: Destination, earlier: ByteSource | null, options: SaveRunOptions): Promise<Written> {
  try {
    let reuse = earlier ? await readReusableFile(earlier) : null;
    const state = appStore.getState();
    const input = await gatherProject(state, reuse?.manifest ?? null);
    const before = stateOfFile(state);
    for (;;) {
      try {
        await writeProjectFile(input, dest.sink, {
          encode: options.encode ?? appEncoder,
          onProgress: options.onProgress,
          signal: options.signal,
          tick: yieldToMain,
          parallel: parallelism(),
          reuse,
        });
        await dest.sink.flush();
        const done = await dest.commit();
        return { name: done.name, complete: sameState(before, stateOfFile(appStore.getState())) };
      } catch (e) {
        if (e instanceof ReuseError && reuse) {
          // An entry borrowed from the earlier file did not read back as it was recorded: again, borrowing nothing.
          reuse = null;
          await dest.restart();
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    await dest.abort().catch(() => {});
    throw explain(e, options.signal);
  }
}

/** The project has been written to `ref`: it is its file, and it is saved unless it changed meanwhile. */
function written(projectId: string, w: Written, ref: FileRef | null): void {
  if (ref) setCurrentFile({ projectId, name: w.name, ref });
  if (w.complete) markSaved();
}

/**
 * « Enregistrer sous… » proper: the system's save panel, then the file. Resolves `{ kind: 'saved' }`,
 * `{ kind: 'cancelled' }` (the panel was closed), or, when this device cannot write a file, `{ kind: 'download' }`
 * with the bytes: the dialog offers them as a link (`finish` is for the click). Rejects with a `ProjectSaveError`.
 * Call it from the user's click, before awaiting anything (the browser's panel needs the gesture).
 */
export async function runSaveAs(options: SaveRunOptions = {}): Promise<{ kind: 'saved'; name: string } | { kind: 'cancelled' } | { kind: 'download'; blob: Blob; name: string; finish(): void }> {
  const refusal = saveRefusal();
  if (refusal) throw new ProjectSaveError(refusal);
  const project = appStore.getState().project!;
  const suggested = projectFileName(project.title);
  const bridge = getDesktopBridge();
  let dest: Destination | null;
  if (bridge?.beginProjectSave && bridge.writeProjectSave && bridge.finishProjectSave && bridge.abortProjectSave && bridge.restartProjectSave) {
    try {
      dest = await desktopDestination(bridge, project.id, 'choose', suggested);
    } catch (e) {
      throw explain(e);
    }
    if (!dest) return { kind: 'cancelled' };
  } else if (canSaveToFile()) {
    let handle: FileHandle | null;
    try {
      handle = await pickSaveHandle(suggested);
    } catch (e) {
      throw failed(e);
    }
    if (!handle) return { kind: 'cancelled' };
    dest = handleDestination(handle);
  } else {
    const download = downloadDestination(suggested);
    const state = stateOfFile(appStore.getState());
    const w = await write(download, null, options);
    const stillSame = () => sameState(state, stateOfFile(appStore.getState()));
    return { kind: 'download', blob: download.blob(), name: w.name, finish: () => (stillSame() ? markSaved() : undefined) };
  }
  const w = await write(dest, await earlierFile(), options);
  written(project.id, w, dest.ref);
  return { kind: 'saved', name: w.name };
}

/** What `saveToCurrent` found: written, or no file to write to (the caller then asks where). */
async function runSaveToCurrent(options: SaveRunOptions): Promise<{ kind: 'saved'; name: string } | { kind: 'no-file' }> {
  const refusal = saveRefusal();
  if (refusal) throw new ProjectSaveError(refusal);
  const file = getCurrentFile();
  if (!file) return { kind: 'no-file' };
  let dest: Destination;
  if (file.ref.kind === 'desktop') {
    const bridge = getDesktopBridge();
    if (!bridge?.beginProjectSave || !bridge.writeProjectSave || !bridge.finishProjectSave || !bridge.abortProjectSave || !bridge.restartProjectSave) return { kind: 'no-file' };
    // Gone from the disk, or moved: the main process says so before any encoding is done.
    if (!(await bridge.projectFileInfo?.(file.projectId).catch(() => null))) return { kind: 'no-file' };
    dest = (await desktopDestination(bridge, file.projectId, 'current', file.name))!;
  } else {
    if (!(await canWrite(file.ref.handle))) return { kind: 'no-file' };
    dest = handleDestination(file.ref.handle);
  }
  const w = await write(dest, await earlierFile(), options);
  written(file.projectId, w, dest.ref);
  return { kind: 'saved', name: w.name };
}

// ---------------------------------------------------------------- what the page shows while it saves

export interface SaveActivity {
  /** `working`: a save is under way (shown only once it takes a while); `saved`: a short confirmation; `error`. */
  phase: 'idle' | 'working' | 'saved' | 'error';
  /** The progress window is shown (the save took more than a moment). */
  visible: boolean;
  fraction: number;
  code: string | null;
}

export const saveActivity = createStore<SaveActivity>()(() => ({ phase: 'idle', visible: false, fraction: 0, code: null }));
let abortCurrent: (() => void) | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;

/** How long a save may take before its progress window appears (a quick one shows only the confirmation). */
export const PROGRESS_DELAY_MS = 600;
const SAVED_NOTICE_MS = 2600;

/** « Annuler » in the progress window. */
export function cancelSave(): void {
  abortCurrent?.();
}

export function dismissSaveActivity(): void {
  saveActivity.setState({ phase: 'idle', visible: false, fraction: 0, code: null });
}

function showSaved(): void {
  if (savedTimer) clearTimeout(savedTimer);
  saveActivity.setState({ phase: 'saved', visible: false, fraction: 1, code: null });
  savedTimer = setTimeout(() => saveActivity.getState().phase === 'saved' && dismissSaveActivity(), SAVED_NOTICE_MS);
}

let running: Promise<SaveOutcome> | null = null;

/**
 * « Enregistrer » (cmd/Ctrl + S): overwrites the file of the open project; with none, it is « Enregistrer sous… ».
 * A save already under way is the answer to a second request.
 */
export function saveProject(options: SaveRunOptions = {}): Promise<SaveOutcome> {
  if (running) return running;
  const refusal = saveRefusal();
  if (refusal === 'no-project') return Promise.resolve('cancelled');
  if (!getCurrentFile() && !refusal) return saveProjectAs();
  const job = (async (): Promise<SaveOutcome> => {
    const controller = new AbortController();
    abortCurrent = () => controller.abort();
    if (savedTimer) clearTimeout(savedTimer);
    saveActivity.setState({ phase: 'working', visible: false, fraction: 0, code: null });
    const timer = setTimeout(() => saveActivity.setState((s) => (s.phase === 'working' ? { ...s, visible: true } : s)), PROGRESS_DELAY_MS);
    try {
      const out = await runSaveToCurrent({
        ...options,
        signal: controller.signal,
        onProgress: (fraction) => {
          options.onProgress?.(fraction);
          saveActivity.setState((s) => (s.phase === 'working' && Math.round(fraction * 100) !== Math.round(s.fraction * 100) ? { ...s, fraction } : s));
        },
      });
      if (out.kind === 'no-file') {
        // Its file is gone (or the browser will not write to it): it has none any more, say where.
        dismissSaveActivity();
        clearCurrentFile();
        return await saveProjectAs();
      }
      showSaved();
      return 'saved';
    } catch (e) {
      const code = e instanceof ProjectSaveError ? e.code : 'failed';
      if (code === 'cancelled') {
        dismissSaveActivity();
        return 'cancelled';
      }
      saveActivity.setState({ phase: 'error', visible: true, fraction: 0, code });
      return 'failed';
    } finally {
      clearTimeout(timer);
      abortCurrent = null;
    }
  })();
  running = job;
  void job.finally(() => {
    if (running === job) running = null;
  });
  return job;
}

// ---------------------------------------------------------------- « Enregistrer sous… »: its dialog

let pendingAs: { promise: Promise<SaveOutcome>; resolve: (o: SaveOutcome) => void } | null = null;

/**
 * « Enregistrer sous… »: opens the dialog (what goes in, then the system's save panel). Resolves when it ends:
 * `'saved'`, or `'cancelled'` if it was closed before.
 */
export function saveProjectAs(): Promise<SaveOutcome> {
  if (pendingAs) return pendingAs.promise;
  let resolve!: (o: SaveOutcome) => void;
  const promise = new Promise<SaveOutcome>((r) => (resolve = r));
  pendingAs = { promise, resolve };
  appStore.setState((s) => ({ ui: { ...s.ui, saveProjectOpen: true, panel: 'none' } }));
  return promise;
}

/** The dialog ends (or is closed): whoever asked for « Enregistrer sous… » gets its answer. */
export function settleSaveAs(outcome: SaveOutcome): void {
  const p = pendingAs;
  pendingAs = null;
  p?.resolve(outcome);
}

/** True while the dialog of « Enregistrer sous… » was asked for by `saveProjectAs`. */
export function isSaveAsPending(): boolean {
  return pendingAs !== null;
}

/** Confirms to the page what the dialog did, for the short « Projet enregistré » notice. */
export function noteSaved(): void {
  showSaved();
}
