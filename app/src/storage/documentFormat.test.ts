import { describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { tempoMapFromBeats } from '../grid/beats';
import { chord } from '../harmony/chord';
import { emptyCorrections } from '../model/corrections';
import { sampleDocument } from '../test/sampleDocument';
import { readDocument, type Migrations } from './documentFormat';
import { StorageError } from './ProjectStorage';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

function corruptCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof StorageError ? e.code : 'other';
  }
  return 'no error';
}

describe('reading a stored document', () => {
  it('accepts what the app writes, JSON round trip included', () => {
    const doc = sampleDocument();
    expect(readDocument(json(doc))).toEqual(doc);
  });

  it('ignores a version written by a newer app (null, not an error)', () => {
    expect(readDocument(json({ ...sampleDocument(), version: 4 }))).toBeNull();
    expect(readDocument(json({ ...sampleDocument(), version: 99, anything: 'else' }))).toBeNull();
  });

  it('migrates older versions step by step', () => {
    const migrations: Migrations = {
      1: (d) => ({ ...d, playback: { ...(d.playback as object), tempoRatio: 1 }, steps: ['1>2'] }),
      2: (d) => ({ ...d, steps: [...(d.steps as string[]), '2>3'] }),
    };
    const old = { ...sampleDocument(), version: 1 };
    const doc = readDocument(json(old), migrations, 3) as unknown as { version: number; steps: string[]; playback: { tempoRatio: number } };
    expect(doc.version).toBe(3);
    expect(doc.steps).toEqual(['1>2', '2>3']);
    expect(doc.playback.tempoRatio).toBe(1);
  });

  it('an old version without a known migration is unreadable, not guessed at', () => {
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), version: 1 }), {}, 2))).toBe('corrupt');
  });

  it.each([
    ['not an object', 'bonjour'],
    ['null', null],
    ['no version', { ...sampleDocument(), version: undefined }],
    ['version zero', { ...sampleDocument(), version: 0 }],
    ['version as text', { ...sampleDocument(), version: '1' }],
    ['no project', { ...sampleDocument(), project: undefined }],
    ['project without id', { ...sampleDocument(), project: { ...sampleDocument().project, id: 3 } }],
    ['unknown source kind', { ...sampleDocument(), project: { ...sampleDocument().project, source: { kind: 'cloud' } } }],
    ['no tracks', { ...sampleDocument(), tracks: [] }],
    ['track without audio', { ...sampleDocument(), tracks: [{ ...sampleDocument().tracks[0], audio: null }] }],
    ['unknown track role', { ...sampleDocument(), tracks: [{ ...sampleDocument().tracks[0], role: 'kazoo' }] }],
    ['tempo map without segments', { ...sampleDocument(), tempoMap: { origin: 'manual', segments: [], meters: [] } }],
    ['tempo of zero', { ...sampleDocument(), tempoMap: { ...sampleDocument().tempoMap, segments: [{ time: 0, beat: 0, bpm: 0 }] } }],
    ['loop region of text', { ...sampleDocument(), loop: { enabled: true, region: { start: 'a', end: 'b' } } }],
    ['no playback', { ...sampleDocument(), playback: null }],
    ['no view', { ...sampleDocument(), view: undefined }],
  ])('a damaged document is « corrupt »: %s', (_name, value) => {
    expect(corruptCode(() => readDocument(json(value)))).toBe('corrupt');
  });
});

describe('version 2 (lot 2): analysis and corrections', () => {
  /** What lot 1 wrote: no analysis, no corrections, no instrument. */
  function lot1Document(): Record<string, unknown> {
    const { analysis: _a, corrections: _c, ...rest } = sampleDocument();
    const { instrument: _i, ...view } = rest.view;
    const tempoMap = { origin: 'manual', segments: [{ time: 0.5, beat: 0, bpm: 96 }], meters: [{ bar: 0, beat: 0, meter: { numerator: 3, denominator: 4 } }] };
    return json({ ...rest, version: 1, view, tempoMap }) as Record<string, unknown>;
  }

  it('a lot 1 document opens as « not analysed yet », its grid kept as entered', () => {
    const doc = readDocument(lot1Document())!;
    // Migrated all the way (1 -> 2 -> 3).
    expect(doc.version).toBe(3);
    expect(doc.analysis).toBeNull();
    expect(doc.corrections).toEqual(emptyCorrections());
    expect(doc.view.instrument).toBe('ut');
    expect(doc.tempoMap.origin).toBe('manual');
    expect(doc.tempoMap.segments[0]!.bpm).toBe(96);
    expect(doc.playback).toEqual(sampleDocument().playback);
  });

  it('keeps an analysis, its corrections and a corrected grid', () => {
    const analysis = demoSwingResult(36);
    const corrections = {
      ...emptyCorrections(),
      key: { tonic: 8, mode: 'minor' as const },
      tuningCents: 20,
      chords: [{ time: 3.357, chord: chord(1, 'min7', ['9']) }, { time: 4.2, chord: null }],
      handSpans: [{ start: 3.357, end: 5.118 }],
      sections: [{ time: 0, label: 'A' }],
    };
    const tempoMap = { ...tempoMapFromBeats(analysis.beats.times, 1), origin: 'corrected' as const };
    const doc = sampleDocument({ analysis, corrections, tempoMap, view: { ...sampleDocument().view, instrument: 'mib' } });
    expect(readDocument(json(doc))).toEqual(json(doc));
  });

  it('a damaged or outdated analysis is dropped, the piece is kept', () => {
    const analysis = demoSwingResult(10);
    expect(readDocument(json(sampleDocument({ analysis: { ...analysis, version: 99 as 1 } })))!.analysis).toBeNull();
    expect(readDocument(json(sampleDocument({ analysis: { ...analysis, beats: { ...analysis.beats, times: [1] } } })))!.analysis).toBeNull();
    const badChord = { ...analysis, chords: [{ ...analysis.chords[0]!, chord: { root: 13, quality: 'maj7', extensions: [], bass: null } }] };
    expect(readDocument(json(sampleDocument({ analysis: badChord as never })))!.analysis).toBeNull();
  });

  it('an unknown instrument falls back to concert pitch', () => {
    const doc = json(sampleDocument()) as { view: Record<string, unknown> };
    doc.view.instrument = 'cor anglais';
    expect(readDocument(doc)!.view.instrument).toBe('ut');
  });

  it.each([
    ['corrections missing', { corrections: undefined }],
    ['a hand chord of another kind', { corrections: { ...emptyCorrections(), chords: [{ time: 1, chord: { root: 0, quality: 'power', extensions: [], bass: null } }] } }],
    ['a corrected key out of range', { corrections: { ...emptyCorrections(), key: { tonic: 12, mode: 'major' } } }],
    ['an empty hand span', { corrections: { ...emptyCorrections(), handSpans: [{ start: 2, end: 2 }] } }],
    ['a section without label', { corrections: { ...emptyCorrections(), sections: [{ time: 2 }] } }],
    ['an unknown grid origin', { tempoMap: { ...sampleDocument().tempoMap, origin: 'guessed' } }],
  ])('what the user did by hand must read back exactly, else « corrupt »: %s', (_name, patch) => {
    expect(corruptCode(() => readDocument(json({ ...sampleDocument(), ...patch })))).toBe('corrupt');
  });
});
