// Peaks of the registered audio, computed in the background and cached.
//
// The audio stays where it is (`audio/registry.ts`): copying hundreds of
// megabytes to a worker would cost more than reading it. Instead the pyramids
// are built in slices of a few milliseconds spread over macrotasks, so a frame
// is never delayed by more than one slice. `onProgress` fires (throttled) as
// bins become available, so waveforms fill in from the left.

import { getAudio, onAudioChange, type PcmAudio } from '../audio/registry';
import { PeakBuilder, type PeakPyramid } from './peaks';

/** Longest a single slice may run, in milliseconds. */
export const SLICE_MS = 3;
const PROGRESS_INTERVAL_MS = 120;

interface Entry {
  audio: PcmAudio;
  builder: PeakBuilder;
}

const entries = new Map<string, Entry>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let scheduled = false;
let lastProgress = 0;
let watching = false;

function notify(): void {
  listeners.forEach((fn) => fn());
}

function schedule(): void {
  if (scheduled || queue.length === 0) return;
  scheduled = true;
  setTimeout(run, 0);
}

function run(): void {
  scheduled = false;
  const id = queue[0];
  if (id === undefined) return;
  const entry = entries.get(id);
  if (!entry) {
    queue.shift();
    schedule();
    return;
  }
  const done = entry.builder.step(SLICE_MS);
  const now = performance.now();
  if (done) {
    queue.shift();
    lastProgress = now;
    notify();
  } else if (now - lastProgress >= PROGRESS_INTERVAL_MS) {
    lastProgress = now;
    notify();
  }
  schedule();
}

/** Keeps the cache in step with the registry: new audio is queued, gone audio dropped. */
function sync(): void {
  for (const [id, entry] of entries) {
    if (getAudio(id) !== entry.audio) {
      entries.delete(id);
      const at = queue.indexOf(id);
      if (at >= 0) queue.splice(at, 1);
    }
  }
}

function watch(): void {
  if (watching) return;
  watching = true;
  onAudioChange(() => {
    sync();
    notify();
  });
}

/**
 * The pyramid of an audio, possibly still being built (check `ready`), or
 * undefined if nothing is registered under this id. Starts the computation on
 * first use.
 */
export function getPeaks(audioId: string): PeakPyramid | undefined {
  watch();
  const audio = getAudio(audioId);
  if (!audio) {
    entries.delete(audioId);
    return undefined;
  }
  let entry = entries.get(audioId);
  if (entry && entry.audio !== audio) {
    entries.delete(audioId);
    entry = undefined;
  }
  if (!entry) {
    entry = { audio, builder: new PeakBuilder(audio) };
    entries.set(audioId, entry);
    if (!entry.builder.pyramid.ready) {
      queue.push(audioId);
      schedule();
    }
  }
  return entry.builder.pyramid;
}

/** Called when a pyramid progresses or the registry changes. Returns the unsubscribe function. */
export function onPeaksChange(fn: () => void): () => void {
  watch();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
