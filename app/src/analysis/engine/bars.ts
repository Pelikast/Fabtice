// Bar-led repair of the beats: the network's downbeats as the skeleton.
//
// Why. Where the beat network loses the pulse it most often falls to another
// metrical level for a while: half the tempo (it keeps only beats 1 and 3, the
// owner's « tempo lu à la moitié »), sometimes double, 3 for 2, the off-beats.
// Measured on the chord bench (98 renders and recordings with their true
// beats, `web/spikes/accords/banc/temps.ts`): such passages last from 2 to more
// than 100 beats, so a repair bounded by a length (`repair.ts`, 16 beats) or
// led by the neighbouring tempo cannot catch them all. But in those same
// passages the network's DOWNBEAT output keeps marking the true bars, one per
// bar, at a steady bar length (it is the beats that skip). A bar is never
// shorter or longer because the band plays in « double-time feel »: the bar
// length is what the practice grid must keep.
//
// So: the downbeat peaks are chained into bars of a steady length (each bar
// within `step` of the bars before it; a missed downbeat is a bar of twice the
// length; a fermata, a free passage or an abrupt tempo change breaks the
// chain, and nothing is done there). The metre is the number of beats most
// bars hold. A bar of the chain whose beat count is not the metre (2 in 4/4:
// half tempo; 8: double; 3 or 5: a lost or an extra beat; off-beats) is
// re-gridded: the found beats that fall on its evenly divided beat positions
// are kept as they are (the network's timing), the others dropped, the
// missing positions placed between the kept ones. The bar's own downbeats are
// kept, so the phase is continuous with what is before AND after the passage,
// whatever its length. A bar that holds the right count is never touched
// (rubato, swing, a held note inside the bar). Pure; thresholds measured
// (app/README.md « Réparation des temps »).

import type { RepairedPassage } from '../types';
import { pickPeaks } from './beats';
import type { DownbeatAt } from './repair';

export interface BarOptions {
  /** A bar continues the chain when its length is within this ratio (|ln|) of the chain's bar length. */
  step: number;
  /** The same for a bar of twice the length (a missed downbeat): tighter, three bars of a faster tempo must not pass for two. */
  step2: number;
  /** Longest first bar of a chain, in median found beat intervals. */
  maxBarBeats: number;
  /** Bars a chain needs to be used. */
  minBars: number;
  /** A found beat falls on a beat position when it is within this fraction of a beat of it. */
  snap: number;
  /** A downbeat peak is moved onto a found beat within this fraction of a beat (and two peaks this close are one). */
  downSnap: number;
  /** A bar is re-gridded only when it holds at least this share of its beats (less: the network hears nothing there). */
  minFound: number;
  /** Downbeat peaks below this probability are not candidates. */
  minDown: number;
  /** A chain is re-gridded only when at least this many of its bars hold the metre's count… */
  minRight: number;
  /** …and at least this share of them (else the whole chain is at another level: left to the user). */
  minRightShare: number;
  /** Longest passage (bars) at a ratio other than half or double that is re-gridded (when the metre comes back after it). */
  maxOddBars: number;
  /** Fastest tempo (BPM) the re-gridding may produce. */
  maxBpm: number;
  /** A gap between two chains is refilled when their bar lengths agree within this (|ln|)… */
  gapBack: number;
  /** …it lasts at most this many bars… */
  maxGapBars: number;
  /** …and a whole number of them within this fraction of a bar. */
  gapFit: number;
  /** See `regularAtLevel`: the bar's beats are at its own level within this ratio (|ln|)… */
  level: number;
  /** …and each interval within this ratio of their median. */
  irregular: number;
}

export const BARS: BarOptions = {
  step: Math.log(1.15),
  step2: Math.log(1.08),
  maxBarBeats: 4.6,
  minBars: 4,
  snap: 0.25,
  downSnap: 0.35,
  minFound: 0.5,
  minDown: 0.5,
  minRight: 3,
  minRightShare: 0.1,
  maxOddBars: 8,
  maxBpm: 260,
  gapBack: Math.log(1.1),
  maxGapBars: 16,
  gapFit: 0.12,
  level: Math.log(1.25),
  irregular: Math.log(1.4),
};

