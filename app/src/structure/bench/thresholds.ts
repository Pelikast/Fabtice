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
];
