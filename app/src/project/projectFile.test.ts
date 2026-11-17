// Several separations kept side by side, the kept render, then « Enregistrer
// le projet » and « Ouvrir un projet » through the store: the project comes
// back exactly, every separation and the render included, kept on the
// device; a damaged file leaves the open piece and the kept one as they were.

import { beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { CHUNK, type PcmAudio } from '../audio/pcm';
import { clearAudio, getAudio, type DecodedAudio } from '../audio/registry';
import { ImportError } from '../import/types';
import { applyRender, keptRenderAudio, selectApplyState, startKeptRenderWatch, startRenderWatch } from '../render/controller';
import { MockRenderer } from '../render/mock';
import { replaceRenderer } from '../render';
import { MockSeparator } from '../separation/mock';
import { replaceSeparator } from '../separation';
import { setDevice } from '../separation/device';
import { chooseSeparation, freeOtherSeparation, startSeparation } from '../separation/runner';
import { getKeeper, replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import type { StoredAudio } from '../storage/ProjectStorage';
import * as actions from '../store/actions';
import { toProjectDocument } from '../store/document';
import { saveCurrentLoop } from '../store/markerActions';
import { setCountInBars, setMetronomeVolume } from '../store/metronomeActions';
import { setSeparationModel, showWholePiece } from '../store/separationActions';
import { appStore, initialState } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { nodeFlacEncode } from '../test/flacEncode';
import { openProjectSource } from './open';
import { buildProjectFile, gatherProject, saveRefusal } from './save';
import { blobSource, type ByteSource } from './zip';

const SR = ENGINE_SAMPLE_RATE;
const tone = (seconds: number, hz: number, amp = 0.4) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const ORIGINAL = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31) & 255);

const decode = async (stored: StoredAudio): Promise<DecodedAudio> => {
  expect(new Uint8Array(stored.bytes)).toEqual(ORIGINAL);
  return { channels: [tone(6, 110), tone(6, 220)], sampleRate: SR };
};

let storage: MemoryStorage;
let unwatch: (() => void)[] = [];

function freshApp() {
  for (const u of unwatch) u();
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
}

beforeEach(() => {
  freshApp();
  replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  replaceRenderer(new MockRenderer());
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
});

