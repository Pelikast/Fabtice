// The chart in force read as a grid of chord tokens, and how alike two bars
// are. Shared by the form detection (`form.ts`) and the simplified chart
// (`simplify.ts`).
//
// A token is a root and a coarse family (major, minor, dominant, half-
// diminished, diminished, suspended, augmented): what a jazz player keeps of
// a chord when he compares two choruses (G7, G13 and G7♯5 are one token;
// Dmaj7 and D6 are one token). N.C. and « nothing sounding » are `NONE`: they
// say nothing, and are left out of every comparison (a drum solo read as
// N.C. neither matches nor breaks a chorus).
//
// Pure; a bar costs O(beats) to compare.

import type { ChordQuality, ChordSymbol } from '../model/harmony';
import type { HarmonyBar } from './types';

/** Coarse families of a token. */
export const MAJ = 0;
export const MIN = 1;
export const DOM = 2;
export const HDIM = 3;
export const DIM = 4;
export const SUS = 5;
export const AUG = 6;
export const FAMILIES = 7;

export const FAMILY_OF: Readonly<Record<ChordQuality, number>> = {
  maj: MAJ, maj7: MAJ, maj6: MAJ,
  min: MIN, min7: MIN, min6: MIN, minmaj7: MIN,
  '7': DOM, aug7: DOM,
  '7sus4': SUS, sus4: SUS, sus2: SUS,
  hdim7: HDIM,
  dim: DIM, dim7: DIM,
  aug: AUG,
};

/** No chord: N.C., or nothing sounding yet. */
export const NONE = -1;

/** Token of a chord: root × 8 + family; `NONE` for N.C. */
export function tokenOf(c: ChordSymbol | null): number {
  return c ? c.root * 8 + FAMILY_OF[c.quality] : NONE;
}

export const rootOf = (t: number): number => t >> 3;
export const familyOf = (t: number): number => t & 7;
export const makeToken = (root: number, family: number): number => ((((root % 12) + 12) % 12) << 3) | family;

/** The token moved by `semitones` (NONE stays NONE). */
export function transposeToken(t: number, semitones: number): number {
  return t < 0 ? t : makeToken(rootOf(t) + semitones, familyOf(t));
}

// Same root, other family: how often one is read (or played) for the other.
const SAME_ROOT: number[][] = (() => {
  const m = Array.from({ length: FAMILIES }, () => new Array<number>(FAMILIES).fill(0.25));
  const set = (a: number, b: number, v: number) => {
    m[a]![b] = v;
    m[b]![a] = v;
  };
  for (let f = 0; f < FAMILIES; f++) m[f]![f] = 1;
  set(MAJ, DOM, 0.5);
  set(MIN, HDIM, 0.55);
  set(MIN, DOM, 0.35);
  set(MIN, MAJ, 0.3);
  set(HDIM, DIM, 0.6);
  set(DOM, SUS, 0.65);
  set(DOM, AUG, 0.6);
  set(MAJ, AUG, 0.4);
  set(MAJ, SUS, 0.4);
  return m;
})();

/**
 * How alike two tokens are, 0…1 (NONE never reaches here). Same root: by
 * family (maj7 ↔ 7 half alike…); the tritone substitute of a dominant, a
 * diminished chord a minor third away, the relative major / minor: partly.
 */
export function tokenSim(a: number, b: number): number {
  if (a === b) return 1;
  const ra = a >> 3;
  const rb = b >> 3;
  const fa = a & 7;
  const fb = b & 7;
  if (ra === rb) return SAME_ROOT[fa]![fb]!;
  const d = (rb - ra + 12) % 12;
  if (fa === DOM && fb === DOM && d === 6) return 0.6;
  if (fa === DIM && fb === DIM && d % 3 === 0) return 0.8;
  // relative major / minor (C ↔ Am), and Am7♭5 ↔ C (its upper structure… C△ over A)
  if (fa === MAJ && (fb === MIN || fb === HDIM) && d === 9) return 0.3;
  if ((fa === MIN || fa === HDIM) && fb === MAJ && d === 3) return 0.3;
  // Bm7♭5 ↔ G7 (G9 without its root), B°7 ↔ G7♭9
  if ((fa === HDIM || fa === DIM) && fb === DOM && d === 8) return 0.35;
  if (fa === DOM && (fb === HDIM || fb === DIM) && d === 4) return 0.35;
  return 0;
}

/** One bar as the comparisons read it: the token sounding on each beat and how much it is trusted. */
export interface BarTokens {
  /** One token per beat of the bar (`NONE`: N.C. or nothing). */
  slots: Int16Array;
  /** Trust of each slot: 1 normally, less for a doubtful chord, more for a chord written by hand. */
  weights: Float32Array;
}

const W_HAND = 2;
const W_DOUBTFUL = 0.6;

