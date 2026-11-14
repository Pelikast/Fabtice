// The one place that decides which separator the app uses.
//
// Today: the stand-in (`MockSeparator`, band-filtered copies) everywhere, at
// a pace chosen by the address for the screens and the tests:
//   ?separation=lente     slow (20 s), with a first download of the tool
//   ?separation=instant   at once, tools already there
//   ?separation=repli     the graphics path « fails » a third of the way: same tool on the processor
//   ?separation=echec     fails half way
// The separation agent adds the real separator (ONNX Runtime Web) here, as
// the default in a browser, keeping the stand-in for Node, `?demo` and the
// test addresses, as `analysis/index.ts` does for the analyser.

import { MockSeparator, type MockSeparatorOptions } from './mock';
import type { Separator } from './types';

export * from './types';
export { MockSeparator } from './mock';

/** Name of the database the separation tools are kept in (`analysis/models/store.ts#openModelStore`). */
export const SEPARATION_TOOLS_DB = 'fabtice-separation-tools';

function param(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('separation');
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

export function createSeparator(): Separator {
  const mode = param();
  // `?demo&separation=faite`: separated at once, as if the tool had been there for long.
  return new MockSeparator(mockOptionsFor(mode === 'faite' ? 'instant' : mode));
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
