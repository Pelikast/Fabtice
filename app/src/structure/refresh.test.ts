// The runner of the harmony pass (`refresh.ts`): its triggers, the debounce, cancellation, what it
// stores and what it never touches, and how it stays out of the undo history and of « modified ».

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { demoAnalysis, demoCorrections } from '../demo/demoAnalysis';
import { demoTempoMap } from '../demo/demoProject';
import { barStartTime, constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import type { AnalysedKeyChange, AnalysisResult } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { DetectedStructure, StructurePart } from '../model/structure';
import { fakeClock } from '../test/fakeClock';
import * as actions from '../store/actions';
import { applyAnalysis } from '../store/analysisActions';
import { selectBarChords, selectChartBars } from '../store/chartSelectors';
import { replaceChord, setKey } from '../store/harmonyActions';
import { canRedo, canUndo, isModified, markSaved, redo, startHistory, stopHistory, undo } from '../store/history';
import { addKeyChange, removeKeyChange, resetKeyChanges } from '../store/keyActions';
import { keyChangesInForce } from '../store/keySelectors';
import { setAutoStructure, setDetectModulations, setUseKnownCharts } from '../store/settingsActions';
import { selectSimplifyInput } from '../store/simplifiedSelectors';
import { addPart, setStructureMode } from '../store/structureActions';
import { structureInForce } from '../store/structureSelectors';
import { appStore, initialState } from '../store/store';
import { applyTempoFix } from '../store/tempoFixActions';
import { withBarChords } from '../chart/edits';
import { knownStandardsFor } from './knownCache';
import { BARS_AFTER_LAST_CHORD, HarmonyRefresh, harmonyBarsOf, withStableIds, type EvidenceGatherer, type KnownProvider } from './refresh';
import type { HarmonyInput, KnownStandard, StructureEvidence } from './types';
import { detectKeyChanges } from './keys';

const DURATION = 40;
const get = () => appStore.getState();
const k = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });
const analysedChange = (time: number, tonic: number): AnalysedKeyChange => ({ time, key: { ...k(tonic), confidence: 0.6, alternatives: [] } });
const part = (id: string, type: StructurePart['type'], start: number, end: number): StructurePart => ({ id, type, number: null, instrument: null, start, end });

/** Fake detectors: what they were given, and answers that follow the input (so that a change shows). */
function fakeDetectors() {
  const calls: { input: HarmonyInput; keys: readonly { time: number; key: Key }[] }[] = [];
  return {
    calls,
    detectKeyChanges: vi.fn((input: HarmonyInput): AnalysedKeyChange[] => (input.bars.length > 8 ? [analysedChange(input.bars[8]!.start, 7)] : [])),
    detectStructure: vi.fn((input: HarmonyInput, keys: readonly { time: number; key: Key }[]): DetectedStructure | null => {
      calls.push({ input, keys });
      const n = input.bars.length;
      if (n < 4) return null;
      const mid = input.bars[Math.floor(n / 2)]!.start;
      return {
        mode: input.mode === 'pop' ? 'pop' : 'jazz',
        form: 'AB',
        sections: [{ time: 0, label: 'A' }, { time: mid, label: 'B' }],
        parts: [part(`p${calls.length}-a`, input.mode === 'pop' ? 'verse' : 'theme', 0, mid), part(`p${calls.length}-b`, 'solo', mid, input.duration)],
      };
    }),
  };
}

let clock: ReturnType<typeof fakeClock>;
let runner: HarmonyRefresh;
let fake: ReturnType<typeof fakeDetectors>;
let library: (() => void) | null;
let knownCalls: string[];
let evidenceCalls: number;

function makeRunner(opts: { gather?: EvidenceGatherer; knownFor?: KnownProvider; debounceMs?: number } = {}): HarmonyRefresh {
  fake = fakeDetectors();
  return new HarmonyRefresh({
    debounceMs: opts.debounceMs ?? 150,
    detectKeyChanges: fake.detectKeyChanges,
    detectStructure: fake.detectStructure,
    gatherEvidence:
      opts.gather ??
      (async () => {
        evidenceCalls++;
        return null;
      }),
    knownFor:
      opts.knownFor ??
      (async (title) => {
        knownCalls.push(title);
        return [];
      }),
    onLibraryChange: (listener) => {
      library = listener;
      return () => {
        library = null;
      };
    },
  });
}

