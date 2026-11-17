// The modulation window's commands (C10): one undo step each, nothing recorded when nothing changes; the bars
// that carry a mark; the chords after it spelled in the new key.

import { beforeEach, describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { constantTempoMap } from '../grid/tempoMap';
import type { AnalysedKeyChange, AnalysisResult } from '../model/analysis';
import type { Key } from '../model/harmony';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { keyInForce, selectBarContexts, selectChartBars } from './chartSelectors';
import { redo, startHistory, undo, undoLabel } from './history';
import { removeKeyChange, resetKeyChanges } from './keyActions';
import { keyChangesInForce } from './keySelectors';
import { saveModulation } from './modulationActions';
import { appStore, initialState } from './store';

const DURATION = 48;
const get = () => appStore.getState();
const k = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });
const analysed = (time: number, tonic: number): AnalysedKeyChange => ({ time, key: { ...k(tonic), confidence: 0.6, alternatives: [] } });

function result(keyChanges: AnalysedKeyChange[]): AnalysisResult {
  return { ...demoSwingResult(DURATION), keyChanges, structure: null };
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
    analysis: result([analysed(16, 4)]),
  });
  startHistory();
});

const markedBars = () => selectChartBars(get()).filter((b) => b.keyChange).map((b) => `${b.bar}:${b.keyChange!.tonic}${b.keyChange!.mode === 'minor' ? 'm' : ''}`);

describe('the bars that carry a mark', () => {
  it('the analysed modulation is on its bar, the contexts switch there', () => {
    expect(markedBars()).toEqual(['8:4']);
    const contexts = selectBarContexts(get());
    expect(contexts.get(7)!.key).toEqual(k(keyInForce(get()).key!.tonic, keyInForce(get()).key!.mode));
    expect(contexts.get(8)!.key).toEqual(k(4));
    expect(contexts.get(20)!.key).toEqual(k(4));
  });

  it('follows the transposition: the key shown is the displayed one', () => {
    actions.stepSemitones(1);
    const contexts = selectBarContexts(get());
    expect(contexts.get(8)!.key).toEqual(k(5));
    expect(contexts.get(7)!.key!.tonic).toBe((keyInForce(get()).key!.tonic + 1) % 12);
  });
});

describe('saveModulation', () => {
  it('adds one: a step, « Annuler : tonalité », undone and redone', () => {
    expect(saveModulation(null, 32, k(2, 'minor'))).toBe(true);
    expect(markedBars()).toEqual(['8:4', '16:2m']);
    expect(undoLabel()).toBe('Annuler : tonalité');
    undo();
    expect(markedBars()).toEqual(['8:4']);
    expect(get().corrections.keyChanges).toBeNull();
    redo();
    expect(markedBars()).toEqual(['8:4', '16:2m']);
  });

  it('changes the key AND the bar of one as a single step', () => {
    expect(saveModulation(16, 24, k(9))).toBe(true);
    expect(markedBars()).toEqual(['12:9']);
    undo();
    expect(markedBars()).toEqual(['8:4']);
    expect(undoLabel()).toBeNull();
  });

  it('changes only the key, or only the bar', () => {
    saveModulation(16, 16, k(11));
    expect(markedBars()).toEqual(['8:11']);
    saveModulation(16, 40, k(11));
    expect(markedBars()).toEqual(['20:11']);
  });

  it('records nothing when nothing changes', () => {
    expect(saveModulation(16, 16, k(4))).toBe(true);
    expect(undoLabel()).toBeNull();
    expect(get().corrections.keyChanges).toBeNull();
  });

  it('refuses the key of the passage before, creating nothing', () => {
    // k(4) is the key in force at bar 16 (the analysed modulation): no empty change is written.
    expect(saveModulation(null, 32, k(4))).toBe(false);
    expect(markedBars()).toEqual(['8:4']);
    expect(saveModulation(null, 8, keyInForce(get()).key!)).toBe(false);
    expect(markedBars()).toEqual(['8:4']);
  });

  it('an unknown modulation to edit is refused', () => {
    expect(saveModulation(30, 32, k(2))).toBe(false);
    expect(undoLabel()).toBeNull();
  });
});

describe('delete and give back', () => {
  it('deleting the analysed one stays deleted; the user list is in force; reset gives them back', () => {
    expect(removeKeyChange(16)).toBe(true);
    expect(markedBars()).toEqual([]);
    expect(get().corrections.keyChanges).toEqual([]);
    resetKeyChanges();
    expect(markedBars()).toEqual(['8:4']);
    expect(get().corrections.keyChanges).toBeNull();
    undo();
    expect(markedBars()).toEqual([]);
    undo();
    expect(markedBars()).toEqual(['8:4']);
  });

  it('the list in force is what the window edits', () => {
    saveModulation(null, 32, k(2));
    expect(keyChangesInForce(get()).map((c) => c.time)).toEqual([16, 32]);
  });
});
