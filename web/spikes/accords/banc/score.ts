// Scores of one piece, and their sums over many pieces.
//
// Levels of « right » (each includes the previous one, except the bass):
//   fondamentale  the root is right
//   famille       root + family of the chord: major (maj, 6, maj7, 7), minor
//                 (m, m6, m7, m(maj7)), diminished (dim, dim7, m7b5),
//                 augmented (+, +7), suspended (sus2, sus4, 7sus4)
//   couleur       root + exact quality of the app's vocabulary (maj, m, 7, maj7,
//                 m7, m7b5, dim7, 6, m6, m(maj7), +, +7, dim, sus2, sus4, 7sus4)
//   complet       couleur + the same extensions + the same bass note
//   basse         the lowest note (bass of a slash chord, else the root)
//
// Two weightings: per beat (each beat of each bar counts once, the chord read
// at the middle of the beat; « par mesure » in the reports) and per unit of
// time (sampled every 50 ms).

import type { ChordQuality, ChordSymbol } from '../../../../app/src/model/harmony';
import { chordAt, type Truth, type TruthChord } from './truth';
import type { VariantChord, VariantOutput } from './types';

export const LEVELS = ['fondamentale', 'famille', 'couleur', 'complet', 'basse'] as const;
export type Level = (typeof LEVELS)[number];

const FAMILY: Record<ChordQuality, string> = {
  maj: 'maj', maj6: 'maj', maj7: 'maj', '7': 'maj',
  min: 'min', min6: 'min', min7: 'min', minmaj7: 'min',
  dim: 'dim', dim7: 'dim', hdim7: 'dim',
  aug: 'aug', aug7: 'aug',
  sus2: 'sus', sus4: 'sus', '7sus4': 'sus',
};

/** Names as a chart writes them, for the reports. */
export const QUALITY_TEXT: Record<ChordQuality, string> = {
  maj: 'maj', min: 'm', aug: '+', dim: 'dim', sus2: 'sus2', sus4: 'sus4', '7': '7', maj7: 'maj7',
  min7: 'm7', minmaj7: 'm(maj7)', maj6: '6', min6: 'm6', dim7: 'dim7', hdim7: 'm7b5', '7sus4': '7sus4', aug7: '+7',
};

export function levels(t: TruthChord, d: ChordSymbol | null): Record<Level, boolean> {
  if (!d) return { fondamentale: false, famille: false, couleur: false, complet: false, basse: false };
  const root = d.root === t.root;
  const fam = root && FAMILY[d.quality] === FAMILY[t.quality];
  const col = root && d.quality === t.quality;
  const sameExt = d.extensions.length === t.extensions.length && d.extensions.every((e) => t.extensions.includes(e));
  const tb = t.bass ?? t.root;
  const db = d.bass ?? d.root;
  return { fondamentale: root, famille: fam, couleur: col, complet: col && sameExt && tb === db, basse: tb === db };
}

