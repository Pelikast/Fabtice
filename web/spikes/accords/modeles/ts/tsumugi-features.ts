// What the JavaScript side must compute to run the Tsumugi-Chords graph (see
// ../RECHERCHE.md and ../convert_tsumugi.py): the audio at 25.6 kHz in stereo, cut into
// 30 s windows of which the middle 20 s are kept, and for every window the beat and key
// features at 25 frames per second. Pure functions, no dependencies, ported line by line
// from the author's tsumugi_chords/note_chords.py (MIT) and checked against it
// (tsumugi-features.test.ts, parity.mjs).

export const RATE = 25_600; // samples per second the graph reads
export const FRAME_RATE = 25; // output frames per second
export const PER_FRAME = RATE / FRAME_RATE; // 1024 samples per output frame
export const WINDOW_FRAMES = 750; // 30 s
export const CONTEXT_FRAMES = 125; // 5 s dropped at either side (except at the song's ends)
export const WINDOW_SAMPLES = WINDOW_FRAMES * PER_FRAME; // 768 000
export const BEAT_FEATURES = 11;
export const KEY_FEATURES = 25;
const GAP = 8.0; // seconds: the cap of the since / until features

export interface KeySpan {
  start: number;
  end: number;
  /** "E:major", "A:minor" (other modes by their parent major: "D:dorian"…). */
  key: string;
}

/** One window of the song: frames [start, start + 750) are fed, frames [keepFrom, keepTo) kept. */
export interface WindowPlan {
  start: number;
  keepFrom: number;
  keepTo: number;
}

/** The windows of a song of `samples` samples at RATE (note_chords.song_logits). */
export function windowPlan(samples: number): { frames: number; windows: WindowPlan[] } {
  const frames = Math.floor(samples / PER_FRAME);
  const core = WINDOW_FRAMES - 2 * CONTEXT_FRAMES;
  const windows: WindowPlan[] = [];
  for (let kept = 0; kept < frames; kept += core) {
    const start = Math.min(Math.max(0, kept - CONTEXT_FRAMES), Math.max(0, frames - WINDOW_FRAMES));
    windows.push({ start, keepFrom: kept, keepTo: Math.min(kept + core, frames) });
  }
  return { frames, windows };
}

/** The [1, 2, 768000] input of a window (zero-padded past the end); a mono song is fed on both channels. */
export function windowWave(left: Float32Array, right: Float32Array, w: WindowPlan): Float32Array {
  const out = new Float32Array(2 * WINDOW_SAMPLES);
  const s0 = w.start * PER_FRAME;
  const n = Math.max(0, Math.min(WINDOW_SAMPLES, left.length - s0));
  out.set(left.subarray(s0, s0 + n), 0);
  out.set(right.subarray(s0, s0 + n), WINDOW_SAMPLES);
  return out;
}

