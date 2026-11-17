// « Correction de la courbe en tapant le tempo » (C12): the grid of a
// difficult passage from the beats the user tapped, then the rest of the
// piece analysed again after it. The third manual tempo action, beside the
// two of `tempoFix.ts`; the rules of the automatic analysis are not touched:
// this is a path beside them, where the taps are very strong hints.
//
// The user hears the music and taps the space bar roughly on each beat from
// the chosen bar (a downbeat of the grid in force, right before it) to the end
// of the passage. The taps arrive in source seconds, as heard (`tapFix.ts#tapNow`
// takes the output latency off), so a slowed playback needs nothing special.
// What a tap is worth, and how it becomes a beat:
//
//   1. Who taps how. A tapper is early or late by a fairly constant amount
//      (usually a little early) and wanders around it (±30 to ±100 ms); some
//      taps are forgotten, some doubled; the tempo may move. A first guess of
//      the constant offset (`offsetGuess`): the shift that brings the most
//      taps onto the network's beat peaks, with a prior around −20 ms and a
//      bound of ±250 ms and a third of a beat, so that it never locks half a
//      beat off on a passage where the network hears the off-beats; taps
//      made during the count-in on the beats of the grid in force count
//      double (those beats are known).
//   2. Which taps are beats, and how many beats between two taps (`tapPath`):
//      dynamic programming over the taps. Each step from one kept tap to the
//      next holds 1 to `maxGap` tapped beats (more than one: forgotten taps,
//      filled at the local tempo); a tap may be dropped (doubled or stray);
//      the cost is the change of the beat length from one step to the next
//      (a Huber loss of its logarithm), an attraction to the local tapped
//      tempo, a cost per forgotten tap lowered where the network hears a
//      beat at the filled place, a cost per dropped tap, and, when the
//      network's downbeats are worth something here (measured on the bars
//      before the chosen bar), a reward for the bar lines the count puts on
//      them. A held beat (a fermata: one interval much longer than the beat
//      before, no tap inside) is one beat, not filled: its own cost, higher
//      when its length is close to a whole number of beats (then forgotten
//      taps are as likely, and the count goes on).
//   3. Where each beat goes (`placeBeats`): a robust least-squares fit of the
//      beat times and of the offset together. Each tap says « its beat + the
//      offset »; each beat near a credible network peak (within a window that
//      follows the tapper's own spread, at most a fifth of a beat) is pulled
//      onto it; the beat lengths change smoothly (second differences, with
//      robust weights so that a sudden change is not smeared, and none
//      across a held beat); the chosen bar's start and the beats before it
//      are fixed. Iterated: the spread of the taps is measured from the fit,
//      the peaks are matched again. Where the network heard nothing useful,
//      the beats are the smoothed taps.
//   4. After the last tapped beat (`end`), the rest of the piece is analysed
//      again as « Réanalyser le tempo à partir de cette mesure » does (peaks,
//      the whole beat analysis), from `end`; the bars go on counting from the
//      chosen bar, so the bar phase is carried. If the fresh analysis does
//      not join (its first beat not about one tapped beat after `end`: a half
//      beat, another metrical level), the beats are followed from `end` at
//      the last tapped tempo until they meet the fresh analysis for two bars.
//
// Taps every two or three beats of the grid in force (a ballad tapped in
// half notes, a 6/8 tapped in dotted quarters when the grid counts eighths)
// are recognised from their median spacing and filled (`level`).
//
// Pure; the worker runs it on the kept network outputs, the tests on recorded
// ones; without outputs (the stand-in analyser), the taps alone place the
// beats and the grid in force goes on after them.

import type { GridHint } from '../types';
import { downProbAt, pickPeaks, refinePeak, type BeatActivations } from './beats';
import { gridFromBeats } from './pipeline';
import { followBeats, periodBefore } from './tempoFix';

export interface TappedFixRequest {
  kind: 'tapped';
  /** Source time where the chosen bar starts: a beat (a downbeat) of `grid`. */
  from: number;
  /** The grid in force (beats, first downbeat, metre). */
  grid: GridHint;
  /** The taps as heard (source seconds), raw: any order, doubles allowed. */
  taps: number[];
}

