// « Enregistrer », « Enregistrer sous… » and the alert about changes not saved (C5), through the store:
// the file of the open project, a fast second save (nothing already encoded is encoded again), a safe one (a
// failure leaves the old file as it was), the « modified » state, and the four ways out of the alert.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { CHUNK, type PcmAudio } from '../audio/pcm';
import { clearAudio, getAudio, type DecodedAudio } from '../audio/registry';
import type { DesktopBridge } from '../platform/desktopBridge';
import { replaceRenderer } from '../render';
import { MockRenderer } from '../render/mock';
import { startKeptRenderWatch, startRenderWatch } from '../render/controller';
import { replaceSeparator } from '../separation';
import { setDevice } from '../separation/device';
import { MockSeparator } from '../separation/mock';
import { startSeparation } from '../separation/runner';
import { getKeeper, replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import type { StoredAudio } from '../storage/ProjectStorage';
import * as actions from '../store/actions';
import { isModified, startHistory } from '../store/history';
import { setSeparationModel } from '../store/separationActions';
import { appStore, initialState } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { nodeFlacEncode } from '../test/flacEncode';
import { clearCurrentFile, getCurrentFile, setCurrentFile } from './currentFile';
import { openProjectFile, type FlacEncode } from './fileFormat';
import type { FileHandle } from './fileSystem';
import { answerLeave, confirmLeaveProject, leaveDialog, requestNewProject } from './leave';
import { openProjectSource } from './open';
import { cancelSave, runSaveAs, saveActivity, saveProject, saveProjectAs, settleSaveAs } from './saveFlow';
import { installProjectWindow, windowTitle } from './windowState';
import { blobSource, bytesSource, readZipDirectory } from './zip';

const SR = ENGINE_SAMPLE_RATE;
const tone = (seconds: number, hz: number, amp = 0.4) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const ORIGINAL = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 31) & 255);

const decode = async (): Promise<DecodedAudio> => ({ channels: [tone(4, 110), tone(4, 220)], sampleRate: SR });

let storage: MemoryStorage;
let unwatch: (() => void)[] = [];
let stopHistory: (() => void) | null = null;

function freshApp() {
  for (const u of unwatch) u();
  stopHistory?.();
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  storage = new MemoryStorage();
  replaceProjectStorage(storage);
  getKeeper().start();
  unwatch = [startRenderWatch(), startKeptRenderWatch()];
  stopHistory = startHistory(appStore);
  saveActivity.setState({ phase: 'idle', visible: false, fraction: 0, code: null });
  clearCurrentFile();
  settleSaveAs('cancelled');
}

beforeEach(() => {
  freshApp();
  replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  replaceRenderer(new MockRenderer());
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  stopHistory?.();
  stopHistory = null;
});

const settle = () => new Promise((r) => setTimeout(r, 20));

