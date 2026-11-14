// Store and actions of lot 2: applying an analysis without touching hand
// corrections, every correction, the selectors of the chart, the runner.

import { beforeEach, describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { cancelAnalysis, runAnalysis, startAutoAnalysis } from '../analysis/runner';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { replaceEngine } from '../audio';
import { MockEngine } from '../audio/MockEngine';
import { firstDownbeat, nominalBpm, barStartTime } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { displayChordText } from '../harmony/display';
import { keyLabel } from '../harmony/key';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import {
  keyInForce,
  selectAnalysisStatus,
  selectBarChords,
  selectChartBars,
  selectDisplayedKey,
  selectHasCorrections,
  tuningInForce,
  tuningOffer,
} from './chartSelectors';
import { documentChanged, fromProjectDocument, toProjectDocument } from './document';
import * as grid from './gridActions';
import * as harmony from './harmonyActions';
import { appStore, initialState } from './store';

const DURATION = 36;
const get = () => appStore.getState();
const result = () => demoSwingResult(DURATION);
const written = (bar: number) => {
  const { chords, ctx, repeat } = selectBarChords(get(), bar);
  return repeat ? '%' : chords.map((c) => displayChordText(c.chord, ctx)).join(' ');
};

const { clock } = fakeClock();

async function openPiece() {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
  });
  return engine;
}

describe('applying an analysis', () => {
  beforeEach(openPiece);

  it('a new piece is « not analysed yet »; the analysis brings grid, key, tuning, chords', () => {
    expect(get().analysis).toBeNull();
    expect(selectAnalysisStatus(get())).toBe('none');
    expect(get().tempoMap.origin).toBe('default');
    applyAnalysis(result());
    const s = get();
    expect(selectAnalysisStatus(s)).toBe('done');
    expect(s.tempoMap.origin).toBe('analysis');
    expect(nominalBpm(s.tempoMap, DURATION)).toBeGreaterThan(130);
    expect(keyInForce(s)).toMatchObject({ key: { tonic: 11, mode: 'major' }, origin: 'analysis' });
    expect(tuningInForce(s)).toEqual({ cents: 30, origin: 'analysis' });
    expect(written(0)).toBe('B△(9)');
    expect(selectHasCorrections(s)).toBe(false);
  });

  it('a later analysis never overwrites what was done by hand', () => {
    applyAnalysis(result());
    grid.moveDownbeat(1);
    harmony.setKey({ tonic: 8, mode: 'minor' });
    harmony.setTuningCorrection(22);
    harmony.setBarChords(3, [{ beatInBar: 0, chord: chord(6, '7', ['b9']) }]);
    harmony.setSection(0, 'A');
    const before = get();
    const downbeat = firstDownbeat(before.tempoMap);
    applyAnalysis({ ...result(), key: { tonic: 4, mode: 'major', confidence: 0.9, alternatives: [] } });
    const s = get();
    expect(s.tempoMap).toBe(before.tempoMap);
    expect(firstDownbeat(s.tempoMap)).toBe(downbeat);
    expect(keyInForce(s)).toMatchObject({ key: { tonic: 8, mode: 'minor' }, origin: 'manual' });
    expect(tuningInForce(s)).toEqual({ cents: 22, origin: 'manual' });
    expect(s.corrections).toBe(before.corrections);
    expect(selectHasCorrections(s)).toBe(true);
  });

  it('… unless the user asks: then only the section letters stay', () => {
    applyAnalysis(result());
    grid.doubleTheTempo();
    harmony.setKey({ tonic: 8, mode: 'minor' });
    harmony.setSection(4, 'B');
    applyAnalysis(result(), { replaceCorrections: true });
    const s = get();
    expect(s.tempoMap.origin).toBe('analysis');
    expect(s.corrections.key).toBeNull();
    expect(s.corrections.sections).toHaveLength(1);
  });

  it('a manual grid from the lot 1 panel is kept too', () => {
    actions.setManualGrid({ bpm: 96 });
    applyAnalysis(result());
    expect(get().tempoMap.origin).toBe('manual');
    expect(nominalBpm(get().tempoMap)).toBe(96);
  });

  it('a new piece forgets the previous analysis and corrections', async () => {
    applyAnalysis(result());
    harmony.setSection(0, 'A');
    await openPiece();
    expect(get().analysis).toBeNull();
    expect(get().corrections.sections).toEqual([]);
  });

  it('analysis and corrections are part of the saved document', () => {
    applyAnalysis(result());
    const a = get();
    harmony.setSection(0, 'A');
    expect(documentChanged(a, get())).toBe(true);
    const b = get();
    harmony.setInstrument('sib');
    expect(documentChanged(b, get())).toBe(true);
    const doc = JSON.parse(JSON.stringify(toProjectDocument(get())));
    const back = fromProjectDocument(doc, initialState());
    expect(back.analysis).toEqual(get().analysis);
    expect(back.corrections).toEqual(get().corrections);
    expect(back.view?.instrument).toBe('sib');
    expect(back.analysisRun).toEqual({ status: 'idle' });
  });
});

