// The one place that decides which engine the app uses.

import type { AudioEngine } from './AudioEngine';
import { MockEngine } from './MockEngine';

export * from './AudioEngine';
export { MockEngine } from './MockEngine';

/**
 * Creates the app's audio engine. Lot 1 returns the clock-based mock; the
 * real engine replaces it here and nowhere else.
 */
export function createAudioEngine(): AudioEngine {
  return new MockEngine();
}

let current: AudioEngine | null = null;

/** The app-wide engine, created on first use. */
export function getEngine(): AudioEngine {
  if (!current) current = createAudioEngine();
  return current;
}

/** Replaces the app-wide engine (tests, or a later engine switch). Disposes the previous one. */
export function replaceEngine(engine: AudioEngine): void {
  if (current && current !== engine) current.dispose();
  current = engine;
}
