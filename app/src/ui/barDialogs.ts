// The two small windows opened from the bar menu (`components/TempoFixMenu.tsx`):
// « Correction de la courbe en tapant le tempo » (`components/TapFixDialog.tsx`)
// and « Changer la signature rythmique » (`components/MeterDialog.tsx`).
// Each is open at one bar of the grid in force, or closed.

import { createStore } from 'zustand/vanilla';

export interface BarDialogAt {
  /** Bar index of the grid in force. */
  bar: number;
}

export const tapFixDialog = createStore<{ at: BarDialogAt | null }>()(() => ({ at: null }));
export const meterDialog = createStore<{ at: BarDialogAt | null }>()(() => ({ at: null }));

export function openTapFix(bar: number): void {
  meterDialog.setState({ at: null });
  tapFixDialog.setState({ at: { bar } });
}

export function closeTapFix(): void {
  tapFixDialog.setState({ at: null });
}

export function openMeterDialog(bar: number): void {
  tapFixDialog.setState({ at: null });
  meterDialog.setState({ at: { bar } });
}

export function closeMeterDialog(): void {
  meterDialog.setState({ at: null });
}