async function openKeptPiece() {
  await actions.openProject({ title: 'Blues du dimanche', source: { kind: 'file', fileName: 'blues.mp3' }, tracks: [{ role: 'morceau', audio: await decode() }] });
  const s = appStore.getState();
  await getKeeper().keepNewProject(new Map(s.tracks.map((tr) => [tr.audio.id, { bytes: ORIGINAL.slice().buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' } as StoredAudio])));
}

async function separate(model: 'htdemucs-6s' | 'bs-roformer-sw', stems: string[]) {
  setSeparationModel(model);
  await startSeparation({ stems: stems as never });
  await settle();
  await getKeeper().settled();
}

/** The counting stand-in for libFLAC. */
function counting() {
  const calls: number[] = [];
  const encode: FlacEncode = (pcm, o) => {
    calls.push(pcm.frames);
    return nodeFlacEncode(pcm, o);
  };
  return { encode, calls };
}

interface MemoryFile {
  handle: FileHandle;
  bytes(): Uint8Array<ArrayBuffer>;
  log: { opened: number; closed: number; aborted: number; failClose: boolean; permission: PermissionState };
}

/** A file handle over memory, with the guarantee `createWritable()` gives: the file changes only when `close()` ends. */
function memoryFile(name = 'Blues du dimanche.fab'): MemoryFile {
  let data: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  const log = { opened: 0, closed: 0, aborted: 0, failClose: false, permission: 'granted' as PermissionState };
  const handle: FileHandle = {
    kind: 'file',
    name,
    getFile: async () => new File([data.slice()], name),
    createWritable: async () => {
      log.opened++;
      const parts: Uint8Array[] = [];
      return {
        write: async (d) => void parts.push(d instanceof Uint8Array ? d.slice() : new Uint8Array(await d.arrayBuffer())),
        close: async () => {
          if (log.failClose) throw new Error('disk full');
          const out: Uint8Array<ArrayBuffer> = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
          let at = 0;
          for (const p of parts) (out.set(p, at), (at += p.length));
          data = out;
          log.closed++;
        },
        abort: async () => void log.aborted++,
      };
    },
    queryPermission: async () => log.permission,
    requestPermission: async () => log.permission,
  };
  return { handle, bytes: () => data, log };
}

const picks = (m: MemoryFile | null) => vi.stubGlobal('window', { showSaveFilePicker: async () => (m ? m.handle : Promise.reject(new DOMException('closed', 'AbortError'))) });

const samePcm = (a: PcmAudio, b: PcmAudio) =>
  a.frames === b.frames &&
  a.mono === b.mono &&
  a.chunks.every((c, i) => {
    const d = b.chunks[i]!;
    for (let k = 0; k < CHUNK; k++) if (c.l[k] !== d.l[k] || (c.r?.[k] ?? 0) !== (d.r?.[k] ?? 0)) return false;
    return true;
  });

describe('« Enregistrer sous… » then « Enregistrer » (Chromium file handles)', () => {
  it('the file chosen becomes the project\'s file; the project reads « saved »; a change reads « modified »', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    expect(isModified()).toBe(true);
    const file = memoryFile();
    picks(file);
    const out = await runSaveAs({ encode: nodeFlacEncode });
    expect(out).toEqual({ kind: 'saved', name: 'Blues du dimanche.fab' });
    expect(getCurrentFile()?.name).toBe('Blues du dimanche.fab');
    expect(isModified()).toBe(false);
    expect(file.log.closed).toBe(1);
    // The file is a project that reads back.
    const opened = await openProjectFile(bytesSource(file.bytes()));
    await opened.verify();
    expect(opened.document.project.id).toBe(appStore.getState().project!.id);
    // A change reads « modified »; undoing it brings back « saved ».
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 2 } }));
    expect(isModified()).toBe(true);
  });

  it('a closed panel changes nothing', async () => {
    await openKeptPiece();
    picks(null);
    expect(await runSaveAs({ encode: nodeFlacEncode })).toEqual({ kind: 'cancelled' });
    expect(getCurrentFile()).toBeNull();
    expect(isModified()).toBe(true);
  });

  it('« Enregistrer » overwrites the same file, without encoding again what it already holds; the changed document comes back', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    const file = memoryFile();
    picks(file);
    const first = counting();
    await runSaveAs({ encode: first.encode });
    expect(first.calls.length).toBeGreaterThanOrEqual(2);
    const tracksBefore = appStore.getState().tracks.filter((t) => t.audio.origin === 'separated').map((t) => [t.audio.id, getAudio(t.audio.id)!] as const);
    // Only the document changes.
    appStore.setState((s) => ({ loop: { region: { start: 0.5, end: 2 }, enabled: true }, corrections: { ...s.corrections, key: { tonic: 7, mode: 'minor' } as never } }));
    expect(isModified()).toBe(true);
    const second = counting();
    expect(await saveProject({ encode: second.encode })).toBe('saved');
    expect(second.calls).toEqual([]);
    expect(file.log.closed).toBe(2);
    expect(isModified()).toBe(false);
    expect(saveActivity.getState().phase).toBe('saved');
    const opened = await openProjectFile(blobSource(new Blob([file.bytes()])));
    await opened.verify();
    expect(opened.document.loop.region).toEqual({ start: 0.5, end: 2 });
    expect(opened.document.corrections.key).toEqual({ tonic: 7, mode: 'minor' });
    for (const [id, pcm] of tracksBefore) expect(samePcm(await opened.readTrack(id), pcm), id).toBe(true);
    expect(new Uint8Array((await opened.readOriginal(appStore.getState().tracks.find((t) => t.audio.origin === 'original')?.audio.id ?? appStore.getState().separation.aside[0]!.audio.id)).bytes)).toEqual(ORIGINAL);
  });

  it('encodes only what is new: a second separation is encoded, the first is copied', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    await separate('bs-roformer-sw', ['drums', 'piano']);
    const spy = counting();
    expect(await saveProject({ encode: spy.encode })).toBe('saved');
    const s = appStore.getState();
    const newTracks = s.tracks.filter((t) => t.audio.origin === 'separated').length;
    expect(spy.calls.length).toBe(newTracks);
    const opened = await openProjectFile(bytesSource(file.bytes()));
    await opened.verify();
    expect(opened.document.separation.others.length).toBe(1);
    for (const o of opened.document.separation.others) for (const tr of o.tracks) expect(await opened.readTrack(tr.audio.id)).toBeTruthy();
    for (const tr of s.tracks.filter((t) => t.audio.origin === 'separated')) expect(samePcm(await opened.readTrack(tr.audio.id), getAudio(tr.audio.id)!)).toBe(true);
  });

  it('a failure at the end leaves the old file as it was, says so calmly, and the project stays modified', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    const old = file.bytes().slice();
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 5 } }));
    file.log.failClose = true;
    expect(await saveProject({ encode: nodeFlacEncode })).toBe('failed');
    expect(file.bytes()).toEqual(old);
    expect(isModified()).toBe(true);
    expect(saveActivity.getState()).toMatchObject({ phase: 'error', code: 'failed' });
    expect(file.log.aborted).toBeGreaterThanOrEqual(1);
    // The next try works.
    file.log.failClose = false;
    expect(await saveProject({ encode: nodeFlacEncode })).toBe('saved');
    expect(file.bytes()).not.toEqual(old);
    expect(isModified()).toBe(false);
  });

  it('a change made while the file is written leaves the project « modified » (what was written is not what is now)', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    await separate('htdemucs-6s', ['vocals']);
    const hook: FlacEncode = async (pcm, o) => {
      appStore.setState((s) => ({ playback: { ...s.playback, cents: 12 } }));
      return nodeFlacEncode(pcm, o);
    };
    expect(await saveProject({ encode: hook })).toBe('saved');
    expect(isModified()).toBe(true);
    expect(await saveProject({ encode: nodeFlacEncode })).toBe('saved');
    expect(isModified()).toBe(false);
  });

  it('cancelled while encoding: the old file is untouched', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    const old = file.bytes().slice();
    await separate('htdemucs-6s', ['vocals']);
    const hook: FlacEncode = async (pcm, o) => {
      cancelSave();
      return nodeFlacEncode(pcm, o);
    };
    expect(await saveProject({ encode: hook })).toBe('cancelled');
    expect(file.bytes()).toEqual(old);
    expect(saveActivity.getState().phase).toBe('idle');
    expect(isModified()).toBe(true);
  });

  it('a file the browser will no longer let us write: « Enregistrer » asks where (the Save As dialog)', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 1 } }));
    file.log.permission = 'denied';
    const asked = saveProject();
    await settle();
    expect(appStore.getState().ui.saveProjectOpen).toBe(true);
    expect(getCurrentFile()).toBeNull();
    settleSaveAs('cancelled');
    expect(await asked).toBe('cancelled');
    expect(isModified()).toBe(true);
  });

  it('without a file, « Enregistrer » is « Enregistrer sous… »: the dialog opens and answers when it ends', async () => {
    await openKeptPiece();
    const asked = saveProject();
    await settle();
    expect(appStore.getState().ui.saveProjectOpen).toBe(true);
    // A second request while it is open gets the same answer.
    const again = saveProjectAs();
    settleSaveAs('saved');
    expect(await asked).toBe('saved');
    expect(await again).toBe('saved');
  });

  it('the demo and a piece not kept yet say why, and write nothing', async () => {
    await actions.openProject({ title: 'Démo', source: { kind: 'demo' }, tracks: [{ role: 'morceau', audio: { channels: [tone(1, 220)], sampleRate: SR } }] });
    expect(await saveProject()).toBe('failed');
    expect(saveActivity.getState()).toMatchObject({ phase: 'error', code: 'demo' });
  });

  it('a browser with no way to write a file: the bytes come as a download, and the click marks it saved', async () => {
    await openKeptPiece();
    vi.stubGlobal('window', {});
    const out = await runSaveAs({ encode: nodeFlacEncode });
    if (out.kind !== 'download') throw new Error(out.kind);
    expect(out.name).toBe('Blues du dimanche.fab');
    expect(isModified()).toBe(true);
    out.finish();
    expect(isModified()).toBe(false);
    expect(getCurrentFile()).toBeNull();
    await openProjectFile(blobSource(out.blob));
  });
});

