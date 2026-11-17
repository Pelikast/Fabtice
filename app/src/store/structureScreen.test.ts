// Stage 5, the screens of the structure: the readers that now follow the letters in force (detected until the
// user edits them), the display of the chart (whole, simplified, one part), and the commands of the column.
// A detected structure, no letter by hand.

import { beforeEach, describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { replaceEngine, getEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { chartForExport } from '../export/chartExport';
import { constantTempoMap } from '../grid/tempoMap';
import type { AnalysisResult } from '../model/analysis';
import type { DetectedStructure, StructurePart } from '../model/structure';
import { sectionRanges } from '../markers/markers';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { selectChartBars, selectHasMarkers, selectSectionAt } from './chartSelectors';
import { changePart, deletePart, loopPart, selectChartDisplay, selectShownBars, selectShownPart, showFullChart, showPart, showSimplifiedChart } from './chartDisplay';
import { setSection } from './harmonyActions';
import { redo, startHistory, undo, undoLabel } from './history';
import { addSection, currentSections } from './markerActions';
import { selectSimplifiedChart, selectSimplifyInput, harmonyBars } from './simplifiedSelectors';
import { appStore, initialState } from './store';
import { addPart, removePart, resetSectionLetters, resetStructure, setStructureMode } from './structureActions';
import { sectionsInForce, structureInForce } from './structureSelectors';

const DURATION = 48;
const get = () => appStore.getState();
const part = (id: string, type: StructurePart['type'], first: number, end: number, extra: Partial<StructurePart> = {}): StructurePart => ({ id, type, number: null, instrument: null, start: first * 2, end: end * 2, ...extra });

/** Bars of 2 s: bar n starts at 2n. Two-bar letters, as the demo piece. */
const detected = (): DetectedStructure => ({
  mode: 'jazz',
  form: 'AABC',
  sections: [[2, 'A'], [4, 'A'], [6, 'B'], [8, 'C']].map(([bar, label]) => ({ time: (bar as number) * 2, label: label as string })),
  parts: [part('intro', 'intro', 0, 2), part('t1', 'theme', 2, 10, { number: 1 }), part('s1', 'solo', 10, 14, { instrument: 'guitar' }), part('out', 'outro', 22, 24)],
});

const withStructure = (structure: DetectedStructure | null): AnalysisResult => ({ ...demoSwingResult(DURATION), keyChanges: [], structure });

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
    analysis: withStructure(detected()),
  });
});

describe('the readers follow the letters in force (detected ones, no hand letter)', () => {
  it('selectHasMarkers: the detected letters are markers', () => {
    expect(get().corrections.sections).toEqual([]);
    expect(selectHasMarkers(get())).toBe(true);
    appStore.setState({ analysis: withStructure(null) });
    expect(selectHasMarkers(get())).toBe(false);
  });

  it('selectChartBars writes the detected letters on their bars, and only recomputes when they change', () => {
    const bars = selectChartBars(get());
    expect(bars.filter((b) => b.section).map((b) => `${b.bar}:${b.section}`)).toEqual(['2:A', '4:A', '6:B', '8:C']);
    expect(bars.find((b) => b.bar === 4)!.doubleBar).toBe(true);
    expect(selectChartBars(get())).toBe(bars);
    // Hand letters replace them, and the bars follow.
    setSection(0, 'Z');
    const byHand = selectChartBars(get());
    expect(byHand).not.toBe(bars);
    expect(byHand.filter((b) => b.section).length).toBe(5);
    expect(byHand[0]!.section).toBe('Z');
  });

  it('selectChartBars follows a new detection', () => {
    const before = selectChartBars(get());
    appStore.setState({ analysis: withStructure({ ...detected(), sections: [{ time: 6, label: 'X' }] }) });
    const after = selectChartBars(get());
    expect(after).not.toBe(before);
    expect(after.filter((b) => b.section).map((b) => `${b.bar}:${b.section}`)).toEqual(['3:X']);
  });

  it('selectSectionAt reads the detected letter at a bar', () => {
    expect(selectSectionAt(get(), 6)).toBe('B');
    expect(selectSectionAt(get(), 7)).toBeNull();
  });

  it('the sections of the markers (panel, ruler row, « Boucler ») are the detected ones', () => {
    expect(currentSections().map((r) => `${r.bar}:${r.label}`)).toEqual(['2:A', '4:A', '6:B', '8:C']);
    // The ruler and the panel list the same ranges from the same reader.
    const s = get();
    expect(sectionRanges(s.tempoMap, sectionsInForce(s), DURATION).length).toBe(4);
  });

  it('« Nouvelle section » takes the next letter free among the ones in force', () => {
    const bar = addSection();
    expect(bar).toBe(0);
    // A, B and C are used by the detected letters: the next is D, and the detected letters were adopted.
    expect(get().corrections.sections.map((m) => m.label).sort()).toEqual(['A', 'A', 'B', 'C', 'D']);
  });

  it('the invalidation key of the ruler changes with the detection and with the hand letters, and with nothing else', () => {
    const key = sectionsInForce(get());
    expect(sectionsInForce(get())).toBe(key);
    appStore.setState({ analysis: withStructure(detected()) });
    expect(sectionsInForce(get())).not.toBe(key);
    const key2 = sectionsInForce(get());
    setStructureMode('pop');
    expect(sectionsInForce(get())).toBe(key2);
    setSection(0, 'Q');
    expect(sectionsInForce(get())).not.toBe(key2);
    resetSectionLetters();
    expect(sectionsInForce(get())).toBe(get().analysis!.structure!.sections);
  });

  it('the exports read the letters in force', () => {
    const chart = chartForExport(get())!;
    const labelled = chart.bars.filter((b) => b.section).map((b) => b.section);
    expect(labelled).toEqual(['A', 'A', 'B', 'C']);
  });
});

