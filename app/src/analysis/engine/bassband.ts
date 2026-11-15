// The bass register of a mix, for when the piece has not been separated: a
// band-pass of 40 to 300 Hz (fourth-order Butterworth low-pass, second-order
// high-pass, as biquads), so that the chord network's pitch output hears the
// bass line rather than the whole band. Pure.

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function lowpass(f: number, sr: number, q: number): Biquad {
  const w = (2 * Math.PI * f) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

function highpass(f: number, sr: number, q: number): Biquad {
  const w = (2 * Math.PI * f) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

function run(x: Float32Array, f: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

/** A new array: `audio` band-passed to [lo, hi] Hz and brought to a peak of 0.5. */
export function bassBand(audio: Float32Array, sr: number, lo = 40, hi = 300): Float32Array {
  const y = audio.slice();
  // Fourth-order Butterworth low-pass: two sections with Q = 0.541 and 1.307.
  run(y, lowpass(hi, sr, 0.5412));
  run(y, lowpass(hi, sr, 1.3066));
  run(y, highpass(lo, sr, Math.SQRT1_2));
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]!));
  if (peak > 0) {
    const g = 0.5 / peak;
    for (let i = 0; i < y.length; i++) y[i]! *= g;
  }
  return y;
}
