// Lot 3 foundation: document version 3, separated tracks kept and reopened,
// the separation run with the stand-in, « Appliquer » with the stand-in
// renderer and the mock engine, and the audio export.

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { pcmFromChannels, readPcm } from '../audio/pcm';
import { clearAudio, getAudio, registryBytes } from '../audio/registry';
import { crc32, planAudioExport, runAudioExport, ExportError, zipStore } from '../export/audio';
import { emptySeparation } from '../model/separation';
import { applyRender, cancelRender, selectApplyState, startRenderWatch } from '../render/controller';
import { MockRenderer } from '../render/mock';
import { replaceRenderer } from '../render';
import { MockSeparator } from '../separation/mock';
import { replaceSeparator } from '../separation';
import { setDevice } from '../separation/device';
import { freeSeparatedTracks, gatherParts, startSeparation } from '../separation/runner';
import { readDocument } from '../storage/documentFormat';
import { IndexedDbStorage } from '../storage/indexedDb';
import { replaceProjectStorage, getKeeper } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import type { StoredAudio } from '../storage/ProjectStorage';
import { restoreAtLaunch, wholePieceOf } from '../storage/restore';
import { fakeClock } from '../test/fakeClock';
import { sampleDocument } from '../test/sampleDocument';
import * as actions from './actions';
import { documentChanged, toProjectDocument } from './document';
import { showInstruments, showWholePiece } from './separationActions';
import { appStore, initialState } from './store';

const SR = ENGINE_SAMPLE_RATE;
const tone = (seconds: number, hz: number, amp = 0.4) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

let engine: MockEngine;
let storage: MemoryStorage;

beforeEach(() => {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  storage = new MemoryStorage();
  replaceProjectStorage(storage);
  replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  replaceRenderer(new MockRenderer());
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
});

async function openPiece(seconds = 6, source: 'file' | 'demo' = 'file') {
  await actions.openProject({
    title: 'Blues du dimanche',
    source: source === 'file' ? { kind: 'file', fileName: 'blues.mp3' } : { kind: 'demo' },
    tracks: [{ role: 'morceau', audio: { channels: [tone(seconds, 110), tone(seconds, 220)], sampleRate: SR } }],
  });
}

