// « Grille complète simplifiée » (v1/CAHIER.md, C14): the whole chart in a
// concise form, each section written once, with the consensus chord of its
// repeats, families only, « % » for a repeated bar, `[ … ]x2` for a section
// played twice in a row, and for every played bar its place in what is
// written (the screen follows the playing and shows the repeat number; a
// click on a written bar goes to its next occurrence).
//
// It reads the structure IN FORCE (the user's letters and parts included),
// so it works with whatever the user wrote: sections of unequal length under
// one letter, parts cutting a section, no parts at all. It never throws; what
// it cannot fold it writes in full.
//
//  1. Occurrences: a letter runs from its mark to the next mark, or to the
//     start of an intro or an outro part (letters stop there). Bars under no
//     letter make « Intro », « Outro » or « Spécial » blocks of their own.
//  2. Groups: the occurrences of one letter in one key (the modulation in
//     force at their first bar); two groups of a letter whose chords are the
//     same are one (a « return » to the main key written as a modulation).
//  3. The chorus: the shortest period of the sequence of letters (12 bars or
//     more), when there is one. It gives each occurrence its rank in its
//     chorus (first A, second A…) and bounds the `[ … ]xN` repeats.
//  4. Variants (first and second endings): when the occurrences of one rank
//     agree with each other but end differently from those of another rank
//     (rhythm changes: A1 ends on a turnaround, A2 on the tonic), the letter
//     is written twice (`A`, then `A2`, `variant: 2`).
//  5. Consensus per beat over the occurrences (a chord by hand weighs four
//     times, a doubtful one half), at family level: G7, G13, G7♯5 and the
//     tritone substitute D♭7 all vote for the dominant, whose root is the one
//     most repeats (or the known chart) give; extensions and alterations are
//     dropped; families are written maj7, m7, 7, m7♭5, dim7 (triads stay
//     triads), and the minor tonic as a plain minor chord (« Bm »).
//  6. A tag (the last bars of the form repeated after the last chorus) is
//     written once with its number of repeats; an intro is written in full.
//
// Pure, deterministic, fast (linear in the bars).

import type { ChordQuality, ChordSymbol, Key } from '../model/harmony';
import type { PartType } from '../model/structure';
import { sameMeter } from '../grid/tempoMap';
import { DIM, DOM, familyOf, FAMILY_OF, HDIM, MAJ, MIN, NONE, rootOf, SUS, AUG, tokenOf, makeToken } from './grid';
import { knownBody } from './form';
import type { FormEntry, HarmonyBar, SimplifiedChart, SimplifyInput, WrittenBar, WrittenChord, WrittenPlace, WrittenSection } from './types';

/** One played stretch under one written heading. */
interface Occurrence {
  /** Bar indices [first, end). */
  first: number;
  end: number;
  /** Letter, or a part type for what is outside the letters. */
  label: { letter: string } | { part: PartType };
  /** Index of the key in force at its first bar (−1: the main key). */
  key: number;
  /** Rank in its chorus among the occurrences of the same letter (0-based), −1 when unknown. */
  rank: number;
  chorus: number;
}

/** A written section being built. */
interface Group {
  id: string;
  label: { letter: string } | { part: PartType };
  key: number;
  variant: number;
  occ: Occurrence[];
  /** Written length in bars. */
  length: number;
  /** For each occurrence, the written position of each of its bars (−1: not written). */
  map: Int16Array[];
  /** A tag: the written bars are the first `length` bars, played `times` times. */
  tag: number;
}

const isLetter = (l: Occurrence['label']): l is { letter: string } => 'letter' in l;

/** A bar played in a theme votes this much more than a bar of a solo. */
const THEME_WEIGHT = 1.5;
const labelKey = (l: Occurrence['label']) => (isLetter(l) ? `L:${l.letter}` : `P:${l.part}`);

// ---------------------------------------------------------------- beats

/** The chord sounding on each beat of a bar (with how much it is trusted). */
function beatChords(b: HarmonyBar): { chord: ChordSymbol | null; w: number }[] {
  const n = Math.max(1, Math.round(b.beats) || 1);
  const out: { chord: ChordSymbol | null; w: number }[] = [];
  let cur = b.carried;
  let w = 1;
  let ci = 0;
  const chords = [...b.chords].sort((x, y) => x.beat - y.beat);
  for (let k = 0; k < n; k++) {
    while (ci < chords.length && chords[ci]!.beat <= k + 1e-6) {
      const c = chords[ci++]!;
      cur = c.chord;
      w = c.byHand ? 4 : c.doubtful ? 0.5 : 1;
    }
    out.push({ chord: cur, w });
  }
  return out;
}

/** Family tokens of a bar, per beat (for comparing occurrences). */
function barTok(b: HarmonyBar): number[] {
  return beatChords(b).map((x) => tokenOf(x.chord));
}

