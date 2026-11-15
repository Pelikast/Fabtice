// The case set of the tempo hardening (owner's reports of 14 and 15 November:
// a passage read at half tempo, then everything shifted; zigzags of the bar
// tempo curve). Deterministic, used only by the tests (`tempo.eval.test.ts`).
//
//   - Level passages: the network at half, double, 2/3 or 3/2 of the tempo for
//     1 to 32 bars, at the start, in the middle, at the end, or twice in one
//     piece; while it does, its downbeat output keeps marking the true bars
//     (measured on the chord bench, `web/spikes/accords/banc/temps.ts`: the
//     beats skip, the downbeats stay), or it is lost too (`lost`).
//   - Displaced runs: 1 to 16 beats placed early or late by 8 to 33 % of a
//     beat, then back (the worn-record « swung eighth » lock).
//   - Negatives, which must not move: a real lasting change to 4/3 or 2/3 of
//     the tempo, a real slowing to half tempo whose bars get twice as long, a
//     ritardando, fermatas, a free introduction, rubato (the base sequences of
//     `repair.cases.ts`).
// Each family has a tuning part and a held-out part (by base sequence).

import { rng } from './fixtures/inputs.mjs';
import { gridFromBeats } from './pipeline';
import { REPAIR } from './repair';
import { baseSequences, burst, downbeatOutput, fromTempo, gauss, match, stretched, timeAt, type Evidence, type Failure, type Outcome, type Truth } from './repair.cases';
import type { DownbeatAt } from './repair';

export interface TempoCase {
  name: string;
  family: 'level' | 'displaced' | 'negative';
  base: string;
  /** `tune`: the thresholds may be chosen on it; `held`: never looked at for tuning. */
  split: 'tune' | 'held';
  kind: string;
  truth: Truth;
  detected: number[];
  downAt: DownbeatAt | null;
  evidence: Evidence | 'lost';
  jitter: number;
  /** Source spans of the injected failures. */
  passages: [number, number][];
}

// ---------------------------------------------------------------- bases

interface TempoBase {
  name: string;
  truth: Truth;
  split: 'tune' | 'held';
}

function levelBases(): TempoBase[] {
  const n = (bpm: number, m: number) => ((3 * 32 + 24) * m * 60) / bpm; // room for 32-bar passages and context
  return [
    { name: 'swing 120 4/4', truth: fromTempo(n(120, 4), () => 120, 4), split: 'tune' },
    { name: 'drift 100→116 4/4', truth: fromTempo(n(108, 4), (t) => 100 + (16 * t) / n(108, 4), 4), split: 'tune' },
    { name: 'fast 200 4/4', truth: fromTempo(n(200, 4), () => 200, 4, 2), split: 'held' },
    { name: 'ballad 72 4/4', truth: fromTempo(n(72, 4), () => 72, 4), split: 'held' },
    { name: 'waltz 150 3/4', truth: fromTempo(n(150, 3), () => 150, 3), split: 'held' },
    { name: 'rubato ±6% 4/4', truth: fromTempo(n(130, 4), (t) => 130 * (1 + 0.06 * Math.sin((2 * Math.PI * t) / 20)), 4), split: 'held' },
  ];
}

// ---------------------------------------------------------------- the network's view

/** Detected beats: the truth with failures (each replaces truth beats j0+1 … j0+span−1) and timing jitter. */
function detect(truth: Truth, jitter: number, seed: number, failures: { f: Failure; j0: number }[]): number[] {
  const r = rng(seed);
  const us: number[] = [];
  let k = 0;
  for (const { f, j0 } of failures.slice().sort((a, b) => a.j0 - b.j0)) {
    while (k <= j0) us.push(k++);
    us.push(...f.inside(j0));
    k = j0 + f.span;
  }
  while (k < truth.beats.length) us.push(k++);
  return us.map((u) => timeAt(truth.beats, u) + jitter * gauss(r));
}

