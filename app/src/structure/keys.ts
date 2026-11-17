// Modulations (C10): the later passages of the piece, each in a key whose
// SIGNATURE differs from the passage before, lasting at least a phrase.
//
// The owner's rule: a modulation is a change of key signature that lasts (at
// least a phrase, about eight bars), not a passing II-V and not the
// back-and-forth between a major key and its relative minor. Better to report
// nothing than to report wrongly.
//
// How:
//   1. Each bar of the chart in force says how well it fits each of the twelve
//      key signatures: the functional fit of its chords (`keyFit`, the chord
//      decoder's own table: I, ii, V7, secondary dominants…) in the major key
//      and in its relative minor, the better of the two (so a signature never
//      tells a major key from its relative minor). Chords are weighted by the
//      beats they last; hand chords count more, doubtful ones less, dominant
//      sevenths less (they are as often secondary as they are a key's own V).
//   2. A segmental Viterbi over the bars chooses one signature per stretch:
//      every stretch lasts at least `minBars`, every change costs `switchCost`,
//      the first stretch is the main key's (`input.key`, anchored).
//   3. A stretch is kept only when it fits its signature clearly better than
//      the signatures on both sides, per bar (`minMargin`) and in all
//      (`minGain`); otherwise it is folded into its neighbours. A key returning
//      to the main signature is the main key again.
//   4. Each change is moved, within two bars, to the phrase line (4 or 8 bars
//      from the start of the piece, or a section of the known chart) when
//      that costs little: changes of key happen on phrase lines.
//   5. The key of each new passage is chosen among the 24 keys whose signature
//      fits it about as well as the best: the one whose tonic chord is heard
//      most (So What's E♭m7 stretch is E♭ minor).
// The known chart of the standard, when one is found and its chords match the
// playing, adds its own local keys (a standard that really modulates is
// written with its bridge in the other key) to the evidence of the bars it
// covers; it never prevents a change it does not write (a last chorus a step
// up is never in the chart).
//
// Decision for modal tunes: So What (D dorian, then E♭ dorian for the eight
// bars of the bridge) changes signature, so it IS a modulation (D minor →
// E♭ minor and back), as the bench's truth writes it.

import { keyFit } from '../analysis/engine/decode';
import { QUALS, type EngineQuality } from '../analysis/engine/chords';
import { pc } from '../harmony/pitch';
import type { AnalysedKey, AnalysedKeyChange } from '../model/analysis';
import type { ChordQuality, ChordSymbol, Key } from '../model/harmony';
import type { HarmonyBar, HarmonyInput, KnownStandard } from './types';

export interface KeyDetectOptions {
  /** Shortest passage, in bars. */
  minBars: number;
  /** Cost of a change of signature, in bars of perfect fit. */
  switchCost: number;
  /** A kept passage fits its signature better than its neighbours' by at least this much per bar (0…1). */
  minMargin: number;
  /** …and by at least this much in all (bars of perfect fit). */
  minGain: number;
  /** Weight of a dominant seventh's fit (secondary dominants are everywhere). */
  dominantWeight: number;
  /** Weight of a hand chord, of a doubtful chord. */
  handWeight: number;
  doubtfulWeight: number;
  /** Bonus per bar for the known chart's local signature. */
  knownBonus: number;
  /** Most a change may lose to land on a phrase line, in bars (a bar's loss relative to its own evidence). */
  snapLoss: number;
  /** Weight of the same place in the other choruses (0: each bar alone). */
  poolWeight: number;
  /** A new passage hears its own tonic chord at least this share of the time (a modulation establishes its tonic). */
  minTonic: number;
}

export const KEY_DETECT_DEFAULTS: KeyDetectOptions = {
  minBars: 8,
  switchCost: 2,
  minMargin: 0.3,
  minGain: 3,
  dominantWeight: 0.5,
  handWeight: 1.5,
  doubtfulWeight: 0.4,
  knownBonus: 0.5,
  snapLoss: 1.05,
  minTonic: 0.04,
  poolWeight: 0.5,
};

/** Signature of a key: the tonic of its major key (A minor → 0, like C major). */
export const signatureOf = (k: Key): number => (k.mode === 'major' ? pc(k.tonic) : pc(k.tonic + 3));

const ENGINE_QUALITY: Record<ChordQuality, EngineQuality> = {
  maj: 'maj', min: 'min', aug: 'aug', dim: 'dim', sus2: 'sus2', sus4: 'sus4', '7': '7', maj7: 'maj7', min7: 'min7',
  minmaj7: 'minmaj7', maj6: 'maj6', min6: 'min6', dim7: 'dim7', hdim7: 'hdim7', '7sus4': '7', aug7: '7',
};

