// Sample-rate conversion by polyphase windowed-sinc interpolation (Kaiser
// window, about 80 dB of rejection). Used for the files the browser cannot
// decode itself (AIFF); everything else is resampled by Web Audio while
// decoding. Exact for any pair of integer rates: output sample k sits at the
// input position k·M/L, where L/M is the reduced ratio.

const KAISER_BETA = 8;
/** Half-width of the kernel in input samples when not downsampling (32 taps in all). */
const HALF_WIDTH = 16;
/** Passband edge as a fraction of the lower Nyquist frequency. */
const PASSBAND = 0.985;
/** Outputs computed between two pauses of the interface. */
const BLOCK = 1 << 18;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Zeroth-order modified Bessel function of the first kind (series). */
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

export interface Resampler {
  /** Output samples per input sample. */
  ratio: number;
  outputLength(inputLength: number): number;
  /** Computes outputs `[from, to)` of `input` into `out`. */
  run(input: Float32Array, out: Float32Array, from: number, to: number): void;
}

export function createResampler(fromRate: number, toRate: number): Resampler {
  const g = gcd(fromRate, toRate);
  const L = toRate / g;
  const M = fromRate / g;
  const cutoff = Math.min(1, toRate / fromRate) * PASSBAND;
  const half = Math.ceil(HALF_WIDTH / Math.min(1, toRate / fromRate));
  const taps = half * 2;
  const table = new Float32Array(L * taps);
  const i0Beta = besselI0(KAISER_BETA);
  for (let p = 0; p < L; p++) {
    const frac = p / L;
    let sum = 0;
    for (let j = 0; j < taps; j++) {
      const t = j - half + 1 - frac;
      const u = t / half;
      const window = Math.abs(u) >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - u * u)) / i0Beta;
      const x = Math.PI * cutoff * t;
      const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x;
      const v = cutoff * sinc * window;
      table[p * taps + j] = v;
      sum += v;
    }
    // Unit gain at DC for every phase.
    for (let j = 0; j < taps; j++) table[p * taps + j]! /= sum;
  }

  return {
    ratio: toRate / fromRate,
    outputLength: (n) => Math.round((n * toRate) / fromRate),
    run(input, out, from, to) {
      const n = input.length;
      let pos = from * M;
      let i = Math.floor(pos / L);
      let p = pos - i * L;
      for (let k = from; k < to; k++) {
        const base = i - half + 1;
        const row = p * taps;
        let acc = 0;
        if (base >= 0 && base + taps <= n) {
          for (let j = 0; j < taps; j++) acc += input[base + j]! * table[row + j]!;
        } else {
          for (let j = 0; j < taps; j++) {
            const idx = base + j;
            if (idx >= 0 && idx < n) acc += input[idx]! * table[row + j]!;
          }
        }
        out[k] = acc;
        p += M;
        const step = Math.floor(p / L);
        p -= step * L;
        i += step;
      }
    },
  };
}

export interface ResampleOptions {
  /** 0…1 over all channels. */
  onProgress?: (fraction: number) => void;
  /** Polled between blocks; true stops the work. */
  isAborted?: () => boolean;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Converts every channel to `toRate`. Works in blocks and yields to the page
 * between them so the interface stays alive. Resolves with `null` if
 * `isAborted()` turned true.
 */
export async function resampleChannels(
  channels: Float32Array[],
  fromRate: number,
  toRate: number,
  options: ResampleOptions = {},
): Promise<Float32Array[] | null> {
  if (fromRate === toRate) return channels;
  const resampler = createResampler(fromRate, toRate);
  const length = resampler.outputLength(channels[0]?.length ?? 0);
  const outputs = channels.map(() => new Float32Array(length));
  const total = length * channels.length;
  let done = 0;
  for (let c = 0; c < channels.length; c++) {
    for (let from = 0; from < length; from += BLOCK) {
      if (options.isAborted?.()) return null;
      const to = Math.min(length, from + BLOCK);
      resampler.run(channels[c]!, outputs[c]!, from, to);
      done += to - from;
      options.onProgress?.(done / total);
      await pause();
    }
  }
  return outputs;
}
