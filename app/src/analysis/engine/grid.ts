// Bar/beat grid of the analysis: `{ beats: seconds, numbers: 1..bpb, beatsPerBar }`
// (the prototype's `lib/grid.js`; its hand corrections live in the app's
// `store/gridActions.ts`, so only what the analysis needs is here).

export interface Grid {
  beats: number[];
  /** Position of each beat in its bar, 1-based. */
  numbers: number[];
  beatsPerBar: number;
}

export function makeGrid(beats: readonly number[], numbers: readonly number[], beatsPerBar: number): Grid {
  return { beats: beats.slice(), numbers: numbers.slice(), beatsPerBar };
}

/** Renumber from the beat `firstDownIdx`, which becomes number 1. */
export function renumber(beats: readonly number[], beatsPerBar: number, firstDownIdx: number): number[] {
  return beats.map((_, i) => ((((i - firstDownIdx) % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1);
}

/** Index of the first beat that carries number 1 (0 when none). */
export function firstDownbeat(grid: Grid): number {
  const i = grid.numbers.indexOf(1);
  return i < 0 ? 0 : i;
}
