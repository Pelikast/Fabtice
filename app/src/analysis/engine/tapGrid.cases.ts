// The measurement bench of the tapped correction (`tapGrid.ts`): truth grids,
// a grid in force that is wrong in a passage, the network's outputs, and
// simulated tappers. Deterministic (seeded), used only by the tests
// (`tapGrid.bench.test.ts`).
//
// Cases
//   - Recorded network outputs with their true beats:
//       · two pieces of the chord bench as the app computes them (So What,
//         Blues for Bird, old-record condition), with the grid the owner had
//         (analyser version 4: bar-to-bar jumps);
//       · the demo piece altered (a gap, a silence, a wind line): the network
//         itself loses or adds beats there; the grid before the repair;
//       · the chord bench pieces, the network's outputs erased over eight
//         bars (« it heard nothing useful ») or moved half a beat (« it heard
//         the off-beats »): the grid the analysis gives on them.
//   - Synthetic outputs (a peak at each beat the network « finds »), the
//     analysis's grid on them, for truths the recordings lack: a steady
//     tempo with a planted bump (the tempo case set), rubato, a fermata
//     (held 2.5, 1.7 and exactly 2 beats), a brief strong ritardando, a brief
//     strong accelerando; in the passage the network reads another tempo,
//     adds beats during the held note, or hears nothing.
// The user chooses the last bar line of the grid in force that is right
// before the passage (a true downbeat) and taps the true beats from it to
// one bar after the passage.
//
// Tappers: precise; jitter σ 15, 30, 50 ms (95 % of the taps within ±30,
// ±60, ±100 ms); constantly early (−80 ms) or late (+120 ms); a slow drift
// (−40 → +60 ms over the passage); forgotten taps (10 %, 20 %, with runs of
// two); extra taps (10 %: doubled 30 to 90 ms later, or stray between two
// beats); counting in (two bars of taps on the beats before the bar); at
// three-quarter speed (the errors scale with the playback rate in source
// time); in half notes; and combinations.

import { DEMO_SWING } from '../demoSwing';
import type { GridHint } from '../types';
import { downProbAt, postMinimal, type BeatActivations } from './beats';
import appRecorded from './fixtures/network-cases/app-cases.json';
import benchRecorded from './fixtures/network-cases/bench-cases.json';
import { rng } from './fixtures/inputs.mjs';
import networkRecorded from './fixtures/network-cases/network-cases.json';
import { gridFromActivations, gridFromBeats } from './pipeline';
import { downbeatOutput, fromTempo, gauss, stretched, timeAt, type Truth } from './repair.cases';
import { levelCases } from './tempo.cases';

export interface TapTruth {
  times: number[];
  downbeat: number;
  m: number;
}

export interface TapCase {
  name: string;
  family: 'recorded' | 'bump' | 'rubato' | 'fermata' | 'ritardando' | 'accelerando' | 'nothing';
  truth: TapTruth;
  act: BeatActivations;
  /** The grid in force: right before the passage, wrong in it. */
  grid: GridHint;
  /** Truth index of the chosen bar's start (a grid downbeat) and of the last beat tapped. */
  fromK: number;
  endK: number;
  /** Grid index of the chosen bar's start. */
  fromIdx: number;
}

const unpack = (s: string) => Float32Array.from(new Int8Array(Uint8Array.from(Buffer.from(s, 'base64')).buffer), (x) => x / 10);

const truthOf = (t: Truth): TapTruth => ({ times: t.beats, downbeat: Math.max(0, t.numbers.indexOf(1)), m: t.m });
const hintOf = (g: { beats: number[]; numbers: number[]; beatsPerBar: number }): GridHint => ({ times: g.beats, downbeat: Math.max(0, g.numbers.indexOf(1)), meter: { numerator: g.beatsPerBar, denominator: 4 } });

const isDown = (i: number, d: number, m: number) => (((i - d) % m) + m) % m === 0;

/**
 * The bar the user would choose for a passage starting at `start`: the last
 * downbeat of the grid in force before it (at least a beat before) that is a
 * true downbeat, the grid right on the bar before it too. Null when none.
 */
