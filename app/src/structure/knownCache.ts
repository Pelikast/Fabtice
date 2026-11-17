// The known charts of standards found for a title, as the harmony pass got them (`refresh.ts`):
// transient, never stored. The « Grille complète simplifiée » reads them from here
// (`store/simplifiedSelectors.ts`) so that it uses the same charts as the pass, without asking
// the library again on every change. Keyed by title; emptied when the library changes.

import type { KnownStandard } from './types';

const EMPTY: readonly KnownStandard[] = Object.freeze([]) as readonly KnownStandard[];
const byTitle = new Map<string, KnownStandard[]>();

/** The known charts found for `title` (the same array until they change); empty when none or not looked up yet. */
export function knownStandardsFor(title: string | null | undefined): readonly KnownStandard[] {
  if (!title) return EMPTY;
  return byTitle.get(title) ?? EMPTY;
}

/** Keeps what was found for `title`. Returns true when it differs from what was kept. */
export function setKnownStandards(title: string, list: readonly KnownStandard[]): boolean {
  const old = byTitle.get(title);
  if (old && old.length === list.length && old.every((k, i) => k.chart === list[i]!.chart && k.titleScore === list[i]!.titleScore)) return false;
  if (!old && list.length === 0) {
    byTitle.set(title, EMPTY as KnownStandard[]);
    return false;
  }
  byTitle.set(title, [...list]);
  return true;
}

/** Forgets everything (the library changed: what a title finds may have changed too). */
export function clearKnownStandards(): void {
  byTitle.clear();
}
