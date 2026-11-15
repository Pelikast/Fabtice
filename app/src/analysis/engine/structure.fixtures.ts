// Synthetic evidence for the tests of the structural evidence (repeats,
// known chart, reliability): pooled units with a chosen chord per beat, and
// tiny hand-written charts (never a real one).

import { N_CHORDS, NO_CHORD, QUALS, type EngineQuality, type PooledUnit } from './chords';
import { chord } from '../../harmony/chord';
import type { ChordQuality, Key } from '../../model/harmony';
import type { ReadBar, StandardChart } from '../../standards/irealRead';

/** Engine index of « root:quality ». */
export const ix = (root: number, q: EngineQuality): number => (((root % 12) + 12) % 12) * 14 + QUALS.indexOf(q);

/** Deterministic pseudo-random numbers in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * A unit whose network puts `p` on `c` (the rest spread evenly, with a
 * little noise), or a flat one when `c` is null (the network hears nothing
 * clear).
 */
export function unit(c: number | null, p: number, rand: () => number, t0 = 0, second: [number, number] | null = null): PooledUnit {
  const logp = new Float64Array(N_CHORDS);
  const probs = new Float64Array(N_CHORDS);
  let s = 0;
  for (let k = 0; k < N_CHORDS; k++) {
    probs[k] = (c === null ? 1 : (1 - p) / (N_CHORDS - 1)) * (0.6 + 0.8 * rand());
    s += probs[k]!;
  }
  if (c !== null) {
    const rest = 1 - p - (second ? second[1] : 0);
    for (let k = 0; k < N_CHORDS; k++) probs[k] = (probs[k]! / s) * rest;
    probs[c] = p;
    if (second) probs[second[0]] = second[1];
  } else for (let k = 0; k < N_CHORDS; k++) probs[k]! /= s;
  for (let k = 0; k < N_CHORDS; k++) logp[k] = Math.log(probs[k]!);
  return { t0, t1: t0 + 0.5, logp, pitch: new Float64Array(12), bass: new Float64Array(13), frames: 10 };
}

/** Beat numbers for `bars` bars of `bpb` beats, after `pickup` beats. */
export function numbersFor(bars: number, bpb: number, pickup = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < pickup; i++) out.push(bpb - pickup + i + 1);
  for (let b = 0; b < bars; b++) for (let k = 1; k <= bpb; k++) out.push(k);
  return out;
}

/** Argmax of each unit. */
export const best = (units: readonly PooledUnit[]): number[] =>
  units.map((u) => {
    let m = 0;
    for (let k = 1; k < N_CHORDS; k++) if (u.logp[k]! > u.logp[m]!) m = k;
    return m;
  });

const ENGINE_TO_CHART: Partial<Record<EngineQuality, ChordQuality>> = { maj: 'maj', min: 'min', '7': '7', maj7: 'maj7', min7: 'min7', hdim7: 'hdim7', dim7: 'dim7', maj6: 'maj6' };

/** A chart from bars of « root:quality » chords (one or two per bar, two at beats 0 and 2), in 4/4. */
export function makeChart(title: string, key: Key, bars: [number, EngineQuality][][], sections: Record<number, string> = {}): StandardChart {
  const meter = { numerator: 4, denominator: 4 };
  const read: ReadBar[] = bars.map((cs, i) => ({
    source: i,
    meter,
    chords: cs.map(([r, q], k) => ({ beat: k * 2, duration: cs.length === 1 ? 4 : 2, chord: chord(r, ENGINE_TO_CHART[q]!), text: `${r}${q}`, approximate: false })),
    alternates: [],
    section: sections[i] ?? null,
    comments: [],
    pass: 1,
    ending: null,
    simile: null,
  }));
  return {
    index: 0,
    title,
    rawTitle: title,
    composer: '',
    composerRaw: '',
    style: 'Medium Swing',
    feel: null,
    key,
    keyText: '',
    bpm: null,
    meter,
    meters: [meter],
    writtenBars: bars.length,
    bars: read,
    warnings: [],
  };
}

/** The engine chords of a chart, one per beat of one chorus (4/4). */
export function chartChordsPerBeat(bars: [number, EngineQuality][][], transpose = 0): number[] {
  const out: number[] = [];
  for (const cs of bars) for (let k = 0; k < 4; k++) {
    const [r, q] = cs.length === 1 ? cs[0]! : cs[k < 2 ? 0 : 1]!;
    out.push(ix(r + transpose, q));
  }
  return out;
}

export { NO_CHORD };