export function chooseBar(truth: TapTruth, grid: GridHint, start: number): { fromIdx: number; fromK: number } | null {
  const m = grid.meter.numerator;
  if (m !== truth.m) return null;
  for (let i = grid.times.length - 1; i >= m; i--) {
    const t = grid.times[i]!;
    if (t > start - 0.2 || !isDown(i, grid.downbeat, m)) continue;
    const k = truth.times.findIndex((x) => Math.abs(x - t) <= 0.035);
    if (k < m || !isDown(k, truth.downbeat, truth.m)) continue;
    // The bar before agrees beat for beat.
    let ok = true;
    for (let q = 1; q <= m && ok; q++) ok = Math.abs(grid.times[i - q]! - truth.times[k - q]!) <= 0.05;
    if (ok) return { fromIdx: i, fromK: k };
  }
  return null;
}

function make(name: string, family: TapCase['family'], truth: TapTruth, act: BeatActivations, grid: GridHint, passage: [number, number]): TapCase | null {
  const at = chooseBar(truth, grid, passage[0]);
  if (!at) return null;
  let endK = truth.times.findIndex((x) => x >= passage[1] - 1e-6);
  if (endK < 0) endK = truth.times.length - 1;
  endK = Math.min(truth.times.length - 2, endK + truth.m);
  if (endK <= at.fromK + 4) return null;
  return { name, family, truth, act, grid, fromK: at.fromK, endK, fromIdx: at.fromIdx };
}

// ---------------------------------------------------------------- synthetic outputs

/** Beat and downbeat logits (50 frames/s) whose peaks are `detected`; the downbeat output from `downAt`. */
export function activationsFrom(detected: readonly number[], downAt: ((t: number) => number) | null, seconds: number, seed: number, strength = 6): BeatActivations {
  const fps = 50;
  const frames = Math.ceil((seconds + 2) * fps);
  const r = rng(seed);
  const beat = new Float32Array(frames);
  const down = new Float32Array(frames);
  for (let f = 0; f < frames; f++) beat[f] = -6 + 0.5 * (r() - 0.5);
  for (const t of detected) {
    const fc = t * fps;
    for (let f = Math.max(0, Math.floor(fc) - 3); f <= Math.min(frames - 1, Math.ceil(fc) + 3); f++) {
      const v = -6 + (6 + strength) * Math.exp(-0.5 * ((f - fc) / 0.9) ** 2);
      if (v > beat[f]!) beat[f] = v;
    }
  }
  for (let f = 0; f < frames; f++) {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, downAt ? downAt(f / fps) : 0.1));
    down[f] = Math.log(p / (1 - p));
  }
  return { beat, down, frames, fps };
}

/** What the network does in the passage [j0, j1] (truth indices). */
type Failure = 'half' | 'double' | 'nothing' | 'continues' | 'offbeat';

function detectWith(truth: Truth, j0: number, j1: number, failure: Failure, seed: number, jitter = 0.012): number[] {
  const r = rng(seed);
  const b = truth.beats;
  const out: number[] = [];
  for (let k = 0; k < b.length; k++) {
    if (k <= j0 || k >= j1) out.push(b[k]!);
  }
  const inside: number[] = [];
  if (failure === 'half') for (let k = j0 + 2; k < j1; k += 2) inside.push(b[k]!);
  if (failure === 'double') for (let u = j0 + 0.5; u < j1 - 0.25; u += 0.5) inside.push(timeAt(b, u));
  if (failure === 'offbeat') for (let k = j0 + 1; k < j1; k++) inside.push(timeAt(b, k + 0.5));
  if (failure === 'continues') {
    // The network goes on at the tempo before the passage (beats added during a held note), then finds the music again.
    const d = b[j0]! - b[j0 - 1]!;
    for (let t = b[j0]! + d; t < b[j1]! - 0.4 * d; t += d) inside.push(t);
  }
  return [...out, ...inside].sort((x, y) => x - y).map((t) => t + jitter * gauss(r));
}

function synthetic(name: string, family: TapCase['family'], truth: Truth, j0: number, j1: number, failure: Failure, evidence: 'sharp' | 'weak', seed: number): TapCase | null {
  const detected = detectWith(truth, j0, j1, failure, seed);
  const passage: [number, number] = [truth.beats[j0]!, truth.beats[j1]!];
  const downAt = downbeatOutput(truth, evidence, seed + 7, failure === 'continues' ? null : passage);
  const seconds = truth.beats[truth.beats.length - 1]! + 1;
  const act = activationsFrom(detected, downAt, seconds, seed + 11);
  const grid = hintOf(gridFromBeats(detected, downAt).grid);
  return make(`${name} | network ${failure} | ${evidence}`, family, truthOf(truth), act, grid, passage);
}