/** The downbeat output sampled per frame, its peaks (seconds) above `minDown`. */
export function downbeatPeaks(downAt: DownbeatAt, t0: number, t1: number, minDown: number, fps = 50): number[] {
  const n = Math.max(0, Math.ceil((t1 - t0) * fps)) + 1;
  const lo = Math.log(minDown / (1 - minDown));
  const logit = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, downAt(t0 + f / fps)));
    logit[f] = Math.log(p / (1 - p)) - lo;
  }
  return pickPeaks(logit).map((f) => t0 + f / fps);
}

function nearestIndex(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo]! - t) <= Math.abs(sorted[hi]! - t) ? lo : hi;
}

function median(values: readonly number[]): number {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2]! : (a[n / 2 - 1]! + a[n / 2]!) / 2;
}

/** One bar of a chain: from downbeat `t0` to `t1`, `n` bars long (2: a downbeat was missed). */
export interface ChainBar {
  t0: number;
  t1: number;
  n: number;
}

/**
 * Chains of bars of a steady length from the downbeat peaks. A chain grows
 * from each unused peak: the next downbeat is the peak nearest one bar
 * length ahead (within `step`), else two bar lengths ahead (a missed
 * downbeat); the bar length follows the chain (mean of its last two bars).
 * A chain starts with a bar of at most `maxBarBeats` found beats. Peaks are first moved onto the nearest found beat when one is
 * within a quarter of a beat (the beat peaks are the finer timing).
 */
export function barChains(peaks: readonly number[], beats: readonly number[], o: BarOptions = BARS): ChainBar[][] {
  if (peaks.length < o.minBars + 1) return [];
  const local = beats.length > 1 ? median(beats.slice(1).map((t, i) => t - beats[i]!)) : 0.5;
  // Each peak onto the nearest found beat when one is near; two peaks for one downbeat (a split peak) become one.
  const moved = peaks.map((t) => {
    const j = nearestIndex(beats, t);
    return j >= 0 && Math.abs(beats[j]! - t) <= o.downSnap * local ? { t: beats[j]!, onBeat: true } : { t, onBeat: false };
  });
  const at: number[] = [];
  let lastOnBeat = false;
  for (const p of moved) {
    const prev = at[at.length - 1];
    if (prev !== undefined && p.t - prev <= o.downSnap * local) {
      if (!lastOnBeat && p.onBeat) {
        at[at.length - 1] = p.t;
        lastOnBeat = true;
      }
      continue;
    }
    at.push(p.t);
    lastOnBeat = p.onBeat;
  }
  const used = new Array<boolean>(at.length).fill(false);
  const chains: ChainBar[][] = [];
  for (let s = 0; s + 1 < at.length; s++) {
    if (used[s]) continue;
    // The first bar: the next peak whose distance is confirmed by the one after it.
    let best: ChainBar[] | null = null;
    for (let k = s + 1; k < at.length && k <= s + 4; k++) {
      const len = at[k]! - at[s]!;
      // A bar holds a few beats of the piece's usual beat: never a multiple of bars.
      if (len <= 0 || len > o.maxBarBeats * local) continue;
      const chain: ChainBar[] = [{ t0: at[s]!, t1: at[k]!, n: 1 }];
      const lens = [len];
      let cur = k;
      for (;;) {
        const B = lens.length > 1 ? (lens[lens.length - 1]! + lens[lens.length - 2]!) / 2 : lens[0]!;
        let next = -1;
        let n = 0;
        for (const nb of [1, 2]) {
          let bestErr = nb === 1 ? o.step : o.step2;
          for (let q = cur + 1; q < at.length && at[q]! - at[cur]! < (nb + 0.5) * B * 1.2; q++) {
            const err = Math.abs(Math.log((at[q]! - at[cur]!) / (nb * B)));
            if (err <= bestErr) {
              bestErr = err;
              next = q;
            }
          }
          if (next >= 0) {
            n = nb;
            break;
          }
        }
        if (next < 0) break;
        chain.push({ t0: at[cur]!, t1: at[next]!, n });
        lens.push((at[next]! - at[cur]!) / n);
        cur = next;
      }
      if (!best || chain.length > best.length) best = chain;
    }
    if (!best || best.length < o.minBars) continue;
    // Mark the peaks the chain went through.
    for (let q = s; q < at.length && at[q]! <= best[best.length - 1]!.t1 + 1e-9; q++) used[q] = true;
    chains.push(best);
  }
  return chains;
}

const EPS = 1e-6;

/** Found beats in [t0, t1) of a sorted list (indices). */
function beatsIn(beats: readonly number[], t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats.length; i++) if (beats[i]! >= t0 - EPS && beats[i]! < t1 - EPS) out.push(i);
  return out;
}

