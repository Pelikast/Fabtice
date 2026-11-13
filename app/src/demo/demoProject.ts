// `?demo`: a synthetic piece generated in code (no audio file), so the shell
// can be driven, tested and screenshotted without importing anything. A slow
// swing in A♭ at 110 BPM, 24 bars, four tracks; deterministic.

import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import type { DecodedAudio } from '../audio/registry';
import { loopFromBars } from '../grid/lines';
import { barStartTime, beatToTime, constantTempoMap } from '../grid/tempoMap';
import type { NewProjectInput } from '../store/actions';

export const DEMO_BPM = 110;
export const DEMO_BARS = 24;
export const DEMO_FIRST_DOWNBEAT = 0.55;
const TAIL = 1.5;
const SR = ENGINE_SAMPLE_RATE;

// Chord per bar: root pitch class (C = 0) and intervals of the chord tones.
const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7 = [0, 4, 7, 10];
const CHART: [number, number[]][] = [
  [8, MAJ7], [5, MIN7], [10, MIN7], [3, DOM7],
  [0, MIN7], [5, DOM7], [10, MIN7], [3, DOM7],
  [8, MAJ7], [8, DOM7], [1, MAJ7], [1, MIN7],
  [0, MIN7], [5, DOM7], [10, MIN7], [3, DOM7],
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Adds a decaying tone (fundamental plus two soft harmonics) at time `t`. */
function tone(out: Float32Array, t: number, midi: number, amp: number, decay: number, length: number, vibrato = 0): void {
  const start = Math.round(t * SR);
  const n = Math.min(out.length - start, Math.round(length * SR));
  const w = (2 * Math.PI * hz(midi)) / SR;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const env = Math.min(1, i / 240) * Math.exp(-s * decay) * Math.min(1, (n - i) / 480);
    const ph = w * i + (vibrato ? vibrato * Math.sin(2 * Math.PI * 5.2 * s) * Math.min(1, s * 2) : 0);
    out[start + i]! += amp * env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph));
  }
}

/** Adds a burst of filtered noise (cymbal, brush, kick body when `low`). */
function hit(out: Float32Array, t: number, amp: number, decay: number, rand: () => number, low = false): void {
  const start = Math.round(t * SR);
  const n = Math.min(out.length - start, Math.round(0.6 * SR));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const env = Math.exp(-s * decay);
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * (low ? 0.02 : 0.6);
    const v = low ? Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-s * 30)) * s) * 0.9 + lp * 2 : noise - lp;
    out[start + i]! += amp * env * v;
  }
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.ceil(seconds * SR));
}

export function demoProject(): NewProjectInput {
  const map = constantTempoMap({
    bpm: DEMO_BPM,
    firstDownbeat: DEMO_FIRST_DOWNBEAT,
    meter: { numerator: 4, denominator: 4 },
    origin: 'manual',
  });
  const duration = barStartTime(map, DEMO_BARS) + TAIL;
  const beat = 60 / DEMO_BPM;
  const at = (bar: number, b: number) => beatToTime(map, bar * 4 + b);
  const swing = (2 / 3) * beat; // the swung upbeat

  const drums = buffer(duration);
  const bass = buffer(duration);
  const piano = buffer(duration);
  const horns = buffer(duration);
  const rand = seeded(1959);

  for (let bar = 0; bar < DEMO_BARS; bar++) {
    const [root, chord] = CHART[bar % CHART.length]!;
    const fill = bar % 8 === 7;

    // Drums: ride « ding, ding-da, ding, ding-da », feathered kick, hi-hat on 2 and 4.
    for (let b = 0; b < 4; b++) {
      hit(drums, at(bar, b), b % 2 ? 0.16 : 0.12, 9, rand);
      if (b % 2) hit(drums, at(bar, b) + swing, 0.08, 12, rand);
      hit(drums, at(bar, b), 0.12, 6, rand, true);
      if (b % 2) hit(drums, at(bar, b), 0.1, 40, rand);
    }
    if (fill) for (let k = 0; k < 6; k++) hit(drums, at(bar, 2) + (k * beat) / 3, 0.12 + k * 0.02, 22, rand);

    // Walking bass: root, then chord tones, last beat a half-step approach.
    const next = CHART[(bar + 1) % CHART.length]![0];
    const base = 36 + root;
    const walk = [base, base + chord[1]!, base + chord[2]!, 36 + next + (rand() < 0.5 ? 1 : -1)];
    walk.forEach((m, b) => tone(bass, at(bar, b), m, 0.36, 3.2, beat * 0.95));

    // Piano comping: on 1 and on the « and » of 2 (Charleston), rootless voicing.
    for (const t of [at(bar, 0), at(bar, 1) + swing]) {
      for (const iv of [chord[1]!, chord[3]!, chord[2]! + 12, 14]) tone(piano, t, 60 + ((root + iv) % 12), 0.07, 2.4, beat * 1.4);
    }

    // Horns: two-bar phrases from bar 4 to bar 20, rests in between.
    if (bar >= 4 && bar < 20 && bar % 2 === 0) {
      const notes = [chord[3]!, chord[2]!, chord[1]!, 9, chord[2]!];
      notes.forEach((iv, k) => {
        const t = at(bar, k * 1.25);
        tone(horns, t, 67 + ((root + iv) % 12) - 12 * (iv > 9 ? 1 : 0), 0.13, 0.6, beat * (k === notes.length - 1 ? 2.8 : 1.2), 0.012);
      });
    }
  }

  const mono = (channel: Float32Array): DecodedAudio => ({ channels: [channel], sampleRate: SR });
  return {
    title: 'Blues du dimanche',
    source: { kind: 'demo' },
    tempoMap: map,
    loop: loopFromBars(map, 4, 7),
    tracks: [
      { role: 'batterie', audio: mono(drums), volume: 0.62 },
      { role: 'basse', audio: mono(bass), volume: 0.78 },
      { role: 'piano', audio: mono(piano), volume: 0.78 },
      { role: 'vents', audio: mono(horns), volume: 0.78 },
    ],
  };
}
