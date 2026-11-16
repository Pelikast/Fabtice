// Document version 6 on the store side: the key per passage (selectors and
// commands, hand layer over the analysed modulations) and the structure in
// force (mode, letters, parts; hand layer over the detected structure). A new
// analysis never undoes what was done by hand.

import { beforeEach, describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { constantTempoMap } from '../grid/tempoMap';
import type { AnalysedKeyChange, AnalysisResult } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { DetectedStructure, StructurePart } from '../model/structure';
import { readDocument } from '../storage/documentFormat';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { toProjectDocument } from './document';
import { resetHarmonyCorrections, setKey, setSection } from './harmonyActions';
import { addKeyChange, moveKeyChange, removeKeyChange, resetKeyChanges, setKeyChangeKey } from './keyActions';
import { keyAt, keyChangesInForce, keyPassageAt, keyPassages } from './keySelectors';
import { appStore, initialState } from './store';
import { applyTempoFix, undoTempoFix } from './tempoFixActions';
import { addPart, editPart, mergeRanges, removePart, resetSectionLetters, resetStructure, setStructureMode } from './structureActions';
import { partAt, sectionsInForce, structureInForce } from './structureSelectors';

const DURATION = 40;
const get = () => appStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
const k = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });
const analysedChange = (time: number, tonic: number): AnalysedKeyChange => ({ time, key: { ...k(tonic), confidence: 0.6, alternatives: [] } });
const part = (id: string, type: StructurePart['type'], start: number, end: number, extra: Partial<StructurePart> = {}): StructurePart => ({
  id,
  type,
  number: null,
  instrument: null,
  start,
  end,
  ...extra,
});

/** Bars of 2 s (120 BPM, 4/4, first downbeat at 0): bar n starts at 2n. */
const detected = (): DetectedStructure => ({
  mode: 'jazz',
  form: 'AB',
  sections: [0, 4, 8, 12, 16].map((bar, i) => ({ time: bar * 2, label: i % 2 === 0 ? 'A' : 'B' })),
  parts: [part('d-intro', 'intro', 0, 4), part('d-theme', 'theme', 4, 20, { number: 1 }), part('d-solo1', 'solo', 20, 30, { number: 1, instrument: 'winds' }), part('d-solo2', 'solo', 30, 40, { number: 2 })],
});

function result(extra: Partial<AnalysisResult> = {}): AnalysisResult {
  return { ...demoSwingResult(DURATION), keyChanges: [analysedChange(12, 4), analysedChange(30, 11)], structure: detected(), ...extra };
}

beforeEach(async () => {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
    tempoMap: constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }),
  });
});

/** What is saved reads back as it was. */
function expectSavedExactly() {
  const doc = toProjectDocument(get())!;
  expect(readDocument(json(doc))).toEqual(json(doc));
}

