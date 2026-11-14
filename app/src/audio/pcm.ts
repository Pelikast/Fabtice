// The one in-memory form of a track's audio: 16-bit samples in fixed-size
// chunks, in shared memory when the page can have it.
//
// Why: a five-minute stereo track weighs 115 MB as Float32 and 58 MB in 16
// bits. Lots 1 and 2 kept BOTH (Float32 in the registry for the waveform and
// the analysis, 16-bit in the engine). Since lot 3 the registry holds this
// form only, and the very same chunks are handed to the engine (no copy:
// `SharedArrayBuffer`s are shared with the audio thread, not copied), the
// waveform peaks read them, and whoever needs Float32 again (analysis,
// separation, offline render, export) reads a range or makes a transient copy
// with the functions below, then lets it go.
//
// 16 bits is the precision the engine has always played: 96 dB of dynamic
// range, below the noise of the mp3, m4a and old recordings the app deals with.
//
// A two-channel audio whose channels are equal (to within one 16-bit step) is
// stored once (`mono`), as the engine always did.

import { CHUNK, CHUNK_BITS, type Chunk } from './worklet/protocol';

export { CHUNK, CHUNK_BITS };
export type { Chunk };

export interface PcmAudio {
  readonly sampleRate: number;
  /** Frames per channel. */
  readonly frames: number;
  /** Channels as decoded (1 or 2); a 2-channel audio may still be stored once, see `mono`. */
  readonly channelCount: 1 | 2;
  /** True when one channel is stored: a mono file, or a stereo one whose channels are equal. */
  readonly mono: boolean;
  /** `ceil(frames / CHUNK)` chunks of `CHUNK` frames (the last one padded with zeros). */
  readonly chunks: readonly Chunk[];
  /** Bytes of sample memory held. */
  readonly bytes: number;
}

const K16 = 1 / 32768;

/**
 * Lets the browser run other tasks (paint, input, audio messages) before going
 * on: a message to ourselves, not a timer (timers may be throttled, or faked
 * in tests).
 */