/** Share of beats with the same family token (tritone substitutes of a dominant count as the same). */
function agreement(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  if (!n) return 1;
  let s = 0;
  let c = 0;
  for (let k = 0; k < n; k++) {
    const x = a[Math.floor((k * a.length) / n)]!;
    const y = b[Math.floor((k * b.length) / n)]!;
    if (x < 0 && y < 0) continue;
    c++;
    if (x === y || (x >= 0 && y >= 0 && familyOf(x) === DOM && familyOf(y) === DOM && (rootOf(x) - rootOf(y) + 12) % 12 === 6)) s++;
  }
  return c ? s / c : 1;
}

// ---------------------------------------------------------------- consensus

interface Vote {
  root: number;
  family: number;
  weight: number;
  /** Weights of the qualities voted (for the written quality). */
  qualities: Map<ChordQuality, number>;
}

/**
 * The consensus chord of one beat (null for N.C. or nothing), and the root of
 * the tritone partner of a dominant when some repeat (or the known chart)
 * plays it (`alt`, for `resolveTritones`). On a tie, the chord that goes on
 * from the beat before wins.
 */
function consensusChord(
  entries: readonly { chord: ChordSymbol | null; w: number }[],
  known: ChordSymbol | null,
  tonicMinor: number | null,
  previous: ChordSymbol | null,
): { chord: ChordSymbol | null; alt: number | null } {
  const votes = new Map<number, Vote>();
  let none = 0;
  for (const { chord, w } of entries) {
    if (!chord) {
      none += w * 0.3;
      continue;
    }
    const fam = FAMILY_OF[chord.quality];
    const key = makeToken(chord.root, fam);
    let v = votes.get(key);
    if (!v) {
      v = { root: chord.root, family: fam, weight: 0, qualities: new Map() };
      votes.set(key, v);
    }
    v.weight += w;
    v.qualities.set(chord.quality, (v.qualities.get(chord.quality) ?? 0) + w);
  }
  if (!votes.size) return { chord: null, alt: null };
  // a dominant and its tritone substitute vote together; the written root is the more repeated one (the known chart breaks a tie)
  const merged = new Map<number, { members: Vote[]; weight: number }>();
  for (const v of votes.values()) {
    const fkey = v.family === DOM ? makeToken(Math.min(v.root, (v.root + 6) % 12), DOM) + 1000 : makeToken(v.root, v.family);
    const m = merged.get(fkey) ?? { members: [], weight: 0 };
    m.members.push(v);
    m.weight += v.weight;
    merged.set(fkey, m);
  }
  // the known chart is one more voice, half a repeat, when it has a chord there
  const knownTok = known ? makeToken(known.root, FAMILY_OF[known.quality]) : NONE;
  const prevTok = previous ? makeToken(previous.root, FAMILY_OF[previous.quality]) : NONE;
  const has = (m: { members: Vote[] }, tok: number) => tok >= 0 && m.members.some((v) => makeToken(v.root, v.family) === tok);
  let best: { members: Vote[]; weight: number } | null = null;
  let bestW = -1;
  for (const m of merged.values()) {
    const w = m.weight + (has(m, knownTok) ? 0.5 : 0) + (has(m, prevTok) ? 0.01 : 0);
    if (w > bestW + 1e-9 || (Math.abs(w - bestW) <= 1e-9 && best && m.members[0]!.root < best.members[0]!.root)) {
      bestW = w;
      best = m;
    }
  }
  if (!best || bestW < none) return { chord: null, alt: null };
  const score = (x: Vote) => x.weight + (makeToken(x.root, x.family) === knownTok ? 0.5 : 0) + (makeToken(x.root, x.family) === prevTok ? 0.01 : 0);
  let v = best.members[0]!;
  for (const x of best.members) if (score(x) > score(v) + 1e-9) v = x;
  const partner = best.members.find((x) => x !== v);
  const alt = v.family === DOM ? (partner ? partner.root : knownTok >= 0 && familyOf(knownTok) === DOM && rootOf(knownTok) === (v.root + 6) % 12 ? rootOf(knownTok) : null) : null;
  return { chord: { root: v.root, quality: writtenQuality(v, tonicMinor), extensions: [], bass: null }, alt };
}

/**
 * A tritone substitute brought back to the dominant (see the header, step 5):
 * a dominant whose partner a tritone away was played by some repeat (or is
 * in the known chart), and whose partner, not itself, resolves down a fifth
 * to the next chord, is written as that partner (D♭7 → C becomes G7 → C).
 */
function resolveTritones(written: readonly WrittenBar[], alts: ReadonlyMap<WrittenChord, number>): void {
  const seq = written.flatMap((b) => b.chords);
  for (let k = 0; k < seq.length; k++) {
    const c = seq[k]!;
    const alt = alts.get(c);
    if (alt === undefined || !c.chord) continue;
    const next = seq[k + 1]?.chord;
    if (!next) continue;
    const fifthBelow = (r: number) => (r + 5) % 12;
    if (fifthBelow(alt) === next.root && fifthBelow(c.chord.root) !== next.root) c.chord = { ...c.chord, root: alt };
  }
}

