// The harmony pass (stage 5 of 1.0.0): modulations, structure, simplified
// chart. Contracts and roles: `types.ts`. Callers import from here only.
//
// The three functions below are the stable entry points: `detectStructure`
// (`detect.ts`: form, letters, parts, mode) and `simplifyChart`
// (`simplify.ts`), `detectKeyChanges` (`keys.ts`).

import type { AnalysedKeyChange } from '../model/analysis';
import { detectKeyChanges as detectKeyChangesImpl } from './keys';
import type { HarmonyInput } from './types';

export type * from './types';
export { detectStructure } from './detect';
export { simplifyChart } from './simplify';

/** The modulations of the piece: lasting changes of key signature, never a passing II-V nor the relative key (`keys.ts`). */
export function detectKeyChanges(input: HarmonyInput): AnalysedKeyChange[] {
  return detectKeyChangesImpl(input);
}