/** A run of `len` beats displaced by `shift` beats (early < 0), from j0 + 1. */
function displacedRun(len: number, shift: number): Failure {
  return { name: `${len} beats ${shift > 0 ? 'late' : 'early'} by ${Math.abs(shift)}`, span: len + 1, inside: (j0) => Array.from({ length: len }, (_, q) => j0 + 1 + q + shift) };
}

const LEVELS: { name: string; rate: number }[] = [
  { name: 'half', rate: 0.5 },
  { name: 'double', rate: 2 },
  { name: '2/3 tempo', rate: 2 / 3 },
  { name: '3/2 tempo', rate: 1.5 },
];
export const LEVEL_BARS = [1, 2, 4, 8, 16, 24, 32] as const;
const LEVEL_PLACES = ['start', 'middle', 'end', 'twice'] as const;

export function levelCases(): TempoCase[] {
  const out: TempoCase[] = [];
  let seed = 5000;
  for (const b of levelBases()) {
    const m = b.truth.m;
    const n = b.truth.beats.length;
    const firstDown = b.truth.numbers.indexOf(1);
    for (const lv of LEVELS) {
      for (const bars of LEVEL_BARS) {
        const span = bars * m;
        for (const place of LEVEL_PLACES) {
          // Passages start on a downbeat (the network keeps beat 1), or one beat later every other case.
          const offset = seed % 2;
          const at = (frac: number) => firstDown + Math.round((n * frac) / m) * m + offset;
          const starts =
            place === 'start' ? [firstDown + offset] : place === 'middle' ? [at(0.45)] : place === 'end' ? [n - 1 - span] : [at(0.25), at(0.62)];
          if (starts.some((j0) => j0 < 0 || j0 + span > n - 1) || (place === 'twice' && starts[0]! + span >= starts[1]!)) continue;
          for (const jitter of [0.012, 0.025]) {
            for (const evidence of ['sharp', 'weak', 'lost', 'none'] as const) {
              if (evidence === 'lost' && bars > 4) continue;
              seed++;
              const failures = starts.map((j0) => ({ f: burst(lv.name, span, lv.rate), j0 }));
              const passages = starts.map((j0) => [b.truth.beats[j0]!, b.truth.beats[j0 + span]!] as [number, number]);
              const confused = evidence === 'lost' ? passages[0]! : null;
              out.push({
                name: `${b.name} | ${lv.name} for ${bars} bars at ${place} | jitter ${jitter * 1000} ms | ${evidence}`,
                family: 'level',
                base: b.name,
                split: b.split,
                kind: lv.name,
                truth: b.truth,
                detected: detect(b.truth, jitter, seed, failures),
                downAt: evidence === 'none' ? null : downbeatOutput(b.truth, evidence === 'lost' ? 'sharp' : evidence, seed + 7, confused),
                evidence,
                jitter,
                passages,
              });
            }
          }
        }
      }
    }
  }
  return out;
}

export const SHIFTS = [0.08, 0.12, 0.18, 0.25, 0.33] as const;
export const RUNS = [1, 2, 4, 8, 16] as const;

export function displacedCases(): TempoCase[] {
  const out: TempoCase[] = [];
  let seed = 9000;
  const bases: TempoBase[] = [
    { name: 'swing 140 4/4', truth: fromTempo(150, () => 140, 4), split: 'tune' },
    { name: 'ballad 72 4/4', truth: fromTempo(200, () => 72, 4), split: 'held' },
    { name: 'waltz 150 3/4', truth: fromTempo(120, () => 150, 3), split: 'held' },
    { name: 'drift 100→116 4/4', truth: fromTempo(180, (t) => 100 + (16 * t) / 180, 4), split: 'held' },
  ];
  for (const b of bases) {
    const n = b.truth.beats.length;
    const firstDown = b.truth.numbers.indexOf(1);
    for (const len of RUNS) {
      for (const shift of SHIFTS) {
        for (const sign of [-1, 1]) {
          for (const onDown of [true, false]) {
            for (const jitter of [0.012, 0.025]) {
              seed++;
              // The run starts on a downbeat (its bar tempo zigzags) or on another beat.
              const j0 = firstDown + Math.round((n * 0.5) / b.truth.m) * b.truth.m - 1 + (onDown ? 0 : 1);
              const f = displacedRun(len, sign * shift);
              out.push({
                name: `${b.name} | ${f.name} from ${onDown ? 'a downbeat' : 'beat 2'} | jitter ${jitter * 1000} ms`,
                family: 'displaced',
                base: b.name,
                split: b.split,
                kind: `${len} beats by ${shift}`,
                truth: b.truth,
                detected: detect(b.truth, jitter, seed, [{ f, j0 }]),
                downAt: downbeatOutput(b.truth, 'sharp', seed + 7, null),
                evidence: 'sharp',
                jitter,
                passages: [[b.truth.beats[j0]!, b.truth.beats[j0 + len + 1]!]],
              });
            }
          }
        }
      }
    }
  }
  return out;
}

