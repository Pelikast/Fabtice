// Document version 6 (1.0.0): the 5 -> 6 migration on real version-5
// documents, the whole chain from version 1, and the shape checks of what
// version 6 adds (meters 1…64 over 4/8/16/32, modulations, structure, tapped
// tempo fixes).
//
// The fixtures in `fixtures/v5-*.json` were written once by the app as it was
// published (document version 5, commit 52154b9 of branch v1): store actions
// (import, analysis, two tempo fixes, chords, sections, key, tuning,
// metronome, named loops) then `toProjectDocument`. They hold no audio.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { emptyCorrections } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import { emptyStructureCorrections } from '../model/structure';
import { fromProjectDocument, toProjectDocument } from '../store/document';
import { initialState } from '../store/store';
import { sampleDocument } from '../test/sampleDocument';
import { readDocument } from './documentFormat';
import { StorageError } from './ProjectStorage';

type Rec = Record<string, unknown>;
const json = <T = Rec>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
const fixture = (name: string): Rec => JSON.parse(readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf8')) as Rec;
const FIXTURES = ['v5-worked-on.json', 'v5-never-analysed.json', 'v5-six-eight.json'];

function corruptCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof StorageError ? e.code : 'other';
  }
  return 'no error';
}

function without<T extends Rec>(o: T, ...keys: string[]): Rec {
  const out: Rec = { ...o };
  for (const k of keys) delete out[k];
  return out;
}

/** Everything a version-5 document held is in the version-6 one, as it was; the new fields have their defaults. */
function expectKeptFrom(v5: Rec, doc: ProjectDocument): void {
  expect(doc.version).toBe(6);
  const v6 = json(doc);
  // Top level: the same fields, the same values (no new top-level field).
  expect(Object.keys(v6).sort()).toEqual(Object.keys(v5).sort());
  for (const key of Object.keys(v5)) {
    if (key === 'version' || key === 'analysis' || key === 'corrections') continue;
    expect(v6[key], key).toEqual(v5[key]);
  }
  // Corrections: all of version 5, plus the two new fields at their defaults.
  const c = v6.corrections as Rec;
  expect(without(c, 'keyChanges', 'structure')).toEqual(v5.corrections);
  expect(c.keyChanges).toBeNull();
  expect(c.structure).toEqual(emptyStructureCorrections());
  // Analysis: kept (chords included), at its version 2, no modulation, structure not looked for.
  if (v5.analysis === null) {
    expect(v6.analysis).toBeNull();
  } else {
    const a = v6.analysis as Rec;
    expect(a.version).toBe(2);
    expect(without(a, 'version', 'keyChanges', 'structure')).toEqual(without(v5.analysis as Rec, 'version'));
    expect(a.keyChanges).toEqual([]);
    expect(a.structure).toBeNull();
  }
}

