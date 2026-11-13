// The one place that decides which engine the app uses.

import type { AudioEngine } from './AudioEngine';
import { MockEngine } from './MockEngine';
import { WorkletEngine } from './WorkletEngine';

export * from './AudioEngine';
export { MockEngine } from './MockEngine';
export { WorkletEngine } from './WorkletEngine';

/**
 * Creates the app's audio engine: the real one (AudioWorklet, Signalsmith
 * Stretch) in a browser, the silent clock-based mock when the page asks for it
 * with `?moteur=factice` (tests, screenshots) and outside a browser (unit
 * tests in Node). A browser that cannot run the real engine does NOT get the
 * mock: the engine reports an `unsupported` error when a piece is loaded.
 */
export function createAudioEngine(): AudioEngine {
  if (typeof window === 'undefined' || typeof document === 'undefined') return new MockEngine();
  if (new URLSearchParams(window.location.search).get('moteur') === 'factice') return new MockEngine();
  return new WorkletEngine();
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