export interface TapOptions {
  /**
   * Spread of the tempo from one beat to the next (share of the beat length): with the tapper's
   * own spread, it says how far apart two steps' beat lengths may be (their log ratio is scored
   * as a Gaussian of that variance, Huber beyond `zHuber`).
   */
  tempoSpread: number;
  zHuber: number;
  /** Weak attraction of each step's beat length to the local tapped tempo: `attract` × Huber(ln ratio, 0.25). */
  attract: number;
  /** Cost of one forgotten tap (a beat filled between two taps). */
  miss: number;
  /** A filled beat where the network hears a beat costs this much less (logit clipped to ±4, scaled to ±1). */
  beatEvidence: number;
  /** Cost of one dropped tap. */
  extra: number;
  /** Cost of a held beat (fermata), and per beat of its length beyond `heldLong`. */
  held: number;
  heldLong: number;
  heldPerBeat: number;
  /** A held beat is at least this many times the beat before it. */
  heldRatio: number;
  /** A held beat whose length is within this of a whole number of beats costs `heldWhole` more. */
  wholeTol: number;
  heldWhole: number;
  /** Reward of a bar line on a network downbeat (logit clipped to ±4, scaled to ±1), when the downbeats are informative. */
  downEvidence: number;
  /** Most taps dropped in a row. */
  maxSkip: number;
  /** Most tapped beats in one step (one more than the forgotten taps in a row). */
  maxGap: number;
  /** Most beats of the grid between the chosen bar's start and the first tap, in bars. */
  startBars: number;
  /** Cost per beat between the chosen bar's start and a first tap that comes later. */
  lateStart: number;
  /** Prior of the tapper's offset (s, negative: early) and its spread. */
  offsetPrior: number;
  offsetSpread: number;
  /** Largest offset compensated (s), and as a share of a beat. */
  offsetMax: number;
  offsetBeat: number;
  /** Smoothness of the beat lengths: a second difference of this share of a beat counts as one spread. */
  smooth: number;
  /** Spread of a beat put on a strong (logit ≥ 2) or a weaker network peak (s). */
  peakSharp: number;
  peakSoft: number;
  /** Peaks are looked for within this many tapper spreads of a beat, at least `windowMin` s, at most `windowBeat` of a beat. */
  window: number;
  windowMin: number;
  windowBeat: number;
  /** Rounds of the fit. */
  rounds: number;
  /** Taps too irregular to say anything: spread beyond this share of a beat. */
  irregular: number;
}

export const TAP: TapOptions = {
  tempoSpread: 0.04,
  zHuber: 3,
  attract: 1,
  miss: 1.7,
  beatEvidence: 1,
  extra: 2,
  held: 4.5,
  heldLong: 2.5,
  heldPerBeat: 2,
  heldRatio: 1.35,
  wholeTol: 0.25,
  heldWhole: 2.5,
  downEvidence: 0.8,
  maxSkip: 3,
  maxGap: 4,
  startBars: 2,
  lateStart: 0.6,
  offsetPrior: -0.02,
  offsetSpread: 0.12,
  offsetMax: 0.25,
  offsetBeat: 0.3,
  smooth: 0.04,
  peakSharp: 0.012,
  peakSoft: 0.025,
  window: 1.5,
  windowMin: 0.04,
  windowBeat: 0.2,
  rounds: 5,
  irregular: 0.3,
};

/** What the computation found out about the taps (the screen may say some of it). */
export interface TappedInfo {
  /** Source time of the last beat placed from the taps. */
  end: number;
  /** The tapper's constant offset compensated (s; negative: early). */
  offset: number;
  /** The tapper's spread around it (s, robust). */
  jitter: number;
  /** Taps taken as beats, dropped (doubled or stray), forgotten taps filled. */
  used: number;
  dropped: number;
  filled: number;
  /** Held beats (fermatas) read in the passage. */
  held: number;
  /** Share of the tapped passage's beats put on a network peak. */
  snapped: number;
  /** Beats of the grid per tapped beat (1; 2 or 3 when the user tapped every other or every third beat). */
  level: number;
  /** Beats placed from the chosen bar's start to `end`, both included. */
  beats: number;
  /** The taps say too little to place beats (spread beyond `irregular` of a beat, or most of them dropped). */
  irregular: boolean;
}

/** The grid after the tapped correction, with what was found about the taps. */
export interface TappedGrid extends GridHint {
  tapped: TappedInfo;
}

const MIN_GAP = 0.06;

function median(values: readonly number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2) : NaN;
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function huber(x: number, k: number): number {
  const a = Math.abs(x);
  return a <= k ? x * x : 2 * k * a - k * k;
}

/** Index of the beat of `times` at `t` (within 1 ms), or −1. */
function indexAt(times: readonly number[], t: number): number {
  let best = -1;
  for (let i = 0; i < times.length; i++) if (Math.abs(times[i]! - t) < 1e-3 && (best < 0 || Math.abs(times[i]! - t) < Math.abs(times[best]! - t))) best = i;
  return best;
}

// ---------------------------------------------------------------- the network's evidence

interface Peak {
  t: number;
  v: number;
}

/** What the network says, looked up quickly; null members when there is no network output. */
export interface Evidence {
  peaks: Peak[];
  /** Largest beat logit within ±2 frames of t (−4 without output). */
  beatAt(t: number): number;
  /** Largest downbeat logit within ±2 frames of t (0 without output). */
  downAt(t: number): number;
  /** Source time of the end of the outputs. */
  last: number;
}

export function evidenceOf(act: BeatActivations | null): Evidence {
  if (!act) return { peaks: [], beatAt: () => -4, downAt: () => 0, last: Infinity };
  const peaks = pickPeaks(act.beat).map((f) => ({ t: refinePeak(act.beat, f) / act.fps, v: act.beat[Math.round(f)]! }));
  const near = (x: Float32Array, t: number) => {
    const f = Math.round(t * act.fps);
    let m = -1000;
    for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < act.frames && x[k]! > m) m = x[k]!;
    return m;
  };
  return { peaks, beatAt: (t) => near(act.beat, t), downAt: (t) => near(act.down, t), last: act.frames / act.fps };
}