/** The decoder's chord index of a chord symbol. */
function engineIndex(c: ChordSymbol): number {
  return pc(c.root) * 14 + QUALS.indexOf(ENGINE_QUALITY[c.quality]);
}

/** Functional fit (0…1) of a chord in a key. */
export function chordKeyFit(c: ChordSymbol, k: Key): number {
  return keyFit(engineIndex(c), pc(k.tonic), k.mode === 'minor');
}

/** `maj` is the plain triad (a V or a V/vi as much as a I), `maj7` the major seventh or sixth (a I or a IV). */
type Family = 'maj' | 'maj7' | 'min' | 'dom' | 'hdim' | 'dim' | 'other';

function familyOf(q: EngineQuality | ChordQuality): Family {
  switch (q) {
    case 'maj': case 'sus2': return 'maj';
    case 'maj7': case 'maj6': return 'maj7';
    case 'min': case 'min7': case 'min6': case 'minmaj7': return 'min';
    case '7': case 'sus4': case '7sus4': case 'aug7': return 'dom';
    case 'hdim7': return 'hdim';
    case 'dim': case 'dim7': return 'dim';
    default: return 'other';
  }
}

/**
 * Fit (0…1) of a chord in a key SIGNATURE (major key on `sig` and its
 * relative minor), for telling signatures apart rather than for decoding: the
 * diatonic chords first, a key's own tonic and subdominant above its
 * dominant triad (an F triad is I in F and V in B♭: it must lean to F), the
 * usual borrowed and secondary chords low, the relative minor's harmonic
 * dominant (E7 in A minor) as its own.
 */
function signatureFitOf(root: number, fam: Family, sig: number): number {
  const d = pc(root - sig);
  const major = fam === 'maj' || fam === 'maj7';
  switch (d) {
    case 0: return major ? 1 : fam === 'dom' ? 0.5 : 0;
    case 2: return fam === 'min' ? 1 : fam === 'dom' ? 0.4 : 0;
    case 4: return fam === 'min' ? 0.9 : fam === 'dom' || fam === 'maj' ? 0.6 : 0; // iii; V/vi (E7, E in A minor)
    case 5: return major ? 1 : fam === 'min' || fam === 'dom' ? 0.5 : 0;
    case 7: return fam === 'dom' ? 0.8 : fam === 'maj' ? 0.75 : fam === 'min' ? 0.3 : fam === 'maj7' ? 0.2 : 0;
    case 9: return fam === 'min' ? 1 : fam === 'dom' ? 0.4 : 0;
    case 11: return fam === 'hdim' ? 1 : fam === 'dim' ? 0.5 : fam === 'dom' ? 0.3 : 0; // vii, ii of the relative minor
    case 10: return fam === 'dom' ? 0.4 : major ? 0.3 : 0;
    case 8: return fam === 'dim' ? 0.5 : fam === 'dom' || fam === 'maj7' ? 0.3 : 0; // vii°7 of the relative minor; bVI
    case 1: return fam === 'dom' ? 0.3 : fam === 'dim' ? 0.3 : 0;
    case 6: return fam === 'hdim' ? 0.4 : 0;
    case 3: return fam === 'dim' ? 0.3 : 0;
    default: return 0;
  }
}

/** Fit table by chord index (12 roots × 14 qualities), per signature. */
const SIG_FIT: Float64Array[] = (() => {
  const out: Float64Array[] = [];
  for (let c = 0; c < 168; c++) {
    const row = new Float64Array(12);
    const root = Math.floor(c / 14);
    const fam = familyOf(QUALS[c % 14]!);
    for (let s = 0; s < 12; s++) row[s] = signatureFitOf(root, fam, s);
    out.push(row);
  }
  return out;
})();

function signatureFit(c: number, sig: number): number {
  return SIG_FIT[c]![sig]!;
}

const isDominant = (q: ChordQuality) => q === '7' || q === 'aug7' || q === '7sus4';

/** A chord heard in a bar, with its weight in the key evidence. */
export interface Heard {
  chord: ChordSymbol;
  index: number;
  weight: number;
}

