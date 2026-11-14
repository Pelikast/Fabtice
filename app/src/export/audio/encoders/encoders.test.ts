// The pure parts of the mp3 and flac encoders (tag, Info frame) and the driver
// that feeds the worker, with a fake worker (the real ones run in Chromium:
// `npm run test:export-audio`).

import { describe, expect, it } from 'vitest';
import { CHUNK, pcmFromChannels } from '../../../audio/pcm';
import { ExportError } from '../types';
import { id3Title } from './id3';
import { crc16, ENCODER_DELAY, frameBytes, mp3InfoFrame } from './mp3Info';
import { WINDOW, type FromWorker, type ToWorker } from './protocol';
import { createWorkerEncoder } from './workerEncoder';

describe('id3Title', () => {
  it('writes an ID3v2.3 tag with one UTF-16 TIT2 frame', () => {
    const tag = id3Title('Été – ça');
    expect(String.fromCharCode(...tag.subarray(0, 3))).toBe('ID3');
    expect([tag[3], tag[4], tag[5]]).toEqual([3, 0, 0]);
    const size = (tag[6]! << 21) | (tag[7]! << 14) | (tag[8]! << 7) | tag[9]!;
    expect(size + 10).toBe(tag.length);
    expect(String.fromCharCode(...tag.subarray(10, 14))).toBe('TIT2');
    const frameSize = new DataView(tag.buffer).getUint32(14, false);
    expect(frameSize).toBe(tag.length - 20);
    expect(tag[20]).toBe(1);
    expect(new TextDecoder('utf-16le').decode(tag.subarray(23))).toBe('Été – ça');
  });
  it('is empty for an empty title', () => {
    expect(id3Title('  ').length).toBe(0);
  });
});

describe('mp3 Info frame', () => {
  it('is as long as a frame of the stream: 768 bytes at 256 kbit/s and 48 kHz', () => {
    expect(frameBytes(256, 48000)).toBe(768);
    const f = mp3InfoFrame({ kbps: 256, sampleRate: 48000, channels: 2, audioFrames: 501, samples: 576000 });
    expect(f.length).toBe(768);
  });
  it('has a real frame header, then Info, the counts, and the delay and padding that make the length exact', () => {
    const f = mp3InfoFrame({ kbps: 256, sampleRate: 48000, channels: 2, audioFrames: 501, samples: 576000 });
    const v = new DataView(f.buffer);
    expect(v.getUint32(0, false)).toBe(0xfffbd440); // MPEG-1 layer III, 256 kbit/s, 48 kHz, joint stereo
    expect(String.fromCharCode(...f.subarray(36, 40))).toBe('Info');
    expect(v.getUint32(44, false)).toBe(501);
    expect(v.getUint32(48, false)).toBe(768 * 502);
    const tag = 36 + 120;
    expect(String.fromCharCode(...f.subarray(tag, tag + 9))).toBe('LAME3.100');
    const delay = (f[tag + 21]! << 4) | (f[tag + 22]! >> 4);
    const padding = ((f[tag + 22]! & 15) << 8) | f[tag + 23]!;
    expect(delay).toBe(ENCODER_DELAY);
    expect(501 * 1152 - delay - padding).toBe(576000);
    expect(v.getUint16(tag + 34, false)).toBe(crc16(f.subarray(0, tag + 34)));
  });
  it('puts the tag where a mono file has it (17 bytes of side information)', () => {
    const f = mp3InfoFrame({ kbps: 256, sampleRate: 48000, channels: 1, audioFrames: 10, samples: 11000 });
    expect(String.fromCharCode(...f.subarray(21, 25))).toBe('Info');
    expect(f[3]! >> 6).toBe(3);
  });
  it('knows the CRC-16 of the tag (check value of CRC-16/UMTS)', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0xfee8);
  });
});

