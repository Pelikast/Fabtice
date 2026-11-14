// The one place that decides which separator the app uses.
//
// In a browser the real separator (`./onnx.ts`: a worker running ONNX
// Runtime Web, tools downloaded at first use) is the default. The stand-in
// (`MockSeparator`, band-filtered copies) is kept for Node (unit tests) and
// for the addresses the test suites and the demo use, at a pace chosen by the
// address:
//   ?separation=lente     slow (20 s), with a first download of the tool
//   ?separation=instant   at once, tools already there
//   ?separation=repli     the graphics path « fails » a third of the way: same tool on the processor
//   ?separation=echec     fails half way
//   ?separation=entier|faite  the demo's own states (`?demo`)
//   ?separation=reel      the REAL separator, even on a test page (see below)
//   &repli-essai=N        with it, browser checks only: the « graphics » path runs on the processor and
//                         fails at segment N (counted from 0), to check the processor taking over mid-run
// Test pages (`?moteur=factice`, the silent engine, `?debug`, which opens the
// store to the tests, and `?demo`) get the stand-in unless they ask
// `?separation=reel`: the existing suites import files all the time and must
// neither download tools nor load the machine. The browser check of the real
// separator (`test:separation-real`) and the Mac app's end-to-end test ask
// for it, as `analysis/index.ts` does for the analyser.

import { MockSeparator, type MockSeparatorOptions } from './mock';
import { OnnxSeparator } from './onnx';
import type { Separator } from './types';

export * from './types';
export { MockSeparator } from './mock';
export { OnnxSeparator, separationSupported } from './onnx';
export { SEPARATION_TOOLS_DB } from './toolsDb';

function search(): URLSearchParams | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search);
}

function param(): string | null {
  return search()?.get('separation') ?? null;
}

/** The stand-in's pace for an address parameter. */
export function mockOptionsFor(mode: string | null): MockSeparatorOptions {
  switch (mode) {
    case 'lente':
      return { durationMs: 20_000, downloadMs: 6000 };
    case 'instant':
      return { durationMs: 0, downloadMs: 0 };
    case 'repli':
      return { durationMs: 9000, downloadMs: 0, fallbackAt: 0.33 };
    case 'echec':
      return { durationMs: 2000, downloadMs: 0, failWith: 'failed' };
    default:
      return { durationMs: 4000, downloadMs: 1500 };
  }
}

/** The stand-in is the default where the real separator should not run (Node, the test and demo addresses). */
function mockByDefault(): boolean {
  const q = search();
  if (!q) return true;
  return q.has('demo') || q.has('debug') || q.get('moteur') === 'factice';
}

export function createSeparator(mode: string | null = param()): Separator {
  if (mode === 'reel') {
    const failAt = Number(search()?.get('repli-essai') ?? NaN);
    return new OnnxSeparator(Number.isInteger(failAt) && failAt >= 0 ? { simulateGpuFailureAt: failAt } : {});
  }
  // `?demo&separation=faite`: separated at once, as if the tool had been there for long.
  if (mode !== null) return new MockSeparator(mockOptionsFor(mode === 'faite' ? 'instant' : mode));
  // A browser that cannot run it gets the real one all the same: it says plainly that it cannot
  // (`unsupported`), rather than handing out filtered copies as if they were instruments.
  return mockByDefault() ? new MockSeparator(mockOptionsFor(null)) : new OnnxSeparator();
}

let current: Separator | null = null;

export function getSeparator(): Separator {
  current ??= createSeparator();
  return current;
}

/** Replaces the app-wide separator (tests, `?demo`). */
export function replaceSeparator(next: Separator): void {
  current = next;
}
