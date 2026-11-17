// The parts of the piece over the timeline (v1/CAHIER.md, C14): Intro,
// Thème, Solo…, Outro in Jazz mode; Intro, Couplet, Refrain, Pont, Solo,
// Outro in Pop mode. No model: who plays where comes from the separated
// tracks (or the timbre of the mix), what is played from the form.
//
// Who leads (`leadPerBar`): each separated track is measured against its
// own usual level (a comping piano at its comping level, a horn at the level
// it plays when it plays) and against the band at that bar; the track that
// stands out leads. Accompaniment tracks always play: bass and drums lead
// only when they clearly stand out (a bass solo, a drum solo). The lead is
// then cut into stretches by a dynamic programme that changes lead only on
// the grid of the form (chorus starts cheap, section starts dearer, the
// 4-bar grid dearer still: trading fours; anywhere else very dear).
// Without separation, the same cut is made on the timbre of the mix
// (« Solo 1, Solo 2 », never an instrument name); without audio, nothing is
// cut.
//
// Jazz (`jazzParts`): the theme is played first and last by the same lead.
// Without melody evidence, the opening theme is one chorus (two for a blues
// or a form of 12 bars or less, whose head is usually played twice) unless
// its lead stops earlier; the closing theme is the last stretch of that same
// lead reaching the end of the form, at most as long as the opening one.
// What lies between is solos, one per stretch: a « Solo 2 » next to a
// « Solo 1 » is another instrument, else it is one long solo. Defaults
// without audio, said plainly: three choruses or more → Thème 1, Solo,
// Thème 2; two → Thème 1, Thème 2; one → Thème.
//
// Pop (`popParts`): the first letter is the verse, the most frequent other
// letter the chorus, the rest bridges; a section led by an instrument other
// than the voice (separated tracks only) is a solo. Two verses in a row are
// two verses, two choruses in a row one long chorus (« Refrain 3 »).
//
// Pure; O(bars × leads²).

import { PART_INSTRUMENT_PATTERN, WINDS_UNSURE, type PartInstrument, type PartType, type StructureMode } from '../model/structure';
import type { StemId } from '../model/separation';
import type { Layout } from './form';
import { median } from './grid';
import type { InstrumentGuess, StructureEvidence } from './types';

/** A part in bars (index into the input bars), before it becomes times. */
export interface BarPart {
  type: PartType;
  number: number | null;
  instrument: PartInstrument | null;
  first: number;
  end: number;
}

/** Who can lead a stretch: a separated track, a timbre cluster (`t0`, `t1`… without separation), or nobody. */
export type Lead = StemId | `t${number}` | 'none';

/** The tracks that can lead, and the instrument each one names. */
const LEAD_STEMS: readonly StemId[] = ['vocals', 'other', 'piano', 'guitar', 'bass', 'drums', 'winds', 'saxophone', 'brass'];
const STEM_INSTRUMENT: Partial<Record<StemId, PartInstrument>> = {
  vocals: 'voice', piano: 'piano', guitar: 'guitar', bass: 'bass', drums: 'drums', saxophone: 'saxophone', brass: WINDS_UNSURE,
};
/** Tracks that do not comp (a voice): when they play, they lead. Horns may play backgrounds: they are judged by their level. */
const MELODIC_STEMS = new Set<StemId>(['vocals']);
/** Accompaniment tracks: they lead only when they clearly stand out. */
const RHYTHM_STEMS = new Set<StemId>(['bass', 'drums']);

// ---------------------------------------------------------------- who leads

export interface LeadReading {
  labels: Lead[];
  /** Per bar, per label: −log of how likely that label leads. */
  cost: Float64Array[];
}

const LEAD_FLOOR = 0.35;
const LEAD_SHARPNESS = 4;

