// A Wave encoder that writes exactly `frames` frames, 16-bit, at the audio's
// rate: the rendered audio cut or completed with silence. Every track of a
// sequencer folder then has the same length, to the frame (the tracks of a
// piece may differ by a few frames, a render by one). Written straight from
// the 16-bit samples, a group of chunks per sub-Blob, as `export/audio/wav.ts`.

import { CHUNK, type PcmAudio } from '../../audio/pcm';
import { ExportError, wavHeader, type AudioEncoder } from '../audio';

const GROUP = 32;

export function fixedLengthWav(frames: number): AudioEncoder {
  return {
    format: 'wav',
    extension: 'wav',
    mimeType: 'audio/wav',
    async encode(audio: PcmAudio, { onProgress, signal } = {}) {
      const channels = audio.channelCount;
      const parts: BlobPart[] = [wavHeader(frames, channels, audio.sampleRate)];
      let group: ArrayBuffer[] = [];
      const chunks = Math.ceil(frames / CHUNK);
      for (let c = 0; c < chunks; c++) {
        if (signal?.aborted) throw new ExportError('cancelled');
        const n = Math.min(CHUNK, frames - c * CHUNK);
        const out = new Int16Array(n * channels);
        const ch = audio.chunks[c];
        const have = ch ? Math.max(0, Math.min(n, audio.frames - c * CHUNK)) : 0;
        if (ch && have > 0) {
          if (channels === 1) out.set(ch.l.subarray(0, have));
          else {
            const r = ch.r ?? ch.l;
            for (let i = 0; i < have; i++) {
              out[2 * i] = ch.l[i]!;
              out[2 * i + 1] = r[i]!;
            }
          }
        }
        group.push(out.buffer);
        if (group.length === GROUP) {
          parts.push(new Blob(group));
          group = [];
        }
        if (c % 64 === 63) {
          onProgress?.(c / chunks);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (group.length) parts.push(new Blob(group));
      onProgress?.(1);
      return new Blob(parts, { type: 'audio/wav' });
    },
  };
}
