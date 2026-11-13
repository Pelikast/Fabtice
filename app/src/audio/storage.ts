// Main-thread side of the track memory: Float32 channels become 16-bit chunks
// in SharedArrayBuffers (readable by the audio thread without a copy), and a
// stereo track whose channels are identical is stored once (mono). A 5-minute
// stereo piece weighs 5 x 60 x 48 000 x 2 channels x 2 bytes = 58 MB.

import { CHUNK, CHUNK_BITS, type Chunk } from './worklet/protocol';

export interface StoredTrack {
  frames: number;
  mono: boolean;
  chunks: Chunk[];
  bytes: number;
}

/** True when the right channel equals the left one to within one 16-bit step. */
export function isMono(l: Float32Array, r: Float32Array | undefined): boolean {
  if (!r || r === l) return true;
  const tol = 1.5 / 32768;
  for (let i = 0; i < l.length; i++) {
    if (Math.abs(l[i]! - r[i]!) > tol) return false;
  }
  return true;
}

function quantize(src: Float32Array, start: number, n: number): Int16Array {
  const buf = new SharedArrayBuffer(CHUNK * 2);
  const a = new Int16Array(buf);
  for (let i = 0; i < n; i++) {
    const v = Math.round(src[start + i]! * 32768);
    a[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return a;
}

/** Converts decoded channels (1 or 2) to shared 16-bit chunks. Needs SharedArrayBuffer. */
export function storeTrack(channels: Float32Array[]): StoredTrack {
  const l = channels[0]!;
  const r = channels[1];
  const frames = l.length;
  const mono = isMono(l, r);
  const count = Math.ceil(frames / CHUNK);
  const chunks: Chunk[] = new Array(count);
  let bytes = 0;
  for (let c = 0; c < count; c++) {
    const s = c << CHUNK_BITS;
    const n = Math.min(CHUNK, frames - s);
    const cl = quantize(l, s, n);
    const cr = mono ? null : quantize(r!, s, n);
    chunks[c] = { l: cl, r: cr };
    bytes += cl.byteLength + (cr ? cr.byteLength : 0);
  }
  return { frames, mono, chunks, bytes };
}
