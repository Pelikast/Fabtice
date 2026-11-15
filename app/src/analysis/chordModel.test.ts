// The chord model choice (Réglages avancés): a device preference, what the runner hands the
// analyser with it, and « Analyser de nouveau » with the other model keeping every correction.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { replaceEngine } from '../audio';
import { MockEngine } from '../audio/MockEngine';
import { firstDownbeat } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import * as actions from '../store/actions';
import { keyInForce } from '../store/chartSelectors';
import * as grid from '../store/gridActions';
import * as harmony from '../store/harmonyActions';
import { appStore, initialState } from '../store/store';
import { fakeClock } from '../test/fakeClock';
import { chordModelChoice, resetChordModelChoice, setChordModelChoice } from './chordModel';
import { demoSwingResult } from './fromDemoSwing';
import { replaceAnalyzer } from './index';
import { modelsFor } from './models';
import { analysisProgressStore } from './progress';
import { runAnalysis } from './runner';
import { resultChordModel, type AnalysisModelInfo, type AnalysisRequest, type Analyzer, type ListenedResult } from './types';

const DURATION = 36;
const get = () => appStore.getState();
const { clock } = fakeClock();

/** An analyser that records what it is asked and answers with the demo result (as the fine or default model). */
class Recorder implements Analyzer {
  readonly id = 'recorder';
  requests: AnalysisRequest[] = [];
  constructor(private readonly answer: (r: AnalysisRequest) => ListenedResult) {}
  async models(): Promise<AnalysisModelInfo[]> {
    return [];
  }
  async analyse(r: AnalysisRequest) {
    this.requests.push(r);
    return this.answer(r);
  }
  dispose() {}
}

async function openPiece(stereo: boolean) {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  const n = ENGINE_SAMPLE_RATE * DURATION;
  const l = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 50) * 0.3);
  const r = Float32Array.from({ length: n }, (_, i) => Math.cos(i / 70) * 0.3);
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: stereo ? [l, r] : [l], sampleRate: ENGINE_SAMPLE_RATE } }],
  });
}

const store: Record<string, string> = {};
beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) } };
  for (const k of Object.keys(store)) delete store[k];
  resetChordModelChoice();
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  resetChordModelChoice();
});

describe('the chord model choice', () => {
  it('is CREMA by default, kept on the device, never in the project', async () => {
    expect(chordModelChoice()).toBe('crema');
    setChordModelChoice('fine');
    expect(store['fabtice.chordModel.v1']).toBe('fine');
    resetChordModelChoice();
    expect(chordModelChoice()).toBe('fine');
    store['fabtice.chordModel.v1'] = 'nonsense';
    resetChordModelChoice();
    expect(chordModelChoice()).toBe('crema');
    expect(modelsFor('light', 'crema').map((m) => m.id)).not.toContain('tsumugi-chords');
    expect(modelsFor('light', 'fine').map((m) => m.id)).toEqual(['beat-this-logmel', 'beat-this-small0', 'crema-chords', 'tsumugi-chords']);
  });

  it('the runner asks for the chosen model, with both channels for the fine one', async () => {
    await openPiece(true);
    const rec = new Recorder(() => demoSwingResult(DURATION));
    replaceAnalyzer(rec);
    await runAnalysis();
    expect(rec.requests[0]!.chordModel).toBe('crema');
    expect(rec.requests[0]!.channels).toHaveLength(1);
    setChordModelChoice('fine');
    await runAnalysis();
    expect(rec.requests[1]!.chordModel).toBe('fine');
    expect(rec.requests[1]!.channels).toHaveLength(2);
  });

  it('« Analyser de nouveau » with the fine model keeps the grid, the key and every chord written by hand', async () => {
    await openPiece(false);
    replaceAnalyzer(new Recorder(() => demoSwingResult(DURATION)));
    await runAnalysis();
    grid.moveDownbeat(1);
    harmony.setKey({ tonic: 8, mode: 'minor' });
    harmony.setTuningCorrection(22);
    harmony.setBarChords(3, [{ beatInBar: 0, chord: chord(6, '7', ['b9']) }]);
    harmony.setSection(0, 'A');
    const before = get();
    const downbeat = firstDownbeat(before.tempoMap);

    setChordModelChoice('fine');
    const fine = new Recorder(() => ({ ...demoSwingResult(DURATION), key: { tonic: 4, mode: 'major', confidence: 0.9, alternatives: [] }, chordModel: { id: 'tsumugi-chords' } }));
    replaceAnalyzer(fine);
    await runAnalysis();
    const s = get();
    // the user's grid and key went to the analyser as hints…
    expect(fine.requests[0]!.grid).not.toBeNull();
    expect(fine.requests[0]!.key).toEqual({ tonic: 8, mode: 'minor' });
    // …and nothing done by hand was touched
    expect(s.tempoMap).toBe(before.tempoMap);
    expect(firstDownbeat(s.tempoMap)).toBe(downbeat);
    expect(keyInForce(s)).toMatchObject({ key: { tonic: 8, mode: 'minor' }, origin: 'manual' });
    expect(s.corrections).toBe(before.corrections);
    expect(resultChordModel(s.analysis!).id).toBe('tsumugi-chords');
    expect(analysisProgressStore.getState().fallback).toBeNull();
  });

  it('a fallback to CREMA is recorded in the result and said in the status', async () => {
    await openPiece(false);
    setChordModelChoice('fine');
    replaceAnalyzer(new Recorder(() => ({ ...demoSwingResult(DURATION), chordModel: { id: 'crema-chords', fallback: 'memory' } })));
    await runAnalysis();
    expect(resultChordModel(get().analysis!)).toEqual({ id: 'crema-chords', fallback: 'memory' });
    expect(analysisProgressStore.getState().fallback).toBe('memory');
    // a result stored before the choice existed was read by CREMA
    expect(resultChordModel(demoSwingResult(DURATION)).id).toBe('crema-chords');
  });
});
