// Resampling between the app's rate (48 kHz) and a separation tool's rate
// (44.1 kHz for the three tools of the list), both ways.
//
// A rational polyphase filter (48 000 / 44 100 = 160 / 147): output sample k
// sits at input position k·M/L exactly, so any range of the output can be
// computed from the matching range of the input (random access: the
// separator reads the piece segment by segment, each sample twice with an
// overlap of two). The kernel is a Kaiser-windowed sinc, linear phase and
// centred: no delay, a round trip 48 → 44.1 → 48 kHz keeps every sample in
// place.
//
// Design (defaults): flat to 20 kHz, cut at 21.5 kHz, at least 100 dB down
// from 23 kHz. Why these edges: what lies between 22.05 and 23 kHz can only
// fold to between 21.1 and 22.05 kHz, far above hearing, and the tools ignore
// it; everything that could fold below 21 kHz is 100 dB down, under the
// 16-bit floor of the app's audio (96 dB). Measured by the unit tests
// (`resample.test.ts`): a 1 kHz tone and a 20 Hz – 20 kHz sweep come back
// from the round trip with no product above −100 dB.
//
// Pure: no browser, tested in Node.

export interface ResamplerDesign {
  /** Top of the flat band, Hz. */
  pass: number;
  /** Start of the stop band, Hz (at most the higher Nyquist frequency). */
  stop: number;
  /** Stop-band attenuation, dB. */
  attenuation: number;
}

export const DEFAULT_DESIGN: ResamplerDesign = { pass: 20000, stop: 23000, attenuation: 100 };

export interface Polyphase {
  inRate: number;
  outRate: number;
  /** Output step in units of 1/L input samples: output k is at input position k·M/L. */
  L: number;
  M: number;
  /** Taps on each side: input samples base − H + 1 … base + H. */
  H: number;
  /** L phases × 2H weights. */
  table: Float32Array;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Modified Bessel function of the first kind, order 0 (series). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/** The resampler from `inRate` to `outRate` (integers, Hz). */
export function designResampler(inRate: number, outRate: number, design: ResamplerDesign = DEFAULT_DESIGN): Polyphase {
  if (!Number.isInteger(inRate) || !Number.isInteger(outRate) || inRate <= 0 || outRate <= 0) throw new Error('rates must be positive integers');
  const g = gcd(inRate, outRate);
  const L = outRate / g;
  const M = inRate / g;
  const nyquist = Math.min(inRate, outRate) / 2;
  const stop = Math.min(design.stop, Math.max(inRate, outRate) / 2);
  const cutoff = Math.min((design.pass + stop) / 2, nyquist);
  const A = design.attenuation;
  const beta = A > 50 ? 0.1102 * (A - 8.7) : A >= 21 ? 0.5842 * (A - 21) ** 0.4 + 0.07886 * (A - 21) : 0;
  // Kaiser's estimate of the length for this transition, in input samples.
  const transition = (stop - design.pass) / inRate;
  const taps = Math.ceil((A - 8) / (2.285 * 2 * Math.PI * transition));
  const H = Math.max(4, Math.ceil(taps / 2));
  const fc = cutoff / (inRate / 2);
  const i0b = besselI0(beta);
  const width = 2 * H;
  const table = new Float32Array(L * width);
  for (let p = 0; p < L; p++) {
    const frac = p / L;
    let sum = 0;
    const row = new Float64Array(width);
    for (let j = -H + 1; j <= H; j++) {
      const d = frac - j; // distance from the output position to input sample base + j
      const x = d / H;
      const w = Math.abs(x) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - x * x)) / i0b;
      const s = d === 0 ? 1 : Math.sin(Math.PI * fc * d) / (Math.PI * fc * d);
      const v = fc * s * w;
      row[j + H - 1] = v;
      sum += v;
    }
    for (let i = 0; i < width; i++) table[p * width + i] = row[i]! / sum;
  }
  return { inRate, outRate, L, M, H, table };
}

/** Number of output samples for `inputLength` input samples (rounded up: the whole input is covered). */
export function resampledLength(k: Polyphase, inputLength: number): number {
  return Math.ceil((inputLength * k.L) / k.M);
}

/** Input index of the centre of output sample `k`. */
export function baseOf(k: Polyphase, out: number): number {
  return Math.floor((out * k.M) / k.L);
}

/** Input samples `[first, end)` needed to compute outputs `[outStart, outStart + n)`. */
export function inputSpan(k: Polyphase, outStart: number, n: number): [number, number] {
  if (n <= 0) return [0, 0];
  return [baseOf(k, outStart) - k.H + 1, baseOf(k, outStart + n - 1) + k.H + 1];
}

/**
 * Computes outputs `[outStart, outStart + out.length)` from `src`, which holds
 * input samples from index `srcStart` on (samples outside `src` count as 0).
 */
export function resampleInto(k: Polyphase, src: Float32Array, srcStart: number, outStart: number, out: Float32Array): void {
  const { L, M, H, table } = k;
  const width = 2 * H;
  const n = out.length;
  const len = src.length;
  const start = outStart * M;
  let base = Math.floor(start / L);
  let p = start - base * L;
  for (let i = 0; i < n; i++) {
    const first = base - H + 1 - srcStart;
    const row = p * width;
    let acc = 0;
    if (first >= 0 && first + width <= len) {
      for (let j = 0; j < width; j++) acc += src[first + j]! * table[row + j]!;
    } else {
      for (let j = 0; j < width; j++) {
        const s = first + j;
        if (s >= 0 && s < len) acc += src[s]! * table[row + j]!;
      }
    }
    out[i] = acc;
    // Next output: advance by M / L input samples.
    p += M;
    while (p >= L) {
      p -= L;
      base++;
    }
  }
}

/**
 * Outputs `[outStart, outStart + out.length)`, reading the input through
 * `read(start, buffer)` (which fills `buffer` with input samples from `start`,
 * zeros outside the signal). `scratch` is reused when it is long enough.
 */
export function resampleRange(
  k: Polyphase,
  read: (start: number, buffer: Float32Array) => void,
  outStart: number,
  out: Float32Array,
  scratch?: Float32Array,
): Float32Array {
  const [first, end] = inputSpan(k, outStart, out.length);
  const need = end - first;
  const buf = scratch && scratch.length >= need ? scratch.subarray(0, need) : new Float32Array(need);
  read(first, buf);
  resampleInto(k, buf, first, outStart, out);
  return scratch && scratch.length >= need ? scratch : buf;
}