describe('version 5 -> 6 on documents written by the published app', () => {
  it('the fixtures are what they claim: version 5, analysis of version 1', () => {
    const w = fixture('v5-worked-on.json');
    expect(w.version).toBe(5);
    const a = w.analysis as Rec;
    expect(a.version).toBe(1);
    expect((a.chords as unknown[]).length).toBeGreaterThan(10);
    const c = w.corrections as Rec;
    expect((c.chords as unknown[]).length).toBeGreaterThan(0);
    expect((c.sections as unknown[]).length).toBe(3);
    expect((c.tempoFixes as Rec[]).map((f) => f.kind)).toEqual(['continuity', 'fresh']);
    expect(((w.separation as Rec).others as unknown[]).length).toBe(1);
    expect(w.keptRender).not.toBeNull();
    expect(Object.keys((w.metronome as Rec).patterns as Rec).sort()).toEqual(['4/4', '7/8']);
    expect(((w.markers as Rec).loops as unknown[]).length).toBe(2);
    expect(fixture('v5-never-analysed.json').analysis).toBeNull();
    expect(((fixture('v5-six-eight.json').tempoMap as Rec).meters as Rec[])[0]!.meter).toEqual({ numerator: 6, denominator: 8 });
  });

  it.each(FIXTURES)('%s: nothing is lost, the new fields have their defaults', (name) => {
    const v5 = fixture(name);
    expectKeptFrom(v5, readDocument(json(v5))!);
  });

  it.each(FIXTURES)('%s: the store opens it and saves it back as version 6, read back exactly', (name) => {
    const doc = readDocument(json(fixture(name)))!;
    const state = { ...initialState(), ...fromProjectDocument(doc, initialState()) };
    const saved = toProjectDocument(state, new Date(doc.savedAt))!;
    expect(saved.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(json(saved)).toEqual(json(doc));
    expect(readDocument(json(saved))).toEqual(json(doc));
  });

  it('the store opens a version-6 document that lacks the new fields (written during development) with their defaults', () => {
    const doc = readDocument(json(fixture('v5-worked-on.json')))!;
    const old = json<ProjectDocument>(doc);
    delete (old.analysis as unknown as Rec).keyChanges;
    delete (old.analysis as unknown as Rec).structure;
    delete (old.corrections as unknown as Rec).structure;
    const st = fromProjectDocument(old, initialState());
    expect(st.analysis!.keyChanges).toEqual([]);
    expect(st.analysis!.structure).toBeNull();
    expect(st.corrections!.structure).toEqual(emptyStructureCorrections());
    expect(st.analysis!.chords).toEqual(doc.analysis!.chords);
  });

  it('the whole chain 1 -> 6: a lot 1 piece (the 6/8 one) opens with every later default, its grid as typed', () => {
    const v5 = fixture('v5-six-eight.json');
    const v1 = without(v5, 'analysis', 'corrections', 'separation', 'exportPrefs', 'metronome', 'markers', 'keptRender');
    v1.version = 1;
    v1.view = without(v5.view as Rec, 'instrument');
    const doc = readDocument(json(v1))!;
    expect(doc.version).toBe(6);
    expect(doc.tempoMap).toEqual(v5.tempoMap);
    expect(doc.project).toEqual(v5.project);
    expect(doc.tracks).toEqual(v5.tracks);
    expect(doc.loop).toEqual(v5.loop);
    expect(doc.playback).toEqual(v5.playback);
    expect(doc.analysis).toBeNull();
    expect(doc.corrections).toEqual(emptyCorrections());
    expect(doc.view.instrument).toBe('ut');
    expect(doc.separation.others).toEqual([]);
    expect(doc.keptRender).toBeNull();
    expect(doc.markers).toEqual({ loops: [] });
  });

  it('a version-4 piece with an analysis keeps its chords all the way to version 6', () => {
    const v5 = fixture('v5-worked-on.json');
    const v4 = without(v5, 'keptRender');
    v4.version = 4;
    v4.separation = without(v5.separation as Rec, 'others');
    const doc = readDocument(json(v4))!;
    expect(doc.analysis!.chords).toEqual((v5.analysis as Rec).chords);
    expect(doc.analysis!.version).toBe(2);
    expect(doc.corrections.tempoFixes).toEqual((v5.corrections as Rec).tempoFixes);
  });
});

// ---------------------------------------------------------------- shape checks

const meterMap = (numerator: number, denominator: number) => ({
  origin: 'manual',
  segments: [{ time: 0, beat: 0, bpm: 100 }],
  meters: [{ bar: 0, beat: 0, meter: { numerator, denominator } }],
});

describe('meters of version 6: 1 to 64 over 4, 8, 16 or 32', () => {
  it.each([[1, 4], [64, 32], [7, 16], [12, 8], [2, 4]])('%i/%i is legal in the grid, the analysis and the tempo fixes', (n, d) => {
    const analysis = demoSwingResult(10);
    const withMeter = { ...analysis, beats: { ...analysis.beats, meter: { numerator: n, denominator: d } } };
    const corrections = { ...emptyCorrections(), tempoFixes: [{ time: 2, kind: 'fresh', previous: meterMap(n, d) }] };
    const doc = json({ ...sampleDocument(), tempoMap: meterMap(n, d), analysis: withMeter, corrections });
    expect(readDocument(doc)).toEqual(doc);
  });

  it.each([[0, 4], [65, 4], [4, 3], [4.5, 4], [4, 2], [4, 64], [-3, 4]])('%s/%s: a grid that holds it is « corrupt », an analysis that holds it is dropped', (n, d) => {
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), tempoMap: meterMap(n, d) })))).toBe('corrupt');
    const corrections = { ...emptyCorrections(), tempoFixes: [{ time: 2, kind: 'fresh', previous: meterMap(n, d) }] };
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), corrections })))).toBe('corrupt');
    const analysis = demoSwingResult(10);
    const bad = { ...analysis, beats: { ...analysis.beats, meter: { numerator: n, denominator: d } } };
    expect(readDocument(json(sampleDocument({ analysis: bad as never })))!.analysis).toBeNull();
  });

  it('a metronome pattern for a new meter is kept (7/16, 1/4), one that does not fit its meter is dropped', () => {
    const patterns = {
      '7/16': { grouping: [2, 2, 3], levels: ['accent', 'soft', 'normal', 'soft', 'accent', 'soft', 'soft'] },
      '1/4': { grouping: [1], levels: ['accent'] },
      '5/32': { grouping: [2, 2], levels: ['accent', 'soft', 'normal', 'soft'] },
    };
    const doc = readDocument(json({ ...sampleDocument(), metronome: { ...sampleDocument().metronome, patterns } }))!;
    expect(Object.keys(doc.metronome.patterns).sort()).toEqual(['1/4', '7/16']);
  });
});