/** Who leads each bar, from the separated tracks' levels (see the header). Null without separated tracks. */
export function leadFromStems(stems: Partial<Record<StemId, Float32Array>>, n: number): LeadReading | null {
  const ids = LEAD_STEMS.filter((s) => stems[s] && stems[s]!.length === n);
  if (!ids.length) return null;
  const eps = 1e-5;
  // levels per bar
  const lv = new Map<StemId, Float64Array>();
  for (const s of ids) {
    const v = stems[s]!;
    lv.set(s, Float64Array.from(v));
  }
  const ref = new Map<StemId, number>();
  const intermittent = new Set<StemId>();
  let loudest = 0;
  for (const s of ids) {
    const sorted = Array.from(lv.get(s)!).sort((a, b) => a - b);
    // its playing level: from its loud bars (a guitar may play only its eight-bar solo: the tenth loudest bar is then too low)
    const q90 = sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 0;
    const q98 = sorted[Math.floor(0.98 * (sorted.length - 1))] ?? 0;
    const loud = Math.min(q98, Math.max(2 * q90, 0.5 * q98));
    loudest = Math.max(loudest, q90);
    const active = sorted.filter((x) => x > 0.3 * loud);
    const r = Math.max(eps, median(active.length ? active : sorted));
    // a track silent much of the time (a voice, a horn) leads when it plays; one always there (a comping piano) when it stands out
    if (MELODIC_STEMS.has(s) || (!RHYTHM_STEMS.has(s) && sorted.filter((x) => x > 0.25 * r).length < INTERMITTENT * n)) {
      intermittent.add(s);
      ref.set(s, r);
    } else {
      // its usual level is its comping level: a low quantile (its solo may last half the piece)
      const base = active.length ? active : sorted;
      ref.set(s, Math.max(eps, base[Math.floor(0.25 * (base.length - 1))]!));
    }
  }
  const silent = 0.02 * loudest;
  // a track that never rises above what leaks into it from the others is not played at all
  const loudestRef = Math.max(...ids.map((s) => ref.get(s)!));
  const leakOnly = new Set(ids.filter((s) => ref.get(s)! < LEAK_ONLY * loudestRef));
  const labels: Lead[] = [...ids, 'none'];
  const cost: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const present = ids.map((s) => lv.get(s)![i]!).filter((x) => x > silent);
    const band = Math.max(eps, present.length ? median(present) : silent);
    const scores = ids.map((s) => {
      const l = lv.get(s)![i]! + eps;
      if (l <= silent || leakOnly.has(s)) return -3;
      const own = Math.log(l / ref.get(s)!);
      if (intermittent.has(s)) {
        const r = ref.get(s)!;
        if (l > 0.25 * r) return PRESENT_LEAD + 0.5 * Math.min(0, own);
        // a breath between two phrases: the lead goes on, a little less sure
        const near = Math.max(lv.get(s)![i - 1] ?? 0, lv.get(s)![i + 1] ?? 0);
        return near > 0.25 * r ? PRESENT_LEAD - 0.5 : -2;
      }
      const sc = own + Math.log(l / band);
      // bass and drums always play: they lead only well above their usual level, the band stepping back (a fill is not a solo)
      if (RHYTHM_STEMS.has(s)) {
        const others = ids.filter((x) => x !== s && !intermittent.has(x) && ref.get(x)! > silent).map((x) => lv.get(x)![i]! / ref.get(x)!);
        const bandBack = others.length === 0 || median(others) < 0.75;
        return own >= 0.4 && bandBack ? sc - 0.3 : Math.min(sc, LEAD_FLOOR - 0.5);
      }
      return sc;
    });
    scores.push(LEAD_FLOOR);
    const m = Math.max(...scores);
    let z = 0;
    for (const x of scores) z += Math.exp(LEAD_SHARPNESS * (x - m));
    cost.push(Float64Array.from(scores, (x) => -(LEAD_SHARPNESS * (x - m)) + Math.log(z)));
  }
  return { labels, cost };
}

/** A track whose usual level stays under this share of the loudest track's is only what leaks into it. */
const LEAK_ONLY = 0.2;
/** A track heard in fewer bars than this share is « intermittent » (it plays when it leads). */
const INTERMITTENT = 0.8;
/** The score of an intermittent track that plays: above a comping track at its usual level, below one that clearly stands out. */
const PRESENT_LEAD = 1.3;

/**
 * Who leads each bar without separation: the timbre of the mix cut into
 * stretches where it stays alike. Labels are anonymous (`t0`, `t1`…); two
 * stretches of alike timbre get the same label.
 */
