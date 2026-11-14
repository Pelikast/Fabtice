// The one place that decides which offline renderer the app uses.
//
// In a browser the real one (`./rubberband.ts`: Rubber Band R3 « finer » in a
// worker, its binary fetched only when a render starts) is the default. The
// stand-in (`MockRenderer`) is kept for Node (unit tests), for browsers that
// cannot run the real one, and for the address parameters the test suites and
// the demo use, like the analyser's (`analysis/index.ts`):
//   ?rendu=lent    the stand-in, slowly (to see the waiting screen)
//   ?rendu=reel    the real renderer, even on a test page
//   ?rendu=factice the stand-in
// Test pages (`?moteur=factice`, the silent engine, `?debug`, `?demo`) get the
// stand-in unless they ask `?rendu=reel`: the existing suites must not load
// the engine or the machine. The browser check of the real renderer, and the
// Mac app's end-to-end test of it, ask for it.

import { MockRenderer } from './mock';
import { RubberBandRenderer, renderSupported } from './rubberband';
import type { OfflineRenderer } from './types';

export * from './types';
export { MockRenderer } from './mock';
export { RubberBandRenderer } from './rubberband';

function search(): URLSearchParams | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search);
}

/** The stand-in is the default where the real renderer cannot or should not run. */
function mockByDefault(): boolean {
  const q = search();
  if (!q || !renderSupported()) return true;
  return q.get('moteur') === 'factice' || q.has('debug') || q.has('demo');
}

export function createRenderer(mode: string | null = search()?.get('rendu') ?? null): OfflineRenderer {
  switch (mode) {
    case 'lent':
      return new MockRenderer({ msPerSecond: 60 });
    case 'factice':
      return new MockRenderer();
    case 'reel':
      return renderSupported() ? new RubberBandRenderer() : new MockRenderer();
    default:
      return mockByDefault() ? new MockRenderer() : new RubberBandRenderer();
  }
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