async function openKeptPiece() {
  await actions.openProject({ title: 'Blues du dimanche', source: { kind: 'file', fileName: 'blues.mp3' }, tracks: [{ role: 'morceau', audio: await decode({ bytes: ORIGINAL.slice().buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' }) }] });
  const s = appStore.getState();
  await getKeeper().keepNewProject(new Map(s.tracks.map((tr) => [tr.audio.id, { bytes: ORIGINAL.slice().buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' }])));
}

const settle = () => new Promise((r) => setTimeout(r, 20));

/** Two separations with two tools, mixes set in each, corrections, markers, metronome, and a render applied. */
async function workedOnPiece() {
  await openKeptPiece();
  setSeparationModel('htdemucs-6s');
  await startSeparation({ stems: ['vocals', 'bass'] });
  appStore.setState((s) => ({ tracks: s.tracks.map((tr, i) => (i === 0 ? { ...tr, mute: true } : tr)) }));
  setSeparationModel('bs-roformer-sw');
  await startSeparation({ stems: ['bass', 'drums', 'piano'] });
  await settle();
  appStore.setState((s) => ({ tracks: s.tracks.map((tr, i) => (i === 1 ? { ...tr, volume: 0.5 } : tr)) }));
  await getKeeper().settled();
  appStore.setState((s) => ({
    loop: { region: { start: 1.25, end: 3.5 }, enabled: true },
    // A manual tempo action (the bar menu), with the grid it replaced: saved and read back exactly.
    corrections: { ...s.corrections, key: { tonic: 3, mode: 'major' } as never, tempoFixes: [{ time: 2, kind: 'continuity', previous: s.tempoMap }] },
  }));
  saveCurrentLoop('Pont');
  setMetronomeVolume(0.42);
  setCountInBars(2);
  appStore.setState((s) => ({ playback: { ...s.playback, semitones: -2, cents: 12 } }));
  await applyRender();
  await settle();
  expect(selectApplyState(appStore.getState())).toBe('applied');
  expect(appStore.getState().keptRender).not.toBeNull();
}

const samePcm = (a: PcmAudio, b: PcmAudio) =>
  a.frames === b.frames &&
  a.mono === b.mono &&
  a.chunks.every((c, i) => {
    const d = b.chunks[i]!;
    for (let k = 0; k < CHUNK; k++) if (c.l[k] !== d.l[k] || (c.r?.[k] ?? 0) !== (d.r?.[k] ?? 0)) return false;
    return true;
  });

describe('several separations, one per tool', () => {
  it('a second tool keeps the first separation aside (on the device, out of memory); switching computes nothing', async () => {
    await workedOnPiece();
    const s = appStore.getState();
    expect(s.separation.result?.modelId).toBe('bs-roformer-sw');
    expect(s.separation.others.map((o) => o.result.modelId)).toEqual(['htdemucs-6s']);
    const other = s.separation.others[0]!;
    expect(other.tracks[0]!.mute).toBe(true);
    for (const tr of other.tracks) {
      expect(getAudio(tr.audio.id)).toBeUndefined();
      expect(await storage.loadTrackAudio(tr.audio.id)).not.toBeNull();
    }
    expect(await chooseSeparation(other.result.id)).toBe(true);
    const after = appStore.getState();
    expect(after.separation.result?.modelId).toBe('htdemucs-6s');
    expect(after.tracks[0]!.mute).toBe(true);
    expect(after.separation.others[0]!.result.modelId).toBe('bs-roformer-sw');
    expect(after.separation.others[0]!.tracks[1]!.volume).toBe(0.5);
    // « Revenir au morceau entier » still works.
    await showWholePiece();
    expect(appStore.getState().tracks.map((tr) => tr.role)).toEqual(['morceau']);
  });

  it('the same tool again replaces its own separation; one separation can be freed alone', async () => {
    await workedOnPiece();
    const before = appStore.getState().separation.others[0]!;
    setSeparationModel('htdemucs-6s');
    await startSeparation({ stems: ['vocals'] });
    await settle();
    const s = appStore.getState();
    expect(s.separation.result?.modelId).toBe('htdemucs-6s');
    expect(s.separation.others.map((o) => o.result.modelId)).toEqual(['bs-roformer-sw']);
    for (const tr of before.tracks) expect(await storage.loadTrackAudio(tr.audio.id)).toBeNull();
    const roformer = s.separation.others[0]!;
    await freeOtherSeparation(roformer.result.id);
    expect(appStore.getState().separation.others).toEqual([]);
    for (const tr of roformer.tracks) expect(await storage.loadTrackAudio(tr.audio.id)).toBeNull();
  });
});

describe('the last applied render, kept with the piece', () => {
  it('stale when the key changes, heard again when it comes back; a new render replaces it', async () => {
    await workedOnPiece();
    const first = appStore.getState().keptRender!;
    for (const t of first.tracks) expect(await storage.loadTrackAudio(t.audioId)).not.toBeNull();
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 0 } }));
    await settle();
    expect(selectApplyState(appStore.getState())).toBe('preview');
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: -2 } }));
    await settle();
    await settle();
    expect(selectApplyState(appStore.getState())).toBe('applied');
    appStore.setState((s) => ({ playback: { ...s.playback, semitones: 3 } }));
    await applyRender();
    await settle();
    const second = appStore.getState().keptRender!;
    expect(second.target.semitones).toBe(3);
    for (const t of first.tracks) expect(await storage.loadTrackAudio(t.audioId)).toBeNull();
    // Never the original nor the separations.
    expect(appStore.getState().separation.others.length).toBe(1);
  });
});

describe('a newer render applied but not kept: the file holds the kept one', () => {
  /** Applies a render at another tempo while the device refuses (or has not finished writing) its samples. */
  async function newerRenderNotKept(save: (audioId: string, pcm: PcmAudio) => Promise<void>) {
    await workedOnPiece();
    const kept = appStore.getState().keptRender!;
    const keptSamples = new Map(await Promise.all(kept.tracks.map(async (t) => [t.audioId, (await storage.loadTrackAudio(t.audioId))!] as const)));
    storage.saveTrackAudio = save;
    appStore.setState((s) => ({ playback: { ...s.playback, tempoRatio: 0.8 } }));
    await applyRender();
    await settle();
    const s = appStore.getState();
    expect(selectApplyState(s)).toBe('applied');
    expect(s.keptRender).toBe(kept);
    return { kept, keptSamples };
  }

  async function expectKeptSamples(kept: ReturnType<typeof appStore.getState>['keptRender'] & object, keptSamples: Map<string, PcmAudio>) {
    const input = await gatherProject();
    expect(input.document.keptRender).toEqual(kept);
    for (const t of kept.tracks) {
      const pcm = await input.tracks.get(t.audioId)!();
      expect(samePcm(pcm, keptSamples.get(t.audioId)!)).toBe(true);
    }
  }

  it('the device was full: the entries `rendu/` hold the samples of the kept render, not of the one heard', async () => {
    const { kept, keptSamples } = await newerRenderNotKept(() => Promise.reject(Object.assign(new Error('full'), { code: 'quota' })));
    expect(appStore.getState().ui.storageNotice).toBe('renderFull');
    await expectKeptSamples(kept, keptSamples);
  });

  it('saved while the new render is being written on the device: still the kept one', async () => {
    const original = storage.saveTrackAudio.bind(storage);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { kept, keptSamples } = await newerRenderNotKept(async (id, pcm) => {
      await gate;
      return original(id, pcm);
    });
    await expectKeptSamples(kept, keptSamples);
    release();
    await settle();
    // Once written, the new render is the kept one and is taken from memory.
    const now = appStore.getState().keptRender!;
    expect(now.target.tempoRatio).toBe(0.8);
    expect(keptRenderAudio(now)).not.toBeNull();
    expect(keptRenderAudio(kept)).toBeNull();
  });
});

describe('saving and opening a .fab file', () => {
  it('everything comes back, every separation and the render included, and is kept on the device', async () => {
    await workedOnPiece();
    const before = appStore.getState();
    const docBefore = toProjectDocument(before)!;
    const current = [...before.tracks, ...before.separation.aside].filter((tr) => tr.audio.origin === 'separated');
    const pcmBefore = new Map(current.map((tr) => [tr.audio.id, getAudio(tr.audio.id)!]));
    const otherIds = before.separation.others.flatMap((o) => o.tracks.map((tr) => tr.audio.id));
    const otherBefore = new Map(await Promise.all(otherIds.map(async (id) => [id, (await storage.loadTrackAudio(id))!] as const)));
    const renderBefore = new Map([...keptRenderAudio()!].map(([trackId, p]) => [trackId, p]));
    const { blob, name } = await buildProjectFile({ encode: nodeFlacEncode });
    expect(name).toBe('Blues du dimanche.fab');

    freshApp();
    await openProjectSource(blobSource(blob), name, {}, { decode });
    await settle();
    const after = appStore.getState();
    expect({ ...toProjectDocument(after)!, savedAt: '' }).toEqual({ ...docBefore, savedAt: '' });
    for (const [id, pcm] of pcmBefore) expect(samePcm(getAudio(id)!, pcm)).toBe(true);
    for (const [id, pcm] of otherBefore) expect(samePcm((await storage.loadTrackAudio(id))!, pcm)).toBe(true);
    // The render is heard at once (same key and tempo), to the sample.
    expect(selectApplyState(after)).toBe('applied');
    for (const [trackId, pcm] of renderBefore) expect(samePcm(keptRenderAudio()!.get(trackId)!, pcm)).toBe(true);
    expect(after.separationRun.status).toBe('idle');
    await getKeeper().settled();
    expect((await storage.loadCurrent())?.project.id).toBe(docBefore.project.id);
    expect(await chooseSeparation(after.separation.others[0]!.result.id)).toBe(true);
  });

  it('a damaged file changes nothing: the open piece and the kept one stay as they were', async () => {
    await workedOnPiece();
    const { blob, name } = await buildProjectFile({ encode: nodeFlacEncode });
    freshApp();
    await openKeptPiece();
    const open = appStore.getState().project;
    const kept = await storage.loadCurrent();
    for (const damaged of [blobSource(blob.slice(0, Math.floor(blob.size * 0.6))), await flipped(blob, 0.8)]) {
      const code = await openProjectSource(damaged, name, {}, { decode }).then(
        () => 'opened',
        (e) => (e instanceof ImportError ? e.code : String(e)),
      );
      expect(code).toBe('project-damaged');
      expect(appStore.getState().project).toBe(open);
      expect((await storage.loadCurrent())?.project.id).toBe(kept?.project.id);
    }
  });

  it('the demo piece and a piece not kept yet are not saved', async () => {
    await actions.openProject({ title: 'Démo', source: { kind: 'demo' }, tracks: [{ role: 'morceau', audio: { channels: [tone(1, 220)], sampleRate: SR } }] });
    expect(saveRefusal()).toBe('demo');
    await actions.openProject({ title: 'Pas gardé', source: { kind: 'file', fileName: 'x.mp3' }, tracks: [{ role: 'morceau', audio: { channels: [tone(1, 220)], sampleRate: SR } }] });
    expect(saveRefusal()).toBe('not-kept');
  });
});

/** One byte changed at `at` (share of the file): in the FLAC tracks, found by the check before anything is replaced. */
async function flipped(blob: Blob, at: number): Promise<ByteSource> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const i = Math.floor(bytes.length * at);
  bytes[i] = bytes[i]! ^ 0x55;
  return blobSource(new Blob([bytes]));
}
