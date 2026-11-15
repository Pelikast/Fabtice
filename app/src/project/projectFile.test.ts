// « Enregistrer le projet » then « Ouvrir un projet » through the store: the
// project comes back exactly, with its instruments, kept on the device, and
// a damaged file leaves the open piece and the kept one as they were.

import { beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { CHUNK, type PcmAudio } from '../audio/pcm';
import { clearAudio, getAudio, type DecodedAudio } from '../audio/registry';
import { ImportError } from '../import/types';
import { MockRenderer } from '../render/mock';
import { replaceRenderer } from '../render';
import { MockSeparator } from '../separation/mock';
import { replaceSeparator } from '../separation';
import { setDevice } from '../separation/device';
import { startSeparation } from '../separation/runner';
import { getKeeper, replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import type { StoredAudio } from '../storage/ProjectStorage';
import * as actions from '../store/actions';
import { toProjectDocument } from '../store/document';
import { saveCurrentLoop } from '../store/markerActions';
import { setCountInBars, setMetronomeVolume } from '../store/metronomeActions';
import { appStore, initialState } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { openProjectSource } from './open';
import { buildProjectFile, saveRefusal } from './save';
import { blobSource, type ByteSource } from './zip';

const SR = ENGINE_SAMPLE_RATE;
const tone = (seconds: number, hz: number, amp = 0.4) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const ORIGINAL = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31) & 255);

/** What « decoding » the stored original gives in these tests (Node has no decoder). */
const decode = async (stored: StoredAudio): Promise<DecodedAudio> => {
  expect(new Uint8Array(stored.bytes)).toEqual(ORIGINAL);
  return { channels: [tone(6, 110), tone(6, 220)], sampleRate: SR };
};

let storage: MemoryStorage;

function freshApp() {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  storage = new MemoryStorage();
  replaceProjectStorage(storage);
  getKeeper().start();
}

beforeEach(() => {
  freshApp();
  replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  replaceRenderer(new MockRenderer());
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
});

