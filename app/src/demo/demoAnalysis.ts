// What « the analysis » finds in the `?demo` piece, and what « the user »
// already did by hand: believable material for the chart, the ruler and the
// screenshots. The beats are those the piece was generated from; the chords
// are the chart with the analysis' habits: extensions as suggestions, one
// doubtful chord (bar 12, D♭m6, which it also reads as D♭m7), two chords in
// bar 15. The section letters A, B, A are « placed by the user ».

import { beatGridOf } from '../grid/beats';
import { barStartTime, beatToTime, barToBeat } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { ANALYSIS_RESULT_VERSION, type AnalysedChord, type AnalysisResult } from '../model/analysis';
import { emptyCorrections, type Corrections } from '../model/corrections';
import type { TempoMap } from '../model/tempoMap';
import { DEMO_BARS, DEMO_TUNING_CENTS, demoChartBar } from './demoProject';

export function demoAnalysis(map: TempoMap, duration: number): AnalysisResult {
  const grid = beatGridOf(map, duration);
  const chords: AnalysedChord[] = [];
  for (let bar = 0; bar < DEMO_BARS; bar++) {
    demoChartBar(bar).forEach((x, i) => {
      const doubtful = bar % 16 === 11;
      chords.push({
        time: beatToTime(map, barToBeat(map, bar) + x.beat),
        chord: x.chord,
        confidence: doubtful ? 0.31 : 0.62 + (((bar * 7 + i * 3) % 10) / 30),
        doubtful,
        alternatives: doubtful ? [chord(1, 'min7')] : [],
      });
    });
  }
  return {
    version: ANALYSIS_RESULT_VERSION,
    analyser: { id: 'mock', version: 'demo', models: [] },
    analysedAt: '2026-11-14T09:00:00.000Z',
    duration,
    beats: { times: grid.times, downbeat: grid.downbeat, meter: grid.meter, meterConfidence: 0.86 },
    key: { tonic: 8, mode: 'major', confidence: 0.78, alternatives: [{ tonic: 5, mode: 'minor', confidence: 0.12 }, { tonic: 3, mode: 'major', confidence: 0.05 }] },
    tuning: { cents: DEMO_TUNING_CENTS, confidence: 0.84 },
    chords,
  };
}

/** Section letters as the user would place them: A at bar 1, B at bar 9, A again at bar 17. */
export function demoCorrections(map: TempoMap): Corrections {
  return {
    ...emptyCorrections(),
    sections: [
      { time: barStartTime(map, 0), label: 'A' },
      { time: barStartTime(map, 8), label: 'B' },
      { time: barStartTime(map, 16), label: 'A' },
    ],
  };
}