describe('modulations (key per passage)', () => {
  const key = (tonic: number, mode: 'major' | 'minor' = 'major') => ({ tonic, mode });
  const analysedKey = (tonic: number) => ({ ...key(tonic), confidence: 0.7, alternatives: [{ ...key((tonic + 1) % 12), confidence: 0.2 }] });

  it('reads back hand and analysed modulations exactly', () => {
    const analysis = { ...demoSwingResult(36), keyChanges: [{ time: 12.5, key: analysedKey(4) }, { time: 30, key: analysedKey(11) }] };
    const corrections = { ...emptyCorrections(), key: key(8, 'minor'), keyChanges: [{ time: 10, key: key(3) }] };
    const doc = json(sampleDocument({ analysis, corrections }));
    expect(readDocument(doc)).toEqual(doc);
    const none = json(sampleDocument({ corrections: { ...emptyCorrections(), keyChanges: [] } }));
    expect(readDocument(none)).toEqual(none);
  });

  it.each([
    ['not a list', 'C'],
    ['at time 0 (that is the main key)', [{ time: 0, key: key(2) }]],
    ['before the piece', [{ time: -1, key: key(2) }]],
    ['not ascending', [{ time: 20, key: key(2) }, { time: 10, key: key(4) }]],
    ['two at the same time', [{ time: 10, key: key(2) }, { time: 10, key: key(4) }]],
    ['a key out of range', [{ time: 10, key: key(12) }]],
    ['a key of another mode', [{ time: 10, key: { tonic: 2, mode: 'dorian' } }]],
    ['without key', [{ time: 10 }]],
    ['missing (undefined)', undefined],
  ])('by hand, read exactly or « corrupt »: %s', (_name, keyChanges) => {
    const corrections = { ...emptyCorrections(), keyChanges };
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), corrections })))).toBe('corrupt');
  });

  it.each([
    ['not a list', null],
    ['not ascending', [{ time: 20, key: analysedKey(2) }, { time: 10, key: analysedKey(4) }]],
    ['at time 0', [{ time: 0, key: analysedKey(2) }]],
    ['a key without confidence', [{ time: 10, key: key(2) }]],
  ])('from the analysis, a damaged list drops the result (it can be computed again): %s', (_name, keyChanges) => {
    const analysis = { ...demoSwingResult(10), keyChanges };
    expect(readDocument(json(sampleDocument({ analysis: analysis as never })))!.analysis).toBeNull();
  });
});

