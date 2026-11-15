// The last safety net of the beat grid: the owner's rule enforced by
// construction (the brief, analysis, « Tempo »: a brutal and brief variation
// that comes back is never believed; a small tolerance for light or
// progressive movements).
//
// After everything else (`pipeline.ts#gridFromBeats`), on the grid as the app
// will show it (bars every m beats from one downbeat). A passage breaks the
// rule (`briefPassages`) when, after a support (`support` bars at one level,
// with even beats), a bar is `jump` or more away from that level, and fewer
// than `brief` bars later the bars come back to it abruptly (a step of `jump`
// or more) for another support. It is re-gridded between the two supports
// (widened by up to `pad` bars of each so that a remainder is spread thinly),
// with a whole number of beats: evenly, or going smoothly from one support's
// beat to the other's, or keeping the found beats that lie a whole number of
// beats apart and filling the gaps evenly; each new beat on a found beat when
// one is within `snap` of a beat. A way is kept when its bars make no step of
// `jump` with the bars around and at least `heard` of its beats are found
// beats (otherwise the net would invent a pulse); the one on the most found
// beats wins. Whole bars by default (the bar phase holds on both sides); a
// number of beats that holds a part of a bar when the downbeats heard over
// the whole piece agree with it better, the bar phase then being the one they
// agree with (before or after the passage). The net passes again on its own
// result while it finds passages and makes no more abrupt changes.
//
// What stays: a change that lasts (no return within `brief` bars, or a new
// tempo held evenly for `plateau` bars), a ritardando or a progressive
// accelerando, a rubato (it comes back by degrees), a free introduction (no
// support before), the ends of the piece (no support after: nothing is
// invented), and a passage where the downbeats heard speak clearly against
// every re-gridding (`AGAINST`). An isolated fermata between two steady
// stretches becomes a whole number of beats at the neighbouring tempo, unless
// the downbeats heard after it say the bars go on (the hand corrections of the
// bar menu remain the way back). Pure; thresholds measured (app/README.md,
// « Le dernier filet »).

import type { RepairedPassage } from '../types';
import { phaseScores } from './repair';

export interface SteadyOptions {
  /** An abrupt change between neighbouring bars: |ln(length ratio)| at least this. */
  jump: number;
  /** Bars in a run for it to be a stable support. */
  support: number;
  /** A passage between two supports at the same level lasting fewer bars than this is not believed. */
  brief: number;
  /** ...unless it holds one tempo evenly for this many bars or more. */
  plateau: number;
  /** Fewest new beats (fraction) on found beats for a re-gridding to be kept. */
  heard: number;
  /** A support bar's beats each within this (|ln|) of its mean beat. */
  even: number;
  /** Bars of each support taken into the re-gridded span to spread a remainder. */
  pad: number;
  /** A beat stays on a found beat within this fraction of a beat of its place. */
  snap: number;
  /**
   * `bars`: the span holds a whole number of bars; `beats`: also a number of beats that holds a part of a bar,
   * when the downbeats heard over the whole piece agree with it better.
   */
  count: 'bars' | 'beats';
  /** Without downbeats heard, a part of a bar where no whole number fits (tests: what the net would need them for). */
  free: boolean;
}

export const STEADY: SteadyOptions = {
  jump: Math.log(1.2),
  support: 2,
  brief: 8,
  plateau: 6,
  heard: 0.3,
  even: 0.35,
  pad: 2,
  snap: 0.12,
  count: 'beats',
  free: false,
};

export interface SteadyResult {
  beats: number[];
  /** Index of the first downbeat in `beats` (the bar phase before the first passage). */
  downbeat: number;
  /**
   * Downbeat indices in `beats` to choose the bar phase from: the phase before the passages, and (`count:
   * 'beats'`, a passage holding a part of a bar) the phase heard after each passage.
   */
  phases: number[];
  repairs: RepairedPassage[];
}

const median = (v: readonly number[]) => {
  const a = v.slice().sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2;
};

/** Bar lengths of a sequence of downbeat times. */
const lengths = (downs: readonly number[]) => downs.slice(1).map((t, i) => t - downs[i]!);