export function yieldToMain(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

/** Shared memory when the page is cross-origin isolated (the real engine needs it), plain memory otherwise. */
function allocate(bytes: number): ArrayBuffer | SharedArrayBuffer {
  return typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
}

/** True when the chunks live in shared memory (what the AudioWorklet engine reads without a copy). */
export function isShared(pcm: PcmAudio): boolean {
  const first = pcm.chunks[0];
  return !first || (typeof SharedArrayBuffer !== 'undefined' && first.l.buffer instanceof SharedArrayBuffer);
}

/** A zeroed 16-bit chunk. */
export function newChunkChannel(): Int16Array {
  return new Int16Array(allocate(CHUNK * 2));
}

function quantizeInto(dst: Int16Array, src: Float32Array, start: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const v = Math.round(src[start + i]! * 32768);
    dst[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
}

/** True when the right channel equals the left one to within one 16-bit step. */
export function channelsEqual(l: Float32Array, r: Float32Array | undefined): boolean {
  if (!r || r === l) return true;
  const tol = 1.5 / 32768;
  for (let i = 0; i < l.length; i++) {
    if (Math.abs(l[i]! - r[i]!) > tol) return false;
  }
  return true;
}

/** Converts decoded Float32 channels (1 or 2, same length) to the in-memory form. The input can then be dropped. */
export function pcmFromChannels(channels: readonly Float32Array[], sampleRate: number): PcmAudio {
  if (channels.length < 1 || channels.length > 2) throw new Error(`${channels.length} channels: 1 or 2 expected`);
  const l = channels[0]!;
  const r = channels[1];
  const frames = l.length;
  if (r && r.length !== frames) throw new Error('channels of different lengths');
  const mono = channelsEqual(l, r);
  const count = Math.ceil(frames / CHUNK);
  const chunks: Chunk[] = new Array(count);
  let bytes = 0;
  for (let c = 0; c < count; c++) {
    const s = c << CHUNK_BITS;
    const n = Math.min(CHUNK, frames - s);
    const cl = newChunkChannel();
    quantizeInto(cl, l, s, n);
    let cr: Int16Array | null = null;
    if (!mono) {
      cr = newChunkChannel();
      quantizeInto(cr, r!, s, n);
    }
    chunks[c] = { l: cl, r: cr };
    bytes += cl.byteLength + (cr ? cr.byteLength : 0);
  }
  return { sampleRate, frames, channelCount: channels.length as 1 | 2, mono, chunks, bytes };
}

/**
 * `pcmFromChannels`, a slice at a time: hands the main thread back every few
 * chunks, so opening a long piece never freezes the screen for a quarter of a
 * second (measured: 270 ms for a 4-minute mono piece in one go).
 */
export async function pcmFromChannelsInSlices(channels: readonly Float32Array[], sampleRate: number, chunksPerSlice = 16): Promise<PcmAudio> {
  if (channels.length < 1 || channels.length > 2) throw new Error(`${channels.length} channels: 1 or 2 expected`);
  const l = channels[0]!;
  const r = channels[1];
  const frames = l.length;
  if (r && r.length !== frames) throw new Error('channels of different lengths');
  const tick = yieldToMain;
  // Equal channels? Checked a slice at a time too.
  let mono = !r || r === l;
  if (!mono) {
    mono = true;
    const tol = 1.5 / 32768;
    for (let s = 0; s < frames && mono; s += CHUNK * chunksPerSlice) {
      const end = Math.min(frames, s + CHUNK * chunksPerSlice);
      for (let i = s; i < end; i++) {
        if (Math.abs(l[i]! - r![i]!) > tol) {
          mono = false;
          break;
        }
      }
      await tick();
    }
  }
  const count = Math.ceil(frames / CHUNK);
  const chunks: Chunk[] = new Array(count);
  let bytes = 0;
  for (let c = 0; c < count; c++) {
    const s = c << CHUNK_BITS;
    const n = Math.min(CHUNK, frames - s);
    const cl = newChunkChannel();
    quantizeInto(cl, l, s, n);
    let cr: Int16Array | null = null;
    if (!mono) {
      cr = newChunkChannel();
      quantizeInto(cr, r!, s, n);
    }
    chunks[c] = { l: cl, r: cr };
    bytes += cl.byteLength + (cr ? cr.byteLength : 0);
    if (c % chunksPerSlice === chunksPerSlice - 1) await tick();
  }
  return { sampleRate, frames, channelCount: channels.length as 1 | 2, mono, chunks, bytes };
}

/** Builds a `PcmAudio` from chunks already in 16 bits (read back from the device, written by a separator). */
export function pcmFromChunks(chunks: readonly Chunk[], frames: number, sampleRate: number, channelCount: 1 | 2): PcmAudio {
  if (chunks.length !== Math.ceil(frames / CHUNK)) throw new Error(`${chunks.length} chunks for ${frames} frames`);
  const mono = chunks.every((c) => c.r === null);
  if (!mono && chunks.some((c) => c.r === null)) throw new Error('mixed mono and stereo chunks');
  let bytes = 0;
  for (const c of chunks) {
    if (c.l.length !== CHUNK || (c.r && c.r.length !== CHUNK)) throw new Error('chunk of the wrong size');
    bytes += c.l.byteLength + (c.r ? c.r.byteLength : 0);
  }
  return { sampleRate, frames, channelCount: mono ? channelCount : 2, mono, chunks, bytes };
}

/** Seconds of audio. */
export function pcmDuration(pcm: PcmAudio): number {
  return pcm.frames / pcm.sampleRate;
}

/**
 * Reads `out.length` frames of one channel (0 = left, 1 = right; a mono audio
 * gives the same samples for both), from frame `start`, as Float32. Frames
 * outside the audio read as 0.
 */
export function readPcm(pcm: PcmAudio, channel: 0 | 1, start: number, out: Float32Array): void {
  const n = out.length;
  let i = 0;
  while (i < n) {
    const f = start + i;
    if (f < 0) {
      const z = Math.min(n - i, -f);
      out.fill(0, i, i + z);
      i += z;
      continue;
    }
    if (f >= pcm.frames) {
      out.fill(0, i);
      return;
    }
    const ci = f >> CHUNK_BITS;
    const co = f & (CHUNK - 1);
    const cnt = Math.min(n - i, CHUNK - co, pcm.frames - f);
    const ch = pcm.chunks[ci]!;
    const src = channel === 1 && ch.r ? ch.r : ch.l;
    for (let j = 0; j < cnt; j++) out[i + j] = src[co + j]! * K16;
    i += cnt;
  }
}

/**
 * A transient Float32 copy of the whole audio, one array per STORED channel
 * (one when `mono`): for code that needs plain arrays (a codec, a network).
 * Costs 4 bytes per sample: let it go as soon as possible.
 */
export function pcmToChannels(pcm: PcmAudio, options: { bothChannels?: boolean } = {}): Float32Array[] {
  const l = new Float32Array(pcm.frames);
  readPcm(pcm, 0, 0, l);
  if (pcm.mono) return options.bothChannels && pcm.channelCount === 2 ? [l, l] : [l];
  const r = new Float32Array(pcm.frames);
  readPcm(pcm, 1, 0, r);
  return [l, r];
}

/** The two channels mixed to one, as Float32 (`(l + r) / 2`, the analysis' own mix). Transient. */
export function pcmToMono(pcm: PcmAudio): Float32Array {
  const out = new Float32Array(pcm.frames);
  readPcm(pcm, 0, 0, out);
  if (pcm.mono) return out;
  const r = new Float32Array(Math.min(CHUNK, pcm.frames));
  for (let s = 0; s < pcm.frames; s += CHUNK) {
    const n = Math.min(CHUNK, pcm.frames - s);
    const view = n === r.length ? r : r.subarray(0, n);
    readPcm(pcm, 1, s, view);
    for (let i = 0; i < n; i++) out[s + i] = (out[s + i]! + view[i]!) / 2;
  }
  return out;
}

/**
 * `pcmToMono`, a slice at a time: hands the main thread back every few
 * chunks, so a long piece never blocks a frame (the analysis starts with it).
 */
export async function pcmToMonoInSlices(pcm: PcmAudio, chunksPerSlice = 8): Promise<Float32Array> {
  const out = new Float32Array(pcm.frames);
  const r = new Float32Array(CHUNK);
  for (let c = 0; c < pcm.chunks.length; c++) {
    const s = c * CHUNK;
    const n = Math.min(CHUNK, pcm.frames - s);
    const view = out.subarray(s, s + n);
    readPcm(pcm, 0, s, view);
    if (!pcm.mono) {
      const rv = r.subarray(0, n);
      readPcm(pcm, 1, s, rv);
      for (let i = 0; i < n; i++) view[i] = (view[i]! + rv[i]!) / 2;
    }
    if (c % chunksPerSlice === chunksPerSlice - 1) await yieldToMain();
  }
  return out;
}

/**
 * Writes audio progressively (a separator handing out a track slice by slice,
 * an offline render, a restore reading chunks): `write()` Float32 blocks at
 * any frame offset, `finish()` gives the `PcmAudio`. A two-channel writer whose
 * channels turn out equal is stored once.
 */
export class PcmWriter {
  private readonly chunks: Chunk[];
  private stereoSeen = false;
  private done = false;

  constructor(
    readonly frames: number,
    readonly sampleRate: number,
    readonly channelCount: 1 | 2,
  ) {
    const count = Math.ceil(frames / CHUNK);
    this.chunks = Array.from({ length: count }, () => ({ l: newChunkChannel(), r: channelCount === 2 ? newChunkChannel() : null }));
  }

  /** Writes `l` (and `r` for two channels; `r` omitted = same as left) at frame `offset`; frames past the end are ignored. */
  write(offset: number, l: Float32Array, r?: Float32Array): void {
    if (this.done) throw new Error('PcmWriter already finished');
    const n = Math.min(l.length, this.frames - offset);
    let i = 0;
    while (i < n) {
      const f = offset + i;
      const ci = f >> CHUNK_BITS;
      const co = f & (CHUNK - 1);
      const cnt = Math.min(n - i, CHUNK - co);
      const ch = this.chunks[ci]!;
      for (let j = 0; j < cnt; j++) {
        const v = Math.round(l[i + j]! * 32768);
        const q = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
        ch.l[co + j] = q;
        if (ch.r) {
          let qr = q;
          if (r) {
            const w = Math.round(r[i + j]! * 32768);
            qr = w > 32767 ? 32767 : w < -32768 ? -32768 : w;
          }
          if (qr - q > 1 || q - qr > 1) this.stereoSeen = true;
          ch.r[co + j] = qr;
        }
      }
      i += cnt;
    }
  }

  finish(): PcmAudio {
    this.done = true;
    const mono = this.channelCount === 1 || !this.stereoSeen;
    const chunks = mono ? this.chunks.map((c) => ({ l: c.l, r: null })) : this.chunks;
    return pcmFromChunks(chunks, this.frames, this.sampleRate, this.channelCount);
  }
}

/** Total bytes of several audios (usage shown to the user, memory checks). */
export function pcmBytes(list: Iterable<PcmAudio>): number {
  let n = 0;
  for (const p of list) n += p.bytes;
  return n;
}

/** The sum of several audios of the same length (parts gathered in one track). Stereo if any part is. */
export function sumPcm(parts: readonly PcmAudio[]): PcmAudio {
  const first = parts[0];
  if (!first) throw new Error('nothing to sum');
  const writer = new PcmWriter(first.frames, first.sampleRate, parts.some((p) => p.channelCount === 2) ? 2 : 1);
  const accL = new Float32Array(CHUNK);
  const accR = new Float32Array(CHUNK);
  const tmp = new Float32Array(CHUNK);
  for (let s = 0; s < first.frames; s += CHUNK) {
    const n = Math.min(CHUNK, first.frames - s);
    const L = accL.subarray(0, n).fill(0);
    const R = accR.subarray(0, n).fill(0);
    const T = tmp.subarray(0, n);
    for (const p of parts) {
      readPcm(p, 0, s, T);
      for (let i = 0; i < n; i++) L[i] = L[i]! + T[i]!;
      readPcm(p, 1, s, T);
      for (let i = 0; i < n; i++) R[i] = R[i]! + T[i]!;
    }
    writer.write(s, L, R);
  }
  return writer.finish();
}
