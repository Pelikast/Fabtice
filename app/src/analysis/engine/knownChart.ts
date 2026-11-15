// A known chart, found by the title, as a safety net for the chords
// (CLAUDE.md, analysis, means 3): verified against the audio before it is
// trusted, then a prior whose weight grows where the audio is in doubt. The
// chord actually played stays the goal.
//
// 1. Candidates: the charts whose title matches (`findChartCandidates`, on
//    the index of `standards/match.ts`); several charts of one tune (variants
//    of two playlists) are all candidates, the fit chooses.
// 2. Alignment: the chart, as a loop of its form, laid on the beats of the
//    recording. Searched: the transposition (12; the recording is not always
//    in the chart's key), the scale (1 recording beat per chart beat; 2: the
//    beat was found twice as fast, a double-time feel; ½: half as fast) and
//    the offset (any beat of the form: intros of any length, a downbeat the
//    grid put on the wrong beat). Score of an alignment: mean over the beats
//    of log P(the chart's root and family) under the network's distribution
//    (root × family: a chart's maj7 played as a 6 is not a misfit), plus a
//    small prior for the detected key — a prior, not a certainty: it is
//    wrong on a third of the synthetic pieces. The loop costs F² per
//    transposition and scale (F beats in the form), whatever the piece's
//    length (beats are summed by position in the form first).
// 3. Verification: the best alignment must fit clearly better than OTHER
//    TUNES do on the same recording (reference charts spread over the
//    library, each at its own best transposition, scale and offset: the
//    chart's score in their standard deviations, `minNullZ`), stand out from
//    the chart's other alignments (`minZ`), and agree with the network's own
//    best reading on enough beats (`minAgree`). The comparison with other
//    tunes is what tells a chart from a lucky one: any jazz chart finds some
//    alignment that fits a ii-V-I piece a little. Otherwise the chart is
//    rejected: a wrong chart (another tune of the same title, a contrafact, a
//    very free version) is worse than none.
// 4. Evidence: per beat, a distribution centred on the chart's chord (some
//    mass on its other colours and, for a dominant, on its tritone
//    substitute), with a weight = weight × local fit × doubt^doubtPower. The
//    local fit is the chart's agreement with the audio on the bars around
//    (the bar itself left out); intros, codas, tags and choruses played
//    freely get little or no weight. The doubt is 1 − the network's top
//    probability on that beat: where the network is sure, the chart barely
//    moves it, so a reharmonisation the audio supports survives.
//
// Pure (no I/O): the caller reads the playlists and passes the candidates.

import { N_CHORDS, NO_CHORD, QUALS, chordQual, chordRoot, type EngineQuality, type PooledUnit } from './chords';
import { FAMILY_OF, N_FOLDED, barsOf, fold, foldedClass, unitProbs, type EvidenceSource } from './evidence';
import type { KeyEstimate } from './key';
import type { ChordQuality, ChordSymbol, Key } from '../../model/harmony';
import { asAnalysisChord, type StandardChart } from '../../standards/irealRead';
import { findTitle, type TitleIndex } from '../../standards/match';

export interface ChartCandidate {
  chart: StandardChart;
  /** Title match score in [0, 1]. */
  titleScore: number;
}

/** Charts whose title matches (noisy titles welcome), best first; at most `max`. */
export function findChartCandidates(index: TitleIndex<StandardChart>, title: string, max = 6): ChartCandidate[] {
  return findTitle(index, title, { max })
    .filter((m) => m.entry.data)
    .map((m) => ({ chart: m.entry.data!, titleScore: m.score }));
}

