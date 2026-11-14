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
import { forgetKept, reopenKept, RESTORE_DIALOG_DELAY_MS, RESTORE_LIMITS, restoreAtLaunch, type RestoreMarker } from './restore';

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
    expect(appStore.getState().ui.import).toEqual({ kind: 'busy', progress: { phase: 'restoring', fraction: null, title: 'Blues du dimanche', step: 'decoding' } });
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

  it('audio gone: the dialog opens with one calm sentence, the piece stays kept and is offered again', async () => {
    await leaveSessionBehind();
    storage.audio.clear();
    appStore.setState(initialState(), true);
    const marker = memoryMarker();
    expect(await restoreAtLaunch({ storage, keeper, marker, decode: async () => pcm(1) })).toBe('failed');
    const ui = appStore.getState().ui;
    expect(ui.newPieceOpen).toBe(true);
    expect(ui.import).toEqual({ kind: 'idle' });
    expect(ui.notice).toBe(
      '« Blues du dimanche » n’a pas pu être rouvert pour le moment. Il est toujours gardé sur cet appareil : vous pouvez réessayer, ou ouvrir un autre morceau.',
    );
    expect(ui.reopenOffer).toEqual({ title: 'Blues du dimanche' });
    expect(appStore.getState().project).toBeNull();
    // Nothing is forgotten: a transient problem must never cost the user their work.
    expect(storage.json).not.toBeNull();
    expect(marker.value).toBeNull();
  });

  it('decoding fails or the engine refuses: same offer, nothing half open is left on screen, the piece is kept', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: () => Promise.reject(new Error('boom')) })).toBe('failed');
    expect(appStore.getState().ui.notice).toContain('Blues du dimanche');
    expect(appStore.getState().ui.reopenOffer).toEqual({ title: 'Blues du dimanche' });
    expect(storage.json).not.toBeNull();

    // The engine refuses the tracks after the project was put on screen: the shell goes back to « no piece ».
    const refusing = new MockEngine(fakeClock().clock);
    refusing.loadTracks = () => Promise.reject(new Error('engine says no'));
    replaceEngine(refusing);
    connectEngine(appStore, refusing);
    appStore.setState(initialState(), true);
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async () => pcm(12) })).toBe('failed');
    expect(appStore.getState().project).toBeNull();
    expect(appStore.getState().tracks).toEqual([]);
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, import: { kind: 'idle' }, reopenOffer: { title: 'Blues du dimanche' } });
    expect(storage.json).not.toBeNull();
  });

  it('a damaged record: the generic sentence, the record is kept, « Rouvrir le dernier morceau » is offered', async () => {
    storage.json = JSON.stringify({ ...sampleDocument(), tracks: [] });
    expect(await restoreAtLaunch({ storage, keeper, marker: memoryMarker() })).toBe('failed');
    expect(appStore.getState().ui.notice).toBe(
      'Le dernier morceau n’a pas pu être rouvert pour le moment. Il est toujours gardé sur cet appareil : vous pouvez réessayer, ou ouvrir un autre morceau.',
    );
    expect(appStore.getState().ui.reopenOffer).toEqual({ title: null });
    expect(storage.json).not.toBeNull();
  });

  it('a launch killed during a restore: no new attempt by itself, the same offer, at every launch until the user chooses', async () => {
    await leaveSessionBehind();
    appStore.setState(initialState(), true);
    const decode = vi.fn(async () => pcm(12));
    const marker = memoryMarker(sampleDocumentIdOf(storage));
    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('failed');
    expect(decode).not.toHaveBeenCalled();
    expect(appStore.getState().ui.notice).toBe(
      'La dernière ouverture de « Blues du dimanche » s’est interrompue. Le morceau est toujours gardé sur cet appareil : vous pouvez réessayer, ou en ouvrir un autre.',
    );
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, reopenOffer: { title: 'Blues du dimanche' } });
    expect(storage.json).not.toBeNull();
    // Quitting without choosing does not turn the next launch into an attempt.
    expect(marker.value).toBe(sampleDocumentIdOf(storage));
    appStore.setState(initialState(), true);
    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('failed');
    expect(decode).not.toHaveBeenCalled();
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

/** A fresh shell, as at a launch: no piece, an engine that has seen nothing. */
function freshLaunch(engineOf: (clock: ReturnType<typeof fakeClock>['clock']) => MockEngine = (c) => new MockEngine(c)) {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  const fresh = engineOf(fakeClock().clock);
  replaceEngine(fresh);
  connectEngine(appStore, fresh);
  return fresh;
}

const never = <T,>() => new Promise<T>(() => {});