/** The quality written for a family (see the header, step 5). */
function writtenQuality(v: Vote, tonicMinor: number | null): ChordQuality {
  const w = (q: ChordQuality) => v.qualities.get(q) ?? 0;
  const total = [...v.qualities.values()].reduce((a, b) => a + b, 0);
  switch (v.family) {
    case MAJ:
      return w('maj7') + w('maj6') >= total / 2 ? 'maj7' : 'maj';
    case MIN:
      if (tonicMinor === v.root) return 'min';
      return w('min7') + w('min6') + w('minmaj7') >= total / 2 ? 'min7' : 'min';
    case DOM:
      return '7';
    case HDIM:
      return 'hdim7';
    case DIM:
      return w('dim') > total / 2 ? 'dim' : 'dim7';
    case SUS:
      return w('7sus4') >= total / 2 ? '7sus4' : w('sus2') > total / 2 ? 'sus2' : 'sus4';
    case AUG:
      return 'aug';
    default:
      return '7';
  }
}

const sameWritten = (a: readonly WrittenChord[], b: readonly WrittenChord[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i]!;
    if (x.beat !== y.beat) return false;
    if (!x.chord || !y.chord) return x.chord === y.chord;
    return x.chord.root === y.chord.root && x.chord.quality === y.chord.quality;
  });

// ---------------------------------------------------------------- the chart

/**
 * The minor tonic, written as a plain minor chord (« Bm », as in the cahier's
 * Autumn Leaves): the chord that ends the form, when it is minor and its
 * dominant leads to it somewhere in the chart.
 */
function writeMinorTonic(written: WrittenBar[], endSection: WrittenSection | undefined): void {
  if (!endSection) return;
  let end: ChordSymbol | null = null;
  for (let k = endSection.bars.length - 1; k >= 0 && !end; k--) {
    const b = written[endSection.bars[k]!]!;
    if (!b.simile && b.chords.length) end = b.chords[b.chords.length - 1]!.chord;
  }
  if (!end || FAMILY_OF[end.quality] !== MIN) return;
  const tonic = end.root;
  const seq = written.flatMap((b) => b.chords.map((c) => c.chord));
  let resolved = 0;
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1];
    const c = seq[k];
    if (a && c && a.quality === '7' && c.root === tonic && FAMILY_OF[c.quality] === MIN && (a.root - c.root + 12) % 12 === 7) resolved++;
  }
  if (!resolved) return;
  for (const b of written) for (const c of b.chords) if (c.chord && c.chord.root === tonic && (c.chord.quality === 'min7' || c.chord.quality === 'min')) c.chord = { ...c.chord, quality: 'min' };
}

/** The smallest period (in occurrences) of a sequence of letters, covering 12 bars or more; null when it does not repeat. */
function letterPeriod(occ: readonly Occurrence[]): number | null {
  const seq = occ.map((o) => labelKey(o.label));
  const m = seq.length;
  for (let p = 1; 2 * p <= m; p++) {
    let bars = 0;
    for (let k = 0; k < p; k++) bars += occ[k]!.end - occ[k]!.first;
    if (bars < 12) continue;
    let same = 0;
    for (let k = p; k < m; k++) if (seq[k] === seq[k - p]) same++;
    if (same >= 0.8 * (m - p)) return p;
  }
  return null;
}

/** Written positions of an occurrence of `len` bars in a section written in `length` bars (in proportion, then repeats of it). */
function positions(len: number, length: number): Int16Array {
  const out = new Int16Array(len);
  if (len <= length) {
    for (let k = 0; k < len; k++) out[k] = len === length ? k : Math.min(length - 1, Math.round((k * (length - 1)) / Math.max(1, len - 1)));
    return out;
  }
  // longer: as many full passes as fit, the rest in proportion
  for (let k = 0; k < len; k++) out[k] = k % length;
  return out;
}

/**
 * Written positions of an occurrence whose length differs from the written
 * one (a bar dropped or added by the grid, letters placed by hand): a small
 * time warp against the group's majority chords (−1: a bar not written).
 */
function alignPositions(bars: readonly HarmonyBar[], o: Occurrence, rows: readonly number[][]): Int16Array {
  const len = o.end - o.first;
  const L = rows.length;
  const W = L + 1;
  const D = new Float64Array((len + 1) * W).fill(Infinity);
  const M = new Int8Array((len + 1) * W);
  D[0] = 0;
  const skip = 0.6;
  for (let i = 0; i <= len; i++) {
    for (let j = 0; j <= L; j++) {
      if (!i && !j) continue;
      let best = Infinity;
      let move = 0;
      if (i && j) {
        const v = D[(i - 1) * W + j - 1]! + (1 - agreement(barTok(bars[o.first + i - 1]!), rows[j - 1]!));
        if (v < best) {
          best = v;
          move = 1;
        }
      }
      if (i) {
        const v = D[(i - 1) * W + j]! + skip;
        if (v < best) {
          best = v;
          move = 2;
        }
      }
      if (j) {
        const v = D[i * W + j - 1]! + skip;
        if (v < best) {
          best = v;
          move = 3;
        }
      }
      D[i * W + j] = best;
      M[i * W + j] = move;
    }
  }
  const out = new Int16Array(len).fill(-1);
  let i = len;
  let j = L;
  while (i > 0 || j > 0) {
    const m = M[i * W + j]!;
    if (m === 1) {
      out[i - 1] = j - 1;
      i--;
      j--;
    } else if (m === 2) {
      // an extra bar: written where its neighbour is
      out[i - 1] = Math.max(0, Math.min(L - 1, j - 1));
      i--;
    } else if (m === 3) j--;
    else break;
  }
  return out;
}

