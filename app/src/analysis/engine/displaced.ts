// Displaced beats: one beat, or a run of beats, that the network placed early
// or late and that comes back.
//
// Why. On a worn record the network sometimes locks for a while onto a
// swung eighth just before (or after) the beat: the count stays right, but
// every beat of the run is off by the same fraction of a beat. The bar
// tempo curve then makes a zigzag (a bar too fast where the run starts, one
// too slow where it ends), below the 30 % of the tempo repair (`repair.ts`).
// The owner's rule applies: a brutal and brief movement that returns is not
// believed. Measured on the chord bench (`web/spikes/accords/banc/temps.ts`):
// in such runs the network is sure of the wrong place (its beat output at
// the true positions is low), so the activation cannot decide; the timing
// does: an entry interval short (or long) by δ, regular beats, an exit
// interval long (or short) by the same δ, steady tempo on both sides. The
// run is moved back by δ as a whole (its own micro-timing is kept). A real
// stretch (rubato, a held note) is not followed by the opposite interval:
// the beats after it stay moved, and nothing is done.

import type { RepairedPassage } from '../types';

export interface DisplacedOptions {
  /** Intervals on each side that give the local tempo and timing noise. */
  context: number;
  /** Smallest displacement corrected, in beats, for a run of two beats or more… */
  minShift: number;
  /** …and for a single beat (a lone beat early or late is more often the player). */
  minShiftOne: number;
  /** Floor of the local timing noise (log), whatever the context says. */
  minNoise: number;
  /** …and in times the local timing noise (robust deviation of the context intervals, log). */
  noise: number;
  /** The exit must undo the entry: |δ_in + δ_out| at most this share of the smaller. */
  balance: number;
  /** Inside the run, each interval within this (|ln|) of the local beat. */
  inner: number;
  /** Longest run, in beats. */
  maxRun: number;
}

export const DISPLACED: DisplacedOptions = {
  context: 12,
  minShift: 0.15,
  minShiftOne: 0.25,
  minNoise: 0.03,
  noise: 5,
  balance: 0.35,
  inner: Math.log(1.1),
  maxRun: 32,
};

function median(values: readonly number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2;
}

export interface DisplacedResult {
  beats: number[];
  repairs: RepairedPassage[];
}

/** Moves displaced runs of beats back into place (see above). */
export function smoothDisplaced(beats: readonly number[], o: DisplacedOptions = DISPLACED): DisplacedResult {
  const out = beats.slice();
  const repairs: RepairedPassage[] = [];
  const n = out.length;
  if (n < 2 * o.context + 3) return { beats: out, repairs };
  const d = (i: number) => out[i + 1]! - out[i]!;
  let i = o.context;
  while (i < n - 1 - o.context) {
    // Local beat and noise from the context before the entry interval i.
    const pre = Array.from({ length: o.context }, (_, k) => d(i - o.context + k));
    const P = median(pre);
    const dev = pre.map((x) => Math.abs(Math.log(x / P)));
    const sigma = Math.max(median(dev) * 1.4826, o.minNoise);
    if (Math.max(...dev) > 3 * o.inner) {
      i++;
      continue; // the context itself is not steady
    }
    const din = d(i) - P; // entry: > 0 the run is late, < 0 early
    const thr = Math.max(o.minShift, o.noise * sigma);
    if (Math.abs(din) / P < thr) {
      i++;
      continue;
    }
    let found = -1;
    for (let j = i + 1; j < Math.min(n - 1, i + 1 + o.maxRun); j++) {
      const dout = d(j) - P;
      if (Math.sign(dout) !== -Math.sign(din) || Math.abs(dout) / P < thr) {
        // Inside the run every interval must stay at the beat.
        if (Math.abs(Math.log(d(j) / P)) > o.inner) break;
        continue;
      }
      if (Math.abs(din + dout) > o.balance * Math.min(Math.abs(din), Math.abs(dout))) break;
      found = j;
      break;
    }
    if (found === i + 1 && Math.abs(din) / P < Math.max(o.minShiftOne, thr)) found = -1;
    if (found < 0 || found + 1 + o.context > n) {
      i++;
      continue;
    }
    // The tempo after the run is the tempo before it.
    const post = Array.from({ length: o.context }, (_, k) => d(found + 1 + k));
    if (Math.abs(Math.log(median(post) / P)) > o.inner || post.some((x) => Math.abs(Math.log(x / P)) > 3 * o.inner)) {
      i++;
      continue;
    }
    // The run is late by δ when the entry is long by δ and the exit short by δ: both estimates, averaged.
    const delta = (din - (d(found) - P)) / 2;
    // The whole run must sit off the grid the two sides draw (a line through their beats), by about δ:
    // two jittered beats far apart are an entry and an exit by chance, with the run itself in place.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = i - o.context; k <= i; k++) xs.push(k), ys.push(out[k]!);
    for (let k = found + 1; k <= found + 1 + o.context && k < n; k++) xs.push(k), ys.push(out[k]!);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    const slope = xs.reduce((s, x, q) => s + (x - mx) * (ys[q]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const res = Array.from({ length: found - i }, (_, q) => out[i + 1 + q]! - (my + slope * (i + 1 + q - mx)));
    const mean = res.reduce((s, x) => s + x, 0) / res.length;
    if (Math.abs(mean - delta) > o.balance * Math.abs(delta) || res.some((x) => Math.sign(x) !== Math.sign(delta) || Math.abs(x) < 0.5 * Math.abs(delta))) {
      i++;
      continue;
    }
    for (let k = i + 1; k <= found; k++) out[k] = out[k]! - delta;
    repairs.push({ start: out[i]!, end: out[found + 1]!, found: found - i, placed: found - i, cause: 'shift' });
    i = found + 1;
  }
  return { beats: out, repairs };
}
