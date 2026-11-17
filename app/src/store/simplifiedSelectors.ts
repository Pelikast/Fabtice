// « Grille complète simplifiée » (C14): the input of `simplifyChart`, built from
// the state (the chart in force, the section letters and the parts in force as
// bar numbers, the modulations in force), and its result, memoised. The
// function itself is in `structure/` (another writer's work); until it finds a
// form to fold it answers null and the chart shows in full.
//
// Nothing here reads the audio and nothing is stored: like the chart, the
// simplified chart is a pure function of what is in force.

import { partBars } from '../chart/structureDisplay';
import { sectionBar, type ChartBar } from '../chart/layout';
import type { ChordSymbol } from '../model/harmony';
import { simplifyChart, type HarmonyBar, type KnownStandard, type SimplifiedChart, type SimplifyInput } from '../structure';
import { knownStandardsFor } from '../structure/knownCache';
import { selectChartBars } from './chartSelectors';
import { keyChangesInForce, keyPassages } from './keySelectors';
import type { AppState } from './store';
import { structureInForce } from './structureSelectors';

const NO_KNOWN: readonly KnownStandard[] = Object.freeze([]) as readonly KnownStandard[];

/** The bars of the chart as the harmony pass reads them: chords that start in the bar, and the one still sounding at its bar line. */
export function harmonyBars(bars: readonly ChartBar[]): HarmonyBar[] {
  let going: ChordSymbol | null = null;
  return bars.map((b) => {
    const startsOnBeat = b.chords.some((c) => c.beatInBar === 0);
    const bar: HarmonyBar = {
      bar: b.bar,
      start: b.start,
      end: b.end,
      beats: b.beats,
      meter: b.meter,
      chords: b.chords.map((c) => ({ beat: c.beatInBar, chord: c.chord, doubtful: c.doubtful, byHand: c.origin === 'manual' })),
      carried: startsOnBeat ? null : going,
    };
    if (b.chords.length) going = b.chords[b.chords.length - 1]!.chord;
    return bar;
  });
}

let inputMemo: {
  bars: ChartBar[];
  structure: ReturnType<typeof structureInForce>;
  map: AppState['tempoMap'];
  passages: ReturnType<typeof keyPassages>;
  duration: number;
  known: readonly KnownStandard[];
  value: SimplifyInput;
} | null = null;

/** What `simplifyChart` reads, for the state (the same object while nothing it reads changed). */
export function selectSimplifyInput(s: AppState): SimplifyInput {
  const bars = selectChartBars(s);
  const structure = structureInForce(s);
  const passages = keyPassages(s);
  const duration = s.project?.duration ?? 0;
  // The known charts the harmony pass found for the title (`structure/refresh.ts`; none when not looked up, or the setting is off).
  const known = s.settings.useKnownCharts ? knownStandardsFor(s.project?.title) : NO_KNOWN;
  if (
    inputMemo &&
    inputMemo.bars === bars &&
    inputMemo.structure === structure &&
    inputMemo.map === s.tempoMap &&
    inputMemo.passages === passages &&
    inputMemo.duration === duration &&
    inputMemo.known === known
  ) {
    return inputMemo.value;
  }
  const map = s.tempoMap;
  const last = bars[bars.length - 1];
  const lastBar = last ? last.bar : 0;
  const value: SimplifyInput = {
    bars: harmonyBars(bars),
    sections: structure.sections.map((m) => ({ bar: sectionBar(map, m.time), label: m.label })).sort((a, b) => a.bar - b.bar),
    parts: structure.parts.map((p) => {
      const range = partBars(map, p, duration, lastBar);
      return { id: p.id, type: p.type, firstBar: range.first, endBar: range.end, letters: p.letters };
    }),
    keyChanges: keyChangesInForce(s).map((c) => ({ bar: sectionBar(map, c.time), key: c.key })),
    known: known as KnownStandard[],
  };
  inputMemo = { bars, structure, map, passages, duration, known, value };
  return value;
}

let resultMemo: { input: SimplifyInput; value: SimplifiedChart | null } | null = null;

/** The simplified chart of the piece, or null when it has no form to fold (the chart is then shown in full). */
export function selectSimplifiedChart(s: AppState): SimplifiedChart | null {
  const input = selectSimplifyInput(s);
  if (resultMemo && resultMemo.input === input) return resultMemo.value;
  const value = simplifyChart(input);
  resultMemo = { input, value };
  return value;
}
