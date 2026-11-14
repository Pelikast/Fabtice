// The one place that decides which offline renderer the app uses.
//
// Today: the stand-in (`MockRenderer`) everywhere. `?rendu=lent` slows it
// down (to see the waiting screen). The render agent adds the real one
// (Rubber Band R3 « finer », in a worker) here, as the default in a browser.

import { MockRenderer } from './mock';
import type { OfflineRenderer } from './types';

export * from './types';
export { MockRenderer } from './mock';

export function createRenderer(): OfflineRenderer {
  const slow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('rendu') === 'lent';
  return new MockRenderer(slow ? { msPerSecond: 60 } : {});
}

let current: OfflineRenderer | null = null;

export function getRenderer(): OfflineRenderer {
  current ??= createRenderer();
  return current;
}

/** Replaces the app-wide renderer (tests). */
export function replaceRenderer(next: OfflineRenderer): void {
  current = next;
}
