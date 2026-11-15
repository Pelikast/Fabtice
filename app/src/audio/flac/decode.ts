// A small FLAC decoder, in TypeScript, for the files Fabtice writes itself
// (projects `.fab`, lot 4): 16-bit, one or two channels, any sample rate,
// every kind of subframe libFLAC writes (constant, verbatim, fixed, LPC, with
// wasted bits, both Rice codings and their escapes), every stereo
// decorrelation. Not handled (refused): more than two channels, more than 24
// bits per sample.
//
// Why not libFLAC's own decoder: the WebAssembly build the app ships for the
// export (`@audio/encode-flac`) does contain it, but driving it means passing
// JavaScript callbacks into WebAssembly (`addFunction`) and copying every
// frame out of its heap; this decoder is short, runs the same in a page, a
// worker and the unit tests, and writes straight into the app's 16-bit blocks.
//
// Streaming: bytes are pushed in slices of any size (`push`); every complete
// frame is decoded at once and handed over (`onFrame`), so a whole track is
// never held twice. `end()` says that no more bytes will come.

export class FlacError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlacError';
  }
}

export interface FlacInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Frames per channel (0 when the header does not say). */
  totalFrames: number;
}

/** Thrown inside the decoder when a frame is not complete yet: the frame is tried again with more bytes. */
class NeedMore extends Error {}
const NEED_MORE = new NeedMore();

class BitReader {
  bytes: Uint8Array = new Uint8Array(0);
  pos = 0; // byte position of the next unread byte not in `cache`
  cache = 0; // up to 32 bits, left-aligned in a 32-bit word (as an unsigned number)
  bits = 0; // valid bits in cache

  reset(bytes: Uint8Array, pos: number): void {
    this.bytes = bytes;
    this.pos = pos;
    this.cache = 0;
    this.bits = 0;
  }

  /** Byte position of the next bit when on a byte boundary. */
  bytePos(): number {
    return this.pos - (this.bits >>> 3);
  }

  private fill(): void {
    while (this.bits <= 24) {
      if (this.pos >= this.bytes.length) {
        if (this.bits > 0) return;
        throw NEED_MORE;
      }
      this.cache = (this.cache | (this.bytes[this.pos++]! << (24 - this.bits))) >>> 0;
      this.bits += 8;
    }
  }

  /** `n` bits (0…32) as an unsigned number. */
  read(n: number): number {
    if (n === 0) return 0;
    if (n > 24) {
      const hi = this.read(n - 16);
      return hi * 65536 + this.read(16);
    }
    if (this.bits < n) {
      this.fill();
      if (this.bits < n) throw NEED_MORE;
    }
    const v = this.cache >>> (32 - n);
    this.cache = (this.cache << n) >>> 0;
    this.bits -= n;
    return v;
  }

  readSigned(n: number): number {
    if (n === 0) return 0;
    const v = this.read(n);
    return v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }

  /** Number of 0 bits before the next 1 (consumed). */
  unary(): number {
    let count = 0;
    for (;;) {
      if (this.bits === 0) this.fill();
      if (this.cache === 0) {
        count += this.bits;
        this.bits = 0;
        this.cache = 0;
        continue;
      }
      const z = Math.clz32(this.cache);
      if (z >= this.bits) {
        count += this.bits;
        this.bits = 0;
        this.cache = 0;
        continue;
      }
      count += z;
      this.cache = (this.cache << (z + 1)) >>> 0;
      this.bits -= z + 1;
      return count;
    }
  }

