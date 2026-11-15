import flac from '@audio/encode-flac';
import { describe, expect, it } from 'vitest';
import { FlacDecoder, FlacError } from './decode';

/** 16-bit samples as libFLAC's encoder is fed by the app (k / 32768), encoded in one go. */
async function encode(channels: Int16Array[], sampleRate = 48000, level = 5): Promise<Uint8Array> {
  const frames = channels[0]!.length;
  const enc = await flac({ sampleRate, channels: channels.length, bitDepth: 16, compression: level, frames, stream: true } as Parameters<typeof flac>[0]);
  const parts: Uint8Array[] = [];
  const BLOCK = 32768;
  for (let at = 0; at < frames; at += BLOCK) {
    const n = Math.min(BLOCK, frames - at);
    parts.push(enc.encode(channels.map((c) => Float32Array.from(c.subarray(at, at + n), (v) => v / 32768))).slice());
  }
  parts.push(enc.flush().slice());
  const head = enc.head?.();
  enc.free();
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  if (head) out.set(head, 0);
  return out;
}

function decodeAll(bytes: Uint8Array, slice = 65536): { info: NonNullable<FlacDecoder['info']>; channels: Int16Array[] } {
  const got: number[][] = [];
  const dec = new FlacDecoder((chs, n) => {
    chs.forEach((c, i) => {
      got[i] ??= [];
      for (let k = 0; k < n; k++) got[i]!.push(c[k]!);
    });
  });
  for (let at = 0; at < bytes.length; at += slice) dec.push(bytes.subarray(at, at + slice));
  dec.end();
  return { info: dec.info!, channels: got.map((c) => Int16Array.from(c)) };
}

/** Music-like content: tones, noise, silence, a clipped burst, an exact copy in both channels for a while. */
function material(frames: number, seed = 1): Int16Array[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  const l = new Int16Array(frames);
  const r = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / 48000;
    let a = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 331 * t) + 0.05 * rnd();
    if (i > frames * 0.3 && i < frames * 0.35) a = 0; // digital silence
    if (i > frames * 0.5 && i < frames * 0.52) a = 2 * Math.sin(2 * Math.PI * 80 * t); // clipped
    l[i] = Math.max(-32768, Math.min(32767, Math.round(a * 32768)));
    r[i] = i > frames * 0.7 ? l[i]! : Math.max(-32768, Math.min(32767, Math.round((0.4 * Math.sin(2 * Math.PI * 147 * t) + 0.1 * rnd()) * 32768)));
  }
  r[0] = -32768;
  l[1] = 32767;
  return [l, r];
}

describe('FLAC decoder', () => {
  it('gives back what libFLAC encoded, to the sample (stereo, every level, odd slices)', async () => {
    const src = material(48000 * 3 + 777);
    for (const level of [0, 5, 8]) {
      const bytes = await encode(src, 48000, level);
      for (const slice of [1000, 65536, bytes.length]) {
        const { info, channels } = decodeAll(bytes, slice);
        expect(info).toEqual({ sampleRate: 48000, channels: 2, bitsPerSample: 16, totalFrames: src[0]!.length });
        expect(channels[0]).toEqual(src[0]);
        expect(channels[1]).toEqual(src[1]);
      }
    }
  });

  it('mono, short, silence, and 44.1 kHz', async () => {
    for (const src of [[material(5000)[0]!], [new Int16Array(10)], [new Int16Array(70000)]]) {
      const { channels } = decodeAll(await encode(src, 44100));
      expect(channels[0]).toEqual(src[0]);
    }
  });

  it('refuses a stream cut short or that is not FLAC', async () => {
    const bytes = await encode(material(20000));
    expect(() => decodeAll(bytes.subarray(0, bytes.length - 100))).toThrow(FlacError);
    expect(() => decodeAll(new TextEncoder().encode('RIFF....WAVEfmt '))).toThrow(FlacError);
  });

  it('speed', { timeout: 120_000 }, async () => {
    const src = material(48000 * 60);
    const e0 = performance.now();
    const bytes = await encode(src);
    const encodeMs = performance.now() - e0;
    const t0 = performance.now();
    let n = 0;
    const dec = new FlacDecoder((_c, k) => void (n += k));
    for (let at = 0; at < bytes.length; at += 4 << 20) dec.push(bytes.subarray(at, at + (4 << 20)));
    dec.end();
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[flac] one minute of stereo: ${(bytes.length / 1e6).toFixed(1)} MB (WAV ${(src[0]!.length * 4 / 1e6).toFixed(1)} MB), decoded in ${Math.round(ms)} ms, encoded (libFLAC level 5, WebAssembly) in ${Math.round(encodeMs)} ms`);
    expect(n).toBe(src[0]!.length);
    expect(ms).toBeLessThan(5000);
  });
});
