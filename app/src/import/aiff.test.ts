import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeAiff, sine } from '../test/audioFiles';
import { AiffError, aiffDuration, decodeAiff, isAiff, parseAiff } from './aiff';

const ramp = [0, 0.25, -0.25, 0.5, -0.5, 0.999, -1];

describe('AIFF reader', () => {
  it('recognises AIFF and AIFF-C by their header', () => {
    expect(isAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp] }))).toBe(true);
    expect(isAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp], compression: 'sowt' }))).toBe(true);
    expect(isAiff(new TextEncoder().encode('RIFF....WAVE'))).toBe(false);
  });

  it('reads the header: channels, frames, depth, sample rate (80-bit float)', () => {
    for (const rate of [8000, 22050, 44100, 48000, 88200, 96000, 192000]) {
      const info = parseAiff(makeAiff({ channels: 2, sampleRate: rate, bits: 16, samples: [ramp, ramp] }));
      expect(info).toMatchObject({ channels: 2, frames: ramp.length, bitsPerSample: 16, sampleRate: rate, littleEndian: false, float: false });
    }
    expect(aiffDuration(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [sine(440, 44100, 2)] }))).toBeCloseTo(2, 6);
  });

  it.each([8, 16, 24, 32] as const)('decodes %i-bit PCM', (bits) => {
    const pcm = decodeAiff(makeAiff({ channels: 1, sampleRate: 44100, bits, samples: [ramp] }));
    const tolerance = Math.max(1 / 2 ** (bits - 2), 1e-6);
    expect(pcm.sampleRate).toBe(44100);
    ramp.forEach((v, i) => expect(Math.abs(pcm.channels[0]![i]! - v)).toBeLessThan(tolerance));
  });

  it('keeps the channels apart', () => {
    const left = [0.5, 0.5, 0.5];
    const right = [-0.25, -0.25, -0.25];
    const pcm = decodeAiff(makeAiff({ channels: 2, sampleRate: 48000, bits: 16, samples: [left, right] }));
    expect(pcm.channels).toHaveLength(2);
    expect(pcm.channels[0]![1]).toBeCloseTo(0.5, 4);
    expect(pcm.channels[1]![1]).toBeCloseTo(-0.25, 4);
  });

  it('reads the little-endian « sowt » flavour that Apple tools write', () => {
    const pcm = decodeAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp], compression: 'sowt' }));
    ramp.forEach((v, i) => expect(Math.abs(pcm.channels[0]![i]! - v)).toBeLessThan(1e-4));
    const pcm24 = decodeAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 24, samples: [ramp], compression: 'sowt' }));
    ramp.forEach((v, i) => expect(Math.abs(pcm24.channels[0]![i]! - v)).toBeLessThan(1e-6));
  });

  it('reads big-endian AIFF-C (« twos ») and 32-bit float AIFF-C', () => {
    const twos = decodeAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp], compression: 'twos' }));
    expect(twos.channels[0]![3]).toBeCloseTo(0.5, 4);
    const float = decodeAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 32, samples: [ramp], compression: 'fl32' }));
    ramp.forEach((v, i) => expect(float.channels[0]![i]).toBeCloseTo(v, 6));
  });

  it('refuses compressed AIFF-C, other files and missing chunks', () => {
    expect(() => parseAiff(makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp], compression: 'ima4' }))).toThrow(AiffError);
    expect(() => parseAiff(new Uint8Array(40))).toThrow(AiffError);
    const noData = makeAiff({ channels: 1, sampleRate: 44100, bits: 16, samples: [ramp] }).slice(0, 12 + 8 + 18);
    expect(() => parseAiff(noData)).toThrow(/SSND/);
  });

  it('plays what is there of a truncated file', () => {
    const full = makeAiff({ channels: 2, sampleRate: 44100, bits: 16, samples: [ramp, ramp] });
    const cut = makeAiff({ channels: 2, sampleRate: 44100, bits: 16, samples: [ramp, ramp], truncateBytes: 9 });
    expect(full.length - cut.length).toBe(9);
    // 9 bytes = two whole stereo frames (8 bytes) and one stray byte lost.
    expect(decodeAiff(cut).channels[0]!.length).toBe(ramp.length - 3);
  });

  it('reads the AIFF test fixture written by another tool: 1 s of a 440 Hz tone', () => {
    const file = new Uint8Array(fs.readFileSync(path.resolve(import.meta.dirname, '../../tests/fixtures/tone.aiff')));
    const pcm = decodeAiff(file);
    expect(pcm).toMatchObject({ sampleRate: 44100 });
    expect(pcm.channels).toHaveLength(1);
    expect(pcm.channels[0]!.length).toBe(44100);
    // Frequency by zero crossings of the steady part: 440 Hz.
    const x = pcm.channels[0]!;
    let crossings = 0;
    for (let i = 4410; i < 39690; i++) if (x[i]! <= 0 && x[i + 1]! > 0) crossings++;
    expect(crossings / ((39690 - 4410) / 44100)).toBeGreaterThan(430);
    expect(crossings / ((39690 - 4410) / 44100)).toBeLessThan(450);
  });
});
