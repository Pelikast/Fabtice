// The Wave encoder: the header of every rate and quantization, the samples
// widened exactly (16 → 24 bits, 16 → 32-bit float), the converted rates.

import { describe, expect, it } from 'vitest';
import { pcmFromChannels } from '../../audio/pcm';
import type { WaveBits } from '../../model/audioExport';
import { WAVE_BITS, WAVE_RATES } from '../../model/audioExport';
import { ExportError } from './types';
import { wavEncoder, wavHeader } from './wav';

interface Wav {
  tag: number;
  channels: number;
  rate: number;
  byteRate: number;
  blockAlign: number;
  bits: number;
  frames: number;
  riffSize: number;
  fileSize: number;
  data: DataView;
  fact: number | null;
}

/** Reads a WAV the way a player does: chunk by chunk. */
function readWav(bytes: ArrayBuffer): Wav {
  const v = new DataView(bytes);
  const ascii = (o: number, n: number) => String.fromCharCode(...new Uint8Array(bytes, o, n));
  expect(ascii(0, 4)).toBe('RIFF');
  expect(ascii(8, 4)).toBe('WAVE');
  let at = 12;
  let fmt: Pick<Wav, 'tag' | 'channels' | 'rate' | 'byteRate' | 'blockAlign' | 'bits'> | null = null;
  let fact: number | null = null;
  while (at + 8 <= bytes.byteLength) {
    const id = ascii(at, 4);
    const size = v.getUint32(at + 4, true);
    if (id === 'fmt ') {
      fmt = { tag: v.getUint16(at + 8, true), channels: v.getUint16(at + 10, true), rate: v.getUint32(at + 12, true), byteRate: v.getUint32(at + 16, true), blockAlign: v.getUint16(at + 20, true), bits: v.getUint16(at + 22, true) };
      if (fmt.tag === 3) expect(size).toBe(18);
    } else if (id === 'fact') fact = v.getUint32(at + 8, true);
    else if (id === 'data') {
      expect(fmt).not.toBeNull();
      expect(at + 8 + size).toBe(bytes.byteLength);
      return { ...fmt!, frames: size / fmt!.blockAlign, riffSize: v.getUint32(4, true), fileSize: bytes.byteLength, data: new DataView(bytes, at + 8, size), fact };
    }
    at += 8 + size;
  }
  throw new Error('no data chunk');
}

