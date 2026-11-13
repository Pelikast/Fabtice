import { describe, expect, it } from 'vitest';
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
    expect(readDocument(json({ ...sampleDocument(), version: 2 }))).toBeNull();
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
