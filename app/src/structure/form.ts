// The form of the piece from the chart in force: chorus length, choruses,
// section letters inside the chorus, intro and outro (v1/CAHIER.md, C14:
// « la longueur d'un chorus se trouve par ressemblance de la grille avec
// elle-même »). No model: only the repeats of the decoded chords, and the
// known chart of the standard when one fits.
//
//  1. Every bar becomes chord tokens (root + family, `grid.ts`); bars are
//     compared beat by beat. N.C. says nothing (left out).
//  2. Chorus length: the lags (8 bars or more) at which the chart resembles
//     itself are candidates, with their halves and doubles. Each is laid on
//     its best regular lattice (a chord change on the first bar of a chorus
//     breaks ties: a chorus does not start on a held chord) and scored by
//     how well its choruses agree with each other, a bar of drift and a
//     transposition (a last chorus a half step up) allowed, times the share
//     of the piece they cover. The best wins; among nearly as good ones the
//     shortest (a blues is 12, not 24); never under 12 bars (an 8-bar
//     period is an AA chorus of 16).
//  3. Choruses: the lattice gives a consensus chorus (vote per beat); then a
//     dynamic programme cuts the piece into one run of choruses, each aligned
//     to the consensus with a small time warp (a bar dropped or added by the
//     grid costs a little, not the whole chorus), each possibly transposed.
//     Bars before the run are the intro, after it the outro. Twice, the
//     consensus rebuilt from the choruses found.
//  4. Letters: the chorus cut into phrases (8 bars; a blues is one 12-bar
//     section; 16 bars is AA when its halves match, else one section),
//     phrases compared across choruses, letters given in order of first
//     appearance; « A A B C A » becomes AABA with a 16-bar bridge.
//  5. A known chart (found by the title) that fits the recording replaces
//     the consensus for the cut and gives length and letters directly.
//  6. Phrases (for Pop, and when no chorus is found): 8-bar phrases on their
//     best offset, letters only when phrases repeat; nothing invented.
//
// Pure, deterministic; about O(bars × chorus length × 40).

import type { ChordSymbol, Key } from '../model/harmony';
import type { StandardChart } from '../standards/irealRead';
import { semitonesBetween } from '../standards/transposeTo';
import { barSim, barSimShift, barTokens, median, NONE, similarityMatrix, tokenOf, TokenVote, transposeToken, type BarTokens } from './grid';
import type { HarmonyBar, KnownStandard } from './types';

/** One chorus found in the played bars. */
export interface Chorus {
  /** First bar (index into the input bars) and end (exclusive). */
  first: number;
  end: number;
  /** Semitones this chorus is played above the consensus. */
  transpose: number;
  /** For each bar of the chorus, its position in the consensus (−1: a bar the consensus does not have). */
  pos: Int16Array;
}

/** A section played, in bars (index into the input bars). */
export interface PlayedSection {
  first: number;
  end: number;
  letter: string;
  /** Index in `Layout.choruses`, −1 outside a chorus (phrases). */
  chorus: number;
  /** Section of the form (index in `Layout.formSections`), −1 for phrases. */
  formSection: number;
}

export interface FormSection {
  /** Consensus positions [start, end). */
  start: number;
  end: number;
  letter: string;
}

/** A form found: choruses or phrases. */
export interface Layout {
  /** Bars [0, introEnd) are the intro; [outroStart, n) the outro. */
  introEnd: number;
  outroStart: number;
  /** Bars of one chorus (null: phrases, no chorus form). */
  chorusLength: number | null;
  choruses: Chorus[];
  /** Consensus chorus (one entry per position), empty without a chorus. */
  template: BarTokens[];
  /** Sections of the form in consensus positions. */
  formSections: FormSection[];
  /** « AABA »; '' without a chorus form. */
  form: string;
  /** Every section played, ascending. */
  sections: PlayedSection[];
  source: 'repeats' | 'known' | 'phrases';
  /** How well the choruses (or phrases) agree with each other, 0…1. */
  agreement: number;
}

/** Everything the form analysis found. */
export interface FormAnalysis {
  toks: BarTokens[];
  /** Median similarity of two unrelated bars (the floor of every comparison). */
  bg: number;
  /** The chorus form (repeats or known chart); null when none. */
  chorus: Layout | null;
  /** The phrase cut (always tried); null when no phrase repeats. */
  phrases: Layout | null;
  /** A known chart fitted the recording. */
  knownFits: boolean;
}

export interface FormOptions {
  known: readonly KnownStandard[];
  /** Main key in force (the known chart's transposition), null when unknown. */
  key: Key | null;
  /** Modulations in force (bar index, key): a change that lasts 16 bars or more may transpose a chorus. */
  keyChanges: readonly { bar: number; key: Key }[];
  /**
   * Bar indices where who plays changes (from the audio: a soloist enters, the
   * timbre changes); a chorus start that falls on one is likelier. Optional.
   */
  cues?: readonly number[];
}

const MIN_CHORUS = 12;
/** How much a chorus start on a change of who plays counts (the first one more: the theme enters after the intro). */
const CUE_FIRST = 1.5;
const CUE_OTHER = 0.5;
/** No chorus is longer (forms of 64 bars exist; longer ones are two choruses). */
const MAX_CHORUS = 96;

// ---------------------------------------------------------------- helpers

function transposed(b: BarTokens, t: number): BarTokens {
  if (!t) return b;
  return { slots: Int16Array.from(b.slots, (x) => transposeToken(x, t)), weights: b.weights };
}

/** A chord starts on the first beat of bar i (bar 0 always). */
function changesAt(toks: readonly BarTokens[], i: number): boolean {
  if (i <= 0) return true;
  const a = toks[i - 1]!.slots;
  const b = toks[i]!.slots;
  return a[a.length - 1] !== b[0];
}

/** The played bar of chorus `c` at consensus position `p`, −1 when none. */
export function barAt(c: Chorus, p: number): number {
  for (let i = 0; i < c.pos.length; i++) if (c.pos[i] === p) return c.first + i;
  return -1;
}

