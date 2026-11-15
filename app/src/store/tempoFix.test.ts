// The manual tempo actions on the store side: applied as a correction of the
// grid by hand, kept by a new analysis, undone per bar or with « Revenir à
// l'analyse », saved with the piece. The analyser is the mock (its stand-in for
// the actions holds the tempo of the bars before; the real computation is
// tested in `analysis/engine/tempoFix.test.ts`).

import { beforeEach, describe, expect, it } from 'vitest';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { runAnalysis, runTempoFix } from '../analysis/runner';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { beatGridOf, tempoMapFromBeats } from '../grid/beats';
import { barStartTime } from '../grid/tempoMap';
import { readDocument } from '../storage/documentFormat';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { documentChanged, toProjectDocument } from './document';
import { resetGridToAnalysis } from './gridActions';
import { replaceChord } from './harmonyActions';
import { appStore, initialState } from './store';
import { undoLastTempoFix, undoTempoFix } from './tempoFixActions';

const DURATION = 36;
const get = () => appStore.getState();
const beats = () => beatGridOf(get().tempoMap, DURATION).times;

beforeEach(async () => {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
  });
  applyAnalysis(demoSwingResult(DURATION));
});

describe('a manual tempo action', () => {
  it('changes the grid from its bar only, as a correction by hand, and keeps the analysed beats and the chords before it', async () => {
    const analysed = get().analysis!.beats.times.slice();
    const chordsBefore = get().analysis!.chords.slice();
    const from = barStartTime(get().tempoMap, 4);
    const before = beats().filter((t) => t < from - 1e-6);
    await runTempoFix('continuity', 4);
    const s = get();
    expect(s.tempoMap.origin).toBe('corrected');
    expect(beats().slice(0, before.length)).toEqual(before);
    expect(s.corrections.tempoFixes.map((f) => [f.time, f.kind])).toEqual([[from, 'continuity']]);
    expect(s.analysis!.beats.times).toEqual(analysed);
    expect(s.analysis!.chords.filter((c) => c.time < from - 1e-6)).toEqual(chordsBefore.filter((c) => c.time < from - 1e-6));
    expect(s.analysisRun.status).toBe('idle');
    // Hand work after the bar stays where it was in the recording.
    replaceChord(6, 0, null);
    const hand = get().corrections.chords.map((c) => c.time);
    await runTempoFix('fresh', 2);
    expect(get().corrections.chords.map((c) => c.time)).toEqual(hand);
  });

  it('survives « Analyser de nouveau »; « Revenir à l’analyse » in the panel drops it', async () => {
    await runTempoFix('fresh', 3);
    const fixed = beats();
    await runAnalysis();
    expect(beats()).toEqual(fixed);
    expect(get().corrections.tempoFixes).toHaveLength(1);
    resetGridToAnalysis();
    expect(get().tempoMap.origin).toBe('analysis');
    expect(get().corrections.tempoFixes).toEqual([]);
    const a = get().analysis!.beats;
    expect(get().tempoMap).toEqual(tempoMapFromBeats(a.times, a.downbeat, a.meter, 'analysis'));
  });

  it('composes, and is undone at its bar (with the ones made after it) or as the last one', async () => {
    const start = get().tempoMap;
    await runTempoFix('continuity', 2);
    const afterFirst = get().tempoMap;
    await runTempoFix('fresh', 6);
    expect(get().corrections.tempoFixes).toHaveLength(2);
    undoLastTempoFix();
    expect(get().tempoMap).toBe(afterFirst);
    await runTempoFix('fresh', 6);
    undoTempoFix(barStartTime(start, 2));
    expect(get().tempoMap).toBe(start);
    expect(get().corrections.tempoFixes).toEqual([]);
  });

  it('is saved with the piece and read back; a version 5 document written before it reads with none', async () => {
    await runTempoFix('continuity', 4);
    const prev = get();
    const doc = toProjectDocument(get())!;
    const back = readDocument(JSON.parse(JSON.stringify(doc)))!;
    expect(back.corrections.tempoFixes).toEqual(get().corrections.tempoFixes);
    expect(back.tempoMap).toEqual(get().tempoMap);
    const { tempoFixes: _gone, ...older } = doc.corrections;
    expect(readDocument(JSON.parse(JSON.stringify({ ...doc, corrections: older })))!.corrections.tempoFixes).toEqual([]);
    undoLastTempoFix();
    expect(documentChanged(prev, get())).toBe(true);
  });
});