/** The greatest abrupt change between neighbouring bars (|ln|), over a sequence of downbeats. */
export function worstStep(downs: readonly number[]): number {
  const L = lengths(downs);
  let w = 0;
  for (let k = 1; k < L.length; k++) w = Math.max(w, Math.abs(Math.log(L[k]! / L[k - 1]!)));
  return w;
}

/**
 * The passages that break the rule: an abrupt change of the bar length (bar k
 * differs from bar k − 1 by `jump` or more), then, fewer than `brief` bars
 * later, a return to the level before (`support` bars in a row within `jump`
 * of it: the last bar of the piece alone confirms nothing). The level before is the median of
 * the three bars before k; at least two bars are needed there, so a free
 * introduction is never judged. A change that never comes back (a lasting
 * change, a slowed ending) is not a passage. Bar numbers of `downs` (bar k goes
 * from downs[k] to downs[k + 1]): the passage is bars `from` to `to`.
 */
export function briefPassages(
  downs: readonly number[],
  o: SteadyOptions = STEADY,
  regular: (bar: number) => boolean = () => true,
): { from: number; to: number; before: number; after: number }[] {
  const L = lengths(downs);
  const near = (x: number, y: number) => Math.abs(Math.log(x / y)) < o.jump;
  const out: { from: number; to: number; before: number; after: number }[] = [];
  for (let k = o.support + 1; k < L.length; k++) {
    // A support before: `support` bars in a row at one level (a free introduction has none).
    const run = L.slice(k - o.support, k);
    if (!run.every((x, i) => near(x, run[run.length - 1]!) && (i === run.length - 1 || regular(k - o.support + i)))) continue;
    const before = median(L.slice(Math.max(0, k - 3), k));
    // Away from that level (by one step or two).
    if (near(L[k]!, before)) continue;
    for (let j = k + 1; j <= Math.min(L.length - o.support, k + o.brief - 1); j++) {
      // Back abruptly too: a rubato comes back by degrees. After a departure of twice the threshold or more
      // (far beyond a rubato), a way back in two steps is abrupt enough.
      const far = Math.abs(Math.log(L[k]! / before)) >= 2 * o.jump && j >= k + 2 && !near(L[j]!, L[j - 2]!);
      if ((near(L[j]!, L[j - 1]!) && !far) || !L.slice(j, j + o.support).every((x, i) => near(x, before) && (i === 0 || regular(j + i)))) continue;
      // A new tempo held evenly for `plateau` bars or more is a tempo that lasts.
      const inside = L.slice(k, j);
      if (inside.length >= o.plateau && inside.every((x) => near(x, median(inside)))) break;
      out.push({ from: k, to: j - 1, before, after: median(L.slice(j, j + Math.min(3, L.length - j))) });
      k = j - 1;
      break;
    }
  }
  return out;
}

/**
 * Bar k (from beat idx[k], m beats) has even beats: each within `even` (|ln|) of the bar's mean beat. A support
 * must: bars of a steady length whose beats are not (a pulse half lost, read at another level here and there)
 * would only spread the error.
 */
function evenBars(beats: readonly number[], idx: readonly number[], m: number, o: SteadyOptions): (bar: number) => boolean {
  return (k) => {
    const i = idx[k]!;
    if (i + m >= beats.length) return false;
    const mean = (beats[i + m]! - beats[i]!) / m;
    for (let q = i; q < i + m; q++) if (Math.abs(Math.log((beats[q + 1]! - beats[q]!) / mean)) >= o.even) return false;
    return true;
  };
}

/**
 * The passages of a grid (beats and their numbers, m beats per bar) that break the owner's rule: what the net
 * would re-grid. Empty on what the net leaves (it is applied until none is left, or none can be re-gridded).
 */
export function ruleBreaks(beats: readonly number[], numbers: readonly number[], m: number, o: SteadyOptions = STEADY) {
  const idx = numbers.flatMap((n, i) => (n === 1 ? [i] : []));
  return briefPassages(
    idx.map((i) => beats[i]!),
    o,
    evenBars(beats, idx, m, o),
  );
}

