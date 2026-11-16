// The « saved or modified » state kept beside the autosave (C5), and what a
// piece reopened at launch makes of it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../model/document';
import { restoreSavedState } from '../project/restoredState';
import { fromProjectDocument } from '../store/document';
import { isModified, markSaved, startHistory, stopHistory, subscribeHistory, undo } from '../store/history';
import { appStore, initialState } from '../store/store';
import { sampleDocument } from '../test/sampleDocument';
import { AUTOSAVE_DELAY_MS, ProjectKeeper } from './keeper';
import { MemoryStorage } from './memoryStorage';
import type { StoredAudio } from './ProjectStorage';
import { memorySavedState, parseSavedState } from './savedState';

const original: StoredAudio = { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mpeg', fileName: 'a.mp3' };
const originals = new Map([['audio-1', original]]);

let storage: MemoryStorage;
let record: ReturnType<typeof memorySavedState>;
let keeper: ProjectKeeper;
let stops: (() => void)[];

function open(doc: ProjectDocument = sampleDocument()) {
  appStore.setState(fromProjectDocument(doc, appStore.getState()));
}
const setCents = (tuningCents: number) => appStore.setState((s) => ({ corrections: { ...s.corrections, tuningCents } }));

beforeEach(() => {
  vi.useFakeTimers();
  appStore.setState(initialState(), true);
  stops = [startHistory(appStore)];
  storage = new MemoryStorage();
  record = memorySavedState();
  keeper = new ProjectKeeper(appStore, storage, { modified: isModified, savedState: record });
  stops.push(keeper.start(), subscribeHistory(() => keeper.noteModified()));
});

afterEach(() => {
  for (const stop of stops) stop();
  stopHistory();
  vi.useRealTimers();
});

describe('the record beside the autosave', () => {
  it('reads only what it wrote', () => {
    expect(parseSavedState(JSON.stringify({ projectId: 'p', modified: false }))).toEqual({ projectId: 'p', modified: false });
    expect(parseSavedState('{')).toBeNull();
    expect(parseSavedState(JSON.stringify({ projectId: '', modified: false }))).toBeNull();
    expect(parseSavedState(JSON.stringify({ projectId: 'p', modified: 'no' }))).toBeNull();
    expect(parseSavedState(null)).toBeNull();
  });

  it('a new piece is kept « modified »; a save makes it « saved » at once, a change « modified » at once', async () => {
    open();
    await keeper.keepNewProject(originals);
    expect(record.record).toEqual({ projectId: 'project-1', modified: true });
    markSaved();
    expect(record.record).toEqual({ projectId: 'project-1', modified: false });
    setCents(12);
    expect(record.record?.modified).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(record.record?.modified).toBe(true);
  });

  it('a save while a change is still on its way to the device waits for that write', async () => {
    open();
    await keeper.keepNewProject(originals);
    setCents(12);
    // Saved before the autosave wrote the change: the device still holds the older document.
    markSaved();
    expect(record.record?.modified).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(JSON.parse(storage.json!).corrections.tuningCents).toBe(12);
    expect(record.record).toEqual({ projectId: 'project-1', modified: false });
  });

  it('a project opened from its file and saved by the keeper afterwards reads « saved »', async () => {
    open();
    const keeping = keeper.keepNewProject(originals);
    // `open.ts` marks it saved while its document is being written.
    markSaved();
    await keeping;
    expect(record.record).toEqual({ projectId: 'project-1', modified: false });
  });

  it('undo back to the save point is « saved » again', async () => {
    open();
    await keeper.keepNewProject(originals);
    markSaved();
    setCents(12);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    undo();
    expect(isModified()).toBe(false);
    // The device still holds the change until the next write.
    expect(record.record?.modified).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(record.record?.modified).toBe(false);
  });
});

describe('a piece reopened at launch', () => {
  const reopen = () => {
    // A launch: the history starts the piece « modified », as `restoreProject` does.
    open();
    keeper.adopt('project-1');
  };

  it('saved on the web: « not modified », without a file', async () => {
    record.write({ projectId: 'project-1', modified: false });
    reopen();
    expect(isModified()).toBe(true);
    expect(await restoreSavedState('project-1', record)).toBe(true);
    expect(isModified()).toBe(false);
  });

  it('modified, another piece, no record, or instruments lost: « modified »', async () => {
    for (const r of [{ projectId: 'project-1', modified: true }, { projectId: 'other', modified: false }, null]) {
      record.record = r;
      reopen();
      expect(await restoreSavedState('project-1', record)).toBe(false);
      expect(isModified()).toBe(true);
      appStore.setState(initialState(), true);
    }
    record.write({ projectId: 'project-1', modified: false });
    reopen();
    expect(await restoreSavedState('project-1', record, false)).toBe(false);
    expect(isModified()).toBe(true);
  });

  it('Mac app: « not modified » only when the file is still there; gone, « modified » and no file', async () => {
    const bridge = { recallProjectFile: vi.fn(async () => ({ name: 'Blues.fab' })) };
    vi.stubGlobal('window', { fabtice: { ...bridge, ...Object.fromEntries(['systemInfo', 'ytdlpStatus', 'ytdlpCheck', 'ytdlpInstall', 'extract', 'copyText', 'onYtdlpProgress', 'onExtractProgress'].map((m) => [m, () => {}])) } });
    try {
      const { getCurrentFile } = await import('../project/currentFile');
      record.write({ projectId: 'project-1', modified: false });
      reopen();
      expect(await restoreSavedState('project-1', record)).toBe(true);
      expect(isModified()).toBe(false);
      expect(getCurrentFile()?.name).toBe('Blues.fab');

      appStore.setState(initialState(), true);
      (window.fabtice as unknown as typeof bridge).recallProjectFile = vi.fn(async () => null) as never;
      reopen();
      expect(await restoreSavedState('project-1', record)).toBe(false);
      expect(isModified()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a change made while the file is looked for stands: still « modified »', async () => {
    const bridge = { recallProjectFile: vi.fn(async () => ({ name: 'Blues.fab' })) };
    vi.stubGlobal('window', { fabtice: { ...bridge, ...Object.fromEntries(['systemInfo', 'ytdlpStatus', 'ytdlpCheck', 'ytdlpInstall', 'extract', 'copyText', 'onYtdlpProgress', 'onExtractProgress'].map((m) => [m, () => {}])) } });
    try {
      record.write({ projectId: 'project-1', modified: false });
      reopen();
      const pending = restoreSavedState('project-1', record);
      setCents(5);
      expect(await pending).toBe(false);
      expect(isModified()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