/** Splits the written length of a group: the most common length among its occurrences (the first one's on a tie). */
function writtenLength(occ: readonly Occurrence[]): number {
  const n = new Map<number, number>();
  for (const o of occ) n.set(o.end - o.first, (n.get(o.end - o.first) ?? 0) + 1);
  let best = occ[0]!.end - occ[0]!.first;
  let bw = n.get(best)!;
  for (const [len, c] of n) if (c > bw) {
    best = len;
    bw = c;
  }
  return best;
}

/** The written period of a tag (bars after the form repeated), or 0 when it does not repeat. */
function tagPeriod(bars: readonly HarmonyBar[], o: Occurrence): number {
  const len = o.end - o.first;
  for (let p = 2; 2 * p <= len; p++) {
    if (len % p !== 0) continue;
    let s = 0;
    let c = 0;
    for (let i = o.first + p; i < o.end; i++) {
      s += agreement(barTok(bars[i]!), barTok(bars[i - p]!));
      c++;
    }
    if (c && s / c >= 0.75) return p;
  }
  return 0;
}

/** « Grille complète simplifiée »; null when the chart has no form to fold (it is then shown in full). */
export function simplifyChart(input: SimplifyInput): SimplifiedChart | null {
  try {
    return simplify(input);
  } catch {
    return null;
  }
}