/** Opens a piece and has it kept, as an import does. */
async function openKeptPiece(seconds = 6) {
  await openPiece(seconds);
  const s = appStore.getState();
  const originals = new Map<string, StoredAudio>(s.tracks.map((tr) => [tr.audio.id, { bytes: new Uint8Array([1]).buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' }]));
  getKeeper().start();
  await getKeeper().keepNewProject(originals);
}

describe('document version 3', () => {
  it('a lot 2 document opens « never separated », with the export dialog as it opens the first time', () => {
    const { separation: _s, exportPrefs: _e, ...v2 } = sampleDocument();
    const doc = readDocument(JSON.parse(JSON.stringify({ ...v2, version: 2 })))!;
    expect(doc.version).toBe(3);
    expect(doc.separation).toEqual(emptySeparation());
    expect(doc.exportPrefs).toEqual({ what: 'mix', range: 'whole', format: 'wav' });
  });

  it('reads a separated piece exactly, and refuses one whose sets are mixed up', async () => {
    await openPiece();
    await startSeparation();
    const doc = toProjectDocument(appStore.getState())!;
    const back = readDocument(JSON.parse(JSON.stringify(doc)))!;
    expect(back.separation).toEqual(doc.separation);
    expect(back.tracks.every((tr) => tr.stem !== undefined && tr.audio.origin === 'separated')).toBe(true);
    const mixed = { ...doc, separation: { ...doc.separation, showing: 'whole' } };
    expect(() => readDocument(JSON.parse(JSON.stringify(mixed)))).toThrow();
    const lostStem = { ...doc, tracks: doc.tracks.map((tr) => ({ ...tr, stem: undefined })) };
    expect(() => readDocument(JSON.parse(JSON.stringify(lostStem)))).toThrow();
    // Unreadable export choices only reset the dialog.
    expect(readDocument(JSON.parse(JSON.stringify({ ...doc, exportPrefs: { what: 'all', format: 'ogg' } })))!.exportPrefs).toEqual({ what: 'mix', range: 'whole', format: 'wav' });
  });

  it('the autosave hears the separation and the export choices, not the run states', () => {
    const a = appStore.getState();
    expect(documentChanged(a, { ...a, separation: { ...a.separation } })).toBe(true);
    expect(documentChanged(a, { ...a, exportPrefs: { ...a.exportPrefs, format: 'flac' } })).toBe(true);
    expect(documentChanged(a, { ...a, separationRun: { status: 'idle' }, render: { status: 'none' } })).toBe(false);
  });
});

describe('the separation, with the stand-in separator', () => {
  it('replaces the whole piece by the instruments, keeps the position, the whole piece waits aside', async () => {
    await openPiece();
    actions.seek(2.5);
    await startSeparation();
    const s = appStore.getState();
    expect(s.separation.result).toMatchObject({ modelId: 'bs-roformer-sw', backend: 'gpu', fellBack: false });
    expect(s.tracks.map((tr) => tr.name)).toEqual(['Voix', 'Batterie', 'Basse', 'Guitare', 'Piano', 'Autres']);
    expect(s.tracks.map((tr) => tr.role)).toEqual(['voix', 'batterie', 'basse', 'guitare', 'piano', 'autres']);
    expect(s.separation.aside.map((tr) => tr.role)).toEqual(['morceau']);
    expect(engine.snapshot().tracks.map((t) => t.id)).toEqual(s.tracks.map((tr) => tr.id));
    expect(engine.getPosition()).toBeCloseTo(2.5, 5);
    for (const tr of s.tracks) expect(getAudio(tr.audio.id)!.frames).toBe(6 * SR);
    expect(s.separationRun).toEqual({ status: 'idle' });
  });

  it('only the asked instruments get a track; the rest is summed into « Autres »', async () => {
    await openPiece();
    await startSeparation({ stems: ['vocals', 'bass'] });
    expect(appStore.getState().tracks.map((tr) => tr.stem)).toEqual(['vocals', 'bass', 'other']);
    expect([...appStore.getState().separation.result!.kept].sort()).toEqual(['bass', 'other', 'vocals']);
  });

  it('gathers parts exactly', () => {
    const p = (v: number) => pcmFromChannels([new Float32Array(100).fill(v)], SR);
    const parts = gatherParts(
      [
        { stem: 'vocals', audio: p(0.1) },
        { stem: 'drums', audio: p(0.2) },
        { stem: 'other', audio: p(0.3) },
      ],
      ['vocals'],
    );
    expect(parts.map((x) => x.stem)).toEqual(['vocals', 'other']);
    const out = new Float32Array(1);
    readPcm(parts[1]!.audio, 0, 50, out);
    expect(out[0]).toBeCloseTo(0.5, 3);
  });

  it('switches to the whole piece and back without computing again', async () => {
    await openPiece();
    await startSeparation();
    const instruments = appStore.getState().tracks;
    await showWholePiece();
    expect(appStore.getState().tracks.map((tr) => tr.role)).toEqual(['morceau']);
    expect(appStore.getState().separation.showing).toBe('whole');
    expect(engine.snapshot().tracks).toHaveLength(1);
    await showInstruments();
    expect(appStore.getState().tracks).toEqual(instruments);
    expect(engine.snapshot().tracks).toHaveLength(6);
  });

  it('reports the graphics failure and keeps the tool; cancels; reports an error', async () => {
    await openPiece();
    replaceSeparator(new MockSeparator({ durationMs: 30, downloadMs: 0, fallbackAt: 0.1 }));
    const seen: boolean[] = [];
    const off = appStore.subscribe((s) => s.separationRun.status === 'running' && seen.push(s.separationRun.fellBack));
    await startSeparation();
    off();
    expect(seen).toContain(true);
    expect(appStore.getState().separation.result).toMatchObject({ modelId: 'bs-roformer-sw', backend: 'cpu', fellBack: true });

    replaceSeparator(new MockSeparator({ durationMs: 2000, downloadMs: 0 }));
    const running = startSeparation();
    await vi.waitFor(() => expect(appStore.getState().separationRun.status).toBe('running'));
    const { cancelSeparation } = await import('../separation/runner');
    cancelSeparation();
    await running;
    expect(appStore.getState().separationRun).toEqual({ status: 'idle' });

    replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0, failWith: 'memory' }));
    await startSeparation();
    expect(appStore.getState().separationRun).toMatchObject({ status: 'error', code: 'memory' });
  });

  it('keeps the instruments on the device before the document refers to them, and frees them', async () => {
    await openKeptPiece();
    await startSeparation();
    const ids = appStore.getState().tracks.map((tr) => tr.audio.id);
    expect([...storage.tracks.keys()].sort()).toEqual([...ids].sort());
    await getKeeper().flush();
    await freeSeparatedTracks();
    expect(storage.tracks.size).toBe(0);
    expect(appStore.getState().separation).toEqual(emptySeparation());
    expect(appStore.getState().tracks.map((tr) => tr.role)).toEqual(['morceau']);
    for (const id of ids) expect(getAudio(id)).toBeUndefined();
  });

  it('the demo piece is never kept', async () => {
    await openPiece(6, 'demo');
    await startSeparation();
    expect(storage.tracks.size).toBe(0);
  });
});

describe('reopening a separated piece', () => {
  async function separatedSession() {
    await openKeptPiece();
    await startSeparation();
    await new Promise((r) => setTimeout(r, 900));
    await getKeeper().flush();
    const before = appStore.getState();
    appStore.setState(initialState(), true);
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    clearAudio();
    return before;
  }

  it('comes back as it was left, the instruments read back without any computation', async () => {
    const before = await separatedSession();
    const decode = vi.fn(async () => ({ channels: [tone(6, 110), tone(6, 220)], sampleRate: SR }));
    expect(await restoreAtLaunch({ storage, keeper: getKeeper(), decode, marker: { get: () => null, set: () => {}, clear: () => {} } })).toBe('restored');
    const after = appStore.getState();
    expect(decode).toHaveBeenCalledTimes(1); // the original only
    expect(after.tracks.map((tr) => tr.id)).toEqual(before.tracks.map((tr) => tr.id));
    expect(after.separation).toEqual(before.separation);
    expect(registryBytes()).toBeGreaterThan(0);
    for (const tr of [...after.tracks, ...after.separation.aside]) expect(getAudio(tr.audio.id)?.frames).toBe(6 * SR);
  });

  it('opens the whole piece, and says so, when the instruments cannot be read back', async () => {
    await separatedSession();
    storage.tracks.clear();
    const decode = async () => ({ channels: [tone(6, 110)], sampleRate: SR });
    expect(await restoreAtLaunch({ storage, keeper: getKeeper(), decode, marker: { get: () => null, set: () => {}, clear: () => {} } })).toBe('restored');
    const s = appStore.getState();
    expect(s.tracks.map((tr) => tr.role)).toEqual(['morceau']);
    expect(s.separation).toEqual(emptySeparation());
    expect(s.ui.separationNotice).toMatch(/morceau entier/);
    // The kept document no longer names the lost instruments.
    await vi.waitFor(() => expect(JSON.parse(storage.json!).separation.result).toBeNull());
  });

  it('wholePieceOf keeps the whole track and its mix', () => {
    const doc = sampleDocument();
    expect(wholePieceOf(doc)).toBe(doc);
  });
});

describe('separated tracks in IndexedDB (real sizes)', () => {
  it('round-trips a 30 s stereo track (5.8 MB) and a mono one, and frees them', async () => {
    const idb = new IndexedDbStorage(new IDBFactory(), undefined);
    const stereo = pcmFromChannels([tone(30, 220), tone(30, 330)], SR);
    const mono = pcmFromChannels([tone(30, 110)], SR);
    await idb.saveTrackAudio('s', stereo);
    await idb.saveTrackAudio('m', mono);
    expect((await idb.trackAudioUsage()).bytes).toBe(stereo.bytes + mono.bytes);
    const back = (await idb.loadTrackAudio('s'))!;
    expect(back.frames).toBe(stereo.frames);
    expect(back.mono).toBe(false);
    const a = new Float32Array(500);
    const b = new Float32Array(500);
    readPcm(stereo, 1, 1_000_000, a);
    readPcm(back, 1, 1_000_000, b);
    expect(Array.from(b)).toEqual(Array.from(a));
    expect((await idb.loadTrackAudio('m'))!.mono).toBe(true);
    await idb.pruneTrackAudio(new Set(['m']));
    expect(await idb.loadTrackAudio('s')).toBeNull();
    // A new piece takes the previous one's instruments with it.
    await idb.replaceCurrent(sampleDocument(), new Map());
    expect(await idb.loadTrackAudio('m')).toBeNull();
    expect((await idb.trackAudioUsage()).bytes).toBe(0);
  });
});

describe('« Appliquer »', () => {
  it('renders every shown track, hands them to the engine, goes back to preview on any change', async () => {
    const stop = startRenderWatch();
    await openPiece();
    expect(selectApplyState(appStore.getState())).toBe('original');
    actions.stepSemitones(1);
    actions.setTempoRatio(0.8);
    expect(selectApplyState(appStore.getState())).toBe('preview');
    await applyRender();
    expect(selectApplyState(appStore.getState())).toBe('applied');
    const snap = engine.snapshot();
    expect(snap.rendered).toMatchObject({ semitones: 1, tempoRatio: 0.8, inUse: true });
    // The render lasts the played duration: 6 s at 0.8 = 7.5 s.
    const { appliedAudioFor } = await import('../render/controller');
    expect(appliedAudioFor(appStore.getState(), appStore.getState().tracks[0]!.id)!.frames).toBe(Math.round((6 * SR) / 0.8));
    // A mix change keeps it; a key change drops it.
    actions.setTrackVolume(appStore.getState().tracks[0]!.id, 0.5);
    expect(selectApplyState(appStore.getState())).toBe('applied');
    actions.stepSemitones(1);
    expect(selectApplyState(appStore.getState())).toBe('preview');
    await vi.waitFor(() => expect(engine.snapshot().rendered).toBeNull());
    stop();
  });

  it('can be cancelled; an engine that cannot play rendered audio leaves the preview on, with a calm error', async () => {
    replaceRenderer(new MockRenderer({ msPerSecond: 200 }));
    await openPiece();
    actions.stepSemitones(1);
    const p = applyRender();
    expect(appStore.getState().render.status).toBe('rendering');
    cancelRender();
    await p;
    expect(appStore.getState().render.status).toBe('none');
    replaceRenderer(new MockRenderer());
    vi.spyOn(engine, 'setRenderedTracks').mockRejectedValueOnce(new Error('not implemented'));
    await applyRender();
    expect(appStore.getState().render).toMatchObject({ status: 'error', code: 'unsupported' });
  });
});

describe('the stand-in renderer', () => {
  it('keeps durations and alignment: a range at half speed lasts twice as long', async () => {
    const audio = pcmFromChannels([tone(4, 440)], SR);
    const out = await new MockRenderer().render({ audio, semitones: 0, cents: 0, tempoRatio: 0.5, formants: false, range: { start: 1, end: 2 } });
    expect(out.frames).toBe(2 * SR);
    const same = await new MockRenderer().render({ audio, semitones: 3, cents: 0, tempoRatio: 1, formants: false });
    expect(same.frames).toBe(audio.frames);
  });
});

describe('« Exporter le son »', () => {
  it('plans the mix as heard, the tracks one by one in an archive, the loop only', async () => {
    await openPiece();
    await startSeparation();
    const s = appStore.getState();
    actions.toggleMute(s.tracks[1]!.id);
    let plan = planAudioExport(appStore.getState(), { what: 'mix', range: 'whole', format: 'wav' });
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]!.name).toBe('Blues du dimanche – mélange.wav');
    expect(plan.files[0]!.sources).toHaveLength(5);
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    actions.setLoopRegion({ start: 1, end: 3 });
    plan = planAudioExport(appStore.getState(), { what: 'tracks', range: 'loop', format: 'wav' }, [s.tracks[0]!.id, s.tracks[2]!.id]);
    expect(plan.files.map((f) => f.name)).toEqual(['Blues du dimanche – Voix – boucle (+2 demi-tons).wav', 'Blues du dimanche – Basse – boucle (+2 demi-tons).wav']);
    expect(plan.archiveName).toBe('Blues du dimanche – pistes – boucle (+2 demi-tons).zip');
    expect(plan.range).toEqual({ start: 1, end: 3 });
    for (const tr of appStore.getState().tracks) if (!tr.mute) actions.toggleMute(tr.id);
    expect(() => planAudioExport(appStore.getState(), { what: 'mix', range: 'whole', format: 'wav' })).toThrow(ExportError);
  });

  it('renders, mixes and encodes a WAV of the right length; packs several files in a valid archive', async () => {
    await openPiece(3);
    actions.setTempoRatio(0.5);
    const plan = planAudioExport(appStore.getState(), { what: 'mix', range: 'whole', format: 'wav' });
    const out = await runAudioExport(plan, { renderer: new MockRenderer(), audioOf: getAudio });
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(6 * SR * 2 * 2); // 3 s at half speed, stereo, 16-bit
    const zip = await zipStore([
      { name: 'a.wav', data: new Blob([new Uint8Array([1, 2, 3])]) },
      { name: 'é.wav', data: new Blob([new Uint8Array([4])]) },
    ]);
    const z = new Uint8Array(await zip.arrayBuffer());
    const zv = new DataView(z.buffer);
    expect(zv.getUint32(0, true)).toBe(0x04034b50);
    expect(zv.getUint32(14, true)).toBe(crc32(new Uint8Array([1, 2, 3])));
    expect(zv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(zv.getUint16(z.length - 22 + 10, true)).toBe(2);
  });
});
