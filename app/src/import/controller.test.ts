import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceEngine } from '../audio';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { MemoryStorage } from '../storage/memoryStorage';
import { getKeeper, replaceProjectStorage } from '../storage';
import { appStore, initialState, type ImportStatus } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { fakeBridge, META, okResult, type FakeBridge } from '../test/fakeBridge';
import { makeWav, sine } from '../test/audioFiles';
import { cancelImport, checkToolUpdate, isImportRunning, startFileImport, startLinkImport, startToolUpdate } from './controller';

const LINK = 'https://youtu.be/abc';
const wav = (name = 'Essai.wav') => new File([makeWav(1, 8000, [sine(440, 8000, 0.5)])], name, { type: 'audio/wav' });

/** Web Audio stand-in: decodes anything to two seconds of mono at 48 kHz, when `gate` is open. */
let gate: Promise<void> = Promise.resolve();
let storage: MemoryStorage;
let engine: MockEngine;

function installWebAudio() {
  class FakeOfflineAudioContext {
    async decodeAudioData(): Promise<{ numberOfChannels: number; sampleRate: number; getChannelData: () => Float32Array }> {
      await gate;
      return { numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(96000) };
    }
  }
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
}

function useBridge(bridge: FakeBridge | null) {
  vi.stubGlobal('window', bridge ? { fabtice: bridge } : {});
}

const statuses: ImportStatus[] = [];
let unsubscribe: () => void = () => {};
const ui = () => appStore.getState().ui;

beforeEach(() => {
  appStore.setState(initialState(), true);
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  storage = new MemoryStorage();
  replaceProjectStorage(storage);
  installWebAudio();
  useBridge(null);
  gate = Promise.resolve();
  statuses.length = 0;
  unsubscribe = appStore.subscribe((s, prev) => {
    if (s.ui.import !== prev.ui.import) statuses.push(s.ui.import);
  });
});

afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
});

describe('file import from the dialog', () => {
  it('opens the piece and has it kept on the device, replacing nothing before it is open', async () => {
    await startFileImport(wav('Blues_du_dimanche.wav'));
    const s = appStore.getState();
    expect(s.project).toMatchObject({ title: 'Blues du dimanche', source: { kind: 'file', fileName: 'Blues_du_dimanche.wav' }, duration: 2 });
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]).toMatchObject({ role: 'morceau', name: 'Morceau' });
    expect(s.ui).toMatchObject({ newPieceOpen: false, import: { kind: 'idle' }, storageNotice: null });
    expect(engine.getState()).toBe('ready');
    expect(isImportRunning()).toBe(false);
    await getKeeper().flush();
    const doc = JSON.parse(storage.json!);
    expect(doc.project.id).toBe(s.project!.id);
    expect([...storage.audio.keys()]).toEqual([s.tracks[0]!.audio.id]);
    expect(storage.audio.get(s.tracks[0]!.audio.id)!.fileName).toBe('Blues_du_dimanche.wav');
    const phases = statuses.filter((x): x is Extract<ImportStatus, { kind: 'busy' }> => x.kind === 'busy').map((x) => x.progress.phase);
    expect(phases[0]).toBe('reading');
    expect(phases).toContain('decoding');
    expect(phases.at(-1)).toBe('preparing');
  });

  it('shows a plain French message when the file cannot be used', async () => {
    await startFileImport(new File(['%PDF'], 'partition.pdf', { type: 'application/pdf' }));
    expect(ui().import).toMatchObject({ kind: 'error', message: expect.stringContaining('Formats acceptés : mp3, wav, aiff, m4a, flac'), detail: null });
    // The dialog is not blocked: another file can be tried at once.
    await startFileImport(wav());
    expect(appStore.getState().project?.title).toBe('Essai');
  });

  it('a decoding failure says the file may be damaged', async () => {
    vi.stubGlobal('OfflineAudioContext', class {
      decodeAudioData() {
        return Promise.reject(Object.assign(new Error('Unable to decode audio data'), { name: 'EncodingError' }));
      }
    });
    await startFileImport(wav('abime.mp3'));
    expect(ui().import).toMatchObject({ kind: 'error', message: 'Ce fichier audio n’a pas pu être lu. Il est peut-être abîmé, ou ce n’est pas vraiment un fichier audio.' });
    expect(appStore.getState().project).toBeNull();
  });

  it('one import at a time: a second request while one runs is ignored', async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const first = startFileImport(wav('Premier.wav'));
    await vi.waitFor(() => expect(ui().import).toMatchObject({ kind: 'busy', progress: { phase: 'decoding' } }));
    expect(isImportRunning()).toBe(true);
    await startFileImport(wav('Second.wav'));
    open();
    await first;
    expect(appStore.getState().project?.title).toBe('Premier');
  });

  it('« Annuler » during the decoding returns to the choices and drops the result', async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const running = startFileImport(wav());
    await vi.waitFor(() => expect(ui().import).toMatchObject({ kind: 'busy', progress: { phase: 'decoding' } }));
    cancelImport();
    expect(ui().import).toEqual({ kind: 'idle' });
    expect(isImportRunning()).toBe(false);
    open();
    await running;
    expect(appStore.getState().project).toBeNull();
    expect(ui().import).toEqual({ kind: 'idle' });
  });

  it('a piece that the engine refuses ends in a clear message', async () => {
    vi.spyOn(engine, 'loadTracks').mockRejectedValueOnce(new Error('no'));
    await startFileImport(wav());
    expect(ui().import).toMatchObject({ kind: 'error', message: 'Ce morceau n’a pas pu être préparé pour la lecture.' });
    expect(storage.json).toBeNull();
  });

  it('the piece stays usable when the device cannot keep it: a calm notice, nothing else', async () => {
    storage.failWith = 'quota';
    await startFileImport(wav());
    await getKeeper().flush();
    await vi.waitFor(() => expect(ui().storageNotice).toBe('full'));
    expect(appStore.getState().project?.title).toBe('Essai');
    expect(ui().import).toEqual({ kind: 'idle' });
  });
});

