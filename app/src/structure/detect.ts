// `detectStructure`: the structure of the piece (mode, form, letters, parts)
// from the chart in force and what the audio says about who plays. It only
// produces the DETECTED layer (`AnalysisResult.structure`); the user's
// corrections are merged on top by `store/structureSelectors.ts` and are
// never read nor changed here.
//
//   form      `form.ts`   chorus length, choruses, letters (or pop phrases)
//   mode      here        Jazz unless the piece looks like a song: a known
//                         standard that fits is Jazz; otherwise the chord
//                         vocabulary decides (jazz charts are mostly sevenths,
//                         pop songs mostly triads)
//   parts     `parts.ts`  Intro, Thème, Solo… / Couplet, Refrain…
//
// Everything returned passes `storage/documentFormat.ts#isDetectedStructure`
// (an invalid structure would drop the whole analysis on reload): parts
// ascending, never overlapping, end after start, ids unique; letters A–Z.

import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import { FORM_PATTERN, PART_INSTRUMENT_PATTERN, PART_TYPES, type DetectedStructure, type PartType, type StructureMode, type StructurePart } from '../model/structure';
import { analyseForm, type FormAnalysis, type Layout } from './form';
import { detectParts, leadFromStems, leadFromTimbre, leadStretches, type BarPart } from './parts';
import type { HarmonyBar, HarmonyInput } from './types';

/** Fewer bars than this: nothing can be said. */
const MIN_BARS = 8;

/** Qualities with a seventh or a sixth (jazz vocabulary); the rest are triads. */
const SEVENTHS = new Set(['7', 'maj7', 'min7', 'hdim7', 'dim7', 'maj6', 'min6', 'minmaj7', '7sus4', 'aug7']);

/** Share of the beats (with a chord) that sound a seventh or sixth chord. */
export function seventhShare(bars: readonly HarmonyBar[]): number {
  let sevenths = 0;
  let all = 0;
  for (const b of bars) {
    const n = Math.max(1, Math.round(b.beats));
    let cur = b.carried;
    let ci = 0;
    const chords = [...b.chords].sort((x, y) => x.beat - y.beat);
    for (let k = 0; k < n; k++) {
      while (ci < chords.length && chords[ci]!.beat <= k + 1e-6) cur = chords[ci++]!.chord;
      if (!cur) continue;
      all++;
      if (SEVENTHS.has(cur.quality)) sevenths++;
    }
  }
  return all ? sevenths / all : 0;
}

/** Pop when fewer beats than this sound a seventh or a sixth chord (the bench: pop ≤ 0.21, trad jazz ≥ 0.40, other jazz more). */
export const POP_SEVENTHS = 0.3;

/** The likeliest mode (see the header). */
export function chooseMode(bars: readonly HarmonyBar[], fa: FormAnalysis): StructureMode {
  if (fa.knownFits) return 'jazz';
  return seventhShare(bars) < POP_SEVENTHS ? 'pop' : 'jazz';
}

/** Index of the bar whose start is nearest to `time`. */
function barIndexAt(bars: readonly HarmonyBar[], time: Seconds): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid]!.start <= time) lo = mid;
    else hi = mid - 1;
  }
  const next = bars[lo + 1];
  return next && Math.abs(next.start - time) < Math.abs(bars[lo]!.start - time) ? lo + 1 : lo;
}

/** Bars where who plays changes, from the audio evidence (a lead enters or leaves; without separation, the timbre). */
export function playerChanges(input: HarmonyInput): number[] {
  const ev = input.evidence;
  const n = input.bars.length;
  if (!ev) return [];
  // the timbre read in blocks of four bars (the form is not known yet)
  const grid = Int8Array.from({ length: n }, (_, i) => (i % 4 === 0 ? 2 : 0));
  const reading = ev.stems ? leadFromStems(ev.stems, n) : ev.timbre ? leadFromTimbre(ev.timbre, n, grid) : null;
  if (!reading) return [];
  // on any bar (not only every four): the form is not known yet
  return leadStretches(reading, new Int8Array(n).fill(1), 0, n).map((s) => s.first).filter((i) => i > 0);
}

/** The form, letters and parts in bars, before they become times (the tests read this). */
export interface StructureInBars {
  mode: StructureMode;
  form: string;
  layout: Layout | null;
  analysis: FormAnalysis;
  parts: BarPart[];
}

/** Everything `detectStructure` finds, in bars. Null when nothing can be said. */
/** Kinds of part that start a chorus (Thème, Solo, Outro; the end of an Intro), see `FormOptions.anchors`. */
const CHORUS_STARTS: ReadonlySet<PartType> = new Set(['theme', 'solo', 'outro']);

