// Recognising an audio file by its content, and reading its length from the
// header when the format allows it, before spending memory on decoding.

import { aiffDuration, isAiff } from './aiff';

export type AudioFormat = 'wav' | 'aiff' | 'flac' | 'mp3' | 'm4a';

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

/** The format of the bytes, or null if they look like none of the five. */
export function detectAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 4) return null;
  if (tag(bytes, 0) === 'RIFF' && tag(bytes, 8) === 'WAVE') return 'wav';
  if (isAiff(bytes)) return 'aiff';
  if (tag(bytes, 0) === 'fLaC') return 'flac';
  if (tag(bytes, 4) === 'ftyp') return 'm4a';
  if (tag(bytes, 0).startsWith('ID3')) return 'mp3';
  // A bare MPEG audio frame: 11 sync bits, a valid version and layer III/II/I.
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0 && ((bytes[1] ?? 0) >> 3 & 3) !== 1 && ((bytes[1] ?? 0) >> 1 & 3) !== 0) return 'mp3';
  return null;
}

// ---------------------------------------------------------------- durations

function wavDuration(b: Uint8Array): number | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let byteRate = 0;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const id = tag(b, pos);
    const size = view.getUint32(pos + 4, true);
    if (id === 'fmt ' && pos + 20 <= b.length) byteRate = view.getUint32(pos + 16, true);
    if (id === 'data') {
      if (!byteRate) return null;
      // Streamed files announce 0 or 0xFFFFFFFF: use what is there.
      const length = size === 0 || size === 0xffffffff ? b.length - (pos + 8) : Math.min(size, b.length - (pos + 8));
      return length / byteRate;
    }
    pos += 8 + size + (size & 1);
  }
  return null;
}

function flacDuration(b: Uint8Array): number | null {
  // First metadata block must be STREAMINFO: 4-byte header, then 34 bytes.
  if (b.length < 4 + 4 + 34 || ((b[4] ?? 0) & 0x7f) !== 0) return null;
  const s = 8;
  const sampleRate = ((b[s + 10] ?? 0) << 12) | ((b[s + 11] ?? 0) << 4) | ((b[s + 12] ?? 0) >> 4);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const total = ((b[s + 13] ?? 0) & 0x0f) * 2 ** 32 + view.getUint32(s + 14);
  return sampleRate > 0 && total > 0 ? total / sampleRate : null;
}

function mp4Duration(b: Uint8Array): number | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const find = (from: number, to: number, wanted: string): { body: number; end: number } | null => {
    let pos = from;
    while (pos + 8 <= to) {
      let size = view.getUint32(pos);
      let head = 8;
      if (size === 1 && pos + 16 <= to) {
        size = view.getUint32(pos + 8) * 2 ** 32 + view.getUint32(pos + 12);
        head = 16;
      } else if (size === 0) {
        size = to - pos;
      }
      if (size < head) return null;
      if (tag(b, pos + 4) === wanted) return { body: pos + head, end: Math.min(to, pos + size) };
      pos += size;
    }
    return null;
  };
  const moov = find(0, b.length, 'moov');
  const mvhd = moov && find(moov.body, moov.end, 'mvhd');
  if (!mvhd || mvhd.body + 20 > b.length) return null;
  const version = b[mvhd.body] ?? 0;
  const timescale = version === 1 ? view.getUint32(mvhd.body + 20) : view.getUint32(mvhd.body + 12);
  const duration = version === 1 ? view.getUint32(mvhd.body + 24) * 2 ** 32 + view.getUint32(mvhd.body + 28) : view.getUint32(mvhd.body + 16);
  // Fragmented files (the Mac app's downloads) say 0 here.
  return timescale > 0 && duration > 0 ? duration / timescale : null;
}

const MP3_BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Layer III only: the frame count of a Xing/Info tag, else a constant-bitrate estimate. */
function mp3Duration(b: Uint8Array): number | null {
  let start = 0;
  if (tag(b, 0).startsWith('ID3') && b.length >= 10) {
    start = 10 + (((b[6] ?? 0) & 0x7f) << 21 | ((b[7] ?? 0) & 0x7f) << 14 | ((b[8] ?? 0) & 0x7f) << 7 | ((b[9] ?? 0) & 0x7f));
    if ((b[5] ?? 0) & 0x10) start += 10;
  }
  const limit = Math.min(b.length - 4, start + 65536);
  for (let i = start; i < limit; i++) {
    if (b[i] !== 0xff || ((b[i + 1] ?? 0) & 0xe0) !== 0xe0) continue;
    const h1 = b[i + 1] ?? 0;
    const h2 = b[i + 2] ?? 0;
    const h3 = b[i + 3] ?? 0;
    const version = (h1 >> 3) & 3;
    const layer = (h1 >> 1) & 3;
    const bitrateIndex = h2 >> 4;
    const rateIndex = (h2 >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue;
    const bitrate = (version === 3 ? MP3_BITRATES_V1 : MP3_BITRATES_V2)[bitrateIndex]! * 1000;
    const rate = MP3_RATES[version]![rateIndex]!;
    const samplesPerFrame = version === 3 ? 1152 : 576;
    const mono = h3 >> 6 === 3;
    const side = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
    const tagAt = i + 4 + ((h1 & 1) === 0 ? 2 : 0) + side;
    const name = tag(b, tagAt);
    if (name === 'Xing' || name === 'Info') {
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (tagAt + 12 <= b.length && (view.getUint32(tagAt + 4) & 1) !== 0) {
        const frames = view.getUint32(tagAt + 8);
        if (frames > 0) return (frames * samplesPerFrame) / rate;
      }
    }
    return ((b.length - i) * 8) / bitrate;
  }
  return null;
}

/**
 * Length in seconds announced by the file itself, or null when the format
 * does not say (or the header is unusable). Never throws.
 */
export function probeDuration(bytes: Uint8Array, format: AudioFormat | null): number | null {
  try {
    switch (format) {
      case 'wav':
        return wavDuration(bytes);
      case 'aiff':
        return aiffDuration(bytes);
      case 'flac':
        return flacDuration(bytes);
      case 'm4a':
        return mp4Duration(bytes);
      case 'mp3':
        return mp3Duration(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