  /**
   * `count` Rice-coded values of parameter `k` into `out` from `at`: the hot loop of the decoder, with the
   * bit cache in local variables (several times faster than going through `unary` and `read`).
   */
  rice(out: Int32Array, at: number, count: number, k: number): void {
    const bytes = this.bytes;
    const end = bytes.length;
    let pos = this.pos;
    let cache = this.cache;
    let bits = this.bits;
    for (let j = 0; j < count; j++) {
      // Unary part: zeros up to a one.
      let q = 0;
      for (;;) {
        if (bits === 0 || cache === 0) {
          q += bits;
          if (pos >= end) throw NEED_MORE;
          cache = bytes[pos++]! << 24;
          bits = 8;
          while (bits <= 24 && pos < end) {
            cache |= bytes[pos++]! << (24 - bits);
            bits += 8;
          }
          cache >>>= 0;
          continue;
        }
        const z = Math.clz32(cache);
        if (z >= bits) {
          q += bits;
          bits = 0;
          cache = 0;
          continue;
        }
        q += z;
        cache = (cache << (z + 1)) >>> 0;
        bits -= z + 1;
        break;
      }
      // Binary part: k bits.
      let low = 0;
      if (k) {
        if (bits < k) {
          while (bits <= 24 && pos < end) {
            cache = (cache | (bytes[pos++]! << (24 - bits))) >>> 0;
            bits += 8;
          }
          if (bits < k) throw NEED_MORE;
        }
        low = cache >>> (32 - k);
        cache = (cache << k) >>> 0;
        bits -= k;
      }
      const u = q * (1 << k) + low;
      out[at + j] = u & 1 ? -((u + 1) / 2) : u / 2;
    }
    this.pos = pos;
    this.cache = cache;
    this.bits = bits;
  }

  alignToByte(): void {
    const drop = this.bits & 7;
    this.cache = (this.cache << drop) >>> 0;
    this.bits -= drop;
  }
}

