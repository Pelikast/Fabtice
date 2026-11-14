// WAV encoder: 16-bit PCM, little-endian, straight from the 16-bit samples
// (no conversion, no Float32 copy). The one encoder of the stand-in set;
// mp3 and flac come with the export agent (`encoders.ts`).

import { CHUNK, type PcmAudio } from '../../audio/pcm';
import { ExportError, type AudioEncoder } from './types';

/** The 44-byte header of a 16-bit PCM WAV. */
export function wavHeader(frames: number, channels: number, sampleRate: number): ArrayBuffer {
  const dataBytes = frames * channels * 2;
  const b = new ArrayBuffer(44);
  const v = new DataView(b);
  const ascii = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  return b;
}

export const wavEncoder: AudioEncoder = {
  format: 'wav',
  extension: 'wav',
  mimeType: 'audio/wav',
  async encode(audio: PcmAudio, { onProgress, signal } = {}) {
    const channels = audio.channelCount;
    const parts: BlobPart[] = [wavHeader(audio.frames, channels, audio.sampleRate)];
    for (let c = 0; c < audio.chunks.length; c++) {
      if (signal?.aborted) throw new ExportError('cancelled');
      const ch = audio.chunks[c]!;
      const n = Math.min(CHUNK, audio.frames - c * CHUNK);
      const out = new Int16Array(n * channels);
      if (channels === 1) out.set(ch.l.subarray(0, n));
      else {
        const r = ch.r ?? ch.l;
        for (let i = 0; i < n; i++) {
          out[2 * i] = ch.l[i]!;
          out[2 * i + 1] = r[i]!;
        }
      }
      parts.push(out.buffer);
      if (c % 64 === 63) {
        onProgress?.(c / audio.chunks.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress?.(1);
    return new Blob(parts, { type: 'audio/wav' });
  },
};