/** First index of `peaks` at or after t. */
function firstPeak(peaks: readonly Peak[], t: number): number {
  let lo = 0;
  let hi = peaks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (peaks[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * How much the network's downbeats are worth here, 0…1: the mean downbeat
 * logit on the bar lines of the grid in force before the chosen bar against
 * the one on its other beats (the grid is right there), over up to 16 bars.
 */
export function downbeatTrust(ev: Evidence, grid: GridHint, fromIdx: number): number {
  const m = grid.meter.numerator;
  if (m < 2 || m > 12) return 0;
  const on: number[] = [];
  const off: number[] = [];
  for (let i = Math.max(0, fromIdx - 16 * m); i <= fromIdx; i++) {
    const v = clip(ev.downAt(grid.times[i]!), -6, 6);
    if ((((i - grid.downbeat) % m) + m) % m === 0) on.push(v);
    else off.push(v);
  }
  if (on.length < 3 || off.length < 3) return 0;
  return clip((median(on) - median(off) - 1) / 4, 0, 1);
}

// ---------------------------------------------------------------- 1. the tapper's offset, a first guess

/**
 * The shift (s) to take off the taps that brings the most of them onto the
 * network's beat peaks (and the count-in taps onto the beats of the grid in
 * force), weighed with a prior; bounded. The fit (`placeBeats`) refines it.
 */
export function offsetGuess(taps: readonly number[], countIn: readonly { tap: number; beat: number }[], ev: Evidence, from: number, beat: number, m: number, o: TapOptions = TAP): number {
  const bound = Math.min(o.offsetMax, o.offsetBeat * beat);
  const k = 0.03;
  let best = clip(o.offsetPrior, -bound, bound);
  let bestScore = -Infinity;
  for (let d = -bound; d <= bound + 1e-9; d += 0.005) {
    let s = 0;
    // The network's peaks: half a tap each at most (they may be wrong just there).
    for (const x of taps) {
      const y = x - d;
      let g = 0;
      for (let q = firstPeak(ev.peaks, y - 0.1); q < ev.peaks.length && ev.peaks[q]!.t <= y + 0.1; q++) g = Math.max(g, Math.exp(-0.5 * ((ev.peaks[q]!.t - y) / k) ** 2) * Math.min(1, ev.peaks[q]!.v / 2));
      s += 0.5 * g;
    }
    // Taps on the beats before the bar (known).
    for (const c of countIn) s += 2 * Math.exp(-0.5 * ((c.tap - d - c.beat) / k) ** 2);
    // The first bar: the tempo before the bar goes on for a beat or two; less and less sure further on.
    for (const x of taps) {
      const y = x - d - from;
      if (y < -0.5 * beat || y > (m + 0.5) * beat) continue;
      const n = Math.max(0, Math.round(y / beat));
      s += 2 * Math.exp(-0.5 * ((y - n * beat) / (0.03 + 0.02 * n)) ** 2);
    }
    // The prior: worth a few taps; it decides when nothing else does.
    s += 3 * Math.exp(-0.5 * ((d - o.offsetPrior) / o.offsetSpread) ** 2);
    if (s > bestScore + 1e-9) {
      bestScore = s;
      best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 2. which taps are beats

/** One step of the path: from the kept tap `prev` (−1: the chosen bar's start) to the kept tap `tap`, `beats` beats of the grid. */
export interface TapStep {
  prev: number;
  tap: number;
  beats: number;
  /** The step is one held beat (a fermata). */
  held: boolean;
}

/** Local tapped beat length at each tap: median of the tap intervals around it (9), short ones (doubles) left out. */
export function localPeriods(x: readonly number[]): number[] {
  const d = x.slice(1).map((t, i) => t - x[i]!);
  if (!d.length) return x.map(() => NaN);
  const all = median(d.filter((v) => v > MIN_GAP));
  return x.map((_, j) => {
    const w: number[] = [];
    for (let i = Math.max(0, j - 5); i < Math.min(d.length, j + 5); i++) w.push(d[i]!);
    const m0 = median(w);
    const kept = w.filter((v) => v >= 0.55 * m0 && v >= 0.35 * all);
    return kept.length ? median(kept) : all;
  });
}

/**
 * The tapper's spread (s), from the taps alone: the median absolute second
 * difference of three taps in a row whose two intervals are ordinary (within
 * 30 % of the local tapped beat), divided by 1.65 (that of independent errors
 * of spread σ is √6 σ; its median 1.65 σ). At least 8 ms.
 */
export function tapSpread(x: readonly number[]): number {
  const r = localPeriods(x);
  const s: number[] = [];
  for (let i = 1; i + 1 < x.length; i++) {
    const a = x[i]! - x[i - 1]!;
    const b = x[i + 1]! - x[i]!;
    const q = r[i]!;
    if (Math.abs(Math.log(a / q)) < Math.log(1.3) && Math.abs(Math.log(b / q)) < Math.log(1.3)) s.push(Math.abs(b - a));
  }
  return s.length >= 3 ? Math.max(0.008, median(s) / 1.65) : 0.04;
}

interface Node {
  cost: number;
  /** Beat length of the last step (grid beats), the reference of the next, and its number of beats. */
  q: number;
  n: number;
  held: boolean;
  pos: number;
  back: number;
  step: TapStep;
}

/**
 * The best reading of the taps (see the header, 2): the kept taps and the
 * number of grid beats between each two. `x` ascending; `from` the chosen
 * bar's start; `P` the beat length before it; `delta` the offset guess;
 * `level` grid beats per tapped beat; `m` beats per bar and `trust` the
 * worth of the network's downbeats (0: none); `sigma` the tapper's spread.
 */
export function tapPath(x: readonly number[], from: number, P: number, delta: number, level: number, m: number, trust: number, ev: Evidence, sigma: number, o: TapOptions = TAP): TapStep[] {
  const N = x.length;
  if (!N) return [];
  const r = localPeriods(x).map((v) => (Number.isFinite(v) ? v / level : P));
  const M = trust > 0 ? m : 1;
  const beta = o.downEvidence * trust;
  const nodes: Node[][] = x.map(() => []);
  const keyed: Map<number, number>[] = x.map(() => new Map());
  const put = (j: number, n: Node) => {
    const key = ((n.step.prev + 1) * 64 + n.step.beats) * 32 * 2 + n.pos * 2 + (n.held ? 1 : 0);
    const at = keyed[j]!.get(key);
    if (at === undefined) {
      keyed[j]!.set(key, nodes[j]!.length);
      nodes[j]!.push(n);
    } else if (n.cost < nodes[j]![at]!.cost) nodes[j]![at] = n;
  };
  const beatEv = (t: number) => clip(ev.beatAt(t), -4, 4) / 4;
  const downEv = (t: number) => (beta > 0 ? clip(ev.downAt(t), -4, 4) / 4 : 0);
  /** Cost of the beats between t0 (exclusive) and t1 (inclusive), n of them, the first after bar position pos0. */
  const inside = (t0: number, t1: number, n: number, pos0: number, filledEvery: number) => {
    let c = 0;
    for (let k = 1; k <= n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      if (beta > 0 && (pos0 + k) % M === 0) c -= beta * downEv(t);
      // A forgotten tap: every `filledEvery` beats inside, not the last one (the tap itself).
      if (k < n && k % filledEvery === 0) c += o.miss - o.beatEvidence * beatEv(t);
    }
    return c;
  };
  /**
   * The change from a step of n1 beats of length q1 to one of n2 beats of length q2: their log ratio
   * against the noise the taps put in each (√2 σ over the step) and the tempo's own wandering.
   */
  const change = (q1: number, n1: number, noise1: number, q2: number, n2: number, noise2: number) => {
    const v = (noise1 / (n1 * q1)) ** 2 + (noise2 / (n2 * q2)) ** 2 + o.tempoSpread ** 2 * ((n1 + n2) / 2);
    const z = Math.abs(Math.log(q2 / q1)) / Math.sqrt(v);
    return z <= o.zHuber ? 0.5 * z * z : o.zHuber * z - 0.5 * o.zHuber * o.zHuber;
  };
  /** A held beat of length q after beats of length qref, from t0 to t1. */
  const heldCost = (q: number, qref: number, t0: number, t1: number) => {
    const ratio = q / qref;
    let c = o.held + o.heldPerBeat * Math.max(0, ratio - o.heldLong);
    if (Math.abs(ratio - Math.round(ratio)) < o.wholeTol) c += o.heldWhole;
    // The network hearing beats where they would fall if the tempo went on argues against holding.
    for (let t = t0 + qref; t < t1 - 0.5 * qref; t += qref) c += o.beatEvidence * Math.max(0, beatEv(t));
    return c;
  };
  const pair = Math.SQRT2 * sigma;
  const attract = (q: number, j: number) => o.attract * huber(Math.log(q / r[j]!), 0.25);
  // From the chosen bar's start to the first kept tap (its tap stands alone: one tap's spread and the offset's).
  const single = Math.hypot(sigma, 0.03);
  const kmax = Math.max(1, o.startBars * m);
  for (let j = 0; j <= Math.min(N - 1, o.maxSkip); j++) {
    const skip = j * o.extra;
    const d = x[j]! - delta - from;
    if (Math.abs(d) <= 0.4 * P) put(j, { cost: skip + 0.5 * (d / single) ** 2, q: P, n: 4, held: false, pos: 0, back: -1, step: { prev: -1, tap: j, beats: 0, held: false } });
    for (let n = 1; n <= kmax; n++) {
      const q = d / n;
      if (q < MIN_GAP) break;
      const t1 = x[j]! - delta;
      const base = skip + change(P, 4, 0, q, n, single) + attract(q, j) + o.lateStart * (n - 1) + inside(from, t1, n, 0, Number.POSITIVE_INFINITY);
      put(j, { cost: base, q, n, held: false, pos: n % M, back: -1, step: { prev: -1, tap: j, beats: n, held: false } });
      if (n === level && q >= o.heldRatio * P) {
        put(j, { cost: skip + heldCost(q, P, from, t1) + inside(from, t1, n, 0, Number.POSITIVE_INFINITY), q, n, held: true, pos: n % M, back: -1, step: { prev: -1, tap: j, beats: n, held: true } });
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const list = nodes[i]!;
    for (let a = 0; a < list.length; a++) {
      const s = list[a]!;
      // After a held beat, the local tapped tempo (a median of about nine intervals) is the reference.
      const [qref, nref, noiseRef] = s.held ? [r[i]!, 4, pair] : [s.q, s.n, s.step.prev < 0 ? single : pair];
      for (let j = i + 1; j <= Math.min(N - 1, i + 1 + o.maxSkip); j++) {
        const d = x[j]! - x[i]!;
        const skip = (j - i - 1) * o.extra;
        const t0 = x[i]! - delta;
        const t1 = x[j]! - delta;
        for (let nt = 1; nt <= o.maxGap; nt++) {
          const n = nt * level;
          const q = d / n;
          if (q < MIN_GAP) break;
          const common = s.cost + skip + inside(t0, t1, n, s.pos, level);
          const back = a;
          put(j, { cost: common + change(qref, nref, noiseRef, q, n, pair) + attract(q, j), q, n, held: false, pos: (s.pos + n) % M, back, step: { prev: i, tap: j, beats: n, held: false } });
          if (nt === 1 && q >= o.heldRatio * qref) {
            // A held beat: no change cost into it; the next step compares with the local tapped tempo.
            put(j, { cost: common + heldCost(q, qref, t0, t1), q, n, held: true, pos: (s.pos + n) % M, back, step: { prev: i, tap: j, beats: n, held: true } });
          }
        }
      }
    }
  }
  // The last tap ends the passage; it may be dropped too (a doubled last tap).
  let bj = -1;
  let ba = -1;
  let bc = Infinity;
  for (let j = N - 1; j >= Math.max(0, N - 1 - o.maxSkip); j--) {
    nodes[j]!.forEach((n, a) => {
      const c = n.cost + (N - 1 - j) * o.extra;
      if (c < bc) {
        bc = c;
        bj = j;
        ba = a;
      }
    });
  }
  if (bj < 0) return [];
  const steps: TapStep[] = [];
  let j = bj;
  let a = ba;
  for (;;) {
    const n = nodes[j]![a]!;
    steps.push(n.step);
    if (n.step.prev < 0) break;
    a = n.back;
    j = n.step.prev;
  }
  return steps.reverse();
}

// ---------------------------------------------------------------- 3. where each beat goes

/** A beat of the passage before the fit: its first estimate, the tap that observes it, a held beat before it. */
export interface PassageBeat {
  t: number;
  tap: number | null;
  heldBefore: boolean;
}

/** The beats a path says, from the chosen bar's start (index 0, observed by a tap when the first one is on it). */
export function pathBeats(x: readonly number[], from: number, delta: number, steps: readonly TapStep[]): PassageBeat[] {
  const out: PassageBeat[] = [{ t: from, tap: null, heldBefore: false }];
  for (const s of steps) {
    const t0 = s.prev < 0 ? from : x[s.prev]! - delta;
    const t1 = x[s.tap]! - delta;
    if (s.beats === 0) {
      out[0]!.tap = s.tap;
      continue;
    }
    for (let k = 1; k <= s.beats; k++) out.push({ t: t0 + ((t1 - t0) * k) / s.beats, tap: k === s.beats ? s.tap : null, heldBefore: s.held });
  }
  return out;
}

/**
 * Solves the symmetric positive definite system [[B, c], [cᵀ, d]] [y; δ] = [r; rd]
 * where B is pentadiagonal (diagonals b0, b1, b2). Returns [y, δ].
 */
function solveBordered(b0: Float64Array, b1: Float64Array, b2: Float64Array, c: Float64Array, d: number, r: Float64Array, rd: number): [Float64Array, number] {
  const n = b0.length;
  // Band Cholesky: B = L Lᵀ, L lower with two sub-diagonals (l0 diagonal, l1, l2).
  const l0 = new Float64Array(n);
  const l1 = new Float64Array(n);
  const l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i >= 2) l2[i] = b2[i - 2]! / l0[i - 2]!;
    if (i >= 1) l1[i] = (b1[i - 1]! - (i >= 2 ? l2[i]! * l1[i - 1]! : 0)) / l0[i - 1]!;
    const s = b0[i]! - l1[i]! * l1[i]! - l2[i]! * l2[i]!;
    l0[i] = Math.sqrt(Math.max(s, 1e-12));
  }
  const solve = (v: Float64Array) => {
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = (v[i]! - (i >= 1 ? l1[i]! * z[i - 1]! : 0) - (i >= 2 ? l2[i]! * z[i - 2]! : 0)) / l0[i]!;
    const y = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) y[i] = (z[i]! - (i + 1 < n ? l1[i + 1]! * y[i + 1]! : 0) - (i + 2 < n ? l2[i + 2]! * y[i + 2]! : 0)) / l0[i]!;
    return y;
  };
  const y = solve(r);
  const z = solve(c);
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cy += c[i]! * y[i]!;
    cz += c[i]! * z[i]!;
  }
  const den = d - cz;
  const delta = Math.abs(den) > 1e-12 ? (rd - cy) / den : 0;
  for (let i = 0; i < n; i++) y[i] = y[i]! - z[i]! * delta;
  return [y, delta];
}

export interface PlacedBeats {
  /** Beat times from the chosen bar's start (fixed) to the last tapped beat. */
  times: number[];
  offset: number;
  jitter: number;
  /** Per beat: put on a network peak in the last round. */
  snapped: boolean[];
}

/**
 * The fit of the header (3). `prefix` holds the beats of the grid in force
 * right before the chosen bar (the last two, fixed); `countIn` taps made on
 * them observe the offset.
 */
export function placeBeats(
  x: readonly number[],
  beats: readonly PassageBeat[],
  prefix: readonly number[],
  countIn: readonly { tap: number; beat: number }[],
  delta0: number,
  ev: Evidence,
  o: TapOptions = TAP,
): PlacedBeats {
  const K = beats.length - 1; // unknowns: beats 1…K and the offset
  const from = beats[0]!.t;
  let t = beats.map((b) => b.t);
  let delta = delta0;
  if (K < 1) return { times: t, offset: delta, jitter: 0.05, snapped: [false] };
  const q = (k: number) => {
    const a = Math.max(0, k - 1);
    const b = Math.min(K, Math.max(a + 1, k + 1));
    return (t[b]! - t[a]!) / (b - a);
  };
  let jitter = 0.05;
  const tapW = new Float64Array(K + 1).fill(1);
  const smoothW = new Float64Array(K + 2).fill(1);
  let snapped: boolean[] = beats.map(() => false);
  // Second difference k: t[k+1] − 2 t[k] + t[k−1], k = 0…K−1 (t[−1] the last beat before the bar).
  const before = prefix.length ? prefix[prefix.length - 1]! : null;
  const held = (k: number) => (k >= 1 && beats[k]!.heldBefore) || (k + 1 <= K && beats[k + 1]!.heldBefore);
  for (let round = 0; round < o.rounds; round++) {
    // The peaks near each beat.
    const peakAt: (Peak | null)[] = beats.map(() => null);
    // The first round places the beats from the taps alone: the offset and the tapper's spread come
    // from them, so that a passage where the network hears the off-beats cannot draw the offset there.
    for (let k = 1; k <= K && round > 0; k++) {
      const spread = beats[k]!.tap !== null ? jitter : 1.5 * jitter;
      const win = Math.min(o.windowBeat * q(k), Math.max(o.windowMin, o.window * spread));
      let best: Peak | null = null;
      let bs = -Infinity;
      for (let i = firstPeak(ev.peaks, t[k]! - win); i < ev.peaks.length && ev.peaks[i]!.t <= t[k]! + win; i++) {
        const p = ev.peaks[i]!;
        const s = Math.min(p.v, 6) - 2 * ((p.t - t[k]!) / win) ** 2;
        if (s > bs) {
          bs = s;
          best = p;
        }
      }
      peakAt[k] = best;
    }
    const b0 = new Float64Array(K);
    const b1 = new Float64Array(K);
    const b2 = new Float64Array(K);
    const c = new Float64Array(K);
    const rhs = new Float64Array(K);
    let d = 1 / o.offsetSpread ** 2;
    let rd = o.offsetPrior / o.offsetSpread ** 2;
    // Unknown index of beat k is k − 1.
    const wt = 1 / jitter ** 2;
    for (let k = 0; k <= K; k++) {
      const tap = beats[k]!.tap;
      if (tap === null) continue;
      const w = wt * tapW[k]!;
      // t[k] + δ = x[tap]
      if (k === 0) {
        d += w;
        rd += w * (x[tap]! - from);
        continue;
      }
      b0[k - 1]! += w;
      c[k - 1]! += w;
      d += w;
      rhs[k - 1]! += w * x[tap]!;
      rd += w * x[tap]!;
    }
    for (const ci of countIn) {
      const w = wt;
      d += w;
      rd += w * (ci.tap - ci.beat);
    }
    for (let k = 1; k <= K; k++) {
      const p = peakAt[k];
      if (!p) continue;
      const s = p.v >= 2 ? o.peakSharp : o.peakSoft;
      b0[k - 1]! += 1 / s ** 2;
      rhs[k - 1]! += p.t / s ** 2;
    }
    // Smoothness: coefficients (1, −2, 1) on beats k − 1, k, k + 1; beat 0 and the beat before are fixed.
    for (let k = 0; k <= K - 1; k++) {
      if (held(k)) continue;
      if (k === 0 && before === null) continue;
      const s = o.smooth * q(k);
      const w = smoothW[k]! / s ** 2;
      const idx = [k - 1, k, k + 1];
      const coef = [1, -2, 1];
      // The fixed beats (index 0: the bar's start, −1: the beat before it) go to the right-hand side.
      let constant = 0;
      const vars: [number, number][] = [];
      for (let e = 0; e < 3; e++) {
        const bi = idx[e]!;
        if (bi <= 0) constant += coef[e]! * (bi === 0 ? from : before!);
        else vars.push([bi - 1, coef[e]!]);
      }
      for (const [u, cu] of vars) {
        rhs[u]! -= w * cu * constant;
        for (const [v, cv] of vars) {
          if (v < u) continue;
          const val = w * cu * cv;
          if (v === u) b0[u]! += val;
          else if (v === u + 1) b1[u]! += val;
          else if (v === u + 2) b2[u]! += val;
        }
      }
    }
    for (let i = 0; i < K; i++) b0[i]! += 1e-9;
    const [y, dl] = solveBordered(b0, b1, b2, c, d, rhs, rd);
    const bound = Math.min(o.offsetMax, o.offsetBeat * median(t.slice(1).map((v, i) => v - t[i]!)));
    delta = clip(dl, -bound, bound);
    const next = [from, ...Array.from(y)];
    // Robust weights for the next round, and the tapper's spread.
    const res: number[] = [];
    for (let k = 0; k <= K; k++) {
      const tap = beats[k]!.tap;
      if (tap !== null) res.push(x[tap]! - next[k]! - delta);
    }
    const mad = 1.4826 * median(res.map((v) => Math.abs(v - median(res))));
    jitter = clip(Number.isFinite(mad) ? mad : 0.05, 0.01, 0.25);
    for (let k = 0; k <= K; k++) {
      const tap = beats[k]!.tap;
      if (tap === null) continue;
      const e = (x[tap]! - next[k]! - delta) / (2.5 * jitter);
      tapW[k] = 1 / (1 + e * e);
    }
    t = next;
    for (let k = 0; k <= K - 1; k++) {
      const prev = k === 0 ? before : t[k - 1]!;
      if (prev === null) continue;
      const e = (t[k + 1]! - 2 * t[k]! + prev) / (2.5 * o.smooth * q(k));
      smoothW[k] = 1 / (1 + e * e);
    }
    snapped = peakAt.map((p, k) => k > 0 && p !== null && Math.abs(p.t - t[k]!) < 0.02);
  }
  // Ascending, at least the shortest beat apart.
  for (let k = 1; k <= K; k++) if (t[k]! < t[k - 1]! + MIN_GAP) t[k] = t[k - 1]! + MIN_GAP;
  return { times: t, offset: delta, jitter, snapped };
}

// ---------------------------------------------------------------- 4. after the passage

/**
 * The beats after `end` (exclusive): the rest of the piece analysed again
 * from it, joined at the last tapped tempo `q` (see the header, 4). Without
 * network outputs, the grid in force from its first beat a credible beat
 * after `end`.
 */
export function continueAfter(act: BeatActivations | null, ev: Evidence, end: number, q: number, grid: GridHint): number[] {
  const m = grid.meter.numerator;
  const last = grid.times[grid.times.length - 1]!;
  if (!act) return grid.times.filter((t) => t > end + 0.5 * q);
  if (end > last - q) return [];
  const peaks = ev.peaks.map((p) => p.t);
  const found = [end, ...peaks.filter((t) => t > end + 0.4 * q && t <= last + q)];
  let fresh: number[] = [];
  if (found.length >= 8) {
    const downAt = (t: number) => (t < end - 0.1 ? 0.02 : downProbAt(act, t));
    const g = gridFromBeats(found, downAt, undefined, undefined, undefined, [Math.min(Math.max(m, 2), 12)]).grid;
    fresh = g.beats.filter((t) => t > end + 0.4 * q);
  }
  const joins = (b: readonly number[]) => {
    if (b.length < 2) return false;
    const a = (b[0]! - end) / q;
    const c = (b[1]! - b[0]!) / q;
    return a >= 0.7 && a <= 1.4 && c >= 0.7 && c <= 1.4;
  };
  if (joins(fresh)) return fresh;
  // Followed at the tapped tempo until it meets the fresh analysis for two bars, then the fresh analysis.
  const tracked = followBeats(act, end, last, q).slice(1);
  const need = 2 * Math.max(2, m);
  const near = (t: number) => {
    let lo = 0;
    let hi = fresh.length - 1;
    if (hi < 0) return -1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fresh[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const j = Math.abs(fresh[lo]! - t) <= Math.abs(fresh[hi]! - t) ? lo : hi;
    return Math.abs(fresh[j]! - t) <= 0.07 ? j : -1;
  };
  for (let k = 0; k + need <= tracked.length; k++) {
    let ok = true;
    let prev = -1;
    for (let e = k; e < k + need && ok; e++) {
      const j = near(tracked[e]!);
      ok = j >= 0 && (prev < 0 || j === prev + 1);
      prev = j;
    }
    if (ok) {
      const j = near(tracked[k]!);
      return [...tracked.slice(0, k), ...fresh.slice(j)];
    }
  }
  return tracked;
}

// ---------------------------------------------------------------- the whole

/** Grid beats per tapped beat: 1, or 2 / 3 when the taps are steadily that much further apart than the beats before. */
export function tapLevel(x: readonly number[], P: number): number {
  const d = x.slice(1).map((t, i) => t - x[i]!).filter((v) => v > MIN_GAP);
  if (d.length < 3 || !(P > 0)) return 1;
  const all = median(d);
  const med = median(d.filter((v) => v >= 0.55 * all));
  const ratio = med / P;
  if (Math.abs(Math.log(ratio)) <= Math.log(1.45)) return 1;
  for (const l of [2, 3]) if (Math.abs(Math.log(ratio / l)) < Math.log(1.2)) return l;
  return 1;
}

/** The taps sorted, finite, from shortly before the chosen bar; the earlier ones (count-in) apart. */
export function sortTaps(taps: readonly number[], from: number, P: number): { passage: number[]; countIn: number[] } {
  const all = taps.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  return { passage: all.filter((t) => t >= from - 0.5 * P), countIn: all.filter((t) => t < from - 0.5 * P) };
}

/** The grid after the tapped correction (see the header). Returns the grid in force, unchanged, when it cannot be computed. */
export function applyTappedFix(act: BeatActivations | null, req: TappedFixRequest, o: TapOptions = TAP): TappedGrid {
  const { grid, from } = req;
  const m = grid.meter.numerator;
  const fromIdx = indexAt(grid.times, from);
  const none = (irregular = false): TappedGrid => ({
    ...grid,
    tapped: { end: from, offset: 0, jitter: 0, used: 0, dropped: 0, filled: 0, held: 0, snapped: 0, level: 1, beats: 1, irregular },
  });
  if (fromIdx < 0) return none();
  const t0 = grid.times[fromIdx]!;
  const P = periodBefore(grid.times, fromIdx, 8);
  if (!(P > 0)) return none();
  const ev = evidenceOf(act);
  const { passage: x, countIn: early } = sortTaps(req.taps, t0, P);
  if (x.length < 2) return none();
  const level = tapLevel(x, P);
  // Count-in taps on the beats of the grid in force (the last two bars before the chosen bar).
  const prefixBeats = grid.times.slice(Math.max(0, fromIdx - 2 * m), fromIdx + 1);
  const pair = (tap: number) => {
    let best: number | null = null;
    for (const b of prefixBeats) if (Math.abs(tap - b) <= 0.3 * P && (best === null || Math.abs(tap - b) < Math.abs(tap - best))) best = b;
    return best;
  };
  const countIn = early.map((tap) => ({ tap, beat: pair(tap) })).filter((c): c is { tap: number; beat: number } => c.beat !== null);
  const delta0 = offsetGuess(x, countIn, ev, t0, P, m, o);
  const trust = downbeatTrust(ev, grid, fromIdx);
  const sigma = tapSpread(x);
  const steps = tapPath(x, t0, P, delta0, level, m, trust, ev, sigma, o);
  if (!steps.length) return none(true);
  const first = pathBeats(x, t0, delta0, steps);
  const placed = placeBeats(x, first, grid.times.slice(Math.max(0, fromIdx - 2), fromIdx), countIn, delta0, ev, o);
  const beats = placed.times;
  const used = new Set(steps.map((s) => s.tap)).size;
  const dropped = x.length - used;
  const filled = steps.reduce((n, s) => n + (s.beats > 0 ? s.beats / level - 1 : 0), 0);
  const passageBeats = beats.slice(1).map((t, i) => t - beats[i]!).filter((_, i) => !first[i + 1]!.heldBefore);
  const qMed = median(passageBeats.length ? passageBeats : [P]);
  const irregular = placed.jitter > o.irregular * qMed * level || used < 0.6 * x.length;
  const end = beats[beats.length - 1]!;
  // The tapped tempo at the end: the last four beats that are not held.
  const tail: number[] = [];
  for (let k = beats.length - 1; k >= 1 && tail.length < 4; k--) if (!first[k]!.heldBefore) tail.push(beats[k]! - beats[k - 1]!);
  const qEnd = tail.length ? median(tail) : qMed;
  const rest = continueAfter(act, ev, end, qEnd, grid);
  const times = [...grid.times.slice(0, fromIdx), ...beats, ...rest.filter((t) => t > end + MIN_GAP)];
  const downbeat = grid.downbeat < fromIdx ? grid.downbeat : fromIdx;
  return {
    times,
    downbeat,
    meter: grid.meter,
    tapped: {
      end,
      offset: placed.offset,
      jitter: placed.jitter,
      used,
      dropped,
      filled,
      held: steps.filter((s) => s.held).length,
      snapped: beats.length > 1 ? placed.snapped.filter(Boolean).length / (beats.length - 1) : 0,
      level,
      beats: beats.length,
      irregular,
    },
  };
}
