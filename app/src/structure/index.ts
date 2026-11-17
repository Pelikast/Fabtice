// The harmony pass (stage 5 of 1.0.0): modulations, structure, simplified
// chart. Contracts and roles: `types.ts`. Callers import from here only.
//
// The three functions below are the stable entry points. Until their own
// files land they answer « nothing found », which every reader already
// handles (no modulation, no structure, no simplified chart).

import type { AnalysedKeyChange } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { DetectedStructure } from '../model/structure';
import { detectKeyChanges as detectKeyChangesImpl } from './keys';
import type { HarmonyInput, SimplifiedChart, SimplifyInput } from './types';

export type * from './types';

/** The modulations of the piece: lasting changes of key signature, never a passing II-V nor the relative key (`keys.ts`). */
export function detectKeyChanges(input: HarmonyInput): AnalysedKeyChange[] {
  return detectKeyChangesImpl(input);
}

/** The structure of the piece (mode, form, letters, parts); null when nothing can be said. */
export function detectStructure(_input: HarmonyInput, _keyChanges: readonly { time: Seconds; key: Key }[]): DetectedStructure | null {
  return null;
}

/** « Grille complète simplifiée »; null when the chart has no form to fold (it is then shown in full). */
export function simplifyChart(_input: SimplifyInput): SimplifiedChart | null {
  return null;
}
