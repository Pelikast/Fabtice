// One requestAnimationFrame loop for the whole app. Anything that follows the
// playhead (transport readout, timeline, chart) subscribes here and reads
// `getEngine().getPosition()` itself: the position never goes through React.

import { useEffect, useRef } from 'react';

export type FrameCallback = (now: number) => void;

const callbacks = new Set<FrameCallback>();
let handle = 0;

function tick(now: number): void {
  callbacks.forEach((fn) => fn(now));
  handle = callbacks.size > 0 ? requestAnimationFrame(tick) : 0;
}

/** Calls `fn` on every animation frame until the returned function is called. */
export function onFrame(fn: FrameCallback): () => void {
  callbacks.add(fn);
  if (!handle && typeof requestAnimationFrame === 'function') handle = requestAnimationFrame(tick);
  return () => {
    callbacks.delete(fn);
  };
}

/** React hook around `onFrame`; always calls the latest `fn`. */
export function useFrame(fn: FrameCallback): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onFrame((now) => ref.current(now)), []);
}