export function leadFromTimbre(timbre: { bands: number; data: Float32Array }, n: number, grid: Int8Array): LeadReading | null {
  const B = timbre.bands;
  if (!B || timbre.data.length < n * B || n < 8) return null;
  // shape (bands minus the bar's mean) and level, each band centred on the piece's median
  const dims = B + 1;
  const feat = new Float64Array(n * dims);
  for (let i = 0; i < n; i++) {
    let mean = 0;
    for (let b = 0; b < B; b++) mean += timbre.data[i * B + b]!;
    mean /= B;
    for (let b = 0; b < B; b++) feat[i * dims + b] = timbre.data[i * B + b]! - mean;
    feat[i * dims + B] = mean * 0.5;
  }
  for (let d = 0; d < dims; d++) {
    const col = Array.from({ length: n }, (_, i) => feat[i * dims + d]!);
    const m = median(col);
    for (let i = 0; i < n; i++) feat[i * dims + d] = feat[i * dims + d]! - m;
  }
  // blocks between grid points of strength ≥ 2 (sections), their means and the spread inside them
  const starts: number[] = [];
  for (let i = 0; i < n; i++) if (i === 0 || grid[i]! >= 2) starts.push(i);
  const blocks = starts.map((s, k) => ({ first: s, end: starts[k + 1] ?? n }));
  const mean = (a: number, b: number) => {
    const out = new Float64Array(dims);
    for (let i = a; i < b; i++) for (let d = 0; d < dims; d++) out[d] = out[d]! + feat[i * dims + d]! / (b - a);
    return out;
  };
  let spread = 0;
  let cnt = 0;
  for (const bl of blocks) {
    const m = mean(bl.first, bl.end);
    for (let i = bl.first; i < bl.end; i++) for (let d = 0; d < dims; d++) {
      spread += (feat[i * dims + d]! - m[d]!) ** 2;
      cnt++;
    }
  }
  const sigma = Math.max(0.05, Math.sqrt(spread / Math.max(1, cnt)));
  const dist = (x: Float64Array, y: Float64Array) => {
    let s = 0;
    for (let d = 0; d < dims; d++) s += (x[d]! - y[d]!) ** 2;
    return Math.sqrt(s / dims) / sigma;
  };
  // consecutive blocks of alike timbre merge into stretches
  const means = blocks.map((b) => mean(b.first, b.end));
  const stretches: { first: number; end: number; m: Float64Array; w: number }[] = [];
  blocks.forEach((b, k) => {
    const last = stretches[stretches.length - 1];
    const len = b.end - b.first;
    if (last) {
      const z = dist(last.m, means[k]!) * Math.sqrt((len * last.w) / (len + last.w));
      if (z < TIMBRE_CHANGE) {
        const w = last.w + len;
        for (let d = 0; d < dims; d++) last.m[d] = (last.m[d]! * last.w + means[k]![d]! * len) / w;
        last.w = w;
        last.end = b.end;
        return;
      }
    }
    stretches.push({ first: b.first, end: b.end, m: Float64Array.from(means[k]!), w: len });
  });
  // alike stretches share a label
  const reps: Float64Array[] = [];
  const labelOf = stretches.map((s) => {
    let best = -1;
    let bd = TIMBRE_SAME;
    reps.forEach((r, k) => {
      const d = dist(r, s.m);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    if (best >= 0) return best;
    reps.push(s.m);
    return reps.length - 1;
  });
  const labels: Lead[] = reps.map((_, k) => `t${k}` as Lead);
  const cost: Float64Array[] = [];
  stretches.forEach((s, k) => {
    for (let i = s.first; i < s.end; i++) {
      const c = new Float64Array(labels.length).fill(3);
      c[labelOf[k]!] = 0;
      cost.push(c);
    }
  });
  return { labels, cost };
}

/** Two consecutive blocks change timbre from this many deviations of the mean on. */
const TIMBRE_CHANGE = 5;
/** Two stretches are the same timbre (the same soloist) under this distance (in bar deviations). */
const TIMBRE_SAME = 0.8;

/**
 * Strength of a bar line as a place where the lead may change: 3 chorus
 * start, 2 section start, 1 the 4-bar grid inside a section, 0 elsewhere.
 */
export function gridStrength(layout: Layout | null, n: number): Int8Array {
  const g = new Int8Array(n);
  if (!layout) {
    for (let i = 0; i < n; i += 4) g[i] = i % 8 === 0 ? 2 : 1;
    return g;
  }
  for (const s of layout.sections) {
    for (let i = s.first; i < s.end; i += 4) g[i] = Math.max(g[i]!, 1);
    g[s.first] = Math.max(g[s.first]!, 2);
  }
  for (const c of layout.choruses) g[c.first] = 3;
  if (layout.introEnd < n) g[layout.introEnd] = 3;
  if (layout.outroStart < n) g[layout.outroStart] = 3;
  return g;
}

const SWITCH_COST = [9, 3.5, 2, 1];

/** Stretches of one lead (Viterbi over bars, changes priced by `gridStrength`). */
export function leadStretches(reading: LeadReading, grid: Int8Array, from: number, to: number): { first: number; end: number; lead: Lead }[] {
  const K = reading.labels.length;
  const len = to - from;
  if (len <= 0) return [];
  const D = new Float64Array(len * K);
  const back = new Int16Array(len * K);
  for (let k = 0; k < K; k++) D[k] = reading.cost[from]![k]!;
  for (let i = 1; i < len; i++) {
    const sw = SWITCH_COST[grid[from + i]!]!;
    let bestPrev = 0;
    for (let k = 1; k < K; k++) if (D[(i - 1) * K + k]! < D[(i - 1) * K + bestPrev]!) bestPrev = k;
    for (let k = 0; k < K; k++) {
      const stay = D[(i - 1) * K + k]!;
      const move = D[(i - 1) * K + bestPrev]! + sw;
      const c = reading.cost[from + i]![k]!;
      if (stay <= move) {
        D[i * K + k] = stay + c;
        back[i * K + k] = k;
      } else {
        D[i * K + k] = move + c;
        back[i * K + k] = bestPrev;
      }
    }
  }
  let k = 0;
  for (let x = 1; x < K; x++) if (D[(len - 1) * K + x]! < D[(len - 1) * K + k]!) k = x;
  const path = new Int16Array(len);
  for (let i = len - 1; i >= 0; i--) {
    path[i] = k;
    k = back[i * K + k]!;
  }
  const out: { first: number; end: number; lead: Lead }[] = [];
  for (let i = 0; i < len; i++) {
    const lead = reading.labels[path[i]!]!;
    const last = out[out.length - 1];
    if (last && last.lead === lead) last.end = from + i + 1;
    else out.push({ first: from + i, end: from + i + 1, lead });
  }
  return out;
}

// ---------------------------------------------------------------- the wind instruments

/** The instrument the recogniser hears over bars [first, end) of the « Autres » track; `winds` when unsure, null when not run. */
export function windsInstrument(winds: readonly (InstrumentGuess | null)[] | null, first: number, end: number): PartInstrument | null {
  if (!winds) return WINDS_UNSURE;
  const votes = new Map<string, number>();
  let total = 0;
  for (let i = first; i < end; i++) {
    const g = winds[i];
    if (!g) continue;
    total++;
    if (g.instrument === WINDS_UNSURE || g.confidence < WINDS_CONFIDENCE || !PART_INSTRUMENT_PATTERN.test(g.instrument)) continue;
    votes.set(g.instrument, (votes.get(g.instrument) ?? 0) + g.confidence);
  }
  if (!total) return WINDS_UNSURE;
  let best: string | null = null;
  let bw = 0;
  for (const [k, w] of votes) if (w > bw) {
    best = k;
    bw = w;
  }
  // a name only when most readings say it, confidently (a wrong name is the costly error)
  const count = best ? Array.from({ length: end - first }, (_, j) => winds[first + j]).filter((g) => g && g.instrument === best && g.confidence >= WINDS_CONFIDENCE).length : 0;
  return best && count >= WINDS_MAJORITY * total ? best : WINDS_UNSURE;
}

const WINDS_CONFIDENCE = 0.5;
const WINDS_MAJORITY = 0.6;

/** Splits an « Autres » stretch where the recogniser hears two different wind instruments, chorus by chorus (or section by section). */
function splitWinds(
  s: { first: number; end: number; lead: Lead },
  winds: readonly (InstrumentGuess | null)[] | null,
  grid: Int8Array,
  level: Float32Array | undefined,
): { first: number; end: number; lead: Lead; instrument?: PartInstrument }[] {
  if (s.lead !== 'other') return [s];
  // units: the stretch cut at chorus starts, or at section starts when it is shorter than two choruses
  const cuts = [s.first];
  for (let i = s.first + 1; i < s.end; i++) if (grid[i]! >= 3) cuts.push(i);
  if (cuts.length < 2) for (let i = s.first + 1; i < s.end; i++) if (grid[i]! >= 2 && i - cuts[cuts.length - 1]! >= 8) cuts.push(i);
  const units = cuts.map((c, k) => ({ first: c, end: cuts[k + 1] ?? s.end }));
  const named = units.map((u) => ({ ...u, instrument: winds ? windsInstrument(winds, u.first, u.end) : WINDS_UNSURE }));
  const meanLog = (first: number, end: number) => {
    if (!level) return 0;
    let sum = 0;
    for (let i = first; i < end; i++) sum += Math.log(1e-5 + level[i]!);
    return sum / Math.max(1, end - first);
  };
  const out: { first: number; end: number; lead: Lead; instrument?: PartInstrument }[] = [];
  for (const u of named) {
    const last = out[out.length - 1];
    if (last) {
      // another wind player: the recogniser names two different instruments confidently, or (when it
      // cannot tell) the track's level jumps from one chorus to the next (two horns do not sound alike)
      const names = last.instrument !== WINDS_UNSURE && u.instrument !== WINDS_UNSURE;
      const other = names ? last.instrument !== u.instrument : Math.abs(meanLog(u.first, u.end) - meanLog(Math.max(last.first, u.first - (u.end - u.first)), u.first)) > LEVEL_JUMP;
      if (!other) {
        last.end = u.end;
        continue;
      }
    }
    out.push({ first: u.first, end: u.end, lead: 'other', instrument: u.instrument ?? WINDS_UNSURE });
  }
  // the name of each player: what the recogniser says over all of it
  for (const o of out) o.instrument = winds ? (windsInstrument(winds, o.first, o.end) ?? WINDS_UNSURE) : WINDS_UNSURE;
  return out;
}

/** A change of level of the « Autres » track (natural log) from one chorus to the next that means another player. */
const LEVEL_JUMP = 0.35;

/** The instrument a stretch names (null: not known, e.g. without separation). */
function instrumentOf(lead: Lead, named: PartInstrument | undefined, winds: readonly (InstrumentGuess | null)[] | null, first: number, end: number): PartInstrument | null {
  if (lead === 'none' || lead.startsWith('t')) return null;
  if (named) return named;
  if (lead === 'other' || lead === 'winds') return windsInstrument(winds, first, end);
  return STEM_INSTRUMENT[lead as StemId] ?? null;
}

// ---------------------------------------------------------------- jazz

export interface PartsInput {
  n: number;
  layout: Layout | null;
  evidence: StructureEvidence | null;
  /** First and end of the bars that hold chords (no part over leading or trailing silence). */
  chordsFirst: number;
  chordsEnd: number;
}

interface Stretch {
  first: number;
  end: number;
  lead: Lead;
  instrument: PartInstrument | null;
}

/** The lead stretches over the form, merged and named. */
function formStretches(input: PartsInput, from: number, to: number): { stretches: Stretch[]; named: boolean } | null {
  const ev = input.evidence;
  if (!ev) return null;
  const grid = gridStrength(input.layout, input.n);
  const stems = ev.stems ? leadFromStems(ev.stems, input.n) : null;
  const reading = stems ?? (ev.timbre ? leadFromTimbre(ev.timbre, input.n, grid) : null);
  if (!reading) return null;
  let raw = leadStretches(reading, grid, from, to);
  // a short stretch without a lead joins the one before (a fill, a break)
  raw = raw.reduce<typeof raw>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && (s.lead === 'none' && s.end - s.first < 8)) last.end = s.end;
    else if (last && last.lead === s.lead) last.end = s.end;
    else acc.push({ ...s });
    return acc;
  }, []);
  const out: Stretch[] = [];
  for (const s of raw) {
    for (const p of stems ? splitWinds(s, ev.winds, grid, ev.stems?.other) : [s]) {
      const instrument = stems ? instrumentOf(p.lead, (p as { instrument?: PartInstrument }).instrument, ev.winds, p.first, p.end) : null;
      out.push({ first: p.first, end: p.end, lead: p.lead, instrument });
    }
  }
  return { stretches: out, named: !!stems };
}

