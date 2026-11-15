// `base`: the app's current analysis on the mix, default options, exactly the
// worker's `decode()` (app/src/analysis/worker/analysis.worker.ts). With a
// true grid, the grid is handed in as the user's grid would be (the « regrid »
// path); the key is still detected.

import { chartFromGrid, gridFromActivations, gridFromHint } from '../../../../../app/src/analysis/engine/pipeline';
import { toAnalysisResult } from '../../../../../app/src/analysis/engine/result';
import type { MeterScore } from '../../../../../app/src/analysis/engine/meter';
import { modelsFor } from '../../../../../app/src/analysis/models';
import type { Variant } from '../types';

const base: Variant = async (input, ctx) => {
  const { outputs, duration } = await ctx.networks(input.mixPath);
  const hint = input.truthGrid ?? null;
  let grid;
  let meterScores: MeterScore[] = [];
  let repairs: ReturnType<typeof gridFromActivations>['repairs'] = [];
  if (hint) grid = gridFromHint(hint.times, hint.downbeat, hint.beatsPerBar);
  else {
    const r = gridFromActivations(outputs.act);
    grid = r.grid;
    meterScores = r.meterScores;
    repairs = r.repairs;
  }
  const chart = chartFromGrid(outputs.frames, outputs.timeScale, grid, null);
  const result = toAnalysisResult({
    grid,
    downbeat: hint ? hint.downbeat : undefined,
    meterScores,
    gridIsHint: !!hint,
    key: chart.key,
    keyIsHint: false,
    tuning: outputs.tuning,
    segments: chart.segments,
    repairs,
    duration,
    models: modelsFor('light').map((m) => m.id),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
};

export default base;