describe('link import from the dialog', () => {
  it('first time: installs the tool with an explanation phase, extracts, opens the piece', async () => {
    const bridge = fakeBridge({
      installed: false,
      installEvents: [{ phase: 'download', received: 50, total: 100 }],
      extractEvents: [{ phase: 'download', percent: 40, meta: META }],
    });
    useBridge(bridge);
    await startLinkImport(LINK);
    const busy = statuses.filter((x): x is Extract<ImportStatus, { kind: 'busy' }> => x.kind === 'busy').map((x) => x.progress);
    const phases = busy.map((p) => p.phase);
    expect(phases.indexOf('installing')).toBeGreaterThan(-1);
    expect(phases.indexOf('installing')).toBeLessThan(phases.indexOf('downloading'));
    expect(busy.find((p) => p.phase === 'installing' && p.fraction === 0.5)).toBeDefined();
    expect(appStore.getState().project).toMatchObject({ title: 'Autumn Leaves', source: { kind: 'link', url: LINK, channel: 'Un guitariste' } });
    await getKeeper().flush();
    expect(storage.audio.size).toBe(1);
    expect([...storage.audio.values()][0]).toMatchObject({ mimeType: 'audio/mp4', fileName: 'Autumn Leaves.m4a' });
  });

  it('a refusal shows the app’s own sentence under the generic message', async () => {
    useBridge(fakeBridge({ extractions: [{ ok: false, refused: true, error: 'Cette vidéo dure plus de 20 minutes : import refusé pour l’instant.' }] }));
    await startLinkImport(LINK);
    expect(ui().import).toEqual({
      kind: 'error',
      message: 'Ce lien ne peut pas être importé.',
      detail: 'Cette vidéo dure plus de 20 minutes : import refusé pour l’instant.',
    });
  });

  it('a technical failure shows no technical text', async () => {
    useBridge(fakeBridge({ extractions: [{ ok: false, error: 'yt-dlp a échoué pendant le téléchargement : ERROR 403' }] }));
    await startLinkImport(LINK);
    expect(ui().import).toMatchObject({ kind: 'error', detail: null });
    expect((ui().import as { message: string }).message).not.toMatch(/yt-dlp|403/);
  });

  it('the install failing is explained, with advice about the connection', async () => {
    useBridge(fakeBridge({ installed: false, install: { ok: false, error: 'ENOTFOUND', attempts: [] } }));
    await startLinkImport(LINK);
    expect((ui().import as { message: string }).message).toBe('L’outil d’import n’a pas pu être téléchargé. Vérifiez votre connexion à Internet, puis réessayez.');
  });

  it('outside the Mac app there is no link import', async () => {
    await startLinkImport(LINK);
    expect((ui().import as { message: string }).message).toBe('L’import par lien se fait dans l’app Mac.');
  });

  it('the extraction cannot be cancelled, and no second import starts meanwhile', async () => {
    let finish!: () => void;
    const extraction = new Promise<void>((r) => (finish = r));
    const bridge = fakeBridge({
      extractions: [async () => (await extraction, okResult())],
      extractEvents: [{ phase: 'info' }],
    });
    useBridge(bridge);
    const running = startLinkImport(LINK);
    await vi.waitFor(() => expect(ui().import).toMatchObject({ kind: 'busy', progress: { phase: 'fetching-info' } }));
    cancelImport();
    expect(ui().import.kind).toBe('busy');
    expect(isImportRunning()).toBe(true);
    await startLinkImport('https://youtu.be/other');
    await startFileImport(wav());
    expect(bridge.extractedLinks).toEqual([LINK]);
    finish();
    await running;
    expect(appStore.getState().project?.title).toBe('Autumn Leaves');
  });

  it('after the download, decoding can be cancelled', async () => {
    useBridge(fakeBridge());
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const running = startLinkImport(LINK);
    await vi.waitFor(() => expect(ui().import).toMatchObject({ kind: 'busy', progress: { phase: 'decoding' } }));
    cancelImport();
    open();
    await running;
    expect(ui().import).toEqual({ kind: 'idle' });
    expect(appStore.getState().project).toBeNull();
  });
});

