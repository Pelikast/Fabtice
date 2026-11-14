// Rubber Band R3 « finer » (WebAssembly) used OFFLINE: one `OfflineStretch`
// turns a stream of input blocks into the stretched, transposed output, and
// hands back exactly the frames the contract of `render/types.ts` asks for.
// No DOM, no worker globals: the render worker drives it, and so do the Node
// tests (real WebAssembly).
//
// The binary is the prototype's (`web/spikes/lecteur/engines/`, see
// `./SOURCES.md`): Rubber Band 4.0 behind a small C API (`fe_*`). That API is
// the real-time one (`OptionProcessRealTime`, `OptionEngineFiner`,
// `OptionPitchHighConsistency`), and it already does what an offline render
// needs: pitch scale, time ratio, formant option, and the alignment recipe of
// the Rubber Band documentation (feed the preferred start pad of silence, drop
// the start delay from the output). Offline use only adds the way it is
// driven here: no time limit, the end of the input is followed by silence
// until every wanted output frame has come out.
//
// Alignment: output frame k is source frame k * tempoRatio (the first output
// frame is the one Rubber Band produces for the first input frame, its own
// start delay already dropped by `fe_reset`). The tests measure it with click
// trains (see `stretcher.test.ts`).

import { wasiImports } from '../../audio/worklet/stretch';

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
}