export interface ChartOptions {
  /** Recording beats per chart beat tried. */
  scales: number[];
  /** Weight of the detected key's prior in the alignment score (per beat, nats). */
  keyWeight: number;
  /** Accept when the best alignment's z-score among all alignments of the chart is at least this… */
  minZ: number;
  /** …and the chart agrees with the network's top root × family on at least this share of beats. */
  minAgree: number;
  /** …and its score is this many standard deviations above what other tunes (the reference charts) score on the recording. */
  minNullZ: number;
  /** Evidence weight (see `evidence.ts`). */
  weight: number;
  /** Exponent of the doubt (1 − top probability of the network) in the weight. 0: a plain prior. */
  doubtPower: number;
  /** Bars on each side for the local fit (the bar itself left out). */
  window: number;
  /** Local agreement (share of beats) below which the chart gets no weight; full weight from `fitHigh`. */
  fitLow: number;
  fitHigh: number;
  /** Prior distribution: mass on the chart's exact chord, on its other colours (same root and family), on the tritone substitute of a dominant. */
  exact: number;
  colour: number;
  tritone: number;
}

export const CHART_DEFAULTS: ChartOptions = {
  scales: [1, 2, 0.5],
  keyWeight: 0.05,
  minZ: 2,
  minAgree: 0.25,
  minNullZ: 2.5,
  weight: 4,
  doubtPower: 1,
  window: 2,
  fitLow: 0.1,
  fitHigh: 0.35,
  exact: 0.5,
  colour: 0.3,
  tritone: 0.05,
};

/** The chart quality as the engine's (16 → 14). */
const QUALITY_TO_ENGINE: Record<ChordQuality, EngineQuality> = {
  maj: 'maj', min: 'min', aug: 'aug', dim: 'dim', sus2: 'sus2', sus4: 'sus4', '7': '7', maj7: 'maj7', min7: 'min7',
  minmaj7: 'minmaj7', maj6: 'maj6', min6: 'min6', dim7: 'dim7', hdim7: 'hdim7', '7sus4': 'sus4', aug7: 'aug',
};

/** Engine index (0…167) of a chart chord, NO_CHORD for « N.C. ». */
export function engineIndex(c: ChordSymbol | null): number {
  if (!c) return NO_CHORD;
  const a = asAnalysisChord(c);
  return a.root * 14 + QUALS.indexOf(QUALITY_TO_ENGINE[a.quality]);
}

export function transposeIndex(c: number, t: number): number {
  if (c === NO_CHORD) return c;
  return ((chordRoot(c) + t + 120) % 12) * 14 + (c % 14);
}

/** One chorus of the chart, beat by beat (chart beats). */
export interface ChartBeats {
  /** Engine chord sounding on each beat of the form. */
  chord: number[];
  /** Bar of the chart (index into `chart.bars`) of each beat. */
  bar: number[];
  /** Section letter of each beat's bar (the last mark at or before it). */
  section: (string | null)[];
}

/** `n` charts spread evenly over a library (deterministic), for the verification's null; the caller leaves out the candidates' tune. */
export function referenceCharts(library: readonly StandardChart[], n = 60, exclude: (c: StandardChart) => boolean = () => false): StandardChart[] {
  const pool = library.filter((c) => !exclude(c) && c.bars.length >= 8);
  if (pool.length <= n) return pool;
  const out: StandardChart[] = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(((i + 0.5) * pool.length) / n)]!);
  return out;
}

export function chartBeats(chart: StandardChart): ChartBeats {
  const chord: number[] = [];
  const bar: number[] = [];
  const section: (string | null)[] = [];
  let cur: number | null = null;
  let sec: string | null = null;
  chart.bars.forEach((b, i) => {
    if (b.section) sec = b.section;
    for (let k = 0; k < b.meter.numerator; k++) {
      const starts = b.chords.filter((c) => c.beat === k);
      if (starts.length) cur = engineIndex(starts[starts.length - 1]!.chord);
      chord.push(cur ?? -1);
      bar.push(i);
      section.push(sec);
    }
  });
  // beats before the first chord: the form is a loop, they hear its last chord
  const last = cur ?? NO_CHORD;
  for (let k = 0; k < chord.length && chord[k] === -1; k++) chord[k] = last;
  return { chord, bar, section };
}

