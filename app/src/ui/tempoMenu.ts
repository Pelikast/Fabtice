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


// The fingers that are down now. A bar menu opened by a long press appears under the finger that is still on the
// screen: the click the browser may send when it lifts must not choose the entry under it. (A mouse is not tracked:
// its right click opens the menu and its next click is meant.)
const down = new Set<number>();
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && down.add(e.pointerId), true);
  for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, (e) => down.delete(e.pointerId), true);
}

/** How long after the last finger is lifted (or after opening, with none down) the menu ignores clicks. */
export const MENU_ARM_MS = 400;
/** If a release is never seen (a lost event), the menu listens again after this long. */
const MENU_ARM_MAX_MS = 3000;

/** Calls `ready` once the pointer that opened the menu is up, then a little later. Returns what cancels it. */
export function whenPointerReleased(ready: () => void): () => void {
  let id = 0;
  let off = () => {};
  if (down.size === 0) {
    // Opened with a mouse or the keyboard: listening at once.
    ready();
    return () => {};
  }
  const arm = () => {
    off();
    window.clearTimeout(id);
    id = window.setTimeout(ready, MENU_ARM_MS);
  };
  const watch = () => {
    if (down.size === 0) arm();
  };
  for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, watch);
  off = () => {
    for (const type of ['pointerup', 'pointercancel'] as const) window.removeEventListener(type, watch);
  };
  id = window.setTimeout(arm, MENU_ARM_MAX_MS);
  return () => {
    off();
    window.clearTimeout(id);
  };
}
