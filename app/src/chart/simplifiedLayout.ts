// « Grille complète simplifiée » (C14) on screen and on paper: how the written chart
// (`structure/simplify.ts`, read only) is laid out, and how the playing and the clicks map
// to it. Pure (tested in simplifiedLayout.test.ts): nothing here knows about React, the
// store or the screen.
//
//   - blocks: one per written section, its bars in lines of four (the same lines on the
//     screen and on the sheets); the repeat brackets `[ … ]xN` of a block;
//   - the playing: which written bar a played bar is (`places`), and the repeat tag shown
//     while a repeated passage plays (« 2ᵉ fois », « reprise 3/6 »);
//   - the clicks: a written bar stands for several played bars, a click goes to its NEXT
//     occurrence after the playhead; a loop dragged over written bars is the played bars of
//     the next occurrence where they follow one another in the playing.

import type { PartType, StructurePart } from '../model/structure';
import { BARS_PER_LINE } from './layout';
import type { FormEntry, SimplifiedChart, WrittenBar, WrittenPlace, WrittenSection } from '../structure';

/** What a block is headed with: a section letter (« A », « A2 » for a variant), or the kind of part outside the letters. */
export type WrittenHeading = { kind: 'letter'; letter: string; variant: number | null } | { kind: 'part'; part: PartType };

/** One line of a block: up to four written bars. */
export interface WrittenLine {
  bars: WrittenBar[];
  /** The block's first line: its heading goes above it. */
  first: boolean;
  /** The block's last line. */
  last: boolean;
}

export interface WrittenBlock {
  section: WrittenSection;
  heading: WrittenHeading;
  /** `[ … ]xN`: how many times the block is played in a row (1: no repeat bracket). */
  times: number;
  lines: WrittenLine[];
}

export function headingOf(section: WrittenSection): WrittenHeading {
  if ('letter' in section.label) return { kind: 'letter', letter: section.label.letter, variant: section.variant && section.variant > 1 ? section.variant : null };
  return { kind: 'part', part: section.label.part };
}

/** The text of a letter heading: « A », « A2 ». */
export const headingLetterText = (h: Extract<WrittenHeading, { kind: 'letter' }>): string => `${h.letter}${h.variant ?? ''}`;

/** The blocks of a simplified chart, in order, their bars in lines of four. */
export function writtenBlocks(chart: SimplifiedChart): WrittenBlock[] {
  return chart.sections.map((section) => {
    const bars = section.bars.map((i) => chart.bars[i]!).filter(Boolean);
    const lines: WrittenLine[] = [];
    for (let k = 0; k < bars.length; k += BARS_PER_LINE) lines.push({ bars: bars.slice(k, k + BARS_PER_LINE), first: k === 0, last: k + BARS_PER_LINE >= bars.length });
    return { section, heading: headingOf(section), times: Math.max(1, section.times), lines };
  });
}

/** One row of the printed simplified chart: a line of bars, with its block's heading when it is the block's first. */
export interface PrintRow {
  heading: WrittenHeading | null;
  /** How many times the block is played in a row (the repeat bracket spans its rows when above 1). */
  times: number;
  line: WrittenLine;
}

/** The rows of the printed simplified chart, in order. */
export function printRows(chart: SimplifiedChart): PrintRow[] {
  return writtenBlocks(chart).flatMap((block) => block.lines.map((line) => ({ heading: line.first ? block.heading : null, times: block.times, line })));
}

/** Index of the very last written bar (the final double bar goes after it); -1 for an empty chart. */
export function lastWrittenIndex(chart: SimplifiedChart): number {
  const last = chart.sections[chart.sections.length - 1];
  return last && last.bars.length ? last.bars[last.bars.length - 1]! : -1;
}

// ---------------------------------------------------------------- the form line

/** One entry of « Forme : Intro, Thème 1 (AABC), Solo (Piano) (AABC)… », ready to write. */
export interface FormItem {
  partId: string;
  /** « Thème 1 (AABC) », « Intro ». */
  text: string;
}

/**
 * The entries of the form line, in the order of the form. `name` writes a part (`partName`); an entry whose part is
 * gone (corrected since) is left out.
 */
export function formItems(entries: readonly FormEntry[], parts: readonly Pick<StructurePart, 'id' | 'type' | 'number' | 'instrument'>[], name: (p: Pick<StructurePart, 'type' | 'number' | 'instrument'>) => string): FormItem[] {
  const out: FormItem[] = [];
  for (const e of entries) {
    const part = parts.find((p) => p.id === e.partId);
    if (!part) continue;
    out.push({ partId: e.partId, text: e.letters ? `${name(part)} (${e.letters})` : name(part) });
  }
  return out;
}

/** The whole line as plain text: « Intro, Thème 1 (AABC), Solo (Piano) (AABC) ». */
export const formLineText = (items: readonly FormItem[]): string => items.map((i) => i.text).join(', ');

// ---------------------------------------------------------------- the playing

/** Where the played bar is written, or null (a bar the chart does not write highlights nothing). */
export function placeOf(chart: SimplifiedChart, playedBar: number): WrittenPlace | null {
  return chart.places.get(playedBar) ?? null;
}

/** What the repeat tag says: nothing for a bar played once, « 2ᵉ fois » up to four times, « reprise 2/7 » beyond. */
export type RepeatTag = { kind: 'ordinal'; n: number } | { kind: 'of'; n: number; total: number };

/** The tag to show while `place` plays; null when the written bar is played only once. */
export function repeatTag(place: WrittenPlace | null): RepeatTag | null {
  if (!place || place.passes <= 1) return null;
  return place.passes <= 4 ? { kind: 'ordinal', n: place.pass } : { kind: 'of', n: place.pass, total: place.passes };
}

// ---------------------------------------------------------------- the clicks

/** The next occurrence of a written bar after the bar being played (`current`), or the first one when none is after. */
export function nextOccurrence(played: readonly number[], current: number): number | null {
  if (played.length === 0) return null;
  for (const p of played) if (p > current) return p;
  return played[0]!;
}

/** Click on written bar `index`: the played bar to go to, or null for an index that is not written. */
export function seekTarget(chart: SimplifiedChart, index: number, current: number): number | null {
  const bar = chart.bars[index];
  return bar ? nextOccurrence(bar.played, current) : null;
}

/**
 * Loop dragged over written bars `first…last` (indices, either order): the played bars of the NEXT occurrence where they
 * follow one another in the playing (written bar `first + k` played at `p + k`), as a range of played bars, or null when
 * no occurrence of `first` is followed that way (a passage whose bars are not contiguous in time: no loop by drag).
 */
export function loopRange(chart: SimplifiedChart, a: number, b: number, current: number): { first: number; last: number } | null {
  const first = Math.min(a, b);
  const last = Math.max(a, b);
  const start = chart.bars[first];
  if (!start || !chart.bars[last]) return null;
  // The occurrences after the playhead come first, then the ones before it.
  const after = start.played.filter((p) => p > current);
  const before = start.played.filter((p) => p <= current);
  for (const p of [...after, ...before]) {
    let ok = true;
    for (let k = 1; k <= last - first && ok; k++) ok = chart.places.get(p + k)?.written === first + k;
    if (ok) return { first: p, last: p + (last - first) };
  }
  return null;
}

/** True when a written bar has an occurrence in the played bars `[first, last]` (the loop veil of a written bar). */
export const playedInside = (played: readonly number[], first: number, last: number): number | null => played.find((p) => p >= first && p <= last) ?? null;
