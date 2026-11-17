// The key per passage (document version 6): which key is in force where.
//
// Merge rule (analysis + hand):
//   - first passage, from 0: the main key in force (`chartSelectors.ts#keyInForce`:
//     `corrections.key`, else `analysis.key`, else unknown);
//   - later passages: `corrections.keyChanges` when the user touched the
//     modulations (the whole list then, a deleted analysed one is simply
//     absent), else `analysis.keyChanges`.
// A new analysis replaces `analysis` only, so it never undoes what was done by
// hand. Keys are stored at concert pitch in the original key (display:
// `harmony/display.ts`).

import type { Key, KeyChange } from '../model/harmony';
import type { Seconds } from '../model/project';
import { keyInForce, type Provenance } from './chartSelectors';
import type { AppState } from './store';

export type KeySlice = Pick<AppState, 'analysis' | 'corrections'>;

/** A stretch of the piece in one key, from `time` to the next passage (or the end). */
export interface KeyPassage {
  /** Source time where it starts: 0 for the first passage. */
  time: Seconds;
  /** Null only for the first passage, when no key is known. */
  key: Key | null;
  origin: Provenance;
  /** The analysis' confidence, when the passage comes from it. */
  confidence: number | null;
}

type Analysis = NonNullable<KeySlice['analysis']>;
let memo: {
  analysedKey: Analysis['key'] | undefined;
  analysedChanges: Analysis['keyChanges'] | undefined;
  key: KeySlice['corrections']['key'];
  changes: KeySlice['corrections']['keyChanges'];
  value: KeyPassage[];
} | null = null;

/**
 * Every passage in force, ascending, the first one from 0 (memoised on what it reads, for React
 * selectors: the analysed key and modulations, not the whole result, so that a refresh of the
 * structure alone keeps the same passages).
 */
export function keyPassages(s: KeySlice): KeyPassage[] {
  const { analysis, corrections } = s;
  if (memo && memo.analysedKey === analysis?.key && memo.analysedChanges === analysis?.keyChanges && memo.key === corrections.key && memo.changes === corrections.keyChanges) {
    return memo.value;
  }
  const main = keyInForce(s);
  const first: KeyPassage = { time: 0, key: main.key, origin: main.origin, confidence: main.confidence };
  const later: KeyPassage[] =
    corrections.keyChanges !== null
      ? corrections.keyChanges.map((c) => ({ time: c.time, key: c.key, origin: 'manual', confidence: null }))
      : (analysis?.keyChanges ?? []).map((c) => ({ time: c.time, key: c.key, origin: 'analysis', confidence: c.key.confidence }));
  const value = [first, ...later];
  memo = { analysedKey: analysis?.key, analysedChanges: analysis?.keyChanges, key: corrections.key, changes: corrections.keyChanges, value };
  return value;
}

/** The passage heard at `time` (the first one before 0). */
export function keyPassageAt(s: KeySlice, time: Seconds): KeyPassage {
  const passages = keyPassages(s);
  let found = passages[0]!;
  for (const p of passages) {
    if (p.time <= time) found = p;
    else break;
  }
  return found;
}

/** « Tonalité à cet instant »: the key in force at `time` (source seconds); null when unknown. */
export function keyAt(s: KeySlice, time: Seconds): Key | null {
  return keyPassageAt(s, time).key;
}

let changesMemo: { passages: KeyPassage[]; value: KeyChange[] } | null = null;

/** The later passages in force (modulations) as plain changes: what a hand edit starts from (memoised on the passages). */
export function keyChangesInForce(s: KeySlice): KeyChange[] {
  const passages = keyPassages(s);
  if (changesMemo && changesMemo.passages === passages) return changesMemo.value;
  const value = passages.slice(1).map((p) => ({ time: p.time, key: { tonic: p.key!.tonic, mode: p.key!.mode } }));
  changesMemo = { passages, value };
  return value;
}
