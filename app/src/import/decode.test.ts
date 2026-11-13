import { describe, expect, it, vi } from 'vitest';
import type { DecodedAudio } from '../audio/registry';
import { makeAiff, makeFlacHeader, makeMp4Header, makeWav, sine, toArrayBuffer } from '../test/audioFiles';
import { decodeAudioBytes, toStereoOrMono } from './decode';
import { MAX_FILE_BYTES } from './limits';
import { ImportError, type ImportProgress } from './types';

const mono48 = (seconds: number): DecodedAudio => ({ channels: [Float32Array.from(sine(440, 48000, seconds))], sampleRate: 48000 });
const wav = () => toArrayBuffer(makeWav(1, 8000, [sine(440, 8000, 0.2)]));

async function rejection(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    return e as ImportError;
  }
  throw new Error('expected a rejection');
}

describe('decodeAudioBytes', () => {
  it('hands Web Audio a copy and leaves the original bytes whole', async () => {
    const bytes = wav();
    const seen: ArrayBuffer[] = [];
    const out = await decodeAudioBytes(bytes, {
      decodeWebAudio: async (b) => {
        seen.push(b);
        return mono48(1);
      },
    });
    expect(seen[0]).not.toBe(bytes);
    expect(seen[0]!.byteLength).toBe(bytes.byteLength);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(out.sampleRate).toBe(48000);
    expect(out.channels[0]!.length).toBe(48000);
  });

  it('resamples what the decoder returns at another rate', async () => {
    const out = await decodeAudioBytes(wav(), {
      decodeWebAudio: async () => ({ channels: [Float32Array.from(sine(440, 44100, 1))], sampleRate: 44100 }),
    });
    expect(out.sampleRate).toBe(48000);
    expect(out.channels[0]!.length).toBe(48000);
  });

  it('reads AIFF itself, at 48 kHz, without calling Web Audio', async () => {
    const aiff = toArrayBuffer(makeAiff({ channels: 2, sampleRate: 44100, bits: 16, samples: [sine(440, 44100, 1), sine(660, 44100, 1)] }));
    const decodeWebAudio = vi.fn();
    const progress: ImportProgress[] = [];
    const out = await decodeAudioBytes(aiff, { decodeWebAudio, onProgress: (p) => progress.push(p), title: 'Essai' });
    expect(decodeWebAudio).not.toHaveBeenCalled();
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0]!.length).toBe(48000);
    expect(progress[0]).toEqual({ phase: 'decoding', fraction: null, title: 'Essai' });
    expect(progress.at(-1)!.fraction).toBeCloseTo(1, 6);
  });

  it('keeps one or two channels: 5.1 is mixed down, other layouts keep their first two', () => {
    const six = Array.from({ length: 6 }, (_, c) => new Float32Array(4).fill(c === 2 ? 1 : 0));
    const mixed = toStereoOrMono(six);
    expect(mixed).toHaveLength(2);
    expect(mixed[0]![0]).toBeCloseTo(0.7071 / 2.4142, 4);
    expect(mixed[0]![0]).toBeCloseTo(mixed[1]![0]!, 6);
    const three = [new Float32Array(2).fill(0.1), new Float32Array(2).fill(0.2), new Float32Array(2).fill(0.3)];
    expect(toStereoOrMono(three)).toEqual([three[0], three[1]]);
    expect(toStereoOrMono([three[0]!])).toEqual([three[0]]);
  });

  it('refuses silence of length zero and empty files', async () => {
    expect((await rejection(decodeAudioBytes(wav(), { decodeWebAudio: async () => ({ channels: [new Float32Array(0)], sampleRate: 48000 }) }))).code).toBe('empty-audio');
    expect((await rejection(decodeAudioBytes(new ArrayBuffer(0)))).code).toBe('empty-audio');
    const tiny = await rejection(decodeAudioBytes(wav(), { decodeWebAudio: async () => ({ channels: [new Float32Array(100)], sampleRate: 48000 }) }));
    expect(tiny.code).toBe('empty-audio');
  });

  it('refuses too long a piece from the header, before decoding anything', async () => {
    const decodeWebAudio = vi.fn();
    const flac = toArrayBuffer(makeFlacHeader(44100, 44100 * 3600));
    expect((await rejection(decodeAudioBytes(flac, { decodeWebAudio }))).code).toBe('too-long');
    const m4a = toArrayBuffer(makeMp4Header(1000, 1000 * 1300));
    expect((await rejection(decodeAudioBytes(m4a, { decodeWebAudio }))).code).toBe('too-long');
    expect(decodeWebAudio).not.toHaveBeenCalled();
    // Exactly at the limit is fine.
    const ok = toArrayBuffer(makeFlacHeader(44100, 44100 * 1200));
    await expect(decodeAudioBytes(ok, { decodeWebAudio: async () => mono48(1) })).resolves.toBeDefined();
  });

  it('refuses a file too big for memory', async () => {
    const decodeWebAudio = vi.fn();
    expect((await rejection(decodeAudioBytes(new ArrayBuffer(MAX_FILE_BYTES + 1), { decodeWebAudio }))).code).toBe('too-large');
    expect(decodeWebAudio).not.toHaveBeenCalled();
  });

  it('tells a damaged file from an out-of-memory decoder', async () => {
    const damaged = Object.assign(new Error('Unable to decode audio data'), { name: 'EncodingError' });
    expect((await rejection(decodeAudioBytes(wav(), { decodeWebAudio: () => Promise.reject(damaged) }))).code).toBe('decode-failed');
    expect((await rejection(decodeAudioBytes(wav(), { decodeWebAudio: () => Promise.reject(new RangeError('Array buffer allocation failed')) }))).code).toBe('too-large');
    expect((await rejection(decodeAudioBytes(wav(), { decodeWebAudio: () => Promise.reject('boom') }))).code).toBe('decode-failed');
  });

  it('a compressed AIFF-C or a broken AIFF is a damaged file', async () => {
    const ima4 = toArrayBuffer(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [[0, 0]], compression: 'ima4' }));
    expect((await rejection(decodeAudioBytes(ima4))).code).toBe('decode-failed');
  });

  it('can be cancelled before and during the decoding', async () => {
    const before = new AbortController();
    before.abort();
    expect((await rejection(decodeAudioBytes(wav(), { signal: before.signal }))).code).toBe('cancelled');

    const during = new AbortController();
    const pending = decodeAudioBytes(wav(), { signal: during.signal, decodeWebAudio: () => new Promise<DecodedAudio>(() => {}) });
    during.abort();
    expect((await rejection(pending)).code).toBe('cancelled');
  });

  it('can be cancelled during the resampling of an AIFF', async () => {
    const controller = new AbortController();
    const aiff = toArrayBuffer(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [sine(440, 44100, 3)] }));
    const pending = decodeAudioBytes(aiff, { signal: controller.signal, onProgress: (p) => p.fraction !== null && controller.abort() });
    expect((await rejection(pending)).code).toBe('cancelled');
  });
});
