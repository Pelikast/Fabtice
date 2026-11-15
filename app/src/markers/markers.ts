// Repères as pure functions (lot 4): sections as named ranges, named loops
// as an ordered list. See `model/markers.ts` for the one notion of section.

import { sectionBar } from '../chart/layout';
import { barStartTime, timeToBar } from '../grid/tempoMap';
import type { SectionMark } from '../model/corrections';
import { MARKER_NAME_MAX, type Markers, type NamedLoop } from '../model/markers';
import type { Seconds, TimeRange } from '../model/project';
import type { TempoMap } from '../model/tempoMap';

export interface SectionRange {
  label: string;
  /** Bar where the section starts, on the grid in force. */
  bar: number;
  /** Source seconds: from its bar line to the next section's (or the end of the piece). */
  start: Seconds;
  end: Seconds;
}

/**
 * The sections of the piece as ranges, by time. A letter is stored in time
 * and shown on the nearest bar line of the grid in force (`chart/layout.ts`),
 * so the ranges follow a corrected grid; two letters on the same bar keep the
 * last one, as the chart does.
 */
export function sectionRanges(map: TempoMap, sections: readonly SectionMark[], duration: Seconds): SectionRange[] {
  const byBar = new Map<number, string>();
  for (const s of sections) byBar.set(sectionBar(map, s.time), s.label);
  const bars = [...byBar.keys()].sort((a, b) => a - b);
  const out: SectionRange[] = [];
  bars.forEach((bar, i) => {
    const start = Math.max(0, barStartTime(map, bar));
    const next = bars[i + 1];
    const end = Math.min(duration, next === undefined ? duration : barStartTime(map, next));
    if (end > start) out.push({ label: byBar.get(bar)!, bar, start, end });
  });
  return out;
}

/** The section heard at `time`, if any. */
export function sectionAt(ranges: readonly SectionRange[], time: Seconds): SectionRange | null {
  for (const r of ranges) if (time >= r.start && time < r.end) return r;
  return null;
}

/** Bar where a new section would start for a time (the bar that holds it). */
export function barForNewSection(map: TempoMap, time: Seconds): number {
  return timeToBar(map, time + 1e-6).bar;
}

/** The next free letter (« A », then « B »…), after the ones in use. */
export function nextSectionLetter(sections: readonly SectionMark[]): string {
  const used = new Set(sections.map((s) => s.label.trim().toUpperCase()));
  for (let c = 65; c <= 90; c++) {
    const l = String.fromCharCode(c);
    if (!used.has(l)) return l;
  }
  return 'A';
}

/** A name as kept: trimmed, at most `MARKER_NAME_MAX` characters; null when empty. */
export function cleanName(name: string): string | null {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MARKER_NAME_MAX);
  return n.length > 0 ? n : null;
}

/** « Boucle 3 »: the first number not used by a loop named that way. */
export function defaultLoopName(loops: readonly NamedLoop[], word: string): string {
  const used = new Set(loops.map((l) => l.name));
  for (let n = 1; ; n++) if (!used.has(`${word} ${n}`)) return `${word} ${n}`;
}

const sameRange = (a: TimeRange, b: TimeRange) => Math.abs(a.start - b.start) < 1e-6 && Math.abs(a.end - b.end) < 1e-6;

/** The named loop with exactly this region, if one is kept. */
export function loopWithRegion(markers: Markers, region: TimeRange | null): NamedLoop | null {
  if (!region) return null;
  return markers.loops.find((l) => sameRange(l.region, region)) ?? null;
}

export function withLoopAdded(markers: Markers, loop: NamedLoop): Markers {
  return { ...markers, loops: [...markers.loops, loop] };
}

export function withLoopRenamed(markers: Markers, id: string, name: string): Markers {
  const n = cleanName(name);
  if (!n) return markers;
  return { ...markers, loops: markers.loops.map((l) => (l.id === id ? { ...l, name: n } : l)) };
}

export function withLoopRemoved(markers: Markers, id: string): Markers {
  return { ...markers, loops: markers.loops.filter((l) => l.id !== id) };
}

/** Moves a named loop one place up (−1) or down (+1) in the list. */
export function withLoopMoved(markers: Markers, id: string, direction: -1 | 1): Markers {
  const i = markers.loops.findIndex((l) => l.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= markers.loops.length) return markers;
  const loops = [...markers.loops];
  [loops[i], loops[j]] = [loops[j]!, loops[i]!];
  return { ...markers, loops };
}