function simplify(input: SimplifyInput): SimplifiedChart | null {
  const bars = input.bars;
  const n = bars.length;
  if (!n || !input.sections.length) return null;
  const indexOf = new Map<number, number>();
  bars.forEach((b, i) => indexOf.set(b.bar, i));
  /** Index of the first bar at or after chart bar `bar` (n when after the end). */
  const at = (bar: number): number => {
    const i = indexOf.get(bar);
    if (i !== undefined) return i;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid]!.bar < bar) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const marks = input.sections
    .map((s) => ({ i: at(s.bar), label: String(s.label).trim() }))
    .filter((m) => m.i < n && m.label.length > 0)
    .sort((a, b) => a.i - b.i)
    .filter((m, k, list) => k === 0 || m.i !== list[k - 1]!.i);
  if (!marks.length) return null;
  const parts = input.parts
    .map((p) => ({ type: p.type, first: at(p.firstBar), end: at(p.endBar) }))
    .filter((p) => p.end > p.first)
    .sort((a, b) => a.first - b.first);
  const partAt = (i: number) => parts.find((p) => i >= p.first && i < p.end) ?? null;
  const stops = new Set<number>();
  for (const p of parts) if (p.type === 'intro' || p.type === 'outro' || p.type === 'special') stops.add(p.first);
  // ---- 1. occurrences
  const keyChanges = [...input.keyChanges].sort((a, b) => a.bar - b.bar).map((k) => ({ i: at(k.bar), key: k.key }));
  const keys: Key[] = [];
  const keyIndexAt = (i: number): number => {
    let key: Key | null = null;
    for (const k of keyChanges) if (k.i <= i) key = k.key;
    if (!key) return -1;
    const found = keys.findIndex((x) => x.tonic === key!.tonic && x.mode === key!.mode);
    if (found >= 0) return found;
    keys.push(key);
    return keys.length - 1;
  };
  const occ: Occurrence[] = [];
  const pushRun = (first: number, end: number) => {
    if (end <= first) return;
    const p = partAt(first);
    let part: PartType;
    if (p && (p.type === 'intro' || p.type === 'outro' || p.type === 'special')) part = p.type;
    else part = first === 0 || !occ.some((o) => isLetter(o.label)) ? 'intro' : end >= n ? 'outro' : 'special';
    occ.push({ first, end, label: { part }, key: keyIndexAt(first), rank: -1, chorus: -1 });
  };
  pushRun(0, marks[0]!.i);
  marks.forEach((m, k) => {
    const next = marks[k + 1]?.i ?? n;
    let end = next;
    for (const s of stops) if (s > m.i && s < end) end = s;
    occ.push({ first: m.i, end, label: { letter: m.label }, key: keyIndexAt(m.i), rank: -1, chorus: -1 });
    // what follows a stop until the next mark has no letter
    let cur = end;
    const stopsAfter = [...stops].filter((s) => s >= end && s < next).sort((a, b) => a - b);
    for (let j = 0; j < stopsAfter.length; j++) {
      const s = stopsAfter[j]!;
      if (s > cur) pushRun(cur, s);
      const e = Math.min(next, stopsAfter[j + 1] ?? next);
      pushRun(s, e);
      cur = e;
    }
    if (cur < next) pushRun(cur, next);
  });
  const letterOcc = occ.filter((o) => isLetter(o.label));
  if (!letterOcc.length) return null;
  // ---- 3. the chorus: ranks and bounds of the repeats
  const period = letterPeriod(letterOcc);
  if (period) {
    letterOcc.forEach((o, k) => {
      o.chorus = Math.floor(k / period);
      const label = labelKey(o.label);
      o.rank = letterOcc.slice(o.chorus * period, k).filter((x) => labelKey(x.label) === label).length;
    });
  } else letterOcc.forEach((o) => (o.chorus = 0));
  // ---- 2. groups: letter × key, the same chords in two keys being one group
  const tonic: number | null = null; // the minor tonic is written after the consensus (`writeMinorTonic`)
  const known = knownLookup(input, bars, letterOcc);
  const groups: Group[] = [];
  const groupOf = new Map<Occurrence, Group>();
  const newGroup = (o: Occurrence, variant: number): Group => {
    const g: Group = { id: '', label: o.label, key: o.key, variant, occ: [], length: 0, map: [], tag: 0 };
    groups.push(g);
    return g;
  };
  for (const o of occ) {
    if (!isLetter(o.label)) {
      groupOf.set(o, newGroup(o, 1));
      continue;
    }
    const g = groups.find((x) => isLetter(x.label) && x.label.letter === (o.label as { letter: string }).letter && x.key === o.key) ?? newGroup(o, 1);
    groupOf.set(o, g);
  }
  for (const [o, g] of groupOf) g.occ.push(o);
  for (const g of groups) g.occ.sort((a, b) => a.first - b.first);
  // the same letter in two keys with the same chords: one group
  for (const g of [...groups]) {
    if (!isLetter(g.label)) continue;
    const twin = groups.find((x) => x !== g && isLetter(x.label) && x.label.letter === (g.label as { letter: string }).letter && groups.indexOf(x) < groups.indexOf(g) && sameChords(bars, x.occ, g.occ));
    if (!twin) continue;
    twin.occ.push(...g.occ);
    twin.occ.sort((a, b) => a.first - b.first);
    for (const o of g.occ) groupOf.set(o, twin);
    groups.splice(groups.indexOf(g), 1);
  }
  // ---- 4. variants by rank
  for (const g of [...groups]) {
    if (!isLetter(g.label)) continue;
    const split = variantsByRank(bars, g);
    if (!split) continue;
    const g2: Group = { id: '', label: g.label, key: g.key, variant: 2, occ: split.second, length: 0, map: [], tag: 0 };
    g.occ = split.first;
    for (const o of g2.occ) groupOf.set(o, g2);
    groups.splice(groups.indexOf(g) + 1, 0, g2);
  }
  // nothing repeats: nothing to fold
  const repeated = groups.some((g) => isLetter(g.label) && g.occ.length >= 2);
  // ---- 6. tags
  for (const g of groups) {
    if (isLetter(g.label) || g.occ.length !== 1 || (g.label as { part: PartType }).part !== 'outro') continue;
    const p = tagPeriod(bars, g.occ[0]!);
    if (p) g.tag = p;
  }
  if (!repeated) return null;
  // lengths and positions
  for (const g of groups) {
    g.length = g.tag || (isLetter(g.label) ? writtenLength(g.occ) : g.occ[0]!.end - g.occ[0]!.first);
    const rows = isLetter(g.label) && !g.tag ? groupTokens(bars, g.occ) : [];
    g.map = g.occ.map((o) => {
      const len = o.end - o.first;
      if (len === g.length || rows.length !== g.length || len > 2 * g.length) return positions(len, g.length);
      return alignPositions(bars, o, rows);
    });
  }
  // written order: first appearance; ids
  groups.sort((a, b) => a.occ[0]!.first - b.occ[0]!.first);
  const used = new Set<string>();
  const keyCount = new Map<string, number>();
  for (const g of groups) {
    let id: string;
    if (isLetter(g.label)) {
      const base = g.label.letter;
      const k = `${base}|${g.variant}`;
      const nth = (keyCount.get(k) ?? 0) + 1;
      keyCount.set(k, nth);
      id = `${base}${g.variant > 1 ? g.variant : ''}${nth > 1 ? `@${nth}` : ''}`;
    } else id = g.label.part;
    let unique = id;
    for (let k = 2; used.has(unique); k++) unique = `${id}-${k}`;
    used.add(unique);
    g.id = unique;
  }
  // ---- 5. written bars
  const writtenBars: WrittenBar[] = [];
  const sections: WrittenSection[] = [];
  const several = new Set(bars.map((b) => `${b.meter.numerator}/${b.meter.denominator}`)).size > 1;
  let prevMeter: HarmonyBar['meter'] | null = null;
  let prevKey = -1;
  let first = true;
  let lastWritten: ChordSymbol | null = null;
  const alts = new Map<WrittenChord, number>();
  for (const g of groups) {
    const idx: number[] = [];
    let prevChords: WrittenChord[] | null = null;
    for (let pos = 0; pos < g.length; pos++) {
      // the bars played at this position
      const played: { bar: HarmonyBar; i: number }[] = [];
      g.occ.forEach((o, k) => {
        const m = g.map[k]!;
        for (let j = 0; j < m.length; j++) if (m[j] === pos) played.push({ bar: bars[o.first + j]!, i: o.first + j });
      });
      const ref = played[0]?.bar ?? bars[g.occ[0]!.first]!;
      const beats = Math.max(1, Math.round(ref.beats) || 1);
      // the bar's rhythm first (one chord, or a second one on the middle of the bar), voted over the repeats
      const half = beats >= 4 && beats % 2 === 0 ? beats / 2 : -1;
      const readings = played.map(({ bar, i }) => {
        const bc = beatChords(bar);
        const p = partAt(i);
        // the theme's harmony is the written one: solos reharmonise
        const wt = p && (p.type === 'theme' || p.type === 'verse' || p.type === 'chorus') ? THEME_WEIGHT : 1;
        const at = (k: number) => bc[Math.floor((k * bc.length) / beats)]!;
        let split = false;
        if (half > 0) {
          const a = at(0).chord;
          const b = at(half).chord;
          // a change near the middle (one beat early or late included) splits the bar
          split = !sameChordish(a, b) && (sameChordish(at(half - 1).chord, a) || sameChordish(at(half + 1 < beats ? half + 1 : half).chord, b));
        }
        return { at, wt, split };
      });
      let splitW = 0;
      let wholeW = 0;
      for (const r of readings) {
        if (r.split) splitW += r.wt;
        else wholeW += r.wt;
      }
      // the known chart is one more voice, half a repeat
      const knownBar = isLetter(g.label) ? known(g.label.letter, pos) : null;
      if (knownBar && half > 0) {
        if (sameChordish(knownBar[0] ?? null, knownBar[Math.floor((half * knownBar.length) / beats)] ?? null)) wholeW += 0.5;
        else splitW += 0.5;
      }
      const segments = half > 0 && splitW > wholeW ? [[0, half], [half, beats]] : [[0, beats]];
      const chords: WrittenChord[] = [];
      let last: ChordSymbol | null | undefined;
      for (const [from, to] of segments as [number, number][]) {
        // each reading votes for what sounds in the segment, beat by beat (a chord a beat off still votes mostly right)
        const entries: { chord: ChordSymbol | null; w: number }[] = [];
        for (const r of readings) for (let k = from; k < to; k++) {
          const x = r.at(k);
          entries.push({ chord: x.chord, w: (x.w * r.wt) / (to - from) });
        }
        const kb = knownBar?.[Math.floor((from * knownBar.length) / beats)] ?? null;
        const { chord: c, alt } = consensusChord(entries, kb, tonic, last ?? lastWritten);
        const same = last !== undefined && (c === null ? last === null : last !== null && last.root === c.root && last.quality === c.quality);
        if (!same) {
          const wc = { beat: from, chord: c };
          chords.push(wc);
          if (alt !== null) alts.set(wc, alt);
        }
        last = c;
      }
      if (last !== undefined) lastWritten = last;
      const tidy = chords.length ? chords : [{ beat: 0, chord: null }];
      const simile = pos > 0 && prevChords !== null && sameWritten(prevChords, tidy);
      const meter = ref.meter;
      const signature = several && (prevMeter === null || !sameMeter(prevMeter, meter)) ? { ...meter } : null;
      prevMeter = meter;
      // a modulation written above the first bar where the key differs from the bar written before
      const occKey = g.key;
      const keyChange = !first && pos === 0 && occKey !== prevKey && occKey >= 0 ? { ...keys[occKey]! } : null;
      if (pos === 0) {
        prevKey = occKey;
        first = false;
      }
      writtenBars.push({
        index: writtenBars.length,
        beats,
        meter: { ...meter },
        signature,
        chords: simile ? [] : tidy,
        simile,
        keyChange,
        played: played.map((x) => x.bar.bar).sort((a, b) => a - b),
      });
      idx.push(writtenBars.length - 1);
      prevChords = tidy;
    }
    sections.push({
      id: g.id,
      label: g.label,
      bars: idx,
      times: g.tag ? Math.max(1, Math.round((g.occ[0]!.end - g.occ[0]!.first) / g.tag)) : timesOf(g, groupOf, letterOcc),
      ...(g.variant > 1 ? { variant: g.variant } : {}),
    });
  }
  resolveTritones(writtenBars, alts);
  const lastLetter = letterOcc[letterOcc.length - 1];
  writeMinorTonic(writtenBars, lastLetter ? sections[groups.indexOf(groupOf.get(lastLetter)!)] : undefined);
  // « % » again after the substitutes are brought back
  for (const sec of sections) {
    for (let k = 1; k < sec.bars.length; k++) {
      const b = writtenBars[sec.bars[k]!]!;
      const p = writtenBars[sec.bars[k - 1]!]!;
      if (b.simile) continue;
      const prevChords = p.simile ? chordsBefore(writtenBars, sec.bars, k - 1) : p.chords;
      if (sameWritten(prevChords, b.chords)) {
        b.simile = true;
        b.chords = [];
      }
    }
  }
  // ---- places
  const places = new Map<number, WrittenPlace>();
  const passCount = new Map<number, number>();
  const order: { bar: number; written: number }[] = [];
  groups.forEach((g, gi) => {
    const sec = sections[gi]!;
    g.occ.forEach((o, k) => {
      const m = g.map[k]!;
      for (let j = 0; j < m.length; j++) {
        const p = m[j]!;
        if (p < 0) continue;
        order.push({ bar: bars[o.first + j]!.bar, written: sec.bars[p]! });
      }
    });
  });
  order.sort((a, b) => a.bar - b.bar);
  for (const { bar, written } of order) {
    const pass = (passCount.get(written) ?? 0) + 1;
    passCount.set(written, pass);
    places.set(bar, { written, pass, passes: 0 });
  }
  for (const p of places.values()) p.passes = passCount.get(p.written) ?? 1;
  const form: FormEntry[] = input.parts.map((p) => ({ partId: p.id, letters: p.letters.join('') }));
  return { form, sections, bars: writtenBars, places };
}