/** The same soloist as far as we can tell: the same name, or « Vents » against a wind name (the recogniser was unsure once). */
function sameSoloist(a: PartInstrument | null, b: PartInstrument | null): boolean {
  return a === b || ((a === WINDS_UNSURE || b === WINDS_UNSURE) && a !== null && b !== null && WIND_NAMES.has(a) && WIND_NAMES.has(b));
}

const WIND_NAMES = new Set<PartInstrument>([WINDS_UNSURE, 'trumpet', 'saxophone', 'trombone', 'clarinet', 'flute', 'vibraphone', 'violin', 'organ']);

/** Solo numbers: none when every soloist is named and plays once; else 1, 2, 3… */
function numberSolos(parts: BarPart[]): void {
  const solos = parts.filter((p) => p.type === 'solo');
  const names = solos.map((p) => p.instrument);
  const distinct = names.every((x) => x !== null) && new Set(names).size === names.length;
  solos.forEach((p, i) => {
    p.number = distinct ? null : i + 1;
  });
}

/** Intro and outro of the layout (bars with chords only). */
function edges(input: PartsInput, l: Layout): { intro: BarPart | null; outro: BarPart | null } {
  const intro = l.introEnd > input.chordsFirst ? { type: 'intro' as const, number: null, instrument: null, first: input.chordsFirst, end: l.introEnd } : null;
  const outro = l.outroStart < input.chordsEnd ? { type: 'outro' as const, number: null, instrument: null, first: l.outroStart, end: input.chordsEnd } : null;
  return { intro, outro };
}