describe('a restore never waits for ever', () => {
  const offerShown = () => appStore.getState().ui;

  it('shows the step under way: reading, then decoding, then preparing the engine', async () => {
    await leaveSessionBehind();
    freshLaunch();
    const seen: string[] = [];
    const off = appStore.subscribe((s, prev) => {
      const p = s.ui.import.kind === 'busy' ? s.ui.import.progress : null;
      if (p && s.ui.import !== prev.ui.import && seen[seen.length - 1] !== `${p.phase}:${p.step}`) seen.push(`${p.phase}:${p.step}`);
    });
    await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async (_s, onFraction) => (onFraction(0.5), pcm(12)) });
    off();
    // Two tracks, each read then decoded; then the engine.
    expect(seen).toEqual(['restoring:reading', 'restoring:decoding', 'restoring:reading', 'restoring:decoding', 'restoring:preparing']);
  });

  it('reading the stored document takes too long: the offer, with no title', async () => {
    await leaveSessionBehind();
    freshLaunch();
    vi.useFakeTimers();
    storage.loadCurrent = () => never();
    const done = restoreAtLaunch({ storage, keeper, marker: memoryMarker() });
    await vi.advanceTimersByTimeAsync(RESTORE_LIMITS.document - 1);
    expect(offerShown().newPieceOpen).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await done).toBe('failed');
    expect(offerShown()).toMatchObject({ newPieceOpen: true, reopenOffer: { title: null }, import: { kind: 'idle' } });
    expect(storage.json).not.toBeNull();
  });

  it('reading the audio takes too long: after the limit, the « met trop de temps » sentence; the piece is kept, the marker is clear', async () => {
    await leaveSessionBehind();
    freshLaunch();
    vi.useFakeTimers();
    const marker = memoryMarker();
    storage.loadAudio = () => never();
    const done = restoreAtLaunch({ storage, keeper, marker, decode: async () => pcm(12) });
    await vi.advanceTimersByTimeAsync(RESTORE_LIMITS.read - 1);
    expect(offerShown().import).toMatchObject({ kind: 'busy', progress: { step: 'reading' } });
    expect(marker.value).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(await done).toBe('failed');
    expect(offerShown().notice).toBe(
      '« Blues du dimanche » met trop de temps à s’ouvrir. Il est toujours gardé sur cet appareil : vous pouvez réessayer, ou ouvrir un autre morceau.',
    );
    expect(offerShown()).toMatchObject({ newPieceOpen: true, import: { kind: 'idle' }, reopenOffer: { title: 'Blues du dimanche' } });
    expect(storage.json).not.toBeNull();
    expect(marker.value).toBeNull();
  });

  it('decoding takes too long: same, and its late result changes nothing', async () => {
    await leaveSessionBehind();
    freshLaunch();
    vi.useFakeTimers();
    let finishLate!: (a: DecodedAudio) => void;
    const done = restoreAtLaunch({
      storage,
      keeper,
      marker: memoryMarker(),
      decode: () => new Promise<DecodedAudio>((r) => (finishLate = r)),
    });
    await vi.advanceTimersByTimeAsync(RESTORE_LIMITS.decode + 1);
    expect(await done).toBe('failed');
    expect(offerShown().notice).toContain('met trop de temps à s’ouvrir');
    finishLate(pcm(12));
    await vi.advanceTimersByTimeAsync(1000);
    expect(appStore.getState().project).toBeNull();
    expect(offerShown()).toMatchObject({ newPieceOpen: true, reopenOffer: { title: 'Blues du dimanche' } });
  });

  it('the engine never answers: after the limit the shell is emptied, the offer shown, and a late answer changes nothing', async () => {
    await leaveSessionBehind();
    let release!: () => void;
    freshLaunch((c) => {
      const e = new MockEngine(c);
      e.loadTracks = () => new Promise<void>((r) => (release = r));
      return e;
    });
    vi.useFakeTimers();
    const done = restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async () => pcm(12) });
    await vi.advanceTimersByTimeAsync(RESTORE_LIMITS.prepare - 1);
    expect(appStore.getState().project).not.toBeNull();
    expect(offerShown().import).toMatchObject({ kind: 'busy', progress: { step: 'preparing' } });
    await vi.advanceTimersByTimeAsync(2);
    expect(await done).toBe('failed');
    expect(appStore.getState().project).toBeNull();
    expect(offerShown()).toMatchObject({ newPieceOpen: true, import: { kind: 'idle' }, reopenOffer: { title: 'Blues du dimanche' } });
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(offerShown()).toMatchObject({ newPieceOpen: true, reopenOffer: { title: 'Blues du dimanche' } });
    expect(keeper.attachedProject).toBeNull();
    expect(storage.json).not.toBeNull();
  });

  it('time limits are generous: seconds for the document, minutes for the decoding', () => {
    expect(RESTORE_LIMITS.document).toBeGreaterThanOrEqual(10_000);
    expect(RESTORE_LIMITS.read).toBeGreaterThanOrEqual(30_000);
    expect(RESTORE_LIMITS.decode).toBeGreaterThanOrEqual(120_000);
    expect(RESTORE_LIMITS.prepare).toBeGreaterThanOrEqual(30_000);
  });
});

