// Sampling-rate conversion for the Wave export (44.1, 48, 88.2, 96 kHz): a
// windowed-sinc interpolator (Kaiser window), polyphase, rational ratio.
//
//   - Every output sample is a weighted sum of the 2H input samples around the
//     point in time it sits at; the weights come from a table of `nPhases`
//     kernels (one per distinct fraction of a sample the ratio can produce, 147
//     for 48 → 44.1 kHz), computed once. The fraction is exact (integer
//     arithmetic on the ratio reduced by its gcd), never accumulated.
//   - Going down (48 → 44.1 kHz) the kernel is a low-pass at 95.5 % of the
//     output's Nyquist frequency, wide enough (128 taps) that the transition
//     (about 20.1 to 22 kHz) and the stop band (about -85 dB) are those of a
//     good converter: what the source holds above the new Nyquist frequency
//     does not fold back into the audible band. Going up, the kernel is the
//     low-pass at the input's Nyquist frequency (64 taps): no image of the
//     signal appears above it.
//   - A block of output is computed from the source read at the time: no state
//     between blocks (the source is read 2H samples wider on each side), so a
//     long piece is converted a block at a time, never copied whole in Float32.
//
// Pure and tested in Node (`resample.test.ts`: a sine keeps its frequency, a
// tone above the new Nyquist frequency does not fold into the band).

/** Reads `buf.length` source samples from frame `start`; frames outside the source read as 0. */
export type SourceReader = (start: number, buf: Float32Array) => void;

/** Largest number of distinct kernels kept: past it, the fraction is rounded to the nearest 1/2048 of a sample. */
const MAX_PHASES = 2048;
/** Kaiser window shape: about 86 dB of stop-band attenuation. */
const KAISER_BETA = 8.5;
/** Half-width of the kernel, in input samples: going down (the low-pass is narrow) and going up. */
const HALF_DOWN = 64;
const HALF_UP = 32;
/** Cut-off, as a share of the lower of the two Nyquist frequencies, when going down. */
const CUTOFF_DOWN = 0.955;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Modified Bessel function of order 0 (series). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 60; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

export class SincResampler {
  /** Input frames per `L` output frames, in lowest terms. */
  private readonly M: number;
  private readonly L: number;
  private readonly nPhases: number;
  private readonly half: number;
  private readonly table: Float32Array;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
  ) {
    if (!(inRate > 0) || !(outRate > 0)) throw new Error('sampling rates must be positive');
    const g = gcd(Math.round(inRate), Math.round(outRate));
    this.M = Math.round(inRate) / g;
    this.L = Math.round(outRate) / g;
    this.nPhases = Math.min(this.L, MAX_PHASES);
    const down = this.M > this.L;
    this.half = down ? HALF_DOWN : HALF_UP;
    // Cut-off in cycles per input sample.
    const fc = down ? 0.5 * (this.L / this.M) * CUTOFF_DOWN : 0.5;
    const taps = 2 * this.half;
    const table = new Float32Array(this.nPhases * taps);
    const i0 = besselI0(KAISER_BETA);
    for (let p = 0; p < this.nPhases; p++) {
      const frac = p / this.nPhases;
      let sum = 0;
      const row = new Float64Array(taps);
      for (let j = 0; j < taps; j++) {
        // Distance, in input samples, from the output point to tap j.
        const x = j - this.half + 1 - frac;
        const u = x / this.half;
        const w = Math.abs(u) < 1 ? besselI0(KAISER_BETA * Math.sqrt(1 - u * u)) / i0 : 0;
        const a = 2 * Math.PI * fc * x;
        const s = Math.abs(a) < 1e-12 ? 1 : Math.sin(a) / a;
        row[j] = 2 * fc * s * w;
        sum += row[j]!;
      }
      // Unit gain at DC for every phase: a constant stays a constant.
      for (let j = 0; j < taps; j++) table[p * taps + j] = row[j]! / sum;
    }
    this.table = table;
  }

  /** True when the rates are equal: nothing to do. */
  get identity(): boolean {
    return this.M === this.L;
  }

  /** Frames of the converted audio. */
  outFrames(inFrames: number): number {
    return Math.round((inFrames * this.outRate) / this.inRate);
  }

  /** Fills `out` with the converted frames `outStart …` (frames past the end of the source read as silence in). */
  renderBlock(read: SourceReader, outStart: number, out: Float32Array, scratch?: Float32Array): Float32Array {
    const { M, L, nPhases, half } = this;
    const taps = 2 * half;
    const n = out.length;
    if (n === 0) return scratch ?? new Float32Array(0);
    const first = Math.floor((outStart * M) / L);
    const last = Math.floor(((outStart + n - 1) * M) / L) + 1;
    const need = last - first + taps + 1;
    const src = scratch && scratch.length >= need ? scratch : new Float32Array(need);
    // Source frame of src[0]: the first tap of the first output.
    const base = first - half + 1;
    read(base, src.subarray(0, need));
    const table = this.table;
    for (let i = 0; i < n; i++) {
      const pos = (outStart + i) * M;
      let i0 = Math.floor(pos / L);
      const r = pos - i0 * L;
      let ph = nPhases === L ? r : Math.round((r * nPhases) / L);
      if (ph === nPhases) {
        ph = 0;
        i0++;
      }
      const t = ph * taps;
      const s = i0 - half + 1 - base;
      let acc = 0;
      for (let j = 0; j < taps; j++) acc += table[t + j]! * src[s + j]!;
      out[i] = acc;
    }
    return src;
  }
}
