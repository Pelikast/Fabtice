// WAV encoder, straight from the 16-bit samples, a block at a time (never a
// Float32 copy of the whole piece):
//   - 16 bits at the audio's own rate: the samples as they are;
//   - 24 bits and 32 bits floating point at the audio's own rate: the same
//     samples widened, which is exact (a 16-bit code `v` is `v << 8` in 24 bits
//     and `v / 32768` in a float, both without any rounding);
//   - another sampling rate (44.1, 88.2, 96 kHz...): converted block by block by
//     the windowed-sinc converter (`resample.ts`) and written at the chosen
//     quantization (rounded to the nearest code, never beyond full scale).
// Mp3 and flac are the encoders of `encoders/`.

import { CHUNK, readPcm, type PcmAudio } from '../../audio/pcm';
import type { WaveBits } from '../../model/audioExport';
import { SincResampler } from './resample';
import { ExportError, type AudioEncoder } from './types';

/**
 * The header of a WAV: 44 bytes for integer samples (16 and 24 bits), 58 for
 * 32-bit floating point (format 3 asks for the extended `fmt ` chunk and a
 * `fact` chunk holding the number of frames).
 */
export function wavHeader(frames: number, channels: number, sampleRate: number, bits: WaveBits = 16): ArrayBuffer {
  const float = bits === 32;
  const bytesPerSample = bits / 8;
  const dataBytes = frames * channels * bytesPerSample;
  const headBytes = float ? 58 : 44;
  if (dataBytes + headBytes - 8 > 0xffffffff) throw new ExportError('memory', 'a WAV file holds at most 4 GB');
  const b = new ArrayBuffer(headBytes);
  const v = new DataView(b);
  const ascii = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, headBytes - 8 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, float ? 18 : 16, true);
  v.setUint16(20, float ? 3 : 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bytesPerSample, true);
  v.setUint16(32, channels * bytesPerSample, true);
  v.setUint16(34, bits, true);
  let at = 36;
  if (float) {
    v.setUint16(36, 0, true); // size of the extension
    ascii(38, 'fact');
    v.setUint32(42, 4, true);
    v.setUint32(46, frames, true);
    at = 50;
  }
  ascii(at, 'data');
  v.setUint32(at + 4, dataBytes, true);
  return b;
}

/** Blob parts are grouped to about this many bytes (a Blob of its own each): the browser takes them out of the JavaScript heap at once. */
const GROUP_BYTES = 4 << 20;

/** A block of 16-bit codes (left, and right when different; the file has `channels`) as the bytes of a WAV of `bits`. */
function packCodes(bits: WaveBits, channels: number, l: Int16Array, r: Int16Array | null, n: number): ArrayBuffer {
  const right = channels === 2 ? (r ?? l) : null;
  if (bits === 16) {
    const out = new Int16Array(n * channels);
    if (!right) out.set(l.subarray(0, n));
    else
      for (let i = 0; i < n; i++) {
        out[2 * i] = l[i]!;
        out[2 * i + 1] = right[i]!;
      }
    return out.buffer;
  }
  if (bits === 24) {
    // A 16-bit code widened to 24 bits: the low byte is 0.
    const out = new Uint8Array(n * channels * 3);
    let o = 0;
    for (let i = 0; i < n; i++) {
      const a = l[i]!;
      out[o++] = 0;
      out[o++] = a & 0xff;
      out[o++] = (a >> 8) & 0xff;
      if (right) {
        const b = right[i]!;
        out[o++] = 0;
        out[o++] = b & 0xff;
        out[o++] = (b >> 8) & 0xff;
      }
    }
    return out.buffer;
  }
  const out = new Float32Array(n * channels);
  for (let i = 0; i < n; i++) {
    if (right) {
      out[2 * i] = l[i]! / 32768;
      out[2 * i + 1] = right[i]! / 32768;
    } else out[i] = l[i]! / 32768;
  }
  return out.buffer;
}

