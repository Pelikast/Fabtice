// From the group scores of an excerpt to one `InstrumentGuess` (or null), with the thresholds
// measured on the bench (`web/spikes/structure/instruments/analyse.py#RULE` holds the same values
// and the same rule: change both together).
//
// A WRONG instrument name is the costly error: when in doubt the answer is « Vents » (`winds`),
// or nothing for a lead that is not a wind. Piano, guitar and voice compete for the top but are
// never named here: they have separated tracks of their own, and through the « vieux disque »
// chain guitar and voice are read as piano (bench, synthetic leads). The confidence is the
// margin between the best named group and the second: 1 - second / best.

import { WINDS_UNSURE } from '../../model/structure';
import type { InstrumentGuess } from '../types';
import { NAMEABLE_OTHERS, NAMED_GROUPS, WIND_GROUPS, type GroupScores, type NamedGroup } from './model';

export interface DecisionRule {
  /** Below this score for every named group and both wind families: nothing is played. */
  silence: number;
  /** Margin needed to name a wind instrument. */
  threshold: number;
  /** Margin needed to name a lead that is not a wind (`NAMEABLE_OTHERS`: vibraphone, violin, organ). */
  otherThreshold: number;
  /** The best named score must also reach this to give a name. */
  minScore: number;
  /** A non-wind top that is unsure still says « Vents » when the wind evidence reaches this and half the top. */
  windsFamily: number;
}

/** Chosen on the bench: about 4 to 8 % of wrong names among the named ones on real players through the « vieux disque » chain. */
export const DECISION: Readonly<DecisionRule> = { silence: 0.03, threshold: 0.7, otherThreshold: 0.75, minScore: 0.3, windsFamily: 0.15 };

const isWind = (g: NamedGroup) => (WIND_GROUPS as readonly string[]).includes(g);

/** The answer for the mean group scores of an excerpt. */
export function decide(s: GroupScores, rule: DecisionRule = DECISION): InstrumentGuess | null {
  let best: NamedGroup = NAMED_GROUPS[0]!;
  let second = -1;
  for (const g of NAMED_GROUPS) {
    if (s[g] > s[best]) {
      second = s[best];
      best = g;
    } else if (g !== best && s[g] > second) second = s[g];
  }
  const top = s[best];
  if (top < rule.silence && s.brass < rule.silence && s.woodwind < rule.silence) return null;
  const margin = top > 0 ? Math.max(0, 1 - Math.max(0, second) / top) : 0;
  const sure = top >= rule.minScore;
  if (isWind(best)) {
    return sure && margin >= rule.threshold ? { instrument: best, confidence: margin } : { instrument: WINDS_UNSURE, confidence: margin };
  }
  if ((NAMEABLE_OTHERS as readonly string[]).includes(best) && sure && margin >= rule.otherThreshold) return { instrument: best, confidence: margin };
  const windEvidence = Math.max(s.brass, s.woodwind, ...WIND_GROUPS.map((g) => s[g]));
  if (windEvidence >= rule.windsFamily && windEvidence >= 0.5 * top) return { instrument: WINDS_UNSURE, confidence: margin };
  return null;
}
