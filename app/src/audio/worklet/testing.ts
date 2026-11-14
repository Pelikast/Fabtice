// Helpers shared by the engine's unit tests (Node, real WebAssembly): loading
// the stretcher, building tracks and signals, running the core, measuring.
// Not imported by the app.

import { readFileSync } from 'node:fs';
import { storeTrack } from '../storage';
import { N, PlayerCore, TrackData } from './core';
import { calibrateLatency, SignalsmithEngine, type LatencyModel } from './stretch';

export const SR = 48000;

let shared: { engine: SignalsmithEngine; lat: LatencyModel } | null = null;

/** The stretcher and its measured latency model, built once per test file. */
export async function loadStretcher(): Promise<{ engine: SignalsmithEngine; lat: LatencyModel }> {
  if (!shared) {
    const bytes = readFileSync(new URL('../wasm/signalsmith-nosimd.wasm', import.meta.url));
    const engine = await SignalsmithEngine.load(bytes, SR);
    shared = { engine, lat: calibrateLatency(engine) };
  }
  return shared;
}

export async function makeCore(): Promise<PlayerCore> {
  const { engine, lat } = await loadStretcher();
  return new PlayerCore(SR, engine, lat);
}

let ids = 0;

/** Adds a track (mono when `r` is omitted or identical) and returns its id. */
export function addTrack(core: PlayerCore, l: Float32Array, r?: Float32Array, mix: { volume?: number; mute?: boolean; solo?: boolean } = {}): string {
  const id = `t${ids++}`;
  const s = storeTrack(r ? [l, r] : [l]);
  core.addTrack(id, new TrackData(s.frames, s.mono, s.chunks), { volume: mix.volume ?? 1, mute: mix.mute ?? false, solo: mix.solo ?? false });
  return id;
}

/** Runs the core for `quanta` render calls; returns the concatenated stereo output. */
export function run(core: PlayerCore, quanta: number, each?: (q: number) => void): { L: Float32Array; R: Float32Array } {
  const L = new Float32Array(quanta * N);
  const R = new Float32Array(quanta * N);
  const bl = new Float32Array(N);
  const br = new Float32Array(N);
  for (let q = 0; q < quanta; q++) {
    each?.(q);
    core.render(bl, br);
    L.set(bl, q * N);
    R.set(br, q * N);
  }
  return { L, R };
}

/** Number of quanta in `sec` seconds. */
export const quanta = (sec: number): number => Math.round((sec * SR) / N);

export function sine(freq: number, seconds: number, amp = 0.5): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return a;
}

/** Tone with 12 harmonics (much easier for a fundamental estimator than a pure sine). */
export function harmonic(f0: number, seconds: number): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let k = 1; k <= 12; k++) for (let i = 0; i < a.length; i++) a[i]! += (0.3 / k) * Math.sin((2 * Math.PI * f0 * k * i) / SR + k);
  return a;
}

/** Fundamental by autocorrelation with parabolic refinement, searched around `fexp`. */
export function f0auto(x: Float32Array, from: number, len: number, fexp: number): number {
  const lagMin = Math.floor(SR / (fexp * 1.25));
  const lagMax = Math.ceil(SR / (fexp * 0.8));
  const r = new Float64Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0;
    for (let i = from; i < from + len; i++) s += x[i]! * x[i + lag]!;
    r[lag] = s;
  }
  let best = lagMin;
  for (let lag = lagMin; lag <= lagMax; lag++) if (r[lag]! > r[best]!) best = lag;
  const d = (0.5 * (r[best - 1]! - r[best + 1]!)) / (r[best - 1]! - 2 * r[best]! + r[best + 1]!);
  return SR / (best + d);
}

