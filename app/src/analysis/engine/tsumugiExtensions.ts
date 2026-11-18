// The fine model's own extensions (1.0.1): Tsumugi names 62 qualities with their 9, 11, 13 and
// alterations; the app adds its alterations to the extensions read from the notes (`decode.ts`). Pure.

import { TSUMUGI_LABELS, TSUMUGI_TO_APP } from './tsumugiVocab';

/** The extensions written in a Tsumugi label (« 7(b9,13) » → b9, 13; « 7(*5,b5) » → b5). */
export function labelExtensions(label: string): string[] {
  const m = /\(([^)]*)\)/.exec(label);
  if (!m) return [];
  return m[1]!.split(',').filter((x) => ['b5', 'b9', '9', '#9', '11', '#11', 'b13', '13'].includes(x));
}

/**
 * The extensions of chord `chord` (app index) as the fine model hears them, from its classes summed
 * over the chord (`detail`, 745): those of its best class among the ones folding onto that chord.
 * Null when the model gives the chord almost no weight (the decoding chose it from other evidence):
 * the notes then decide, as with the standard model.
 */
export function fineExtensions(detail: Float64Array, chord: number): string[] | null {
  let best = -1;
  let total = 0;
  for (let c = 0; c < 745; c++) {
    if (TSUMUGI_TO_APP[c] !== chord) continue;
    total += detail[c]!;
    if (best < 0 || detail[c]! > detail[best]!) best = c;
  }
  if (best < 0 || total < 0.05) return null;
  return labelExtensions(TSUMUGI_LABELS[best]!);
}