/** The chords sounding in each bar, weighted by the beats they last. */
function heardChords(bars: readonly HarmonyBar[], o: KeyDetectOptions): Heard[][] {
  const out: Heard[][] = bars.map(() => []);
  // Every chord event in order, to know where each dominant goes.
  const events: { bar: number; chord: ChordSymbol; dur: number; byHand: boolean; doubtful: boolean }[] = [];
  bars.forEach((b, bi) => {
    const beats = Math.max(1, b.beats);
    const list = b.chords.length && b.chords[0]!.beat === 0 ? b.chords : [{ beat: 0, chord: b.carried, doubtful: false, byHand: false }, ...b.chords];
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (!c.chord) continue;
      const end = i + 1 < list.length ? list[i + 1]!.beat : beats;
      const dur = Math.max(0, Math.min(beats, end) - Math.max(0, c.beat)) / beats;
      if (dur > 0) events.push({ bar: bi, chord: c.chord, dur, byHand: c.byHand, doubtful: c.doubtful });
    }
  });
  for (let k = 0; k < events.length; k++) {
    const ev = events[k]!;
    let w = ev.dur;
    if (ev.byHand) w *= o.handWeight;
    else if (ev.doubtful) w *= o.doubtfulWeight;
    if (isDominant(ev.chord.quality)) {
      // A dominant that resolves down a fifth (or by the tritone substitute, down a half step) is a cadence:
      // it says where the music goes. Otherwise it is as often a passing colour.
      let next = events[k + 1];
      if (next && pc(next.chord.root) === pc(ev.chord.root)) next = events[k + 2];
      const d = next ? pc(next.chord.root - ev.chord.root) : -1;
      const resolves = !!next && (d === 5 || d === 11) && !isDominant(next.chord.quality);
      if (!resolves) w *= o.dominantWeight;
    }
    out[ev.bar]!.push({ chord: ev.chord, index: engineIndex(ev.chord), weight: w });
  }
  return out;
}

/** Per bar, per signature: Σ weight × fit. */
function evidence(heard: readonly Heard[][]): Float64Array[] {
  return heard.map((list) => {
    const e = new Float64Array(12);
    for (const h of list) for (let s = 0; s < 12; s++) e[s]! += h.weight * signatureFit(h.index, s);
    return e;
  });
}

// ---------------------------------------------------------------- known chart

const CHORD_FAMILY = (c: ChordSymbol): number => {
  const q = c.quality;
  if (q === 'min' || q === 'min7' || q === 'min6' || q === 'minmaj7') return 1;
  if (isDominant(q)) return 2;
  if (q === 'hdim7' || q === 'dim' || q === 'dim7') return 3;
  return 0;
};

/** The chart's chord at the start of each written bar (carried when none starts there), transposed. */
function knownBarChords(k: KnownStandard, shift: number): (ChordSymbol | null)[][] {
  const out: (ChordSymbol | null)[][] = [];
  let going: ChordSymbol | null = null;
  for (const b of k.chart.bars) {
    const list: (ChordSymbol | null)[] = [];
    if (!b.chords.length || b.chords[0]!.beat > 0) list.push(going);
    for (const c of b.chords) {
      const t = c.chord ? { ...c.chord, root: pc(c.chord.root + shift), bass: c.chord.bass === null ? null : pc(c.chord.bass + shift) } : null;
      list.push(t);
      going = t;
    }
    out.push(list);
  }
  return out;
}

function chordsMatch(a: readonly Heard[], b: readonly (ChordSymbol | null)[]): number {
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const h of a) if (b.some((c) => c && pc(c.root) === pc(h.chord.root) && CHORD_FAMILY(c) === CHORD_FAMILY(h.chord))) hit++;
  return hit / Math.max(a.length, b.filter(Boolean).length);
}

/** The known chart laid over the playing: for each played bar, the chart bar it plays (null: none). */
interface KnownAlignment {
  standard: KnownStandard;
  /** The chart's chords, transposed to the key in force. */
  chart: (ChordSymbol | null)[][];
  /** Per played bar: the index of the chart bar played there, or null. */
  at: (number | null)[];
}

/**
 * Lays the known chart (one chorus) over the playing: the offset (mod the
 * chorus) where its chords match best, then bar by bar the offset within two
 * bars that matches the chords around the bar best (a missed bar line shifts
 * the rest), kept only where the chart is really being played as written (a
 * chorus played in another key matches nowhere).
 */
function alignKnown(input: HarmonyInput, heard: readonly Heard[][]): KnownAlignment | null {
  const k = input.known[0];
  if (!k || k.titleScore < 0.6 || !k.chart.key || !input.key || k.chart.bars.length < 8) return null;
  const shift = pc(signatureOf(input.key) - signatureOf(k.chart.key));
  const chart = knownBarChords(k, shift);
  const len = chart.length;
  const n = heard.length;
  if (n < len / 2) return null;
  const mod = (x: number) => ((x % len) + len) % len;
  let best = -1;
  let bestScore = 0;
  for (let off = 0; off < len; off++) {
    let s = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (!heard[i]!.length) continue;
      s += chordsMatch(heard[i]!, chart[mod(i - off)]!);
      m++;
    }
    const score = m ? s / m : 0;
    if (score > bestScore) {
      bestScore = score;
      best = off;
    }
  }
  if (best < 0 || bestScore < 0.35) return null;
  const near = (i: number, off: number) => {
    let sum = 0;
    let m = 0;
    for (let d = -3; d <= 3; d++) {
      const h = heard[i + d];
      if (!h || !h.length) continue;
      sum += chordsMatch(h, chart[mod(i + d - off)]!);
      m++;
    }
    return m ? sum / m : 0;
  };
  const at = Array.from({ length: n }, (_, i) => {
    let bestOff = best;
    let bestSim = -1;
    for (const d of [0, -1, 1, -2, 2]) {
      const sim = near(i, best + d);
      if (sim > bestSim + 1e-9) {
        bestSim = sim;
        bestOff = best + d;
      }
    }
    return bestSim >= 0.4 ? mod(i - bestOff) : null;
  });
  return { standard: k, chart, at };
}

