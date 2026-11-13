// AIFF and AIFF-C reader. Chromium does not decode AIFF (Safari does), so the
// import reads these files itself: uncompressed PCM at 8, 16, 24 or 32 bits
// (big-endian, or little-endian for the « sowt » flavour that Apple tools
// write) and 32/64-bit floats. Compressed AIFF-C (ima4, ulaw…) is refused.

export class AiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiffError';
  }
}

export interface AiffInfo {
  channels: number;
  /** Frames announced by the header (the data may be shorter in a truncated file). */
  frames: number;
  bitsPerSample: number;
  sampleRate: number;
  littleEndian: boolean;
  float: boolean;
  /** Offset and byte length of the sample data actually present. */
  dataOffset: number;
  dataLength: number;
}

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);

/** 80-bit IEEE extended float (the sample rate of an AIFF header), big-endian. */
function readExtended(view: DataView, at: number): number {
  const exponent = view.getUint16(at) & 0x7fff;
  const sign = view.getUint16(at) & 0x8000 ? -1 : 1;
  const mantissa = view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6);
  if (exponent === 0 && mantissa === 0) return 0;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

export function isAiff(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && tag(bytes, 0) === 'FORM' && (tag(bytes, 8) === 'AIFF' || tag(bytes, 8) === 'AIFC');
}

/** Reads the header chunks. Throws `AiffError` on anything it cannot play. */
export function parseAiff(bytes: Uint8Array): AiffInfo {
  if (!isAiff(bytes)) throw new AiffError('not an AIFF file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isAifc = tag(bytes, 8) === 'AIFC';
  let comm: Omit<AiffInfo, 'dataOffset' | 'dataLength'> | null = null;
  let data: { offset: number; length: number } | null = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = tag(bytes, pos);
    const size = view.getUint32(pos + 4);
    const body = pos + 8;
    if (id === 'COMM') {
      if (body + 18 > bytes.length) throw new AiffError('truncated COMM chunk');
      let compression = 'NONE';
      if (isAifc) {
        if (body + 22 > bytes.length) throw new AiffError('truncated COMM chunk');
        compression = tag(bytes, body + 18);
      }
      const float = compression === 'fl32' || compression === 'FL32' || compression === 'fl64' || compression === 'FL64';
      if (!['NONE', 'twos', 'sowt', 'in24', 'in32'].includes(compression) && !float) {
        throw new AiffError(`unsupported AIFF-C compression ${compression}`);
      }
      comm = {
        channels: view.getUint16(body),
        frames: view.getUint32(body + 2),
        bitsPerSample: float ? (compression.toLowerCase() === 'fl64' ? 64 : 32) : view.getUint16(body + 6),
        sampleRate: Math.round(readExtended(view, body + 8)),
        littleEndian: compression === 'sowt',
        float,
      };
    } else if (id === 'SSND') {
      if (body + 8 > bytes.length) throw new AiffError('truncated SSND chunk');
      const skip = view.getUint32(body);
      const start = body + 8 + skip;
      const end = Math.min(bytes.length, body + size);
      data = { offset: Math.min(start, bytes.length), length: Math.max(0, end - start) };
    }
    pos = body + size + (size & 1);
  }
  if (!comm) throw new AiffError('no COMM chunk');
  if (!data) throw new AiffError('no SSND chunk');
  if (comm.channels < 1 || comm.channels > 32) throw new AiffError(`unsupported channel count ${comm.channels}`);
  if (!(comm.sampleRate >= 1000 && comm.sampleRate <= 768000)) throw new AiffError(`unsupported sample rate ${comm.sampleRate}`);
  if (comm.float ? ![32, 64].includes(comm.bitsPerSample) : comm.bitsPerSample < 1 || comm.bitsPerSample > 32) {
    throw new AiffError(`unsupported sample size ${comm.bitsPerSample}`);
  }
  return { ...comm, dataOffset: data.offset, dataLength: data.length };
}

/** Duration announced by the header, in seconds. */
export function aiffDuration(bytes: Uint8Array): number {
  const info = parseAiff(bytes);
  return info.frames / info.sampleRate;
}

export interface PcmAudio {
  channels: Float32Array[];
  sampleRate: number;
}

/** Decodes the samples to one Float32Array per channel, at the file's own rate. */
export function decodeAiff(bytes: Uint8Array): PcmAudio {
  const info = parseAiff(bytes);
  const bytesPerSample = Math.ceil(info.bitsPerSample / 8);
  const frameBytes = bytesPerSample * info.channels;
  const frames = Math.min(info.frames, Math.floor(info.dataLength / frameBytes));
  const view = new DataView(bytes.buffer, bytes.byteOffset + info.dataOffset, frames * frameBytes);
  const little = info.littleEndian;
  const channels = Array.from({ length: info.channels }, () => new Float32Array(frames));

  let read: (at: number) => number;
  if (info.float) {
    read = info.bitsPerSample === 64 ? (at) => view.getFloat64(at, little) : (at) => view.getFloat32(at, little);
  } else if (bytesPerSample === 1) {
    read = (at) => view.getInt8(at) / 128;
  } else if (bytesPerSample === 2) {
    read = (at) => view.getInt16(at, little) / 32768;
  } else if (bytesPerSample === 3) {
    read = little
      ? (at) => (((view.getUint8(at + 2) << 24) | (view.getUint8(at + 1) << 16) | (view.getUint8(at) << 8)) >> 8) / 8388608
      : (at) => (((view.getUint8(at) << 24) | (view.getUint8(at + 1) << 16) | (view.getUint8(at + 2) << 8)) >> 8) / 8388608;
  } else {
    read = (at) => view.getInt32(at, little) / 2147483648;
  }

  for (let c = 0; c < info.channels; c++) {
    const out = channels[c]!;
    let at = c * bytesPerSample;
    for (let i = 0; i < frames; i++, at += frameBytes) {
      const v = read(at);
      out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
  return { channels, sampleRate: info.sampleRate };
}