export function negativeCases(): TempoCase[] {
  const out: TempoCase[] = [];
  let seed = 12000;
  const bases: TempoBase[] = [
    // Real lasting changes at simple ratios: the bars follow (the downbeats come at the new bar length).
    { name: '120 then 160 (4/3), lasting', truth: fromTempo(200, (t) => (t < 90 ? 120 : 160), 4), split: 'held' },
    { name: '150 then 100 (2/3), lasting', truth: fromTempo(220, (t) => (t < 90 ? 150 : 100), 4), split: 'held' },
    { name: '132 then 66 (half), lasting', truth: fromTempo(240, (t) => (t < 100 ? 132 : 66), 4), split: 'held' },
    { name: '96 then 128 for 16 bars, then 96', truth: fromTempo(220, (t) => (t >= 80 && t < 80 + (16 * 4 * 60) / 128 ? 128 : 96), 4), split: 'held' },
    ...baseSequences().map((x) => ({ name: x.name, truth: x.truth, split: 'tune' as const })),
  ];
  // A ballad with a held last note and a slow start, drawn out by hand.
  {
    const tr = fromTempo(160, (t) => (t < 140 ? 66 : 66 * Math.max(0.55, 1 - (t - 140) / 30)), 4);
    bases.push({ name: 'ballad 66, rubato end, held note', truth: stretched(tr, (i, d) => (i === tr.beats.length - 2 ? d * 4 : d)), split: 'held' });
  }
  for (const b of bases) {
    for (const jitter of [0.012, 0.025]) {
      for (const evidence of ['sharp', 'weak', 'none'] as const) {
        seed++;
        out.push({
          name: `${b.name} | jitter ${jitter * 1000} ms | ${evidence}`,
          family: 'negative',
          base: b.name,
          split: b.split,
          kind: 'clean',
          truth: b.truth,
          detected: detect(b.truth, jitter, seed, []),
          downAt: evidence === 'none' ? null : downbeatOutput(b.truth, evidence, seed + 7, null),
          evidence,
          jitter,
          passages: [],
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- outcomes and scores

/** The analysis as it was (the beat repair of version 3 alone). */
export function previous(c: TempoCase): Outcome {
  const r = gridFromBeats(c.detected, c.downAt, REPAIR, null, null);
  return { beats: r.grid.beats, numbers: r.grid.numbers, m: r.grid.beatsPerBar, repaired: r.repairs.length };
}

/** The analysis now. */
export function current(c: TempoCase): Outcome {
  const r = gridFromBeats(c.detected, c.downAt);
  return { beats: r.grid.beats, numbers: r.grid.numbers, m: r.grid.beatsPerBar, repaired: r.repairs.length };
}

/** Bar tempi (BPM) of an outcome, bars counted from its numbering, within [from, to]. */
export function barTempi(out: Outcome, from = -Infinity, to = Infinity): number[] {
  const t: number[] = [];
  let last = -1;
  for (let i = 0; i < out.beats.length; i++) {
    if (out.numbers[i] !== 1) continue;
    if (last >= 0 && out.beats[last]! >= from - 0.07 && out.beats[i]! <= to + 0.07) t.push((60 * (i - last)) / (out.beats[i]! - out.beats[last]!));
    last = i;
  }
  return t;
}

export function jumpsOf(tempi: readonly number[], ratio = 1.3): number {
  let n = 0;
  for (let i = 1; i < tempi.length; i++) if (Math.max(tempi[i]! / tempi[i - 1]!, tempi[i - 1]! / tempi[i]!) >= ratio) n++;
  return n;
}

export function zigzagsOf(tempi: readonly number[], ratio = 1.05): number {
  let n = 0;
  for (let i = 1; i + 1 < tempi.length; i++) {
    const [a, b, c] = [tempi[i - 1]!, tempi[i]!, tempi[i + 1]!];
    if ((b >= a * ratio && b >= c * ratio) || (b * ratio <= a && b * ratio <= c)) n++;
  }
  return n;
}

export interface TempoScore {
  beatF: number;
  /** True downbeats shown as downbeats after the last passage (null without downbeat evidence or after the piece). */
  downAfter: number | null;
  /** Beats too many or too few across the passages, modulo nothing (0: the bars after are in place). */
  barsInPlace: boolean;
  jumps: number;
  zigzags: number;
  /** Mean distance of the passage's true beats to the nearest beat shown (ms). */
  passageError: number | null;
}

export function scoreTempo(c: TempoCase, out: Outcome): TempoScore {
  const t = c.truth;
  const pairs = match(out.beats, t.beats);
  const p = pairs.size / Math.max(1, out.beats.length);
  const r = pairs.size / t.beats.length;
  const last = c.passages.length ? Math.max(...c.passages.map((x) => x[1])) : -Infinity;
  const first = c.passages.length ? Math.min(...c.passages.map((x) => x[0])) : Infinity;
  // Beat offset (found index − true index) before the first and after the last passage.
  const mode = (v: number[]) => {
    const n = new Map<number, number>();
    for (const x of v) n.set(x, (n.get(x) ?? 0) + 1);
    return v.length ? [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0] : null;
  };
  const pre: number[] = [];
  const post: number[] = [];
  for (const [i, k] of pairs) {
    if (t.beats[k]! < first) pre.push(i - k);
    else if (t.beats[k]! > last) post.push(i - k);
  }
  const a = mode(pre);
  const b = mode(post);
  const barsInPlace = c.passages.length === 0 || a === null || b === null ? true : (b - a) % t.m === 0;
  let downAfter: number | null = null;
  if (c.downAt) {
    const byTruth = new Map<number, number>();
    for (const [i, k] of pairs) byTruth.set(k, i);
    let total = 0;
    let ok = 0;
    t.beats.forEach((x, k) => {
      if (t.numbers[k] !== 1 || x <= last) return;
      total++;
      const i = byTruth.get(k);
      if (i !== undefined && out.numbers[i] === 1) ok++;
    });
    downAfter = total ? ok / total : null;
  }
  let passageError: number | null = null;
  if (c.passages.length) {
    const errs: number[] = [];
    t.beats.forEach((x) => {
      if (!c.passages.some(([s, e]) => x >= s - 1e-9 && x <= e + 1e-9)) return;
      let best = Infinity;
      for (const y of out.beats) best = Math.min(best, Math.abs(y - x));
      errs.push(best);
    });
    passageError = errs.length ? (1000 * errs.reduce((s, x) => s + x, 0)) / errs.length : null;
  }
  const span: [number, number] = [t.beats[0]!, t.beats[t.beats.length - 1]!];
  return {
    beatF: p + r ? (2 * p * r) / (p + r) : 0,
    downAfter,
    barsInPlace,
    jumps: jumpsOf(barTempi(out, ...span)),
    zigzags: zigzagsOf(barTempi(out, ...span)),
    passageError,
  };
}

/** The truth as an outcome (for its own jumps and zigzags). */
export function truthOutcome(c: TempoCase): Outcome {
  return { beats: c.truth.beats, numbers: c.truth.numbers, m: c.truth.m, repaired: 0 };
}
