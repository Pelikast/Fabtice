// Signalsmith Stretch (WebAssembly) behind a small stereo interface, usable
// in the AudioWorklet and in Node (tests). The binary is
// `../wasm/signalsmith-nosimd.wasm`; see `../wasm/SOURCES.md`.
//
// One instance per track. `process()` turns `nIn` input frames into exactly
// `nOut` output frames ("exact" engine): the playback rate is the ratio
// between the two, so every track consumes the same source span per quantum
// and stays aligned by construction.

export interface Stretcher {
  /** Transposition in semitones (cents included); the tempo is set by the caller through nIn/nOut. */
  setParams(semitones: number): void;
  reset(): void;
  /** Writes exactly `nOut` frames to outL/outR. */
  process(inL: Float32Array, inR: Float32Array, nIn: number, outL: Float32Array, outR: Float32Array, nOut: number): void;
  /** Feeds audio that precedes the new playback position, without output. */
  seek(inL: Float32Array, inR: Float32Array, n: number, rate: number): void;
  readonly seekLength: number;
  destroy(): void;
}

export interface StretchFactory {
  create(): Stretcher;
  readonly memoryBytes: number;
  readonly sampleRate: number;
}

interface Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  fe_create(sr: number, ch: number, variant: number): number;
  fe_destroy(p: number): void;
  fe_cap(): number;
  fe_in(p: number): number;
  fe_out(p: number): number;
  fe_reset(p: number): void;
  fe_set(p: number, semitones: number, rate: number, formant: number): void;
  fe_process(p: number, nIn: number, nOut: number): number;
  fe_seek(p: number, nIn: number, rate: number): void;
  fe_seek_len(p: number): number;
}

/** Minimal WASI: the module only needs a few stubs (no files, no clock use). */
function wasiImports(module: WebAssembly.Module, getMemory: () => WebAssembly.Memory): WebAssembly.Imports {
  const stub: Record<string, (...a: number[]) => number> = {
    fd_write: (_fd, iovs, n, outp) => {
      const dv = new DataView(getMemory().buffer);
      let total = 0;
      for (let i = 0; i < n; i++) total += dv.getUint32(iovs! + i * 8 + 4, true);
      dv.setUint32(outp!, total, true);
      return 0;
    },
    fd_close: () => 0,
    fd_seek: () => 70, // ESPIPE
    fd_read: () => 8,
    fd_fdstat_get: () => 8, // EBADF
    environ_sizes_get: (a, b) => {
      const dv = new DataView(getMemory().buffer);
      dv.setUint32(a!, 0, true);
      dv.setUint32(b!, 0, true);
      return 0;
    },
    environ_get: () => 0,
    clock_time_get: (_id, _prec, outp) => {
      new DataView(getMemory().buffer).setBigUint64(outp!, BigInt(Math.round(Date.now() * 1e6)), true);
      return 0;
    },
    random_get: (ptr, len) => {
      const u8 = new Uint8Array(getMemory().buffer, ptr, len);
      for (let i = 0; i < len; i++) u8[i] = (Math.random() * 256) | 0;
      return 0;
    },
    proc_exit: (code) => {
      throw new Error(`wasm proc_exit ${code}`);
    },
  };
  const wasi: Record<string, (...a: number[]) => number> = {};
  for (const imp of WebAssembly.Module.imports(module)) wasi[imp.name] = stub[imp.name] ?? (() => 52); // ENOSYS
  return { wasi_snapshot_preview1: wasi };
}

export class SignalsmithEngine implements StretchFactory {
  private heapBuffer: ArrayBufferLike | null = null;
  private heapF32: Float32Array | null = null;
  private readonly cap: number;

  private constructor(
    private readonly x: Exports,
    readonly sampleRate: number,
  ) {
    this.cap = x.fe_cap();
  }

  /** Compiles and instantiates the module. `source` is the binary or an already compiled module. */
  static async load(source: ArrayBuffer | Uint8Array | WebAssembly.Module, sampleRate: number): Promise<SignalsmithEngine> {
    const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source as BufferSource);
    let mem: WebAssembly.Memory | null = null;
    const inst = await WebAssembly.instantiate(module, wasiImports(module, () => mem!));
    const exports = inst.exports as unknown as Exports;
    mem = exports.memory;
    exports._initialize?.();
    return new SignalsmithEngine(exports, sampleRate);
  }

  /** Float view of the wasm heap, refreshed when the memory grew. */
  heap(): Float32Array {
    const b = this.x.memory.buffer;
    if (b !== this.heapBuffer) {
      this.heapBuffer = b;
      this.heapF32 = new Float32Array(b);
    }
    return this.heapF32!;
  }

  create(): Stretcher {
    return new SignalsmithStretcher(this, this.x, this.cap);
  }

  get memoryBytes(): number {
    return this.x.memory.buffer.byteLength;
  }
}