const BLOCK_SIZES = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
const RATES = [0, 88200, 176400, 192000, 8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const SIZES = [0, 8, 12, 0, 16, 20, 24, 32];

export class FlacDecoder {
  info: FlacInfo | null = null;
  private buf = new Uint8Array(0);
  private len = 0;
  private start = 0;
  private headerDone = false;
  private readonly br = new BitReader();
  private ended = false;
  /** Frames delivered so far (per channel). */
  decoded = 0;

  constructor(private readonly onFrame: (channels: Int32Array[], frames: number) => void) {}

  /** More bytes of the file. Decodes every frame now complete. */
  push(bytes: Uint8Array): void {
    if (this.ended) throw new FlacError('bytes after the end');
    // Keep the unread tail, append the new bytes.
    const tail = this.len - this.start;
    if (tail + bytes.length > this.buf.length) {
      const next = new Uint8Array(Math.max(tail + bytes.length, this.buf.length * 2, 1 << 16));
      next.set(this.buf.subarray(this.start, this.len));
      this.buf = next;
    } else if (this.start > 0) {
      this.buf.copyWithin(0, this.start, this.len);
    }
    this.len = tail;
    this.start = 0;
    this.buf.set(bytes, this.len);
    this.len += bytes.length;
    this.run(false);
  }

  /** No more bytes: decodes what remains; throws when the stream stops in the middle of something. */
  end(): void {
    this.ended = true;
    this.run(true);
    if (!this.headerDone) throw new FlacError('no FLAC header');
    if (this.start < this.len) throw new FlacError('file cut short in a frame');
    if (this.info && this.info.totalFrames > 0 && this.decoded !== this.info.totalFrames) {
      throw new FlacError(`${this.decoded} frames decoded, ${this.info.totalFrames} announced`);
    }
  }

  private run(final: boolean): void {
    const view = this.buf.subarray(0, this.len);
    for (;;) {
      if (this.start >= this.len) return;
      this.br.reset(view, this.start);
      try {
        if (!this.headerDone) this.readHeader();
        else this.readFrame();
        this.start = this.br.bytePos();
      } catch (e) {
        if (e === NEED_MORE) {
          if (final) throw new FlacError('file cut short');
          return;
        }
        throw e;
      }
    }
  }

  private readHeader(): void {
    const br = this.br;
    if (br.read(32) !== 0x664c6143) throw new FlacError('not a FLAC stream');
    let last = false;
    while (!last) {
      last = br.read(1) === 1;
      const type = br.read(7);
      const length = br.read(24);
      if (type === 0) {
        br.read(16); // min block size
        br.read(16); // max block size
        br.read(24); // min frame size
        br.read(24); // max frame size
        const sampleRate = br.read(20);
        const channels = br.read(3) + 1;
        const bitsPerSample = br.read(5) + 1;
        const totalFrames = br.read(36);
        for (let i = 0; i < 16; i++) br.read(8); // MD5
        if (channels > 2) throw new FlacError(`${channels} channels`);
        if (bitsPerSample > 24) throw new FlacError(`${bitsPerSample} bits`);
        this.info = { sampleRate, channels, bitsPerSample, totalFrames };
      } else {
        for (let i = 0; i < length; i++) br.read(8);
      }
    }
    if (!this.info) throw new FlacError('no STREAMINFO');
    this.headerDone = true;
  }

  private readFrame(): void {
    const br = this.br;
    const info = this.info!;
    const sync = br.read(14);
    if (sync !== 0x3ffe) throw new FlacError('lost frame sync');
    br.read(1); // reserved
    br.read(1); // blocking strategy
    const bsCode = br.read(4);
    const srCode = br.read(4);
    const chCode = br.read(4);
    const ssCode = br.read(3);
    br.read(1);
    // UTF-8-like coded frame or sample number.
    let first = br.read(8);
    let extra = 0;
    while (first & 0x80) {
      first = (first << 1) & 0xff;
      extra++;
    }
    for (let i = 1; i < extra; i++) br.read(8);
    let blockSize = BLOCK_SIZES[bsCode]!;
    if (bsCode === 6) blockSize = br.read(8) + 1;
    else if (bsCode === 7) blockSize = br.read(16) + 1;
    if (blockSize === 0) throw new FlacError('reserved block size');
    if (srCode === 12) br.read(8);
    else if (srCode === 13 || srCode === 14) br.read(16);
    else if (srCode === 15) throw new FlacError('invalid sample rate code');
    else if (srCode !== 0 && RATES[srCode] !== info.sampleRate) throw new FlacError('sample rate changes');
    br.read(8); // CRC-8 of the header
    const bps = ssCode === 0 ? info.bitsPerSample : SIZES[ssCode]!;
    if (!bps) throw new FlacError('reserved sample size');
    let channels: number;
    let mode = 0; // 0 independent, 1 left/side, 2 right/side, 3 mid/side
    if (chCode < 8) channels = chCode + 1;
    else if (chCode <= 10) {
      channels = 2;
      mode = chCode - 7;
    } else throw new FlacError('reserved channel assignment');
    if (channels !== info.channels) throw new FlacError('channel count changes');
    const out: Int32Array[] = [];
    for (let c = 0; c < channels; c++) {
      // The side channel has one more bit.
      const sideBit = (mode === 1 && c === 1) || (mode === 2 && c === 0) || (mode === 3 && c === 1) ? 1 : 0;
      out.push(this.subframe(blockSize, bps + sideBit));
    }
    br.alignToByte();
    br.read(16); // CRC-16 of the frame (the archive's CRC covers the bytes)
    if (mode === 1) {
      const [l, s] = out as [Int32Array, Int32Array];
      for (let i = 0; i < blockSize; i++) s[i] = l[i]! - s[i]!;
    } else if (mode === 2) {
      const [s, r] = out as [Int32Array, Int32Array];
      for (let i = 0; i < blockSize; i++) s[i] = s[i]! + r[i]!;
    } else if (mode === 3) {
      const [m, s] = out as [Int32Array, Int32Array];
      for (let i = 0; i < blockSize; i++) {
        const side = s[i]!;
        const mid = (m[i]! * 2) | (side & 1);
        m[i] = (mid + side) >> 1;
        s[i] = (mid - side) >> 1;
      }
    }
    this.decoded += blockSize;
    this.onFrame(out, blockSize);
  }

  private subframe(n: number, bps: number): Int32Array {
    const br = this.br;
    if (br.read(1) !== 0) throw new FlacError('bad subframe padding');
    const type = br.read(6);
    let wasted = 0;
    if (br.read(1) === 1) wasted = br.unary() + 1;
    const b = bps - wasted;
    const out = new Int32Array(n);
    if (type === 0) {
      out.fill(br.readSigned(b));
    } else if (type === 1) {
      for (let i = 0; i < n; i++) out[i] = br.readSigned(b);
    } else if (type >= 8 && type <= 12) {
      const order = type - 8;
      for (let i = 0; i < order; i++) out[i] = br.readSigned(b);
      this.residual(out, order, n);
      fixedRestore(out, order, n);
    } else if (type >= 32) {
      const order = type - 31;
      for (let i = 0; i < order; i++) out[i] = br.readSigned(b);
      const precision = br.read(4) + 1;
      if (precision === 16) throw new FlacError('invalid LPC precision');
      const shift = br.readSigned(5);
      const coefs = new Int32Array(order);
      for (let i = 0; i < order; i++) coefs[i] = br.readSigned(precision);
      this.residual(out, order, n);
      lpcRestore(out, coefs, order, shift, n);
    } else {
      throw new FlacError(`reserved subframe type ${type}`);
    }
    if (wasted) for (let i = 0; i < n; i++) out[i] = out[i]! << wasted;
    return out;
  }

  private residual(out: Int32Array, order: number, n: number): void {
    const br = this.br;
    const method = br.read(2);
    if (method > 1) throw new FlacError('reserved residual coding');
    const paramBits = method === 0 ? 4 : 5;
    const escape = method === 0 ? 15 : 31;
    const partitionOrder = br.read(4);
    const partitions = 1 << partitionOrder;
    const per = n >> partitionOrder;
    let i = order;
    for (let p = 0; p < partitions; p++) {
      const count = p === 0 ? per - order : per;
      const k = br.read(paramBits);
      if (k === escape) {
        const raw = br.read(5);
        for (let j = 0; j < count; j++) out[i++] = br.readSigned(raw);
      } else {
        br.rice(out, i, count, k);
        i += count;
      }
    }
  }
}

function fixedRestore(x: Int32Array, order: number, n: number): void {
  switch (order) {
    case 0:
      return;
    case 1:
      for (let i = 1; i < n; i++) x[i] = x[i]! + x[i - 1]!;
      return;
    case 2:
      for (let i = 2; i < n; i++) x[i] = x[i]! + 2 * x[i - 1]! - x[i - 2]!;
      return;
    case 3:
      for (let i = 3; i < n; i++) x[i] = x[i]! + 3 * x[i - 1]! - 3 * x[i - 2]! + x[i - 3]!;
      return;
    case 4:
      for (let i = 4; i < n; i++) x[i] = x[i]! + 4 * x[i - 1]! - 6 * x[i - 2]! + 4 * x[i - 3]! - x[i - 4]!;
      return;
  }
}

function lpcRestore(x: Int32Array, c: Int32Array, order: number, shift: number, n: number): void {
  // 16-bit audio and libFLAC's precisions keep every sum within 2^53: plain numbers are exact.
  // Dividing by a power of two is a multiplication by its exact inverse.
  const scale = 2 ** -shift;
  if (order === 8) {
    const [c0, c1, c2, c3, c4, c5, c6, c7] = c as unknown as number[];
    for (let i = 8; i < n; i++) {
      const sum = c0! * x[i - 1]! + c1! * x[i - 2]! + c2! * x[i - 3]! + c3! * x[i - 4]! + c4! * x[i - 5]! + c5! * x[i - 6]! + c6! * x[i - 7]! + c7! * x[i - 8]!;
      x[i] = x[i]! + Math.floor(sum * scale);
    }
    return;
  }
  for (let i = order; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < order; j++) sum += c[j]! * x[i - 1 - j]!;
    x[i] = x[i]! + Math.floor(sum * scale);
  }
}
