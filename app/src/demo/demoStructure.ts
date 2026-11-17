// A made-up detected structure for the `?demo` piece, until the detection is wired in (stage 5): what the
// structure column shows for the screens, the captures and the browser checks. Opt-in with `?structure=demo`
// (Jazz: Intro, Thème 1, Solo (Guitare), Solo (Trompette), Thème 2, Outro) or `?structure=pop` (Couplet, Refrain…).
// Without the query nothing changes: the demo keeps its hand letters A, B, A and no structure.
//
// The piece has 24 bars (`demoProject.ts#DEMO_BARS`); the letters are two bars long so that a chorus fits in it.

import { barStartTime } from '../grid/tempoMap';
import type { AnalysisResult } from '../model/analysis';
import type { Corrections } from '../model/corrections';
import type { DetectedStructure, PartInstrument, PartType, StructureMode, StructurePart } from '../model/structure';
import type { TempoMap } from '../model/tempoMap';

export type DemoStructureKind = 'jazz' | 'pop';

/** The value of `?structure=`: `demo` (also `autumn`) for Jazz, `pop` for Pop, null for none. */
export function demoStructureKind(query: string | null): DemoStructureKind | null {
  if (query === null) return null;
  return query === 'pop' ? 'pop' : query === 'demo' || query === 'autumn' || query === 'jazz' ? 'jazz' : null;
}

type Row = [type: PartType, number: number | null, instrument: PartInstrument | null, firstBar: number, endBar: number];

const JAZZ_PARTS: Row[] = [
  ['intro', null, null, 0, 2],
  ['theme', 1, null, 2, 10],
  ['solo', null, 'guitar', 10, 14],
  ['solo', null, 'trumpet', 14, 18],
  ['theme', 2, null, 18, 22],
  ['outro', null, null, 22, 24],
];
const JAZZ_LETTERS: [bar: number, label: string][] = [[2, 'A'], [4, 'A'], [6, 'B'], [8, 'C'], [10, 'A'], [12, 'A'], [14, 'A'], [16, 'A'], [18, 'B'], [20, 'C']];

const POP_PARTS: Row[] = [
  ['intro', null, null, 0, 2],
  ['verse', 1, null, 2, 6],
  ['chorus', 1, null, 6, 10],
  ['verse', 2, null, 10, 14],
  ['chorus', 2, null, 14, 18],
  ['solo', null, 'guitar', 18, 22],
  ['outro', null, null, 22, 24],
];
const POP_LETTERS: [bar: number, label: string][] = [[2, 'A'], [6, 'B'], [10, 'A'], [14, 'B']];

/** The structure the made-up detection finds, on the grid of the piece. */
export function demoStructure(map: TempoMap, kind: DemoStructureKind = 'jazz'): DetectedStructure {
  const rows = kind === 'pop' ? POP_PARTS : JAZZ_PARTS;
  const letters = kind === 'pop' ? POP_LETTERS : JAZZ_LETTERS;
  const mode: StructureMode = kind;
  const parts: StructurePart[] = rows.map(([type, number, instrument, first, end], i) => ({
    id: `demo-${kind}-${i + 1}`,
    type,
    number,
    instrument,
    start: barStartTime(map, first),
    end: barStartTime(map, end),
  }));
  return {
    mode,
    form: kind === 'pop' ? 'AB' : 'AABC',
    sections: letters.map(([bar, label]) => ({ time: barStartTime(map, bar), label })),
    parts,
  };
}

/** The analysis with the made-up structure in it. */
export function withDemoStructure(analysis: AnalysisResult, map: TempoMap, kind: DemoStructureKind): AnalysisResult {
  return { ...analysis, structure: demoStructure(map, kind) };
}

/** The demo's hand letters removed, so that the detected ones show (`sectionsInForce`). */
export function withoutHandLetters(c: Corrections): Corrections {
  return { ...c, sections: [] };
}