/**
 * The known chart's local signature, played bar by bar: the chart read for
 * its own key passages (clean chords), laid over the playing where it is
 * played as written. Null where it says nothing, so the chart never argues
 * against a change it cannot know (a last chorus a step up).
 */
function knownSignatures(input: HarmonyInput, align: KnownAlignment | null, o: KeyDetectOptions): (number | null)[] | null {
  if (!align || !input.key) return null;
  const chartBars: HarmonyBar[] = align.chart.map((list, i) => ({
    bar: i,
    start: i,
    end: i + 1,
    beats: 4,
    meter: { numerator: 4, denominator: 4 },
    chords: list.map((c, j) => ({ beat: j === 0 ? 0 : Math.min(3, j * 2), chord: c, doubtful: false, byHand: false })),
    carried: null,
  }));
  const mainSig = signatureOf(input.key);
  const chartHeard = heardChords(chartBars, o);
  const { passages } = signaturePassages(evidence(chartHeard), chartHeard, mainSig, null, null, o);
  const local = new Array<number>(align.chart.length).fill(mainSig);
  for (const p of passages) for (let i = p.from; i < p.to; i++) local[i] = p.sig;
  return align.at.map((j) => (j === null ? null : local[j]!));
}

// ---------------------------------------------------------------- repeats

/** Similarity (0…1) of two bars' chords: same roots and families. */
function barSim(a: readonly Heard[], b: readonly Heard[]): number {
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const h of a) if (b.some((x) => pc(x.chord.root) === pc(h.chord.root) && CHORD_FAMILY(x.chord) === CHORD_FAMILY(h.chord))) hit++;
  return hit / Math.max(a.length, b.length);
}

/** Mean similarity of the windows of ±2 bars around `i` and `j`. */
function windowSim(heard: readonly Heard[][], i: number, j: number): number {
  let s = 0;
  let m = 0;
  for (let d = -2; d <= 2; d++) {
    const a = heard[i + d];
    const b = heard[j + d];
    if (!a || !b) continue;
    s += barSim(a, b);
    m++;
  }
  return m ? s / m : 0;
}

/** The chorus length found by self-similarity (bars), or null when the chart does not repeat clearly. */
export function repeatPeriod(heard: readonly Heard[][]): number | null {
  const n = heard.length;
  let best: number | null = null;
  let bestScore = 0;
  for (let lag = 8; lag <= Math.min(64, Math.floor(n / 2)); lag++) {
    let s = 0;
    let m = 0;
    for (let i = 0; i + lag < n; i++) {
      if (!heard[i]!.length || !heard[i + lag]!.length) continue;
      // A dropped bar line shifts the repeat by one bar: the best of three.
      s += Math.max(barSim(heard[i]!, heard[i + lag]!), 0.9 * barSim(heard[i]!, heard[i + lag - 1]!), 0.9 * barSim(heard[i]!, heard[i + lag + 1] ?? []));
      m++;
    }
    const score = m ? s / m : 0;
    // A multiple of a period repeats as well: a longer one must do clearly better.
    if (score > bestScore + (best !== null && lag % best === 0 ? 0.08 : 0.005)) {
      bestScore = score;
      best = lag;
    }
  }
  return best !== null && bestScore >= 0.45 ? best : null;
}

/**
 * The evidence of each bar pooled with the bars that play the same chords at
 * the same place of the other choruses (a bridge in another key is in every
 * chorus; a misread run is in one). A chorus played in another key (a last
 * chorus a step up) does not match the others and keeps its own evidence.
 */