/** The chords a « % » bar stands for (the last written bar before it in its section). */
function chordsBefore(written: readonly WrittenBar[], idx: readonly number[], k: number): WrittenChord[] {
  for (let j = k; j >= 0; j--) {
    const b = written[idx[j]!]!;
    if (!b.simile) return b.chords;
  }
  return [];
}

/** Two sets of occurrences play the same chords (family level, 90 % of the beats). */
function sameChords(bars: readonly HarmonyBar[], a: readonly Occurrence[], b: readonly Occurrence[]): boolean {
  const ca = groupTokens(bars, a);
  const cb = groupTokens(bars, b);
  if (!ca.length || ca.length !== cb.length) return false;
  let s = 0;
  for (let k = 0; k < ca.length; k++) s += agreement(ca[k]!, cb[k]!);
  return s / ca.length >= 0.9;
}

/** Majority family token per beat of each position over occurrences of the most common length. */
function groupTokens(bars: readonly HarmonyBar[], occ: readonly Occurrence[]): number[][] {
  return groupVotes(bars, occ).map((row) => row.map((x) => x.token));
}

/** Majority family token per beat of each position, and the share of the occurrences that play it. */
function groupVotes(bars: readonly HarmonyBar[], occ: readonly Occurrence[]): { token: number; share: number }[][] {
  if (!occ.length) return [];
  const len = writtenLength(occ);
  const same = occ.filter((o) => o.end - o.first === len);
  const out: { token: number; share: number }[][] = [];
  for (let pos = 0; pos < len; pos++) {
    const toks = same.map((o) => barTok(bars[o.first + pos]!));
    const beats = toks[0]!.length;
    const row: { token: number; share: number }[] = [];
    for (let k = 0; k < beats; k++) {
      const n = new Map<number, number>();
      for (const t of toks) {
        const x = t[Math.floor((k * t.length) / beats)]!;
        n.set(x, (n.get(x) ?? 0) + 1);
      }
      let best = NONE;
      let bw = -1;
      for (const [x, c] of n) if (c > bw || (c === bw && x < best)) {
        best = x;
        bw = c;
      }
      row.push({ token: best, share: bw / toks.length });
    }
    out.push(row);
  }
  return out;
}