describe('the import tool, kept up to date', () => {
  const latest = { tag: '2', sha256: 'x', url: 'u', sumsUrl: 's' };

  it('proposes an update at launch, only when one exists', async () => {
    useBridge(fakeBridge({ check: { skipped: false, latest, installed: true, updateAvailable: false, attempts: [] } }));
    await checkToolUpdate();
    expect(ui().toolUpdate).toBe(false);
    useBridge(fakeBridge({ check: { skipped: false, latest, installed: true, updateAvailable: true, attempts: [] } }));
    await checkToolUpdate();
    expect(ui().toolUpdate).toBe(true);
  });

  it('never throws or proposes anything on the web', async () => {
    await checkToolUpdate();
    expect(ui().toolUpdate).toBe(false);
  });

  it('updates on request, with progress, then returns to the choices', async () => {
    appStore.setState((s) => ({ ui: { ...s.ui, toolUpdate: true } }));
    const bridge = fakeBridge({ installEvents: [{ phase: 'download', received: 1, total: 4 }] });
    useBridge(bridge);
    await startToolUpdate();
    const phases = statuses.filter((x) => x.kind === 'busy').map((x) => (x as Extract<ImportStatus, { kind: 'busy' }>).progress.phase);
    expect(new Set(phases)).toEqual(new Set(['updating']));
    expect(bridge.calls).toEqual(['install']);
    expect(ui()).toMatchObject({ toolUpdate: false, import: { kind: 'idle' } });
  });

  it('a failed update keeps the offer and says the current tool remains usable', async () => {
    appStore.setState((s) => ({ ui: { ...s.ui, toolUpdate: true } }));
    useBridge(fakeBridge({ install: { ok: false, error: 'hors ligne', attempts: [] } }));
    await startToolUpdate();
    expect(ui().toolUpdate).toBe(true);
    expect((ui().import as { message: string }).message).toBe('L’outil d’import n’a pas pu être mis à jour. Celui que vous avez reste utilisable.');
    expect(isImportRunning()).toBe(false);
  });
});
