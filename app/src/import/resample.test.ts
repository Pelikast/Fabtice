import { describe, expect, it } from 'vitest';
import { createResampler, resampleChannels } from './resample';

function tone(frequency: number, rate: number, seconds: number, amplitude = 0.5): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
  return out;
}

/** Largest gap between the output and the ideal sine, ignoring the first and last 40 ms. */
function maxError(out: Float32Array, frequency: number, rate: number, amplitude = 0.5): number {
  const margin = Math.round(rate * 0.04);
  let worst = 0;
  for (let k = margin; k < out.length - margin; k++) {
    worst = Math.max(worst, Math.abs(out[k]! - amplitude * Math.sin((2 * Math.PI * frequency * k) / rate)));
  }
  return worst;
}

function rms(a: Float32Array, from = 0, to = a.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += a[i]! * a[i]!;
  return Math.sqrt(sum / (to - from));
}

describe('resampler', () => {
  it.each([8000, 11025, 22050, 32000, 44100, 88200, 96000])('turns %i Hz into 48 kHz without distorting a 1 kHz tone', async (rate) => {
    const input = tone(1000, rate, 1);
    const [out] = (await resampleChannels([input], rate, 48000))!;
    expect(out!.length).toBe(48000);
    expect(maxError(out!, 1000, 48000)).toBeLessThan(2e-3);
  });

  it('keeps the length in proportion for any rate, including odd ones', () => {
    expect(createResampler(44100, 48000).outputLength(44100)).toBe(48000);
    expect(createResampler(47952, 48000).outputLength(47952)).toBe(48000);
    expect(createResampler(96000, 48000).outputLength(96001)).toBe(48001 > 48000 ? 48001 : 48000);
  });

  it('keeps a constant signal constant (unit gain)', async () => {
    const [out] = (await resampleChannels([new Float32Array(44100).fill(0.5)], 44100, 48000))!;
    for (let k = 100; k < out!.length - 100; k += 997) expect(out![k]).toBeCloseTo(0.5, 4);
  });

  it('rejects what would alias when downsampling (30 kHz tone from 96 kHz)', async () => {
    const [out] = (await resampleChannels([tone(30000, 96000, 1)], 96000, 48000))!;
    expect(rms(out!, 4800, 43200)).toBeLessThan(0.5 * 0.7071 * 0.01); // below -40 dB of the input
  });

  it('keeps channels separate', async () => {
    const out = (await resampleChannels([tone(500, 22050, 0.5), tone(900, 22050, 0.5)], 22050, 48000))!;
    expect(maxError(out[0]!, 500, 48000)).toBeLessThan(2e-3);
    expect(maxError(out[1]!, 900, 48000)).toBeLessThan(2e-3);
  });

  it('returns the input untouched at the same rate, and null when aborted', async () => {
    const input = tone(440, 48000, 0.1);
    expect((await resampleChannels([input], 48000, 48000))![0]).toBe(input);
    expect(await resampleChannels([tone(440, 44100, 0.1)], 44100, 48000, { isAborted: () => true })).toBeNull();
  });

  it('reports progress up to 1', async () => {
    const seen: number[] = [];
    await resampleChannels([tone(440, 44100, 2), tone(440, 44100, 2)], 44100, 48000, { onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBeCloseTo(1, 6);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});