describe('structure', () => {
  const part = (id: string, type: string, start: number, end: number, extra: Rec = {}) => ({ id, type, number: null, instrument: null, start, end, ...extra });
  const detected = () => ({
    mode: 'jazz',
    form: 'AABA',
    sections: [{ time: 0, label: 'A' }, { time: 8, label: 'A' }],
    parts: [part('p1', 'intro', 0, 4), part('p2', 'theme', 4, 20, { number: 1 }), part('p3', 'solo', 20, 36, { number: 1, instrument: 'winds' })],
  });
  const hand = () => ({
    mode: 'pop',
    parts: [part('h1', 'solo', 20, 30, { instrument: 'trumpet' })],
    spans: [{ start: 20, end: 36 }],
    lettersByHand: true,
  });

  it('reads back a detected structure and the hand layer exactly, an unknown instrument id included', () => {
    const analysis = { ...demoSwingResult(36), structure: detected() };
    const h = hand();
    (h.parts[0] as Rec).instrument = 'sousaphone';
    const doc = json(sampleDocument({ analysis: analysis as never, corrections: { ...emptyCorrections(), structure: h as never } }));
    expect(readDocument(doc)).toEqual(doc);
  });

  it.each([
    ['missing', undefined],
    ['unknown mode', { ...hand(), mode: 'classique' }],
    ['no letters flag', { ...hand(), lettersByHand: undefined }],
    ['unknown part type', { ...hand(), parts: [part('h1', 'cadenza', 20, 30)] }],
    ['a part that ends before it starts', { ...hand(), parts: [part('h1', 'solo', 30, 20)] }],
    ['overlapping parts', { ...hand(), parts: [part('h1', 'solo', 20, 30), part('h2', 'solo', 29, 34)] }],
    ['parts out of order', { ...hand(), parts: [part('h1', 'solo', 30, 34), part('h2', 'solo', 20, 30)] }],
    ['two parts with one id', { ...hand(), parts: [part('h1', 'solo', 20, 30), part('h1', 'outro', 30, 34)] }],
    ['a number zero', { ...hand(), parts: [part('h1', 'solo', 20, 30, { number: 0 })] }],
    ['an instrument written oddly', { ...hand(), parts: [part('h1', 'solo', 20, 30, { instrument: 'Trompette !' })] }],
    ['an empty stretch', { ...hand(), spans: [{ start: 20, end: 20 }] }],
    ['overlapping stretches', { ...hand(), spans: [{ start: 20, end: 30 }, { start: 25, end: 36 }] }],
  ])('by hand, read exactly or « corrupt »: %s', (_name, structure) => {
    const corrections = { ...emptyCorrections(), structure };
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), corrections })))).toBe('corrupt');
  });

  it.each([
    ['unknown mode', { ...detected(), mode: 'auto' }],
    ['a form with other signs', { ...detected(), form: 'AA-BA' }],
    ['a section without label', { ...detected(), sections: [{ time: 0 }] }],
    ['overlapping parts', { ...detected(), parts: [part('p1', 'intro', 0, 5), part('p2', 'theme', 4, 20)] }],
  ])('from the analysis, a damaged structure drops the result: %s', (_name, structure) => {
    const analysis = { ...demoSwingResult(36), structure };
    expect(readDocument(json(sampleDocument({ analysis: analysis as never })))!.analysis).toBeNull();
  });
});

describe('tempo fixes of kind « tapped »', () => {
  const previous = meterMap(4, 4);
  const tapped = (extra: Rec = {}) => ({ time: 4, kind: 'tapped', previous, taps: [4.02, 4.51, 4.51, 5.03], end: 5.5, ...extra });

  it('are read back exactly, with the two other kinds', () => {
    const corrections = { ...emptyCorrections(), tempoFixes: [{ time: 2, kind: 'continuity', previous }, tapped()] };
    const doc = json({ ...sampleDocument(), corrections });
    expect(readDocument(doc)).toEqual(doc);
  });

  it.each([
    ['no taps', tapped({ taps: [] })],
    ['taps not ascending', tapped({ taps: [5, 4.5] })],
    ['a tap that is not a number', tapped({ taps: [4, 'x'] })],
    ['no end', tapped({ end: undefined })],
    ['an end before its start', tapped({ end: 3 })],
    ['an unknown kind', tapped({ kind: 'guessed' })],
  ])('a damaged one is « corrupt »: %s', (_name, fix) => {
    const corrections = { ...emptyCorrections(), tempoFixes: [fix] };
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), corrections })))).toBe('corrupt');
  });
});