/** A tempo that dips (or rises) to `depth` of itself over `bars` bars from time `at`, then comes back over as long. */
function dip(bpm: number, at: number, bars: number, m: number, depth: number): (t: number) => number {
  const len = (bars * m * 60) / (bpm * Math.sqrt(depth));
  return (t) => {
    if (t < at || t > at + 2 * len) return bpm;
    const u = (t - at) / len; // 0…2
    const w = u <= 1 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 1));
    return bpm * (1 + (depth - 1) * w);
  };
}

export function syntheticCases(): TapCase[] {
  const out: (TapCase | null)[] = [];
  let seed = 31000;
  // A steady tempo with a planted bump: the tempo case set (its own outputs).
  const names = [
    'swing 120 4/4 | half for 4 bars at middle | jitter 12 ms | sharp',
    'ballad 72 4/4 | double for 2 bars at middle | jitter 25 ms | weak',
    'waltz 150 3/4 | 2/3 tempo for 4 bars at middle | jitter 12 ms | lost',
    'drift 100→116 4/4 | 3/2 tempo for 8 bars at middle | jitter 25 ms | none',
    'fast 200 4/4 | half for 8 bars at middle | jitter 12 ms | sharp',
    'rubato ±6% 4/4 | double for 4 bars at middle | jitter 12 ms | weak',
  ];
  const level = levelCases();
  for (const n of names) {
    const c = level.find((x) => x.name === n);
    if (!c) continue;
    const truth = truthOf(c.truth);
    const fps = 50;
    const frames = Math.ceil((c.truth.beats[c.truth.beats.length - 1]! + 2) * fps);
    const act = activationsFrom(c.detected, c.downAt, frames / fps - 2, seed++);
    const grid = hintOf(gridFromBeats(c.detected, c.downAt).grid);
    out.push(make(n, 'bump', truth, act, grid, c.passages[0]!));
  }
  for (const m of [4, 3]) {
    // Rubato, the network losing it for 8 bars.
    const rub = fromTempo(160, (t) => 90 * (1 + 0.12 * Math.sin((2 * Math.PI * t) / 10)), m);
    const j = Math.round(rub.beats.length * 0.45);
    out.push(synthetic(`rubato ±12% ${m}/4`, 'rubato', rub, j, j + 8 * m, 'half', 'sharp', seed++));
    out.push(synthetic(`rubato ±12% ${m}/4`, 'nothing', rub, j, j + 8 * m, 'nothing', 'weak', seed++));
    // Fermatas: a beat held 2.5, 1.7, exactly 2 times; the network adds beats during the held note.
    for (const hold of [2.5, 1.7, 2]) {
      const base = fromTempo(150, () => 100, m);
      const at = Math.round(base.beats.length * 0.5);
      const tr = stretched(base, (i, d) => (i === at ? d * hold : d));
      out.push(synthetic(`fermata ×${hold} ${m}/4`, 'fermata', tr, at - 2 * m, at + 3 * m, 'continues', 'sharp', seed++));
    }
    // A brief strong ritardando (to 60 % over two bars, back over two) and accelerando (to 145 %).
    for (const [family, depth, failure] of [
      ['ritardando', 0.6, 'double'],
      ['ritardando', 0.6, 'nothing'],
      ['accelerando', 1.45, 'half'],
      ['accelerando', 1.45, 'offbeat'],
    ] as const) {
      const tr = fromTempo(150, dip(120, 70, 2, m, depth), m);
      const j0 = tr.beats.findIndex((t) => t >= 70) - 1;
      const j1 = tr.beats.findIndex((t) => t >= 70 + (2 * 2 * m * 60) / (120 * Math.sqrt(depth))) + 1;
      out.push(synthetic(`brief ${family} to ${Math.round(depth * 100)} % ${m}/4`, family, tr, j0, j1, failure, 'sharp', seed++));
    }
  }
  return out.filter((c): c is TapCase => c !== null);
}

// ---------------------------------------------------------------- recorded outputs

interface RecordedTruthCase {
  beat: string;
  down: string;
  truth: { times: number[]; downbeat: number; meter: number };
}

