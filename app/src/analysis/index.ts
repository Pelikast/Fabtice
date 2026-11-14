// The analyser the app uses, behind one factory, like the audio engine
// (`audio/index.ts`).
//
// In a browser the real analyser (`./fabtice.ts`: a worker running ONNX
// Runtime, models downloaded at first use) is the default. The mock is kept
// for Node (unit tests), for browsers that cannot run the real one, and for
// the address parameters the test suites and the demo use:
//   ?analyse=factice   the mock (about a second, with a simulated first download)
//   ?analyse=lente     the mock, slowly (about 8 s, plus a first « download » of 5 s)
//   ?analyse=instant   the mock, at once (no download)
//   ?analyse=echec     the mock, failing (error states)
//   ?analyse=reel      the real analyser, even on a test page (see below)
//   ?analyse=aucune    no automatic analysis after an import (`analysis/runner.ts`)
//   ?modele=complet    the real analyser with the full Beat This! network (83 MB)
//                      instead of the light one (10 MB), for comparisons
// Test pages (`?moteur=factice`, the silent engine, or `?debug`, which opens
// the store to the tests) get the mock unless they ask `?analyse=reel`: the
// existing suites import files all the time and must neither download models
// nor load the machine. The browser check of the real analyser and the Mac
// app's end-to-end test of it ask for it.

import { analysisSupported, FabticeAnalyzer } from './fabtice';
import { MockAnalyzer } from './mock';
import type { Analyzer } from './types';

export * from './types';
export { MockAnalyzer } from './mock';
export { FabticeAnalyzer } from './fabtice';

function search(): URLSearchParams | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search);
}

function param(): string | null {
  return search()?.get('analyse') ?? null;
}

/** The mock is the default where the real analyser cannot or should not run. */
function mockByDefault(): boolean {
  const q = search();
  if (!q || !analysisSupported()) return true;
  return q.get('moteur') === 'factice' || q.has('debug');
}

function realAnalyzer(): Analyzer {
  if (!analysisSupported()) return new MockAnalyzer();
  return new FabticeAnalyzer({ beatModel: search()?.get('modele') === 'complet' ? 'full' : 'light' });
}

export function createAnalyzer(mode: string | null = param()): Analyzer {
  switch (mode) {
    case 'lente':
      return new MockAnalyzer({ durationMs: 8000, downloadMs: 5000 });
    case 'instant':
      return new MockAnalyzer({ durationMs: 0, downloadMs: 0 });
    case 'echec':
      return new MockAnalyzer({ durationMs: 600, downloadMs: 0, failWith: 'failed' });
    case 'factice':
      return new MockAnalyzer();
    case 'reel':
      return realAnalyzer();
    default:
      return mockByDefault() ? new MockAnalyzer() : realAnalyzer();
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
