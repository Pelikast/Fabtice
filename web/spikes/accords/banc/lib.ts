// What the « listening » variants share: the grid as `base` gets it, and the
// translation of a chart into the bench's output, through the app's own
// `toAnalysisResult` (same « doubtful », same symbols).

import type { Chart } from '../../../../app/src/analysis/engine/pipeline';
import { beatSegments, gridFromActivations, gridFromHint } from '../../../../app/src/analysis/engine/pipeline';
import type { Grid } from '../../../../app/src/analysis/engine/grid';
import type { MeterScore } from '../../../../app/src/analysis/engine/meter';
import { toAnalysisResult } from '../../../../app/src/analysis/engine/result';
import { modelsFor } from '../../../../app/src/analysis/models';
import type { NetworkResult } from './networks';
import type { VariantContext, VariantInput, VariantOutput } from './types';

export interface Prepared {
  net: NetworkResult;
  grid: Grid;
  meterScores: MeterScore[];
  repairs: ReturnType<typeof gridFromActivations>['repairs'];
}

/** The mix's networks and the grid, exactly as `base` (detected, or the true grid as the user's). */
export async function prepare(input: VariantInput, ctx: VariantContext): Promise<Prepared> {
  const net = await ctx.networks(input.mixPath);
  const hint = input.truthGrid;
  if (hint) return { net, grid: gridFromHint(hint.times, hint.downbeat, hint.beatsPerBar), meterScores: [], repairs: [] };
  const r = gridFromActivations(net.outputs.act);
  return { net, grid: r.grid, meterScores: r.meterScores, repairs: r.repairs };
}

/** The beats of a grid as [start, end) segments, as the pipeline pools them. */
export const segmentsOf = (grid: Grid) => beatSegments(grid.beats);

export function output(input: VariantInput, p: Prepared, chart: Chart): VariantOutput {
  const result = toAnalysisResult({
    grid: p.grid,
    downbeat: input.truthGrid ? input.truthGrid.downbeat : undefined,
    meterScores: p.meterScores,
    gridIsHint: !!input.truthGrid,
    key: chart.key,
    keyIsHint: false,
    tuning: p.net.outputs.tuning,
    segments: chart.segments,
    repairs: p.repairs,
    duration: p.net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
}
