// Opt-in thresholds of the structure bench (`bench.test.ts`).
//
// A detector author raises the figures his work reaches, so that a later
// change that loses them fails the tests. Each entry names one configuration
// (level, evidence, known chart) and one metric key of `score.ts#METRICS`;
// `min` for a rate to keep above, `max` for an error to keep below.
//
// Locked at the first version of the structure pass (stage 5), a few points
// under what the subset (16 pieces, `npm test`) and the whole corpus
// (`FABTICE_STRUCTURE_FULL=1`, 2 draws) both reach: a margin for the subset's
// small counts, not room for a regression.

import type { NoiseLevel } from './noise';
import type { EvidenceKind } from './simEvidence';

export interface Threshold {
  level: NoiseLevel;
  evidence: EvidenceKind;
  known: boolean;
  metric: string;
  min?: number;
  max?: number;
}

const at = (level: NoiseLevel, evidence: EvidenceKind, known: boolean, list: Record<string, { min?: number; max?: number }>): Threshold[] =>
  Object.entries(list).map(([metric, v]) => ({ level, evidence, known, metric, ...v }));

export const STRUCTURE_BENCH_THRESHOLDS: readonly Threshold[] = [
  // ---- the chart without errors: the form, the parts, the cahier's example
  ...at('parfait', 'stems', false, {
    chorusLength: { min: 0.88 },
    formExact: { min: 0.88 },
    sectionPairs: { min: 0.88 },
    mode: { min: 0.95 },
    partF: { min: 0.9 },
    partType: { min: 0.92 },
    longSolo: { min: 0.95 },
    soloSplit: { min: 0.9 },
    instStem: { min: 0.9 },
    instWrong: { max: 0.03 },
    simpChord: { min: 0.93 },
    simpPlaces: { min: 0.98 },
    chainChord: { min: 0.75 },
    autumnChart: { min: 1 },
    autumnChain: { min: 1 },
  }),
  ...at('parfait', 'mix', false, { instNamedNoStems: { max: 0 }, partF: { min: 0.8 }, autumnChain: { min: 1 } }),
  ...at('parfait', 'stems', true, { chorusLength: { min: 0.95 }, formExact: { min: 0.95 }, chainChord: { min: 0.82 }, autumnChain: { min: 1 } }),
  // ---- about a quarter of the chords wrong, a beat lost, a bar dropped
  ...at('realiste', 'stems', false, {
    chorusLength: { min: 0.75 },
    formExact: { min: 0.58 },
    sectionPairs: { min: 0.75 },
    mode: { min: 0.95 },
    partF: { min: 0.78 },
    partType: { min: 0.75 },
    longSolo: { min: 0.85 },
    soloSplit: { min: 0.7 },
    instStem: { min: 0.85 },
    instWrong: { max: 0.08 },
    simpChord: { min: 0.72 },
    simpPlaces: { min: 0.95 },
  }),
  ...at('realiste', 'stems', true, { chorusLength: { min: 0.9 }, formExact: { min: 0.95 }, partF: { min: 0.82 }, chainChord: { min: 0.63 }, chainPlaces: { min: 0.83 } }),
  ...at('realiste', 'mix', false, { instNamedNoStems: { max: 0 }, partF: { min: 0.65 }, longSolo: { min: 0.85 } }),
  // ---- about half the chords wrong: the known chart is what holds
  ...at('mauvais', 'stems', true, { chorusLength: { min: 0.88 }, formExact: { min: 0.95 }, partF: { min: 0.72 }, chainChord: { min: 0.48 }, instWrong: { max: 0.16 } }),
  ...at('mauvais', 'mix', false, { instNamedNoStems: { max: 0 } }),
];