/**
 * First and second endings (see the header, step 4): the occurrences of each
 * rank in the chorus agree; two ranks that play the same section but end
 * differently (the last four bars) are two variants. Needs two choruses.
 */
function variantsByRank(bars: readonly HarmonyBar[], g: Group): { first: Occurrence[]; second: Occurrence[] } | null {
  const byRank = new Map<number, Occurrence[]>();
  for (const o of g.occ) {
    if (o.rank < 0) return null;
    const list = byRank.get(o.rank) ?? [];
    list.push(o);
    byRank.set(o.rank, list);
  }
  if (byRank.size < 2 || [...byRank.values()].some((l) => l.length < 2)) return null;
  const len = writtenLength(g.occ);
  if (len < 4) return null;
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const votes = new Map(ranks.map((r) => [r, groupVotes(bars, byRank.get(r)!)]));
  if (ranks.some((r) => votes.get(r)!.length !== len)) return null;
  const tail = Math.min(4, Math.floor(len / 2));
  const toks = (v: { token: number; share: number }[][]) => v.map((row) => row.map((x) => x.token));
  /** A bar where both ranks agree within themselves and play other roots. */
  const rootDiffers = (a: { token: number; share: number }[], b: { token: number; share: number }[]) => {
    let d = 0;
    let c = 0;
    const n = Math.max(a.length, b.length);
    for (let k = 0; k < n; k++) {
      const x = a[Math.floor((k * a.length) / n)]!;
      const y = b[Math.floor((k * b.length) / n)]!;
      if (x.token < 0 || y.token < 0) continue;
      c++;
      if (x.share >= 0.6 && y.share >= 0.6 && rootOf(x.token) !== rootOf(y.token) && !(familyOf(x.token) === DOM && familyOf(y.token) === DOM && (rootOf(x.token) - rootOf(y.token) + 12) % 12 === 6)) d++;
    }
    return c > 0 && d >= c / 2;
  };
  const differ = (a: { token: number; share: number }[][], b: { token: number; share: number }[][]) => {
    const ta = toks(a);
    const tb = toks(b);
    let head = 0;
    for (let k = 0; k < len - tail; k++) head += agreement(ta[k]!, tb[k]!);
    let end = 0;
    for (let k = len - tail; k < len; k++) if (rootDiffers(a[k]!, b[k]!)) end++;
    return head / Math.max(1, len - tail) >= 0.85 && end >= 1;
  };
  const r0 = votes.get(ranks[0]!)!;
  const second = ranks.filter((r) => r !== ranks[0] && differ(r0, votes.get(r)!));
  if (!second.length) return null;
  // the other ranks must agree with each other
  const s0 = votes.get(second[0]!)!;
  if (second.some((r) => differ(s0, votes.get(r)!))) return null;
  const inSecond = new Set(second);
  return { first: g.occ.filter((o) => !inSecond.has(o.rank)), second: g.occ.filter((o) => inSecond.has(o.rank)) };
}