const sine = (n: number, rate: number, hz: number, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
const stereo = (frames: number, rate = 48000) => pcmFromChannels([sine(frames, rate, 440), sine(frames, rate, 660, 0.3)], rate);

async function encode(audio: ReturnType<typeof stereo>, options: Parameters<typeof wavEncoder.encode>[1] = {}): Promise<Wav> {
  return readWav(await (await wavEncoder.encode(audio, options)).arrayBuffer());
}

describe('wavHeader', () => {
  for (const bits of WAVE_BITS) {
    for (const rate of WAVE_RATES) {
      it(`${bits} bits at ${rate} Hz: sizes, format, rate, alignment`, () => {
        const frames = 12345;
        const head = wavHeader(frames, 2, rate, bits);
        const file = new Uint8Array(head.byteLength + frames * 2 * (bits / 8));
        file.set(new Uint8Array(head));
        const w = readWav(file.buffer);
        expect(w.tag).toBe(bits === 32 ? 3 : 1);
        expect([w.channels, w.rate, w.bits]).toEqual([2, rate, bits]);
        expect(w.blockAlign).toBe(2 * (bits / 8));
        expect(w.byteRate).toBe(rate * 2 * (bits / 8));
        expect(w.frames).toBe(frames);
        expect(w.riffSize).toBe(file.length - 8);
        expect(w.fact).toBe(bits === 32 ? frames : null);
        expect(head.byteLength).toBe(bits === 32 ? 58 : 44);
      });
    }
  }
  it('refuses a file that would pass 4 GB', () => {
    expect(() => wavHeader(600_000_000, 2, 96000, 32)).toThrow(ExportError);
  });
  it('keeps the 44-byte header of 16 bits as it always was', () => {
    expect(wavHeader(100, 2, 48000).byteLength).toBe(44);
    expect(wavHeader(100, 1, 44100, 16).byteLength).toBe(44);
  });
});

describe('Wave at the audio’s own rate (no conversion)', () => {
  const frames = 70000; // two blocks of 32 768 and a part
  const audio = stereo(frames);
  const code = (f: Float32Array, i: number) => Math.round(f[i]! * 32768);

  it('16 bits: the samples as they are (default)', async () => {
    const w = await encode(audio);
    expect([w.tag, w.rate, w.bits, w.channels, w.frames]).toEqual([1, 48000, 16, 2, frames]);
    const l = sine(frames, 48000, 440);
    const r = sine(frames, 48000, 660, 0.3);
    for (const i of [0, 1, 999, 32767, 32768, 50000, frames - 1]) {
      expect(w.data.getInt16(4 * i, true)).toBe(code(l, i));
      expect(w.data.getInt16(4 * i + 2, true)).toBe(code(r, i));
    }
  });

  it('24 bits: every 16-bit code widened exactly (code × 256)', async () => {
    const plain = await encode(audio);
    const w = await encode(audio, { bits: 24 });
    expect([w.tag, w.bits, w.frames, w.blockAlign]).toEqual([1, 24, frames, 6]);
    for (let i = 0; i < frames * 2; i += 7) {
      const v16 = plain.data.getInt16(2 * i, true);
      const lo = w.data.getUint8(3 * i);
      const mid = w.data.getUint8(3 * i + 1);
      const hi = w.data.getInt8(3 * i + 2);
      expect(lo).toBe(0);
      expect(hi * 65536 + mid * 256 + lo).toBe(v16 * 256);
    }
  });

  it('32 bits floating point: every 16-bit code divided by 32 768 exactly', async () => {
    const plain = await encode(audio);
    const w = await encode(audio, { bits: 32 });
    expect([w.tag, w.bits, w.frames, w.fact]).toEqual([3, 32, frames, frames]);
    for (let i = 0; i < frames * 2; i += 7) expect(w.data.getFloat32(4 * i, true)).toBe(plain.data.getInt16(2 * i, true) / 32768);
  });

  it('a mono audio makes a mono file, in every quantization', async () => {
    const mono = pcmFromChannels([sine(5000, 48000, 440)], 48000);
    for (const bits of WAVE_BITS as readonly WaveBits[]) {
      const w = await encode(mono, { bits });
      expect([w.channels, w.frames, w.bits]).toEqual([1, 5000, bits]);
    }
  });

  it('two equal channels (stored once) are written twice, byte for byte', async () => {
    const both = sine(3000, 48000, 440);
    const audio2 = pcmFromChannels([both, both], 48000);
    expect(audio2.mono).toBe(true);
    for (const bits of WAVE_BITS as readonly WaveBits[]) {
      const w = await encode(audio2, { bits });
      expect(w.channels).toBe(2);
      const size = bits / 8;
      let nonZero = 0;
      for (let i = 0; i < 3000; i++) {
        for (let k = 0; k < size; k++) {
          const left = w.data.getUint8(2 * size * i + k);
          expect(w.data.getUint8(2 * size * i + size + k)).toBe(left);
          if (left) nonZero++;
        }
      }
      expect(nonZero).toBeGreaterThan(1000);
    }
  });

  it('is stopped at once by an abort', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(wavEncoder.encode(audio, { signal: abort.signal })).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('Wave at another rate', () => {
  const seconds = 3;
  const audio = pcmFromChannels([sine(48000 * seconds, 48000, 1000), sine(48000 * seconds, 48000, 2000, 0.25)], 48000);

  for (const rate of [44100, 88200, 96000]) {
    for (const bits of WAVE_BITS as readonly WaveBits[]) {
      it(`${rate} Hz, ${bits} bits: the header, the length, and the tones where they were`, async () => {
        const w = await encode(audio, { sampleRate: rate, bits });
        expect([w.rate, w.bits, w.channels, w.frames]).toEqual([rate, bits, 2, rate * seconds]);
        expect(w.riffSize).toBe(w.fileSize - 8);
        const read = (i: number, ch: number): number => {
          const size = bits / 8;
          const at = (2 * i + ch) * size;
          if (bits === 32) return w.data.getFloat32(at, true);
          if (bits === 24) return (w.data.getInt8(at + 2) * 65536 + w.data.getUint8(at + 1) * 256 + w.data.getUint8(at)) / 8388608;
          return w.data.getInt16(at, true) / 32768;
        };
        // Left: 1 kHz at 0.5, right: 2 kHz at 0.25, as the ideal sampled at the new rate.
        let err = 0;
        let sig = 0;
        for (let i = 2000; i < w.frames - 2000; i += 3) {
          const l = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / rate);
          const r = 0.25 * Math.sin((2 * Math.PI * 2000 * i) / rate);
          err += (read(i, 0) - l) ** 2 + (read(i, 1) - r) ** 2;
          sig += l * l + r * r;
        }
        // The source is itself 16-bit (its own rounding, about -89 dB for these levels, is the floor of every quantization here).
        expect(10 * Math.log10(err / sig)).toBeLessThan(-85);
      });
    }
  }

  it('the same rate asked as the audio’s own is the copy, sample for sample', async () => {
    const a = await encode(audio);
    const b = await encode(audio, { sampleRate: 48000 });
    expect(b.fileSize).toBe(a.fileSize);
    for (let i = 0; i < 2000; i++) expect(b.data.getInt16(2 * i, true)).toBe(a.data.getInt16(2 * i, true));
  });

  it('a mono audio stays mono, and two equal channels cost one conversion', async () => {
    const mono = pcmFromChannels([sine(48000, 48000, 440)], 48000);
    const w = await encode(mono, { sampleRate: 44100 });
    expect([w.channels, w.frames]).toEqual([1, 44100]);
  });

  it('never goes beyond full scale: a full-scale square wave is clipped, never wrapped round', async () => {
    const square = Float32Array.from({ length: 48000 }, (_, i) => (Math.floor(i / 24) % 2 ? -1 : 1));
    const w = await encode(pcmFromChannels([square], 48000), { sampleRate: 96000 });
    let checked = 0;
    for (let i = 400; i < w.frames - 400; i++) {
      if (i % 48 < 10 || i % 48 > 38) continue; // the flat part of each half-wave, away from the edges
      const v = w.data.getInt16(2 * i, true);
      expect(Math.sign(v)).toBe(Math.floor(i / 48) % 2 ? -1 : 1);
      expect(Math.abs(v)).toBeGreaterThan(25000);
      checked++;
    }
    expect(checked).toBeGreaterThan(50000);
  });

  it('reports its progress and ends at 1', async () => {
    const seen: number[] = [];
    await wavEncoder.encode(audio, { sampleRate: 44100, onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f, i) => i === 0 || f >= seen[i - 1]!)).toBe(true);
  });

  it('is stopped by an abort in the middle', async () => {
    const abort = new AbortController();
    const long = pcmFromChannels([sine(48000 * 20, 48000, 440)], 48000);
    const pending = wavEncoder.encode(long, { sampleRate: 96000, signal: abort.signal, onProgress: (f) => f > 0.1 && abort.abort() });
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});