/** A slot with no clear pitch (`evidence.ts#MELODY_NONE`). */
const NO_PITCH = 255;

/**
 * How much each played section's melody (on `lead`'s separated track)
 * recurs: the best agreement, slot by slot, with another occurrence of the
 * same letter (another chorus, or the same chorus: A1 and A2 of a theme).
 * A theme scores high, a solo near chance. NaN where too little sounds.
 */
export function melodyRecurrence(input: PartsInput, lead: Lead): Float64Array | null {
  const l = input.layout;
  const mel = input.evidence?.melody;
  const track = mel?.stems[lead as StemId];
  if (!l || !mel || !track || !l.sections.length) return null;
  const S = mel.slots;
  const secs = l.sections;
  const transpose = (s: (typeof secs)[number]) => (s.chorus >= 0 ? l.choruses[s.chorus]?.transpose ?? 0 : 0);
  const out = new Float64Array(secs.length).fill(NaN);
  secs.forEach((a, ia) => {
    let best = NaN;
    secs.forEach((b, ib) => {
      if (ib === ia || b.letter !== a.letter) return;
      const len = Math.min(a.end - a.first, b.end - b.first);
      const shift = transpose(b) - transpose(a);
      // a beat early or late tolerated (the grid of the analysis is not exact), at a small cost
      for (let d = -MELODY_DRIFT; d <= MELODY_DRIFT; d++) {
        let same = 0;
        let both = 0;
        for (let k = 0; k < len * S; k++) {
          const x = track[a.first * S + k];
          const y = track[b.first * S + k + d];
          if (x === undefined || y === undefined || x === NO_PITCH || y === NO_PITCH) continue;
          both++;
          if ((x - y + shift + 120) % 12 === 0) same++;
        }
        if (both < 0.25 * len * S) continue;
        const v = same / both - 0.02 * Math.abs(d);
        if (!(v <= best)) best = v;
      }
    });
    out[ia] = best;
  });
  return out;
}