describe('the Mac app: the main process owns the file', () => {
  /** What `desktop/src/project-writer.js` does, in memory: the page only ever names the project. */
  function fakeMac(initial?: Uint8Array) {
    let file = initial ?? null;
    const sessions = new Map<string, Uint8Array[]>();
    const log = { begins: [] as string[], restarts: 0, aborts: 0, finishes: 0, reads: 0 };
    let n = 0;
    const bridge = {
      projectFileInfo: async () => (file ? { name: 'Blues du dimanche.fab', size: file.length } : null),
      readCurrentProjectFile: async (_id: string, offset: number, length: number) => ((log.reads++, file!.subarray(offset, offset + length)).slice()),
      beginProjectSave: async (r: { target: string }) => {
        log.begins.push(r.target);
        const id = `s${++n}`;
        sessions.set(id, []);
        return { ok: true as const, session: id, name: 'Blues du dimanche.fab' };
      },
      writeProjectSave: async (id: string, bytes: Uint8Array) => (sessions.get(id)!.push(bytes.slice()), { ok: true as const }),
      restartProjectSave: async (id: string) => (log.restarts++, sessions.set(id, []), { ok: true as const }),
      abortProjectSave: async (id: string) => (log.aborts++, sessions.delete(id), true as const),
      finishProjectSave: async (id: string) => {
        const parts = sessions.get(id)!;
        const out = new Uint8Array(parts.reduce((m, p) => m + p.length, 0));
        let at = 0;
        for (const p of parts) (out.set(p, at), (at += p.length));
        file = out;
        sessions.delete(id);
        log.finishes++;
        return { ok: true as const, name: 'Blues du dimanche.fab', size: out.length };
      },
    };
    return { bridge: bridge as unknown as DesktopBridge, log, bytes: () => file, corrupt: (at: number) => (file![at] = file![at]! ^ 0xff) };
  }
  const REQUIRED = Object.fromEntries(['systemInfo', 'ytdlpStatus', 'ytdlpCheck', 'ytdlpInstall', 'extract', 'copyText', 'onYtdlpProgress', 'onExtractProgress'].map((m) => [m, () => {}]));
  const withBridge = (b: DesktopBridge) => vi.stubGlobal('window', { fabtice: { ...REQUIRED, ...b } });

  it('« Enregistrer sous… » through the panel, then « Enregistrer »: the temporary file is the Mac app\'s, nothing already encoded is encoded again', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    const mac = fakeMac();
    withBridge(mac.bridge);
    expect(await runSaveAs({ encode: nodeFlacEncode })).toEqual({ kind: 'saved', name: 'Blues du dimanche.fab' });
    expect(mac.log.begins).toEqual(['choose']);
    expect(getCurrentFile()).toMatchObject({ name: 'Blues du dimanche.fab', ref: { kind: 'desktop' } });
    expect(isModified()).toBe(false);
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: -1 } }));
    const spy = counting();
    expect(await saveProject({ encode: spy.encode })).toBe('saved');
    expect(spy.calls).toEqual([]);
    expect(mac.log.begins).toEqual(['choose', 'current']);
    expect(mac.log.finishes).toBe(2);
    expect(mac.log.reads).toBeGreaterThan(0);
    expect(isModified()).toBe(false);
    const opened = await openProjectFile(bytesSource(mac.bytes()!));
    await opened.verify();
    expect(opened.document.playback.semitones).toBe(-1);
  });

  it('« Enregistrer sous… » asked while « Enregistrer » writes: the dialog waits for it, and the first save succeeds', async () => {
    await openKeptPiece();
    const mac = fakeMac();
    withBridge(mac.bridge);
    await runSaveAs({ encode: nodeFlacEncode });
    await separate('htdemucs-6s', ['vocals']);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let encoding = false;
    const slow: FlacEncode = async (pcm, o) => {
      encoding = true;
      await gate;
      return nodeFlacEncode(pcm, o);
    };
    const first = saveProject({ encode: slow });
    while (!encoding) await settle();
    const asked = saveProjectAs();
    await settle();
    // Nothing interrupts the save under way: the dialog is not up, no other save was begun.
    expect(appStore.getState().ui.saveProjectOpen).toBe(false);
    expect(mac.log.begins).toEqual(['choose']);
    release();
    expect(await first).toBe('saved');
    expect(mac.log.aborts).toBe(0);
    await settle();
    expect(appStore.getState().ui.saveProjectOpen).toBe(true);
    // « Enregistrer » while the dialog is up: the dialog's answer, no second save.
    const again = saveProject({ encode: nodeFlacEncode });
    settleSaveAs('cancelled');
    expect(await asked).toBe('cancelled');
    expect(await again).toBe('cancelled');
    expect(mac.log.finishes).toBe(2);
    expect(mac.log.begins).toEqual(['choose', 'current']);
  });

  it('an entry of the earlier file that no longer reads back as recorded: the save starts again, whole, and succeeds', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    const mac = fakeMac();
    withBridge(mac.bridge);
    await runSaveAs({ encode: nodeFlacEncode });
    // The earlier file was changed on the disk after its directory could be read: a flipped byte inside a FLAC track.
    const flac = (await readZipDirectory(bytesSource(mac.bytes()!))).find((e) => e.name.endsWith('.flac'))!;
    mac.corrupt(flac.headerOffset + 30 + new TextEncoder().encode(flac.name).length + 400);
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 4 } }));
    const spy = counting();
    expect(await saveProject({ encode: spy.encode })).toBe('saved');
    // (Nothing was handed to the main process yet when the copy failed: the page's own buffer was simply emptied.)
    // Written whole: the tracks were encoded this time.
    expect(spy.calls.length).toBeGreaterThan(0);
    const opened = await openProjectFile(bytesSource(mac.bytes()!));
    await opened.verify();
    expect(opened.document.playback.semitones).toBe(4);
  });

  it('a project whose file is gone from the disk goes to « Enregistrer sous… » before anything is encoded', async () => {
    await openKeptPiece();
    const mac = fakeMac();
    withBridge(mac.bridge);
    await runSaveAs({ encode: nodeFlacEncode });
    // Gone from the disk: the main process says there is no file.
    (mac.bridge as unknown as { projectFileInfo: () => Promise<null> }).projectFileInfo = async () => null;
    withBridge(mac.bridge);
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 4 } }));
    const spy = counting();
    const asked = saveProject({ encode: spy.encode });
    await settle();
    expect(spy.calls).toEqual([]);
    expect(appStore.getState().ui.saveProjectOpen).toBe(true);
    expect(getCurrentFile()).toBeNull();
    settleSaveAs('cancelled');
    expect(await asked).toBe('cancelled');
  });
});