/**
 * The beats of one bar re-gridded into `count` beats from `t0` to `t1`: the
 * found beats nearest each evenly divided position (within `snap` of a beat)
 * are kept, the missing positions placed by interpolating between the kept
 * ones (by position index), so that a bar of half the beats gets its
 * midpoints and a slowly changing tempo inside the bar is followed.
 */
export function regridBar(found: readonly number[], t0: number, t1: number, count: number, snap: number): number[] {
  const step = (t1 - t0) / count;
  const anchor = new Array<number | null>(count + 1).fill(null);
  anchor[0] = t0;
  anchor[count] = t1;
  const taken = new Set<number>();
  for (let j = 1; j < count; j++) {
    const g = t0 + j * step;
    let bi = -1;
    for (let i = 0; i < found.length; i++) {
      if (taken.has(i)) continue;
      const e = Math.abs(found[i]! - g);
      if (e <= snap * step && (bi < 0 || e < Math.abs(found[bi]! - g))) bi = i;
    }
    if (bi >= 0) {
      anchor[j] = found[bi]!;
      taken.add(bi);
    }
  }
  const out: number[] = [];
  for (let j = 1; j < count; j++) {
    if (anchor[j] !== null) {
      out.push(anchor[j]!);
      continue;
    }
    let a = j - 1;
    while (anchor[a] === null) a--;
    let b = j + 1;
    while (anchor[b] === null) b++;
    out.push(anchor[a]! + ((anchor[b]! - anchor[a]!) * (j - a)) / (b - a));
  }
  // Keep the order even if a kept beat was out of place.
  for (let j = 1; j < out.length; j++) if (out[j]! <= out[j - 1]!) out[j] = out[j - 1]! + 1e-3;
  return out;
}

export interface BarRepair {
  beats: number[];
  repairs: RepairedPassage[];
  /** The metre the bars hold (null: no chain). */
  meter: number | null;
}

/** Ratios of a found interval to the bar's beat that are another metrical level, never a tempo change of a practice grid. */
const HALF_DOUBLE = new Set(['2', '1/2', '4', '1/4']);
const RATIOS: [string, number][] = [['2', 2], ['1/2', 1 / 2], ['4', 4], ['1/4', 1 / 4], ['3/2', 3 / 2], ['2/3', 2 / 3], ['4/3', 4 / 3], ['3/4', 3 / 4], ['3', 3], ['1/3', 1 / 3]];

/**
 * The simple ratio at which a bar's found beats run, relative to the bar's
 * own beat (bar length / count), when they are regular; null when they are
 * not (a lost or an extra beat, two levels in one bar).
 */
export function levelRatio(found: readonly number[], t0: number, t1: number, count: number, o: BarOptions = BARS): string | null {
  if (found.length < 2) return null;
  const d = found.slice(1).map((t, i) => t - found[i]!);
  const p = median(d);
  if (!d.every((x) => Math.abs(Math.log(x / p)) <= o.irregular)) return null;
  const r = p / ((t1 - t0) / count);
  for (const [name, v] of RATIOS) if (Math.abs(Math.log(r / v)) <= o.level) return name;
  return null;
}

type Counted = { bar: ChainBar; idx: number[]; chain: number };

/** Beats per bar of a counted bar. */
const perBar = (c: Counted) => c.idx.length / c.bar.n;

/**
 * How well a bar's found beats sit on `count` evenly divided positions:
 * share of positions with a found beat within `snap` of a beat, minus share
 * of found beats on no position. 1: every position taken, nothing else.
 */
export function positionFit(found: readonly number[], t0: number, t1: number, count: number, snap: number): number {
  const step = (t1 - t0) / count;
  const hit = new Set<number>();
  let off = 0;
  for (const t of found) {
    const j = Math.round((t - t0) / step);
    if (j >= 0 && j <= count && Math.abs(t - (t0 + j * step)) <= snap * step) hit.add(j % count === 0 && j > 0 ? -1 : j);
    else off++;
  }
  hit.delete(-1);
  return hit.size / count - off / Math.max(1, found.length);
}

/**
 * The metre: among the candidates, the one whose evenly divided bars the found
 * beats fit best (`positionFit`, summed over the bars); ties go to `fallback`.
 * A bar at half tempo fits 4 (half the positions) and not 3; a bar missing
 * one beat of 4 fits 4 better than 3.
 */
