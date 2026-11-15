// The known chart on synthetic evidence and tiny hand-written charts (never a
// real one): found in another key after an intro, at double time, rejected
// when it is another tune, and a prior that helps where the audio hesitates
// without overriding what is clearly heard.

import { describe, expect, it } from 'vitest';
import type { EngineQuality } from './chords';
import { applyEvidence } from './evidence';
import { chartBeats, engineIndex, findChartCandidates, fitKnownChart, priorAround, referenceCharts, CHART_DEFAULTS, type ChartCandidate } from './knownChart';
import type { KeyEstimate } from './key';
import { best, chartChordsPerBeat, ix, makeChart, numbersFor, rng, unit } from './structure.fixtures';
import { chord } from '../../harmony/chord';
import { buildTitleIndex } from '../../standards/match';
import type { StandardChart } from '../../standards/irealRead';

type Bars = [number, EngineQuality][][];

// a 16-bar tune in C, AB form, ii-V-I with two chords in some bars
const TUNE: Bars = [
  [[2, 'min7']], [[7, '7']], [[0, 'maj7']], [[0, 'maj7']],
  [[4, 'min7'], [9, '7']], [[2, 'min7'], [7, '7']], [[0, 'maj7']], [[9, '7']],
  [[5, 'maj7']], [[5, 'min7']], [[4, 'min7']], [[9, '7']],
  [[2, 'min7']], [[7, '7']], [[0, 'maj7']], [[0, 'maj7']],
];
// another tune of 16 bars, in a minor key
const OTHER: Bars = [
  [[0, 'min7']], [[0, 'min7']], [[5, 'min7']], [[5, 'min7']],
  [[2, 'hdim7']], [[7, '7']], [[0, 'min7']], [[0, 'min7']],
  [[3, 'min7']], [[8, '7']], [[1, 'maj7']], [[1, 'maj7']],
  [[2, 'hdim7']], [[7, '7']], [[0, 'min7']], [[7, '7']],
];
// other tunes for the reference charts (the null of the verification): made of the same
// ii-V-I cells as real standards, in keys that move every four bars
function filler(seed: number): StandardChart {
  const r = rng(seed);
  const bars: Bars = [];
  while (bars.length < 16) {
    const k = Math.floor(r() * 12);
    const cell: Bars = r() < 0.5
      ? [[[k + 2, 'min7']], [[k + 7, '7']], [[k, 'maj7']], [[k, 'maj7']]]
      : [[[k + 2, 'hdim7']], [[k + 7, '7']], [[k, 'min7']], [[k + 5, '7']]];
    bars.push(...cell);
  }
  return makeChart(`Filler ${seed}`, { tonic: 0, mode: 'major' }, bars);
}
const REFS = Array.from({ length: 30 }, (_, i) => filler(100 + i));

/** A recording: intro bars, then `choruses` of a form, every chord transposed, `scale` beats per chart beat. */
function recording(form: Bars, choruses: number, transpose: number, p: number, opts: { intro?: number; scale?: number; seed?: number; override?: Map<number, { c: number | null; p: number }> } = {}) {
  const r = rng(opts.seed ?? 3);
  const scale = opts.scale ?? 1;
  const perBeat = chartChordsPerBeat(form, transpose);
  const truth: number[] = [];
  for (let i = 0; i < (opts.intro ?? 0) * 4; i++) truth.push(ix(Math.floor(r() * 12), 'maj'));
  for (let c = 0; c < choruses; c++) for (const x of perBeat) for (let k = 0; k < scale; k++) truth.push(x);
  const units = truth.map((c, b) => {
    const ov = opts.override?.get(b);
    return unit(ov ? ov.c : c, ov ? ov.p : p, r);
  });
  return { units, truth, numbers: numbersFor(units.length / 4, 4) };
}

const keyC: KeyEstimate = { best: { tonic: 0, minor: false, p: 0.6 }, ranked: [{ tonic: 0, minor: false, p: 0.6 }, { tonic: 7, minor: false, p: 0.3 }] };
const cand = (c: StandardChart): ChartCandidate => ({ chart: c, titleScore: 1 });
const tune = makeChart('Test Tune', { tonic: 0, mode: 'major' }, TUNE, { 0: 'A', 8: 'B' });
const other = makeChart('Other Tune', { tonic: 0, mode: 'minor' }, OTHER);

describe('chart beats', () => {
  it('lays the chart out beat by beat, with its sections', () => {
    const cb = chartBeats(tune);
    expect(cb.chord.length).toBe(64);
    expect(cb.chord.slice(16, 20)).toEqual([ix(4, 'min7'), ix(4, 'min7'), ix(9, '7'), ix(9, '7')]);
    expect(cb.section[0]).toBe('A');
    expect(cb.section[40]).toBe('B');
    expect(engineIndex(chord(2, 'hdim7'))).toBe(ix(2, 'hdim7'));
    expect(engineIndex(chord(7, '7sus4'))).toBe(ix(7, 'sus4'));
    expect(engineIndex(null)).toBe(168);
  });
});