function at(chords: readonly VariantChord[], t: number): VariantChord | null {
  let lo = 0;
  let hi = chords.length - 1;
  let found = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (chords[m]!.time <= t) {
      found = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return found < 0 ? null : chords[found]!;
}

const sameRQ = (a: ChordSymbol | null, b: { root: number; quality: ChordQuality } | null) =>
  !!a && !!b && a.root === b.root && a.quality === b.quality;

/** Sums: every rate is a ratio of two counts, so pieces add up. */
export interface Counts {
  beats: number;
  beat: Record<Level, number>;
  samples: number;
  time: Record<Level, number>;
  twoChordBars: number;
  missing: number;
  oneChordBars: number;
  extra: number;
  doubtful: number;
  doubtfulWrong: number;
  sureWrong: number;
  wrong: number;
  flagged: number;
  beatTruth: number;
  beatFound: number;
  beatHits: number;
  downTruth: number;
  downHits: number;
  meterRight: number;
  keyRight: number;
  pieces: number;
  /** Error types, per beat where root + quality is wrong. */
  errors: Record<string, number>;
  /** Root right, quality wrong: « true → found » pairs. */
  qualityPairs: Record<string, number>;
}

export function emptyCounts(): Counts {
  const z = () => Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  return {
    beats: 0, beat: z(), samples: 0, time: z(), twoChordBars: 0, missing: 0, oneChordBars: 0, extra: 0,
    doubtful: 0, doubtfulWrong: 0, sureWrong: 0, wrong: 0, flagged: 0,
    beatTruth: 0, beatFound: 0, beatHits: 0, downTruth: 0, downHits: 0, meterRight: 0, keyRight: 0, pieces: 0,
    errors: {}, qualityPairs: {},
  };
}

export function addCounts(a: Counts, b: Counts): Counts {
  const out = emptyCounts();
  for (const k of Object.keys(out) as (keyof Counts)[]) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'number') (out as unknown as Record<string, number>)[k] = x + (y as number);
    else {
      const o: Record<string, number> = {};
      for (const [kk, v] of Object.entries(x as Record<string, number>)) o[kk] = (o[kk] ?? 0) + v;
      for (const [kk, v] of Object.entries(y as Record<string, number>)) o[kk] = (o[kk] ?? 0) + v;
      (out as unknown as Record<string, Record<string, number>>)[k] = o;
    }
  }
  return out;
}

const inc = (o: Record<string, number>, k: string) => {
  o[k] = (o[k] ?? 0) + 1;
};

const INTERVAL_NAME: Record<number, string> = {
  1: 'fondamentale à un demi-ton', 11: 'fondamentale à un demi-ton',
  2: 'fondamentale à un ton', 10: 'fondamentale à un ton',
  3: 'fondamentale à une tierce (mineure)', 9: 'fondamentale à une tierce (mineure)',
  4: 'fondamentale à une tierce (majeure)', 8: 'fondamentale à une tierce (majeure)',
  5: 'fondamentale à la quinte / quarte', 7: 'fondamentale à la quinte / quarte',
  6: 'fondamentale au triton',
};

