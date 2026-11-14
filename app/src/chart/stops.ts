// Keyboard stops of the chart: every chord, and the chord area of a bar that
// has none of its own (a bar-repeat sign or an empty bar). Arrow keys move from
// one stop to the next (pure, tested in stops.test.ts).

import { chartLines, type ChartBar } from './layout';

export interface Stop {
  bar: number;
  /** Rank of the chord in the bar; -1 for the chord area of a bar without chords. */
  index: number;
}

export type StopMove = 'left' | 'right' | 'up' | 'down' | 'first' | 'last';

export const stopKey = (s: Stop): string => `${s.bar}:${s.index}`;
export const sameStop = (a: Stop | null, b: Stop | null): boolean => a === b || (!!a && !!b && a.bar === b.bar && a.index === b.index);

export function chordStops(bars: readonly ChartBar[]): Stop[] {
  const out: Stop[] = [];
  for (const b of bars) {
    if (b.chords.length) b.chords.forEach((_, index) => out.push({ bar: b.bar, index }));
    else out.push({ bar: b.bar, index: -1 });
  }
  return out;
}

/** Where `move` leads from `from`. Left and right go chord by chord; up and down go to the same column of the line above or below. */
export function moveStop(bars: readonly ChartBar[], from: Stop, move: StopMove): Stop {
  const stops = chordStops(bars);
  if (!stops.length) return from;
  const at = stops.findIndex((s) => sameStop(s, from));
  const here = at < 0 ? 0 : at;
  switch (move) {
    case 'first': return stops[0]!;
    case 'last': return stops[stops.length - 1]!;
    case 'left': return stops[Math.max(0, here - 1)]!;
    case 'right': return stops[Math.min(stops.length - 1, here + 1)]!;
    case 'up':
    case 'down': {
      const lines = chartLines(bars);
      const li = lines.findIndex((l) => l.bars.some((b) => b.bar === from.bar));
      if (li < 0) return stops[here]!;
      const col = lines[li]!.bars.findIndex((b) => b.bar === from.bar);
      const target = lines[li + (move === 'up' ? -1 : 1)];
      if (!target) return stops[here]!;
      const bar = target.bars[Math.min(col, target.bars.length - 1)]!.bar;
      return stops.find((s) => s.bar === bar) ?? stops[here]!;
    }
  }
}