/** Smallest module using a v128 instruction: validates only where WebAssembly SIMD is supported. */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export function hasWasmSimd(): boolean {
  try {
    return typeof WebAssembly !== 'undefined' && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

/** Input frames given to the wasm at a time (its C API holds 16 384 per call; the output FIFO 65 536 frames). */
const STEP = 2048;
/** Silence fed after the end of the input, per call, while waiting for the last output. */
const TAIL_STEP = 1024;
/** Never wait longer than this (seconds of silence) for the last output frames: a wrong build must not hang. */
const MAX_TAIL_SECONDS = 4;

export class RubberBandEngine {
  private heapBuffer: ArrayBufferLike | null = null;
  private heapF32: Float32Array | null = null;
  readonly cap: number;

  private constructor(readonly x: Exports) {
    this.cap = x.fe_cap();
  }

  /** Compiles and instantiates the module. `source` is the binary or an already compiled module. */
  static async load(source: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<RubberBandEngine> {
    const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source as BufferSource);
    let mem: WebAssembly.Memory | null = null;
    const inst = await WebAssembly.instantiate(module, wasiImports(module, () => mem!));
    const exports = inst.exports as unknown as Exports;
    mem = exports.memory;
    exports._initialize?.();
    return new RubberBandEngine(exports);
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

  get memoryBytes(): number {
    return this.x.memory.buffer.byteLength;
  }
}

export interface OfflineStretchOptions {
  sampleRate: number;
  /** 1 or 2: both channels go through ONE stretcher (the stereo image is kept). */
  channels: 1 | 2;
  /** Transposition in semitones, cents included. */
  semitones: number;
  /** Tempo as a ratio of the original (0.25…2): the output is `1 / tempoRatio` times as long. */
  tempoRatio: number;
  /** Keep the timbre (formants). */
  formants: boolean;
  /** Exactly how many output frames to produce. */
  outFrames: number;
  /** Raised-cosine fades on the output's first and last frames, in frames (0 = none): a range cut inside the audio. */
  fadeIn?: number;
  fadeOut?: number;
  /**
   * Measured lateness of the engine's output, in frames (see `measureDelay`): positive, the first `delay` output
   * frames are dropped; negative, `-delay` frames of silence are put in front. 0 = as the engine gives it.
   */
  delay?: number;
}

/** Receives output frames, in order; `r` is null for one channel. The arrays are reused: copy or consume at once. */
export type OutputSink = (l: Float32Array, r: Float32Array | null, n: number) => void;

export class OfflineStretch {
  private p: number;
  private readonly inIdx: number;
  private readonly outIdx: number;
  private readonly cap: number;
  private readonly ch: 1 | 2;
  private produced = 0;
  private readonly outL: Float32Array;
  private readonly outR: Float32Array | null;
  private readonly fadeIn: number;
  private readonly fadeOut: number;
  private destroyed = false;
  /** Raw engine frames still to drop (a late engine), and silent frames still to put first (an early one). */
  private skip: number;
  private lead: number;
  private readonly leadFrames: number;
  /** Frames of silence fed after the input; only a diagnostic for the tests. */
  tailFed = 0;

  constructor(
    private readonly engine: RubberBandEngine,
    private readonly o: OfflineStretchOptions,
    private readonly sink: OutputSink,
  ) {
    const x = engine.x;
    this.cap = engine.cap;
    this.ch = o.channels;
    this.p = x.fe_create(o.sampleRate, o.channels, 0);
    this.inIdx = x.fe_in(this.p) >> 2;
    this.outIdx = x.fe_out(this.p) >> 2;
    // Parameters first, then the reset: the start delay depends on them.
    x.fe_set(this.p, o.semitones, o.tempoRatio, o.formants ? 1 : 0);
    x.fe_reset(this.p);
    this.outL = new Float32Array(this.cap);
    this.outR = o.channels === 2 ? new Float32Array(this.cap) : null;
    this.fadeIn = Math.max(0, Math.min(o.fadeIn ?? 0, o.outFrames >> 1));
    this.fadeOut = Math.max(0, Math.min(o.fadeOut ?? 0, o.outFrames >> 1));
    const delay = Math.round(o.delay ?? 0);
    this.skip = Math.max(0, delay);
    this.lead = Math.max(0, -delay);
    this.leadFrames = this.lead;
  }

  /** Output frames delivered so far. */
  get done(): number {
    return this.produced;
  }

  /** Feeds `n` input frames (any number; `r` is ignored for one channel). */
  push(l: Float32Array, r: Float32Array | undefined, n: number): void {
    this.putLead();
    for (let off = 0; off < n && this.produced < this.o.outFrames; off += STEP) {
      const m = Math.min(STEP, n - off);
      this.feed(l.subarray(off, off + m), r ? r.subarray(off, off + m) : undefined, m);
    }
  }

  /** After the last input frame: silence until every wanted output frame has come out. */
  finish(): void {
    this.putLead();
    const limit = MAX_TAIL_SECONDS * this.o.sampleRate;
    const z = new Float32Array(TAIL_STEP);
    while (this.produced < this.o.outFrames && this.tailFed < limit) {
      this.feed(z, z, TAIL_STEP);
      this.tailFed += TAIL_STEP;
    }
    // A build that cannot deliver in time must not hang the render: pad with silence.
    if (this.produced < this.o.outFrames) {
      const zero = new Float32Array(Math.min(this.cap, this.o.outFrames - this.produced));
      while (this.produced < this.o.outFrames) {
        const n = Math.min(zero.length, this.o.outFrames - this.produced);
        this.emit(zero, this.ch === 2 ? zero : null, n);
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.p) this.engine.x.fe_destroy(this.p);
    this.p = 0;
  }

  private feed(l: Float32Array, r: Float32Array | undefined, n: number): void {
    const x = this.engine.x;
    let h = this.engine.heap();
    h.set(l.subarray(0, n), this.inIdx);
    if (this.ch === 2) h.set((r ?? l).subarray(0, n), this.inIdx + this.cap);
    let got = x.fe_process(this.p, n, this.cap);
    for (;;) {
      if (got > 0) {
        h = this.engine.heap(); // the memory may have grown
        this.outL.set(h.subarray(this.outIdx, this.outIdx + got));
        if (this.outR) this.outR.set(h.subarray(this.outIdx + this.cap, this.outIdx + this.cap + got));
        this.accept(this.outL, this.outR, got);
      }
      if (got < this.cap) break;
      got = x.fe_process(this.p, 0, this.cap); // more waiting in the FIFO
    }
  }

  /** Silence in front of the engine's output when it comes early. */
  private putLead(): void {
    if (this.lead <= 0) return;
    const zero = new Float32Array(Math.min(this.cap, this.lead));
    while (this.lead > 0) {
      const n = Math.min(zero.length, this.lead);
      this.lead -= n;
      this.emit(zero, this.ch === 2 ? zero : null, n);
    }
  }

  /** Frames from the engine, minus the ones a late engine must drop. */
  private accept(l: Float32Array, r: Float32Array | null, n: number): void {
    if (this.skip > 0) {
      const d = Math.min(this.skip, n);
      this.skip -= d;
      if (d === n) return;
      l.copyWithin(0, d, n);
      if (r) r.copyWithin(0, d, n);
      n -= d;
    }
    this.emit(l, r, n);
  }

  private emit(l: Float32Array, r: Float32Array | null, n: number): void {
    const want = this.o.outFrames - this.produced;
    const m = Math.min(n, want);
    if (m <= 0) return;
    const base = this.produced;
    // The fade-in starts where the sound does: after the silence put in front of an early engine.
    const f0 = this.leadFrames;
    if (this.fadeIn > 0 && base < f0 + this.fadeIn) {
      for (let i = 0; i < m && base + i < f0 + this.fadeIn; i++) {
        if (base + i < f0) continue;
        const g = 0.5 - 0.5 * Math.cos((Math.PI * (base + i - f0 + 0.5)) / this.fadeIn);
        l[i] = l[i]! * g;
        if (r && r !== l) r[i] = r[i]! * g;
      }
    }
    const fo = this.o.outFrames - this.fadeOut;
    if (this.fadeOut > 0 && base + m > fo) {
      for (let i = Math.max(0, fo - base); i < m; i++) {
        const g = 0.5 - 0.5 * Math.cos((Math.PI * (this.o.outFrames - (base + i) - 0.5)) / this.fadeOut);
        l[i] = l[i]! * g;
        if (r && r !== l) r[i] = r[i]! * g;
      }
    }
    this.produced += m;
    this.sink(l, r, m);
  }
}

/** The exact output length of a render: `round(frames / tempoRatio)`. */
export function outputFrames(inFrames: number, tempoRatio: number): number {
  return Math.round(inFrames / tempoRatio);
}

// ---------------------------------------------------------------- alignment

/**
 * The calibration signal: short noise clicks (a Hann-windowed noise burst of
 * about 1 ms, like the onset of a drum hit) at irregular times, so they fall
 * on different phases of the engine's hop grid.
 */
export const PROBE_CLICK_FRAMES = 48;
const PROBE_TIMES = Array.from({ length: 11 }, (_, i) => 0.35 + i * 0.2137);
const PROBE_SECONDS = 3;

/** A probe signal at `sampleRate` (the clicks start at `PROBE_TIMES`). */
export function probeSignal(sampleRate: number): Float32Array {
  const a = new Float32Array(Math.round(PROBE_SECONDS * sampleRate));
  let seed = 12345;
  for (const t of PROBE_TIMES) {
    const s = Math.round(t * sampleRate);
    for (let i = 0; i < PROBE_CLICK_FRAMES; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 2 ** 31 - 1;
      a[s + i] = 0.8 * Math.sin((Math.PI * (i + 0.5)) / PROBE_CLICK_FRAMES) ** 2 * noise;
    }
  }
  return a;
}

/** Energy centroid (frame index, fractional) of `x` within `half` frames of `at`, or NaN when it is silent there. */
export function centroidAround(x: Float32Array, at: number, half: number): number {
  let num = 0;
  let den = 0;
  for (let i = Math.max(0, Math.round(at) - half); i < Math.min(x.length, Math.round(at) + half); i++) {
    const v = x[i]! * x[i]!;
    num += v * i;
    den += v;
  }
  return den > 1e-12 ? num / den : NaN;
}

/**
 * How late (frames; negative: early) the engine's output is for these
 * settings, measured on the probe: the median over its clicks of the heard
 * position minus the wanted one, where a click starting at source frame s is
 * wanted at the output frame `(s + length / 2) / tempoRatio`. The engine's own
 * start delay is right only for the neutral settings: at other tempos and
 * pitches it is off by several milliseconds (measured), and always by the same
 * amount for the same settings (no drift along a piece), so one short probe
 * tells how far to shift the output (`OfflineStretchOptions.delay`). What
 * stays is the engine's own timing jitter on a click (its hop grid, about
 * 5 ms: a click lands within about ±1.5 ms of the median at the extreme
 * settings): no shift can remove that.
 */
export function measureDelay(engine: RubberBandEngine, o: { sampleRate: number; semitones: number; tempoRatio: number; formants: boolean }): number {
  const probe = probeSignal(o.sampleRate);
  const outFrames = outputFrames(probe.length, o.tempoRatio);
  const out = new Float32Array(outFrames);
  let w = 0;
  const st = new OfflineStretch(engine, { ...o, channels: 1, outFrames }, (l, _r, n) => {
    out.set(l.subarray(0, n), w);
    w += n;
  });
  try {
    for (let off = 0; off < probe.length; off += 16384) st.push(probe.subarray(off, off + 16384), undefined, Math.min(16384, probe.length - off));
    st.finish();
  } finally {
    st.destroy();
  }
  const half = Math.round(0.03 * o.sampleRate);
  const errs: number[] = [];
  for (const t of PROBE_TIMES) {
    const wanted = (Math.round(t * o.sampleRate) + PROBE_CLICK_FRAMES / 2) / o.tempoRatio;
    const got = centroidAround(out, wanted, half);
    if (Number.isFinite(got)) errs.push(got - wanted);
  }
  if (errs.length < 5) return 0;
  errs.sort((a, b) => a - b);
  return errs[errs.length >> 1]!;
}
