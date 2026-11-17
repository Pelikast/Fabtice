// Scoring of the harmony pass against the corpus truth (all tiers).
//
// Every answer is read back in SOURCE SECONDS and mapped onto the truth's bar
// lines, so a case whose grid is wrong (a beat shift, a dropped bar) is scored
// on what the music really does. « ±1 bar » means within one truth bar line.
// Every metric is a count (hits, total) so that pieces, cases and tiers add
// up; the tables show hits / total as a percentage, a mean or a count.

import { QUALITY_FAMILY } from '../../harmony/chord';
import type { AnalysedKeyChange } from '../../model/analysis';
import type { ChordSymbol } from '../../model/harmony';
import type { DetectedStructure, StructurePart } from '../../model/structure';
import type { HarmonyBar, SimplifiedChart, WrittenBar } from '../types';
import { chordOf, nearestTruthLine, truthBarAt, type TruthChord, type TruthPiece, type WrittenLabel } from './cases';

/** hits, total. */
export type Count = [number, number];
export type Counts = Record<string, Count>;

export type MetricKind = 'rate' | 'mean' | 'count';
export interface Metric {
  key: string;
  label: string;
  group: string;
  kind: MetricKind;
  /** Neither better nor worse when higher (an answer « I am not sure »). */
  neutral?: true;
  /** Lower is better (false alarms, wrong names). */
  lowerIsBetter?: boolean;
}

/** Every metric, in table order. */
export const METRICS: readonly Metric[] = [
  { key: 'chorusLength', group: 'Forme', label: 'Longueur du chorus exacte', kind: 'rate' },
  { key: 'chorusP', group: 'Forme', label: 'Limites de chorus ±1 : précision', kind: 'rate' },
  { key: 'chorusR', group: 'Forme', label: 'Limites de chorus ±1 : rappel', kind: 'rate' },
  { key: 'sectionP', group: 'Forme', label: 'Limites de sections ±1 : précision', kind: 'rate' },
  { key: 'sectionR', group: 'Forme', label: 'Limites de sections ±1 : rappel', kind: 'rate' },
  { key: 'sectionF', group: 'Forme', label: 'Limites de sections ±1 : mesure F', kind: 'rate' },
  { key: 'sectionPairs', group: 'Forme', label: 'Lettres : mesure F par paires de mesures', kind: 'rate' },
  { key: 'formExact', group: 'Forme', label: 'Forme (AABA…) exacte', kind: 'rate' },
  { key: 'introExact', group: 'Forme', label: 'Mesures d’intro exactes', kind: 'rate' },
  { key: 'outroExact', group: 'Forme', label: 'Mesures d’outro exactes', kind: 'rate' },
  { key: 'mode', group: 'Forme', label: 'Mode Jazz / Pop juste', kind: 'rate' },
  { key: 'partP', group: 'Parties', label: 'Limites de parties ±1 : précision', kind: 'rate' },
  { key: 'partR', group: 'Parties', label: 'Limites de parties ±1 : rappel', kind: 'rate' },
  { key: 'partF', group: 'Parties', label: 'Limites de parties ±1 : mesure F', kind: 'rate' },
  { key: 'partType', group: 'Parties', label: 'Type de partie juste (thème, solo, intro…)', kind: 'rate' },
  { key: 'partNumber', group: 'Parties', label: 'Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas)', kind: 'rate' },
  { key: 'longSolo', group: 'Parties', label: 'Long solo d’un seul instrument non coupé', kind: 'rate' },
  { key: 'soloSplit', group: 'Parties', label: 'Solos voisins d’instruments différents séparés', kind: 'rate' },
  { key: 'instStem', group: 'Instruments', label: 'Instrument juste : piano, guitare, basse, batterie, voix', kind: 'rate' },
  { key: 'instWindExact', group: 'Instruments', label: 'Vents et vibraphone : instrument exact', kind: 'rate' },
  { key: 'instWindUnsure', group: 'Instruments', label: 'Vents et vibraphone : « Vents »', kind: 'rate', neutral: true },
  { key: 'instWrong', group: 'Instruments', label: 'Instrument nommé FAUX (toutes parties)', kind: 'rate', lowerIsBetter: true },
  { key: 'instNamedNoStems', group: 'Instruments', label: 'Instrument nommé sans séparation (doit être 0)', kind: 'rate', lowerIsBetter: true },
  { key: 'modP', group: 'Modulations', label: 'Modulations : précision', kind: 'rate' },
  { key: 'modR', group: 'Modulations', label: 'Modulations : rappel', kind: 'rate' },
  { key: 'modPos', group: 'Modulations', label: 'Modulations : écart de position (mesures)', kind: 'mean', lowerIsBetter: true },
  { key: 'modKey', group: 'Modulations', label: 'Modulations trouvées : tonalité exacte', kind: 'rate' },
  { key: 'modFalseAlarms', group: 'Modulations', label: 'Fausses modulations sur les morceaux sans modulation', kind: 'count', lowerIsBetter: true },
  { key: 'modFalsePieces', group: 'Modulations', label: 'Morceaux sans modulation qui en reçoivent une', kind: 'rate', lowerIsBetter: true },
  { key: 'simpNull', group: 'Grille simplifiée (structure vraie)', label: 'Rien à replier : pas de grille simplifiée', kind: 'rate' },
  { key: 'simpChord', group: 'Grille simplifiée (structure vraie)', label: 'Accords écrits justes (famille, par temps)', kind: 'rate' },
  { key: 'simpSections', group: 'Grille simplifiée (structure vraie)', label: 'Nombre de sections exact', kind: 'rate' },
  { key: 'simpTimes', group: 'Grille simplifiée (structure vraie)', label: 'Reprises `xN` exactes', kind: 'rate' },
  { key: 'simpPlaces', group: 'Grille simplifiée (structure vraie)', label: 'Mesure jouée → mesure écrite juste', kind: 'rate' },
  { key: 'chainChord', group: 'Grille simplifiée (chaîne complète)', label: 'Accords écrits justes (famille, par temps)', kind: 'rate' },
  { key: 'chainSections', group: 'Grille simplifiée (chaîne complète)', label: 'Nombre de sections exact', kind: 'rate' },
  { key: 'chainPlaces', group: 'Grille simplifiée (chaîne complète)', label: 'Mesure jouée → mesure écrite juste', kind: 'rate' },
  { key: 'autumnChart', group: 'Autumn Leaves (cahier)', label: 'Grille écrite attendue (structure vraie)', kind: 'rate' },
  { key: 'autumnChain', group: 'Autumn Leaves (cahier)', label: 'Forme et grille attendues (chaîne complète)', kind: 'rate' },
];