/** Scores one piece in one condition. */
export function scorePiece(t: Truth, condition: string, out: VariantOutput): Counts {
  const c = emptyCounts();
  const s = t.conditions[condition]!.timeScale;
  const chords = [...out.chords].sort((a, b) => a.time - b.time);
  c.pieces = 1;
  // per beat
  const flat: { t0: number; t1: number; truth: TruthChord }[] = [];
  for (const bar of t.bars) {
    const ends = bar.beats.slice(1).concat([bar.end]);
    for (let j = 0; j < bar.beats.length; j++) flat.push({ t0: bar.beats[j]! * s, t1: ends[j]! * s, truth: chordAt(bar, j + 1) });
  }
  for (let i = 0; i < flat.length; i++) {
    const b = flat[i]!;
    const d = at(chords, (b.t0 + b.t1) / 2);
    const sym = d?.chord ?? null;
    const l = levels(b.truth, sym);
    c.beats++;
    for (const k of LEVELS) if (l[k]) c.beat[k]++;
    const wrong = !l.couleur;
    if (d?.doubtful) {
      c.doubtful++;
      if (wrong) c.doubtfulWrong++;
    } else if (wrong) c.sureWrong++;
    if (wrong) {
      c.wrong++;
      if (d?.doubtful) c.flagged++;
      const prev = flat[i - 1]?.truth;
      const next = flat[i + 1]?.truth;
      let kind: string;
      if (!sym) kind = 'aucun accord';
      else if ((prev && sameRQ(sym, prev)) || (next && sameRQ(sym, next))) kind = 'accord voisin (décalé d’un temps ou plus)';
      else if (sym.root === b.truth.root) {
        kind = FAMILY[sym.quality] === FAMILY[b.truth.quality] ? 'bonne fondamentale, septième ou sixte fausse' : 'bonne fondamentale, famille fausse';
        inc(c.qualityPairs, `${QUALITY_TEXT[b.truth.quality]} → ${QUALITY_TEXT[sym.quality]}`);
      } else {
        const iv = (sym.root - b.truth.root + 12) % 12;
        kind = INTERVAL_NAME[iv]!;
      }
      inc(c.errors, kind);
    }
  }
  // per time
  const t0 = t.bars[0]!.start * s;
  const t1 = t.bars[t.bars.length - 1]!.end * s;
  let bi = 0;
  for (let x = t0; x < t1; x += 0.05) {
    while (bi < flat.length - 1 && flat[bi]!.t1 <= x) bi++;
    const l = levels(flat[bi]!.truth, at(chords, x)?.chord ?? null);
    c.samples++;
    for (const k of LEVELS) if (l[k]) c.time[k]++;
  }
  // missing and extra changes
  for (const bar of t.bars) {
    const tq = new Set(bar.chords.map((x) => `${x.root}:${x.quality}`));
    const ends = bar.beats.slice(1).concat([bar.end]);
    const dq = new Set(bar.beats.map((b0, j) => at(chords, ((b0 + ends[j]!) / 2) * s)?.chord).map((x) => (x ? `${x.root}:${x.quality}` : 'N')));
    if (tq.size >= 2) {
      c.twoChordBars++;
      if (dq.size < 2) c.missing++;
    } else {
      c.oneChordBars++;
      if (dq.size >= 2) c.extra++;
    }
  }
  // beats and downbeats
  if (out.beats) {
    const TOL = 0.07;
    const truthBeats = t.beats.map((x) => x * s);
    const found = out.beats.times;
    c.beatTruth = truthBeats.length;
    c.beatFound = found.length;
    let j = 0;
    for (const tb of truthBeats) {
      while (j < found.length - 1 && found[j + 1]! <= tb) j++;
      const near = [found[j], found[j + 1]].filter((v): v is number => v !== undefined);
      if (near.some((v) => Math.abs(v - tb) <= TOL)) c.beatHits++;
    }
    const bpb = out.beats.beatsPerBar;
    const downs = found.filter((_, i) => (((i - out.beats!.downbeat) % bpb) + bpb) % bpb === 0);
    const tdowns = truthBeats.filter((_, i) => (((i - t.downbeat) % t.meter) + t.meter) % t.meter === 0);
    c.downTruth = tdowns.length;
    for (const td of tdowns) if (downs.some((v) => Math.abs(v - td) <= TOL)) c.downHits++;
    if (bpb === t.meter) c.meterRight = 1;
  }
  if (out.key && out.key.tonic === t.key.tonic && out.key.mode === t.key.mode) c.keyRight = 1;
  return c;
}

export interface Rates {
  pieces: number;
  beat: Record<Level, number>;
  time: Record<Level, number>;
  missing: number;
  extra: number;
  doubtfulShare: number;
  errorIfDoubtful: number;
  errorIfSure: number;
  errorsFlagged: number;
  beatF: number;
  downbeats: number;
  meter: number;
  key: number;
}

const ratio = (a: number, b: number) => (b ? a / b : NaN);

export function rates(c: Counts): Rates {
  const lv = (o: Record<Level, number>, n: number) => Object.fromEntries(LEVELS.map((l) => [l, ratio(o[l], n)])) as Record<Level, number>;
  const p = ratio(c.beatHits, c.beatFound);
  const r = ratio(c.beatHits, c.beatTruth);
  return {
    pieces: c.pieces,
    beat: lv(c.beat, c.beats),
    time: lv(c.time, c.samples),
    missing: ratio(c.missing, c.twoChordBars),
    extra: ratio(c.extra, c.oneChordBars),
    doubtfulShare: ratio(c.doubtful, c.beats),
    errorIfDoubtful: ratio(c.doubtfulWrong, c.doubtful),
    errorIfSure: ratio(c.sureWrong, c.beats - c.doubtful),
    errorsFlagged: ratio(c.flagged, c.wrong),
    beatF: p + r ? (2 * p * r) / (p + r) : NaN,
    downbeats: ratio(c.downHits, c.downTruth),
    meter: ratio(c.meterRight, c.pieces),
    key: ratio(c.keyRight, c.pieces),
  };
}