/** Letters renamed in order of first appearance (A, B, C…). */
function relabel<T extends { letter: string }>(sections: T[]): T[] {
  const map = new Map<string, string>();
  return sections.map((s) => {
    if (!map.has(s.letter)) map.set(s.letter, String.fromCharCode(65 + Math.min(25, map.size)));
    return { ...s, letter: map.get(s.letter)! };
  });
}

// ---------------------------------------------------------------- chorus length

function lagProfile(S: Float32Array, n: number): Float64Array {
  const raw = new Float64Array(n);
  for (let L = 1; L < n; L++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i + L < n; i++) {
      const v = S[i * n + i + L]!;
      if (Number.isNaN(v)) continue;
      s += v;
      c++;
    }
    raw[L] = c ? s / c : 0;
  }
  return raw;
}

const TRANSPOSE_TRIES = [0, 1, 2, -1, -2];
/** Choruses compared with the next ones only (drift accumulates over far ones). */
const NEIGHBOURS = 3;

interface Lattice {
  start: number;
  count: number;
  /** Mean agreement of the choruses with each other (best drift and transposition per pair). */
  agreement: number;
  /** The same pairs moved 3 or 5 bars: what the piece resembles itself anyway. */
  baseline: number;
  /** Bars compared in all. */
  barPairs: number;
  /** Contrast (agreement − baseline) of the pairs 1, 2, 3 choruses apart (index = distance; NaN: none). */
  contrastAt: number[];
  /** Transposition of each chorus relative to the first (from the pairs with the first one), 0 when unsure. */
  transpose: number[];
}

/** The best regular lattice of choruses of length L, and how well they agree. */
function bestLattice(toks: readonly BarTokens[], S: Float32Array, n: number, L: number, bg: number): Lattice | null {
  let bestS = -1;
  let bestScore = -Infinity;
  const tau = bg + 0.3 * (1 - bg);
  for (let s = 0; s + 2 * L <= n + 2 && s <= L + 8; s++) {
    const k = Math.floor((n - s + 2) / L);
    if (k < 2) continue;
    let score = 0;
    const matched = new Uint8Array(k);
    const pairScore = (a: number, b: number, t: number) => {
      let pair = 0;
      for (let j = 0; j < L; j++) {
        const i1 = s + a * L + j;
        const i2 = s + b * L + j;
        if (i2 >= n) continue;
        const v = t === 0 ? S[i1 * n + i2]! : barSim(toks[i1]!, toks[i2]!, -t);
        if (!Number.isNaN(v)) pair += v - tau;
      }
      return pair;
    };
    for (let a = 0; a < k; a++) {
      if (changesAt(toks, s + a * L)) score += 0.5;
      for (let b = a + 1; b < k && b <= a + NEIGHBOURS; b++) {
        // a pair that does not match (a drum solo) counts nothing, not against; the last chorus may be a step up
        let pair = pairScore(a, b, 0);
        if (pair <= 0 && b === k - 1 && k >= 3 && L <= MAX_CHORUS / 2) for (const t of [1, 2, -1, -2]) pair = Math.max(pair, pairScore(a, b, t) - 2);
        if (pair > 0) {
          matched[a] = 1;
          matched[b] = 1;
        }
        score += Math.max(0, pair) / Math.min(k - 1, NEIGHBOURS);
      }
    }
    // every chorus that resembles another counts (a phase that leaves one out is not better for it)
    for (let a = 0; a < k; a++) if (matched[a]) score += 0.15 * L;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestS = s;
    }
  }
  if (bestS < 0) return null;
  const k = Math.min(Math.floor((n - bestS + 2) / L), Math.ceil((n - bestS) / L));
  if (k < 2) return null;
  // agreement of each pair: best drift (±2 bars) and transposition; against the same pair moved 3 or 5
  // bars (the piece's own background: a chart full of II-V resembles itself a little at any lag)
  const pairMean = (a: number, b: number, e: number, t: number): [number, number] => {
    let s = 0;
    let c = 0;
    for (let j = 0; j < L; j++) {
      const i1 = bestS + a * L + j;
      const i2 = bestS + b * L + j + e;
      if (i1 >= n || i2 < 0 || i2 >= n) continue;
      const v = t === 0 ? S[i1 * n + i2]! : barSim(toks[i1]!, toks[i2]!, -t);
      if (Number.isNaN(v)) continue;
      s += v;
      c++;
    }
    return [c ? s / c : NaN, c];
  };
  let sum = 0;
  let sumOff = 0;
  let pairs = 0;
  let barPairs = 0;
  const step = new Array<number>(k).fill(0);
  const byDist = Array.from({ length: NEIGHBOURS + 1 }, () => [0, 0] as [number, number]);
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k && b <= a + NEIGHBOURS; b++) {
      let best = -Infinity;
      let bestT = 0;
      let bestC = 0;
      for (const t of TRANSPOSE_TRIES) {
        // a transposition is only looked for when the pair does not match as it is
        if (t !== 0 && best > 0.5) break;
        for (let e = -2; e <= 2; e++) {
          const [mean, c] = pairMean(a, b, e, t);
          if (c < L / 3) continue;
          const m = mean - 0.03 * Math.abs(e) - (t ? 0.08 : 0);
          if (m > best) {
            best = m;
            bestT = t;
            bestC = c;
          }
        }
      }
      if (!Number.isFinite(best)) continue;
      let off = 0;
      let offN = 0;
      for (const e of [-5, -3, 3, 5]) {
        const [mean, c] = pairMean(a, b, e, bestT);
        if (c < L / 3) continue;
        off += mean;
        offN++;
      }
      sum += best;
      sumOff += offN ? off / offN : bg;
      pairs++;
      barPairs += bestC;
      byDist[b - a]![0] += best - (offN ? off / offN : bg);
      byDist[b - a]![1]++;
      if (b === a + 1) step[b] = bestT;
    }
  }
  if (!pairs) return null;
  const transpose = step.map((_, i) => step.slice(0, i + 1).reduce((x, y) => x + y, 0));
  const contrastAt = byDist.map(([v, c]) => (c ? v / c : NaN));
  return { start: bestS, count: k, agreement: sum / pairs, baseline: sumOff / pairs, barPairs, transpose, contrastAt };
}