export function emptyCounts(): Counts {
  return Object.fromEntries(METRICS.map((m) => [m.key, [0, 0] as Count]));
}

export function addCounts(into: Counts, from: Counts): Counts {
  for (const [k, [h, t]] of Object.entries(from)) {
    const c = (into[k] ??= [0, 0]);
    c[0] += h;
    c[1] += t;
  }
  return into;
}

function inc(c: Counts, key: string, hit: boolean | number, total = 1): void {
  const x = (c[key] ??= [0, 0]);
  x[0] += typeof hit === 'number' ? hit : hit ? 1 : 0;
  x[1] += total;
}

/** The value a table shows (null: nothing to measure). */
export function metricValue(m: Metric, c: Count | undefined): number | null {
  if (!c) return null;
  if (m.kind === 'count') return c[0];
  if (c[1] === 0) return null;
  return c[0] / c[1];
}

// ---------------------------------------------------------------- helpers

/** Same root and same family (`harmony/chord.ts#QUALITY_FAMILY`), or both N.C. */
export function sameFamily(a: ChordSymbol | null, b: ChordSymbol | null): boolean {
  if (!a || !b) return a === b;
  return a.root === b.root && QUALITY_FAMILY[a.quality] === QUALITY_FAMILY[b.quality];
}

/** Greedy matching of two sorted position lists within `tol`: number of matches. */
export function matchPositions(truth: readonly number[], found: readonly number[], tol: number): number {
  const used = new Set<number>();
  let hits = 0;
  for (const t of truth) {
    let best = -1;
    for (let j = 0; j < found.length; j++) {
      if (used.has(j)) continue;
      const d = Math.abs(found[j]! - t);
      if (d <= tol && (best < 0 || d < Math.abs(found[best]! - t))) best = j;
    }
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  return hits;
}

function uniqueSorted(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

/** Chorus starts implied by the detected letters and form (truth bar lines). */
export function detectedChorusStarts(piece: TruthPiece, s: DetectedStructure): number[] {
  const form = s.form;
  if (!form) return [];
  const marks = [...s.sections].sort((a, b) => a.time - b.time);
  const out: number[] = [];
  let pos = 0;
  for (const m of marks) {
    const label = m.label.trim().charAt(0).toUpperCase();
    if (label === form[0] && (pos === 0 || pos >= form.length || form[pos] !== label)) {
      out.push(nearestTruthLine(piece, m.time));
      pos = 1;
    } else if (pos > 0 && pos < form.length && form[pos] === label) pos++;
    else pos = 0;
  }
  return uniqueSorted(out);
}

function mostFrequent(xs: number[]): number | null {
  if (!xs.length) return null;
  const n = new Map<number, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

interface PartSpan {
  first: number;
  end: number;
  part: StructurePart;
}

function detectedSpans(piece: TruthPiece, s: DetectedStructure): PartSpan[] {
  return s.parts
    .map((p) => ({ first: nearestTruthLine(piece, p.start), end: nearestTruthLine(piece, p.end), part: p }))
    .filter((x) => x.end > x.first);
}

function bestOverlap(spans: PartSpan[], first: number, end: number): PartSpan | null {
  let best: PartSpan | null = null;
  let bestW = 0;
  for (const s of spans) {
    const w = Math.min(end, s.end) - Math.max(first, s.first);
    if (w > bestW) {
      bestW = w;
      best = s;
    }
  }
  return best;
}

const STEM_INSTRUMENTS = new Set(['piano', 'guitar', 'bass', 'drums', 'voice']);

// ---------------------------------------------------------------- structure and keys

export interface StructureAnswers {
  keyChanges: AnalysedKeyChange[];
  structure: DetectedStructure | null;
}

/** Form, parts, instruments, mode and modulations of one case. `withStems`: the case had separated tracks. */
export function scoreStructure(piece: TruthPiece, a: StructureAnswers, withStems: boolean): Counts {
  const c = emptyCounts();
  const s = a.structure;
  const n = piece.bars.length;
  // ---- form
  if (piece.formScored) {
    const truthStarts = piece.choruses.map((x) => x.firstBar);
    const found = s ? detectedChorusStarts(piece, s) : [];
    const hits = matchPositions(truthStarts, found, 1);
    inc(c, 'chorusR', hits, truthStarts.length);
    inc(c, 'chorusP', hits, found.length);
    const len = mostFrequent(found.slice(1).map((x, i) => x - found[i]!));
    inc(c, 'chorusLength', len === piece.chorusBars);
    inc(c, 'formExact', !!s && s.form === piece.form);
  }
  const truthMarks = piece.sections.map((m) => m.bar);
  const foundMarks = s ? uniqueSorted(s.sections.map((m) => nearestTruthLine(piece, m.time))) : [];
  if (truthMarks.length) {
    const hits = matchPositions(truthMarks, foundMarks, 1);
    inc(c, 'sectionR', hits, truthMarks.length);
    inc(c, 'sectionP', hits, foundMarks.length);
    const p = foundMarks.length ? hits / foundMarks.length : 0;
    const r = hits / truthMarks.length;
    inc(c, 'sectionF', p + r > 0 ? (2 * p * r) / (p + r) : 0);
    // pairwise agreement of the letters on the bars of the form
    const det: (string | null)[] = new Array(n).fill(null);
    if (s) {
      const marks = [...s.sections].sort((x, y) => x.time - y.time);
      let k = 0;
      let cur: string | null = null;
      for (let i = 0; i < n; i++) {
        const mid = (piece.bars[i]!.start + piece.bars[i]!.end) / 2;
        while (k < marks.length && marks[k]!.time <= mid) cur = marks[k++]!.label;
        det[i] = cur;
      }
    }
    // pairwise F-measure: pairs of bars with the same letter in the truth vs in the answer
    const idx = piece.bars.map((b, i) => (b.section ? i : -1)).filter((i) => i >= 0);
    let both = 0;
    let truthSame = 0;
    let detSame = 0;
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const i = idx[x]!;
        const j = idx[y]!;
        const ts = piece.bars[i]!.section === piece.bars[j]!.section;
        const ds = det[i] !== null && det[i] === det[j];
        if (ts) truthSame++;
        if (ds) detSame++;
        if (ts && ds) both++;
      }
    }
    const pp = detSame ? both / detSame : 0;
    const pr = truthSame ? both / truthSame : 0;
    inc(c, 'sectionPairs', pp + pr > 0 ? (2 * pp * pr) / (pp + pr) : 0);
  }
  const spans = s ? detectedSpans(piece, s) : [];
  const count = (type: string, edge: 'start' | 'end') => {
    const t = piece.parts.filter((p) => p.type === type);
    const truth = t.reduce((acc, p) => acc + p.endBar - p.firstBar, 0);
    const d = spans.filter((p) => p.part.type === type && (edge === 'start' ? p.first <= 1 : p.end >= n - 1));
    const found = d.reduce((acc, p) => acc + p.end - p.first, 0);
    return !!s && truth === found;
  };
  inc(c, 'introExact', count('intro', 'start'));
  inc(c, 'outroExact', count('outro', 'end'));
  inc(c, 'mode', !!s && s.mode === piece.mode);
  // ---- parts
  const truthBounds = uniqueSorted([...piece.parts.map((p) => p.firstBar), piece.parts[piece.parts.length - 1]!.endBar]);
  const foundBounds = uniqueSorted(spans.flatMap((p) => [p.first, p.end]));
  const ph = matchPositions(truthBounds, foundBounds, 1);
  inc(c, 'partR', ph, truthBounds.length);
  inc(c, 'partP', ph, foundBounds.length);
  {
    const p = foundBounds.length ? ph / foundBounds.length : 0;
    const r = ph / truthBounds.length;
    inc(c, 'partF', p + r > 0 ? (2 * p * r) / (p + r) : 0);
  }
  for (const tp of piece.parts) {
    const m = bestOverlap(spans, tp.firstBar, tp.endBar);
    inc(c, 'partType', !!m && m.part.type === tp.type);
    // the app numbers no solo when every soloist is named and plays once (« Solo (Piano) »): an empty number is
    // right for a named soloist the truth has once
    const lone = tp.type === 'solo' && !!tp.instrument && piece.parts.filter((x) => x.type === 'solo' && x.instrument === tp.instrument).length === 1;
    const named = !!m && m.part.instrument !== null && m.part.instrument !== 'winds';
    inc(c, 'partNumber', !!m && m.part.type === tp.type && (m.part.number === null && lone && named ? true : (m.part.number ?? 1) === tp.number));
    if (tp.instrument && withStems) {
      const got = m?.part.instrument ?? null;
      if (STEM_INSTRUMENTS.has(tp.instrument)) inc(c, 'instStem', got === tp.instrument);
      else {
        inc(c, 'instWindExact', got === tp.instrument);
        inc(c, 'instWindUnsure', got === 'winds');
      }
      inc(c, 'instWrong', got !== null && got !== 'winds' && got !== tp.instrument);
    }
  }
  if (!withStems) for (const p of spans) inc(c, 'instNamedNoStems', p.part.instrument !== null);
  // one long solo by one instrument
  for (const tp of piece.parts) {
    if (tp.type !== 'solo' || !piece.chorusBars || tp.endBar - tp.firstBar < 2 * piece.chorusBars) continue;
    const m = bestOverlap(spans, tp.firstBar, tp.endBar);
    const inside = foundBounds.some((b) => b > tp.firstBar + 1 && b < tp.endBar - 1);
    const cover = m ? (Math.min(m.end, tp.endBar) - Math.max(m.first, tp.firstBar)) / (tp.endBar - tp.firstBar) : 0;
    inc(c, 'longSolo', !inside && cover >= 0.8);
  }
  // adjacent solos by different instruments
  for (let i = 1; i < piece.parts.length; i++) {
    const a1 = piece.parts[i - 1]!;
    const a2 = piece.parts[i]!;
    if (a1.type !== 'solo' || a2.type !== 'solo' || a1.instrument === a2.instrument) continue;
    inc(c, 'soloSplit', foundBounds.some((b) => Math.abs(b - a2.firstBar) <= 1));
  }
  // ---- modulations
  const truthKc = piece.keyChanges;
  const found = a.keyChanges.map((k) => ({ bar: nearestTruthLine(piece, k.time), key: k.key }));
  if (truthKc.length === 0) {
    inc(c, 'modFalseAlarms', found.length, 0);
    inc(c, 'modFalsePieces', found.length > 0);
  } else {
    const used = new Set<number>();
    let tp = 0;
    for (const t of truthKc) {
      let best = -1;
      for (let j = 0; j < found.length; j++) {
        if (used.has(j)) continue;
        const d = Math.abs(found[j]!.bar - t.bar);
        if (d <= 2 && (best < 0 || d < Math.abs(found[best]!.bar - t.bar))) best = j;
      }
      if (best < 0) continue;
      used.add(best);
      tp++;
      inc(c, 'modPos', Math.abs(found[best]!.bar - t.bar));
      inc(c, 'modKey', found[best]!.key.tonic === t.key.tonic && found[best]!.key.mode === t.key.mode);
    }
    inc(c, 'modR', tp, truthKc.length);
  }
  {
    // precision over every piece: a change found is right when it matches a truth change
    const used = new Set<number>();
    let right = 0;
    for (const f of found) {
      const j = truthKc.findIndex((t, k) => !used.has(k) && Math.abs(t.bar - f.bar) <= 2);
      if (j >= 0) {
        used.add(j);
        right++;
      }
    }
    inc(c, 'modP', right, found.length);
  }
  return c;
}

// ---------------------------------------------------------------- simplified chart

function sameLabel(a: WrittenLabel, b: WrittenLabel): boolean {
  if ('letter' in a) return 'letter' in b && a.letter === b.letter;
  return 'part' in b && a.part === b.part;
}

/** The chord sounding on each beat of every written bar (simile and carried chords resolved). */
function writtenBeats(bars: readonly WrittenBar[]): (ChordSymbol | null)[][] {
  const out: (ChordSymbol | null)[][] = [];
  let last: ChordSymbol | null = null;
  let prevChords: WrittenBar['chords'] = [];
  for (const b of bars) {
    const chords = b.simile ? prevChords : b.chords;
    const beats: (ChordSymbol | null)[] = [];
    for (let k = 0; k < b.beats; k++) {
      for (const c of chords) if (c.beat === k) last = c.chord;
      beats.push(last);
    }
    out.push(beats);
    prevChords = chords;
  }
  return out;
}

function truthWrittenBeats(bars: { beats: number; chords: TruthChord[]; simile: boolean }[]): (ChordSymbol | null)[][] {
  return writtenBeats(bars.map((b, index) => ({
    index, beats: b.beats, meter: { numerator: b.beats, denominator: 4 }, signature: null, simile: b.simile, keyChange: null, played: [0],
    chords: b.chords.map((c) => ({ beat: c.beat, chord: chordOf(c.text) })),
  })));
}

/** Number of written sections under the other honest convention: every run of a letter in a chorus written again (AABA → A x2, B, A). */
function runsCount(piece: TruthPiece): number {
  const s = piece.simplified!;
  const extra = s.sections.filter((x) => 'part' in x.label).length;
  if (!piece.form) return s.sections.length;
  let runs = 0;
  for (let i = 0; i < piece.form.length; i++) if (i === 0 || piece.form[i] !== piece.form[i - 1]) runs++;
  const blocks = s.sections.filter((x) => 'letter' in x.label).length / Math.max(1, new Set(piece.form).size);
  return extra + Math.round(runs * blocks);
}

/**
 * The written chart against the expected one. `bars` are the played bars handed to `simplifyChart`
 * (their numbers are the keys of `chart.places`).
 */
export function scoreSimplified(piece: TruthPiece, bars: readonly HarmonyBar[], chart: SimplifiedChart | null, prefix: 'simp' | 'chain'): Counts {
  const c: Counts = {};
  const exp = piece.simplified;
  if (!exp) {
    if (prefix === 'simp') inc(c, 'simpNull', chart === null);
    return c;
  }
  const expected = exp.sections;
  const got = chart?.sections ?? [];
  // align the sections in order, by label
  const match: (number | null)[] = [];
  let j = 0;
  for (const e of expected) {
    let k = j;
    while (k < got.length && !sameLabel(e.label, got[k]!.label)) k++;
    if (k < got.length) {
      match.push(k);
      j = k + 1;
    } else match.push(null);
  }
  const gotBeats = chart ? writtenBeats(chart.bars) : [];
  let hits = 0;
  let total = 0;
  expected.forEach((e, i) => {
    const want = truthWrittenBeats(e.bars);
    const m = match[i];
    const have = m === null || m === undefined ? [] : got[m]!.bars.map((b) => gotBeats[b] ?? []);
    want.forEach((beats, k) => {
      beats.forEach((w, beat) => {
        total++;
        const h = have[k]?.[beat];
        if (h !== undefined && sameFamily(w, h)) hits++;
      });
    });
    if (prefix === 'simp') inc(c, 'simpTimes', m !== null && m !== undefined && got[m]!.times === e.times);
  });
  inc(c, `${prefix}Chord`, hits, total);
  inc(c, `${prefix}Sections`, got.length === expected.length || got.length === runsCount(piece));
  // played -> written: compare (label, offset in the section)
  const sectionOf = new Map<number, { label: WrittenLabel; offset: number }>();
  for (const s of got) s.bars.forEach((w, off) => sectionOf.set(w, { label: s.label, offset: off }));
  const expectedPlace = new Map(exp.places.map(([bar, sec, off]) => [bar, { label: expected[sec]!.label, offset: off }]));
  let ph = 0;
  for (const b of bars) {
    const t = truthBarAt(piece, (b.start + b.end) / 2);
    const want = expectedPlace.get(t);
    if (!want) continue;
    const place = chart?.places.get(b.bar);
    const have = place ? sectionOf.get(place.written) : undefined;
    if (have && sameLabel(have.label, want.label) && have.offset === want.offset) ph++;
  }
  inc(c, `${prefix}Places`, ph, bars.length);
  return c;
}

// ---------------------------------------------------------------- the cahier's example

const AUTUMN = {
  intro: ['Bm'],
  A: ['Em7', 'A7', 'Dmaj7', 'Gmaj7', 'C#m7b5', 'F#7', 'Bm', '%'],
  B: ['C#m7b5', 'F#7', 'Bm', '%', 'Em7', 'A7', 'Dmaj7', 'Gmaj7'],
  C: ['C#m7b5', 'F#7', 'Bm Bb7', 'Am7 G#7', 'C#m7b5', 'F#7', 'Bm', '%'],
  form: [['intro', ''], ['theme', 'AABC'], ['solo', 'AABC'], ['solo', 'AA'], ['theme', 'BC']] as const,
};

/** The written form of the cahier's « Autumn Leaves » (v1/CAHIER.md, C14); the reasons it fails, empty when it passes. */
export function autumnChartFailures(chart: SimplifiedChart | null): string[] {
  if (!chart) return ['pas de grille simplifiée'];
  const fails: string[] = [];
  const labels = chart.sections.map((s) => ('letter' in s.label ? s.label.letter : s.label.part));
  if (labels.join(',') !== 'intro,A,B,C') fails.push(`sections ${labels.join(',')} au lieu de intro,A,B,C`);
  const beats = writtenBeats(chart.bars);
  const check = (name: 'A' | 'B' | 'C', times: number) => {
    const s = chart.sections.find((x) => 'letter' in x.label && x.label.letter === name);
    if (!s) return;
    if (s.times !== times) fails.push(`${name} : x${s.times} au lieu de x${times}`);
    const want = AUTUMN[name];
    if (s.bars.length !== want.length) {
      fails.push(`${name} : ${s.bars.length} mesures au lieu de ${want.length}`);
      return;
    }
    want.forEach((cell, k) => {
      const wb = chart.bars[s.bars[k]!]!;
      const have = beats[s.bars[k]!]!;
      if (cell === '%') {
        // « % », or the same chord written again
        const before = beats[s.bars[k - 1]!]!;
        if (!wb.simile && !(wb.chords.length <= 1 && sameFamily(have[0] ?? null, before[before.length - 1] ?? null))) fails.push(`${name} mesure ${k + 1} : « % » attendu`);
        return;
      }
      const parts = cell.split(' ');
      const at = parts.length === 1 ? [0] : [0, 2];
      parts.forEach((txt, i) => {
        if (!sameFamily(chordOf(txt), have[at[i]!] ?? null)) fails.push(`${name} mesure ${k + 1} : ${cell} attendu`);
      });
      if (parts.length === 2 && (wb.simile || wb.chords.length !== 2)) fails.push(`${name} mesure ${k + 1} : deux accords attendus`);
    });
  };
  check('A', 2);
  check('B', 1);
  check('C', 1);
  const intro = chart.sections.find((x) => 'part' in x.label && x.label.part === 'intro');
  if (intro) {
    const chords = intro.bars.flatMap((b) => (chart.bars[b]!.simile ? [] : chart.bars[b]!.chords.map((x) => x.chord)));
    const distinct = chords.filter((x, i) => i === 0 || !sameFamily(x, chords[i - 1] ?? null));
    if (distinct.length !== 1 || !sameFamily(distinct[0] ?? null, chordOf('Bm'))) fails.push('intro : Bm attendu');
  }
  return fails;
}

/** The form line « Intro, Thème Chant (AABC), Solo Piano (AABC), Solo Trompette (AA), Thème Chant 2 (BC) » from the detection. */
export function autumnFormFailures(piece: TruthPiece, s: DetectedStructure | null, chart: SimplifiedChart | null, withStems = true): string[] {
  if (!s) return ['pas de structure'];
  const fails: string[] = [];
  const want = [
    { type: 'intro', instrument: null, number: null },
    { type: 'theme', instrument: 'voice', number: 1 },
    { type: 'solo', instrument: 'piano', number: null },
    { type: 'solo', instrument: 'trumpet', number: null },
    { type: 'theme', instrument: 'voice', number: 2 },
  ];
  if (s.form !== 'AABC') fails.push(`forme ${s.form || '(vide)'} au lieu de AABC`);
  if (s.parts.length !== want.length) fails.push(`${s.parts.length} parties au lieu de 5`);
  s.parts.forEach((p, i) => {
    const w = want[i];
    if (!w) return;
    if (p.type !== w.type) fails.push(`partie ${i + 1} : ${p.type} au lieu de ${w.type}`);
    const inst = withStems ? w.instrument : null; // without separation: « Solo 1, Solo 2 », no instrument
    if (p.instrument !== inst) fails.push(`partie ${i + 1} : instrument ${p.instrument} au lieu de ${inst}`);
    if (w.number === 2 && p.number !== 2) fails.push(`partie ${i + 1} : numéro 2 attendu`);
    const tp = piece.parts[i]!;
    if (Math.abs(nearestTruthLine(piece, p.start) - tp.firstBar) > 1) fails.push(`partie ${i + 1} : début décalé`);
  });
  if (chart) {
    const letters = chart.form.map((f) => f.letters);
    const wantLetters = AUTUMN.form.map((f) => f[1]);
    if (letters.join('|') !== wantLetters.join('|')) fails.push(`lettres de la forme ${letters.join(',')} au lieu de ${wantLetters.join(',')}`);
  } else fails.push('pas de grille simplifiée');
  fails.push(...autumnChartFailures(chart).map((f) => `grille : ${f}`));
  return fails;
}
