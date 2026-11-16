// « Séparer les instruments » in the « Nouveau projet » window (C9): unticked by default; ticked, every
// instrument the tool in use provides is selected, and a click on an instrument unselects it. The choice is
// `ui.importStems` (the separation starts by itself once the piece can play, `separation/runner.ts`): ticked
// means that list is not empty, so unselecting every instrument by hand is the same as unticking the box.

import type { StemId } from '../model/separation';
import { setImportStems } from '../store/separationActions';

/** The box ticked or not: some instrument is selected. */
export function isSeparateTicked(stems: readonly StemId[]): boolean {
  return stems.length > 0;
}

/** Ticking the box selects every instrument offered; unticking it selects none. */
export function setSeparateOnImport(on: boolean, offered: readonly StemId[]): void {
  setImportStems(on ? [...offered] : []);
}

/**
 * The tool in use can change while the box is ticked (the device was probed, the list of tools arrived): the
 * instruments it no longer provides leave the choice, the ones it newly provides join it (the box stays « all
 * selected » where the user had not unselected anything). Nothing changes while the box is unticked.
 */
export function reconcileStems(current: readonly StemId[], offeredBefore: readonly StemId[], offeredNow: readonly StemId[]): StemId[] {
  if (current.length === 0) return [];
  const kept = current.filter((s) => offeredNow.includes(s));
  const added = offeredNow.filter((s) => !offeredBefore.includes(s) && !kept.includes(s));
  // Keep the order of the instruments as the tool offers them.
  return offeredNow.filter((s) => kept.includes(s) || added.includes(s));
}