async function openKeptPiece() {
  await actions.openProject({
    title: 'Blues du dimanche',
    source: { kind: 'file', fileName: 'blues.mp3' },
    tracks: [{ role: 'morceau', audio: (await decode({ bytes: ORIGINAL.slice().buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' })) }],
  });
  const s = appStore.getState();
  await getKeeper().keepNewProject(new Map(s.tracks.map((tr) => [tr.audio.id, { bytes: ORIGINAL.slice().buffer, mimeType: 'audio/mpeg', fileName: 'blues.mp3' }])));
}

/** A separated, corrected piece, with markers and metronome settings. */
async function workedOnPiece() {
  await openKeptPiece();
  await startSeparation({ stems: ['vocals', 'bass'] });
  expect(appStore.getState().separation.result).not.toBeNull();
  await getKeeper().settled();
  appStore.setState((s) => ({ loop: { region: { start: 1.25, end: 3.5 }, enabled: true }, corrections: { ...s.corrections, key: { tonic: 3, mode: 'major' } as never } }));
  saveCurrentLoop('Pont');
  setMetronomeVolume(0.42);
  setCountInBars(2);
  appStore.setState((s) => ({ playback: { ...s.playback, semitones: -2, cents: 12 } }));
}

const samePcm = (a: PcmAudio, b: PcmAudio) =>
  a.frames === b.frames &&
  a.mono === b.mono &&
  a.chunks.every((c, i) => {
    const d = b.chunks[i]!;
    for (let k = 0; k < CHUNK; k++) if (c.l[k] !== d.l[k] || (c.r?.[k] ?? 0) !== (d.r?.[k] ?? 0)) return false;
    return true;
  });

describe('saving and opening a project file', () => {
  it('everything comes back, the instruments included, and is kept on the device', async () => {
    await workedOnPiece();
    const before = appStore.getState();
    const docBefore = toProjectDocument(before)!;
    const stems = [...before.tracks, ...before.separation.aside].filter((tr) => tr.audio.origin === 'separated');
    expect(stems.length).toBeGreaterThan(1);
    const pcmBefore = new Map(stems.map((tr) => [tr.audio.id, getAudio(tr.audio.id)!]));
    const { blob, name } = await buildProjectFile({ withInstruments: true });
    expect(name).toBe('Blues du dimanche.fabtice');

    // Another device: nothing open, nothing kept.
    freshApp();
    await openProjectSource(blobSource(blob), name, {}, { decode });
    const after = appStore.getState();
    const docAfter = toProjectDocument(after)!;
    expect({ ...docAfter, savedAt: '' }).toEqual({ ...docBefore, savedAt: '' });
    expect(after.markers.loops.map((l) => l.name)).toEqual(['Pont']);
    expect(after.metronome.volume).toBe(0.42);
    expect(after.metronome.countInBars).toBe(2);
    for (const [id, pcm] of pcmBefore) expect(samePcm(getAudio(id)!, pcm)).toBe(true);
    // Never analysed again for nothing, never separated again.
    expect(after.separationRun.status).toBe('idle');
    // Kept: the document, the original, and the instruments.
    await getKeeper().settled();
    expect(getKeeper().attachedProject).toBe(docBefore.project.id);
    expect((await storage.loadCurrent())?.project.id).toBe(docBefore.project.id);
    for (const [id] of pcmBefore) expect(await storage.loadTrackAudio(id)).not.toBeNull();
  });

  it('without the instruments, the file opens on the whole piece with its mix', async () => {
    await workedOnPiece();
    const { blob, name } = await buildProjectFile({ withInstruments: false });
    freshApp();
    await openProjectSource(blobSource(blob), name, {}, { decode });
    const s = appStore.getState();
    expect(s.separation.result).toBeNull();
    expect(s.tracks.map((tr) => tr.role)).toEqual(['morceau']);
    expect(s.markers.loops.map((l) => l.name)).toEqual(['Pont']);
  });

  it('a damaged file changes nothing: the open piece and the kept one stay as they were', async () => {
    await workedOnPiece();
    const { blob, name } = await buildProjectFile({ withInstruments: true });
    freshApp();
    await openKeptPiece();
    const open = appStore.getState().project;
    const kept = await storage.loadCurrent();
    const cut: ByteSource = blobSource(blob.slice(0, Math.floor(blob.size * 0.6)));
    const code = await openProjectSource(cut, name, {}, { decode }).then(
      () => 'opened',
      (e) => (e instanceof ImportError ? e.code : String(e)),
    );
    expect(code).toBe('project-damaged');
    expect(appStore.getState().project).toBe(open);
    expect((await storage.loadCurrent())?.project.id).toBe(kept?.project.id);
  });

  it('an instrument damaged in the file: the piece opens whole and says so', async () => {
    await workedOnPiece();
    const { blob, name } = await buildProjectFile({ withInstruments: true });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    bytes[bytes.length - 5000] = bytes[bytes.length - 5000]! ^ 0x55;
    freshApp();
    await openProjectSource(blobSource(new Blob([bytes])), name, {}, { decode });
    const s = appStore.getState();
    expect(s.separation.result).toBeNull();
    expect(s.tracks.map((tr) => tr.role)).toEqual(['morceau']);
    expect(s.ui.separationNotice).toMatch(/instruments séparés/);
  });

  it('the demo piece and a piece not kept yet are not saved', async () => {
    await actions.openProject({ title: 'Démo', source: { kind: 'demo' }, tracks: [{ role: 'morceau', audio: { channels: [tone(1, 220)], sampleRate: SR } }] });
    expect(saveRefusal()).toBe('demo');
    await actions.openProject({ title: 'Pas gardé', source: { kind: 'file', fileName: 'x.mp3' }, tracks: [{ role: 'morceau', audio: { channels: [tone(1, 220)], sampleRate: SR } }] });
    expect(saveRefusal()).toBe('not-kept');
  });
});