describe('key per passage', () => {
  it('before any analysis: one passage from 0, key unknown', () => {
    expect(keyPassages(get())).toEqual([{ time: 0, key: null, origin: 'none', confidence: null }]);
    expect(keyAt(get(), 10)).toBeNull();
  });

  it('the analysed modulations are the later passages; the main key is the first, from 0', () => {
    applyAnalysis(result());
    const main = get().analysis!.key!;
    expect(keyPassages(get()).map((p) => [p.time, p.key && p.key.tonic, p.origin])).toEqual([
      [0, main.tonic, 'analysis'],
      [12, 4, 'analysis'],
      [30, 11, 'analysis'],
    ]);
    expect(keyAt(get(), -1)).toBe(main);
    expect(keyAt(get(), 11.99)).toBe(main);
    expect(keyAt(get(), 12)).toMatchObject(k(4));
    expect(keyAt(get(), 29.9)).toMatchObject(k(4));
    expect(keyAt(get(), 35)).toMatchObject(k(11));
    expect(keyPassageAt(get(), 13).confidence).toBe(0.6);
    // Same state, same list (React selectors).
    expect(keyPassages(get())).toBe(keyPassages(get()));
  });

  it('the main key by hand changes the first passage only', () => {
    applyAnalysis(result());
    setKey(k(8, 'minor'));
    expect(keyPassages(get()).map((p) => p.origin)).toEqual(['manual', 'analysis', 'analysis']);
    expect(keyAt(get(), 5)).toEqual(k(8, 'minor'));
    expect(keyAt(get(), 20)).toMatchObject(k(4));
  });

  it('adding a modulation copies the analysed ones into the hand list, then a new analysis changes nothing', () => {
    applyAnalysis(result());
    expect(addKeyChange(20, k(7))).toBe(true);
    expect(get().corrections.keyChanges).toEqual([{ time: 12, key: k(4) }, { time: 20, key: k(7) }, { time: 30, key: k(11) }]);
    expect(keyPassages(get()).slice(1).every((p) => p.origin === 'manual')).toBe(true);
    applyAnalysis(result({ keyChanges: [analysedChange(16, 2)] }));
    expect(keyChangesInForce(get())).toEqual([{ time: 12, key: k(4) }, { time: 20, key: k(7) }, { time: 30, key: k(11) }]);
    expectSavedExactly();
  });

  it('deleting, moving and changing an analysed modulation: kept by hand through a new analysis', () => {
    applyAnalysis(result());
    expect(removeKeyChange(12)).toBe(true);
    expect(moveKeyChange(30, 26)).toBe(true);
    expect(setKeyChangeKey(26, k(9, 'minor'))).toBe(true);
    const mine = [{ time: 26, key: k(9, 'minor') }];
    expect(get().corrections.keyChanges).toEqual(mine);
    applyAnalysis(result());
    expect(keyChangesInForce(get())).toEqual(mine);
    expect(keyAt(get(), 13)).toBe(get().analysis!.key);
    // Back to the analysis: the analysed ones show again.
    resetKeyChanges();
    expect(get().corrections.keyChanges).toBeNull();
    expect(keyChangesInForce(get()).map((c) => c.time)).toEqual([12, 30]);
  });

  it('deleting every modulation stays « none », not « the analysed ones »', () => {
    applyAnalysis(result());
    removeKeyChange(12);
    removeKeyChange(30);
    expect(get().corrections.keyChanges).toEqual([]);
    applyAnalysis(result());
    expect(keyPassages(get())).toHaveLength(1);
  });

  it('refuses what is no modulation, and what falls outside the piece', () => {
    applyAnalysis(result());
    const before = get().corrections;
    expect(addKeyChange(20, k(4))).toBe(false); // already in E from 12
    expect(addKeyChange(0, k(2))).toBe(false); // that is the main key: setKey
    expect(addKeyChange(DURATION + 1, k(2))).toBe(false);
    expect(moveKeyChange(12, 30)).toBe(false); // onto another one
    expect(moveKeyChange(12, -2)).toBe(false);
    expect(removeKeyChange(13)).toBe(false);
    expect(setKeyChangeKey(13, k(1))).toBe(false);
    expect(get().corrections).toBe(before);
  });

  it('adding at the time of a modulation changes its key; moving past another keeps the list in order', () => {
    applyAnalysis(result());
    addKeyChange(12, k(5));
    expect(keyAt(get(), 15)).toEqual(k(5));
    moveKeyChange(12, 35);
    expect(keyChangesInForce(get())).toEqual([{ time: 30, key: k(11) }, { time: 35, key: k(5) }]);
  });

  it('« start again from the analysis » and « reset the harmony » drop the hand modulations, not the structure', () => {
    applyAnalysis(result());
    addKeyChange(20, k(7));
    setStructureMode('pop');
    resetHarmonyCorrections();
    expect(get().corrections.keyChanges).toBeNull();
    expect(get().corrections.structure.mode).toBe('pop');
    addKeyChange(20, k(7));
    applyAnalysis(result(), { replaceCorrections: true });
    expect(get().corrections.keyChanges).toBeNull();
    expect(get().corrections.structure.mode).toBe('pop');
  });
});