describe('the display of the chart', () => {
  it('starts on the whole chart, from the first bar to the last', () => {
    expect(get().ui.chartDisplay).toEqual({ kind: 'full' });
    expect(selectChartDisplay(get())).toEqual({ kind: 'full' });
    expect(selectShownBars(get())).toBe(selectChartBars(get()));
  });

  it('a part shows its own bars, numbers kept, and puts the playhead at its start', () => {
    expect(showPart('t1')).toBe(true);
    expect(selectChartDisplay(get())).toEqual({ kind: 'part', id: 't1' });
    const shown = selectShownBars(get());
    expect(shown.map((b) => b.bar)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shown[0]!.doubleBar).toBe(false);
    expect(getEngine().getPosition()).toBeCloseTo(4, 3);
    // Same array while nothing it reads changes.
    expect(selectShownBars(get())).toBe(shown);
    expect(selectShownPart(get())!.id).toBe('t1');
  });

  it('a part that reaches the end of the piece shows its last bar', () => {
    showPart('out');
    expect(selectShownBars(get()).map((b) => b.bar)).toEqual([22, 23]);
  });

  it('falls back to the whole chart when the part is gone', () => {
    showPart('s1');
    expect(removePart('s1')).toBe(true);
    expect(selectChartDisplay(get())).toEqual({ kind: 'full' });
    expect(selectShownPart(get())).toBeNull();
    expect(selectShownBars(get())).toBe(selectChartBars(get()));
  });

  it('an unknown part changes nothing', () => {
    expect(showPart('nope')).toBe(false);
    expect(loopPart('nope')).toBe(false);
    expect(get().ui.chartDisplay).toEqual({ kind: 'full' });
  });

  it('shows the simplified chart and the whole chart again', () => {
    showSimplifiedChart();
    expect(selectChartDisplay(get())).toEqual({ kind: 'simplified' });
    showFullChart();
    expect(selectChartDisplay(get())).toEqual({ kind: 'full' });
  });

  it('is not saved and not undoable', () => {
    startHistory();
    showPart('t1');
    showSimplifiedChart();
    expect(undoLabel()).toBeNull();
  });

  it('a new piece starts on the whole chart', async () => {
    showSimplifiedChart();
    await actions.openProject({
      title: 'Autre',
      source: { kind: 'file', fileName: 'autre.mp3' },
      tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * 10)], sampleRate: ENGINE_SAMPLE_RATE } }],
    });
    expect(get().ui.chartDisplay).toEqual({ kind: 'full' });
  });

  it('« Boucle » loops the whole part, as any loop', () => {
    expect(loopPart('t1')).toBe(true);
    expect(get().loop).toEqual({ region: { start: 4, end: 20 }, enabled: true });
    // The playhead was outside: it goes to the start of the loop.
    expect(getEngine().getPosition()).toBeCloseTo(4, 3);
  });

  it('editing the part shown keeps it shown (a detected part gets a new id)', () => {
    showPart('s1');
    const id = changePart('s1', { instrument: 'trumpet' });
    expect(id).not.toBeNull();
    expect(id).not.toBe('s1');
    expect(selectChartDisplay(get())).toEqual({ kind: 'part', id: id! });
    expect(selectShownPart(get())!.instrument).toBe('trumpet');
    expect(selectShownPart(get())!.origin).toBe('manual');
  });
});

