// The analyser the app uses, behind one factory, like the audio engine
// (`audio/index.ts`).
//
// Until the real analyser exists, every build uses `MockAnalyzer`. When it
// lands, `createAnalyzer()` returns it by default and keeps the mock for
// `?analyse=factice` and for Node (unit tests). Address parameters for
// development and browser checks:
//   ?analyse=factice   the mock (default today)
//   ?analyse=lente     the mock, slowly (about 8 s, plus a first « download » of 5 s)
//   ?analyse=instant   the mock, at once (no download)
//   ?analyse=echec     the mock, failing (error states)
//   ?analyse=aucune    no automatic analysis after an import (`analysis/runner.ts`)

import { MockAnalyzer } from './mock';
import type { Analyzer } from './types';

export * from './types';
export { MockAnalyzer } from './mock';

function param(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search).get('analyse');
}

export function createAnalyzer(mode: string | null = param()): Analyzer {
  switch (mode) {
    case 'lente':
      return new MockAnalyzer({ durationMs: 8000, downloadMs: 5000 });
    case 'instant':
      return new MockAnalyzer({ durationMs: 0, downloadMs: 0 });
    case 'echec':
      return new MockAnalyzer({ durationMs: 600, downloadMs: 0, failWith: 'failed' });
    default:
      return new MockAnalyzer();
  }
}

let current: Analyzer | null = null;

/** The app-wide analyser, created on first use. */
export function getAnalyzer(): Analyzer {
  current ??= createAnalyzer();
  return current;
}

/** Replaces the analyser (tests, the demo piece). The previous one is disposed. */
export function replaceAnalyzer(next: Analyzer): void {
  if (current && current !== next) current.dispose();
  current = next;
}

/** True when the address asks for no automatic analysis (`?analyse=aucune`). */
export function autoAnalysisDisabled(): boolean {
  return param() === 'aucune';
}