async function openPiece(analysis: AnalysisResult | null = null) {
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
    tempoMap: constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }),
    ...(analysis ? { analysis } : {}),
  });
}

/** Lets the debounce pass and the run finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(200);
  await runner.settled();
}

beforeEach(async () => {
  vi.useFakeTimers();
  appStore.setState(initialState(), true);
  clock = fakeClock();
  const engine = new MockEngine(clock.clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  knownCalls = [];
  evidenceCalls = 0;
  library = null;
  startHistory(appStore);
  await openPiece();
  runner = makeRunner();
  runner.start();
});

afterEach(() => {
  runner.stop();
  stopHistory();
  vi.useRealTimers();
});

describe('the harmony pass runner: triggers', () => {
  it('after a full analysis: the detected layer is filled, the corrections untouched', async () => {
    const before = get().corrections;
    applyAnalysis(demoSwingResult(DURATION));
    expect(get().analysis!.structure).toBeNull();
    await settle();
    const a = get().analysis!;
    expect(a.keyChanges.map((c) => c.key.tonic)).toEqual([7]);
    expect(a.structure!.parts.map((p) => p.type)).toEqual(['theme', 'solo']);
    expect(get().corrections).toBe(before);
    expect(fake.detectKeyChanges).toHaveBeenCalledTimes(1);
  });

  it('debounced: a burst of chord edits gives one run, 150 ms after the last', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const n = fake.detectStructure.mock.calls.length;
    replaceChord(2, 0, chord(2, 'min7'));
    await vi.advanceTimersByTimeAsync(100);
    replaceChord(3, 0, chord(7, '7'));
    await vi.advanceTimersByTimeAsync(100);
    replaceChord(4, 0, chord(0, 'maj7'));
    expect(runner.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(140);
    expect(fake.detectStructure.mock.calls.length).toBe(n);
    await settle();
    expect(fake.detectStructure.mock.calls.length).toBe(n + 1);
    // The input has the hand chord, trusted.
    const bar4 = runner.lastInput()!.bars.find((b) => b.bar === 4)!;
    expect(bar4.chords[0]).toMatchObject({ byHand: true, chord: { root: 0, quality: 'maj7' } });
  });

  it('the main key in force and its confidence; 1 when chosen by hand', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    expect(runner.lastInput()!.keyConfidence).toBeLessThan(1);
    setKey(k(3));
    await settle();
    expect(runner.lastInput()!.key).toEqual(k(3));
    expect(runner.lastInput()!.keyConfidence).toBe(1);
  });

  it('a hand modulation: the structure is found with the keys in force (the hand list wins), the detected list stays the detection', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    addKeyChange(21.2, k(2));
    await settle();
    const last = fake.calls[fake.calls.length - 1]!;
    expect(last.keys.map((c) => [c.time, c.key.tonic])).toEqual([[16, 7], [22, 2]]);
    expect(get().analysis!.keyChanges.map((c) => c.time)).toEqual([16]);
    removeKeyChange(16);
    resetKeyChanges();
    await settle();
    expect(keyChangesInForce(get()).map((c) => c.time)).toEqual([16]);
  });

  it('the mode: the parts are named again in that mode', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    setStructureMode('pop');
    await settle();
    expect(runner.lastInput()!.mode).toBe('pop');
    expect(get().analysis!.structure!.mode).toBe('pop');
    expect(get().analysis!.structure!.parts[0]!.type).toBe('verse');
  });

  it('a tempo correction: the old values stay until the run on the new grid lands; a tapped preview is not read', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const before = get().analysis!.structure;
    const result = { ...demoSwingResult(DURATION), beats: { ...demoSwingResult(DURATION).beats, times: demoSwingResult(DURATION).beats.times.map((t) => t * 0.9) } };
    applyTempoFix(result, { kind: 'continuity', time: 8, previous: get().tempoMap });
    // Kept meanwhile (no flash).
    expect(get().analysis!.structure).toBe(before);
    await settle();
    expect(get().analysis!.structure).not.toBe(before);
    // A preview shown for listening is not the grid in force.
    const n = fake.detectStructure.mock.calls.length;
    const inForce = get().tempoMap;
    const shown = constantTempoMap({ bpm: 90, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'corrected' });
    appStore.setState({ tempoMap: shown, tempoPreview: { shown, inForce } });
    await settle();
    expect(fake.detectStructure.mock.calls.length).toBe(n);
  });

  it('a separation that comes or goes: the evidence is gathered again (cached otherwise)', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const n = evidenceCalls;
    replaceChord(2, 0, chord(2, 'min7'));
    await settle();
    expect(evidenceCalls).toBe(n); // same audio, same grid
    const tr = get().tracks[0]!;
    appStore.setState({ tracks: [tr, { ...tr, id: 'voix', name: 'Voix', audio: { ...tr.audio, id: 'a-voix' } }] });
    await settle();
    expect(evidenceCalls).toBe(n + 1);
  });

  it('the evidence builder plugged in later: the pass runs again with it, its result reaches the detectors', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    expect(fake.calls[fake.calls.length - 1]!.input.evidence).toBeNull();
    const evidence: StructureEvidence = { stems: null, timbre: { bands: 1, data: new Float32Array(1) }, winds: null };
    let got: { bars: number; aborted: boolean } | null = null;
    runner.setEvidenceGatherer(async (_s, bars, signal) => {
      got = { bars: bars.length, aborted: signal.aborted };
      return evidence;
    });
    await settle();
    expect(got).toEqual({ bars: runner.lastInput()!.bars.length, aborted: false });
    expect(fake.calls[fake.calls.length - 1]!.input.evidence).toBe(evidence);
  });

  it('an older document (structure never looked for) gets one when it is opened', async () => {
    await openPiece({ ...demoSwingResult(DURATION), structure: null });
    await settle();
    expect(get().analysis!.structure).not.toBeNull();
  });

  it('the library of standards downloaded: the known charts are looked up again, and reach the simplified chart', async () => {
    const chart = { title: 'Essai' } as unknown as KnownStandard['chart'];
    let library2: KnownStandard[] = [];
    runner.stop();
    runner = makeRunner({ knownFor: async () => library2 });
    runner.start();
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    expect(runner.lastInput()!.known).toEqual([]);
    library2 = [{ chart, titleScore: 0.9 }];
    library!();
    await settle();
    expect(runner.lastInput()!.known).toHaveLength(1);
    expect(knownStandardsFor('Essai')).toHaveLength(1);
    expect(selectSimplifyInput(get()).known).toHaveLength(1);
    setUseKnownCharts(false);
    await settle();
    expect(runner.lastInput()!.known).toEqual([]);
    expect(selectSimplifyInput(get()).known).toEqual([]);
  });
});

describe('the harmony pass runner: what it stores', () => {
  it('a run that finds what is stored replaces nothing (the same analysis object)', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const a = get().analysis;
    await runner.refreshNow();
    expect(get().analysis).toBe(a);
    // A chord edit whose result is the same: still the same object.
    replaceChord(2, 0, chord(9, 'min7'));
    await settle();
    expect(get().analysis!.chords).toBe(a!.chords);
  });

  it('hand parts, hand letters, hand modulations, the mode are never touched', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    addPart({ type: 'intro', number: null, instrument: null, start: 0, end: 4 });
    addKeyChange(30, k(9));
    const c = get().corrections;
    replaceChord(2, 0, chord(2, 'min7'));
    const after = get().corrections;
    await settle();
    expect(get().corrections).toBe(after);
    expect(after.structure).toBe(c.structure);
    expect(after.keyChanges).toBe(c.keyChanges);
    expect(structureInForce(get()).parts.some((p) => p.origin === 'manual' && p.type === 'intro')).toBe(true);
  });

  it('the two settings: off empties the detected layer at the next run, on fills it again', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    addKeyChange(30, k(9));
    await settle();
    setDetectModulations(false);
    await settle();
    expect(get().analysis!.keyChanges).toEqual([]);
    expect(get().analysis!.structure).not.toBeNull();
    expect(get().corrections.keyChanges).toEqual([{ time: 30, key: k(9) }]); // the hand list stays
    setAutoStructure(false);
    await settle();
    expect(get().analysis!.structure).toBeNull();
    setDetectModulations(true);
    setAutoStructure(true);
    await settle();
    expect(get().analysis!.keyChanges).toHaveLength(1);
    expect(get().analysis!.structure).not.toBeNull();
  });

  it('stable ids: a part that is « the same » keeps its id across runs', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const ids = get().analysis!.structure!.parts.map((p) => p.id);
    replaceChord(2, 0, chord(2, 'min7'));
    await settle();
    // The fake detector names its parts after its call count: the runner gave them back their ids.
    expect(get().analysis!.structure!.parts.map((p) => p.id)).toEqual(ids);
  });

  it('withStableIds: same type and the largest overlap; new parts keep theirs; ids stay unique', () => {
    const prev: DetectedStructure = { mode: 'jazz', form: '', sections: [], parts: [part('a', 'theme', 0, 10), part('b', 'solo', 10, 20), part('c', 'solo', 20, 30)] };
    const next: DetectedStructure = { mode: 'jazz', form: '', sections: [], parts: [part('x', 'theme', 0, 12), part('c', 'solo', 12, 22), part('z', 'solo', 22, 30), part('w', 'outro', 30, 32)] };
    expect(withStableIds(prev, next)!.parts.map((p) => p.id)).toEqual(['a', 'b', 'c', 'w']);
    expect(withStableIds(null, next)).toBe(next);
    const clash: DetectedStructure = { ...next, parts: [part('b', 'intro', 0, 2), part('q', 'solo', 10, 20)] };
    expect(withStableIds(prev, clash)!.parts.map((p) => p.id)).toEqual(['b', 'b-2']);
  });
});

describe('the harmony pass runner: history and « modified »', () => {
  it('invisible to undo: no step, the history is not cleared, undo and redo step by step, the pass runs again after each', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    replaceChord(2, 0, chord(2, 'min7'));
    await settle();
    replaceChord(3, 0, chord(7, '7'));
    await settle();
    expect(canUndo()).toBe(true);
    const runs = fake.detectStructure.mock.calls.length;
    expect(undo()).toBe(true);
    await settle();
    expect(fake.detectStructure.mock.calls.length).toBe(runs + 1);
    expect(selectBarChords(get(), 3).chords[0]!.chord).not.toMatchObject({ root: 7, quality: '7' });
    expect(selectBarChords(get(), 2).chords[0]!.chord).toMatchObject({ root: 2, quality: 'min7' });
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(true);
    expect(undo()).toBe(true);
    await settle();
    expect(redo()).toBe(true);
    await settle();
    expect(redo()).toBe(true);
    await settle();
    expect(selectBarChords(get(), 3).chords[0]!.chord).toMatchObject({ root: 7, quality: '7' });
    expect(canRedo()).toBe(false);
  });

  it('« modified »: a refresh that finds what the file holds is not a change; one that differs is', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    markSaved();
    expect(isModified()).toBe(false);
    await runner.refreshNow();
    expect(isModified()).toBe(false);
    // The detection now finds something else (the same chords): the project differs from its file.
    fake.detectKeyChanges.mockImplementation(() => [analysedChange(24, 2)]);
    await runner.refreshNow();
    expect(isModified()).toBe(true);
    expect(canUndo()).toBe(false);
    // Back to what the file holds: not modified any more.
    fake.detectKeyChanges.mockImplementation((input: HarmonyInput) => [analysedChange(input.bars[8]!.start, 7)]);
    await runner.refreshNow();
    expect(isModified()).toBe(false);
  });
});

describe('the harmony pass runner: cancellation and re-entrance', () => {
  it('a run waiting for its evidence gives up when the input changes; the next one stores', async () => {
    const releases: ((v: StructureEvidence | null) => void)[] = [];
    const signals: AbortSignal[] = [];
    runner.stop();
    runner = makeRunner({
      gather: (_s, _bars, signal) => {
        signals.push(signal);
        return new Promise((resolve) => {
          releases.push(resolve);
        });
      },
    });
    runner.start();
    applyAnalysis(demoSwingResult(DURATION));
    await vi.advanceTimersByTimeAsync(200);
    expect(signals).toHaveLength(1);
    replaceChord(2, 0, chord(2, 'min7'));
    await vi.advanceTimersByTimeAsync(200);
    expect(signals[0]!.aborted).toBe(true);
    expect(releases).toHaveLength(2);
    // The first answer comes late: it is dropped.
    releases[0]!(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.detectStructure).not.toHaveBeenCalled();
    releases[1]!(null);
    await runner.settled();
    expect(fake.detectStructure).toHaveBeenCalledTimes(1);
    expect(get().analysis!.structure).not.toBeNull();
  });

  it('suspended: no automatic run (a test standing in for the detection); refreshNow still runs', async () => {
    runner.suspend();
    applyAnalysis(demoSwingResult(DURATION));
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.detectStructure).not.toHaveBeenCalled();
    await runner.refreshNow();
    expect(fake.detectStructure).toHaveBeenCalledTimes(1);
    runner.resume();
    await settle();
    expect(fake.detectStructure).toHaveBeenCalledTimes(2);
  });

  it('an answer the document reader would drop is not stored (modulations out of order, parts overlapping)', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    fake.detectKeyChanges.mockImplementation(() => [analysedChange(20, 2), analysedChange(10, 4)]);
    fake.detectStructure.mockImplementation(() => ({ mode: 'jazz', form: 'A', sections: [], parts: [part('a', 'theme', 0, 20), part('b', 'solo', 10, 30)] }));
    replaceChord(2, 0, chord(2, 'min7'));
    await settle();
    expect(get().analysis!.keyChanges).toEqual([]);
    expect(get().analysis!.structure).toBeNull();
  });

  it('a detector that throws leaves what is stored', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    await settle();
    const a = get().analysis;
    fake.detectStructure.mockImplementation(() => {
      throw new Error('boom');
    });
    replaceChord(2, 0, chord(2, 'min7'));
    await settle();
    expect(get().analysis!.structure).toBe(a!.structure);
  });
});

describe('the real detectors on the demo piece', () => {
  it('the demo piece in A♭ has no modulation: the refresh is harmless for the checks that use it', () => {
    const map = demoTempoMap('variable');
    const s = { ...initialState(), project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' as const }, duration: 54, sampleRate: 48000, createdAt: '' }, tempoMap: map, analysis: demoAnalysis(map, 54), corrections: demoCorrections(map) };
    const bars = harmonyBarsOf(s);
    expect(bars.length).toBeGreaterThan(16);
    expect(detectKeyChanges({ bars, duration: 54, key: k(8), keyConfidence: 0.78, known: [], evidence: null, mode: 'auto' })).toEqual([]);
    expect(selectChartBars(s).every((b) => b.keyChange === null)).toBe(true);
    void barStartTime;
  });

  it('eight bars of E major written by hand in the middle of the demo piece: a modulation there and back (what test:harmony does)', () => {
    const map = demoTempoMap('variable');
    let corrections = demoCorrections(map);
    const inE = [[chord(4, 'maj7')], [chord(1, 'min7')], [chord(6, 'min7')], [chord(11, '7')], [chord(4, 'maj7')], [chord(1, 'min7')], [chord(6, 'min7'), chord(11, '7')], [chord(4, 'maj7')]];
    inE.forEach((list, i) => {
      corrections = withBarChords(corrections, map, 8 + i, list.map((c, j) => ({ beatInBar: j * 2, chord: c })));
    });
    const s = { ...initialState(), project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' as const }, duration: 54, sampleRate: 48000, createdAt: '' }, tempoMap: map, analysis: demoAnalysis(map, 54), corrections };
    const found = detectKeyChanges({ bars: harmonyBarsOf(s), duration: 54, key: k(8), keyConfidence: 0.78, known: [], evidence: null, mode: 'auto' });
    expect(found.map((c) => [Math.round(c.time * 1000) / 1000, c.key.tonic, c.key.mode])).toEqual([
      [Math.round(barStartTime(map, 8) * 1000) / 1000, 4, 'major'],
      [Math.round(barStartTime(map, 16) * 1000) / 1000, 8, 'major'],
    ]);
  });

  it('a piece stretched far past its chords: the pass reads up to 256 bars after the last chord, no more', () => {
    const map = demoTempoMap('variable');
    const long = 60000 * 4 * (60 / 110);
    const s = { ...initialState(), project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' as const }, duration: long, sampleRate: 48000, createdAt: '' }, tempoMap: map, analysis: demoAnalysis(map, 54), corrections: demoCorrections(map) };
    const bars = harmonyBarsOf(s);
    const lastChord = bars.reduce((a, b, i) => (b.chords.length ? i : a), -1);
    expect(bars.length).toBe(lastChord + 1 + BARS_AFTER_LAST_CHORD);
    expect(bars.length).toBeLessThan(300);
  });
});

