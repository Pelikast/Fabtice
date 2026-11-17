// The window « Changer de tonalité » / « Modifier la modulation » (`components/ModulationDialog.tsx`): opened
// at a bar of the chart or the ruler (a click on the mark, or the bar menu), or closed. Interface state.

import { createStore } from 'zustand/vanilla';

export interface KeyDialogAt {
  /** Bar index of the grid in force: where the modulation is, or where a new one is asked. */
  bar: number;
}

export const keyDialog = createStore<{ at: KeyDialogAt | null }>()(() => ({ at: null }));

export function openKeyDialog(bar: number): void {
  keyDialog.setState({ at: { bar } });
}

export function closeKeyDialog(): void {
  keyDialog.setState({ at: null });
}