function pooled(e: readonly Float64Array[], heard: readonly Heard[][], period: number | null, o: KeyDetectOptions): Float64Array[] {
  if (period === null || o.poolWeight <= 0) return e.map((r) => new Float64Array(r));
  const n = e.length;
  return e.map((row, i) => {
    const out = new Float64Array(row);
    let w = 1;
    for (let k = -Math.ceil(n / period); k <= Math.ceil(n / period); k++) {
      if (k === 0) continue;
      let bestJ = -1;
      let bestSim = 0;
      for (const d of [0, -1, 1]) {
        const j = i + k * period + d;
        if (j < 0 || j >= n) continue;
        const sim = windowSim(heard, i, j);
        if (sim > bestSim) {
          bestSim = sim;
          bestJ = j;
        }
      }
      if (bestJ < 0 || bestSim < 0.5) continue;
      const wj = o.poolWeight * bestSim;
      for (let s = 0; s < 12; s++) out[s]! += wj * e[bestJ]![s]!;
      w += wj;
    }
    for (let s = 0; s < 12; s++) out[s]! /= w;
    return out;
  });
}

// ---------------------------------------------------------------- the passages

interface SigPassage {
  /** Bar indices [from, to). */
  from: number;
  to: number;
  sig: number;
}

/**
 * Segmental Viterbi: one signature per stretch of at least `minBars` bars,
 * `switchCost` per change, the first stretch in `anchor`.
 */
function viterbi(e: readonly Float64Array[], anchor: number, o: KeyDetectOptions): SigPassage[] {
  const n = e.length;
  const L = o.minBars;
  if (n < 2 * L) return [{ from: 0, to: n, sig: anchor }];
  // Prefix sums per signature.
  const P: Float64Array[] = [new Float64Array(12)];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(12);
    for (let s = 0; s < 12; s++) row[s] = P[i]![s]! + e[i]![s]!;
    P.push(row);
  }
  const NEG = -Infinity;
  // F[j][s]: best score of bars [0, j) whose last stretch is in s and lasts at least L (or is the first one).
  const F: Float64Array[] = [];
  const back: Int32Array[] = []; // where the last stretch started (-1: continued from j-1)
  const from: Int8Array[] = []; // signature before it
  for (let j = 0; j <= n; j++) {
    F.push(new Float64Array(12).fill(NEG));
    back.push(new Int32Array(12).fill(-2));
    from.push(new Int8Array(12).fill(-1));
  }
  for (let j = L; j <= n; j++) F[j]![anchor] = P[j]![anchor]!;
  for (let j = L; j <= n; j++) back[j]![anchor] = 0;
  for (let j = 2 * L; j <= n; j++) {
    for (let s = 0; s < 12; s++) {
      // continue the stretch in s
      let bestV = F[j - 1]![s]! + e[j - 1]![s]!;
      let bestBack = -1;
      let bestFrom = -1;
      // or start a new stretch in s at j - L
      const i = j - L;
      const gain = P[j]![s]! - P[i]![s]!;
      for (let t = 0; t < 12; t++) {
        if (t === s || F[i]![t] === NEG) continue;
        const v = F[i]![t]! + gain - o.switchCost;
        if (v > bestV) {
          bestV = v;
          bestBack = i;
          bestFrom = t;
        }
      }
      if (bestV > F[j]![s]!) {
        F[j]![s] = bestV;
        back[j]![s] = bestBack;
        from[j]![s] = bestFrom;
      }
    }
  }
  // Trace back.
  let s = 0;
  for (let t = 1; t < 12; t++) if (F[n]![t]! > F[n]![s]!) s = t;
  const out: SigPassage[] = [];
  let j = n;
  let end = n;
  while (j > 0) {
    const b = back[j]![s]!;
    if (b === -1) {
      j--;
      continue;
    }
    if (b === 0 || b === -2) {
      out.push({ from: 0, to: end, sig: s });
      break;
    }
    out.push({ from: b, to: end, sig: s });
    const t = from[j]![s]!;
    end = b;
    j = b;
    s = t;
  }
  return out.reverse();
}

/** Merges neighbours in the same signature. */
function merged(list: SigPassage[]): SigPassage[] {
  const out: SigPassage[] = [];
  for (const p of list) {
    const last = out[out.length - 1];
    if (last && last.sig === p.sig) last.to = p.to;
    else out.push({ ...p });
  }
  return out;
}

function sumOver(e: readonly Float64Array[], from: number, to: number, sig: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += e[i]![sig]!;
  return s;
}

function weightOver(e: readonly Float64Array[], from: number, to: number): number {
  let w = 0;
  for (let i = from; i < to; i++) {
    let m = 0;
    for (let s = 0; s < 12; s++) m = Math.max(m, e[i]![s]!);
    w += m > 0 ? 1 : 0;
  }
  return w;
}