/** A worker that answers like the real one: ready, one ack per block, the pieces, done. */
class FakeWorker {
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: ToWorker[] = [];
  inflight = 0;
  maxInflight = 0;
  constructor(private readonly mode: 'ok' | 'load-fails' | 'encode-fails' | 'silent' = 'ok') {}
  private say(m: FromWorker) {
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
    });
  }
  postMessage(m: ToWorker) {
    this.received.push(m);
    if (m.type === 'start') {
      if (this.mode === 'load-fails') this.say({ type: 'error', where: 'load', message: 'no wasm' });
      else this.say({ type: 'ready' });
    } else if (m.type === 'block') {
      this.inflight++;
      this.maxInflight = Math.max(this.maxInflight, this.inflight);
      if (this.mode === 'silent') return;
      if (this.mode === 'encode-fails') return this.say({ type: 'error', where: 'encode', message: 'boom' });
      this.say({ type: 'out', bytes: new Uint8Array([m.index, m.index]) });
      // Acknowledge a little later, so the window can fill.
      setTimeout(() => {
        this.inflight--;
        this.say({ type: 'ack', index: m.index });
      }, 1);
    } else if (m.type === 'finish') {
      this.say({ type: 'out', bytes: new Uint8Array([99]) });
      this.say({ type: 'done', patch: { part: 0, bytes: new Uint8Array([7]) } });
    }
  }
  terminate() {
    this.terminated = true;
  }
}

const audio = (frames: number, stereo = true) => {
  const l = new Float32Array(frames).map((_, i) => Math.sin(i / 50) * 0.5);
  return pcmFromChannels(stereo ? [l, l.map((v) => -v)] : [l], 48000);
};
const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

describe('createWorkerEncoder', () => {
  const spec = { format: 'mp3', extension: 'mp3', mimeType: 'audio/mpeg' } as const;
  // `assets.ts` resolves a Vite import: stand it in for Node.
  it('sends every block in order, never more than the window ahead, then the end; patches the piece', async () => {
    const w = new FakeWorker();
    const enc = createWorkerEncoder(spec, () => w as unknown as Worker);
    const progress: number[] = [];
    const blob = await enc.encode(audio(CHUNK * 6 + 100), { onProgress: (f) => progress.push(f), title: 'T' });
    const blocks = w.received.filter((m) => m.type === 'block');
    expect(blocks.map((m) => (m as { index: number }).index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(w.received[0]).toMatchObject({ type: 'start', format: 'mp3', sampleRate: 48000, channels: 2, frames: CHUNK * 6 + 100, title: 'T' });
    expect(w.received[w.received.length - 1]).toEqual({ type: 'finish' });
    expect(w.maxInflight).toBeLessThanOrEqual(WINDOW);
    expect((blocks[6] as { l: Int16Array }).l.length).toBe(100);
    // Pieces 0..6 then 99; the first patched with [7].
    expect(await bytesOf(blob)).toEqual([7, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 99]);
    expect(blob.type).toBe('audio/mpeg');
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1]!)).toBe(true);
    expect(w.terminated).toBe(true);
  });
  it('sends one channel for a mono piece and for equal channels', async () => {
    const w = new FakeWorker();
    await createWorkerEncoder(spec, () => w as unknown as Worker).encode(audio(1000, false), {});
    expect(w.received[0]).toMatchObject({ type: 'start', channels: 1 });
    expect((w.received[1] as { r: unknown }).r).toBeNull();
  });
  it('is cancelled before it starts: no worker is made', async () => {
    let made = 0;
    const abort = new AbortController();
    abort.abort();
    await expect(
      createWorkerEncoder(spec, () => {
        made++;
        return new FakeWorker() as unknown as Worker;
      }).encode(audio(1000), { signal: abort.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(made).toBe(0);
  });
  it('is cancelled in the middle: rejects at once and ends the worker', async () => {
    const w = new FakeWorker('silent');
    const abort = new AbortController();
    const p = createWorkerEncoder(spec, () => w as unknown as Worker).encode(audio(CHUNK * 3), { signal: abort.signal });
    await new Promise((r) => setTimeout(r, 10));
    expect(w.received.filter((m) => m.type === 'block').length).toBe(WINDOW);
    abort.abort();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    expect(w.terminated).toBe(true);
  });
  it('says « encoder-missing » when the encoder cannot start, and « failed » when it breaks on the audio', async () => {
    const a = new FakeWorker('load-fails');
    await expect(createWorkerEncoder(spec, () => a as unknown as Worker).encode(audio(1000), {})).rejects.toMatchObject({ code: 'encoder-missing' });
    expect(a.terminated).toBe(true);
    const b = new FakeWorker('encode-fails');
    await expect(createWorkerEncoder(spec, () => b as unknown as Worker).encode(audio(1000), {})).rejects.toMatchObject({ code: 'failed' });
    expect(b.terminated).toBe(true);
    const c = createWorkerEncoder(spec, () => {
      throw new Error('no Worker here');
    });
    await expect(c.encode(audio(1000), {})).rejects.toBeInstanceOf(ExportError);
  });
});
