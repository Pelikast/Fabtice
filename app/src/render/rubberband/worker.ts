// The render worker: Rubber Band R3 « finer » (WebAssembly) rendering one
// track, off the interface's thread. The page (`../rubberband.ts`) ends it
// when the render ends or is cancelled: the memory of a WebAssembly instance
// can only be given back that way.
//
// The binary is fetched here, from the app itself (a file of the build, see
// `./SOURCES.md`); the no-SIMD build is used: measured as fast as the SIMD one
// (within the noise) for this engine, and it runs everywhere.

import wasmUrl from './rubberband-nosimd.wasm?url';
import { RenderJob } from './job';
import type { ToRenderWorker } from './protocol';
import { RubberBandEngine } from './stretcher';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToRenderWorker>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

async function loadEngine(): Promise<RubberBandEngine> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`fetch ${wasmUrl}: ${response.status}`);
  return RubberBandEngine.load(await response.arrayBuffer());
}

const job = new RenderJob(loadEngine, (message, transfer) => scope.postMessage(message, transfer ?? []));
scope.onmessage = (e) => job.receive(e.data);