/** Erase the beat output over [t0, t1] (noise), or move it half a beat (`offbeat`); the downbeat output becomes noise there. */
function damaged(act: BeatActivations, truth: TapTruth, t0: number, t1: number, how: 'nothing' | 'offbeat', seed: number): BeatActivations {
  const r = rng(seed);
  const beat = act.beat.slice();
  const down = act.down.slice();
  const f0 = Math.round(t0 * act.fps);
  const f1 = Math.round(t1 * act.fps);
  const half = Math.round((0.5 * (truth.times[1]! - truth.times[0]!)) * act.fps);
  for (let f = f0; f <= f1 && f < act.frames; f++) {
    beat[f] = how === 'nothing' ? -6 + 1.5 * (r() - 0.5) : act.beat[Math.max(0, f - half)]!;
    down[f] = -5 + 2 * r();
  }
  return { ...act, beat, down };
}

export function recordedCases(full: boolean): TapCase[] {
  const out: (TapCase | null)[] = [];
  // The owner's two pieces, the grid of version 4 (no last safety net): from its first jump, eight bars.
  for (const [name, r] of Object.entries(appRecorded.cases as unknown as Record<string, RecordedTruthCase>)) {
    const beat = unpack(r.beat);
    const act: BeatActivations = { beat, down: unpack(r.down), frames: beat.length, fps: appRecorded.fps };
    const truth: TapTruth = { times: r.truth.times, downbeat: r.truth.downbeat, m: r.truth.meter };
    const grid = hintOf(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), undefined, undefined, undefined, undefined, null).grid);
    const wrong = firstWrong(truth, grid);
    if (wrong !== null) out.push(make(`${name} (version 4 grid)`, 'recorded', truth, act, grid, [wrong, wrong + 8 * truth.m * (truth.times[1]! - truth.times[0]!)]));
  }
  // The demo piece, altered: the network fails in the passage; the grid before the repair.
  const demo: TapTruth = { times: DEMO_SWING.beats.map((b) => b[0]), downbeat: DEMO_SWING.beats.findIndex((b) => b[1] === 1), m: 4 };
  for (const [name, r] of Object.entries(networkRecorded.cases as unknown as Record<string, { passage: [number, number] | null; beat: number[]; down: number[] }>)) {
    if (!r.passage) continue;
    const act: BeatActivations = { beat: Float32Array.from(r.beat), down: Float32Array.from(r.down), frames: r.beat.length, fps: networkRecorded.fps };
    const grid = hintOf(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), null, null, null, undefined, null).grid);
    out.push(make(`demo ${name}`, 'recorded', demo, act, grid, r.passage));
  }
  // The chord bench pieces, the outputs damaged over eight bars.
  let seed = 41000;
  const entries = Object.entries(benchRecorded.cases as unknown as Record<string, RecordedTruthCase & { split: string }>);
  for (const [i, [name, r]] of entries.entries()) {
    if (!full && i % 3 !== 0) continue;
    const beat = unpack(r.beat);
    const act0: BeatActivations = { beat, down: unpack(r.down), frames: beat.length, fps: benchRecorded.fps };
    const truth: TapTruth = { times: r.truth.times, downbeat: r.truth.downbeat, m: r.truth.meter };
    const k0 = truth.downbeat + Math.round((truth.times.length * 0.4) / truth.m) * truth.m;
    const k1 = Math.min(truth.times.length - 1, k0 + 8 * truth.m);
    for (const how of ['nothing', 'offbeat'] as const) {
      const act = damaged(act0, truth, truth.times[k0]! + 0.05, truth.times[k1]! - 0.05, how, seed++);
      const grid = hintOf(gridFromActivations(act).grid);
      out.push(make(`${name} | outputs ${how === 'nothing' ? 'erased' : 'off-beat'} for 8 bars`, how === 'nothing' ? 'nothing' : 'recorded', truth, act, grid, [truth.times[k0]!, truth.times[k1]!]));
    }
  }
  return out.filter((c): c is TapCase => c !== null);
}

/** Source time of the first beat of the truth where the grid goes wrong (a true beat with no grid beat within 70 ms), after its first bars. */
function firstWrong(truth: TapTruth, grid: GridHint): number | null {
  for (let k = 2 * truth.m; k < truth.times.length; k++) {
    const t = truth.times[k]!;
    if (!grid.times.some((g) => Math.abs(g - t) <= 0.07)) return truth.times[Math.max(0, k - 1)]!;
  }
  return null;
}

