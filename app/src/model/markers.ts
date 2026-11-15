// Repères (lot 4), kept with the piece (document version 4).
//
// Two kinds of markers, one notion each:
//   - named loops (« Pont », « solo de Lester »…), here: a loop saved under a
//     name, in SOURCE seconds like `LoopState.region` (snapped to the sub-grid
//     or free, as it was when saved). The list keeps the user's order.
//   - sections (A, B, solo…): there is only one notion of section, the
//     section letters of the chord chart (`Corrections.sections`, lot 2),
//     placed on a bar line by hand. A section runs from its bar line to the
//     next section's (or the end of the piece): `markers/sections.ts`.
//     They are not duplicated here.

import type { TimeRange } from './project';

export interface NamedLoop {
  /** Random, stable identifier (React keys, keyboard focus). */
  id: string;
  /** 1 to 40 characters. */
  name: string;
  /** Source seconds, `start < end`. */
  region: TimeRange;
}

export interface Markers {
  /** In the user's order (not necessarily by time). */
  loops: NamedLoop[];
}

export const MARKER_NAME_MAX = 40;

export function emptyMarkers(): Markers {
  return { loops: [] };
}