describe('the offer: « Rouvrir » and « Oublier ce morceau »', () => {
  it('« Rouvrir » after a failure opens the piece, whatever an earlier cut-short attempt left behind, and removes the offer', async () => {
    const before = await leaveSessionBehind();
    freshLaunch();
    const marker = memoryMarker(sampleDocumentIdOf(storage));
    const decode = vi.fn(async () => pcm(12));
    expect(await restoreAtLaunch({ storage, keeper, marker, decode })).toBe('failed');
    expect(appStore.getState().ui.reopenOffer).not.toBeNull();

    expect(await reopenKept({ storage, keeper, marker, decode })).toBe('restored');
    const after = appStore.getState();
    expect(after.project?.id).toBe(before.project!.id);
    expect(after.ui).toMatchObject({ newPieceOpen: false, import: { kind: 'idle' }, notice: null, reopenOffer: null });
    expect(marker.value).toBeNull();
    expect(keeper.attachedProject).toBe(before.project!.id);
  });

  it('« Rouvrir » that fails again offers again; the marker is set during the attempt (a kill is detected)', async () => {
    await leaveSessionBehind();
    freshLaunch();
    const marker = memoryMarker();
    let during: string | null = null;
    expect(
      await reopenKept({
        storage,
        keeper,
        marker,
        decode: async () => {
          during = marker.value;
          throw new Error('still no');
        },
      }),
    ).toBe('failed');
    expect(during).toBe(sampleDocumentIdOf(storage));
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, reopenOffer: { title: 'Blues du dimanche' } });
    expect(storage.json).not.toBeNull();
  });

  it('« Rouvrir » when the piece is gone meanwhile: back to a plain dialog', async () => {
    freshLaunch();
    appStore.setState((s) => ({ ui: { ...s.ui, reopenOffer: { title: 'Disparu' }, newPieceOpen: true } }));
    expect(await reopenKept({ storage, keeper, marker: memoryMarker() })).toBe('none');
    expect(appStore.getState().ui).toMatchObject({ newPieceOpen: true, reopenOffer: null, import: { kind: 'idle' } });
  });

  it('« Oublier ce morceau » deletes the piece and its audio, clears the marker and the offer', async () => {
    await leaveSessionBehind();
    freshLaunch();
    const marker = memoryMarker(sampleDocumentIdOf(storage));
    await restoreAtLaunch({ storage, keeper, marker });
    expect(appStore.getState().ui.reopenOffer).not.toBeNull();
    expect(await forgetKept({ storage, marker })).toBe(true);
    expect(storage.json).toBeNull();
    expect(storage.audio.size).toBe(0);
    expect(marker.value).toBeNull();
    expect(appStore.getState().ui).toMatchObject({ reopenOffer: null, notice: null });
    // The next launch is a clean start.
    freshLaunch();
    expect(await restoreAtLaunch({ storage, keeper, marker })).toBe('none');
  });

  it('forgetting that fails, or never answers, says so and keeps the offer', async () => {
    await leaveSessionBehind();
    freshLaunch();
    await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: () => Promise.reject(new Error('x')) });
    storage.failWith = 'io';
    expect(await forgetKept({ storage, marker: memoryMarker() })).toBe(false);
    expect(appStore.getState().ui.notice).toBe('Le morceau n’a pas pu être oublié. Réessayez dans un moment.');
    expect(appStore.getState().ui.reopenOffer).not.toBeNull();
    storage.failWith = null;
    vi.useFakeTimers();
    storage.clearCurrent = () => never();
    const done = forgetKept({ storage, marker: memoryMarker() });
    await vi.advanceTimersByTimeAsync(RESTORE_LIMITS.forget + 1);
    expect(await done).toBe(false);
  });

  it('a new successful import replaces the kept piece and removes the offer', async () => {
    await leaveSessionBehind();
    freshLaunch();
    await restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: () => Promise.reject(new Error('x')) });
    const kept = sampleDocumentIdOf(storage);
    expect(appStore.getState().ui.reopenOffer).not.toBeNull();
    await actions.openProject({ title: 'Autre', source: { kind: 'file', fileName: 'autre.wav' }, tracks: [{ role: 'morceau', audio: pcm(5) }] });
    const state = appStore.getState();
    expect(state.ui.reopenOffer).toBeNull();
    await keeper.keepNewProject(new Map(state.tracks.map((tr, i) => [tr.audio.id, stored(i + 5)])));
    expect(sampleDocumentIdOf(storage)).not.toBe(kept);
    expect(JSON.parse(storage.json!).project.title).toBe('Autre');
    expect(storage.audio.size).toBe(1);
  });

  it('a piece opened meanwhile (a file dropped during the restore) is never replaced by the late restore', async () => {
    await leaveSessionBehind();
    freshLaunch();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const done = restoreAtLaunch({ storage, keeper, marker: memoryMarker(), decode: async () => (await gate, pcm(12)) });
    await new Promise((r) => setTimeout(r, 10));
    await actions.openProject({ title: 'Déposé', source: { kind: 'file', fileName: 'depose.wav' }, tracks: [{ role: 'morceau', audio: pcm(3) }] });
    release();
    expect(await done).toBe('none');
    expect(appStore.getState().project?.title).toBe('Déposé');
  });
});

function sampleDocumentIdOf(s: MemoryStorage): string {
  return (JSON.parse(s.json!) as { project: { id: string } }).project.id;
}
