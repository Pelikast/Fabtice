// Opt-in thresholds of the structure bench (`bench.test.ts`).
//
// Empty while the detectors are stubs: the bench then only prints its table.
// A detector author raises the figures his work reaches, so that a later
// change that loses them fails the tests. Each entry names one configuration
// (level, evidence, known chart) and one metric key of `score.ts#METRICS`;
// `min` for a rate to keep above, `max` for an error to keep below.

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

export const STRUCTURE_BENCH_THRESHOLDS: readonly Threshold[] = [
  // e.g. { level: 'realiste', evidence: 'stems', known: false, metric: 'chorusLength', min: 0.8 },
  //      { level: 'realiste', evidence: 'stems', known: false, metric: 'modFalseAlarms', max: 2 },

  // ---- modulations (`keys.ts`; the subset, see `bench.test.ts`): no false alarm up to the « realiste » level
  { level: 'parfait', evidence: 'stems', known: false, metric: 'modFalseAlarms', max: 0 },
  { level: 'parfait', evidence: 'stems', known: false, metric: 'modP', min: 1 },
  { level: 'parfait', evidence: 'stems', known: false, metric: 'modR', min: 1 },
  { level: 'parfait', evidence: 'stems', known: false, metric: 'modKey', min: 0.9 },
  { level: 'realiste', evidence: 'stems', known: false, metric: 'modFalseAlarms', max: 0 },
  { level: 'realiste', evidence: 'stems', known: true, metric: 'modFalseAlarms', max: 0 },
  { level: 'realiste', evidence: 'mix', known: false, metric: 'modFalseAlarms', max: 0 },
  { level: 'realiste', evidence: 'stems', known: false, metric: 'modP', min: 0.95 },
  { level: 'realiste', evidence: 'stems', known: false, metric: 'modR', min: 0.85 },
  { level: 'realiste', evidence: 'stems', known: true, metric: 'modR', min: 0.95 },
  { level: 'realiste', evidence: 'stems', known: false, metric: 'modPos', max: 0.6 },
  { level: 'mauvais', evidence: 'stems', known: false, metric: 'modFalseAlarms', max: 2 },
  // ---- end of the modulations
];
