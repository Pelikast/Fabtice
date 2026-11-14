// Deterministic inputs shared by `make-fixtures.mjs` (which runs the
// PROTOTYPE's functions on them and writes `prototype-values.json`) and the
// unit tests of the port (which run the ported functions on the same inputs
// and compare). Plain JavaScript on purpose: the generator runs in Node
// without a build; `inputs.d.mts` types it for the tests.

/** Small seeded generator (mulberry32): the same numbers everywhere. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A few notes with harmonics, tuned `cents` away from A = 440 Hz, with a little noise. */
export function tonePiece(sr, seconds, cents, seed = 1) {
  const rand = rng(seed);
  const n = Math.round(sr * seconds);
  const out = new Float32Array(n);
  const ratio = Math.pow(2, cents / 1200);
  const notes = [220, 277.18, 329.63, 392, 493.88];
  for (const [k, f0] of notes.entries()) {
    for (let h = 1; h <= 4; h++) {
      const f = f0 * ratio * h;
      const amp = 0.2 / (h * (1 + k * 0.3));
      const phase = rand() * 2 * Math.PI;
      for (let i = 0; i < n; i++) out[i] += amp * Math.sin((2 * Math.PI * f * i) / sr + phase);
    }
  }
  for (let i = 0; i < n; i++) out[i] += (rand() - 0.5) * 0.01;
  return out;
}

/** Network logits for a steady beat: a peak every `period` frames, noise elsewhere. */
export function beatActivations(frames, period, seed = 2, phase = 3) {
  const rand = rng(seed);
  const beat = new Float32Array(frames);
  const down = new Float32Array(frames);
  for (let t = 0; t < frames; t++) {
    const d = ((t - phase) % period + period) % period;
    const dist = Math.min(d, period - d);
    beat[t] = 6 - 3 * dist + (rand() - 0.5) * 0.6;
    down[t] = -5 + (rand() - 0.5) * 0.6;
  }
  // Downbeats: every fourth beat (or `bar` beats), a bit off the beat peak.
  for (let b = 0, i = 0; phase + b * period < frames; b++) {
    const t = Math.round(phase + b * period);
    if (b % 4 === 0) {
      for (let k = -2; k <= 2; k++) if (t + k >= 0 && t + k < frames) down[t + k] = 5 - 2 * Math.abs(k);
      i++;
    }
  }
  return { beat, down, frames, fps: 50 };
}

/** Downbeat probability per beat for a steady meter of `bpb`, `offset` beats late, with noise. */
export function downProbs(n, bpb, offset, seed = 3) {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const on = (i - offset) % bpb === 0;
    return on ? 0.7 + rand() * 0.28 : rand() * 0.25;
  });
}

const N_CHORDS = 169;

/**
 * Frames of chord evidence (CREMA's frame rate) for a progression of one chord
 * per bar over a steady grid (`start` seconds, `bpm`, `bpb` beats per bar,
 * `bars` bars): the chord of the bar gets most of the probability, the rest is
 * spread with noise; pitch and bass activations follow the chord.
 */
export function chordFrames(progression, { bars, bpb = 4, bpm = 120, start = 0.2, seed = 4 }) {
  const rand = rng(seed);
  const fps = 44100 / 4096;
  const barSeconds = (bpb * 60) / bpm;
  const T = Math.ceil((start + bars * barSeconds) * fps) + 2;
  const probs = new Float32Array(T * N_CHORDS);
  const pitch = new Float32Array(T * 12);
  const bass = new Float32Array(T * 13);
  const qualPcs = {
    maj: [0, 4, 7], min: [0, 3, 7], aug: [0, 4, 8], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7],
    7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], minmaj7: [0, 3, 7, 11],
    maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], dim7: [0, 3, 6, 9], hdim7: [0, 3, 6, 10],
  };
  const quals = ['maj', 'min', 'aug', 'dim', 'sus2', 'sus4', '7', 'maj7', 'min7', 'minmaj7', 'maj6', 'min6', 'dim7', 'hdim7'];
  for (let f = 0; f < T; f++) {
    const bar = Math.max(0, Math.min(bars - 1, Math.floor((f / fps - start) / barSeconds)));
    const chord = progression[bar % progression.length];
    let sum = 0;
    for (let c = 0; c < N_CHORDS; c++) {
      let v = rand() * 0.004;
      if (c === chord) v += 0.55 + rand() * 0.3;
      // A neighbour with the same root is the usual confusion.
      if (chord < 168 && c < 168 && Math.floor(c / 14) === Math.floor(chord / 14) && c !== chord) v += rand() * 0.05;
      probs[f * N_CHORDS + c] = v;
      sum += v;
    }
    for (let c = 0; c < N_CHORDS; c++) probs[f * N_CHORDS + c] /= sum;
    if (chord < 168) {
      const r = Math.floor(chord / 14);
      for (const iv of qualPcs[quals[chord % 14]]) pitch[f * 12 + ((r + iv) % 12)] = 0.7 + rand() * 0.25;
      pitch[f * 12 + ((r + 2) % 12)] = Math.max(pitch[f * 12 + ((r + 2) % 12)], 0.55); // a ninth, so a suggestion appears
      bass[f * 13 + r] = 0.8;
    } else {
      bass[f * 13 + 12] = 0.9;
    }
  }
  return { T, fps, probs, pitch, bass, root: new Float32Array(T * 13) };
}

/** Beat times at 120 BPM from `start`, numbers 1..bpb. */
export function steadyGrid(beats, bpb, start = 0.2, bpm = 120) {
  const step = 60 / bpm;
  const times = Array.from({ length: beats }, (_, i) => start + i * step);
  return { beats: times, numbers: times.map((_, i) => (i % bpb) + 1), beatsPerBar: bpb };
}