export interface Alignment {
  candidate: number;
  /** Semitones added to the chart. */
  transpose: number;
  /** Recording beats per chart beat. */
  scale: number;
  /** Recording beat where the form starts (its first beat; the form loops on both sides). */
  offset: number;
  /** Mean log P(chart root × family) per beat, key prior included. */
  score: number;
  /** z-score of this alignment among all alignments of the chart. */
  z: number;
  /** Share of beats where the chart's root × family is the network's top. */
  agree: number;
  /** Score above the reference charts' best scores on this recording, in their standard deviations (0 without references). */
  nullZ: number;
}

export interface BarAlignment {
  /** Bar of the recording (index in the bars of the grid, from its first downbeat). */
  bar: number;
  /** Bar of the chart at the bar's first beat, or null where the chart does not fit here (intro, coda, free chorus). */
  formBar: number | null;
  /** Chorus (0-based) the bar belongs to, counting from the first one that fits. */
  chorus: number | null;
  section: string | null;
  /** Local agreement of the chart around this bar, 0…1. */
  fit: number;
}

export interface ChartFit {
  accepted: boolean;
  /** Why it was rejected (English, for diagnostics). */
  reason: string | null;
  /** Best alignment of every candidate. */
  alignments: Alignment[];
  /** The chosen candidate's alignment (also when rejected). */
  best: Alignment | null;
  chart: StandardChart | null;
  /** The key of the recording according to the chart (chart key + transposition). */
  key: Key | null;
  /** Per recording bar. */
  bars: BarAlignment[];
  /** Per beat: the chart's engine chord (null: none), and its local fit. */
  chordOfBeat: (number | null)[];
  fitOfBeat: number[];
  source: EvidenceSource;
}

/** Chart position (chart beat) of a recording beat. */
function chartPos(b: number, a: Pick<Alignment, 'offset' | 'scale'>, F: number): number {
  const x = Math.floor((b - a.offset) / a.scale);
  return ((x % F) + F) % F;
}

function keyPrior(key: KeyEstimate | null, chartKey: Key | null, t: number): number {
  if (!key || !chartKey || !key.ranked.length) return 0;
  const tonic = (chartKey.tonic + t) % 12;
  const minor = chartKey.mode === 'minor';
  let p = 0;
  for (const k of key.ranked) {
    const same = k.tonic === tonic && k.minor === minor;
    const relative = k.minor !== minor && (minor ? (k.tonic + 9) % 12 === tonic : (tonic + 9) % 12 === k.tonic);
    if (same || relative) p += k.p ?? 0;
  }
  return Math.log(p + 0.02);
}

interface AudioEvidence {
  N: number;
  /** log of the folded (root × family) distribution, per beat. */
  logF: Float64Array[];
  /** The network's top folded class, per beat. */
  top: number[];
}

/** Best alignment of one chart (candidate index 0), or null when the chart is too short or too long for the piece. */
function alignChart(ev: AudioEvidence, cb: ChartBeats, chartKey: Key | null, key: KeyEstimate | null, o: ChartOptions): Alignment | null {
  const { N, logF, top } = ev;
  const F = cb.chord.length;
  if (F < 4) return null;
  let best: Alignment | null = null;
  let sum = 0;
  let sum2 = 0;
  let count = 0;
  for (const scale of o.scales) {
    const P = F * scale;
    if (!Number.isInteger(P) || P < 2 || P > N) continue;
    // beats summed by their position in the period
    const A: Float64Array[] = Array.from({ length: P }, () => new Float64Array(N_FOLDED));
    for (let b = 0; b < N; b++) {
      const row = A[b % P]!;
      const l = logF[b]!;
      for (let k = 0; k < N_FOLDED; k++) row[k]! += l[k]!;
    }
    const xOf = Array.from({ length: P }, (_, d) => Math.floor(d / scale));
    for (let t = 0; t < 12; t++) {
      const kp = o.keyWeight * keyPrior(key, chartKey, t);
      const chartCls = cb.chord.map((c) => foldedClass(transposeIndex(c, t)));
      for (let off = 0; off < P; off++) {
        let s = 0;
        for (let m = 0; m < P; m++) {
          const d = m - off < 0 ? m - off + P : m - off;
          s += A[m]![chartCls[xOf[d]!]!]!;
        }
        const score = s / N + kp;
        sum += score;
        sum2 += score * score;
        count++;
        if (!best || score > best.score) best = { candidate: 0, transpose: t, scale, offset: off, score, z: 0, agree: 0, nullZ: 0 };
      }
    }
  }
  if (!best) return null;
  const mean = sum / count;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / count - mean * mean));
  best.z = (best.score - mean) / sd;
  let agree = 0;
  for (let b = 0; b < N; b++) if (foldedClass(transposeIndex(cb.chord[chartPos(b, best, F)]!, best.transpose)) === top[b]) agree++;
  best.agree = agree / N;
  return best;
}