describe('grid corrections', () => {
  beforeEach(async () => {
    await openPiece();
    applyAnalysis(result());
  });

  it('× 2, ÷ 2, first beat by one beat, beats per bar: the beats stay, bars move', () => {
    const map = get().tempoMap;
    const bpm = nominalBpm(map, DURATION);
    grid.doubleTheTempo();
    expect(get().tempoMap.origin).toBe('corrected');
    expect(nominalBpm(get().tempoMap, DURATION)).toBeCloseTo(bpm * 2, 6);
    grid.halveTheTempo();
    expect(get().tempoMap.segments).toEqual(map.segments);
    grid.moveDownbeat(1);
    expect(firstDownbeat(get().tempoMap)).toBeCloseTo(result().beats.times[1]!, 9);
    grid.moveDownbeat(-1);
    grid.setBeatsPerBar(3);
    expect(barStartTime(get().tempoMap, 1)).toBeCloseTo(result().beats.times[3]!, 9);
    expect(get().tempoMap.segments.length).toBe(map.segments.length);
  });

  it('« Premier temps ici » takes the nearest analysed beat', () => {
    get().transport;
    actions.seek(result().beats.times[5]! + 0.04);
    grid.placeDownbeatAtPlayhead();
    expect(firstDownbeat(get().tempoMap)).toBeCloseTo(result().beats.times[5]!, 9);
  });

  it('back to the analysed grid', () => {
    grid.doubleTheTempo();
    grid.resetGridToAnalysis();
    expect(get().tempoMap.origin).toBe('analysis');
  });

  it('chords stay with the music when the grid moves', () => {
    // C♯m7(9) is bar 3 (index 2) as analysed; one beat later, it starts on beat 4 of bar index 1.
    expect(written(2)).toBe('C♯m7(9)');
    grid.moveDownbeat(1);
    const { chords } = selectBarChords(get(), 1);
    expect(chords.map((c) => c.beatInBar)).toEqual([3]);
  });
});

describe('chord corrections and display', () => {
  beforeEach(async () => {
    await openPiece();
    applyAnalysis(result());
  });

  it('replace, split, remove, confirm, back to the analysis', () => {
    harmony.replaceChord(1, 0, chord(0, 'dim7'));
    expect(written(1)).toBe('C°7');
    expect(selectBarChords(get(), 1).chords[0]!.origin).toBe('manual');
    expect(selectBarChords(get(), 1).chords[0]!.doubtful).toBe(false);
    harmony.splitBar(3);
    expect(written(3)).toBe('F♯7 F♯7');
    harmony.replaceChord(3, 1, chord(11, '7'));
    expect(written(3)).toBe('F♯7 B7');
    harmony.removeChord(3, 0);
    expect(selectBarChords(get(), 3).chords.map((c) => c.beatInBar)).toEqual([2]);
    harmony.splitBar(7); // a repeat bar: the chord going on, twice
    expect(written(7)).toBe('B△ B△');
    harmony.resetBar(7);
    expect(written(7)).toBe('%');
    harmony.confirmBar(4);
    expect(selectBarChords(get(), 4).chords[0]!.origin).toBe('manual');
    harmony.resetChordCorrections();
    expect(selectChartBars(get()).every((b) => b.chords.every((c) => c.origin === 'analysis'))).toBe(true);
  });

  it('a chord typed as displayed is stored at concert pitch in the original key', () => {
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    harmony.setInstrument('sib');
    // Displayed: concert B + 2 semitones + B♭ instrument (+2) = E♭… the user types F7 for bar 2.
    const typed = chord(5, '7');
    harmony.replaceChord(2, 0, harmony.untransposeForStorage(typed));
    expect(get().corrections.chords.at(-1)!.chord).toEqual(chord(1, '7'));
    expect(written(2)).toBe('F7');
  });

  it('transposition and instrument are display only', () => {
    const stored = JSON.stringify(get().analysis);
    expect(keyLabel(selectDisplayedKey(get())!)).toBe('B');
    actions.stepSemitones(-1);
    expect(keyLabel(selectDisplayedKey(get())!)).toBe('B♭');
    expect(written(0)).toBe('B♭△(9)');
    harmony.setInstrument('mib');
    expect(keyLabel(selectDisplayedKey(get())!)).toBe('G');
    expect(written(0)).toBe('G△(9)');
    actions.setMinorNotation('–');
    expect(written(2)).toBe('A–7(9)');
    expect(JSON.stringify(get().analysis)).toBe(stored);
  });

  it('the key by hand changes the spelling; the analysed key again is no correction', () => {
    harmony.setKey({ tonic: 3, mode: 'major' });
    expect(written(2)).toBe('D♭m7(9)');
    harmony.setKey({ tonic: 11, mode: 'major' });
    expect(get().corrections.key).toBeNull();
  });

  it('sections', () => {
    harmony.setSection(0, 'A');
    harmony.setSection(8, 'B');
    const bars = selectChartBars(get());
    expect(bars[8]!.section).toBe('B');
    expect(bars[8]!.doubleBar).toBe(true);
    harmony.setSection(8, '');
    expect(selectChartBars(get())[8]!.section).toBeNull();
  });
});