export interface LengthChoice {
  /** Null: nothing repeats well enough (`why` says what failed). */
  length: number | null;
  lattice: Lattice | null;
  /** Every length tried (diagnostics, tests). */
  tried: { length: number; agreement: number; contrast: number; z: number; cover: number; value: number; count: number; at: number[] }[];
  why: string;
}

/** The chorus length (see the header, step 2). */
export function chooseChorusLength(toks: readonly BarTokens[], S: Float32Array, n: number, bg: number): LengthChoice {
  const none = (why: string, tried: LengthChoice['tried'] = []): LengthChoice => ({ length: null, lattice: null, tried, why });
  if (n < 2 * MIN_CHORUS - 2) return none('too short');
  const raw = lagProfile(S, n);
  const maxLag = Math.min(MAX_CHORUS, Math.floor(n / 1.7));
  // forms are multiples of 4 bars (12, 16, 24, 32, 40…); a lag one bar off (a bar dropped or added) counts for its neighbour
  const peaks: { lag: number; score: number }[] = [];
  for (let L = 8; L <= maxLag + 1; L += 4) {
    const v = Math.max(raw[L] ?? 0, 0.9 * (raw[L - 1] ?? 0), 0.9 * (raw[L + 1] ?? 0));
    if (v < bg + 0.05) continue;
    const around = (d: number) => Math.max(raw[L + d] ?? 0, raw[L - d] ?? 0);
    if (around(2) > v + 0.05 && around(3) > v + 0.05) continue;
    peaks.push({ lag: L, score: v });
  }
  peaks.sort((a, b) => b.score - a.score);
  const cands = new Set<number>();
  for (const p of peaks.slice(0, 5)) {
    let L = p.lag;
    while (L < MIN_CHORUS) L *= 2;
    cands.add(L);
    if (L % 8 === 0 && L / 2 >= MIN_CHORUS) cands.add(L / 2);
    if (2 * L <= Math.min(maxLag, 64)) cands.add(2 * L);
  }
  const scored: { length: number; lattice: Lattice; value: number; cover: number; contrast: number; z: number }[] = [];
  for (const L of cands) {
    if (L > maxLag + 1) continue;
    const lat = bestLattice(toks, S, n, L, bg);
    if (!lat) continue;
    const cover = Math.min(1, (lat.count * L) / n);
    const contrast = lat.agreement - lat.baseline;
    // how sure: the contrast against the spread of a mean of that many bar comparisons
    const z = (contrast * Math.sqrt(lat.barPairs)) / BAR_SPREAD;
    scored.push({ length: L, lattice: lat, value: contrast * cover, cover, contrast, z });
  }
  const tried = scored.map((x) => ({ length: x.length, agreement: x.lattice.agreement, contrast: x.contrast, z: x.z, cover: x.cover, value: x.value, count: x.lattice.count, at: x.lattice.contrastAt }));
  if (!scored.length) return none('no lag', tried);
  const top = scored.reduce((a, b) => (b.value > a.value ? b : a));
  if (top.contrast < MIN_CONTRAST || top.z < MIN_Z) return none('weak', tried);
  // The shortest length that is a true period. A half chorus is not one: halves one or three apart differ
  // (AABA: AA and BA) while halves two apart agree; a true chorus agrees at every distance (a blues: 12, not
  // 24), one pair spoilt by a dropped bar aside.
  const periodic = (x: (typeof scored)[number]) => {
    const c = x.lattice.contrastAt;
    const d2 = c[2] ?? NaN;
    if (!(d2 > 0)) return true;
    const odd = Math.max(...[c[1], c[3]].map((v) => (v === undefined || Number.isNaN(v) ? -Infinity : v)));
    return odd >= PERIOD_RATIO * d2;
  };
  const pick = scored
    .filter((x) => top.length % x.length === 0 || x.length % top.length === 0)
    .filter((x) => x.z >= MIN_Z && x.contrast >= Math.max(MIN_CONTRAST, 0.6 * top.contrast) && x.cover >= top.cover - 0.15 && periodic(x))
    .sort((a, b) => a.length - b.length)[0];
  const chosen = pick ?? top;
  return { length: chosen.length, lattice: chosen.lattice, tried, why: '' };
}

/** Consecutive choruses must agree this well, relative to choruses further apart. */
const PERIOD_RATIO = 0.75;

/** Spread of one bar comparison (similarities are 0…1, mostly near 0 or 1). */
const BAR_SPREAD = 0.35;
const MIN_CONTRAST = 0.06;
const MIN_Z = 4;

// ---------------------------------------------------------------- consensus and alignment

/** Votes of the bars mapped to each consensus position (transposed back into the consensus' key). */
function consensus(toks: readonly BarTokens[], choruses: readonly Chorus[], L: number): BarTokens[] {
  const beatsVote: Map<number, number>[] = Array.from({ length: L }, () => new Map());
  const mapped: { bar: number; t: number }[][] = Array.from({ length: L }, () => []);
  for (const c of choruses) {
    for (let i = c.first; i < c.end; i++) {
      const p = c.pos[i - c.first]!;
      if (p < 0 || p >= L) continue;
      mapped[p]!.push({ bar: i, t: c.transpose });
      const b = toks[i]!.slots.length;
      beatsVote[p]!.set(b, (beatsVote[p]!.get(b) ?? 0) + 1);
    }
  }
  return mapped.map((list, p) => {
    let beats = 4;
    let bw = -1;
    for (const [b, w] of beatsVote[p]!) if (w > bw || (w === bw && b < beats)) {
      beats = b;
      bw = w;
    }
    const slots = new Int16Array(beats).fill(NONE);
    const weights = new Float32Array(beats).fill(1);
    for (let k = 0; k < beats; k++) {
      const v = new TokenVote();
      for (const { bar, t } of list) {
        const bt = toks[bar]!;
        const nb = bt.slots.length;
        const ik = nb === beats ? k : Math.floor((k * nb) / beats);
        const tok = bt.slots[ik]!;
        if (tok < 0) continue;
        v.add(transposeToken(tok, -t), bt.weights[ik]!);
      }
      const best = v.best();
      slots[k] = best.token;
      weights[k] = best.token < 0 ? 0 : Math.max(0.3, best.share);
    }
    return { slots, weights };
  });
}