class SignalsmithStretcher implements Stretcher {
  private p: number;
  private readonly inIdx: number;
  private readonly outIdx: number;
  private lastSemi = NaN;

  constructor(
    private readonly e: SignalsmithEngine,
    private readonly x: Exports,
    private readonly cap: number,
  ) {
    this.p = x.fe_create(e.sampleRate, 2, 0);
    this.inIdx = x.fe_in(this.p) >> 2;
    this.outIdx = x.fe_out(this.p) >> 2;
  }

  setParams(semitones: number): void {
    if (semitones === this.lastSemi) return;
    this.lastSemi = semitones;
    this.x.fe_set(this.p, semitones, 1, 0);
  }

  // Parameters survive a reset; call setParams() first so the start delay matches them.
  reset(): void {
    this.x.fe_reset(this.p);
  }

  process(inL: Float32Array, inR: Float32Array, nIn: number, outL: Float32Array, outR: Float32Array, nOut: number): void {
    let h = this.e.heap();
    h.set(inL.subarray(0, nIn), this.inIdx);
    h.set(inR.subarray(0, nIn), this.inIdx + this.cap);
    this.x.fe_process(this.p, nIn, nOut);
    h = this.e.heap(); // the memory may have grown
    outL.set(h.subarray(this.outIdx, this.outIdx + nOut));
    outR.set(h.subarray(this.outIdx + this.cap, this.outIdx + this.cap + nOut));
  }

  seek(inL: Float32Array, inR: Float32Array, n: number, rate: number): void {
    const h = this.e.heap();
    h.set(inL.subarray(0, n), this.inIdx);
    h.set(inR.subarray(0, n), this.inIdx + this.cap);
    this.x.fe_seek(this.p, n, rate);
  }

  get seekLength(): number {
    return this.x.fe_seek_len(this.p);
  }

  destroy(): void {
    if (this.p) this.x.fe_destroy(this.p);
    this.p = 0;
  }
}

// ---------------------------------------------------------------- latency calibration

export interface LatencyModel {
  /** Output latency in frames at tempo ratio `rate`: a + b / rate. */
  a: number;
  b: number;
}

/**
 * Measures the stretcher delay model L_out(rate) = a + b / rate (output frames)
 * with a short tone burst entering at input frame P and whose envelope peak
 * leaves at output frame Q: L = Q - P / rate. Two rates give a (output-side
 * delay) and b (input-side delay, in input frames).
 */
export function calibrateLatency(factory: StretchFactory): LatencyModel {
  const sr = factory.sampleRate;
  const probe = (rate: number) => {
    const st = factory.create();
    st.setParams(0);
    st.reset();
    const P = Math.round(0.45 * sr);
    const total = Math.round((1.6 * sr) / Math.min(1, rate));
    const burstLen = Math.round(0.004 * sr);
    const inL = new Float32Array(256);
    const inR = new Float32Array(256);
    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    let acc = 0;
    let inPos = 0;
    let outPos = 0;
    const env: number[] = [];
    while (outPos < total) {
      acc += 128 * rate;
      const nIn = Math.floor(acc);
      acc -= nIn;
      for (let i = 0; i < nIn; i++) {
        const t = inPos + i - P;
        const s = t >= 0 && t < burstLen ? Math.sin((Math.PI * t) / burstLen) ** 2 * Math.sin((2 * Math.PI * 3000 * t) / sr) : 0;
        inL[i] = inR[i] = s;
      }
      inPos += nIn;
      st.process(inL, inR, nIn, outL, outR, 128);
      for (let i = 0; i < 128; i++) env.push(Math.abs(outL[i]!));
      outPos += 128;
    }
    // smoothed envelope (about 1 ms), then its peak
    const w = Math.max(1, Math.round(0.001 * sr));
    let run = 0;
    let bestV = 0;
    let bestQ = 0;
    for (let i = 0; i < env.length; i++) {
      run += env[i]!;
      if (i >= w) run -= env[i - w]!;
      if (run > bestV) {
        bestV = run;
        bestQ = i - w / 2;
      }
    }
    st.destroy();
    return { q: bestQ, P };
  };
  const r1 = probe(1);
  const r2 = probe(0.5);
  const L1 = r1.q - r1.P / 1;
  const L2 = r2.q - r2.P / 0.5;
  // L(rate) = a + b / rate  ->  L1 = a + b, L2 = a + 2 b
  return { a: 2 * L1 - L2, b: L2 - L1 };
}