describe('structure in force', () => {
  const view = () => structureInForce(get()).parts.map((p) => [p.type, p.number, p.instrument, p.start, p.end, p.origin]);

  it('before any analysis: Jazz by default, no part, no letter', () => {
    expect(structureInForce(get())).toEqual({ mode: 'jazz', modeOrigin: 'none', form: '', sections: [], sectionsOrigin: 'none', parts: [] });
  });

  it('the detected structure, with the letters each part covers', () => {
    applyAnalysis(result());
    const st = structureInForce(get());
    expect(st.mode).toBe('jazz');
    expect(st.modeOrigin).toBe('analysis');
    expect(st.form).toBe('AB');
    expect(st.sectionsOrigin).toBe('analysis');
    // Letters at bars 0 (A), 4 (B), 8 (A), 12 (B), 16 (A); the parts end on bars 2, 10, 15, 20.
    expect(st.parts.map((p) => [p.id, p.letters])).toEqual([
      ['d-intro', ['A']],
      ['d-theme', ['B', 'A']],
      ['d-solo1', ['B']],
      ['d-solo2', ['A']],
    ]);
    // Bars 8 (16 s) and 12 lie in the theme (4 → 20 s, bars 2 to 9): one B at bar 8.
    applyAnalysis(result({ structure: { ...detected(), sections: [{ time: 4, label: 'A' }, { time: 12, label: 'A' }, { time: 16, label: 'B' }] } }));
    expect(structureInForce(get()).parts.find((p) => p.id === 'd-theme')!.letters).toEqual(['A', 'A', 'B']);
    expect(partAt(get(), 25)!.id).toBe('d-solo1');
    expect(partAt(get(), 40)).toBeNull();
    expect(structureInForce(get())).toBe(structureInForce(get()));
  });

  it('the mode by hand wins; « auto » follows the analysis again', () => {
    applyAnalysis(result());
    expect(setStructureMode('pop')).toBe(true);
    expect(structureInForce(get())).toMatchObject({ mode: 'pop', modeOrigin: 'manual' });
    applyAnalysis(result());
    expect(structureInForce(get()).mode).toBe('pop');
    setStructureMode('auto');
    expect(structureInForce(get())).toMatchObject({ mode: 'jazz', modeOrigin: 'analysis' });
    expect(setStructureMode('classique' as never)).toBe(false);
  });

  it('correcting a detected part makes it the user\'s; a new analysis changes only the parts nobody touched', () => {
    applyAnalysis(result());
    const id = editPart('d-solo1', { instrument: 'trumpet' })!;
    expect(id).not.toBe('d-solo1');
    expect(view()).toEqual([
      ['intro', null, null, 0, 4, 'analysis'],
      ['theme', 1, null, 4, 20, 'analysis'],
      ['solo', 1, 'trumpet', 20, 30, 'manual'],
      ['solo', 2, null, 30, 40, 'analysis'],
    ]);
    // The new analysis moves every limit and names every instrument: the hand part stays as it is.
    applyAnalysis(result({ structure: { ...detected(), parts: [part('n1', 'intro', 0, 6), part('n2', 'theme', 6, 22, { number: 1 }), part('n3', 'solo', 22, 32, { instrument: 'saxophone' }), part('n4', 'solo', 32, 40, { instrument: 'piano' })] } }));
    expect(view()).toEqual([
      ['intro', null, null, 0, 6, 'analysis'],
      // Cut where the user's stretch starts.
      ['theme', 1, null, 6, 20, 'analysis'],
      ['solo', 1, 'trumpet', 20, 30, 'manual'],
      // Starts inside the user's stretch: hidden.
      ['solo', null, 'piano', 32, 40, 'analysis'],
    ]);
    expectSavedExactly();
  });

  it('moving a limit into the next part cuts it, and the cut part is kept by hand', () => {
    applyAnalysis(result());
    const id = editPart('d-theme', { end: 24, number: 2 })!;
    expect(view()).toEqual([
      ['intro', null, null, 0, 4, 'analysis'],
      ['theme', 2, null, 4, 24, 'manual'],
      ['solo', 1, 'winds', 24, 30, 'manual'],
      ['solo', 2, null, 30, 40, 'analysis'],
    ]);
    expect(get().corrections.structure.spans).toEqual([{ start: 4, end: 30 }]);
    // A hand part keeps its id when edited again.
    expect(editPart(id, { type: 'bridge' })).toBe(id);
  });

  it('a part added in the middle of another splits it; deleting a detected part stays deleted', () => {
    applyAnalysis(result());
    const id = addPart({ type: 'special', number: null, instrument: null, start: 8, end: 12 });
    expect(id).not.toBeNull();
    expect(view()).toEqual([
      ['intro', null, null, 0, 4, 'analysis'],
      ['theme', 1, null, 4, 8, 'manual'],
      ['special', null, null, 8, 12, 'manual'],
      ['theme', 1, null, 12, 20, 'manual'],
      ['solo', 1, 'winds', 20, 30, 'analysis'],
      ['solo', 2, null, 30, 40, 'analysis'],
    ]);
    const ids = structureInForce(get()).parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(removePart('d-solo2')).toBe(true);
    applyAnalysis(result());
    expect(view().map((p) => p[0])).toEqual(['intro', 'theme', 'special', 'theme', 'solo']);
    expect(structureInForce(get()).parts.at(-1)!.end).toBe(30);
    expectSavedExactly();
    // « Revenir à l'analyse »: all detected again.
    expect(resetStructure()).toBe(true);
    expect(structureInForce(get()).parts.map((p) => p.id)).toEqual(['d-intro', 'd-theme', 'd-solo1', 'd-solo2']);
  });

  it('refuses a part that is not one', () => {
    applyAnalysis(result());
    const before = get().corrections;
    expect(addPart({ type: 'solo', number: null, instrument: null, start: 10, end: 10 })).toBeNull();
    expect(addPart({ type: 'cadenza' as never, number: null, instrument: null, start: 10, end: 12 })).toBeNull();
    expect(editPart('d-solo1', { instrument: 'Trompette !' })).toBeNull();
    expect(editPart('d-solo1', { number: 0 })).toBeNull();
    expect(editPart('nope', { number: 3 })).toBeNull();
    expect(removePart('nope')).toBe(false);
    expect(get().corrections).toBe(before);
  });

  it('section letters: the detected ones until the user edits one, then the user\'s, even all deleted', () => {
    applyAnalysis(result());
    expect(sectionsInForce(get()).map((m) => m.label)).toEqual(['A', 'B', 'A', 'B', 'A']);
    setSection(6, 'C');
    expect(get().corrections.structure.lettersByHand).toBe(true);
    expect(sectionsInForce(get()).map((m) => [m.time, m.label])).toEqual([[0, 'A'], [8, 'B'], [12, 'C'], [16, 'A'], [24, 'B'], [32, 'A']]);
    expect(structureInForce(get()).sectionsOrigin).toBe('manual');
    expect(structureInForce(get()).parts.find((p) => p.id === 'd-theme')!.letters).toEqual(['B', 'C', 'A']);
    for (const bar of [0, 4, 6, 8, 12, 16]) setSection(bar, null);
    expect(get().corrections.sections).toEqual([]);
    applyAnalysis(result());
    expect(sectionsInForce(get())).toEqual([]);
    expectSavedExactly();
    // Back to the detected letters, only when asked.
    expect(resetSectionLetters()).toBe(true);
    expect(sectionsInForce(get()).map((m) => m.label)).toEqual(['A', 'B', 'A', 'B', 'A']);
  });

  it('a piece whose letters were placed by hand before version 6 keeps them in force, detection or not', () => {
    setSection(2, 'A');
    applyAnalysis(result());
    expect(sectionsInForce(get())).toEqual([{ time: 4, label: 'A' }]);
  });

  it('ranges merge where they overlap or touch', () => {
    expect(mergeRanges([{ start: 5, end: 8 }, { start: 0, end: 2 }, { start: 2, end: 3 }, { start: 7, end: 9 }])).toEqual([{ start: 0, end: 3 }, { start: 5, end: 9 }]);
  });
});

describe('a tapped tempo fix (data only)', () => {
  it('is kept with the piece like the two other kinds, and keeps the analysed modulations and structure', () => {
    applyAnalysis(result());
    const previous = get().tempoMap;
    const fix = { time: 8, kind: 'tapped' as const, previous, taps: [8.01, 8.52, 8.98, 9.51], end: 9.5 };
    applyTempoFix(demoSwingResult(DURATION), fix);
    expect(get().corrections.tempoFixes).toEqual([fix]);
    expect(get().analysis!.keyChanges.map((c) => c.time)).toEqual([12, 30]);
    expect(get().analysis!.structure).toEqual(detected());
    expectSavedExactly();
    undoTempoFix(8);
    expect(get().tempoMap).toBe(previous);
    expect(get().corrections.tempoFixes).toEqual([]);
  });
});
