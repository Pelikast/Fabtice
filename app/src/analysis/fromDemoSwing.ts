// The prototype's test excerpt (`./demoSwing.ts`) as an `AnalysisResult`:
// what the mock analyser returns for an imported piece. Longer pieces repeat
// the 20-bar excerpt to their end, so the chart and the timeline have
// something believable everywhere. The confidences are made up, with the
// spread the prototype measured: most chords sure, a few doubtful.

import { chord } from '../harmony/chord';
import { parseHarte } from '../harmony/parse';
import { ANALYSIS_RESULT_VERSION, type AnalysedChord, type AnalysisResult } from '../model/analysis';
import type { Seconds } from '../model/project';
import { DEMO_SWING } from './demoSwing';

/** Length of one pass of the excerpt: the end of its last chord, where a 21st bar would start. */
export const DEMO_SWING_PERIOD: Seconds = DEMO_SWING.chords[DEMO_SWING.chords.length - 1]![1];

/** Made-up confidence of the n-th chord of the excerpt; the passing C°7 is doubtful. */
function confidenceOf(label: string, n: number): number {
  if (label.startsWith('C:dim7')) return 0.28;
  return 0.55 + ((n * 37) % 40) / 100;
}

export function demoSwingResult(duration: Seconds, analyser = { id: 'mock', version: '1', models: [] as string[] }): AnalysisResult {
  const times: Seconds[] = [];
  const chords: AnalysedChord[] = [];
  for (let k = 0, offset = 0; offset < Math.max(duration, 1); k++, offset = k * DEMO_SWING_PERIOD) {
    for (const [t] of DEMO_SWING.beats) if (t + offset <= duration + 0.5) times.push(t + offset);
    DEMO_SWING.chords.forEach(([start, , label], n) => {
      if (start + offset >= duration) return;
      const parsed = parseHarte(label);
      if (!parsed.ok) return;
      const confidence = confidenceOf(label, n);
      chords.push({
        time: start + offset,
        chord: parsed.chord,
        confidence,
        doubtful: confidence < 0.35,
        // The prototype's usual confusion: dominant 7 read as minor 7 a fifth above, and the like.
        alternatives: parsed.chord ? [chord(parsed.chord.root, parsed.chord.quality === '7' ? 'min7' : '7')] : [],
      });
    });
  }
  // A piece shorter than one beat interval still gets a grid.
  if (times.length < 2) times.splice(0, times.length, 0, 0.4);
  return {
    version: ANALYSIS_RESULT_VERSION,
    analyser,
    analysedAt: new Date().toISOString(),
    duration,
    beats: { times, downbeat: 0, meter: { numerator: 4, denominator: 4 }, meterConfidence: 0.8 },
    key: { tonic: 11, mode: 'major', confidence: 0.72, alternatives: [{ tonic: 8, mode: 'minor', confidence: 0.14 }, { tonic: 4, mode: 'major', confidence: 0.06 }] },
    tuning: { cents: DEMO_SWING.tuningCents, confidence: 0.81 },
    chords,
  };
}