/** `[ … ]xN`: the occurrences right after the first one, in the same chorus, written by the same section. */
function timesOf(g: Group, groupOf: ReadonlyMap<Occurrence, Group>, letterOcc: readonly Occurrence[]): number {
  if (!isLetter(g.label)) return 1;
  const firstOcc = g.occ[0]!;
  const k0 = letterOcc.indexOf(firstOcc);
  if (k0 < 0) return 1;
  let times = 1;
  for (let k = k0 + 1; k < letterOcc.length; k++) {
    const o = letterOcc[k]!;
    if (groupOf.get(o) !== g || o.chorus !== firstOcc.chorus || o.first !== letterOcc[k - 1]!.end) break;
    times++;
  }
  return times;
}

/** Same root and family (or both N.C.). */
function sameChordish(a: ChordSymbol | null, b: ChordSymbol | null): boolean {
  if (!a || !b) return a === b;
  return a.root === b.root && FAMILY_OF[a.quality] === FAMILY_OF[b.quality];
}

/** The known chart's chord per beat at a position of a letter, in the recording's key (null when none fits). */
function knownLookup(input: SimplifyInput, bars: readonly HarmonyBar[], letterOcc: readonly Occurrence[]): (letter: string, pos: number) => (ChordSymbol | null)[] | null {
  const k = input.known[0];
  const none = () => null;
  if (!k) return none;
  const body = knownBody(k.chart);
  if (!body) return none;
  const first = new Map<string, number>();
  for (const s of body.sections) if (!first.has(s.letter)) first.set(s.letter, s.start);
  // transposition: the one that best matches the played bars of the letters (the chart's key alone is not trusted)
  let bestT = 0;
  let bestV = -1;
  for (let t = -5; t <= 6; t++) {
    let v = 0;
    for (const o of letterOcc.slice(0, 16)) {
      const s = first.get((o.label as { letter: string }).letter);
      if (s === undefined) continue;
      for (let j = 0; j < Math.min(8, o.end - o.first); j++) {
        const kb = body.toks[s + j];
        if (!kb) break;
        const kt = Array.from(kb.slots, (x) => (x < 0 ? x : makeToken(rootOf(x) + t, familyOf(x))));
        v += agreement(barTok(bars[o.first + j]!), kt);
      }
    }
    if (v > bestV) {
      bestV = v;
      bestT = t;
    }
  }
  return (letter, pos) => {
    const s = first.get(letter);
    if (s === undefined) return null;
    const kb = body.toks[s + pos];
    if (!kb) return null;
    return Array.from(kb.slots, (x) => (x < 0 ? null : { root: (rootOf(x) + bestT + 12) % 12, quality: familyQuality(familyOf(x)), extensions: [], bass: null }));
  };
}

/** A quality standing for a family (only the family of the known chord is compared). */
function familyQuality(f: number): ChordQuality {
  return f === MAJ ? 'maj7' : f === MIN ? 'min7' : f === DOM ? '7' : f === HDIM ? 'hdim7' : f === DIM ? 'dim7' : f === SUS ? '7sus4' : 'aug';
}
