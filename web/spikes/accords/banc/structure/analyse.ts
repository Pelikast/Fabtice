// One analysis with the structural evidence switched on or off: pool → repeats
// and / or known chart → decode → segments. Used by the variants
// `reprises`, `grille-connue`, `structure` and by the evaluation (`banc/structure.ts`).

import type { PooledUnit } from '../../../../../app/src/analysis/engine/chords';
import { applyEvidence, type EvidenceSource } from '../../../../../app/src/analysis/engine/evidence';
import { findRepeats, type RepeatAnalysis, type RepeatOptions } from '../../../../../app/src/analysis/engine/repeats';
import { findChartCandidates, fitKnownChart, type ChartFit, type ChartOptions } from '../../../../../app/src/analysis/engine/knownChart';
import { reliability, reliabilityFeatures, type ReliabilityFeatures } from '../../../../../app/src/analysis/engine/reliability';
import type { NetworkResult } from '../networks';
import type { VariantInput, VariantOutput } from '../types';
import { decode, output, prepare, standards, type Decoding, type Prepared } from './commun';

export interface StructureConfig {
  repeats: Partial<RepeatOptions> | null;
  chart: Partial<ChartOptions> | null;
  /** Title used for the chart search (default: the piece's). */
  title?: string;
  /** Use the reliability function for « doubtful » and the confidence. */
  reliability?: boolean;
}

export interface StructureRun {
  prepared: Prepared;
  units: PooledUnit[];
  decoding: Decoding;
  repeats: RepeatAnalysis | null;
  chart: ChartFit | null;
  /** Per segment: features and probability of being right. */
  features: ReliabilityFeatures[];
  prob: number[];
  out: VariantOutput;
}

export function analyse(input: VariantInput, net: NetworkResult, cfg: StructureConfig): StructureRun {
  const p = prepare(input, net);
  const sources: EvidenceSource[] = [];
  let rep: RepeatAnalysis | null = null;
  if (cfg.repeats) {
    rep = findRepeats(p.units, p.grid.numbers, cfg.repeats);
    sources.push(rep.source);
  }
  let chart: ChartFit | null = null;
  if (cfg.chart) {
    const title = cfg.title ?? input.title;
    const lib = standards();
    const cands = title ? findChartCandidates(lib.index, title) : [];
    if (cands.length) {
      chart = fitKnownChart(p.units, p.grid.numbers, p.grid.beatsPerBar, p.key, cands, cfg.chart);
      if (chart.accepted) sources.push(chart.source);
    }
  }
  const units = applyEvidence(p.units, sources);
  const decoding = decode(p, units);
  const features = reliabilityFeatures(decoding.segments, p.units, rep, chart?.accepted ? chart : null);
  const prob = features.map((f) => reliability(f));
  const out = output(p, decoding.segments, cfg.reliability ? prob : undefined);
  return { prepared: p, units, decoding, repeats: rep, chart, features, prob, out };
}