/** First index i with marks[i] > x (numpy searchsorted side="right"); marks sorted. */
function searchRight(marks: readonly number[], x: number): number {
  let lo = 0;
  let hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sinceUntil(t: number, marks: readonly number[]): [number, number] {
  const scale = Math.log1p(GAP);
  if (!marks.length) return [1, 1];
  const after = searchRight(marks, t);
  const prev = after > 0 ? t - marks[after - 1]! : GAP;
  const next = after < marks.length ? marks[after]! - t : GAP;
  const clip = (v: number) => Math.min(GAP, Math.max(0, v));
  return [Math.log1p(clip(prev)) / scale, Math.log1p(clip(next)) / scale];
}

function phase(t: number, marks: readonly number[]): [number, boolean] {
  if (marks.length < 2) return [0, false];
  const raw = searchRight(marks, t) - 1;
  const inside = raw >= 0 && raw < marks.length - 1;
  const i = Math.min(Math.max(raw, 0), marks.length - 2);
  return [inside ? (t - marks[i]!) / (marks[i + 1]! - marks[i]!) : 0, inside];
}

/**
 * [frames x 11] beat features of a window starting at `start` seconds (row-major): beat and
 * downbeat on the frame; beat phase and bar phase (sin, cos; 0 outside the marks); time since /
 * until the beat and the downbeat (log1p, capped at 8 s, 0..1); present (1).
 * Beats and downbeats in seconds, sorted.
 */
export function beatFeatures(beats: readonly number[], downbeats: readonly number[], start: number, frames = WINDOW_FRAMES): Float32Array {
  const out = new Float32Array(frames * BEAT_FEATURES);
  if (beats.length < 2) return out;
  for (const [col, marks] of [[0, beats], [1, downbeats]] as const) {
    for (const m of marks) {
      const i = Math.floor((m - start) * FRAME_RATE);
      if (i >= 0 && i < frames) out[i * BEAT_FEATURES + col] = 1;
    }
  }
  for (let f = 0; f < frames; f++) {
    const t = start + (f + 0.5) / FRAME_RATE;
    const row = f * BEAT_FEATURES;
    for (const [col, marks] of [[2, beats], [4, downbeats]] as const) {
      const [v, inside] = phase(t, marks);
      out[row + col] = inside ? Math.sin(2 * Math.PI * v) : 0;
      out[row + col + 1] = inside ? Math.cos(2 * Math.PI * v) : 0;
    }
    [out[row + 6], out[row + 7]] = sinceUntil(t, beats);
    [out[row + 8], out[row + 9]] = sinceUntil(t, downbeats);
    out[row + 10] = 1;
  }
  return out;
}

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
const PARENT: Record<string, number> = { major: 0, minor: 3, harmonic_minor: 3, dorian: -2, phrygian: -4, lydian: -5, mixolydian: -7, locrian: 1 };

/** "E:major" -> 4, "A:minor" -> 21 (tonic + 12 for minor; other modes by their parent major); null if unknown. */
export function keyIndex(name: string): number | null {
  const [t0, mode = ''] = name.split(':') as [string, string?];
  const tonic = FLAT[t0] ?? t0;
  const i = SHARP.indexOf(tonic);
  if (i < 0) return null;
  if (mode === 'minor') return i + 12;
  return (((i + (PARENT[mode] ?? 0)) % 12) + 12) % 12;
}

/** The app's key (tonic 0..11, mode) as Tsumugi's key name. */
export function keyName(tonic: number, mode: 'major' | 'minor'): string {
  return `${SHARP[((tonic % 12) + 12) % 12]}:${mode}`;
}

/** [frames x 25] key features of a window: one-hot key (24) and present (1), 0 where no key. */
export function keyFeatures(keys: readonly KeySpan[], start: number, frames = WINDOW_FRAMES): Float32Array {
  const out = new Float32Array(frames * KEY_FEATURES);
  for (const k of keys) {
    const index = keyIndex(k.key);
    if (index === null) continue;
    for (let f = 0; f < frames; f++) {
      const t = start + (f + 0.5) / FRAME_RATE;
      if (t >= k.start && t < k.end) {
        out[f * KEY_FEATURES + index] = 1;
        out[f * KEY_FEATURES + 24] = 1;
      }
    }
  }
  return out;
}

/** Copies the kept frames of one window's output ([750 x width], row-major) into the song's ([frames x width]). */
export function stitch(song: Float32Array, windowOut: Float32Array, w: WindowPlan, width: number): void {
  const from = (w.keepFrom - w.start) * width;
  const to = (w.keepTo - w.start) * width;
  song.set(windowOut.subarray(from, to), w.keepFrom * width);
}

/**
 * Resample to RATE with a polyphase windowed-sinc (Kaiser) low-pass, for any integer input
 * rate (48 kHz in the app: up 8, down 15). Cut-off at 0.475 x the lower rate, `zeros` zero
 * crossings each side. Not the author's resampler (torchaudio's): parity.mjs measures what it
 * changes in the model's output.
 */
export function resampleTo25600(x: Float32Array, rate: number, zeros = 32, beta = 8.6): Float32Array {
  if (rate === RATE) return x.slice();
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(RATE, rate);
  const up = RATE / g;
  const down = rate / g;
  const cutoff = 0.475 * Math.min(1, RATE / rate); // cycles per input sample
  const half = Math.ceil(zeros / (2 * cutoff));
  const i0 = (v: number) => {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 60; k++) {
      term *= (v / (2 * k)) ** 2;
      sum += term;
    }
    return sum;
  };
  const norm = i0(beta);
  // kernels[p][m]: weight of input sample c - half + 1 + m for an output at c + p / up.
  const taps = 2 * half;
  const kernels = new Float32Array(up * taps);
  for (let p = 0; p < up; p++) {
    const frac = p / up;
    for (let m = 0; m < taps; m++) {
      const d = frac - (m - half + 1);
      const u = d / half;
      if (Math.abs(u) >= 1) continue;
      const arg = 2 * cutoff * d;
      const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg);
      kernels[p * taps + m] = 2 * cutoff * sinc * (i0(beta * Math.sqrt(1 - u * u)) / norm);
    }
  }
  const n = Math.floor((x.length * up) / down);
  const out = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const num = j * down;
    const c = Math.floor(num / up);
    const k = (num % up) * taps;
    let acc = 0;
    const first = c - half + 1;
    for (let m = 0; m < taps; m++) {
      const i = first + m;
      if (i >= 0 && i < x.length) acc += x[i]! * kernels[k + m]!;
    }
    out[j] = acc;
  }
  return out;
}
