// The charts handed to the analysis, from a fake library of invented tunes (never a real chart):
// nothing without a title, a library or a candidate; candidates with their collection; references of
// other tunes, kept while the library does not change; plain data the worker can receive; and, at the
// engine level, a chart of another tune with the same title rejected by the fit check.

import { beforeEach, describe, expect, it } from 'vitest';
import { chartsForAnalysis, resetChartsForAnalysisCache } from './forAnalysis';
import { resetLibraryCache } from './library';
import { MemoryCollectionStore } from './libraryStore';
import { link, type FixtureSong } from './testFixtures';
import { chartBeats, fitKnownChart } from '../analysis/engine/knownChart';
import type { KeyEstimate } from '../analysis/engine/key';
import { numbersFor, rng, unit } from '../analysis/engine/structure.fixtures';
import type { StandardChart } from './irealRead';

/** An iReal chart string of one chord per bar. */
const chart = (chords: string[]) => `[*AT44${chords.join(' |')} Z`;

const TEST_TUNE = chart(['D-7', 'G7', 'C^7', 'C^7', 'E-7', 'A7', 'D-7', 'G7', 'F^7', 'F-7', 'E-7', 'A7', 'D-7', 'G7', 'C^7', 'C^7']);
// another tune, known under the same title in a second collection (a different song of that name)
const SAME_TITLE_OTHER_TUNE = chart(['C-7', 'C-7', 'F-7', 'F-7', 'Dh7', 'G7', 'C-7', 'C-7', 'Eb-7', 'Ab7', 'Db^7', 'Db^7', 'Dh7', 'G7', 'C-7', 'G7']);
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function fillers(n: number): FixtureSong[] {
  const r = rng(11);
  return Array.from({ length: n }, (_, i) => {
    const bars: string[] = [];
    while (bars.length < 16) {
      const k = Math.floor(r() * 12);
      bars.push(`${ROOTS[(k + 2) % 12]}-7`, `${ROOTS[(k + 7) % 12]}7`, `${ROOTS[k]}^7`, `${ROOTS[k]}^7`);
    }
    return { title: `Invented Filler ${i + 1}`, chart: chart(bars) };
  });
}

async function library(store: MemoryCollectionStore, withOther = false) {
  await store.put({ id: 'jazz', name: 'Jazz Test', tunes: 81, source: 'https://example.invalid/', date: '2026-11-15', links: link([{ title: 'Test Tune', chart: TEST_TUNE }, ...fillers(80)], 'Jazz Test') });
  if (withOther) await store.put({ id: 'latin', name: 'Latin Test', tunes: 1, source: 'https://example.invalid/2', date: '2026-11-15', links: link([{ title: 'Test Tune', composer: 'Somebody Else', chart: SAME_TITLE_OTHER_TUNE }], 'Latin Test') });
  resetLibraryCache();
}

/** Network evidence of a recording of `c`, three choruses, the network right at 0.5 on each beat. */
function recordingOf(c: StandardChart) {
  const r = rng(3);
  const beats = chartBeats(c).chord;
  const units = [];
  for (let k = 0; k < 3; k++) for (const x of beats) units.push(unit(x, 0.5, r));
  return { units, numbers: numbersFor(units.length / 4, 4) };
}

const keyC: KeyEstimate = { best: { tonic: 0, minor: false, p: 0.6 }, ranked: [{ tonic: 0, minor: false, p: 0.6 }] };

describe('charts for the analysis', () => {
  let store: MemoryCollectionStore;
  beforeEach(() => {
    store = new MemoryCollectionStore();
    resetLibraryCache();
    resetChartsForAnalysisCache();
  });

  it('gives nothing without a title, a library or a candidate', async () => {
    expect(await chartsForAnalysis('Test Tune', { store })).toBeNull();
    await library(store);
    expect(await chartsForAnalysis(null, { store })).toBeNull();
    expect(await chartsForAnalysis('   ', { store })).toBeNull();
    expect(await chartsForAnalysis('Never Heard Of It', { store })).toBeNull();
  });

  it('gives the candidates with their collection, and 60 references of other tunes', async () => {
    await library(store);
    const r = (await chartsForAnalysis('The Quartet - Test Tune (Live, 1958) [Remastered]', { store }))!;
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.chart.title).toBe('Test Tune');
    expect(r.candidates[0]!.collectionName).toBe('Jazz Test');
    expect(r.candidates[0]!.titleScore).toBeGreaterThan(0.88);
    expect(r.references).toHaveLength(60);
    expect(r.references.some((c) => c.title === 'Test Tune')).toBe(false);
    expect(new Set(r.references.map((c) => c.title)).size).toBe(60);
    // plain data: what the worker receives is the same
    expect(structuredClone(r)).toEqual(r);
  });

  it('keeps the references while the library does not change', async () => {
    await library(store);
    const a = (await chartsForAnalysis('Test Tune', { store }))!;
    const b = (await chartsForAnalysis('Test Tune', { store }))!;
    expect(b.references).toBe(a.references);
    await library(store, true);
    const c = (await chartsForAnalysis('Test Tune', { store }))!;
    expect(c.references).not.toBe(a.references);
    expect(c.candidates).toHaveLength(2);
  });

  it('the fit check keeps the right tune and rejects another tune of the same title', async () => {
    await library(store, true);
    const r = (await chartsForAnalysis('Test Tune', { store }))!;
    const right = r.candidates.find((c) => c.collectionId === 'jazz')!;
    const wrong = r.candidates.find((c) => c.collectionId === 'latin')!;
    // a recording of the jazz tune: of the two charts of that title, the fit picks the one played
    const rec = recordingOf(right.chart);
    const fit = fitKnownChart(rec.units, rec.numbers, 4, keyC, r.candidates, {}, r.references);
    expect(fit.accepted).toBe(true);
    expect(fit.chart!.title).toBe('Test Tune');
    expect(fit.chart).toEqual(right.chart);
    // a recording of the jazz tune, offered only the other tune's chart: rejected
    const alone = fitKnownChart(rec.units, rec.numbers, 4, keyC, [wrong], {}, r.references);
    expect(alone.accepted).toBe(false);
    expect(alone.source.weight.every((w) => w === 0)).toBe(true);
  });
});