describe('opening a project file', () => {
  it('the piece reads « not modified » once everything is in place, then a change reads « modified »', async () => {
    await openKeptPiece();
    await separate('htdemucs-6s', ['vocals', 'bass']);
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    vi.unstubAllGlobals();
    freshApp();
    const id = await openProjectSource(blobSource(new Blob([file.bytes()])), 'Blues du dimanche.fab', {}, { decode: async () => decode() });
    expect(id).toBe(appStore.getState().project!.id);
    await settle();
    expect(isModified()).toBe(false);
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 3 } }));
    expect(isModified()).toBe(true);
  });
});

describe('the alert about changes not saved', () => {
  const text = 'Les modifications du projet en cours n’ont pas été sauvegardées, voulez-vous enregistrer ?';

  it('not modified, or nothing open: go on at once, no alert', async () => {
    expect(await confirmLeaveProject()).toBe(true);
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    expect(isModified()).toBe(false);
    expect(await confirmLeaveProject()).toBe(true);
    expect(leaveDialog.getState().open).toBe(false);
  });

  it('modified: the alert is up; « Annuler » stays, « Ne pas enregistrer » goes on and writes nothing', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    const old = file.bytes().slice();
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 2 } }));
    const stay = confirmLeaveProject();
    expect(leaveDialog.getState().open).toBe(true);
    // A second request while it is up gets the same answer.
    const alsoStay = confirmLeaveProject();
    await answerLeave('cancel');
    expect(await stay).toBe(false);
    expect(await alsoStay).toBe(false);
    expect(leaveDialog.getState().open).toBe(false);
    expect(isModified()).toBe(true);

    const go = confirmLeaveProject();
    await answerLeave('discard');
    expect(await go).toBe(true);
    expect(file.bytes()).toEqual(old);
    expect(file.log.opened).toBe(1);
    expect(isModified()).toBe(true);
    expect(text.length).toBeGreaterThan(20);
  });

  it('« Enregistrer »: saved, then go on; the file holds the changes', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 2 } }));
    const go = confirmLeaveProject();
    await answerLeave('save');
    expect(await go).toBe(true);
    const opened = await openProjectFile(bytesSource(file.bytes()));
    expect(opened.document.playback.semitones).toBe(2);
    expect(isModified()).toBe(false);
  });

  it('« Enregistrer » that fails or is cancelled: stay', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 2 } }));
    file.log.failClose = true;
    const failing = confirmLeaveProject();
    await answerLeave('save');
    expect(await failing).toBe(false);
    expect(leaveDialog.getState().open).toBe(false);
    // Never saved: « Enregistrer » asks where; closing that window is staying.
    clearCurrentFile();
    const asked = confirmLeaveProject();
    const answering = answerLeave('save');
    await settle();
    expect(appStore.getState().ui.saveProjectOpen).toBe(true);
    settleSaveAs('cancelled');
    await answering;
    expect(await asked).toBe(false);
  });

  it('« Nouveau projet »: asks first, and what the user agreed to stands for the window it opens', async () => {
    await openKeptPiece();
    const file = memoryFile();
    picks(file);
    await runSaveAs({ encode: nodeFlacEncode });
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 2 } }));
    const asking = requestNewProject();
    expect(leaveDialog.getState().open).toBe(true);
    expect(appStore.getState().ui.newPieceOpen).toBe(false);
    await answerLeave('cancel');
    await asking;
    expect(appStore.getState().ui.newPieceOpen).toBe(false);
    const again = requestNewProject();
    await answerLeave('discard');
    await again;
    expect(appStore.getState().ui.newPieceOpen).toBe(true);
    // « Ouvrir un projet » in that window: no second alert.
    expect(await confirmLeaveProject()).toBe(true);
    expect(leaveDialog.getState().open).toBe(false);
    // The window closed: the next leave asks again.
    actions.closeNewPiece();
    const third = confirmLeaveProject();
    expect(leaveDialog.getState().open).toBe(true);
    await answerLeave('cancel');
    expect(await third).toBe(false);
  });
});