/** Folds the passages that do not stand out clearly from their neighbours (see step 3). */
function pruned(list: SigPassage[], e: readonly Float64Array[], raw: readonly Float64Array[], heard: readonly Heard[][], mainKey: Key | null, o: KeyDetectOptions): SigPassage[] {
  let cur = merged(list);
  // The main signature needs no proof: a passage back home is never folded into the excursion before it.
  const home = cur[0]?.sig ?? -1;
  for (;;) {
    let worst = -1;
    let worstScore = Infinity;
    let prevKey = mainKey;
    for (let k = 1; k < cur.length; k++) {
      const p = cur[k]!;
      const top = rankKeys(heard, raw, p)[0];
      if (p.sig === home) {
        prevKey = mainKey ?? top?.key ?? null;
        continue;
      }
      // To the parallel key (F major → F minor): a misread major/minor run looks just like it; ask twice as much.
      const parallel = !!top && !!prevKey && pc(top.key.tonic) === pc(prevKey.tonic) && top.key.mode !== prevKey.mode;
      const strict = parallel ? 2 : 1;
      prevKey = top?.key ?? null;
      const own = sumOver(e, p.from, p.to, p.sig);
      const heardBars = Math.max(1, weightOver(e, p.from, p.to));
      const neighbours = [cur[k - 1]!.sig, ...(k + 1 < cur.length ? [cur[k + 1]!.sig] : [])];
      let gain = Infinity;
      for (const nsig of neighbours) gain = Math.min(gain, own - sumOver(e, p.from, p.to, nsig));
      const ok =
        p.to - p.from >= strict * o.minBars &&
        gain >= strict * o.minGain &&
        gain / heardBars >= o.minMargin &&
        heardBars >= o.minBars / 2 &&
        (top?.tonic ?? 0) >= o.minTonic;
      if (!ok && gain < worstScore) {
        worstScore = gain;
        worst = k;
      }
    }
    if (worst < 0) return cur;
    // Fold into the neighbour it resembles most (the one before when they tie).
    const p = cur[worst]!;
    const prev = cur[worst - 1]!;
    const next = cur[worst + 1];
    const toPrev = sumOver(e, p.from, p.to, prev.sig);
    const toNext = next ? sumOver(e, p.from, p.to, next.sig) : -Infinity;
    if (toNext > toPrev) next!.from = p.from;
    else prev.to = p.to;
    cur.splice(worst, 1);
    cur = merged(cur);
  }
}

/** The passages of the piece as signatures (anchored on `mainSig`), pruned. */
function signaturePassages(e0: readonly Float64Array[], heard: readonly Heard[][], mainSig: number, mainKey: Key | null, known: (number | null)[] | null, o: KeyDetectOptions): { passages: SigPassage[]; e: Float64Array[] } {
  // Ties (a stretch of D minor sevenths is ii in C as much as vi in F) go to the main signature.
  const e = e0.map((row, i) => {
    const r = new Float64Array(row);
    if (r[mainSig]! > 0) r[mainSig]! += ANCHOR_BIAS;
    const s = known?.[i];
    if (s !== null && s !== undefined) r[s]! += o.knownBonus;
    return r;
  });
  return { passages: pruned(viterbi(e, mainSig, o), e, e0, heard, mainKey, o), e };
}

/** Per bar, in favour of the main signature: breaks exact ties only. */
const ANCHOR_BIAS = 0.02;

// ---------------------------------------------------------------- phrase lines

/** How much a bar line looks like a phrase line (0…1): 8-bar lines first, 4-bar lines, the known chart's sections. */
function phraseScore(numbers: readonly number[], i: number, sections: ReadonlySet<number>): number {
  if (sections.has(i)) return 1;
  const n = numbers[i]!;
  if (n % 8 === 0) return 0.8;
  if (n % 4 === 0) return 0.5;
  return 0;
}

/** Bars where a section of the known chart starts, on the playing (from its alignment). */
function knownSectionLines(align: KnownAlignment | null): Set<number> {
  const out = new Set<number>();
  if (!align) return out;
  align.at.forEach((j, i) => {
    if (j !== null && align.standard.chart.bars[j]!.section && (i === 0 || align.at[i - 1] !== j)) out.add(i);
  });
  return out;
}

/**
 * A phrase number for each bar: the chart's bar number in the first chorus,
 * then, where a later bar plays the same chords as the bar a chorus earlier
 * (a missed bar line shifts one or the other), that bar's number plus the
 * chorus length; otherwise the bar before plus one. 4- and 8-bar phrase lines
 * are counted on these numbers, so they survive a missed bar line.
 */
function phraseNumbers(bars: readonly HarmonyBar[], heard: readonly Heard[][], period: number | null): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    let num = i === 0 ? bars[0]!.bar : out[i - 1]! + 1;
    if (period !== null && period % 4 === 0 && i >= period) {
      let bestJ = -1;
      let bestSim = 0.5;
      for (const d of [0, -1, 1]) {
        const j = i - period + d;
        if (j < 0) continue;
        const sim = windowSim(heard, i, j);
        if (sim > bestSim + 1e-9) {
          bestSim = sim;
          bestJ = j;
        }
      }
      if (bestJ >= 0) num = out[bestJ]! + period;
    }
    out.push(num);
  }
  return out;
}