export function chainMeter(beats: readonly number[], counts: readonly Counted[], candidates: readonly number[], fallback: number, snap: number): number {
  const score = (m: number) => counts.reduce((s, c) => s + positionFit(c.idx.map((i) => beats[i]!), c.bar.t0, c.bar.t1, c.bar.n * m, snap), 0);
  let best = fallback;
  let bs = score(best);
  for (const m of candidates) {
    const v = score(m);
    if (v > bs + 1e-9) {
      best = m;
      bs = v;
    }
  }
  return best;
}

/**
 * The found beats of a bar are at the bar's own level and regular: their
 * median interval is within `level` of the bar divided by `count`, and no
 * interval is more than `irregular` away from that median. Such a bar whose
 * count is not the metre is a bar the DOWNBEATS got wrong (or a fermata):
 * the beats are kept.
 */
export function regularAtLevel(found: readonly number[], t0: number, t1: number, count: number, o: BarOptions = BARS): boolean {
  if (found.length < 2) return false;
  const d = found.slice(1).map((t, i) => t - found[i]!);
  const p = median(d);
  if (Math.abs(Math.log(p / ((t1 - t0) / count))) > o.level) return false;
  return d.every((x) => Math.abs(Math.log(x / p)) <= o.irregular);
}

/**
 * The bar-led repair. `downAt` is the network's downbeat probability over time;
 * `candidates` the metres allowed; `fallback` the metre of the first estimate.
 */
