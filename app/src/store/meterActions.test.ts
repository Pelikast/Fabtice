// « Changer la signature rythmique » on the store side (C13): one undo step per
// command, the grid marked as corrected by hand, the selectors stage 4 reads,
// and the user's signatures kept through a new analysis, the manual tempo
// actions, « Revenir à l'analyse », the panel's corrections and a save.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { runAnalysis, runTempoFix } from '../analysis/runner';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { meterChangeList } from '../grid/meters';
import { barStartTime, constantTempoMap } from '../grid/tempoMap';
import type { Meter, TempoMap } from '../model/tempoMap';
import { readDocument } from '../storage/documentFormat';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { originalBpm } from './derived';
import { toProjectDocument } from './document';
import { doubleTheTempo, moveDownbeat, resetGridToAnalysis, setBeatsPerBar } from './gridActions';
import * as history from './history';
import {
  canChangeMeterAt,
  removeMeterChange,
  selectMeterAtBar,
  selectMeterAtTime,
  selectMeterChangeAt,
  selectMeterChanges,
  setMeterForBar,
  setMeterFrom,
} from './meterActions';
import { appStore, initialState } from './store';
import { undoTempoFix } from './tempoFixActions';

const DURATION = 36;
const get = () => appStore.getState();
const m = (numerator: number, denominator: number): Meter => ({ numerator, denominator });
const list = (map: TempoMap = get().tempoMap) => meterChangeList(map).map((c) => [c.bar, `${c.meter.numerator}/${c.meter.denominator}`]);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

let now = 0;
let stop: () => void = () => {};

async function open(tempoMap?: TempoMap) {
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
    tempoMap,
  });
}

beforeEach(async () => {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
  now = 1_000_000;
  stop = history.startHistory(appStore, { now: () => now });
  await open();
  applyAnalysis(demoSwingResult(DURATION));
  history.resetHistory();
});

afterEach(() => stop());

/** Runs `change`, then checks one undo step named « signature rythmique », given back and redone exactly. */
function undoesAndRedoes(change: () => boolean): void {
  const before = structuredClone(get().tempoMap);
  expect(change()).toBe(true);
  const after = structuredClone(get().tempoMap);
  expect(after).not.toEqual(before);
  expect(history.undoLabel()).toBe('Annuler : signature rythmique');
  expect(history.undo()).toBe(true);
  expect(get().tempoMap).toEqual(before);
  expect(history.redoLabel()).toBe('Rétablir : signature rythmique');
  expect(history.redo()).toBe(true);
  expect(get().tempoMap).toEqual(after);
  now += 10_000;
}