describe('tuning', () => {
  beforeEach(async () => {
    await openPiece();
    applyAnalysis(result());
  });

  it('offers to compensate a recording off A = 440, once compensated or declined no more', () => {
    expect(tuningOffer(get())).toEqual({ cents: 30, compensation: -30 });
    harmony.compensateTuning();
    expect(get().playback.cents).toBe(-30);
    expect(tuningOffer(get())).toBeNull();
    actions.setCents(0);
    expect(tuningOffer(get())).not.toBeNull();
    harmony.dismissTuningOffer();
    expect(tuningOffer(get())).toBeNull();
  });

  it('a corrected value is what gets compensated; a few cents are not worth an offer', () => {
    harmony.setTuningCorrection(-12);
    harmony.compensateTuning();
    expect(get().playback.cents).toBe(12);
    harmony.setTuningCorrection(3);
    actions.setCents(0);
    expect(tuningOffer(get())).toBeNull();
  });
});

describe('the analysis runner', () => {
  it('starts by itself once the piece can play, shows progress, applies the result', async () => {
    const seen: string[] = [];
    replaceAnalyzer(new MockAnalyzer({ durationMs: 30, downloadMs: 30 }));
    const stop = startAutoAnalysis(true);
    const off = appStore.subscribe((s) => {
      const r = s.analysisRun;
      const tag = r.status === 'running' ? `running:${r.step}` : r.status;
      if (seen.at(-1) !== tag) seen.push(tag);
    });
    await openPiece();
    await new Promise((r) => setTimeout(r, 400));
    off();
    stop();
    expect(seen).toContain('running:download');
    expect(seen).toContain('running:beats');
    expect(seen.at(-1)).toBe('idle');
    expect(selectAnalysisStatus(get())).toBe('done');
  });

  it('passes the user grid and key as hints; a failure is shown, not retried by itself', async () => {
    await openPiece();
    actions.setManualGrid({ bpm: 100 });
    harmony.setKey({ tonic: 2, mode: 'minor' });
    replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
    await runAnalysis();
    expect(get().analysis!.key).toMatchObject({ tonic: 2, mode: 'minor' });
    expect(get().analysis!.beats.times[1]! - get().analysis!.beats.times[0]!).toBeCloseTo(0.6, 9);
    replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0, failWith: 'memory' }));
    await runAnalysis();
    expect(get().analysisRun).toMatchObject({ status: 'error', code: 'memory' });
  });

  it('can be cancelled', async () => {
    await openPiece();
    replaceAnalyzer(new MockAnalyzer({ durationMs: 2000, downloadMs: 0 }));
    const done = runAnalysis();
    await new Promise((r) => setTimeout(r, 30));
    expect(get().analysisRun.status).toBe('running');
    cancelAnalysis();
    await done;
    expect(get().analysisRun.status).toBe('idle');
    expect(get().analysis).toBeNull();
  });
});