/** Σ over bars [from, to) of what giving them to `to_` instead of `from_` loses, each relative to the bar's best signature. */
function relativeLoss(e: readonly Float64Array[], from: number, to: number, keep: number, give: number): number {
  let loss = 0;
  for (let i = from; i < to; i++) {
    let m = 0;
    for (let s = 0; s < 12; s++) m = Math.max(m, e[i]![s]!);
    if (m > 0) loss += (e[i]![keep]! - e[i]![give]!) / m;
  }
  return loss;
}

/** Moves each change, within two bars, to the best phrase line it can reach for little loss. */
function snapped(list: SigPassage[], e: readonly Float64Array[], numbers: readonly number[], sections: ReadonlySet<number>, o: KeyDetectOptions): SigPassage[] {
  const out = list.map((p) => ({ ...p }));
  for (let k = 1; k < out.length; k++) {
    const prev = out[k - 1]!;
    const p = out[k]!;
    const at = p.from;
    let best = at;
    let bestValue = phraseScore(numbers, at, sections);
    for (let d = -2; d <= 2; d++) {
      const x = at + d;
      if (d === 0 || x <= prev.from + 1 || x >= p.to - 1) continue;
      // Score lost by moving the line from `at` to `x`, in bars (each bar's loss relative to its own evidence).
      const loss = x < at ? relativeLoss(e, x, at, prev.sig, p.sig) : relativeLoss(e, at, x, p.sig, prev.sig);
      if (loss > o.snapLoss) continue;
      const value = phraseScore(numbers, x, sections) - Math.max(0, loss) / 4;
      if (value > bestValue + 1e-9) {
        bestValue = value;
        best = x;
      }
    }
    prev.to = best;
    p.from = best;
  }
  return out;
}

// ---------------------------------------------------------------- keys of the passages

const ALL_KEYS: Key[] = [];
for (const mode of ['major', 'minor'] as const) for (let t = 0; t < 12; t++) ALL_KEYS.push({ tonic: t, mode });

/** Weight of the tonic chord of `k` among the heard chords (0…1). */
function tonicShare(heard: readonly Heard[][], from: number, to: number, k: Key): number {
  let w = 0;
  let all = 0;
  for (let i = from; i < to; i++) {
    for (const h of heard[i]!) {
      all += h.weight;
      if (pc(h.chord.root) !== pc(k.tonic)) continue;
      const fam = CHORD_FAMILY(h.chord);
      if ((k.mode === 'major' && fam === 0) || (k.mode === 'minor' && fam === 1)) w += h.weight;
      // A tonic read as a dominant seventh (a frequent confusion of the analysis, and the blues' I7) half counts.
      else if (k.mode === 'major' && fam === 2) w += h.weight / 2;
    }
  }
  return all > 0 ? w / all : 0;
}

/** Mean functional fit of the heard chords in `k` (0…1). */
function keyMeanFit(heard: readonly Heard[][], from: number, to: number, k: Key): number {
  let f = 0;
  let all = 0;
  for (let i = from; i < to; i++) {
    for (const h of heard[i]!) {
      all += h.weight;
      f += h.weight * keyFit(h.index, pc(k.tonic), k.mode === 'minor');
    }
  }
  return all > 0 ? f / all : 0;
}

function plainKey(k: Key): Key {
  return { tonic: pc(k.tonic), mode: k.mode };
}

const relative = (k: Key): Key => (k.mode === 'major' ? { tonic: pc(k.tonic + 9), mode: 'minor' } : { tonic: pc(k.tonic + 3), mode: 'major' });
const same = (a: Key, b: Key) => pc(a.tonic) === pc(b.tonic) && a.mode === b.mode;

interface RankedKey {
  key: Key;
  score: number;
  /** Share of the passage's chord weight on this key's tonic chord. */
  tonic: number;
}

/**
 * The keys a passage may be in, best first: those whose signature fits it
 * about as well as the best one (a tie between neighbouring signatures, as
 * for a stretch of minor sevenths, is decided by the tonic), ranked by mean
 * functional fit plus the weight of their tonic chord.
 */