/** Found beats a count may land on fewer than the best and still be offered to the downbeats' choice. */
const SLACK = 1;

/** One way of re-gridding a passage: the beats placed strictly inside the span from beat i0 to beat i1. */
interface Option {
  i0: number;
  i1: number;
  inner: number[];
}

/** One pass of the net over the passages found in `beats`. */
function onePass(beats: readonly number[], downbeat: number, m: number, o: SteadyOptions, downAt?: (t: number) => number): SteadyResult {
  const idx: number[] = [];
  for (let i = downbeat; i < beats.length; i += m) idx.push(i);
  const downs = idx.map((i) => beats[i]!);
  const passages = briefPassages(downs, o, evenBars(beats, idx, m, o));
  const none = { beats: beats.slice(), downbeat, phases: [downbeat], repairs: [] };
  if (!passages.length) return none;
  const L = lengths(downs);
  const choices: (Option | null)[][] = [];
  let lastEnd = -1;
  for (const p of passages) {
    // Every span (widened into the bars around by up to `pad` bars) and every count near the supports' tempo:
    // whole bars, or (`count: 'beats'`) whole beats. Kept when the new bars make no abrupt step with the bars
    // around; the best of each kind is the one that lands on the most found beats, then the smoothest.
    type Way = { a: number; b: number; inner: number[]; step: number; hits: number; whole: boolean; heard: number };
    const ways: Way[] = [];
    for (let pad = 0; pad <= o.pad; pad++) {
      const a = p.from - pad; // first bar of the span
      const b = p.to + pad; // last bar of the span
      if (a < 1 || b + 2 > L.length || a <= lastEnd) continue;
      const t0 = downs[a]!;
      const t1 = downs[b + 1]!;
      const unit = (p.before + p.after) / 2;
      const r = Math.round((t1 - t0) / unit);
      const q = Math.round(((t1 - t0) * m) / unit);
      const counts = new Set([r - 1, r, r + 1].map((x) => m * x));
      if (o.count === 'beats') for (let x = q - 2; x <= q + 2; x++) counts.add(x);
      const found = beats.filter((t) => t > t0 + 1e-6 && t < t1 - 1e-6);
      const head = beats.slice(Math.max(0, idx[a]! - 2 * m), idx[a]!);
      const tail = beats.slice(idx[b + 1]! + 1, idx[b + 1]! + 1 + 2 * m);
      const consider = (beatsAt: number[], inner: number[], hits: number) => {
        const N = beatsAt.length - 1;
        // The step the new bars make with the bars around (counted on from the span's first downbeat); only the
        // steps of a new bar count: the bars around may have their own (another passage, an end).
        const around = [...head, ...beatsAt, ...tail];
        let step = 0;
        for (let i = head.length % m; i + 2 * m < around.length; i += m) {
          if (i < head.length + N && i + 2 * m > head.length) step = Math.max(step, Math.abs(Math.log((around[i + 2 * m]! - around[i + m]!) / (around[i + m]! - around[i]!))));
        }
        // Most new beats on heard beats, or the net would invent a pulse.
        if (step < o.jump && hits >= o.heard * (N - 1)) ways.push({ a, b, inner, step, hits, whole: N % m === 0, heard: found.length });
      };
      for (const N of counts) {
        for (const ramp of [false, true]) {
          if (N < 1) continue;
          // Even beats, or beat lengths going smoothly from one support's to the other's; scaled to fill the span.
          const raw = Array.from({ length: N }, (_, k) => (ramp ? p.before + ((p.after - p.before) * (k + 0.5)) / N : 1));
          const scale = (t1 - t0) / raw.reduce((x, y) => x + y, 0);
          const beatsAt = [t0];
          for (let k = 0; k < N; k++) beatsAt.push(beatsAt[k]! + raw[k]! * scale);
          beatsAt[N] = t1;
          let hits = 0;
          const inner = beatsAt.slice(1, N).map((g, k) => {
            const beat = beatsAt[k + 2]! - beatsAt[k + 1]!;
            let near: number | null = null;
            for (const f of found) if (Math.abs(f - g) <= o.snap * beat && (near === null || Math.abs(f - g) < Math.abs(near - g))) near = f;
            if (near !== null) hits++;
            return near ?? g;
          });
          consider(beatsAt, inner, hits);
        }
      }
      // Or the most heard beats kept that lie a whole number of the supports' beats apart (within a quarter of a
      // beat), each gap filled with even beats (a held note becomes beats at the neighbouring tempo).
      const u = unit / m;
      const all = [t0, ...found, t1];
      const fits = (x: number, y: number) => y - x >= 0.6 * u && Math.abs((y - x) / u - Math.round((y - x) / u)) <= 0.25;
      const best = all.map(() => -Infinity);
      const from = all.map(() => -1);
      best[0] = 0;
      for (let i = 1; i < all.length; i++) {
        for (let j = 0; j < i; j++) if (best[j]! + 1 > best[i]! && (fits(all[j]!, all[i]!) || i === all.length - 1)) [best[i], from[i]] = [best[j]! + 1, j];
      }
      const chain: number[] = [];
      for (let i = all.length - 1; i >= 0; i = from[i]!) chain.unshift(all[i]!);
      // Or, more simply, every heard beat kept that is most of a beat after the one before.
      const near: number[] = [t0];
      for (const f of found) if (f - near[near.length - 1]! >= 0.6 * u && t1 - f >= 0.6 * u) near.push(f);
      near.push(t1);
      for (const points of [chain, near]) {
        const filled = [t0];
        for (let g = 1; g < points.length; g++) {
          const x = points[g - 1]!;
          const y = points[g]!;
          const n = Math.max(1, Math.round((y - x) / u));
          for (let i = 1; i <= n; i++) filled.push(i === n ? y : x + ((y - x) * i) / n);
        }
        consider(filled, filled.slice(1, -1), points.length - 2);
      }
    }
    const most = Math.max(-1, ...ways.map((w) => w.hits));
    const options: Option[] = [];
    let end = lastEnd;
    for (const whole of o.count === 'beats' ? [true, false] : [true]) {
      // A part of a bar changes the bar phase on one side: only where the downbeats heard can choose it (below),
      // or, without them, keeping the number of beats heard (no whole number of bars fits).
      const kind = ways.filter((w) => w.whole === whole && (whole || downAt || o.free || (!options.length && w.inner.length === w.heard)));
      const best = kind.filter((w) => w.hits >= most - SLACK).sort((x, y) => y.hits - x.hits || x.step - y.step)[0];
      if (!best) continue;
      options.push({ i0: idx[best.a]!, i1: idx[best.b + 1]!, inner: best.inner });
      end = Math.max(end, best.b + 1);
    }
    if (!options.length) continue; // left as found
    // No whole number of bars fits: left as found unless the downbeats heard choose the part of a bar (below).
    if (downAt && options.length === 1 && (options[0]!.inner.length + 1) % m) choices.push([null, options[0]!]);
    else choices.push(options);
    lastEnd = end;
  }
  if (!choices.length) return none;
  const build = (pick: readonly number[]) => {
    const out: number[] = [];
    const repairs: RepairedPassage[] = [];
    const phases = [downbeat];
    let i = 0;
    choices.forEach((options, c) => {
      const r = options[pick[c]!]!;
      if (!r || r.i0 < i) return; // overlaps the passage before (options of different widths)
      while (i <= r.i0) out.push(beats[i++]!);
      out.push(...r.inner);
      repairs.push({ start: beats[r.i0]!, end: beats[r.i1]!, found: r.i1 - r.i0 - 1, placed: r.inner.length, cause: 'steady' });
      if ((r.inner.length + 1) % m) phases.push(out.length);
      i = r.i1;
    });
    while (i < beats.length) out.push(beats[i++]!);
    return { beats: out, downbeat, phases: [...new Set(phases.map((d) => d % m))], repairs };
  };
  // Whole bars unless the downbeats heard say otherwise (below): the bar phase then holds on both sides.
  const pick = choices.map(() => 0);
  if (o.count === 'beats' && downAt) {
    // Whole beats instead of whole bars where the downbeats of the whole piece agree with it better.
    const score = (r: SteadyResult) => Math.max(...phaseOf(r, m, downAt).map((x) => x.score));
    // Every combination when there are few passages with a choice (the phase slips add up), else one by one.
    const open = choices.map((x, c) => (x.length > 1 ? c : -1)).filter((c) => c >= 0);
    let current = score(build(pick));
    if (open.length <= 8) {
      const base = pick.slice();
      for (let mask = 1; mask < 1 << open.length; mask++) {
        const trial = base.slice();
        open.forEach((c, k) => {
          if (mask & (1 << k)) trial[c] = 1;
        });
        const s = score(build(trial));
        if (s > current + PREFER) {
          current = s;
          trial.forEach((v, c) => (pick[c] = v));
        }
      }
    } else {
      for (const c of open) {
        const trial = pick.slice();
        trial[c] = 1;
        const s = score(build(trial));
        if (s > current + PREFER) {
          current = s;
          pick[c] = 1;
        }
      }
    }
  }
  const r = build(pick);
  if (!downAt) return r;
  const best = phaseOf(r, m, downAt).reduce((x, y) => (y.score > x.score ? y : x));
  // The downbeats heard must not speak clearly against it (a beat lost or added where the tempo moves).
  const heard = phaseOf(none, m, downAt)[0]!.score;
  if (best.score < heard - AGAINST) return none;
  return { ...r, downbeat: best.d, phases: [best.d] };
}