/** Slots of drift tried when comparing two melodies (2 slots: a beat of a 4/4 bar). */
const MELODY_DRIFT = 2;

/** A chorus whose sections' melody recurs this well on average is the theme (a solo over the same chords: about 0.15). */
const THEME_RECURRENCE = 0.35;

/**
 * The stretches the « Autres » track leads, cut at chorus starts: where the
 * wind recogniser should listen (`evidence.ts#windsExcerpts`).
 */
export function windsStretches(input: PartsInput): { first: number; end: number; lead: StemId }[] {
  const l = input.layout;
  const from = l ? l.introEnd : 0;
  const to = l ? l.outroStart : input.n;
  const found = input.evidence?.stems ? formStretches({ ...input, evidence: { ...input.evidence, winds: null } }, from, to) : null;
  if (!found) return [];
  const grid = gridStrength(l, input.n);
  const out: { first: number; end: number; lead: StemId }[] = [];
  for (const s of found.stretches) {
    // the saxophone part of a detailed separation names itself: no need to ask
    if (s.lead !== 'other' && s.lead !== 'winds' && s.lead !== 'brass') continue;
    const lead = s.lead;
    let first = s.first;
    for (let i = s.first + 1; i <= s.end; i++) {
      if (i === s.end || grid[i]! >= 3) {
        if (i - first >= 2) out.push({ first, end: i, lead });
        first = i;
      }
    }
  }
  return out;
}