/** Rows of the alignment band: a played bar i meets consensus positions i − W … i + W. */
const W = 4;
const BW = 2 * W + 1;
let scratchD = new Float64Array(0);
let scratchM = new Int8Array(0);

/**
 * Aligns the bars from p on to the consensus (length L) with a small time
 * warp: a bar matched scores (similarity − tau), NaN counting 0; a bar or a
 * position left out costs `skip`. `tab[i * L + j]` is the similarity of bar
 * i with position j. One pass gives the score of every chorus length
 * L − 2 … L + 2 (`scores[d + 2]`, −Infinity when it does not fit in n bars);
 * with `pathLen`, the consensus position of each of its bars (−1: an extra
 * bar).
 */
function alignFrom(p: number, n: number, L: number, tab: Float32Array, tau: number, skip: number, pathLen = -1): { scores: Float64Array; pos: Int16Array } {
  const maxLen = Math.min(L + 2, n - p);
  const rows = maxLen + 1;
  if (scratchD.length < rows * BW) {
    scratchD = new Float64Array(rows * BW * 2);
    scratchM = new Int8Array(rows * BW * 2);
  }
  const D = scratchD;
  const M = scratchM;
  for (let i = 0; i <= maxLen; i++) {
    const base = i * BW - (i - W); // index of (i, j) = base + j
    for (let j = Math.max(0, i - W); j <= Math.min(L, i + W); j++) {
      const at = base + j;
      if (i === 0 && j === 0) {
        D[at] = 0;
        M[at] = 0;
        continue;
      }
      let best = -Infinity;
      let move = 0;
      if (i > 0 && j > 0 && j - 1 >= i - 1 - W) {
        const s = tab[(p + i - 1) * L + j - 1]!;
        const v = D[(i - 1) * BW - (i - 1 - W) + j - 1]! + (s !== s ? 0 : s - tau);
        if (v > best) {
          best = v;
          move = 1;
        }
      }
      if (i > 0 && j <= i - 1 + W) {
        const v = D[(i - 1) * BW - (i - 1 - W) + j]! - skip;
        if (v > best) {
          best = v;
          move = 2;
        }
      }
      if (j > 0 && j - 1 >= i - W) {
        const v = D[at - 1]! - skip;
        if (v > best) {
          best = v;
          move = 3;
        }
      }
      D[at] = best;
      M[at] = move;
    }
  }
  const scores = new Float64Array(5).fill(-Infinity);
  for (let d = -2; d <= 2; d++) {
    const len = L + d;
    if (len < 1 || len > maxLen || Math.abs(L - len) > W) continue;
    scores[d + 2] = D[len * BW - (len - W) + L]!;
  }
  const pos = new Int16Array(Math.max(0, pathLen)).fill(-1);
  if (pathLen > 0 && pathLen <= maxLen) {
    let i = pathLen;
    let j = L;
    while (i > 0 || j > 0) {
      const m = M[i * BW - (i - W) + j]!;
      if (m === 1) {
        pos[i - 1] = j - 1;
        i--;
        j--;
      } else if (m === 2) i--;
      else if (m === 3) j--;
      else break;
    }
  }
  return { scores, pos };
}

interface SegmentOptions {
  tau: number;
  skip: number;
  /** Transpositions tried for every chorus (0 first). */
  transpositions: readonly number[];
  /** Expected transposition at each bar (a lasting modulation in force), else 0. */
  keyOffset: Int8Array;
}

const LEN_PENALTY = [1.4, 0.5, 0, 0.5, 1.4];
const TRANSPOSE_PENALTY = 2.5;
const TRANSPOSE_CHANGE = 1;
const SKIP = 0.45;

/** One run of choruses aligned to the consensus `T` (see the header, step 3). */
function segment(toks: readonly BarTokens[], T: readonly BarTokens[], o: SegmentOptions): Chorus[] {
  const n = toks.length;
  const L = T.length;
  if (n < L - 2 || L < 4) return [];
  const tables = o.transpositions.map((t) => {
    const tab = new Float32Array(n * L);
    for (let i = 0; i < n; i++) for (let j = 0; j < L; j++) tab[i * L + j] = barSimShift(T[j]!, toks[i]!, -t);
    return tab;
  });
  const nt = o.transpositions.length;
  // F[q, t]: best run whose last chorus (transposed by t) ends at bar q; runs start anywhere
  const F = new Float64Array((n + 1) * nt).fill(-Infinity);
  const from = new Int32Array((n + 1) * nt).fill(-1);
  for (let p = 0; p + L - 2 <= n; p++) {
    for (let ti = 0; ti < nt; ti++) {
      const t = o.transpositions[ti]!;
      // continue a run ending at p, or start a fresh one
      let prev = -1;
      let base = 0;
      for (let tj = 0; tj < nt; tj++) {
        const f = F[p * nt + tj]! - (o.transpositions[tj] !== t ? TRANSPOSE_CHANGE : 0);
        if (f > base) {
          base = f;
          prev = p * nt + tj;
        }
      }
      const expected = o.keyOffset[p] ?? 0;
      const pen = t !== 0 && t !== expected ? TRANSPOSE_PENALTY : 0;
      const { scores } = alignFrom(p, n, L, tables[ti]!, o.tau, o.skip);
      for (let d = -2; d <= 2; d++) {
        const sc = scores[d + 2]!;
        if (!Number.isFinite(sc)) continue;
        const q = p + L + d;
        const v = base + sc - LEN_PENALTY[d + 2]! - pen;
        if (v > F[q * nt + ti]!) {
          F[q * nt + ti] = v;
          from[q * nt + ti] = prev === -1 ? -2 - p : prev;
        }
      }
    }
  }
  let best = -1;
  let bestV = 0;
  for (let k = 0; k < F.length; k++) if (F[k]! > bestV + 1e-9) {
    bestV = F[k]!;
    best = k;
  }
  if (best < 0) return [];
  const ends: { q: number; ti: number; p: number }[] = [];
  let cur = best;
  while (cur >= 0) {
    const q = Math.floor(cur / nt);
    const ti = cur % nt;
    const f = from[cur]!;
    const p = f <= -2 ? -2 - f : Math.floor(f / nt);
    ends.push({ q, ti, p });
    cur = f <= -2 ? -1 : f;
  }
  ends.reverse();
  return ends.map(({ q, ti, p }) => {
    const { pos } = alignFrom(p, n, L, tables[ti]!, o.tau, o.skip, q - p);
    return { first: p, end: q, transpose: o.transpositions[ti]!, pos };
  });
}

