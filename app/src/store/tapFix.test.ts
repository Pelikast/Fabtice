// The tapped tempo correction (C12) on the store side: the preview shown for
// listening is no undo step, marks nothing modified and is never saved; the
// commit is one manual tempo action (one undo step: the grid, the analysed
// chords from the bar, the tempo fixes), undone at its bar by « Revenir à
// l'analyse », saved with the piece. Bars that start between two beats of
// the grid (after a 7/8 bar) take the three actions. The analyser is the mock
// (its stand-in places a beat on each tap); the real computation is tested in
// `analysis/engine/tapGrid.test.ts` and on the bench.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { runTempoFix } from '../analysis/runner';
import { commitTappedFix, discardTappedPreview, MIN_TAPS, previewTappedFix, showTappedPreview, tapNow, type TappedPreview } from '../analysis/tapFix';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { beatGridOf } from '../grid/beats';
import { barStartTime, timeToBar, timeToBeat } from '../grid/tempoMap';
import { readDocument } from '../storage/documentFormat';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { toProjectDocument } from './document';
import * as history from './history';
import { setMeterForBar } from './meterActions';
import { appStore, gridInForce, initialState } from './store';
import { undoTempoFix } from './tempoFixActions';

const DURATION = 36;
const get = () => appStore.getState();
const beats = () => beatGridOf(get().tempoMap, DURATION).times;
let stop: () => void = () => {};
let engine: MockEngine;

beforeEach(async () => {
  appStore.setState(initialState(), true);
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
  });
  applyAnalysis(demoSwingResult(DURATION));
  stop = history.startHistory(appStore);
});

afterEach(() => stop());

/** Taps on the beats of bars `bar` … `bar + bars − 1` of the grid in force, each beat drawn out by `stretch`. */
function tapsFrom(bar: number, bars: number, stretch = 1.1): number[] {
  const map = get().tempoMap;
  const from = barStartTime(map, bar);
  const to = barStartTime(map, bar + bars);
  const b = beatGridOf(map, DURATION).times.filter((t) => t >= from - 1e-6 && t <= to + 1e-6);
  return b.map((t) => from + (t - from) * stretch);
}

async function preview(bar: number, taps: number[]): Promise<TappedPreview> {
  const p = await previewTappedFix(bar, taps);
  if ('refused' in p) throw new Error(`refused: ${p.refused}`);
  return p;
}

