// The structure in force (document version 6): the detected structure
// (`analysis.structure`) under the user's corrections (`corrections.structure`,
// `corrections.sections`). The rules are those of `model/structure.ts`:
//
//   - mode: the hand choice unless `auto`; else the detected mode; else Jazz;
//   - letters: the user's section marks when there is one, or when the user
//     edited the letters (`lettersByHand`); else the detected ones;
//   - parts: every hand part; plus each detected part that does not start
//     inside a hand stretch (`spans`), cut where the next hand stretch or hand
//     part starts, if it reaches it;
//   - the letters of a part: the labels of the letters in force whose bar
//     (the bar line nearest the mark, as the chart places it) lies from the
//     part's first bar up to, not including, the bar where it ends;
//   - the global form (« Forme globale »): the detected one, '' without it.
//
// Pure functions of the state, memoised on what they read.

import { sectionBar } from '../chart/layout';
import type { AnalysisResult } from '../model/analysis';
import type { Corrections, SectionMark } from '../model/corrections';
import type { Seconds, TimeRange } from '../model/project';
import type { StructureMode, StructurePart } from '../model/structure';
import type { TempoMap } from '../model/tempoMap';
import type { Provenance } from './chartSelectors';
import type { AppState } from './store';

export type StructureSlice = Pick<AppState, 'analysis' | 'corrections' | 'tempoMap'>;

/** Times closer than this are the same (limits and marks are bar lines in source seconds). */
export const STRUCTURE_EPS: Seconds = 1e-3;

export interface PartInForce extends StructurePart {
  origin: Exclude<Provenance, 'none'>;
  /** Labels of the section letters in force inside the part, in order (« A », « A », « B », « A »). */
  letters: string[];
}

export interface StructureInForce {
  mode: StructureMode;
  /** `manual` when chosen by hand, `analysis` when detected, `none` (Jazz by default). */
  modeOrigin: Provenance;
  /** « Forme globale » (« AABC »); '' when unknown. */
  form: string;
  /** Section letters in force, ascending. */
  sections: SectionMark[];
  sectionsOrigin: Provenance;
  /** Ascending by start, never overlapping. */
  parts: PartInForce[];
}

/** Whether the user's section marks are the letters in force. */
export function lettersAreByHand(c: Corrections): boolean {
  return c.sections.length > 0 || c.structure.lettersByHand;
}

/** The section letters in force (detected ones until the user edits the letters). */
export function sectionsInForce(s: Pick<AppState, 'analysis' | 'corrections'>): SectionMark[] {
  if (lettersAreByHand(s.corrections)) return s.corrections.sections;
  return s.analysis?.structure?.sections ?? s.corrections.sections;
}

/**
 * The corrections ready for an edit of the letters: the letters in force
 * become the user's (the detected ones copied, the first time) and are marked
 * as edited by hand. `harmonyActions.ts#setSection` edits through this.
 */
export function withLettersAdopted(c: Corrections, analysis: AnalysisResult | null): Corrections {
  if (c.structure.lettersByHand) return c;
  const sections = lettersAreByHand(c) ? c.sections : (analysis?.structure?.sections ?? []).map((m) => ({ ...m }));
  return { ...c, sections, structure: { ...c.structure, lettersByHand: true } };
}

const inside = (t: Seconds, r: TimeRange) => t >= r.start - STRUCTURE_EPS && t < r.end - STRUCTURE_EPS;

/** The parts in force without letters (see the rule above). */
export function mergeParts(detected: readonly StructurePart[], hand: readonly StructurePart[], spans: readonly TimeRange[]): (StructurePart & { origin: 'analysis' | 'manual' })[] {
  const handStarts = [...spans.map((r) => r.start), ...hand.map((p) => p.start)].sort((a, b) => a - b);
  const kept = detected
    .filter((p) => !spans.some((r) => inside(p.start, r)))
    .map((p) => {
      const next = handStarts.find((t) => t > p.start + STRUCTURE_EPS);
      return { ...p, end: next === undefined ? p.end : Math.min(p.end, next), origin: 'analysis' as const };
    })
    .filter((p) => p.end > p.start + STRUCTURE_EPS);
  return [...kept, ...hand.map((p) => ({ ...p, origin: 'manual' as const }))].sort((a, b) => a.start - b.start);
}

/** Labels of the marks whose bar lies in [bar of `start`, bar of `end`). */
export function lettersIn(map: TempoMap, sections: readonly SectionMark[], start: Seconds, end: Seconds): string[] {
  const from = sectionBar(map, start);
  const to = sectionBar(map, end);
  return sections
    .filter((m) => {
      const bar = sectionBar(map, m.time);
      return bar >= from && bar < to;
    })
    .sort((a, b) => a.time - b.time)
    .map((m) => m.label);
}

let memo: { analysis: StructureSlice['analysis']; corrections: Corrections; map: TempoMap; value: StructureInForce } | null = null;

/** « Structure en vigueur »: mode, form, letters and parts (analysis + hand layer). */
export function structureInForce(s: StructureSlice): StructureInForce {
  if (memo && memo.analysis === s.analysis && memo.corrections === s.corrections && memo.map === s.tempoMap) return memo.value;
  const detected = s.analysis?.structure ?? null;
  const hand = s.corrections.structure;
  const [mode, modeOrigin]: [StructureMode, Provenance] =
    hand.mode !== 'auto' ? [hand.mode, 'manual'] : detected ? [detected.mode, 'analysis'] : ['jazz', 'none'];
  const sections = sectionsInForce(s);
  const sectionsOrigin: Provenance = lettersAreByHand(s.corrections) ? 'manual' : detected ? 'analysis' : 'none';
  const parts = mergeParts(detected?.parts ?? [], hand.parts, hand.spans).map((p) => ({ ...p, letters: lettersIn(s.tempoMap, sections, p.start, p.end) }));
  const value: StructureInForce = { mode, modeOrigin, form: detected?.form ?? '', sections, sectionsOrigin, parts };
  memo = { analysis: s.analysis, corrections: s.corrections, map: s.tempoMap, value };
  return value;
}

/** The part heard at `time`, if any. */
export function partAt(s: StructureSlice, time: Seconds): PartInForce | null {
  for (const p of structureInForce(s).parts) if (time >= p.start - STRUCTURE_EPS && time < p.end - STRUCTURE_EPS) return p;
  return null;
}