describe('the title of the window', () => {
  it('the Mac app: the file name, or the piece\'s title; the web: with a mark while modified', () => {
    const base = { projectTitle: 'Blues du dimanche', fileName: null, modified: true };
    expect(windowTitle({ ...base, desktop: true })).toBe('Blues du dimanche');
    expect(windowTitle({ ...base, fileName: 'Mon blues.fab', desktop: true })).toBe('Mon blues');
    expect(windowTitle({ ...base, desktop: false })).toBe('• Blues du dimanche — Fabtice');
    expect(windowTitle({ ...base, modified: false, fileName: 'Mon blues.fab', desktop: false })).toBe('Mon blues — Fabtice');
    expect(windowTitle({ projectTitle: null, fileName: null, modified: false, desktop: false })).toBe('Fabtice');
  });

  it('a file belongs to its project: another project has none', async () => {
    await openKeptPiece();
    setCurrentFile({ projectId: appStore.getState().project!.id, name: 'a.fab', ref: { kind: 'desktop' } });
    expect(getCurrentFile()?.name).toBe('a.fab');
    await openKeptPiece();
    expect(getCurrentFile()).toBeNull();
  });
});

describe('the Mac app asks whether the window may close', () => {
  /** The main process's question, and what it was answered with, with what the device held at that moment. */
  function closingMac() {
    let ask: ((q: { id: string }) => void) | null = null;
    const answers: { go: boolean; keptSemitones: number | undefined }[] = [];
    const bridge = {
      onConfirmClose: (cb: (q: { id: string }) => void) => ((ask = cb), () => (ask = null)),
      ackClose: async () => true,
      answerClose: async (_id: string, go: boolean) => {
        answers.push({ go, keptSemitones: (await storage.loadCurrent())?.playback.semitones });
        return true;
      },
    } as unknown as DesktopBridge;
    return { bridge, answers, ask: () => ask!({ id: 'q1' }) };
  }
  const fakeDoc = { title: '' } as Document;

  async function changedJustBefore(semitones: number) {
    await openKeptPiece();
    await getKeeper().settled();
    appStore.setState((s) => ({ playback: { ...s.playback, semitones } }));
    // The autosave waits for its delay: nothing on the device yet.
    expect((await storage.loadCurrent())?.playback.semitones).toBe(0);
  }

  it('« Ne pas enregistrer »: the last change is written on the device before the window may go', async () => {
    await changedJustBefore(4);
    const mac = closingMac();
    const stop = installProjectWindow(mac.bridge, fakeDoc);
    mac.ask();
    await settle();
    expect(leaveDialog.getState().open).toBe(true);
    await answerLeave('discard');
    await settle();
    expect(mac.answers).toEqual([{ go: true, keptSemitones: 4 }]);
    stop();
  });

  it('nothing to ask (just saved to its file), the autosave still waiting: written before the answer', async () => {
    await openKeptPiece();
    picks(memoryFile());
    await runSaveAs({ encode: nodeFlacEncode });
    await getKeeper().settled();
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 6 } }));
    expect(await saveProject({ encode: nodeFlacEncode })).toBe('saved');
    expect(isModified()).toBe(false);
    const mac = closingMac();
    const stop = installProjectWindow(mac.bridge, fakeDoc);
    mac.ask();
    await settle();
    expect(mac.answers).toEqual([{ go: true, keptSemitones: 6 }]);
    stop();
  });

  it('a device that does not answer never holds the closing back; « Annuler » answers « stay » at once', async () => {
    await changedJustBefore(2);
    const mac = closingMac();
    const stop = installProjectWindow(mac.bridge, fakeDoc, { flush: () => new Promise(() => {}), flushMaxMs: 50 });
    mac.ask();
    await settle();
    await answerLeave('cancel');
    await settle();
    expect(mac.answers.map((a) => a.go)).toEqual([false]);
    mac.ask();
    await settle();
    await answerLeave('discard');
    await settle();
    expect(mac.answers.map((a) => a.go)).toEqual([false]);
    await new Promise((r) => setTimeout(r, 60));
    expect(mac.answers.map((a) => a.go)).toEqual([false, true]);
    stop();
  });
});
