// The windows the model reads in an excerpt: 10 s every 5 s (at most `MAX_WINDOWS`, spread evenly
// over a long solo), each resampled to 16 kHz with the analysis' windowed-sinc resampler and
// brought to a peak of 0.5, as on the bench. Windows where nothing sounds are left out.

import { resampleRatio } from '../../analysis/engine/resample';
import { CED_SAMPLE_RATE, HOP_SECONDS, MAX_WINDOWS, MIN_WINDOW_SECONDS, WINDOW_SECONDS } from './model';

/** RMS under which a window is silence (about -80 dBFS): never amplified into the model. */
export const SILENT_RMS = 1e-4;
/** A window much quieter than the loudest one (the soloist resting) is left out: 20 dB. */
export const QUIET_RATIO = 0.1;
/** Peak of each window as the model reads it (the bench's level). */
export const WINDOW_PEAK = 0.5;
/** Shortest excerpt read at all. */
export const MIN_EXCERPT_SECONDS = 1;

function rms(x: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}

/** Start and end (in samples of `mono`) of the windows to read, before the silence test. */
export function windowPlan(length: number, sampleRate: number): { from: number; to: number }[] {
  const win = Math.round(WINDOW_SECONDS * sampleRate);
  const hop = Math.round(HOP_SECONDS * sampleRate);
  if (length < MIN_EXCERPT_SECONDS * sampleRate) return [];
  if (length <= win) return [{ from: 0, to: length }];
  const starts: number[] = [];
  for (let s = 0; s + win <= length; s += hop) starts.push(s);
  // The end of the excerpt, when it is long enough to be worth a window of its own.
  const last = starts[starts.length - 1]!;
  if (length - (last + win) >= MIN_WINDOW_SECONDS * sampleRate) starts.push(length - win);
  let picked = starts;
  if (starts.length > MAX_WINDOWS) {
    picked = [];
    for (let k = 0; k < MAX_WINDOWS; k++) picked.push(starts[Math.round((k * (starts.length - 1)) / (MAX_WINDOWS - 1))]!);
  }
  return picked.map((from) => ({ from, to: from + win }));
}

/**
 * The 16 kHz windows of an excerpt, ready for the model (each a fresh Float32Array).
 * Empty when nothing is played.
 */
export function excerptWindows(mono: Float32Array, sampleRate: number): Float32Array[] {
  if (!(sampleRate > 0) || !mono.length) return [];
  const plan = windowPlan(mono.length, sampleRate);
  const levels = plan.map((w) => rms(mono, w.from, w.to));
  const loudest = Math.max(0, ...levels);
  if (loudest < SILENT_RMS) return [];
  const ratio = sampleRate / CED_SAMPLE_RATE;
  const out: Float32Array[] = [];
  plan.forEach((w, k) => {
    if (levels[k]! < SILENT_RMS || levels[k]! < QUIET_RATIO * loudest) return;
    const y = ratio === 1 ? mono.slice(w.from, w.to) : resampleRatio(mono.subarray(w.from, w.to), ratio, 16);
    let peak = 0;
    for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]!));
    if (peak > 0) for (let i = 0; i < y.length; i++) y[i]! *= WINDOW_PEAK / peak;
    out.push(y);
  });
  return out;
}
