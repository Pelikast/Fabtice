import { describe, expect, it } from 'vitest';
import type { DecodedAudio } from '../audio/registry';
import { makeAiff, makeWav, sine } from '../test/audioFiles';
import { importFromFile } from './fromFile';
import { ImportError, type ImportProgress } from './types';

const fake = (seconds: number): DecodedAudio => ({ channels: [new Float32Array(Math.round(48000 * seconds))], sampleRate: 48000 });
const wavFile = (name = 'Blues_du_dimanche.wav') => new File([makeWav(1, 8000, [sine(440, 8000, 0.5)])], name, { type: 'audio/wav' });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof ImportError ? e.code : `other: ${String(e)}`;
  }
  return 'no error';
}

describe('importFromFile', () => {
  it('opens a file as one piece: title, source, original bytes, 48 kHz audio', async () => {
    const file = wavFile();
    const phases: ImportProgress[] = [];
    const piece = await importFromFile(file, { onProgress: (p) => phases.push(p) }, { decodeWebAudio: async () => fake(2.5) });
    expect(piece.title).toBe('Blues du dimanche');
    expect(piece.source).toEqual({ kind: 'file', fileName: 'Blues_du_dimanche.wav' });
    expect(piece.original.fileName).toBe('Blues_du_dimanche.wav');
    expect(piece.original.mimeType).toBe('audio/wav');
    expect(piece.original.bytes.byteLength).toBe(file.size);
    expect(new Uint8Array(piece.original.bytes).slice(0, 4)).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
    expect(piece.audio.sampleRate).toBe(48000);
    expect(piece.duration).toBeCloseTo(2.5, 6);
    const names = phases.map((p) => p.phase);
    expect(names[0]).toBe('reading');
    expect(names).toContain('decoding');
    expect(phases.find((p) => p.phase === 'reading')!.title).toBe('Blues du dimanche');
    expect(phases.filter((p) => p.phase === 'reading').at(-1)!.fraction).toBe(1);
  });

  it('reads an AIFF without Web Audio', async () => {
    const aiff = new File([makeAiff({ channels: 1, sampleRate: 22050, bits: 16, samples: [sine(440, 22050, 1)] })], 'tone.aif');
    const piece = await importFromFile(aiff);
    expect(piece.audio.channels[0]!.length).toBe(48000);
    expect(piece.source).toEqual({ kind: 'file', fileName: 'tone.aif' });
  });

  it('refuses other files by name before reading them', async () => {
    expect(await code(importFromFile(new File(['%PDF'], 'partition.pdf', { type: 'application/pdf' })))).toBe('unsupported-format');
  });

  it('refuses an empty file and a file too large', async () => {
    expect(await code(importFromFile(new File([], 'vide.mp3')))).toBe('empty-audio');
    const huge = { name: 'enorme.wav', type: 'audio/wav', size: 300 * 1024 * 1024 } as File;
    expect(await code(importFromFile(huge))).toBe('too-large');
  });

  it('says a damaged file could not be decoded', async () => {
    const bad = new File([new Uint8Array([0xff, 0xfb, 0x90, 0])], 'abime.mp3', { type: 'audio/mpeg' });
    const failing = { decodeWebAudio: () => Promise.reject(Object.assign(new Error('Unable to decode audio data'), { name: 'EncodingError' })) };
    expect(await code(importFromFile(bad, {}, failing))).toBe('decode-failed');
  });

  it('can be cancelled before reading', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await code(importFromFile(wavFile(), { signal: controller.signal }, { decodeWebAudio: async () => fake(1) }))).toBe('cancelled');
  });

  it('can be cancelled while it is read', async () => {
    const controller = new AbortController();
    const file = new File([new Uint8Array(3 * 1024 * 1024)], 'long.wav', { type: 'audio/wav' });
    const result = importFromFile(file, { signal: controller.signal, onProgress: (p) => p.phase === 'reading' && p.fraction !== null && p.fraction > 0 && controller.abort() }, { decodeWebAudio: async () => fake(1) });
    expect(await code(result)).toBe('cancelled');
  });

  it('reports a file that cannot be read from the disk', async () => {
    const broken = {
      name: 'parti.wav',
      type: 'audio/wav',
      size: 10,
      stream: () => new ReadableStream({ pull: (c) => c.error(new DOMException('gone', 'NotFoundError')) }),
    } as unknown as File;
    expect(await code(importFromFile(broken, {}, { decodeWebAudio: async () => fake(1) }))).toBe('read-failed');
  });
});
