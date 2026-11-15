// The case set of the beat repair (`repair.ts`), with known answers: beat
// sequences of several kinds (steady, slow drift, rubato, ritardando,
// accelerando, fermatas, free introduction, a tempo change that holds; 4/4 and
// 3/4; the demo piece's real beats), as a network would give them (timing
// jitter, downbeat evidence), and the same sequences with each failure mode of
// the network injected at several places and lengths. Deterministic (seeded),
// used only by the tests.

import { DEMO_SWING } from '../demoSwing';
import { rng } from './fixtures/inputs.mjs';
import { firstDownbeat, makeGrid, renumber } from './grid';
import { inferMeter } from './meter';
import { gridFromBeats } from './pipeline';
import { REPAIR, type DownbeatAt, type RepairOptions } from './repair';

export interface Truth {
  beats: number[];
  /** Position of each beat in its bar, 1-based. */
  numbers: number[];
  m: number;
}

export type Evidence = 'sharp' | 'weak' | 'none';

export interface Case {
  name: string;
  base: string;
  /** `clean`: nothing injected, the repair must change nothing. */
  failure: string;
  truth: Truth;
  /** The beats as the network would give them. */
  detected: number[];
  /** The network's downbeat output at any time (null: none). */
  downAt: DownbeatAt | null;
  evidence: Evidence;
  jitter: number;
  /** Source time span of the injected failure. */
  passage: [number, number] | null;
}

// ---------------------------------------------------------------- base sequences (the truth)

/** Beats from a tempo function of time (BPM), `pickup` beats before the first downbeat. */
function fromTempo(seconds: number, bpm: (t: number) => number, m: number, pickup = 1, t0 = 0.4): Truth {
  const beats: number[] = [];
  let t = t0;
  while (t < seconds) {
    beats.push(t);
    t += 60 / bpm(t);
  }
  return { beats, numbers: beats.map((_, i) => ((((i - pickup) % m) + m) % m) + 1), m };
}

/** A truth whose intervals are multiplied by `stretch[i]` (fermatas, a free introduction). */
function stretched(base: Truth, stretch: (i: number, d: number) => number): Truth {
  const beats = [base.beats[0]!];
  for (let i = 1; i < base.beats.length; i++) beats.push(beats[i - 1]! + stretch(i - 1, base.beats[i]! - base.beats[i - 1]!));
  return { ...base, beats };
}

export interface Base {
  name: string;
  truth: Truth;
  /** No failure is injected into it (it is ambiguous by itself, see `ambiguous fermatas`). */
  cleanOnly?: boolean;
}

export function baseSequences(): Base[] {
  const out: Base[] = [];
  const add = (name: string, truth: Truth, cleanOnly = false) => out.push({ name, truth, cleanOnly });
  for (const m of [4, 3]) {
    const s = `${m}/4`;
    add(`steady 72 ${s}`, fromTempo(190, () => 72, m));
    add(`steady 140 ${s}`, fromTempo(150, () => 140, m, 2));
    add(`drift 72→86 ${s}`, fromTempo(190, (t) => 72 + (14 * t) / 190, m));
    add(`rubato ±8% ${s}`, fromTempo(160, (t) => 120 * (1 + 0.08 * Math.sin((2 * Math.PI * t) / 16)), m));
    add(`rubato ±12% ${s}`, fromTempo(160, (t) => 90 * (1 + 0.12 * Math.sin((2 * Math.PI * t) / 10)), m));
    // A ritardando over the last 8 bars, down to 60 % of the tempo, and a held last note.
    {
      const tr = fromTempo(150, (t) => (t < 130 ? 100 : 100 * Math.max(0.6, 1 - (0.4 * (t - 130)) / 18)), m);
      add(`ritardando ${s}`, stretched(tr, (i, d) => (i === tr.beats.length - 2 ? d * 3 : d)));
    }
    add(`accelerando 90→130 ${s}`, fromTempo(170, (t) => (t < 60 ? 90 : t < 90 ? 90 + (40 * (t - 60)) / 30 : 130), m));
    // Fermatas in the middle: a beat held 1.7 and 2.5 times, the bar count going on.
    {
      const tr = fromTempo(150, () => 110, m);
      const at = [Math.round(tr.beats.length * 0.4), Math.round(tr.beats.length * 0.6)];
      add(`fermatas ${s}`, stretched(tr, (i, d) => (i === at[0] ? d * 2.5 : i === at[1] ? d * 1.7 : d)));
      // Held exactly 2 and 3 beats: by its timing, the same as one and two missing beats.
      add(`ambiguous fermatas ${s}`, stretched(tr, (i, d) => (i === at[0] ? d * 2 : i === at[1] ? d * 3 : d)), true);
    }
    // A free introduction: 12 beats of uneven length, then the band in tempo.
    {
      const r = rng(7 + m);
      const tr = fromTempo(150, () => 96, m, 12);
      add(`free intro ${s}`, stretched(tr, (i, d) => (i < 12 ? d * Math.exp(0.25 * (r() * 2 - 1) * 1.7) : d)));
    }
    // A real tempo change that holds: 64 bars at 100, then 135.
    add(`100 then 135 ${s}`, fromTempo(64 * m * 0.6 + 100, (t) => (t < 64 * m * 0.6 ? 100 : 135), m));
    // A new tempo for 8 bars (a section played faster), then back.
    add(`8 bars faster ${s}`, fromTempo(150, (t) => (t >= 60 && t < 60 + (8 * m * 60) / 125 ? 125 : 100), m));
  }
  // The demo piece's real beats (synthetic swing, moving tempo), 4/4.
  add('demo swing 4/4', { beats: DEMO_SWING.beats.map((b) => b[0]), numbers: DEMO_SWING.beats.map((b) => b[1]), m: 4 });
  return out;
}