/** Jazz parts (see the header). */
export function jazzParts(input: PartsInput): BarPart[] {
  const l = input.layout;
  if (!l) {
    if (input.chordsEnd - input.chordsFirst < 8) return [];
    return [{ type: 'theme', number: null, instrument: null, first: input.chordsFirst, end: input.chordsEnd }];
  }
  const { intro, outro } = edges(input, l);
  const formFirst = l.introEnd;
  const formEnd = l.outroStart;
  const parts: BarPart[] = [];
  if (intro) parts.push(intro);
  const choruses = l.choruses.length ? l.choruses.map((c) => ({ first: c.first, end: c.end })) : [{ first: formFirst, end: formEnd }];
  const chorusLen = l.chorusLength ?? formEnd - formFirst;
  const headChoruses = chorusLen <= 12 && choruses.length >= 4 ? 2 : 1;
  const found = formStretches(input, formFirst, formEnd);
  if (!found || !found.stretches.length) {
    // no audio: say little
    const k = choruses.length;
    if (k >= 3) {
      const h = Math.min(headChoruses, Math.floor((k - 1) / 2));
      const headEnd = choruses[h - 1]!.end;
      const lastStart = choruses[k - 1]!.first;
      parts.push({ type: 'theme', number: 1, instrument: null, first: formFirst, end: headEnd });
      parts.push({ type: 'solo', number: null, instrument: null, first: headEnd, end: lastStart });
      parts.push({ type: 'theme', number: 2, instrument: null, first: lastStart, end: formEnd });
    } else if (k === 2) {
      parts.push({ type: 'theme', number: 1, instrument: null, first: formFirst, end: choruses[0]!.end });
      parts.push({ type: 'theme', number: 2, instrument: null, first: choruses[1]!.first, end: formEnd });
    } else parts.push({ type: 'theme', number: null, instrument: null, first: formFirst, end: formEnd });
    if (outro) parts.push(outro);
    return parts;
  }
  const st = found.stretches;
  const head = st[0]!;
  const last = st[st.length - 1]!;
  // with the melody of the separated tracks: the theme is where the head's melody recurs
  const rec = head.lead !== 'none' ? melodyRecurrence(input, head.lead) : null;
  const recOf = (i: number) => rec?.[i] ?? NaN;
  const secs = l.sections;
  let themeEnd: number;
  let closingFirst: number | null = null;
  const melodic = rec !== null && secs.some((x, i) => x.first < head.end && !Number.isNaN(recOf(i)));
  if (melodic) {
    // opening theme: the choruses of the head lead whose sections recur (on average)
    const chorusRec = (ci: number) => {
      const v = secs.map((x, i) => (x.chorus === ci ? recOf(i) : NaN)).filter((x) => !Number.isNaN(x));
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    };
    let k = 0;
    while (k < choruses.length && choruses[k]!.end <= head.end + 1 && chorusRec(k) >= THEME_RECURRENCE) k++;
    themeEnd = k > 0 ? Math.min(head.end, choruses[k - 1]!.end) : Math.min(head.end, choruses[Math.min(choruses.length, headChoruses) - 1]!.end);
    // closing theme: as without the melody (an out-head is often shortened or varied: its melody is not asked to recur)
    if (st.length > 1 && last.lead === head.lead && sameSoloist(last.instrument, head.instrument) && last.end >= formEnd - 1) {
      const first = Math.max(last.first, formEnd - (themeEnd - formFirst), themeEnd);
      if (formEnd - first >= 4) closingFirst = first;
    }
  } else {
    // opening theme: the first lead, for one chorus (two for a short form) unless it stops earlier
    themeEnd = Math.min(head.end, choruses[Math.min(choruses.length, headChoruses) - 1]!.end);
    // closing theme: the last stretch of the same lead that reaches the end of the form, at most as long
    if (st.length > 1 && head.lead !== 'none' && last.lead === head.lead && sameSoloist(last.instrument, head.instrument) && last.end >= formEnd - 1) {
      const first = Math.max(last.first, formEnd - (themeEnd - formFirst), themeEnd);
      if (formEnd - first >= 4) closingFirst = first;
    }
  }
  const closing = closingFirst !== null ? { first: closingFirst, end: formEnd } : null;
  const themes = closing ? 2 : 1;
  // the name of the theme's lead: the surer of its two readings
  const themeName = closing && head.instrument === WINDS_UNSURE ? last.instrument : head.instrument;
  parts.push({ type: 'theme', number: themes === 2 ? 1 : null, instrument: themeName, first: formFirst, end: themeEnd });
  const soloTo = closing ? closing.first : formEnd;
  for (const s of st) {
    const first = Math.max(s.first, themeEnd);
    const end = Math.min(s.end, soloTo);
    if (end - first < 1) continue;
    const prev = parts[parts.length - 1]!;
    // a lead without a name next to a solo, or the same name, continues it
    if (prev.type === 'solo' && (prev.instrument === s.instrument && prev.instrument !== null) && prev.end === first) {
      prev.end = end;
      continue;
    }
    parts.push({ type: 'solo', number: null, instrument: s.instrument, first, end });
  }
  if (closing) parts.push({ type: 'theme', number: 2, instrument: themeName, first: closing.first, end: closing.end });
  numberSolos(parts);
  if (outro) parts.push(outro);
  return parts;
}

