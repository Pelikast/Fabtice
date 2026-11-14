// Resampling and downmixing for the analysis.
//
// `resampleRatio` is the prototype's windowed-sinc resampler
// (`web/spikes/analyse/lib/grid.js`), used for the tuning correction:
// y(n) = x(n * ratio), so ratio < 1 lowers the pitch and lengthens the signal.
// The app decodes pieces at 48 kHz, while the networks want 22.05 kHz
// (Beat This!) and 44.1 kHz (CREMA): the same resampler does that too, with
// more taps for the steeper low-pass of the 22.05 kHz case.

export interface Kernel {
  taps: number;
  phases: number;
  width: number;
  cut: number;
  table: Float32Array;
}

export function makeKernel(ratio: number, taps = 16, phases = 512): Kernel {
  const cut = Math.min(1, 1 / ratio) * 0.97;
  const width = 2 * taps;
  // For each fractional phase, weights for k = c - taps + 1 .. c + taps.
  const table = new Float32Array((phases + 1) * width);
  for (let ph = 0; ph <= phases; ph++) {
    const frac = ph / phases;
    let ws = 0;
    for (let j = 0; j < width; j++) {
      const d = frac + taps - 1 - j; // p - k
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d * cut) / (Math.PI * d * cut);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (taps + 1));
      table[ph * width + j] = sinc * w;
      ws += sinc * w;
    }
    for (let j = 0; j < width; j++) table[ph * width + j]! /= ws;
  }
  return { taps, phases, width, cut, table };
}

/** Length of the output of `resampleRatio(x, ratio)`. */
export const resampledLength = (inputLength: number, ratio: number): number => Math.floor(inputLength / ratio);

/** Fills `y[i0 … i1)` with the resampled signal (so a long signal can be done in slices). */
export function resampleSlice(x: Float32Array, y: Float32Array, ratio: number, kernel: Kernel, i0: number, i1: number): void {
  const { taps, phases, width, table } = kernel;
  for (let i = i0; i < i1; i++) {
    const p = i * ratio;
    const c = Math.floor(p);
    const row = Math.round((p - c) * phases) * width;
    const k0 = c - taps + 1;
    let s = 0;
    if (k0 >= 0 && k0 + width <= x.length) {
      for (let j = 0; j < width; j++) s += x[k0 + j]! * table[row + j]!;
    } else {
      for (let j = 0; j < width; j++) {
        const k = k0 + j;
        if (k >= 0 && k < x.length) s += x[k]! * table[row + j]!;
      }
    }
    y[i] = s;
  }
}

export function resampleRatio(x: Float32Array, ratio: number, taps = 16, phases = 512): Float32Array {
  const y = new Float32Array(resampledLength(x.length, ratio));
  resampleSlice(x, y, ratio, makeKernel(ratio, taps, phases), 0, y.length);
  return y;
}

/**
 * Same, in slices of `slice` output samples with `between()` awaited after
 * each (the worker uses it to listen for a cancellation while it works).
 */
export async function resampleRatioAsync(
  x: Float32Array,
  ratio: number,
  taps: number,
  between: () => Promise<void> | void,
  slice = 1 << 19,
): Promise<Float32Array> {
  const y = new Float32Array(resampledLength(x.length, ratio));
  const kernel = makeKernel(ratio, taps);
  for (let i = 0; i < y.length; i += slice) {
    resampleSlice(x, y, ratio, kernel, i, Math.min(y.length, i + slice));
    await between();
  }
  return y;
}

/**
 * Mono mix of the channels (their mean), written into a new array. Done in
 * slices by the caller when the piece is long: `from` and `to` bound the work.
 */
export function mixToMono(channels: readonly Float32Array[], out: Float32Array, from = 0, to = out.length): void {
  const n = channels.length;
  if (n === 1) {
    out.set(channels[0]!.subarray(from, to), from);
    return;
  }
  for (let i = from; i < to; i++) {
    let s = 0;
    for (let c = 0; c < n; c++) s += channels[c]![i]!;
    out[i] = s / n;
  }
}
