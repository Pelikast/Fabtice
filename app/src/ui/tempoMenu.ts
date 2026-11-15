// Where the bar menu (`components/TempoFixMenu.tsx`) is open, if it is: the
// ruler, the chart and the keyboard open it here.

import { createStore } from 'zustand/vanilla';

export interface TempoMenuAt {
  /** Bar index of the grid in force. */
  bar: number;
  /** Viewport point where it opens. */
  x: number;
  y: number;
  /** Where it was opened from, to give the focus back on close. */
  opener: HTMLElement | null;
}

export const tempoMenuStore = createStore<{ at: TempoMenuAt | null }>()(() => ({ at: null }));

export function openTempoMenu(bar: number, x: number, y: number, opener: HTMLElement | null = null): void {
  tempoMenuStore.setState({ at: { bar, x, y, opener } });
}

export function closeTempoMenu(): void {
  const at = tempoMenuStore.getState().at;
  tempoMenuStore.setState({ at: null });
  at?.opener?.focus?.({ preventScroll: true });
}

/** Whether a key event asks for the context menu (the menu key, or Shift+F10). */
export function isMenuKey(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);
}