export function repairByBars(beats: readonly number[], downAt: DownbeatAt, candidates: readonly number[], fallback: number, o: BarOptions = BARS): BarRepair {
  if (beats.length < 8) return { beats: beats.slice(), repairs: [], meter: null };
  const t0 = Math.max(0, beats[0]! - 2);
  const t1 = beats[beats.length - 1]! + 2;
  const peaks = downbeatPeaks(downAt, t0, t1, o.minDown);
  const chains = barChains(peaks, beats, o);
  if (!chains.length) return { beats: beats.slice(), repairs: [], meter: null };
  const counts: Counted[] = [];
  chains.forEach((c, chain) => {
    for (const bar of c) counts.push({ bar, idx: beatsIn(beats, bar.t0, bar.t1), chain });
  });
  const m = chainMeter(beats, counts, candidates, fallback, o.snap);
  const replace: { t0: number; t1: number; inner: number[]; found: number }[] = [];
  /** The chains that hold the metre, with their bar unit (1, or 2 when their downbeats come every other bar). */
  const holding: { chain: ChainBar[]; scale: number }[] = [];
  chains.forEach((_, chain) => {
    const bars = counts.filter((x) => x.chain === chain);
    const right = bars.filter((x) => perBar(x) === m).length;
    const twice = bars.filter((x) => perBar(x) === 2 * m && regularAtLevel(x.idx.map((i) => beats[i]!), x.bar.t0, x.bar.t1, 2 * m * x.bar.n, o)).length;
    // Downbeats every other bar along this chain: its bars are two bars long.
    const scale = twice > right && twice >= bars.length / 2 ? 2 : 1;
    if (scale === 1 && right < Math.max(o.minRight, o.minRightShare * bars.length)) return; // the chain does not hold the metre: left as found
    holding.push({ chain: chains[chain]!, scale });
    // Each bar: right, left alone, or to re-grid (with the simple ratio its beats run at, when regular).
    const kinds = bars.map(({ bar, idx }) => {
      const target = bar.n * scale * m;
      const found = idx.map((i) => beats[i]!);
      if (idx.length === target) return { kind: 'right' as const, target, ratio: null };
      if (idx.length < o.minFound * target || (60 * target) / (bar.t1 - bar.t0) > o.maxBpm) return { kind: 'keep' as const, target, ratio: null };
      // Only between found beats: nothing is invented before the first or after the last one.
      if (bar.t0 < beats[0]! - EPS || bar.t1 > beats[beats.length - 1]! + EPS) return { kind: 'keep' as const, target, ratio: null };
      if (regularAtLevel(found, bar.t0, bar.t1, target, o)) return { kind: 'keep' as const, target, ratio: null };
      const ratio = levelRatio(found, bar.t0, bar.t1, target, o);
      // Fewer beats than the metre, not at a simple ratio, and some off the bar's beat positions: a held
      // note or a stretch inside the bar (a lost beat leaves the others on their positions).
      const offPositions = found.some((t) => {
        const step = (bar.t1 - bar.t0) / target;
        return Math.abs(t - (bar.t0 + Math.round((t - bar.t0) / step) * step)) > o.snap * step;
      });
      if (idx.length < target && ratio === null && offPositions) return { kind: 'keep' as const, target, ratio: null };
      return { kind: 'fix' as const, target, ratio };
    });
    // Passages: runs of bars to re-grid. One at a ratio other than half or double is believed (a tempo
    // change, not a level error) unless it is brief and the chain comes back to the metre after it.
    for (let i = 0; i < kinds.length; ) {
      if (kinds[i]!.kind !== 'fix') {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < kinds.length && kinds[j + 1]!.kind === 'fix') j++;
      const run = kinds.slice(i, j + 1);
      const odd = run.some((k) => k.ratio !== null && !HALF_DOUBLE.has(k.ratio));
      const back = i > 0 && kinds[i - 1]!.kind === 'right' && j + 1 < kinds.length && kinds[j + 1]!.kind === 'right';
      if (!odd || (back && run.length <= o.maxOddBars)) {
        for (let q = i; q <= j; q++) {
          const { bar, idx } = bars[q]!;
          // The bar's downbeat is a found beat (moved onto one) or a placed one.
          const own = idx.filter((x) => Math.abs(beats[x]! - bar.t0) > EPS);
          const inner = regridBar(own.map((x) => beats[x]!), bar.t0, bar.t1, kinds[q]!.target, o.snap);
          replace.push({ t0: bar.t0, t1: bar.t1, inner, found: own.length });
        }
      }
      i = j + 1;
    }
  });
  // Between two chains that hold the metre at the same bar length (the tempo comes back), where the
  // downbeats were lost for a while: the gap lasts a whole number of bars, so it holds that many bars of beats.
  holding.sort((a, b) => a.chain[0]!.t0 - b.chain[0]!.t0);
  for (let k = 0; k + 1 < holding.length; k++) {
    const a = holding[k]!;
    const b = holding[k + 1]!;
    const g0 = a.chain[a.chain.length - 1]!.t1;
    const g1 = b.chain[0]!.t0;
    if (g1 <= g0 + EPS) continue;
    const unit = (c: { chain: ChainBar[]; scale: number }, bars: ChainBar[]) => bars.reduce((s, x) => s + (x.t1 - x.t0) / (x.n * c.scale), 0) / bars.length;
    const before = unit(a, a.chain.slice(-4));
    const after = unit(b, b.chain.slice(0, 4));
    if (Math.abs(Math.log(after / before)) > o.gapBack) continue;
    const B = (before + after) / 2;
    const bars = Math.round((g1 - g0) / B);
    if (bars < 1 || bars > o.maxGapBars || Math.abs((g1 - g0) / B - bars) > o.gapFit) continue;
    const target = bars * m;
    const idx = beatsIn(beats, g0, g1);
    const own = idx.filter((i) => Math.abs(beats[i]! - g0) > EPS);
    if (idx.length === target || idx.length < o.minFound * target) continue;
    replace.push({ t0: g0, t1: g1, inner: regridBar(own.map((i) => beats[i]!), g0, g1, target, o.snap), found: own.length });
  }
  if (!replace.length) return { beats: beats.slice(), repairs: [], meter: m };
  // Rebuild: beats outside the replaced bars as found; each replaced bar is its downbeat and its inner beats.
  const out: number[] = [];
  const repairs: RepairedPassage[] = [];
  let k = 0;
  const sorted = replace.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i]!;
    while (k < sorted.length && sorted[k]!.t1 <= t - EPS) k++;
    const r = sorted[k];
    if (r && t >= r.t0 - EPS && t < r.t1 - EPS) continue; // inside a replaced bar: dropped
    out.push(t);
  }
  for (const r of sorted) {
    out.push(r.t0, ...r.inner, r.t1);
    // Merge consecutive bars into one passage.
    const last = repairs[repairs.length - 1];
    if (last && Math.abs(last.end - r.t0) < EPS) {
      last.end = r.t1;
      last.found += r.found + 1;
      last.placed += r.inner.length + 1;
    } else repairs.push({ start: r.t0, end: r.t1, found: r.found, placed: r.inner.length, cause: 'level' });
  }
  out.sort((a, b) => a - b);
  const dedup = out.filter((t, i) => i === 0 || t - out[i - 1]! > EPS);
  return { beats: dedup, repairs, meter: m };
}