/** How much better (nats, the downbeat output's log-likelihood over the piece) a part of a bar must fit it. */
const PREFER = 1;

/** How much worse (nats, the downbeat output's log-likelihood over the piece) the re-gridded bars may fit it. */
const AGAINST = 15;

/** The bar phases a result offers, with how well the downbeats of the whole piece agree with each. */
function phaseOf(r: SteadyResult, m: number, downAt: (t: number) => number): { d: number; score: number }[] {
  const s = phaseScores(r.beats.map(downAt), m);
  return r.phases.map((d) => ({ d, score: s[(m - (d % m)) % m]! }));
}

/** Abrupt changes (|ln| ≥ `jump`) between neighbouring bars of a result. */
function abrupt(r: SteadyResult, m: number, o: SteadyOptions): number {
  const downs: number[] = [];
  for (let i = r.downbeat; i < r.beats.length; i += m) downs.push(r.beats[i]!);
  const L = lengths(downs);
  let n = 0;
  for (let k = 1; k < L.length; k++) if (Math.abs(Math.log(L[k]! / L[k - 1]!)) >= o.jump) n++;
  return n;
}

/**
 * The net (see the header). `downbeat`: index of the first downbeat; m beats per bar. With `count: 'beats'`,
 * `downAt` chooses, passage by passage, between a whole number of bars and a whole number of beats (then the
 * bar phase of one side changes): the one the downbeats of the whole piece agree with best. Passes again on
 * its own result while it finds passages it can re-grid.
 */
export function steadyBars(beats: readonly number[], downbeat: number, m: number, o: SteadyOptions = STEADY, downAt?: (t: number) => number): SteadyResult {
  let cur: SteadyResult = { beats: beats.slice(), downbeat, phases: [downbeat], repairs: [] };
  for (let pass = 0; pass < 6; pass++) {
    const r = onePass(cur.beats, cur.downbeat, m, o, downAt);
    const same = r.beats.length === cur.beats.length && r.beats.every((t, i) => t === cur.beats[i]);
    // Never more abrupt changes than before, over the whole piece (the bar lines may have moved).
    if (!r.repairs.length || same || abrupt(r, m, o) > abrupt(cur, m, o)) break;
    cur = { beats: r.beats, downbeat: r.downbeat, phases: r.phases, repairs: [...cur.repairs, ...r.repairs] };
  }
  return cur;
}
