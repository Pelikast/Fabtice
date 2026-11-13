import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../model/document';
import { fromProjectDocument } from '../store/document';
import { createAppStore, initialState, type AppStore, type StorageNotice } from '../store/store';
import { sampleDocument } from '../test/sampleDocument';
import { AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS, ProjectKeeper } from './keeper';
import { MemoryStorage } from './memoryStorage';
import type { StoredAudio } from './ProjectStorage';

const original: StoredAudio = { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mpeg', fileName: 'a.mp3' };
const originals = new Map([['audio-1', original]]);

let store: AppStore;
let storage: MemoryStorage;
let notices: (StorageNotice | null)[];
let keeper: ProjectKeeper;

function open(doc: ProjectDocument = sampleDocument()) {
  store.setState(fromProjectDocument(doc, store.getState()));
}
const stored = () => JSON.parse(storage.json!) as ProjectDocument;
const setLoop = (end: number) => store.setState((s) => ({ loop: { ...s.loop, region: { start: 2, end } } }));

beforeEach(() => {
  vi.useFakeTimers();
  store = createAppStore(initialState());
  storage = new MemoryStorage();
  notices = [];
  keeper = new ProjectKeeper(store, storage, { onNotice: (n) => notices.push(n) });
  keeper.start();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('keeping a new piece', () => {
  it('stores audio and document together, once the piece is open, and asks for persistent storage', async () => {
    open();
    await keeper.keepNewProject(originals);
    expect(storage.writes).toBe(1);
    expect(stored().project.title).toBe('Blues du dimanche');
    expect(storage.audio.get('audio-1')).toBe(original);
    expect(storage.persistenceRequests).toBe(1);
    expect(keeper.attachedProject).toBe('project-1');
    // Asked once per session, not for every piece.
    open(sampleDocument({ project: { ...sampleDocument().project, id: 'project-2' } }));
    await keeper.keepNewProject(originals);
    expect(storage.persistenceRequests).toBe(1);
  });

  it('does not autosave a piece that is not kept yet (its audio is not on the device)', async () => {
    open();
    setLoop(5);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(storage.writes).toBe(0);
  });

  it('never keeps the demo piece', async () => {
    open(sampleDocument({ project: { ...sampleDocument().project, source: { kind: 'demo' } } }));
    await keeper.keepNewProject(originals);
    expect(storage.writes).toBe(0);
    expect(keeper.attachedProject).toBeNull();
  });

  it('replaces the previous piece (and its audio) only when the new one is kept', async () => {
    open();
    await keeper.keepNewProject(originals);
    open(sampleDocument({ project: { ...sampleDocument().project, id: 'project-2', title: 'Autre' } }));
    expect(stored().project.id).toBe('project-1');
    // Changes to the opening piece in between do not reach the device.
    setLoop(7);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(stored().project.id).toBe('project-1');
    await keeper.keepNewProject(new Map([['audio-2', original]]));
    expect(stored().project.id).toBe('project-2');
    expect([...storage.audio.keys()]).toEqual(['audio-2']);
  });
});

describe('autosave', () => {
  beforeEach(async () => {
    open();
    await keeper.keepNewProject(originals);
    storage.writes = 0;
  });

  it('waits for a quiet moment, then saves the latest state once', async () => {
    setLoop(5);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 50);
    expect(storage.writes).toBe(0);
    store.setState((s) => ({ playback: { ...s.playback, semitones: 4 } }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 50);
    expect(storage.writes).toBe(0);
    setLoop(9);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(storage.writes).toBe(1);
    expect(stored().playback.semitones).toBe(4);
    expect(stored().loop.region).toEqual({ start: 2, end: 9 });
  });

  it('saves every kind of change of the document', async () => {
    const changes: ((s: ReturnType<AppStore['getState']>) => Partial<ReturnType<AppStore['getState']>>)[] = [
      (s) => ({ project: { ...s.project!, title: 'Nouveau titre' } }),
      (s) => ({ tempoMap: { ...s.tempoMap, origin: 'manual', segments: s.tempoMap.segments.map((x) => ({ ...x, bpm: 96 })) } }),
      (s) => ({ loop: { ...s.loop, enabled: false } }),
      (s) => ({ playback: { ...s.playback, cents: 13 } }),
      (s) => ({ tracks: s.tracks.map((tr) => ({ ...tr, mute: true })) }),
      (s) => ({ view: { ...s.view, pxPerSecond: 77 } }),
    ];
    for (const change of changes) {
      storage.writes = 0;
      store.setState(change);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
      expect(storage.writes).toBe(1);
    }
    expect(stored()).toMatchObject({ project: { title: 'Nouveau titre' }, playback: { cents: 13 }, view: { pxPerSecond: 77 } });
    expect(stored().tracks[0]!.mute).toBe(true);
    expect(stored().tempoMap.segments[0]!.bpm).toBe(96);
  });

  it('ignores what is not in the document: view mode, transport, panels', async () => {
    store.setState((s) => ({ view: { ...s.view, mode: 'grille' } }));
    store.setState((s) => ({ transport: { ...s.transport, engine: 'playing' } }));
    store.setState((s) => ({ ui: { ...s.ui, panel: 'settings' } }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 4);
    expect(storage.writes).toBe(0);
  });

  it('does not save a change that was undone before the delay', async () => {
    const before = store.getState().loop;
    setLoop(5);
    store.setState({ loop: before });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(storage.writes).toBe(0);
  });

  it('still saves during a long gesture (changes keep coming)', async () => {
    let n = 0;
    const end = Date.now() + AUTOSAVE_MAX_WAIT_MS + 1000;
    while (Date.now() < end && storage.writes === 0) {
      store.setState((s) => ({ view: { ...s.view, pxPerSecond: 10 + n++ } }));
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2);
    }
    expect(storage.writes).toBe(1);
    expect(Date.now() - (end - AUTOSAVE_MAX_WAIT_MS - 1000)).toBeLessThanOrEqual(AUTOSAVE_MAX_WAIT_MS + AUTOSAVE_DELAY_MS);
  });

  it('flush saves a pending change at once (page hidden), and does nothing when there is none', async () => {
    await keeper.flush();
    expect(storage.writes).toBe(0);
    setLoop(8);
    const flushed = keeper.flush();
    await flushed;
    expect(storage.writes).toBe(1);
    expect(stored().loop.region!.end).toBe(8);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(storage.writes).toBe(1);
  });

  it('one write at a time, in order, with the latest state', async () => {
    const order: number[] = [];
    const save = storage.saveCurrent.bind(storage);
    let running = 0;
    storage.saveCurrent = async (doc) => {
      running++;
      expect(running).toBe(1);
      await new Promise((r) => setTimeout(r, 300));
      order.push(doc.loop.region!.end);
      await save(doc);
      running--;
    };
    setLoop(3);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    setLoop(4); // arrives while the first write is under way
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 1000);
    expect(order).toEqual([3, 4]);
  });

  it('adopt() lets a restored piece be autosaved', async () => {
    const other = createAppStore(initialState());
    const k = new ProjectKeeper(other, storage, {});
    k.start();
    other.setState(fromProjectDocument(sampleDocument(), other.getState()));
    k.adopt('project-1');
    other.setState((s) => ({ playback: { ...s.playback, semitones: -3 } }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(stored().playback.semitones).toBe(-3);
  });

  it('stop() ends the following of the store', async () => {
    keeper.start()();
    setLoop(8);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(storage.writes).toBe(0);
  });
});

describe('when the device refuses', () => {
  it('a full device: one notice, the previous piece is dropped, the app carries on', async () => {
    open();
    storage.failWith = 'quota';
    await expect(keeper.keepNewProject(originals)).resolves.toBeUndefined();
    expect(notices).toEqual(['full']);
    expect(keeper.attachedProject).toBeNull();
    // No retry storm: further changes are not written for a piece that was not kept.
    setLoop(5);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(notices).toEqual(['full']);
  });

  it('the failure of a new piece clears the previous one so that it is not reopened by mistake', async () => {
    open();
    await keeper.keepNewProject(originals);
    open(sampleDocument({ project: { ...sampleDocument().project, id: 'project-2' } }));
    const fail = vi.spyOn(storage, 'replaceCurrent').mockRejectedValueOnce(new Error('disk'));
    await keeper.keepNewProject(originals);
    fail.mockRestore();
    expect(storage.json).toBeNull();
    expect(notices).toEqual(['unavailable']);
  });

  it('storage unavailable: a notice about unavailability', async () => {
    open();
    storage.failWith = 'unavailable';
    await keeper.keepNewProject(originals);
    expect(notices).toEqual(['unavailable']);
  });

  it('autosave failing then recovering: one notice, then cleared', async () => {
    open();
    await keeper.keepNewProject(originals);
    storage.failWith = 'quota';
    setLoop(5);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    setLoop(6);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(notices).toEqual(['full']);
    storage.failWith = null;
    setLoop(7);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
    expect(notices).toEqual(['full', null]);
    expect(stored().loop.region!.end).toBe(7);
  });
});
