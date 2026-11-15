// libFLAC (the export's WebAssembly encoder) called directly, for the tests
// that run in Node, where the app's encoder worker does not exist. Same
// settings as the worker (`export/audio/encoders/encode.worker.ts`).

import flac from '@audio/encode-flac';
import { CHUNK, type PcmAudio } from '../audio/pcm';
import { FLAC_LEVEL } from '../export/audio/encoders/settings';
import type { FlacEncode } from '../project/fileFormat';

export const nodeFlacEncode: FlacEncode = async (pcm: PcmAudio, { onProgress } = {}) => {
  const channels = pcm.channelCount;
  const enc = await flac({ sampleRate: pcm.sampleRate, channels, bitDepth: 16, compression: FLAC_LEVEL, frames: pcm.frames, stream: true } as Parameters<typeof flac>[0]);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const toFloat = (src: Int16Array, n: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = src[i]! / 32768;
    return out;
  };
  for (let c = 0; c < pcm.chunks.length; c++) {
    const chunk = pcm.chunks[c]!;
    const n = Math.min(CHUNK, pcm.frames - c * CHUNK);
    const l = toFloat(chunk.l, n);
    const list = channels === 1 ? [l] : [l, chunk.r ? toFloat(chunk.r, n) : l];
    parts.push(enc.encode(list).slice());
    onProgress?.((c + 1) / pcm.chunks.length);
  }
  parts.push(enc.flush().slice());
  const head = enc.head?.();
  enc.free();
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  if (head) all.set(head, 0);
  return new Blob([all], { type: 'audio/flac' });
};
