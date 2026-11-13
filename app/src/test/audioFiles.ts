// Builders of tiny audio files for the unit tests (no audio dependency).

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function concat(parts: (number[] | Uint8Array)[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u16be = (n: number) => [(n >>> 8) & 255, n & 255];
const u16le = (n: number) => [n & 255, (n >>> 8) & 255];

/** 80-bit extended float of a positive integer. */
export function extended80(value: number): number[] {
  if (value === 0) return new Array<number>(10).fill(0);
  const exponent = Math.floor(Math.log2(value));
  const mantissa = BigInt(Math.round(value * 2 ** (63 - exponent)));
  const bytes = [];
  for (let shift = 56n; shift >= 0n; shift -= 8n) bytes.push(Number((mantissa >> shift) & 255n));
  return [...u16be(16383 + exponent), ...bytes];
}

export interface AiffSpec {
  channels: number;
  sampleRate: number;
  bits: 8 | 16 | 24 | 32;
  /** Samples per channel as −1…1 floats. */
  samples: number[][];
  /** AIFF-C flavours; omitted writes plain AIFF. */
  compression?: 'NONE' | 'sowt' | 'twos' | 'fl32' | 'ima4';
  /** Cuts this many bytes off the end of the sample data (a truncated file). */
  truncateBytes?: number;
}

export function makeAiff(spec: AiffSpec): Uint8Array {
  const { channels, sampleRate, bits, samples, compression } = spec;
  const frames = samples[0]!.length;
  const little = compression === 'sowt';
  const isFloat = compression === 'fl32';
  const bytesPer = isFloat ? 4 : bits / 8;
  const data: number[] = [];
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, samples[c]![i]!));
      if (isFloat) {
        const f = new DataView(new ArrayBuffer(4));
        f.setFloat32(0, v);
        data.push(f.getUint8(0), f.getUint8(1), f.getUint8(2), f.getUint8(3));
        continue;
      }
      const scale = 2 ** (bits - 1);
      const n = Math.max(-scale, Math.min(scale - 1, Math.round(v * scale)));
      const unsigned = n < 0 ? n + 2 ** bits : n;
      const bytes: number[] = [];
      for (let b = bytesPer - 1; b >= 0; b--) bytes.push(Math.floor(unsigned / 2 ** (8 * b)) & 255);
      data.push(...(little ? bytes.reverse() : bytes));
    }
  }
  const isAifc = compression !== undefined;
  const comm = [
    ...u16be(channels),
    ...u32be(frames),
    ...u16be(isFloat ? 32 : bits),
    ...extended80(sampleRate),
    ...(isAifc ? [...enc(compression!), 4, ...enc('none'), 0] : []),
  ];
  const ssnd = [...u32be(0), ...u32be(0), ...data];
  const body = [
    ...enc(isAifc ? 'AIFC' : 'AIFF'),
    ...enc('COMM'),
    ...u32be(comm.length),
    ...comm,
    ...enc('SSND'),
    ...u32be(ssnd.length),
    ...ssnd,
  ];
  const file = concat([enc('FORM'), u32be(body.length), body]);
  return spec.truncateBytes ? file.slice(0, file.length - spec.truncateBytes) : file;
}

/** 16-bit PCM WAV. */
export function makeWav(channels: number, sampleRate: number, samples: number[][], options: { dataSizeOverride?: number } = {}): Uint8Array {
  const frames = samples[0]!.length;
  const data: number[] = [];
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const n = Math.max(-32768, Math.min(32767, Math.round(samples[c]![i]! * 32768)));
      data.push(...u16le(n < 0 ? n + 65536 : n));
    }
  }
  const dataSize = options.dataSizeOverride ?? data.length;
  return concat([
    enc('RIFF'),
    u32le(36 + data.length),
    enc('WAVE'),
    enc('fmt '),
    u32le(16),
    u16le(1),
    u16le(channels),
    u32le(sampleRate),
    u32le(sampleRate * channels * 2),
    u16le(channels * 2),
    u16le(16),
    enc('data'),
    u32le(dataSize),
    data,
  ]);
}

/** A FLAC file prefix: marker and STREAMINFO only (enough to read the length). */
export function makeFlacHeader(sampleRate: number, totalSamples: number): Uint8Array {
  const info = new Uint8Array(34);
  info[10] = (sampleRate >> 12) & 255;
  info[11] = (sampleRate >> 4) & 255;
  info[12] = ((sampleRate & 15) << 4) | (0 << 1); // 1 channel, bps high bit 0
  info[13] = (15 << 4) | Math.floor(totalSamples / 2 ** 32);
  info.set(u32be(totalSamples >>> 0), 14);
  return concat([enc('fLaC'), [0x80, 0, 0, 34], info]);
}

/** An MP4 file prefix: ftyp and a moov holding an mvhd (version 0) with the given length. */
export function makeMp4Header(timescale: number, duration: number): Uint8Array {
  const mvhd = [...u32be(0), ...u32be(0), ...u32be(0), ...u32be(timescale), ...u32be(duration), ...new Array<number>(80).fill(0)];
  const mvhdBox = [...u32be(8 + mvhd.length), ...enc('mvhd'), ...mvhd];
  const moov = [...u32be(8 + mvhdBox.length), ...enc('moov'), ...mvhdBox];
  const ftyp = [...u32be(16), ...enc('ftyp'), ...enc('M4A '), ...u32be(0)];
  return concat([ftyp, moov]);
}

/** Constant-bitrate MPEG-1 Layer III frames (mono, 44.1 kHz, 128 kbps): silence, optional ID3v2 tag in front. */
export function makeMp3(seconds: number, options: { id3?: boolean; xingFrames?: number } = {}): Uint8Array {
  const frameLength = Math.floor((144 * 128000) / 44100); // 417 bytes
  const frames = Math.ceil((seconds * 44100) / 1152);
  const parts: (number[] | Uint8Array)[] = [];
  if (options.id3) parts.push([...enc('ID3'), 3, 0, 0, 0, 0, 0, 10], new Array<number>(10).fill(0));
  for (let i = 0; i < frames; i++) {
    const frame = new Uint8Array(frameLength);
    frame.set([0xff, 0xfb, 0x90, 0xc0]); // MPEG-1, layer III, no CRC, 128 kbps, 44.1 kHz, mono
    if (i === 0 && options.xingFrames !== undefined) {
      frame.set(enc('Info'), 4 + 17);
      frame.set(u32be(1), 4 + 17 + 4);
      frame.set(u32be(options.xingFrames), 4 + 17 + 8);
    }
    parts.push(frame);
  }
  return concat(parts);
}

export function sine(frequency: number, sampleRate: number, seconds: number, amplitude = 0.5): number[] {
  const n = Math.round(seconds * sampleRate);
  return Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