describe('known chart', () => {
  it('finds the chart in another key after an intro, and says where each bar is in the form', () => {
    // in E flat (+3), a 3-bar intro, three choruses; the detected key is wrong (C), only a prior
    const { units, numbers } = recording(TUNE, 3, 3, 0.5, { intro: 3 });
    const fit = fitKnownChart(units, numbers, 4, keyC, [cand(tune)], {}, REFS);
    expect(fit.accepted).toBe(true);
    expect(fit.best!.transpose).toBe(3);
    expect(fit.best!.scale).toBe(1);
    expect(fit.key).toEqual({ tonic: 3, mode: 'major' });
    // bar 3 of the recording is the first bar of the form, bar 11 is section B
    expect(fit.bars[3]!.formBar).toBe(0);
    expect(fit.bars[3]!.chorus).toBe(0);
    expect(fit.bars[11]!.section).toBe('B');
    expect(fit.bars[3 + 16 + 5]!.formBar).toBe(5);
    expect(fit.bars[3 + 16 + 5]!.chorus).toBe(1);
    // the intro does not fit the chart: little or no weight there
    expect(fit.bars[0]!.fit).toBeLessThan(fit.bars[20]!.fit);
  });

  it('finds a double-time feel (two recorded beats per chart beat)', () => {
    const { units, numbers } = recording(TUNE, 2, 0, 0.5, { scale: 2 });
    const fit = fitKnownChart(units, numbers, 4, keyC, [cand(tune)], {}, REFS);
    expect(fit.accepted).toBe(true);
    expect(fit.best!.scale).toBe(2);
  });

  it('chooses among variants of the tune by fit', () => {
    const { units, numbers } = recording(TUNE, 3, 0, 0.5);
    const fit = fitKnownChart(units, numbers, 4, keyC, [cand(other), cand(tune)], {}, REFS);
    expect(fit.accepted).toBe(true);
    expect(fit.chart).toBe(tune);
  });

  it('rejects the chart of another tune', () => {
    const { units, numbers } = recording(TUNE, 3, 0, 0.5);
    const fit = fitKnownChart(units, numbers, 4, keyC, [cand(other)], {}, REFS);
    expect(fit.accepted).toBe(false);
    expect(fit.source.weight.every((w) => w === 0)).toBe(true);
    expect(applyEvidence(units, [fit.source])).toEqual(units);
  });

  it('helps where the audio hesitates and keeps what is clearly heard', () => {
    const { truth, numbers } = recording(TUNE, 3, 0, 0.5);
    // chorus 2, bar 2 (G7): the network hesitates and leans to Dm7; chorus 3, bar 3: a tritone
    // substitute? no: a clear reharmonisation, Eb maj7 for C maj7, heard at 0.9
    const hesitant = 64 + 4;
    const reharm = 128 + 8;
    const override = new Map<number, { c: number | null; p: number }>();
    for (let k = 0; k < 4; k++) {
      override.set(hesitant + k, { c: ix(2, 'min7'), p: 0.12 });
      override.set(reharm + k, { c: ix(3, 'maj7'), p: 0.9 });
    }
    const rec = recording(TUNE, 3, 0, 0.5, { override });
    const fit = fitKnownChart(rec.units, numbers, 4, keyC, [cand(tune)], {}, REFS);
    expect(fit.accepted).toBe(true);
    const after = best(applyEvidence(rec.units, [fit.source]));
    for (let k = 0; k < 4; k++) {
      expect(after[hesitant + k]).toBe(truth[hesitant + k]);
      expect(after[reharm + k]).toBe(ix(3, 'maj7'));
    }
  });

  it('puts most of its prior on the chart chord, some on its colours and on the tritone substitute', () => {
    const l = priorAround(ix(7, '7'), CHART_DEFAULTS);
    const p = Array.from(l, Math.exp);
    expect(p[ix(7, '7')]).toBeGreaterThan(p[ix(7, 'maj7')]!);
    expect(p[ix(7, 'maj7')]).toBeGreaterThan(p[ix(7, 'min7')]!);
    expect(p[ix(1, '7')]).toBeGreaterThan(p[ix(2, '7')]!);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('finds candidates from a noisy title, and leaves the tune itself out of the references', () => {
    const index = buildTitleIndex([tune, other, ...REFS].map((c, i) => ({ id: String(i), title: c.title, data: c })));
    const found = findChartCandidates(index, 'The Quartet - Test Tune (Live, 1958) [Remastered]');
    expect(found[0]!.chart).toBe(tune);
    expect(findChartCandidates(index, 'Never Heard Of It')).toEqual([]);
    const refs = referenceCharts([tune, other, ...REFS], 10, (c) => c.title === 'Test Tune');
    expect(refs).toHaveLength(10);
    expect(refs).not.toContain(tune);
  });

  it('does nothing without a candidate', () => {
    const { units, numbers } = recording(TUNE, 2, 0, 0.5);
    const fit = fitKnownChart(units, numbers, 4, keyC, []);
    expect(fit.accepted).toBe(false);
    expect(fit.chordOfBeat.every((c) => c === null)).toBe(true);
  });
});
