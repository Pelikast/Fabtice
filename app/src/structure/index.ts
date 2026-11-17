// The harmony pass (stage 5 of 1.0.0): modulations, structure, simplified
// chart. Contracts and roles: `types.ts`. Callers import from here only.
//
// The three functions below are the stable entry points: `detectStructure`
// (`detect.ts`: form, letters, parts, mode) and `simplifyChart`
// (`simplify.ts`) are written; `detectKeyChanges` answers « nothing found »
// until its own file lands, which every reader already handles.

import type { AnalysedKeyChange } from '../model/analysis';
import type { HarmonyInput } from './types';

export type * from './types';
export { detectStructure } from './detect';
export { simplifyChart } from './simplify';

/** The modulations of the piece: lasting changes of key signature, never a passing II-V nor the relative key. */
export function detectKeyChanges(_input: HarmonyInput): AnalysedKeyChange[] {
  return [];
}