// ---------------------------------------------------------------- pop

/** Pop parts (see the header). */
export function popParts(input: PartsInput): BarPart[] {
  const l = input.layout;
  if (!l || !l.sections.length) return [];
  const { intro, outro } = edges(input, l);
  const parts: BarPart[] = [];
  if (intro) parts.push(intro);
  const secs = l.sections;
  const count = new Map<string, number>();
  for (const s of secs) count.set(s.letter, (count.get(s.letter) ?? 0) + 1);
  const verse = secs[0]!.letter;
  let chorus: string | null = null;
  for (const s of secs) {
    if (s.letter === verse) continue;
    if (chorus === null || count.get(s.letter)! > count.get(chorus)!) chorus = s.letter;
  }
  // who leads each section (separated tracks only)
  const ev = input.evidence;
  const reading = ev?.stems ? leadFromStems(ev.stems, input.n) : null;
  const leadOf = (first: number, end: number): Lead => {
    if (!reading) return 'none';
    const tot = new Float64Array(reading.labels.length);
    for (let i = first; i < end; i++) for (let k = 0; k < tot.length; k++) tot[k] = tot[k]! + reading.cost[i]![k]!;
    let best = 0;
    for (let k = 1; k < tot.length; k++) if (tot[k]! < tot[best]!) best = k;
    return reading.labels[best]!;
  };
  const voiceLed = reading ? secs.some((s) => leadOf(s.first, s.end) === 'vocals') : false;
  let prevEnd = l.introEnd;
  for (const s of secs) {
    const lead = leadOf(s.first, s.end);
    const instrument = reading ? instrumentOf(lead, undefined, ev?.winds ?? null, s.first, s.end) : null;
    let type: PartType = s.letter === verse ? 'verse' : s.letter === chorus ? 'chorus' : 'bridge';
    // an instrument leads where the voice usually does: a solo
    if (voiceLed && lead !== 'vocals' && lead !== 'none') type = 'solo';
    const first = Math.max(prevEnd, s.first);
    prevEnd = s.end;
    const last = parts[parts.length - 1];
    if (last && last.end === first && last.type === type && type !== 'verse' && (type !== 'solo' || last.instrument === instrument)) {
      last.end = s.end;
      continue;
    }
    parts.push({ type, number: null, instrument: type === 'solo' || reading ? instrument : null, first, end: s.end });
  }
  // numbers: per kind, when it comes back
  for (const type of ['verse', 'chorus', 'bridge', 'solo'] as const) {
    const of = parts.filter((p) => p.type === type);
    if (type === 'solo') {
      numberSolos(parts);
      continue;
    }
    if (of.length >= 2) of.forEach((p, i) => (p.number = i + 1));
  }
  if (outro) parts.push(outro);
  return parts;
}

/** Parts in the mode asked. */
export function detectParts(input: PartsInput, mode: StructureMode): BarPart[] {
  return mode === 'pop' ? popParts(input) : jazzParts(input);
}