// ---------------------------------------------------------------- tappers

export interface Tapper {
  name: string;
  /** Gaussian spread of each tap (s, in the time the user hears). */
  sigma: number;
  /** Constant offset (s; negative: early), and a drift from `offset` to `offset + drift` over the passage. */
  offset: number;
  drift: number;
  /** Share of forgotten taps, and of those followed by a second forgotten one. */
  forget: number;
  forgetRun: number;
  /** Share of beats with a doubled tap, and of stray taps between beats. */
  doubled: number;
  stray: number;
  /** Playback rate (0.75: three-quarter speed); the errors shrink by it in source time. */
  rate: number;
  /** Taps on the two bars before the chosen bar too. */
  countIn: boolean;
  /** Taps every n beats (2: half notes in 4/4). */
  every: number;
}

const T0: Tapper = { name: 'precise', sigma: 0.004, offset: 0, drift: 0, forget: 0, forgetRun: 0, doubled: 0, stray: 0, rate: 1, countIn: false, every: 1 };

export function tappers(): Tapper[] {
  const t = (name: string, p: Partial<Tapper>): Tapper => ({ ...T0, ...p, name });
  return [
    t('precise', {}),
    t('±30 ms', { sigma: 0.015 }),
    t('±60 ms', { sigma: 0.03 }),
    t('±100 ms', { sigma: 0.05 }),
    t('early −80 ms ±60', { sigma: 0.03, offset: -0.08 }),
    t('late +120 ms ±60', { sigma: 0.03, offset: 0.12 }),
    t('drift −40→+60 ms ±30', { sigma: 0.015, offset: -0.04, drift: 0.1 }),
    t('forgets 10 % ±30', { sigma: 0.015, forget: 0.1, forgetRun: 0.3 }),
    t('forgets 20 % ±30', { sigma: 0.015, forget: 0.2, forgetRun: 0.3 }),
    t('extra 10 % ±30', { sigma: 0.015, doubled: 0.06, stray: 0.04 }),
    t('count-in, late +120 ±60', { sigma: 0.03, offset: 0.12, countIn: true }),
    t('¾ speed ±60', { sigma: 0.03, offset: -0.03, rate: 0.75 }),
    t('half notes ±30', { sigma: 0.015, every: 2 }),
    t('average: −40 ±60, drift, 10 % forgotten, 5 % extra', { sigma: 0.03, offset: -0.04, drift: 0.05, forget: 0.1, forgetRun: 0.3, doubled: 0.03, stray: 0.02 }),
    t('poor: +60 ±100, 20 % forgotten, 10 % extra', { sigma: 0.05, offset: 0.06, forget: 0.2, forgetRun: 0.3, doubled: 0.05, stray: 0.05 }),
  ];
}

/** The taps of `tapper` on the true beats fromK…endK (and the two bars before with `countIn`), in source seconds. */
export function simulateTaps(c: TapCase, tapper: Tapper, seed: number): number[] {
  const r = rng(seed);
  const b = c.truth.times;
  const out: number[] = [];
  const first = tapper.countIn ? Math.max(0, c.fromK - 2 * c.truth.m) : c.fromK;
  const span = Math.max(1, b[c.endK]! - b[c.fromK]!);
  let skipNext = false;
  for (let k = first; k <= c.endK; k++) {
    if ((k - c.fromK) % tapper.every !== 0) continue;
    const u = Math.max(0, (b[k]! - b[c.fromK]!) / span);
    const err = (tapper.offset + tapper.drift * u + tapper.sigma * gauss(r)) * tapper.rate;
    // The last tap is never forgotten: it is the one the user ends on.
    if (k > c.fromK && k < c.endK) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (r() < tapper.forget) {
        skipNext = r() < tapper.forgetRun;
        continue;
      }
    }
    const t = b[k]! + err;
    out.push(t);
    if (r() < tapper.doubled) out.push(t + (0.03 + 0.06 * r()) * tapper.rate);
    if (k < c.endK && r() < tapper.stray) out.push(b[k]! + (0.3 + 0.4 * r()) * (b[k + 1]! - b[k]!));
  }
  return out.sort((x, y) => x - y);
}

// ---------------------------------------------------------------- scores

