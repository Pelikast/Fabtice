// Decoded audio of the open project, kept out of the store (it can weigh
// hundreds of megabytes). Keyed by `AudioRef.id`.
//
// ONE copy of the samples (lot 3): the registry holds each audio in the
// app-wide 16-bit form (`audio/pcm.ts`), the engine receives the same chunks
// (`engineTrack()`), the timeline reads them to draw the waveforms, and the
// analysis, the separation, the offline render and the export read them again
// from here (`readPcm`, or a transient Float32 copy with `pcmToChannels` /
// `pcmToMono`) and let their copy go. Nothing else may keep decoded audio.
//
// Hidden tracks (the whole piece while the separated instruments are shown,
// or the reverse) stay registered: coming back to them is instant.

import type { EngineTrack } from './AudioEngine';
import { pcmFromChannels, type PcmAudio } from './pcm';

/** Decoded audio as the import produces it (Float32, transient): converted to `PcmAudio` when registered. */
export interface DecodedAudio {
  /** One Float32 PCM array per channel, at `sampleRate`. */
  channels: Float32Array[];
  sampleRate: number;
}

export type { PcmAudio };

const audio = new Map<string, PcmAudio>();
const listeners = new Set<() => void>();

const isPcm = (a: PcmAudio | DecodedAudio): a is PcmAudio => 'chunks' in a;

/** Converts Float32 audio to the in-memory form (identity for audio already converted). */
export function toPcm(a: PcmAudio | DecodedAudio): PcmAudio {
  return isPcm(a) ? a : pcmFromChannels(a.channels, a.sampleRate);
}

/**
 * Registers an audio under `id`. Float32 input is converted (16-bit, shared
 * memory) and NOT kept: the caller should drop its own reference.
 */
export function registerAudio(id: string, decoded: PcmAudio | DecodedAudio): PcmAudio {
  const pcm = toPcm(decoded);
  audio.set(id, pcm);
  listeners.forEach((fn) => fn());
  return pcm;
}

export function getAudio(id: string): PcmAudio | undefined {
  return audio.get(id);
}

/** Every registered audio id (memory checks, the usage shown to the user). */
export function registeredAudioIds(): string[] {
  return [...audio.keys()];
}

/** Bytes of samples held by the registry (the engine holds no copy of its own). */
export function registryBytes(): number {
  let n = 0;
  for (const a of audio.values()) n += a.bytes;
  return n;
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

/** Builds the engine's view of a registered track: the very same chunks, no copy. */
export function engineTrack(trackId: string, audioId: string): EngineTrack {
  const a = audio.get(audioId);
  if (!a) throw new Error(`no audio registered under ${audioId}`);
  return { id: trackId, pcm: a, sampleRate: a.sampleRate };
}

/** Seconds of an audio in either form. */
export function audioSeconds(a: PcmAudio | DecodedAudio): number {
  return isPcm(a) ? a.frames / a.sampleRate : (a.channels[0]?.length ?? 0) / a.sampleRate;
}