describe('the commands of the column, and undo', () => {
  beforeEach(() => {
    startHistory();
  });

  it('mode: Pop, then back to the automatic one, each an undo step', () => {
    expect(structureInForce(get()).mode).toBe('jazz');
    expect(structureInForce(get()).modeOrigin).toBe('analysis');
    setStructureMode('pop');
    expect(structureInForce(get()).mode).toBe('pop');
    expect(structureInForce(get()).modeOrigin).toBe('manual');
    expect(undoLabel()).toBe('Annuler : structure');
    setStructureMode('auto');
    expect(structureInForce(get()).modeOrigin).toBe('analysis');
    undo();
    expect(structureInForce(get()).mode).toBe('pop');
    undo();
    expect(structureInForce(get()).mode).toBe('jazz');
    redo();
    expect(structureInForce(get()).mode).toBe('pop');
  });

  it('add, edit, delete and reset a part, all undoable', () => {
    const id = addPart({ type: 'bridge', number: null, instrument: null, start: 28, end: 36 });
    expect(id).not.toBeNull();
    expect(structureInForce(get()).parts.map((p) => p.type)).toEqual(['intro', 'theme', 'solo', 'bridge', 'outro']);
    undo();
    expect(structureInForce(get()).parts.length).toBe(4);
    redo();
    expect(structureInForce(get()).parts.length).toBe(5);
    const edited = changePart('t1', { number: 2, start: 6, end: 18 })!;
    expect(structureInForce(get()).parts.find((p) => p.id === edited)).toMatchObject({ number: 2, start: 6, end: 18 });
    deletePart(edited);
    expect(structureInForce(get()).parts.some((p) => p.id === edited)).toBe(false);
    expect(resetStructure()).toBe(true);
    expect(structureInForce(get()).parts.map((p) => p.id)).toEqual(['intro', 't1', 's1', 'out']);
    undo();
    expect(structureInForce(get()).parts.some((p) => p.origin === 'manual')).toBe(true);
  });
});

describe('the simplified chart, until its renderer lands', () => {
  it('builds what the function reads from the state in force', () => {
    const input = selectSimplifyInput(get());
    expect(input.bars.length).toBe(selectChartBars(get()).length);
    expect(input.sections).toEqual([{ bar: 2, label: 'A' }, { bar: 4, label: 'A' }, { bar: 6, label: 'B' }, { bar: 8, label: 'C' }]);
    expect(input.parts.map((p) => [p.id, p.type, p.firstBar, p.endBar, p.letters.join('')])).toEqual([
      ['intro', 'intro', 0, 2, ''],
      ['t1', 'theme', 2, 10, 'AABC'],
      ['s1', 'solo', 10, 14, ''],
      ['out', 'outro', 22, 24, ''],
    ]);
    expect(input.keyChanges).toEqual([]);
    expect(input.known).toEqual([]);
    expect(selectSimplifyInput(get())).toBe(input);
  });

  it('is null while the function finds nothing, and the same answer is kept', () => {
    expect(selectSimplifiedChart(get())).toBeNull();
    expect(selectSimplifiedChart(get())).toBeNull();
  });

  it('reads the parts and letters in force: hand corrections come through', () => {
    removePart('s1');
    setSection(12, 'D');
    const input = selectSimplifyInput(get());
    expect(input.parts.some((p) => p.id === 's1')).toBe(false);
    expect(input.sections.map((s) => s.label)).toEqual(['A', 'A', 'B', 'C', 'D']);
  });

  it('gives the bars as the harmony pass reads them, with the chord still sounding at the bar line', () => {
    const bars = harmonyBars(selectChartBars(get()));
    const withChords = selectChartBars(get());
    expect(bars.length).toBe(withChords.length);
    const carried = bars.find((b) => b.carried !== null);
    if (carried) {
      expect(carried.chords.every((c) => c.beat !== 0)).toBe(true);
    }
    for (const b of bars) expect(b.beats).toBe(4);
  });
});
