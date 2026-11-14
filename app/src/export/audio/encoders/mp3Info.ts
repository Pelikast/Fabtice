// The « Info » frame at the start of an mp3 file (the Xing/LAME header of a
// constant-rate file). The encoder writes none, and without it a player cannot
// know the 576 samples of silence the encoder put in front, nor how much of the
// last frame is padding: the file would play 23 ms late and a few tens of
// milliseconds too long. With it, players that read it (the Mac's, ffmpeg and
// so Chromium's) cut exactly, and the length shown is the piece's.
//
// Layout (MPEG-1 layer III, no CRC, 48 kHz): a normal frame header, a side
// information block of zeros (32 bytes in stereo, 17 in mono), then « Info »,
// the flags (frames, bytes, table of contents, quality: all present), the
// number of frames, the bytes, a table of contents of zeros, the quality, and
// the 36 bytes of the LAME tag: version, method, delay and padding, length,
// CRC. The frame is as long as the stream's other frames, so it is one more
// frame for any decoder.

/** Samples the encoder puts before the first one (LAME). */
export const ENCODER_DELAY = 576;
/** Samples per frame, MPEG-1 layer III. */
export const FRAME_SAMPLES = 1152;

/** Bytes of a constant-rate frame at 48 kHz (no padding bit at this rate and these rates). */
export function frameBytes(kbps: number, sampleRate: number): number {
  return Math.floor((144 * kbps * 1000) / sampleRate);
}

const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const RATE_INDEX: Record<number, number> = { 44100: 0, 48000: 1, 32000: 2 };

/** CRC-16 as the LAME tag uses it (polynomial 0x8005, start 0, bits not reflected). */
export function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export interface InfoParams {
  kbps: number;
  sampleRate: number;
  channels: 1 | 2;
  /** Audio frames that follow (the Info frame itself is not counted). */
  audioFrames: number;
  /** Samples per channel the file was given. */
  samples: number;
}

/** The Info frame: as many bytes as a frame of the stream. */
export function mp3InfoFrame(p: InfoParams): Uint8Array<ArrayBuffer> {
  const size = frameBytes(p.kbps, p.sampleRate);
  const frame = new Uint8Array(size);
  const rate = RATE_INDEX[p.sampleRate];
  const bitrate = BITRATES.indexOf(p.kbps);
  if (rate === undefined || bitrate < 1) throw new Error('unsupported mp3 rate');
  frame.set([0xff, 0xfb, (bitrate << 4) | (rate << 2), p.channels === 1 ? 0xc0 : 0x40], 0);
  const at = 4 + (p.channels === 1 ? 17 : 32);
  const v = new DataView(frame.buffer);
  frame.set([0x49, 0x6e, 0x66, 0x6f], at); // « Info »: a constant-rate file (« Xing » would say variable)
  v.setUint32(at + 4, 0x0f, false); // frames, bytes, table of contents, quality
  v.setUint32(at + 8, p.audioFrames, false);
  v.setUint32(at + 12, size * (p.audioFrames + 1), false);
  v.setUint32(at + 116, 0, false); // quality
  const tag = at + 120;
  frame.set([...'LAME3.100'].map((c) => c.charCodeAt(0)), tag);
  frame[tag + 9] = 0x01; // tag revision 0, method 1: constant bit rate
  const padding = Math.max(0, p.audioFrames * FRAME_SAMPLES - p.samples - ENCODER_DELAY);
  frame[tag + 21] = (ENCODER_DELAY >> 4) & 0xff;
  frame[tag + 22] = ((ENCODER_DELAY & 15) << 4) | ((padding >> 8) & 15);
  frame[tag + 23] = padding & 255;
  v.setUint32(tag + 28, size * (p.audioFrames + 1), false); // length of the music
  v.setUint16(tag + 34, crc16(frame.subarray(0, tag + 34)), false);
  return frame;
}