/** The token sounding on every beat of every bar (the carried chord fills the beats before the first one). */
export function barTokens(bars: readonly HarmonyBar[]): BarTokens[] {
  return bars.map((b) => {
    const n = Math.max(1, Math.round(b.beats) || 1);
    const slots = new Int16Array(n).fill(NONE);
    const weights = new Float32Array(n).fill(1);
    let cur = tokenOf(b.carried);
    let w = 1;
    let ci = 0;
    const chords = [...b.chords].sort((x, y) => x.beat - y.beat);
    for (let k = 0; k < n; k++) {
      while (ci < chords.length && chords[ci]!.beat <= k + 1e-6) {
        const c = chords[ci++]!;
        cur = tokenOf(c.chord);
        w = c.byHand ? W_HAND : c.doubtful ? W_DOUBTFUL : 1;
      }
      slots[k] = cur;
      weights[k] = w;
    }
    return { slots, weights };
  });
}

/**
 * How alike two bars are, 0…1, beat by beat (bars of other lengths are read
 * in proportion), the second one moved by `semitones`. NaN when no beat can
 * be compared (N.C. on one side).
 */
export function barSim(a: BarTokens, b: BarTokens, semitones = 0): number {
  const na = a.slots.length;
  const nb = b.slots.length;
  const n = Math.max(na, nb);
  let s = 0;
  let w = 0;
  for (let k = 0; k < n; k++) {
    const ia = na === n ? k : Math.floor((k * na) / n);
    const ib = nb === n ? k : Math.floor((k * nb) / n);
    const ta = a.slots[ia]!;
    let tb = b.slots[ib]!;
    if (ta < 0 || tb < 0) continue;
    if (semitones) tb = transposeToken(tb, semitones);
    const wk = Math.min(a.weights[ia]!, b.weights[ib]!);
    s += wk * tokenSim(ta, tb);
    w += wk;
  }
  return w > 0 ? s / w : NaN;
}

/**
 * `barSim`, also trying the second bar one beat early or late (a grid that
 * lost a beat puts every later chord one beat off): the best of the three,
 * the shifted readings a little less trusted. Same-length bars only.
 */
export function barSimShift(a: BarTokens, b: BarTokens, semitones = 0): number {
  // a bar of one chord reads the same one beat off: one comparison
  const ua = single(a);
  const ub = single(b);
  if (ua !== MIXED && ub !== MIXED) {
    if (ua < 0 || ub < 0) return NaN;
    return tokenSim(ua, semitones ? transposeToken(ub, semitones) : ub);
  }
  const v0 = barSim(a, b, semitones);
  const n = a.slots.length;
  if (n !== b.slots.length || n < 3) return v0;
  let best = v0;
  for (const d of [-1, 1]) {
    let s = 0;
    let w = 0;
    for (let k = 0; k < n; k++) {
      const kb = k + d;
      if (kb < 0 || kb >= n) continue;
      const ta = a.slots[k]!;
      let tb = b.slots[kb]!;
      if (ta < 0 || tb < 0) continue;
      if (semitones) tb = transposeToken(tb, semitones);
      const wk = Math.min(a.weights[k]!, b.weights[kb]!);
      s += wk * tokenSim(ta, tb);
      w += wk;
    }
    if (w > 0) {
      const v = (s / w) * SHIFT_TRUST;
      if (Number.isNaN(best) || v > best) best = v;
    }
  }
  return best;
}

const SHIFT_TRUST = 0.92;

const MIXED = -2;
const singles = new WeakMap<BarTokens, number>();

/** The bar's token when the same one sounds on every beat, `MIXED` otherwise. */
function single(b: BarTokens): number {
  let v = singles.get(b);
  if (v === undefined) {
    const s = b.slots;
    v = s[0]!;
    for (let k = 1; k < s.length; k++) if (s[k] !== s[0]) {
      v = MIXED;
      break;
    }
    singles.set(b, v);
  }
  return v;
}

/** The bars' similarity matrix (n × n, row-major; NaN where nothing compares), a beat of shift tolerated. */
export function similarityMatrix(toks: readonly BarTokens[]): Float32Array {
  const n = toks.length;
  const S = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    S[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const v = barSimShift(toks[i]!, toks[j]!);
      S[i * n + j] = v;
      S[j * n + i] = v;
    }
  }
  return S;
}

/** Weighted vote of tokens, for a consensus. */
export class TokenVote {
  private readonly w = new Map<number, number>();
  total = 0;
  add(t: number, weight: number): void {
    if (weight <= 0) return;
    this.w.set(t, (this.w.get(t) ?? 0) + weight);
    this.total += weight;
  }
  /** The winning token (ties: the smallest token, for determinism) and its share; NONE when empty. */
  best(): { token: number; share: number } {
    let token = NONE;
    let bw = -1;
    for (const [t, w] of this.w) {
      if (w > bw + 1e-9 || (Math.abs(w - bw) <= 1e-9 && t < token)) {
        bw = w;
        token = t;
      }
    }
    return { token, share: this.total > 0 ? Math.max(0, bw) / this.total : 0 };
  }
  entries(): [number, number][] {
    return [...this.w.entries()];
  }
}

export function median(v: ArrayLike<number>): number {
  const a = Array.from(v).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