function rankKeys(heard: readonly Heard[][], e: readonly Float64Array[], p: SigPassage): RankedKey[] {
  const sigScore = (s: number) => sumOver(e, p.from, p.to, s);
  const best = sigScore(p.sig);
  const tolerance = 0.05 * Math.max(1, weightOver(e, p.from, p.to));
  const out: RankedKey[] = [];
  for (const k of ALL_KEYS) {
    if (sigScore(signatureOf(k)) < best - tolerance) continue;
    const tonic = tonicShare(heard, p.from, p.to, k);
    out.push({ key: k, score: keyMeanFit(heard, p.from, p.to, k) + 0.8 * tonic, tonic });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The key of a passage, with its confidence and alternatives (relative key first). */
function passageKey(heard: readonly Heard[][], e: readonly Float64Array[], p: SigPassage, prevSig: number, nextSig: number | null): AnalysedKey | null {
  const sigScore = (s: number) => sumOver(e, p.from, p.to, s);
  const best = sigScore(p.sig);
  const scored = rankKeys(heard, e, p);
  const top = scored[0];
  if (!top || signatureOf(top.key) === prevSig) return null;
  // Confidence: how much the passage's signature stands out from its neighbours, per heard bar.
  const heardBars = Math.max(1, weightOver(e, p.from, p.to));
  let gain = best - sigScore(prevSig);
  if (nextSig !== null) gain = Math.min(gain, best - sigScore(nextSig));
  const margin = gain / heardBars;
  const confidence = Math.max(0.05, Math.min(0.95, 1 - Math.exp(-(margin * Math.sqrt(heardBars)) / 1.2)));
  const rel = relative(top.key);
  const alternatives: AnalysedKey['alternatives'] = [{ ...rel, confidence: confidence * 0.5 }];
  for (const s of scored.slice(1)) {
    if (alternatives.length >= 3) break;
    if (same(s.key, rel)) continue;
    alternatives.push({ ...plainKey(s.key), confidence: Math.max(0.01, confidence * 0.5 * (s.score / Math.max(1e-9, top.score))) });
  }
  return { ...plainKey(top.key), confidence, alternatives };
}

// ---------------------------------------------------------------- entry point

/** For tuning on the bench (not used by the app): the evidence, the alignment of the known chart, the passages before and after pruning. */
export function __debug(input: HarmonyInput, o: KeyDetectOptions) {
  const heard = heardChords(input.bars, o);
  const e = evidence(heard);
  const mainSig = input.key ? signatureOf(input.key) : 0;
  const known = knownSignatures(input, alignKnown(input, heard), o);
  const rank = (from: number, to: number, sig: number) => rankKeys(heard, e, { from, to, sig }).slice(0, 4);
  return { e, rank, known, raw: viterbi(e, mainSig, o), pruned: signaturePassages(e, heard, mainSig, input.key, known, o).passages };
}

/** The modulations of the piece: lasting changes of key signature, never a passing II-V nor the relative key. */
export function detectKeyChanges(input: HarmonyInput, options: Partial<KeyDetectOptions> = {}): AnalysedKeyChange[] {
  const o: KeyDetectOptions = { ...KEY_DETECT_DEFAULTS, ...options };
  const bars = input.bars;
  if (bars.length < 2 * o.minBars) return [];
  const heard = heardChords(bars, o);
  const raw = evidence(heard);
  // The main key anchors the first passage; without one, the likeliest signature of the first phrases.
  let mainSig: number;
  if (input.key) mainSig = signatureOf(input.key);
  else {
    mainSig = 0;
    const span = Math.min(bars.length, 4 * o.minBars);
    for (let s = 1; s < 12; s++) if (sumOver(raw, 0, span, s) > sumOver(raw, 0, span, mainSig)) mainSig = s;
  }
  const align = alignKnown(input, heard);
  const known = knownSignatures(input, align, o);
  const period = repeatPeriod(heard);
  const e = pooled(raw, heard, period, o);
  let passages = signaturePassages(e, heard, mainSig, input.key, known, o).passages;
  if (passages.length < 2) return [];
  passages = snapped(passages, e, phraseNumbers(bars, heard, period), knownSectionLines(align), o);
  const out: AnalysedKeyChange[] = [];
  let prevSig = mainSig;
  for (let k = 1; k < passages.length; k++) {
    const p = passages[k]!;
    if (p.from <= 0 || p.from >= bars.length) continue;
    const nextSig = k + 1 < passages.length ? passages[k + 1]!.sig : null;
    let key: AnalysedKey | null;
    if (p.sig === mainSig && input.key) {
      // Back in the main signature: the main key again.
      key = prevSig === mainSig ? null : { ...plainKey(input.key), confidence: 0.9, alternatives: [{ ...relative(input.key), confidence: 0.3 }] };
    } else key = passageKey(heard, e, p, prevSig, nextSig);
    if (!key) continue;
    const before = out[out.length - 1];
    if (before && same(before.key, key)) continue;
    // Strictly after 0 and after the change before (a pick-up bar may start before the audio).
    const time = bars[p.from]!.start;
    if (!(time > 0) || (before && time <= before.time)) continue;
    out.push({ time, key });
    prevSig = signatureOf(key);
  }
  return out;
}