/** Mean similarity of the bars of different choruses at the same consensus position. */
function crossAgreement(toks: readonly BarTokens[], choruses: readonly Chorus[], L: number): number {
  const at: { bar: number; t: number }[][] = Array.from({ length: L }, () => []);
  for (const c of choruses) for (let i = 0; i < c.pos.length; i++) {
    const p = c.pos[i]!;
    if (p >= 0 && p < L) at[p]!.push({ bar: c.first + i, t: c.transpose });
  }
  let s = 0;
  let k = 0;
  for (const list of at) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const a = list[x]!;
      const b = list[y]!;
      const v = barSim(transposed(toks[a.bar]!, -a.t), toks[b.bar]!, -b.t);
      if (Number.isNaN(v)) continue;
      s += v;
      k++;
    }
  }
  return k ? s / k : 0;
}

// ---------------------------------------------------------------- letters, and where the chorus starts

/** Two phrases are the same section from this ratio on (A and A2 of rhythm changes ≈ 0.75; Autumn's B and C ≈ 0.3). */
const SAME_SECTION = 0.6;

/** The forms of the standards, in 8-bar phrases (before AABCA becomes AABA with a 16-bar bridge). */
const USUAL_FORMS = new Set(['AABA', 'ABAC', 'AABC', 'AAB', 'AABCA', 'AA', 'AB', 'ABAB', 'AABB', 'A']);

/** The phrase length of a chorus of L bars (`halvesSame`: its two 8-bar halves are one section). */
function phraseLength(L: number, halvesSame: () => boolean): number {
  if (L % 8 === 0 && L >= 24) return 8;
  if (L === 16 && halvesSame()) return 8;
  return L;
}

/**
 * The phrases of the choruses, read from a chorus start moved by `r` bars:
 * how alike two phrases are across choruses, and the letters they get.
 */
class Phrases {
  private readonly map: Int32Array[];
  constructor(
    private readonly toks: readonly BarTokens[],
    private readonly S: Float32Array,
    private readonly choruses: readonly Chorus[],
    private readonly L: number,
    private readonly bg: number,
  ) {
    this.map = choruses.map((c) => {
      const m = new Int32Array(L).fill(-1);
      for (let i = 0; i < c.pos.length; i++) {
        const p = c.pos[i]!;
        if (p >= 0 && p < L && m[p] === -1) m[p] = c.first + i;
      }
      return m;
    });
  }

  /** Played bar of chorus c at position p of a chorus moved by r (null: none). */
  private bar(c: number, p: number, r: number): { bar: number; t: number } | null {
    let q = p + r;
    let k = c;
    while (q >= this.L) {
      q -= this.L;
      k++;
    }
    while (q < 0) {
      q += this.L;
      k--;
    }
    if (k < 0 || k >= this.choruses.length) return null;
    const bar = this.map[k]![q]!;
    return bar < 0 ? null : { bar, t: this.choruses[k]!.transpose };
  }

  /** Mean similarity of phrase a in one chorus with phrase b in another (positions of a chorus moved by r). */
  sim(a: number, b: number, len: number, r: number): number {
    let s = 0;
    let n = 0;
    const K = this.choruses.length;
    for (let x = 0; x < K; x++) {
      for (let y = Math.max(0, x - NEIGHBOURS); y < Math.min(K, x + NEIGHBOURS + 1); y++) {
        if (x === y) continue; // choruses near each other only (as the lattice: far ones drift)
        for (let k = 0; k < len; k++) {
          const bx = this.bar(x, a + k, r);
          const by = this.bar(y, b + k, r);
          if (!bx || !by) continue;
          const v = bx.t === by.t ? this.S[bx.bar * this.toks.length + by.bar]! : barSim(transposed(this.toks[bx.bar]!, -bx.t), this.toks[by.bar]!, -by.t);
          if (Number.isNaN(v)) continue;
          s += v;
          n++;
        }
      }
    }
    return n ? s / n : NaN;
  }

  /** Phrases a and b as the same section, 0…1+ (their similarity between the background and their own repeats). */
  same(a: number, b: number, len: number, r: number): number {
    const ab = this.sim(a, b, len, r);
    const aa = this.sim(a, a, len, r);
    const bb = this.sim(b, b, len, r);
    if ([ab, aa, bb].some(Number.isNaN)) return 0;
    const self = (aa + bb) / 2;
    return self - this.bg > 0.05 ? (ab - this.bg) / (self - this.bg) : 0;
  }

  /** Letters of the phrases (in order of first appearance) and how cleanly they separate (0…1). */
  letters(len: number, r: number): { letters: string[]; clean: number } {
    const starts: number[] = [];
    for (let s = 0; s + len <= this.L; s += len) starts.push(s);
    const reps: number[] = [];
    const letters: string[] = [];
    const ratio = new Map<string, number>();
    const pair = (a: number, b: number) => {
      const key = `${a},${b}`;
      if (!ratio.has(key)) ratio.set(key, this.same(a, b, len, r));
      return ratio.get(key)!;
    };
    for (const s of starts) {
      let bestL = -1;
      let bestV = SAME_SECTION;
      reps.forEach((rep, li) => {
        const v = pair(rep, s);
        if (v >= bestV) {
          bestV = v;
          bestL = li;
        }
      });
      if (bestL >= 0) letters.push(String.fromCharCode(65 + bestL));
      else {
        reps.push(s);
        letters.push(String.fromCharCode(65 + Math.min(25, reps.length - 1)));
      }
    }
    let clean = 0;
    let pairs = 0;
    for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++) {
      const v = Math.max(0, Math.min(1, pair(starts[i]!, starts[j]!)));
      clean += letters[i] === letters[j] ? v : 1 - v;
      pairs++;
    }
    return { letters, clean: pairs ? clean / pairs : 1 };
  }
}