describe('the commands', () => {
  it('each is one undo step, and makes the analysed grid a correction by hand', () => {
    expect(get().tempoMap.origin).toBe('analysis');
    undoesAndRedoes(() => setMeterFrom(4, m(3, 4)));
    expect(get().tempoMap.origin).toBe('corrected');
    undoesAndRedoes(() => setMeterForBar(2, m(7, 8)));
    undoesAndRedoes(() => removeMeterChange(4));
    expect(list()).toEqual([[0, '4/4'], [2, '7/8'], [3, '4/4']]);
    undoesAndRedoes(() => setMeterFrom(0, m(6, 8)));
  });

  it('on a grid entered by hand the grid stays `manual`', async () => {
    await open(constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' }));
    expect(setMeterForBar(1, m(2, 4))).toBe(true);
    expect(get().tempoMap.origin).toBe('manual');
    expect(barStartTime(get().tempoMap, 2)).toBe(3);
  });

  it('nothing to do, or refused: false, and no step', () => {
    expect(setMeterFrom(3, m(4, 4))).toBe(false);
    expect(setMeterFrom(-1, m(3, 4))).toBe(false);
    expect(setMeterForBar(2, m(3, 3))).toBe(false);
    expect(removeMeterChange(5)).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(canChangeMeterAt(-1)).toBe(false);
    expect(canChangeMeterAt(0)).toBe(true);
  });

  it('what the window reads', () => {
    setMeterForBar(2, m(5, 8));
    const s = get();
    expect(selectMeterAtBar(s, 2)).toEqual(m(5, 8));
    expect(selectMeterAtBar(s, 3)).toEqual(m(4, 4));
    expect(selectMeterAtTime(s, barStartTime(s.tempoMap, 2) + 0.1)).toEqual(m(5, 8));
    expect(selectMeterChangeAt(s, 2)?.meter).toEqual(m(5, 8));
    expect(selectMeterChangeAt(s, 0)).toBeNull();
    expect(selectMeterChanges(s)).toBe(selectMeterChanges(get()));
    expect(selectMeterChanges(s).map((c) => [c.bar, c.change, c.single])).toEqual([[0, false, false], [2, true, true], [3, true, false]]);
  });

  it('the tempo reads the main signature: one bar of 6/8 at the start does not change it', () => {
    const before = originalBpm(get())!;
    setMeterForBar(0, m(6, 8));
    near(originalBpm(get())!, before, 1e-9);
  });
});

describe('the user’s signatures are kept', () => {
  it('by a new analysis', async () => {
    setMeterFrom(4, m(3, 4));
    setMeterForBar(9, m(2, 4));
    const map = get().tempoMap;
    await runAnalysis();
    expect(get().tempoMap.meters).toEqual(map.meters);
  });

  it('by the manual tempo actions, and when one is undone', async () => {
    setMeterFrom(2, m(3, 4));
    const t2 = barStartTime(get().tempoMap, 2);
    await runTempoFix('continuity', 6);
    expect(get().corrections.tempoFixes).toHaveLength(1);
    expect(list()).toEqual([[0, '4/4'], [2, '3/4']]);
    expect(barStartTime(get().tempoMap, 2)).toBe(t2);
    // A signature set after the action stays when the action is undone at its bar.
    const fixTime = get().corrections.tempoFixes[0]!.time;
    setMeterForBar(4, m(5, 4));
    const t4 = barStartTime(get().tempoMap, 4);
    undoTempoFix(fixTime);
    expect(get().corrections.tempoFixes).toEqual([]);
    expect(list()).toEqual([[0, '4/4'], [2, '3/4'], [4, '5/4'], [5, '3/4']]);
    near(barStartTime(get().tempoMap, 4), t4);
  });

  it('by « Revenir à l’analyse »: the analysed first signature, the later ones in place', () => {
    setBeatsPerBar(3);
    setMeterForBar(6, m(2, 4));
    const t = barStartTime(get().tempoMap, 6);
    resetGridToAnalysis();
    const s = get();
    expect(s.tempoMap.meters[0]!.meter).toEqual(m(4, 4));
    expect(s.tempoMap.origin).toBe('corrected');
    const change = meterChangeList(s.tempoMap).find((c) => c.meter.numerator === 2)!;
    expect(Math.abs(change.time - t)).toBeLessThan(1.1); // the nearest 4/4 bar line of the analysed grid
  });

  it('by the corrections of the panel', () => {
    setMeterForBar(4, m(2, 4));
    const t = barStartTime(get().tempoMap, 4);
    doubleTheTempo();
    expect(meterChangeList(get().tempoMap).some((c) => c.meter.numerator === 2 && Math.abs(c.time - t) < 1e-6)).toBe(true);
    moveDownbeat(1);
    expect(meterChangeList(get().tempoMap).some((c) => c.meter.numerator === 2)).toBe(true);
    setBeatsPerBar(3);
    expect(get().tempoMap.meters[0]!.meter).toEqual(m(3, 4));
    expect(meterChangeList(get().tempoMap).some((c) => c.meter.numerator === 2)).toBe(true);
  });

  it('by a save: every legal signature is written and read back', () => {
    setMeterForBar(2, m(7, 16));
    setMeterForBar(5, m(64, 32));
    setMeterFrom(8, m(1, 4));
    const doc = toProjectDocument(get())!;
    const back = readDocument(JSON.parse(JSON.stringify(doc)))!;
    expect(back.tempoMap).toEqual(get().tempoMap);
  });
});