/**
 * The network's own constant lag on this piece (s): the median of grid − truth over the eight bars before the
 * chosen bar, where the grid in force is right. The beats of the passage are measured against the truth shifted
 * by it: the grid before the bar has it too, and the click must not jump at the bar (the recorded pieces show
 * 0 to 40 ms; the synthetic ones none).
 */
export function networkLag(c: TapCase): number {
  const d: number[] = [];
  for (let q = 1; q <= 8 * c.truth.m && c.fromK - q >= 0 && c.fromIdx - q >= 0; q++) d.push(c.grid.times[c.fromIdx - q]! - c.truth.times[c.fromK - q]!);
  d.sort((x, y) => x - y);
  return d.length ? d[Math.floor(d.length / 2)]! : 0;
}

export interface TapScore {
  /** Errors of the passage's beats (index-matched from the chosen bar), ms. */
  median: number;
  worst: number;
  within35: number;
  within70: number;
  /** The passage holds as many beats as the truth. */
  count: boolean;
  /** True downbeats of the eight bars after the passage shown as downbeats (70 ms). */
  phase: number;
  /** Beats found (F-measure, 70 ms) over the eight bars after the passage. */
  after: number;
  /** The first beat after the passage within 70 ms of the true one. */
  junction: boolean;
  /** Every beat before the chosen bar as it was. */
  prefixKept: boolean;
}

export function scoreTap(c: TapCase, out: GridHint): TapScore {
  const b = c.truth.times;
  const m = c.truth.m;
  const iFrom = Math.abs((out.times[c.fromIdx] ?? NaN) - c.grid.times[c.fromIdx]!) < 1e-9 ? c.fromIdx : -1;
  const lag = networkLag(c);
  const errs: number[] = [];
  for (let k = c.fromK; k <= c.endK; k++) {
    const i = iFrom + (k - c.fromK);
    errs.push(iFrom >= 0 && i < out.times.length ? Math.abs(out.times[i]! - b[k]! - lag) * 1000 : 1e4);
  }
  errs.sort((x, y) => x - y);
  const end = b[c.endK]!;
  const iEnd = iFrom + (c.endK - c.fromK);
  const count = iFrom >= 0 && iEnd < out.times.length && Math.abs(out.times[iEnd]! - end) < 0.5 * (b[c.endK]! - b[c.endK - 1]!);
  // Eight bars after the passage.
  const k1 = Math.min(b.length - 1, c.endK + 8 * m);
  const near = (t: number) => {
    let best = -1;
    for (let i = Math.max(0, iEnd - 2); i < out.times.length && out.times[i]! <= t + 0.1; i++) if (Math.abs(out.times[i]! - t) <= 0.07 && (best < 0 || Math.abs(out.times[i]! - t) < Math.abs(out.times[best]! - t))) best = i;
    return best;
  };
  let downs = 0;
  let downOk = 0;
  let hits = 0;
  for (let k = c.endK + 1; k <= k1; k++) {
    const i = near(b[k]!);
    if (i >= 0) hits++;
    if (isDown(k, c.truth.downbeat, m)) {
      downs++;
      if (i >= 0 && isDown(i, out.downbeat, out.meter.numerator)) downOk++;
    }
  }
  const shown = out.times.filter((t) => t > end + 0.035 && t <= b[k1]! + 0.035).length;
  const truthN = k1 - c.endK;
  const p = shown ? hits / shown : 0;
  const rc = truthN ? hits / truthN : 1;
  const prefixKept = c.grid.times.slice(0, c.fromIdx).every((t, i) => out.times[i] === t);
  const nextOut = out.times.find((t) => t > end + 0.5 * (b[c.endK + 1]! - end));
  return {
    median: errs[Math.floor((errs.length - 1) / 2)]!,
    worst: errs[errs.length - 1]!,
    within35: errs.filter((e) => e <= 35).length / errs.length,
    within70: errs.filter((e) => e <= 70).length / errs.length,
    count,
    phase: downs ? downOk / downs : 1,
    after: truthN ? (p + rc ? (2 * p * rc) / (p + rc) : 0) : 1,
    junction: nextOut !== undefined && c.endK + 1 < b.length && Math.abs(nextOut - b[c.endK + 1]!) <= 0.07,
    prefixKept,
  };
}

/** The grid in force scored the same way (what the user had before tapping). */
export function scoreBefore(c: TapCase): TapScore {
  return scoreTap(c, c.grid);
}
