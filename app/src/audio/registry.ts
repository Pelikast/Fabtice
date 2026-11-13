// Decoded audio of the open project, kept out of the store (it can weigh
// hundreds of megabytes). Keyed by `AudioRef.id`. The engine receives the same
// arrays; the timeline reads them here to draw waveforms.

import type { EngineTrack } from './AudioEngine';

export interface DecodedAudio {
  /** One Float32 PCM array per channel, at `sampleRate`. */
  channels: Float32Array[];
  sampleRate: number;
}

const audio = new Map<string, DecodedAudio>();
const listeners = new Set<() => void>();

export function registerAudio(id: string, decoded: DecodedAudio): void {
  audio.set(id, decoded);
  listeners.forEach((fn) => fn());
}

export function getAudio(id: string): DecodedAudio | undefined {
  return audio.get(id);
}

export function dropAudio(id: string): void {
  if (audio.delete(id)) listeners.forEach((fn) => fn());
}

export function clearAudio(): void {
  audio.clear();
  listeners.forEach((fn) => fn());
}

/** Called after every change (for waveform caches). Returns the unsubscribe function. */
export function onAudioChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Builds the engine's view of a registered track. */
export function engineTrack(trackId: string, audioId: string): EngineTrack {
  const a = audio.get(audioId);
  if (!a) throw new Error(`no audio registered under ${audioId}`);
  return { id: trackId, channels: a.channels, sampleRate: a.sampleRate };
}
