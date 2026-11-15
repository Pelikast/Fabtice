// From the networks' outputs to the app's result: the grid (detected, or the
// user's), the chords (`chart.ts#analyseChart`) and the translation. The
// worker's decoding step and the bench's `app` variant both call this, so the
// bench measures what the app does. Pure and cheap (also re-run on the user's
// grid or key, and after a separation).

import type { AnalysisResult } from '../../model/analysis';
import type { Key } from '../../model/harmony';
import { AnalysisError, type GridHint } from '../types';
import { analyseChart, type ChartSettings, type KnownCharts } from './chart';
import { gridFromActivations, gridFromHint, type NetworkOutputs } from './pipeline';
import { toAnalysisResult, type ResultInput } from './result';

export interface DecodeRequest {
  outputs: NetworkOutputs;
  /** The user's grid, kept as it is. */
  grid: GridHint | null;
  /** The user's key, kept as it is. */
  key: Key | null;
  known?: KnownCharts | null;
  settings?: Partial<ChartSettings>;
  duration: number;
  models: readonly string[];
  now?: Date;
}

export function resultFromOutputs(r: DecodeRequest): AnalysisResult {
  const { outputs } = r;
  let g;
  let meterScores: ResultInput['meterScores'] = [];
  let repairs: ResultInput['repairs'] = [];
  if (r.grid) g = gridFromHint(r.grid.times, r.grid.downbeat, r.grid.meter.numerator);
  else {
    const d = gridFromActivations(outputs.act);
    g = d.grid;
    meterScores = d.meterScores;
    repairs = d.repairs;
  }
  if (g.beats.length < 2) throw new AnalysisError('no-music', 'no beats found');
  const run = analyseChart({
    frames: outputs.frames,
    timeScale: outputs.timeScale,
    grid: g,
    cents: outputs.tuning.cents,
    fixedKey: r.key ? { tonic: r.key.tonic, minor: r.key.mode === 'minor' } : null,
    harmony: outputs.listening?.harmony ?? null,
    bass: outputs.listening?.bass ?? null,
    known: r.known ?? null,
    settings: r.settings,
  });
  return toAnalysisResult({
    grid: g,
    downbeat: r.grid ? r.grid.downbeat : undefined,
    meterScores,
    gridIsHint: !!r.grid,
    key: run.key,
    keyIsHint: !!r.key,
    tuning: outputs.tuning,
    segments: run.segments,
    repairs,
    duration: r.duration,
    models: r.models,
    now: r.now,
    reliability: run.reliability,
    evidence: run.evidence,
  });
}