/** Align, verify and turn into evidence. `numbers`: beat numbers of the grid; `bpb`: its meter (unused by the fit, kept for the alignment output). */
export function fitKnownChart(
  units: readonly PooledUnit[],
  numbers: readonly number[],
  bpb: number,
  key: KeyEstimate | null,
  candidates: readonly ChartCandidate[],
  options: Partial<ChartOptions> = {},
  references: readonly StandardChart[] = [],
): ChartFit {
  void bpb;
  const o = { ...CHART_DEFAULTS, ...options };
  const N = units.length;
  const probs = units.map(unitProbs);
  const folded = probs.map(fold);
  const logF = folded.map((f) => Float64Array.from(f, (v) => Math.log(v + 1e-4)));
  const top = folded.map((f) => {
    let m = 0;
    for (let k = 1; k < N_FOLDED; k++) if (f[k]! > f[m]!) m = k;
    return m;
  });
  const layout = barsOf(numbers);
  const empty: ChartFit = {
    accepted: false,
    reason: 'no candidate',
    alignments: [],
    best: null,
    chart: null,
    key: null,
    bars: layout.bars.map((_, i) => ({ bar: i, formBar: null, chorus: null, section: null, fit: 0 })),
    chordOfBeat: units.map(() => null),
    fitOfBeat: units.map(() => 0),
    source: { name: 'chart', logp: units.map(() => null), weight: units.map(() => 0) },
  };
  if (!N || !candidates.length) return empty;
  const ev: AudioEvidence = { N, logF, top };
  const alignments: Alignment[] = [];
  const beatsOf: ChartBeats[] = [];
  candidates.forEach((cand, ci) => {
    const cb = chartBeats(cand.chart);
    beatsOf.push(cb);
    const al = alignChart(ev, cb, cand.chart.key, key, o);
    if (al) alignments.push({ ...al, candidate: ci });
  });
  // what tunes that are NOT this one score on this recording: the null of the verification
  const nullScores: number[] = [];
  for (const ref of references) {
    const al = alignChart(ev, chartBeats(ref), ref.key, key, o);
    if (al) nullScores.push(al.score);
  }
  if (!alignments.length) return { ...empty, reason: 'charts too short' };
  // the variant that fits best
  const best = alignments.reduce((a, b) => (b.score > a.score ? b : a));
  const cand = candidates[best.candidate]!;
  const cb = beatsOf[best.candidate]!;
  const F = cb.chord.length;
  const chartKey = cand.chart.key ? { tonic: (cand.chart.key.tonic + best.transpose) % 12, mode: cand.chart.key.mode } : null;
  const chordOfBeat: (number | null)[] = [];
  const agreeOfBeat: number[] = [];
  for (let b = 0; b < N; b++) {
    const c = transposeIndex(cb.chord[chartPos(b, best, F)]!, best.transpose);
    chordOfBeat.push(c);
    agreeOfBeat.push(foldedClass(c) === top[b] ? 1 : 0);
  }
  // local fit per bar (beats of the neighbouring bars, the bar itself left out)
  const nb = layout.bars.length;
  const barAgree = layout.bars.map((bs) => bs.reduce((s, b) => s + agreeOfBeat[b]!, 0) / (bs.length || 1));
  const localFit = layout.bars.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let d = -o.window; d <= o.window; d++) {
      if (d === 0 || i + d < 0 || i + d >= nb) continue;
      s += barAgree[i + d]!;
      n++;
    }
    return n ? s / n : 0;
  });
  const fitOfBeat = units.map((_, b) => {
    const bar = layout.barOfBeat[b]!;
    return bar < 0 ? (localFit[0] ?? 0) : localFit[bar]!;
  });
  if (nullScores.length >= 2) {
    const m = nullScores.reduce((x, y) => x + y, 0) / nullScores.length;
    const sd = Math.sqrt(nullScores.reduce((x, y) => x + (y - m) ** 2, 0) / nullScores.length) || 1e-6;
    for (const a of alignments) a.nullZ = (a.score - m) / sd;
  }
  const accepted = best.z >= o.minZ && best.agree >= o.minAgree && (nullScores.length < 2 || best.nullZ >= o.minNullZ);
  const reason = accepted
    ? null
    : best.z < o.minZ
      ? `alignment not distinct (z ${best.z.toFixed(2)})`
      : best.agree < o.minAgree
        ? `too little agreement (${(100 * best.agree).toFixed(0)} %)`
        : `no better than other tunes (z ${best.nullZ.toFixed(2)} against them)`;
  // bars of the recording in the form
  let firstChorusBeat = -1;
  const bars: BarAlignment[] = layout.bars.map((bs, i) => {
    const b0 = bs[0]!;
    const fits = localFit[i]! >= o.fitLow;
    if (fits && firstChorusBeat < 0) firstChorusBeat = b0 - chartPos(b0, best, F) * best.scale;
    const pos = chartPos(b0, best, F);
    return {
      bar: i,
      formBar: fits ? cb.bar[pos]! : null,
      chorus: fits && firstChorusBeat >= 0 ? Math.floor((b0 - firstChorusBeat) / (F * best.scale)) : null,
      section: fits ? cb.section[pos]! : null,
      fit: localFit[i]!,
    };
  });
  // the evidence
  const logp: (Float64Array | null)[] = units.map(() => null);
  const weight = units.map(() => 0);
  if (accepted) {
    const cache = new Map<number, Float64Array>();
    for (let b = 0; b < N; b++) {
      const c = chordOfBeat[b]!;
      if (c === NO_CHORD) continue;
      const ramp = Math.max(0, Math.min(1, (fitOfBeat[b]! - o.fitLow) / (o.fitHigh - o.fitLow)));
      if (ramp <= 0) continue;
      let pmax = 0;
      for (let k = 0; k < N_CHORDS; k++) if (probs[b]![k]! > pmax) pmax = probs[b]![k]!;
      const w = o.weight * ramp * Math.pow(1 - pmax, o.doubtPower);
      if (!(w > 0)) continue;
      let l = cache.get(c);
      if (!l) {
        l = priorAround(c, o);
        cache.set(c, l);
      }
      logp[b] = l;
      weight[b] = w;
    }
  }
  return {
    accepted,
    reason,
    alignments,
    best,
    chart: cand.chart,
    key: chartKey,
    bars,
    chordOfBeat,
    fitOfBeat,
    source: { name: 'chart', logp, weight },
  };
}

/** Log of the prior distribution around a chart chord. */
export function priorAround(c: number, o: Pick<ChartOptions, 'exact' | 'colour' | 'tritone'>): Float64Array {
  const p = new Float64Array(N_CHORDS);
  const r = chordRoot(c);
  const q = chordQual(c)!;
  const fam = FAMILY_OF[q];
  const sameFamily: number[] = [];
  for (let k = 0; k < 14; k++) if (k !== c % 14 && FAMILY_OF[QUALS[k]!] === fam) sameFamily.push(r * 14 + k);
  let used = o.exact;
  p[c] = o.exact;
  for (const k of sameFamily) p[k]! += o.colour / sameFamily.length;
  used += sameFamily.length ? o.colour : 0;
  if (q === '7') {
    p[((r + 6) % 12) * 14 + QUALS.indexOf('7')]! += o.tritone;
    used += o.tritone;
  }
  const rest = Math.max(1e-3, 1 - used) / N_CHORDS;
  for (let k = 0; k < N_CHORDS; k++) p[k] = Math.log(p[k]! + rest);
  return p;
}
