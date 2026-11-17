// The window « Modifier la partie » / « Ajouter une partie » (`components/PartDialog.tsx`), opened from the
// structure column: on a part in force (`id`), or on a new one (`id` null). Interface state, not saved.

import { createStore } from 'zustand/vanilla';

export interface PartDialogAt {
  /** The part in force being corrected; null: a new part. */
  id: string | null;
}

export const partDialog = createStore<{ at: PartDialogAt | null }>()(() => ({ at: null }));

export function openPartDialog(id: string): void {
  partDialog.setState({ at: { id } });
}

export function openAddPartDialog(): void {
  partDialog.setState({ at: { id: null } });
}

export function closePartDialog(): void {
  partDialog.setState({ at: null });
}