/** A block of Float32 samples (full scale = 1) as the bytes of a WAV of `bits`, rounded to the nearest code and clipped at full scale. */
function packFloat(bits: WaveBits, channels: number, l: Float32Array, r: Float32Array | null, n: number): ArrayBuffer {
  const right = channels === 2 ? (r ?? l) : null;
  if (bits === 32) {
    const out = new Float32Array(n * channels);
    if (!right) out.set(l.subarray(0, n));
    else
      for (let i = 0; i < n; i++) {
        out[2 * i] = l[i]!;
        out[2 * i + 1] = right[i]!;
      }
    return out.buffer;
  }
  if (bits === 16) {
    const out = new Int16Array(n * channels);
    const q = (x: number) => {
      const v = Math.round(x * 32768);
      return v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    };
    for (let i = 0; i < n; i++) {
      if (right) {
        out[2 * i] = q(l[i]!);
        out[2 * i + 1] = q(right[i]!);
      } else out[i] = q(l[i]!);
    }
    return out.buffer;
  }
  const out = new Uint8Array(n * channels * 3);
  let o = 0;
  const put = (x: number) => {
    let v = Math.round(x * 8388608);
    v = v > 8388607 ? 8388607 : v < -8388608 ? -8388608 : v;
    out[o++] = v & 0xff;
    out[o++] = (v >> 8) & 0xff;
    out[o++] = (v >> 16) & 0xff;
  };
  for (let i = 0; i < n; i++) {
    put(l[i]!);
    if (right) put(right[i]!);
  }
  return out.buffer;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export const wavEncoder: AudioEncoder = {
  format: 'wav',
  extension: 'wav',
  mimeType: 'audio/wav',
  async encode(audio: PcmAudio, { onProgress, signal, sampleRate, bits = 16 } = {}) {
    const channels = audio.channelCount;
    const outRate = sampleRate ?? audio.sampleRate;
    const resampler = outRate === audio.sampleRate ? null : new SincResampler(audio.sampleRate, outRate);
    const frames = resampler ? resampler.outFrames(audio.frames) : audio.frames;
    const blockCount = Math.ceil(frames / CHUNK);
    const parts: BlobPart[] = [wavHeader(frames, channels, outRate, bits)];
    let group: ArrayBuffer[] = [];
    let groupBytes = 0;
    const add = (block: ArrayBuffer) => {
      group.push(block);
      groupBytes += block.byteLength;
      if (groupBytes >= GROUP_BYTES) {
        parts.push(new Blob(group));
        group = [];
        groupBytes = 0;
      }
    };
    const outL = new Float32Array(CHUNK);
    const outR = new Float32Array(CHUNK);
    let scratch: Float32Array | undefined;
    for (let c = 0; c < blockCount; c++) {
      if (signal?.aborted) throw new ExportError('cancelled');
      const n = Math.min(CHUNK, frames - c * CHUNK);
      if (!resampler) {
        const ch = audio.chunks[c]!;
        add(packCodes(bits, channels, ch.l, channels === 2 ? ch.r ?? ch.l : null, n));
      } else {
        const l = outL.subarray(0, n);
        const readL = (start: number, buf: Float32Array) => readPcm(audio, 0, start, buf);
        scratch = resampler.renderBlock(readL, c * CHUNK, l, scratch);
        let r: Float32Array | null = null;
        if (channels === 2 && !audio.mono) {
          r = outR.subarray(0, n);
          const readR = (start: number, buf: Float32Array) => readPcm(audio, 1, start, buf);
          scratch = resampler.renderBlock(readR, c * CHUNK, r, scratch);
        }
        add(packFloat(bits, channels, l, r, n));
      }
      // The converter is slower than a copy: hand the page back more often.
      if (c % (resampler ? 4 : 64) === (resampler ? 3 : 63)) {
        onProgress?.(c / blockCount);
        await tick();
      }
    }
    if (group.length) parts.push(new Blob(group));
    onProgress?.(1);
    return new Blob(parts, { type: 'audio/wav' });
  },
};