// ---------------------------------------------------------------- the network's view

/** Interpolated time of a fractional beat index of the truth (extrapolated beyond its ends). */
function timeAt(beats: readonly number[], u: number): number {
  const n = beats.length;
  if (u <= 0) return beats[0]! + u * (beats[1]! - beats[0]!);
  if (u >= n - 1) return beats[n - 1]! + (u - n + 1) * (beats[n - 1]! - beats[n - 2]!);
  const i = Math.floor(u);
  return beats[i]! + (u - i) * (beats[i + 1]! - beats[i]!);
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/**
 * The network's downbeat output over time: a bump at each true downbeat,
 * whose height depends on the evidence profile, a low floor elsewhere (and,
 * weak, a few missed downbeats and false ones). Inside `confused` (the
 * failure's span), the output is noise. Profiles measured on the demo piece:
 * the network gives ≥ 0.99 on its downbeats and ≤ 0.006 elsewhere (sharp).
 */
function downbeatOutput(truth: Truth, evidence: Evidence, seed: number, confused: [number, number] | null): DownbeatAt | null {
  if (evidence === 'none') return null;
  const r = rng(seed);
  const level = truth.beats.map((t, i) => {
    const inside = confused && t > confused[0] - 0.05 && t < confused[1] + 0.05;
    if (inside) return r() * 0.4;
    const down = truth.numbers[i] === 1;
    if (evidence === 'sharp') return down ? 0.97 + 0.03 * r() : 0.006 * r();
    const u = r();
    if (down) return u < 0.12 ? 0.05 + 0.2 * r() : 0.25 + 0.65 * r();
    return u < 0.05 ? 0.5 + 0.3 * r() : 0.35 * r();
  });
  const floor = evidence === 'sharp' ? 0.002 : 0.05;
  const width = 0.035;
  return (t: number) => {
    // Nearest true beat (bisection).
    const b = truth.beats;
    let lo = 0;
    let hi = b.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (b[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const j = Math.abs(b[lo]! - t) <= Math.abs(b[hi]! - t) ? lo : hi;
    const w = Math.exp(-0.5 * ((t - b[j]!) / width) ** 2);
    return floor + w * (level[j]! - floor);
  };
}

// ---------------------------------------------------------------- failures

export interface Failure {
  name: string;
  /** Truth beat indices [j0, j0 + span] the failure covers. */
  span: number;
  /** Detected beats replacing truth beats j0 + 1 … j0 + span - 1 (fractional truth indices). */
  inside: (j0: number) => number[];
}

/** The network follows another rate (`rate` detected beats per true beat) over `span` true beats, from phase `offset`. */
function burst(name: string, span: number, rate: number, offset = 0): Failure {
  return {
    name,
    span,
    inside: (j0) => {
      const out: number[] = [];
      for (let q = 1; ; q++) {
        const u = j0 + offset + q / rate;
        if (u > j0 + span - 0.5 / rate - 1e-9) break;
        out.push(u);
      }
      return out;
    },
  };
}

/** A bump then a dip: the first half at `up` beats for its true beats, the second half at `down`. */
function bumpDip(name: string, span: number, up: number, down: number): Failure {
  const h = span / 2;
  return {
    name,
    span,
    inside: (j0) => {
      const out: number[] = [];
      for (let q = 1; q <= up; q++) out.push(j0 + (q * h) / up);
      for (let q = 1; q < down; q++) out.push(j0 + h + (q * h) / down);
      return out;
    },
  };
}

export function failureModes(m: number): Failure[] {
  const bar = m;
  return [
    { name: 'extra beat', span: 2, inside: (j0) => [j0 + 0.5, j0 + 1] },
    { name: 'missing beat', span: 2, inside: () => [] },
    { name: 'two missing beats', span: 3, inside: () => [] },
    { name: 'misplaced beat', span: 2, inside: (j0) => [j0 + 0.7] },
    burst('2x for 1 bar', bar, 2),
    burst('2x for 2 bars', 2 * bar, 2),
    burst('3:2 for 2 bars', 2 * bar, 1.5),
    burst('4:3 for 2 bars', 2 * bar, 4 / 3),
    burst('3:4 for 2 bars', 2 * bar, 3 / 4),
    burst('2:3 for 2 bars', 2 * bar, 2 / 3),
    burst('half for 2 bars', 2 * bar, 0.5),
    burst('one more in 2 bars', 2 * bar, (2 * bar + 1) / (2 * bar)),
    burst('one less in 2 bars', 2 * bar, (2 * bar - 1) / (2 * bar)),
    burst('one more in 1 bar', bar, (bar + 1) / bar),
    burst('one less in 1 bar', bar, (bar - 1) / bar),
    burst('off-beats for 2 bars', 2 * bar, 1, 0.5),
    bumpDip('bump-dip, one more', 2 * bar, bar + 2, bar - 1),
    bumpDip('bump-dip, one less', 2 * bar, bar + 1, bar - 2),
    bumpDip('bump-dip, same count', 2 * bar, bar + 1, bar - 1),
  ];
}

// ---------------------------------------------------------------- the set

export const JITTERS = [0.012, 0.025] as const;
export const EVIDENCES: readonly Evidence[] = ['sharp', 'weak', 'none'];
/** Where failures are injected, as a fraction of the piece. */
export const PLACES = [0.3, 0.5, 0.7] as const;

function detect(truth: Truth, jitter: number, seed: number, failure: Failure | null, j0: number): number[] {
  const r = rng(seed);
  let us: number[] = truth.beats.map((_, i) => i);
  if (failure) us = [...us.slice(0, j0 + 1), ...failure.inside(j0), ...us.slice(j0 + failure.span)];
  return us.map((u) => timeAt(truth.beats, u) + jitter * gauss(r));
}

export function buildCases(): Case[] {
  const cases: Case[] = [];
  let seed = 1000;
  for (const { name: base, truth, cleanOnly } of baseSequences()) {
    for (const jitter of JITTERS) {
      for (const evidence of EVIDENCES) {
        seed++;
        cases.push({
          name: `${base} | clean | jitter ${jitter * 1000} ms | ${evidence}`,
          base,
          failure: 'clean',
          truth,
          detected: detect(truth, jitter, seed, null, 0),
          downAt: downbeatOutput(truth, evidence, seed + 7, null),
          evidence,
          jitter,
          passage: null,
        });
        for (const f of cleanOnly ? [] : failureModes(truth.m)) {
          for (const place of PLACES) {
            seed++;
            const j0 = Math.round(truth.beats.length * place);
            if (j0 + f.span + 12 >= truth.beats.length) continue;
            const passage: [number, number] = [truth.beats[j0]!, truth.beats[j0 + f.span]!];
            cases.push({
              name: `${base} | ${f.name} at ${Math.round(place * 100)} % | jitter ${jitter * 1000} ms | ${evidence}`,
              base,
              failure: f.name,
              truth,
              detected: detect(truth, jitter, seed, f, j0),
              downAt: downbeatOutput(truth, evidence, seed + 7, passage),
              evidence,
              jitter,
              passage,
            });
          }
        }
      }
    }
  }
  return cases;
}

// ---------------------------------------------------------------- what the app shows, and how right it is

/** Beats and bar numbers as the app shows them: bars every m beats from one downbeat. */
export interface Outcome {
  beats: number[];
  numbers: number[];
  m: number;
  repaired: number;
}

const flat = () => 0.5;

/** The analysis before the repair: the metre's path, then only its first downbeat (`AnalysedBeats.downbeat`). */
export function before(c: Case): Outcome {
  const dp = c.detected.map((t) => (c.downAt ?? flat)(t));
  const m = inferMeter(dp, { candidates: [3, 4] });
  const g = makeGrid(c.detected, m.numbers, m.beatsPerBar);
  return { beats: c.detected.slice(), numbers: renumber(c.detected, m.beatsPerBar, firstDownbeat(g)), m: m.beatsPerBar, repaired: 0 };
}

/** The analysis now (`pipeline.ts#gridFromBeats`), with given repair options (null: no repair, the new phase only). */
export function after(c: Case, o: RepairOptions | null = REPAIR): Outcome {
  const r = gridFromBeats(c.detected, c.downAt, o);
  return { beats: r.grid.beats, numbers: r.grid.numbers, m: r.grid.beatsPerBar, repaired: r.repairs.length };
}

export const TOLERANCE = 0.07;

/** One-to-one matching of found beats to true beats within the tolerance, nearest first: found index → true index. */
export function match(found: readonly number[], truth: readonly number[]): Map<number, number> {
  const pairs: [number, number, number][] = [];
  let j = 0;
  for (let i = 0; i < found.length; i++) {
    while (j < truth.length && truth[j]! < found[i]! - TOLERANCE) j++;
    for (let k = j; k < truth.length && truth[k]! <= found[i]! + TOLERANCE; k++) pairs.push([Math.abs(truth[k]! - found[i]!), i, k]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const used = new Set<number>();
  const out = new Map<number, number>();
  for (const [, i, k] of pairs) {
    if (out.has(i) || used.has(k)) continue;
    out.set(i, k);
    used.add(k);
  }
  return out;
}

export interface Score {
  recall: number;
  precision: number;
  /** True beats of the passage (its two ends included) that are found. */
  passageRecall: number | null;
  /** Beats too many (+) or too few (−) counted across the passage. */
  countError: number | null;
  /** True downbeats shown as downbeats, after the passage (whole piece when clean). */
  downbeats: number | null;
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const n = new Map<number, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export function score(c: Case, out: Outcome): Score {
  const t = c.truth;
  const pairs = match(out.beats, t.beats);
  const p = c.passage;
  const hitTruth = new Set(pairs.values());
  let inP = 0;
  let inPHit = 0;
  if (p) {
    t.beats.forEach((x, k) => {
      if (x < p[0] - 1e-9 || x > p[1] + 1e-9) return;
      inP++;
      if (hitTruth.has(k)) inPHit++;
    });
  }
  let countError: number | null = null;
  if (p) {
    const pre: number[] = [];
    const post: number[] = [];
    for (const [i, k] of pairs) {
      if (t.beats[k]! < p[0]) pre.push(i - k);
      else if (t.beats[k]! > p[1]) post.push(i - k);
    }
    const a = mode(pre);
    const b = mode(post);
    countError = a === null || b === null ? null : b - a;
  }
  let downbeats: number | null = null;
  if (c.evidence !== 'none') {
    const from = p ? p[1] : -Infinity;
    const byTruth = new Map<number, number>();
    for (const [i, k] of pairs) byTruth.set(k, i);
    let total = 0;
    let ok = 0;
    t.beats.forEach((x, k) => {
      if (t.numbers[k] !== 1 || x <= from) return;
      total++;
      const i = byTruth.get(k);
      if (i !== undefined && out.numbers[i] === 1) ok++;
    });
    downbeats = total ? ok / total : null;
  }
  return {
    recall: hitTruth.size / t.beats.length,
    precision: pairs.size / Math.max(1, out.beats.length),
    passageRecall: p ? inPHit / Math.max(1, inP) : null,
    countError,
    downbeats,
  };
}