/**
 * The shift of the chorus start (in bars, −L/2…L/2) that makes the most
 * musical form: a usual form (AABA rather than ABAA or ABCB), phrases cleanly
 * alike or cleanly different (a cut one bar off blurs both), chords that
 * change on phrase starts, the run of choruses kept whole, and a piece that
 * ends with its last chorus rather than with the beginning of another (an
 * intro on the last bars of the form is common, an outro on its first bars
 * much less).
 */
/** Weight of the bars a rotation takes in or leaves out (the priors above weigh more: the chords alone often cannot tell). */
const FIT_W = 0.3;
function bestRotation(ph: Phrases, toks: readonly BarTokens[], T: readonly BarTokens[], choruses: readonly Chorus[], n: number, len: number, tau: number, cues: ReadonlySet<number>): number {
  const L = T.length;
  const c0 = choruses[0]!;
  const cz = choruses[choruses.length - 1]!;
  const first = c0.first;
  const end = cz.end;
  // how well a bar fits a position of the consensus (bars that a rotation brings into the run, or leaves out)
  const fit = (bar: number, pos: number, t: number) => {
    if (bar < 0 || bar >= n) return 0;
    const v = barSimShift(T[((pos % L) + L) % L]!, toks[bar]!, -t);
    return Number.isNaN(v) ? 0 : v - tau;
  };
  let best = 0;
  let bestScore = -Infinity;
  for (let r = -Math.floor(L / 2) + 1; r <= Math.floor(L / 2); r++) {
    let score = 0;
    if (len < L) {
      const { letters, clean } = ph.letters(len, r);
      score += 8 * clean + (USUAL_FORMS.has(letters.join('')) ? 3 : 0);
    }
    for (let p = 0; p < L; p += len) {
      const prev = T[(((p + r - 1) % L) + L) % L]!.slots;
      if (prev[prev.length - 1] !== T[(((p + r) % L) + L) % L]!.slots[0]) score += 0.25;
    }
    // the bars the moved run takes in or leaves out, as the alignment would count them
    if (r > 0) {
      for (let j = 0; j < r; j++) score += FIT_W * (fit(end + j, j, cz.transpose) - fit(first + j, j, c0.transpose));
    } else if (r < 0) {
      for (let j = r; j < 0; j++) score += FIT_W * (fit(first + j, L + j, c0.transpose) - fit(end + j, L + j, cz.transpose));
    }
    // who plays changes where a chorus starts (a soloist enters at a chorus start, the theme after the intro)
    if (cues.size) choruses.forEach((c, k) => {
      if (cues.has(c.first + r)) score += k === 0 ? CUE_FIRST : CUE_OTHER;
    });
    const f = first + r;
    const e = end + r;
    const lost = Math.max(0, -f) + Math.max(0, e - n);
    score -= 0.3 * lost + 0.05 * Math.max(0, f) + 0.1 * Math.max(0, n - e) + 0.02 * Math.abs(r);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Letters of the form from the repeats (see the header, step 4). */
function lettersFromRepeats(ph: Phrases, L: number, len: number): FormSection[] {
  if (len >= L) return [{ start: 0, end: L, letter: 'A' }];
  const { letters } = ph.letters(len, 0);
  return mergeBridge(letters.map((letter, i) => ({ start: i * len, end: Math.min(L, (i + 1) * len), letter })));
}

/** « A A B C A » → AABA with a 16-bar bridge: two once-only letters in a row between returns of a letter heard three times or more. */
function mergeBridge(sections: FormSection[]): FormSection[] {
  const count = (l: string) => sections.filter((s) => s.letter === l).length;
  for (let i = 1; i + 2 < sections.length; i++) {
    const before = sections[i - 1]!.letter;
    const x = sections[i]!;
    const y = sections[i + 1]!;
    const after = sections[i + 2]!.letter;
    if (before === after && count(before) >= 3 && count(x.letter) === 1 && count(y.letter) === 1 && x.letter !== y.letter) {
      return relabel([...sections.slice(0, i), { start: x.start, end: y.end, letter: x.letter }, ...sections.slice(i + 2)]);
    }
  }
  return sections;
}

// ---------------------------------------------------------------- known chart

interface KnownBody {
  toks: BarTokens[];
  sections: FormSection[];
  /** The chord sounding on each beat of each bar, as written in the chart (null: N.C. or nothing yet). */
  chords: (ChordSymbol | null)[][];
}

/** The known chart without its intro or verse, as tokens and letters. */
export function knownBody(chart: StandardChart): KnownBody | null {
  const bars = chart.bars;
  if (!bars.length) return null;
  const firstPass = new Map<number, string | null>();
  for (const b of bars) if (b.pass === 1 && !firstPass.has(b.source)) firstPass.set(b.source, b.section);
  const sectionOf = (i: number): string | null => {
    const b = bars[i]!;
    if (b.section) return b.section;
    if (b.pass > 1) return firstPass.get(b.source) ?? null;
    return null;
  };
  const isLetter = (s: string | null) => !!s && /^[A-Z]$/.test(s);
  let start = 0;
  if (/^[iv]$/.test(sectionOf(0) ?? '')) while (start < bars.length && !isLetter(sectionOf(start))) start++;
  if (start >= bars.length) return null;
  const toks: BarTokens[] = [];
  const symbols: (ChordSymbol | null)[][] = [];
  const marks: (string | null)[] = [];
  let cur: number = NONE;
  let sym: ChordSymbol | null = null;
  for (let i = start; i < bars.length; i++) {
    const b = bars[i]!;
    const sec = sectionOf(i);
    if (i > start && /^[iv]$/.test(sec ?? '')) break; // a later intro or verse: the form is over
    const n = Math.max(1, b.meter.numerator);
    const slots = new Int16Array(n).fill(NONE);
    const beatSyms: (ChordSymbol | null)[] = [];
    let ci = 0;
    const chords = [...b.chords].sort((x, y) => x.beat - y.beat);
    for (let k = 0; k < n; k++) {
      while (ci < chords.length && chords[ci]!.beat <= k + 1e-6) {
        const c = chords[ci++]!;
        cur = tokenOf(c.chord);
        sym = c.chord;
      }
      slots[k] = cur;
      beatSyms.push(sym);
    }
    toks.push({ slots, weights: new Float32Array(n).fill(1) });
    symbols.push(beatSyms);
    marks.push(isLetter(sec) ? sec : null);
  }
  const sections: FormSection[] = [];
  marks.forEach((m, i) => {
    if (i === 0 || m) sections.push({ start: i, end: i + 1, letter: m ?? 'A' });
    else sections[sections.length - 1]!.end = i + 1;
  });
  return { toks, sections, chords: symbols };
}

// ---------------------------------------------------------------- phrases

const PHRASE_SAME = 0.55;

/** Phrases of `len` bars from the offset where they repeat best; letters only for repeated phrases. */
function phraseLayout(toks: readonly BarTokens[], S: Float32Array, bg: number, len: number): Layout | null {
  const n = toks.length;
  if (n < 2 * len) return null;
  const sim = (a: number, b: number, t = 0) => {
    let s = 0;
    let c = 0;
    for (let k = 0; k < len; k++) {
      const v = t ? barSim(toks[a + k]!, toks[b + k]!, -t) : S[(a + k) * n + b + k]!;
      if (Number.isNaN(v)) continue;
      s += v;
      c++;
    }
    return c ? s / c : NaN;
  };
  const tau = bg + 0.3 * (1 - bg);
  let bestO = 0;
  let bestScore = -Infinity;
  for (let o = 0; o < len && o + 2 * len <= n; o++) {
    const starts: number[] = [];
    for (let s = o; s + len <= n; s += len) starts.push(s);
    let score = 0;
    for (const a of starts) {
      if (changesAt(toks, a)) score += 0.15;
      let m = 0;
      for (const b of starts) if (b !== a) {
        const v = sim(a, b);
        if (!Number.isNaN(v)) m = Math.max(m, v - tau);
      }
      score += m;
    }
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestO = o;
    }
  }
  const starts: number[] = [];
  for (let s = bestO; s + len <= n; s += len) starts.push(s);
  // two phrases are one section only when most of their bars agree (a through-composed tune full of II-V resembles itself a little)
  const thr = bg + PHRASE_SAME * (1 - bg);
  const letters: number[] = [];
  const reps: number[] = [];
  for (const s of starts) {
    let best = -1;
    let bv = thr;
    reps.forEach((r, li) => {
      const v = sim(r, s);
      if (!Number.isNaN(v) && v >= bv) {
        bv = v;
        best = li;
      }
    });
    if (best >= 0) letters.push(best);
    else {
      reps.push(s);
      letters.push(reps.length - 1);
    }
  }
  // a suffix of new letters that all repeat earlier phrases a step or two up (a « truck driver » modulation)
  for (let k = 1; k < starts.length; k++) {
    if (!letters.slice(k).every((l) => letters.indexOf(l) >= k)) continue;
    let done = false;
    for (const t of [1, 2, -1, -2]) {
      const mapped: number[] = [];
      for (let m = k; m < starts.length; m++) {
        let best = -1;
        let bv = thr + 0.05;
        for (let r = 0; r < k; r++) {
          const v = sim(starts[r]!, starts[m]!, t);
          if (!Number.isNaN(v) && v >= bv) {
            bv = v;
            best = letters[r]!;
          }
        }
        if (best < 0) break;
        mapped.push(best);
      }
      if (mapped.length === starts.length - k) {
        for (let m = k; m < starts.length; m++) letters[m] = mapped[m - k]!;
        done = true;
        break;
      }
    }
    if (done) break;
  }
  const counts = new Map<number, number>();
  for (const l of letters) counts.set(l, (counts.get(l) ?? 0) + 1);
  if (![...counts.values()].some((c) => c >= 2)) return null;
  let out = starts.map((s, i) => ({ first: s, end: s + len, letter: String(letters[i]), id: letters[i]! }));
  // a first or last phrase heard once, next to repeated ones, is an intro or an outro
  if (out.length >= 3 && counts.get(out[0]!.id) === 1) out = out.slice(1);
  if (out.length >= 3 && counts.get(out[out.length - 1]!.id) === 1) out = out.slice(0, -1);
  const sections = relabel(out).map((p) => ({ first: p.first, end: p.end, letter: p.letter, chorus: -1, formSection: -1 }));
  let agree = 0;
  let pairs = 0;
  for (let x = 0; x < sections.length; x++) for (let y = x + 1; y < sections.length; y++) {
    if (sections[x]!.letter !== sections[y]!.letter) continue;
    const v = sim(sections[x]!.first, sections[y]!.first);
    if (Number.isNaN(v)) continue;
    agree += v;
    pairs++;
  }
  return {
    introEnd: sections[0]!.first,
    outroStart: sections[sections.length - 1]!.end,
    chorusLength: null,
    choruses: [],
    template: [],
    formSections: [],
    form: '',
    sections,
    source: 'phrases',
    agreement: pairs ? agree / pairs : 0,
  };
}

// ---------------------------------------------------------------- the analysis

/** The played sections of a run of choruses and its letters. */
function chorusLayout(toks: readonly BarTokens[], L: number, choruses: Chorus[], T: BarTokens[], formSections: FormSection[], source: 'repeats' | 'known'): Layout {
  const sections: PlayedSection[] = [];
  choruses.forEach((c, ci) => {
    formSections.forEach((fs, si) => {
      let first = -1;
      for (let i = 0; i < c.pos.length; i++) {
        if (c.pos[i]! >= fs.start) {
          first = c.first + i;
          break;
        }
      }
      if (first >= 0) sections.push({ first, end: c.end, letter: fs.letter, chorus: ci, formSection: si });
    });
  });
  sections.sort((a, b) => a.first - b.first || a.formSection - b.formSection);
  for (let k = 0; k < sections.length; k++) {
    const next = sections[k + 1];
    if (next && next.chorus === sections[k]!.chorus) sections[k]!.end = next.first;
  }
  return {
    introEnd: choruses[0]!.first,
    outroStart: choruses[choruses.length - 1]!.end,
    chorusLength: L,
    choruses,
    template: T,
    formSections,
    form: formSections.map((s) => s.letter).join(''),
    sections: sections.filter((s) => s.end > s.first),
    source,
    agreement: crossAgreement(toks, choruses, L),
  };
}

/** The form of the piece (see the header). */
export function analyseForm(bars: readonly HarmonyBar[], o: FormOptions): FormAnalysis {
  const n = bars.length;
  const toks = barTokens(bars);
  const S = similarityMatrix(toks);
  // the background: the median similarity of bar pairs (a sample of them on long pieces)
  const off: number[] = [];
  const stride = Math.max(3, Math.floor((n * n) / 40000));
  for (let i = 0; i < n; i++) for (let j = i + 2 + (i % stride); j < n; j += stride) {
    const v = S[i * n + j]!;
    if (!Number.isNaN(v)) off.push(v);
  }
  const bg = off.length ? Math.min(0.6, median(off)) : 0;

  // lasting modulations in force (16 bars or more): the choruses there may be transposed
  const keyOffset = new Int8Array(n);
  const changes = [...o.keyChanges].sort((a, b) => a.bar - b.bar);
  changes.forEach((c, k) => {
    const end = changes[k + 1]?.bar ?? n;
    if (end - c.bar < 16 || !o.key) return;
    const offv = semitonesBetween(o.key, c.key);
    for (let i = Math.max(0, c.bar); i < Math.min(n, end); i++) keyOffset[i] = offv;
  });
  const lasting = [...new Set(Array.from(keyOffset).filter((x) => x !== 0))];

  // ---- the repeats
  let chorus: Layout | null = null;
  const choice = chooseChorusLength(toks, S, n, bg);
  if (choice.length !== null && choice.lattice) {
    const L = choice.length;
    const lat = choice.lattice;
    let choruses: Chorus[] = [];
    for (let c = 0; c < lat.count; c++) {
      const first = lat.start + c * L;
      const end = Math.min(n, first + L);
      if (end - first < L / 2) break;
      const pos = new Int16Array(end - first);
      for (let i = 0; i < pos.length; i++) pos[i] = i;
      choruses.push({ first, end, transpose: lat.transpose[c] ?? 0, pos });
    }
    const transpositions = [...new Set([0, ...lasting, ...lat.transpose.filter((t) => t !== 0)])];
    let T = consensus(toks, choruses, L);
    for (let iter = 0; iter < 3 && choruses.length >= 2; iter++) {
      // the third pass: where does the chorus start (the repeats alone do not say)
      if (iter === 2) {
        const ph = new Phrases(toks, S, choruses, L, bg);
        const len = phraseLength(L, () => ph.same(0, 8, 8, 0) >= SAME_SECTION);
        const r = bestRotation(ph, toks, T, choruses, n, len, Math.min(0.6, Math.max(0.2, bg + 0.4 * (crossAgreement(toks, choruses, L) - bg))), new Set(o.cues ?? []));
        if (r === 0) break;
        T = T.map((_, j) => T[(((j + r) % L) + L) % L]!);
      }
      const fit = crossAgreement(toks, choruses, L);
      const tau = Math.min(0.6, Math.max(0.2, bg + 0.4 * (fit - bg)));
      const next = segment(toks, T, { tau, skip: SKIP, transpositions, keyOffset });
      if (next.length < 2) break;
      choruses = next;
      T = consensus(toks, choruses, L);
    }
    if (choruses.length >= 2) {
      const ph = new Phrases(toks, S, choruses, L, bg);
      const len = phraseLength(L, () => ph.same(0, 8, 8, 0) >= SAME_SECTION);
      chorus = chorusLayout(toks, L, choruses, T, lettersFromRepeats(ph, L, len), 'repeats');
    }
  }

  // ---- the known chart, when it fits
  let knownFits = false;
  for (const k of o.known.slice(0, 2)) {
    const body = knownBody(k.chart);
    if (!body || body.toks.length < 8 || body.toks.length * 1.5 > n + 2) continue;
    const L = body.toks.length;
    // transposition: the chart's key against the key in force, else the best of all
    let ts: number[];
    if (o.key && k.chart.key) ts = [semitonesBetween(k.chart.key, o.key)];
    else {
      const score = (t: number) => {
        let best = 0;
        for (let s = 0; s + L <= n; s++) {
          let v = 0;
          for (let j = 0; j < L; j++) {
            const x = barSim(body.toks[j]!, toks[s + j]!, -t);
            if (!Number.isNaN(x)) v += x;
          }
          best = Math.max(best, v);
        }
        return best;
      };
      const all = Array.from({ length: 12 }, (_, i) => i - 5).map((t) => ({ t, v: score(t) })).sort((a, b) => b.v - a.v);
      ts = [all[0]!.t];
    }
    for (const t of ts) {
      const T = body.toks.map((b) => transposed(b, t));
      const tau = Math.min(0.5, bg + 0.3 * (1 - bg));
      const choruses = segment(toks, T, { tau, skip: SKIP, transpositions: [...new Set([0, ...lasting])], keyOffset });
      if (!choruses.length) continue;
      const covered = choruses.reduce((a, c) => a + c.end - c.first, 0);
      let fitSum = 0;
      let fitN = 0;
      for (const c of choruses) for (let i = 0; i < c.pos.length; i++) {
        const p = c.pos[i]!;
        if (p < 0) continue;
        const v = barSim(T[p]!, toks[c.first + i]!, -c.transpose);
        if (Number.isNaN(v)) continue;
        fitSum += v;
        fitN++;
      }
      const fit = fitN ? fitSum / fitN : 0;
      if (covered < Math.max(0.5 * n, 1.5 * L) || fit < bg + 0.2) continue;
      // the recording's own consensus on the chart's positions (the chart where nothing was heard)
      const own = consensus(toks, choruses, L).map((b, i) => (b.slots.every((x) => x < 0) ? T[i]! : b));
      const layout = chorusLayout(toks, L, choruses, own, body.sections, 'known');
      // the known chart wins unless the repeats explain the piece clearly better
      if (!chorus || layout.agreement >= chorus.agreement - 0.1 || choruses.length >= chorus.choruses.length) {
        chorus = layout;
        knownFits = true;
      }
      break;
    }
    if (knownFits) break;
  }

  const phrases = phraseLayout(toks, S, bg, n >= 24 ? 8 : 4);
  return { toks, bg, chorus, phrases, knownFits };
}
