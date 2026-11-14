// Tuning reference estimate, ported unchanged from the prototype
// (`web/spikes/analyse/lib/tuning.js`): deviation of spectral peaks from the
// 12-tone equal-tempered grid at A = 440 Hz, accumulated in a circular
// histogram (1 cent bins) weighted by peak magnitude. Same principle as
// librosa.estimate_tuning and Essentia's TuningFrequency, with finer frequency
// resolution (8192-point FFT at 22.05 kHz, parabolic interpolation).

import { fft, hann } from './fft';

export interface TuningEstimate {
  /** Deviation from A = 440 Hz in cents, −50…+50. */
  cents: number;
  refHz: number;
  /** Resultant length of the peak deviations: 1 = all peaks agree. */
  confidence: number;
  peakiness?: number;
  peaks: number;
}

export interface TuningOptions {
  maxFrames?: number;
  fmin?: number;
  fmax?: number;
}

export function estimateTuning(audio: Float32Array, sr: number, { maxFrames = 700, fmin = 100, fmax = 3000 }: TuningOptions = {}): TuningEstimate {
  let n = 1;
  while (n < sr * 0.35) n <<= 1;
  const win = hann(n);
  const total = Math.floor((audio.length - n) / (n / 2)) + 1;
  const hist = new Float64Array(100);
  if (total <= 0) return { cents: 0, refHz: 440, confidence: 0, peaks: 0 };
  const step = Math.max(1, Math.floor(total / maxFrames));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const db = new Float64Array(n / 2);
  const k0 = Math.max(2, Math.floor((fmin * n) / sr));
  const k1 = Math.min(n / 2 - 3, Math.ceil((fmax * n) / sr));
  let peaks = 0;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let f = 0; f < total; f += step) {
    const off = f * (n / 2);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const v = audio[off + i]!;
      re[i] = v * win[i]!;
      im[i] = 0;
      energy += v * v;
    }
    if (energy / n < 1e-7) continue; // silence
    fft(re, im);
    let mx = -Infinity;
    for (let k = 0; k < n / 2; k++) {
      db[k] = 10 * Math.log10(re[k]! * re[k]! + im[k]! * im[k]! + 1e-20);
      if (k >= k0 && k <= k1 && db[k]! > mx) mx = db[k]!;
    }
    for (let k = k0; k <= k1; k++) {
      const b = db[k]!;
      if (b < mx - 40) continue;
      if (!(b > db[k - 1]! && b >= db[k + 1]! && b > db[k - 2]! && b >= db[k + 2]!)) continue;
      const a = db[k - 1]!;
      const c = db[k + 1]!;
      const den = a - 2 * b + c;
      const d = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const freq = ((k + d) * sr) / n;
      const cents = 1200 * Math.log2(freq / 440);
      const dev = cents - 100 * Math.round(cents / 100);
      const w = Math.pow(10, (b - mx) / 20);
      const bin = ((Math.round(dev) % 100) + 100) % 100;
      hist[bin]! += w;
      const ang = (2 * Math.PI * dev) / 100;
      sx += w * Math.cos(ang);
      sy += w * Math.sin(ang);
      sw += w;
      peaks++;
    }
  }
  if (!peaks) return { cents: 0, refHz: 440, confidence: 0, peaks: 0 };
  // Circular Gaussian smoothing (sigma 3 cents), then argmax and local circular mean.
  const sm = new Float64Array(100);
  for (let i = 0; i < 100; i++) for (let j = -9; j <= 9; j++) sm[i]! += hist[(i + j + 100) % 100]! * Math.exp(-(j * j) / 18);
  let arg = 0;
  for (let i = 1; i < 100; i++) if (sm[i]! > sm[arg]!) arg = i;
  let cx = 0;
  let cy = 0;
  for (let j = -15; j <= 15; j++) {
    const i = (arg + j + 100) % 100;
    const ang = (2 * Math.PI * (arg + j)) / 100;
    cx += hist[i]! * Math.cos(ang);
    cy += hist[i]! * Math.sin(ang);
  }
  let cents = (Math.atan2(cy, cx) * 100) / (2 * Math.PI);
  if (cents >= 50) cents -= 100;
  if (cents < -50) cents += 100;
  const meanSm = sm.reduce((a, b) => a + b, 0) / 100;
  return {
    cents,
    refHz: 440 * Math.pow(2, cents / 1200),
    confidence: Math.min(1, Math.hypot(sx, sy) / sw),
    peakiness: sm[arg]! / meanSm,
    peaks,
  };
}
