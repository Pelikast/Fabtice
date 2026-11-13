import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { getAudio, type DecodedAudio } from '../audio/registry';
import { constantTempoMap } from '../grid/tempoMap';
import * as actions from '../store/actions';
import { toProjectDocument } from '../store/document';
import { appStore, initialState } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { sampleDocument } from '../test/sampleDocument';
import { AUTOSAVE_DELAY_MS, ProjectKeeper } from './keeper';
import { MemoryStorage } from './memoryStorage';
import type { StoredAudio } from './ProjectStorage';
import { RESTORE_DIALOG_DELAY_MS, restoreAtLaunch, type RestoreMarker } from './restore';

const map96 = constantTempoMap({ bpm: 96, firstDownbeat: 1.5, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
const stored = (n: number): StoredAudio => ({ bytes: new Uint8Array([n]).buffer, mimeType: 'audio/mpeg', fileName: `${n}.mp3` });
const pcm = (seconds: number, channels = 2): DecodedAudio => ({
  channels: Array.from({ length: channels }, () => new Float32Array(Math.round(ENGINE_SAMPLE_RATE * seconds))),
  sampleRate: ENGINE_SAMPLE_RATE,
});

function memoryMarker(initial: string | null = null): RestoreMarker & { value: string | null } {
  const m = {
    value: initial,
    get: () => m.value,
    set: (id: string) => void (m.value = id),
    clear: () => void (m.value = null),
  };
  return m;
}

let storage: MemoryStorage;
let engine: MockEngine;
let keeper: ProjectKeeper;

beforeEach(() => {
  appStore.setState(initialState(), true);
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  storage = new MemoryStorage();
  keeper = new ProjectKeeper(appStore, storage);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Opens a piece through the real actions, tunes it, and stores it as a past session would have. */
async function leaveSessionBehind() {
  await actions.openProject({
    title: 'Blues du dimanche',
    source: { kind: 'file', fileName: 'Blues_du_dimanche.mp3' },
    tracks: [
      { role: 'morceau', audio: pcm(12) },
      { role: 'basse', audio: pcm(12, 1), volume: 0.6, mute: true },
    ],
    tempoMap: map96,
    loop: { start: 2, end: 6 },
  });
  actions.stepSemitones(1);
  actions.stepSemitones(1);
  actions.setCents(-12);
  actions.setTempoRatio(0.75);
  actions.toggleSnap();
  actions.setSubdivision(4);
  actions.toggleMetronome();
  const before = appStore.getState();
  const doc = toProjectDocument(before)!;
  await storage.replaceCurrent(doc, new Map(before.tracks.map((tr, i) => [tr.audio.id, stored(i)])));
  return before;
}

describe('reopening the kept piece at launch', () => {
  it('restores the project under the same ids, with its settings, and autosaves it from there', async () => {
    const before = await leaveSessionBehind();
    appStore.setState(initialState(), true);
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    replaceEngine(new MockEngine(fakeClock().clock));
    const fresh = new MockEngine(fakeClock().clock);
    replaceEngine(fresh);
    connectEngine(appStore, fresh);
    const marker = memoryMarker();
    // What decoding the first and the second file gives (stereo, then mono).
    const decode = vi.fn(async (_s: StoredAudio) => pcm(12, decode.mock.calls.length === 1 ? 2 : 1));

    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('restored');

    const after = appStore.getState();
    expect(decode).toHaveBeenCalledTimes(2);
    expect(after.project).toMatchObject({ id: before.project!.id, title: 'Blues du dimanche', source: { kind: 'file', fileName: 'Blues_du_dimanche.mp3' }, duration: 12 });
    expect(after.tracks.map((tr) => [tr.id, tr.audio.id, tr.name, tr.role, tr.mute, tr.volume])).toEqual(before.tracks.map((tr) => [tr.id, tr.audio.id, tr.name, tr.role, tr.mute, tr.volume]));
    expect(getAudio(after.tracks[0]!.audio.id)?.channels).toHaveLength(2);
    expect(getAudio(after.tracks[1]!.audio.id)?.channels).toHaveLength(1);
    expect(after.tempoMap).toEqual(map96);
    expect(after.loop).toEqual({ region: { start: 2, end: 6 }, enabled: true });
    expect(after.playback).toEqual({ semitones: 2, cents: -12, tempoRatio: 0.75, metronome: true });
    expect(after.view).toMatchObject({ snap: false, subdivision: 4 });
    expect(after.ui).toMatchObject({ newPieceOpen: false, import: { kind: 'idle' }, notice: null });
    const snap = fresh.snapshot();
    expect(snap.state).toBe('ready');
    expect(snap.tracks.map((x) => x.id)).toEqual(before.tracks.map((x) => x.id));
    expect(snap).toMatchObject({ semitones: 2, cents: -12, loop: { start: 2, end: 6 }, metronome: true });
    expect(marker.value).toBeNull();
    expect(keeper.attachedProject).toBe(before.project!.id);
  });

  it('shows « Ouverture de « titre »… » while decoding, and the dialog only if it takes a while', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    const fresh = new MockEngine(fakeClock().clock);
    replaceEngine(fresh);
    connectEngine(appStore, fresh);
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const done = restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async () => (await gate, pcm(12)) });
    await vi.advanceTimersByTimeAsync(RESTORE_DIALOG_DELAY_MS - 50);
    expect(appStore.getState().ui.import).toEqual({ kind: 'busy', progress: { phase: 'restoring', fraction: null, title: 'Blues du dimanche' } });
    expect(appStore.getState().ui.newPieceOpen).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(appStore.getState().ui.newPieceOpen).toBe(true);
    release();
    expect(await done).toBe('restored');
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: false, import: { kind: 'idle' } });
    // A late timer must not reopen the dialog over the piece.
    await vi.advanceTimersByTimeAsync(1000);
    expect(appStore.getState().ui.newPieceOpen).toBe(false);
  });

  it('opens the new-piece dialog when nothing is kept', async () => {
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker() })).toBe('none');
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, notice: null, import: { kind: 'idle' } });
  });

  it('starts as a new user when the device gives no storage (no scary message)', async () => {
    storage.failWith = 'unavailable';
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker() })).toBe('none');
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, notice: null });
  });

  it('ignores a piece stored by a newer version', async () => {
    storage.json = JSON.stringify({ ...sampleDocument(), version: 3 });
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker() })).toBe('none');
    expect(appStore.getState().ui.newPieceOpen).toBe(true);
    expect(storage.json).not.toBeNull();
  });

  it('falls back to the dialog with a calm message when the audio is gone, and forgets the piece', async () => {
    await leaveSessionBehind();
    storage.audio.clear();
    appStore.setState(initialState(), true);
    const marker = memoryMarker();
    expect(await restoreAtLaunch({ storage, keeper, marker, decode: async () => pcm(1) })).toBe('failed');
    const ui = appStore.getState().ui;
    expect(ui.newPieceOpen).toBe(true);
    expect(ui.import).toEqual({ kind: 'idle' });
    expect(ui.notice).toBe('« Blues du dimanche » n’a pas pu être rouvert. Vous pouvez le choisir de nouveau, ou ouvrir un autre morceau.');
    expect(appStore.getState().project).toBeNull();
    expect(storage.json).toBeNull();
    expect(marker.value).toBeNull();
  });

  it('falls back when decoding fails or the engine refuses', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: () => Promise.reject(new Error('boom')) })).toBe('failed');
    expect(appStore.getState().ui.notice).toContain('Blues du dimanche');
  });

  it('a damaged record: failure with the generic sentence', async () => {
    storage.json = JSON.stringify({ ...sampleDocument(), tracks: [] });
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker() })).toBe('failed');
    expect(appStore.getState().ui.notice).toBe('Le dernier morceau n’a pas pu être rouvert. Vous pouvez le choisir de nouveau, ou ouvrir un autre morceau.');
    expect(storage.json).toBeNull();
  });

  it('does not loop on a crash: a marker left by an unfinished attempt means no new attempt', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    const decode = vi.fn(async () => pcm(12));
    const marker = memoryMarker(sampleDocumentIdOf(storage));
    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('failed');
    expect(decode).not.toHaveBeenCalled();
    expect(marker.value).toBeNull();
    expect(storage.json).toBeNull();
    // The next launch is a clean start.
    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('none');
  });

  it('sets the marker during the attempt and clears it afterwards', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    const marker = memoryMarker();
    let during: string | null = null;
    await restoreAtLaunch({
      storage,
      keeper,
      marker,
      decode: async () => {
        during = marker.value;
        return pcm(12);
      },
    });
    expect(during).toBe(sampleDocumentIdOf(storage));
    expect(marker.value).toBeNull();
  });

  it('the first autosave after a restore keeps working', async () => {
    const before = await leaveSessionBehind();
    appStore.setState(initialState(), true);
    const fresh = new MockEngine(fakeClock().clock);
    replaceEngine(fresh);
    connectEngine(appStore, fresh);
    vi.useFakeTimers();
    keeper.start();
    await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async () => pcm(12) });
    storage.writes = 0;
    actions.stepSemitones(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.json!).playback.semitones).toBe(3);
    expect(JSON.parse(storage.json!).project.id).toBe(before.project!.id);
  });
});

function sampleDocumentIdOf(s: MemoryStorage): string {
  return (JSON.parse(s.json!) as { project: { id: string } }).project.id;
}