describe('the tapped correction', () => {
  it('a preview stores nothing; shown, it is no undo step, not modified, never saved; discarded, the grid comes back exactly', async () => {
    history.markSaved();
    const start = get().tempoMap;
    const p = await preview(4, tapsFrom(4, 3));
    expect(get().tempoMap).toBe(start);
    expect(get().corrections.tempoFixes).toEqual([]);
    expect(p.previous).toBe(start);
    expect(p.end).toBeCloseTo(tapsFrom(4, 3).at(-1)!, 6);
    showTappedPreview(p);
    expect(get().tempoMap).toBe(p.tempoMap);
    expect(gridInForce(get())).toBe(start);
    expect(history.canUndo()).toBe(false);
    expect(history.isModified()).toBe(false);
    expect(toProjectDocument(get())!.tempoMap).toBe(start);
    expect(get().corrections.tempoFixes).toEqual([]);
    discardTappedPreview();
    expect(get().tempoMap).toBe(start);
    expect(get().tempoPreview).toBeNull();
    expect(history.canUndo()).toBe(false);
    expect(history.isModified()).toBe(false);
    discardTappedPreview();
    expect(get().tempoMap).toBe(start);
  });

  it('kept, it is one manual tempo action: one undo step, the beats before the bar as they were, the bar still a downbeat; undone and redone', async () => {
    const start = get().tempoMap;
    const analysis = get().analysis;
    const from = barStartTime(start, 4);
    const before = beats().filter((t) => t < from - 1e-6);
    const taps = tapsFrom(4, 3);
    const p = await preview(4, taps);
    showTappedPreview(p);
    await commitTappedFix(p);
    const s = get();
    expect(s.tempoPreview).toBeNull();
    expect(s.tempoMap.origin).toBe('corrected');
    expect(beats().slice(0, before.length)).toEqual(before);
    expect(barStartTime(s.tempoMap, 4)).toBeCloseTo(from, 9);
    // The mock's stand-in puts a beat on each tap.
    for (const t of taps.slice(1)) expect(beats().some((b) => Math.abs(b - t) < 1e-6)).toBe(true);
    expect(s.corrections.tempoFixes).toHaveLength(1);
    const fix = s.corrections.tempoFixes[0]!;
    expect(fix.kind).toBe('tapped');
    expect(fix.time).toBe(from);
    expect(fix.previous).toBe(start);
    if (fix.kind !== 'tapped') throw new Error('kind');
    expect(fix.taps).toEqual(taps);
    expect(fix.end).toBe(p.end);
    expect((s.analysis as unknown as Record<string, unknown>).tapped).toBeUndefined();
    expect(s.analysis!.beats).toEqual(analysis!.beats);
    expect(history.undoLabel()).toBe('Annuler : correction du tempo');
    history.undo();
    expect(get().tempoMap).toBe(start);
    expect(get().corrections.tempoFixes).toEqual([]);
    expect(get().analysis).toBe(analysis);
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(get().corrections.tempoFixes).toHaveLength(1);
  });

  it('« Revenir à l’analyse » at its bar gives the grid before back; it is saved with the piece and read back', async () => {
    const start = get().tempoMap;
    const p = await preview(4, tapsFrom(4, 3));
    await commitTappedFix(p);
    const doc = toProjectDocument(get())!;
    const back = readDocument(JSON.parse(JSON.stringify(doc)))!;
    expect(back.corrections.tempoFixes).toEqual(get().corrections.tempoFixes);
    expect(back.tempoMap).toEqual(get().tempoMap);
    undoTempoFix(p.from);
    expect(get().tempoMap).toBe(start);
    expect(get().corrections.tempoFixes).toEqual([]);
  });

  it('an undo during the preview ends it; a commit computed on another grid is not stored', async () => {
    const start = get().tempoMap;
    actions.setLoopRegion({ start: 4, end: 8 });
    const p = await preview(4, tapsFrom(4, 3));
    showTappedPreview(p);
    history.undo();
    expect(get().tempoMap).toBe(start);
    discardTappedPreview();
    expect(get().tempoMap).toBe(start);
    // The grid changed since the preview was computed: nothing is stored.
    await runTempoFix('fresh', 2);
    await commitTappedFix(p);
    expect(get().corrections.tempoFixes.map((f) => f.kind)).toEqual(['fresh']);
  });

  it('the taps along the count-in are not counted as taps left out', async () => {
    const countIn = tapsFrom(2, 2, 1).filter((t) => t < barStartTime(get().tempoMap, 4) - 0.05);
    const p = await preview(4, [...countIn, ...tapsFrom(4, 3)]);
    expect(countIn.length).toBeGreaterThan(4);
    expect(p.reading.dropped).toBe(0);
    expect(p.reading.filled).toBe(0);
  });

  it('says why it cannot compute', async () => {
    expect(await previewTappedFix(4, tapsFrom(4, 3).slice(0, MIN_TAPS - 1))).toEqual({ refused: 'tooFewTaps' });
    expect(await previewTappedFix(4, [1, 2, 3])).toEqual({ refused: 'tooFewTaps' });
    expect(await previewTappedFix(10_000, tapsFrom(4, 3))).toEqual({ refused: 'notABar' });
    appStore.setState({ analysis: null });
    expect(await previewTappedFix(4, tapsFrom(4, 3))).toEqual({ refused: 'noAnalysis' });
  });

  it('a tap is the position heard: the output latency taken off, in source seconds', () => {
    engine.seek(10);
    expect(tapNow()).toBe(10);
    (engine as unknown as { getOutputLatency: () => number }).getOutputLatency = () => 0.05;
    appStore.setState((s) => ({ playback: { ...s.playback, tempoRatio: 0.5 } }));
    expect(tapNow()).toBeCloseTo(9.975, 9);
    expect(tapNow(performance.now() - 100)).toBeCloseTo(9.925, 2);
  });
});

describe('after a bar with an odd number of eighths', () => {
  beforeEach(() => {
    // Bar 3 (« mesure 4 ») in 7/8: the bars after it start between two beats of the grid.
    expect(setMeterForBar(3, { numerator: 7, denominator: 8 })).toBe(true);
    const at = timeToBeat(get().tempoMap, barStartTime(get().tempoMap, 5));
    expect(Math.abs(at - Math.round(at))).toBeCloseTo(0.5, 6);
  });

  for (const kind of ['continuity', 'fresh'] as const) {
    it(`« ${kind} » works on such a bar: the beats before it as they were, it stays a bar line`, async () => {
      const start = get().tempoMap;
      const from = barStartTime(start, 5);
      const before = beats().filter((t) => t < from - 1e-6);
      await runTempoFix(kind, 5);
      const s = get();
      expect(s.corrections.tempoFixes.map((f) => f.kind)).toEqual([kind]);
      expect(beats().slice(0, before.length)).toEqual(before);
      expect(barStartTime(s.tempoMap, 5)).toBeCloseTo(from, 9);
      expect(timeToBar(s.tempoMap, from + 1e-6).bar).toBe(5);
      // The 7/8 bar is still there, on the same bar.
      expect(s.tempoMap.meters.map((m) => [m.bar, m.meter.numerator, m.meter.denominator])).toEqual(start.meters.map((m) => [m.bar, m.meter.numerator, m.meter.denominator]));
      undoTempoFix(from);
      expect(get().tempoMap).toEqual(start);
    });
  }

  it('the tapped correction works on such a bar', async () => {
    const start = get().tempoMap;
    const from = barStartTime(start, 5);
    const before = beats().filter((t) => t < from - 1e-6);
    const taps = tapsFrom(5, 2, 1.05);
    const p = await preview(5, taps);
    await commitTappedFix(p);
    const map = get().tempoMap;
    expect(beats().slice(0, before.length)).toEqual(before);
    expect(barStartTime(map, 5)).toBeCloseTo(from, 9);
    // The tapped beats are beats of the new grid, the bar's own beats from its start.
    for (const t of taps.slice(1)) {
      const b = timeToBeat(map, t) - timeToBeat(map, from);
      expect(Math.abs(b - Math.round(b))).toBeLessThan(1e-6);
    }
  });
});