/** Frequency from rising zero crossings with linear interpolation over [from, to). */
export function zeroCrossFreq(x: Float32Array, from: number, to: number): number {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = Math.max(1, from); i < to; i++) {
    if (x[i - 1]! < 0 && x[i]! >= 0) {
      const t = i - 1 + (0 - x[i - 1]!) / (x[i]! - x[i - 1]!);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return count > 1 ? ((count - 1) * SR) / (last - first) : 0;
}

export const cents = (f: number, ref: number): number => 1200 * Math.log2(f / ref);

/** 3 ms raised-cosine tone bursts starting at each time (seconds). */
export function pulses(seconds: number, times: number[], amp = 0.8, freq = 2000): Float32Array {
  const n = Math.round(seconds * SR);
  const a = new Float32Array(n);
  const len = Math.round(0.003 * SR);
  for (const t of times) {
    const s = Math.round(t * SR);
    for (let i = 0; i < len && s + i < n; i++) a[s + i]! += amp * Math.sin((Math.PI * i) / len) ** 2 * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return a;
}

/** Finds bursts: energy-weighted centre (frame index) of each group of samples above `thr`. */
export function findBursts(x: Float32Array, thr: number, minGap = 2400): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < x.length) {
    if (Math.abs(x[i]!) > thr) {
      let j = i;
      let last = i;
      let num = 0;
      let den = 0;
      while (j < x.length && j - last < minGap / 2) {
        const a = Math.abs(x[j]!);
        if (a > thr * 0.3) {
          last = j;
          num += a * a * j;
          den += a * a;
        }
        j++;
      }
      out.push(num / den);
      i = j;
    } else i++;
  }
  return out;
}

/** Peak of the second difference over its RMS from frame `from`: a pure sine gives 1.41, a click far more. */
export function seamMetric(x: Float32Array, from: number): number {
  let mx = 0;
  let s2 = 0;
  let n = 0;
  for (let i = from + 2; i < x.length; i++) {
    const r = x[i]! - 2 * x[i - 1]! + x[i - 2]!;
    mx = Math.max(mx, Math.abs(r));
    s2 += r * r;
    n++;
  }
  return mx / Math.sqrt(s2 / n);
}

// ---------------------------------------------------------------- rendered audio (« Appliquer »)

/** Rendered audio for the player: the same 16-bit blocks as a track (what the offline renderer hands the engine). */
export function renderedOf(l: Float32Array, r?: Float32Array): TrackData {
  const s = storeTrack(r ? [l, r] : [l]);
  return new TrackData(s.frames, s.mono, s.chunks);
}

/** Gives the core a rendered set for its tracks, in the order they were added (`ids`). */
export function applySet(core: PlayerCore, ids: string[], data: TrackData[], semitones: number, ratio: number): void {
  core.setRendered(semitones, ratio, new Map(ids.map((id, i) => [id, data[i]!])));
}

/**
 * A linear chirp in SOURCE time: its frequency is `f0 + beta * t` at source
 * second t, so the frequency heard says which source second is heard (whatever
 * the tempo, when the pitch is not changed).
 */
export function chirp(f0: number, beta: number, seconds: number, amp = 0.5): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    a[i] = amp * Math.sin(2 * Math.PI * (f0 * t + (beta * t * t) / 2));
  }
  return a;
}

/** The same chirp as an ideal tempo change (pitch kept) makes it at tempo `ratio`: rendered second tau is source second tau * ratio. */
export function chirpRendered(f0: number, beta: number, sourceSeconds: number, ratio: number, amp = 0.5): Float32Array {
  const a = new Float32Array(Math.round((sourceSeconds / ratio) * SR));
  for (let i = 0; i < a.length; i++) {
    const tau = i / SR;
    a[i] = amp * Math.sin(2 * Math.PI * (f0 * tau + (beta * ratio * tau * tau) / 2));
  }
  return a;
}

/** The source second a chirp window `[from, from + len)` of the output is playing, from its frequency. */
export function chirpSecond(x: Float32Array, from: number, len: number, f0: number, beta: number): number {
  return (zeroCrossFreq(x, from, from + len) - f0) / beta;
}