/** The bars the hand parts fix (see `FormOptions.anchors`). */
export function handAnchors(bars: readonly HarmonyBar[], parts: NonNullable<HarmonyInput['handParts']>): { chorus: number[]; phrase: number[] } {
  const chorus = new Set<number>();
  const phrase = new Set<number>();
  for (const p of parts) {
    // A boundary at the end of the last bar (or later) is the end of the piece, not its last bar.
    const at = (t: Seconds) => (bars.length && t >= bars[bars.length - 1]!.end - 1e-3 ? bars.length : barIndexAt(bars, t));
    const first = at(p.start);
    const end = at(p.end);
    if (CHORUS_STARTS.has(p.type)) chorus.add(first);
    if (p.type === 'intro') chorus.add(end);
    phrase.add(first);
    phrase.add(end);
  }
  return { chorus: [...chorus].sort((a, b) => a - b), phrase: [...phrase].sort((a, b) => a - b) };
}

export function structureInBars(input: HarmonyInput, keyChanges: readonly { time: Seconds; key: Key }[]): StructureInBars | null {
  const bars = input.bars;
  const n = bars.length;
  if (n < MIN_BARS) return null;
  let chordsFirst = -1;
  let chordsEnd = -1;
  bars.forEach((b, i) => {
    if (b.chords.some((c) => c.chord) || b.carried) {
      if (chordsFirst < 0) chordsFirst = i;
      chordsEnd = i + 1;
    }
  });
  if (chordsFirst < 0 || chordsEnd - chordsFirst < MIN_BARS) return null;
  const analysis = analyseForm(bars, {
    known: input.known,
    key: input.key,
    keyChanges: keyChanges.map((k) => ({ bar: barIndexAt(bars, k.time), key: k.key })),
    cues: playerChanges(input),
    fixed: (input.handSections ?? []).map((h) => ({ bar: barIndexAt(bars, h.time), letter: h.label })),
    anchors: handAnchors(bars, input.handParts ?? []),
  });
  const mode: StructureMode = input.mode === 'auto' ? chooseMode(bars, analysis) : input.mode;
  const layout = mode === 'pop' ? (analysis.phrases ?? analysis.chorus) : (analysis.chorus ?? analysis.phrases);
  const parts = detectParts({ n, layout, evidence: input.evidence, chordsFirst, chordsEnd }, mode);
  const form = mode === 'jazz' && layout && layout.source !== 'phrases' ? layout.form : '';
  return { mode, form, layout, analysis, parts };
}

/** The structure of the piece (mode, form, letters, parts); null when nothing can be said. */
export function detectStructure(input: HarmonyInput, keyChanges: readonly { time: Seconds; key: Key }[]): DetectedStructure | null {
  const found = structureInBars(input, keyChanges);
  if (!found) return null;
  const bars = input.bars;
  const startOf = (i: number) => (i < bars.length ? bars[i]!.start : bars[bars.length - 1]!.end);
  const sections = (found.layout?.sections ?? [])
    .filter((s) => s.first < bars.length)
    .map((s) => ({ time: startOf(s.first), label: s.letter }));
  const parts: StructurePart[] = found.parts.map((p) => ({
    id: `d${bars[Math.min(p.first, bars.length - 1)]!.bar}`,
    type: p.type,
    number: p.number,
    instrument: p.instrument,
    start: startOf(p.first),
    end: startOf(p.end),
  }));
  return sanitize({ mode: found.mode, form: found.form, sections, parts });
}

/** What `isDetectedStructure` accepts, whatever happened upstream (never throws, drops what does not fit). */
export function sanitize(s: DetectedStructure): DetectedStructure {
  const form = FORM_PATTERN.test(s.form) ? s.form : '';
  const sections = s.sections
    .filter((m) => Number.isFinite(m.time) && typeof m.label === 'string' && m.label.length >= 1 && m.label.length <= 12)
    .sort((a, b) => a.time - b.time)
    .filter((m, i, list) => i === 0 || m.time > list[i - 1]!.time + 1e-6);
  const ids = new Set<string>();
  const parts: StructurePart[] = [];
  for (const p of [...s.parts].sort((a, b) => a.start - b.start)) {
    if (!Number.isFinite(p.start) || !Number.isFinite(p.end) || !(p.end > p.start)) continue;
    if (!PART_TYPES.includes(p.type)) continue;
    const last = parts[parts.length - 1];
    if (last && p.start < last.end) continue;
    let id = p.id || 'd';
    while (ids.has(id)) id += "'";
    ids.add(id);
    parts.push({
      id,
      type: p.type,
      number: p.number !== null && Number.isInteger(p.number) && p.number >= 1 ? p.number : null,
      instrument: p.instrument !== null && PART_INSTRUMENT_PATTERN.test(p.instrument) ? p.instrument : null,
      start: p.start,
      end: p.end,
    });
  }
  return { mode: s.mode === 'pop' ? 'pop' : 'jazz', form, sections, parts };
}
