// Contract between the interface and the audio engine.
//
// The interface never touches Web Audio directly: it drives an AudioEngine
// through the store (see `audio/connect.ts`) and reads the playhead from
// `getPosition()` inside requestAnimationFrame. Lot 1 ships `MockEngine`
// (a clock, no sound); the real engine (one AudioWorklet, Signalsmith Stretch,
// ported from `web/spikes/lecteur/`) implements the same interface and is
// swapped in by changing `createAudioEngine()` in `audio/index.ts` only.
//
// Time
//   Every position, loop bound and click time is SOURCE time in seconds: a
//   position in the original recording, whatever the tempo ratio. A loop of
//   bars 5–8 keeps the same bounds at 50 % speed.

import type { Seconds, TimeRange } from '../model/project';

/** The engine runs its AudioContext at this rate, whatever the machine's setting. */
export const ENGINE_SAMPLE_RATE = 48000;

/** Decoded audio of one track, handed to the engine. */
export interface EngineTrack {
  /** Same id as the store's `Track.id`. */
  id: string;
  /** One Float32 PCM array per channel (1 or 2), all the same length. */
  channels: Float32Array[];
  /** Must be `ENGINE_SAMPLE_RATE`; import resamples while decoding. */
  sampleRate: number;
}

/** Per-track mix, mirrored from the store. */
export interface TrackMix {
  mute: boolean;
  solo: boolean;
  /** Linear gain, 0…1. */
  volume: number;
}

/** Beat times for the metronome, from `grid/lines.ts#metronomeClicks`. */
export interface ClickTrack {
  /** Source times of the clicks, ascending. */
  times: Float64Array;
  /** 1 for an accented click (first beat of a bar), 0 otherwise. Same length as `times`. */
  accents: Uint8Array;
}

/**
 * Engine life cycle:
 *   `empty`   no track loaded (initial state, or after `clear()`);
 *   `loading` `loadTracks()` in progress;
 *   `ready`   tracks loaded, not playing (paused, stopped or ended);
 *   `playing` audio running;
 *   `error`   unusable until the next `loadTracks()`; see the `error` event.
 */
export type EngineState = 'empty' | 'loading' | 'ready' | 'playing' | 'error';

export type EngineErrorCode =
  /** Web Audio, AudioWorklet or SharedArrayBuffer missing (no cross-origin isolation). */
  | 'unsupported'
  /** The AudioContext could not start or was interrupted by the system. */
  | 'context'
  /** A track could not be loaded (wrong rate, empty, out of memory). */
  | 'load'
  /** The audio thread failed while playing. */
  | 'runtime';

export interface EngineError {
  code: EngineErrorCode;
  /** Technical detail, in English, for diagnostics (never shown as is). */
  detail: string;
}

export interface EngineEvents {
  /** Every change of `getState()`. */
  state: (state: EngineState) => void;
  /** Playback reached the end of the material (never fires while looping). The engine is `ready`, at the end. */
  ended: () => void;
  /** Something went wrong; `state` usually follows with `error`. */
  error: (error: EngineError) => void;
}

export interface AudioEngine {
  /** Sample rate of the engine's AudioContext (`ENGINE_SAMPLE_RATE`). */
  readonly sampleRate: number;

  getState(): EngineState;

  /**
   * Replaces all tracks. Resolves once playable; the position goes back to 0
   * and the engine stops. Mixes, loop, transposition, tempo and metronome
   * settings are kept. Rejects (and emits `error`) on failure.
   */
  loadTracks(tracks: EngineTrack[], mixes: Record<string, TrackMix>): Promise<void>;

  /** Adds a track to the loaded ones (separation, lot 3), aligned at time 0. */
  addTrack(track: EngineTrack, mix: TrackMix): Promise<void>;

  /** Removes one track; unknown ids are ignored. */
  removeTrack(id: string): void;

  /** Drops every track and frees their memory; state becomes `empty`. */
  clear(): void;

  /** Length of the longest track, in seconds (0 when empty). */
  getDuration(): Seconds;

  /**
   * Starts or resumes playback. Must be called from a user gesture the first
   * time (the AudioContext is created or resumed inside). At the end of the
   * material it restarts from 0. No-op unless `ready`.
   */
  play(): Promise<void>;

  /** Pauses with a short fade; the position stays where it was heard. */
  pause(): void;

  /** Moves the playhead (clamped to [0, duration]); keeps playing if playing. */
  seek(time: Seconds): void;

  /**
   * Position currently HEARD (engine latency compensated), in source seconds.
   * Called every animation frame by every view: must be cheap and allocation-free.
   */
  getPosition(): Seconds;

  /**
   * Loop region, or null for no loop. While the playhead is before `end`,
   * playback wraps from `end` to `start` (with a short crossfade); once past
   * `end` (after a seek), it plays on to the end of the piece.
   */
  setLoop(region: TimeRange | null): void;

  /** Live transposition: semitones (−12…+12) plus cents (−50…+50). */
  setTransposition(semitones: number, cents: number): void;

  /** Live tempo as a ratio of the original (0.25…2; 1 = original). Pitch is unchanged. */
  setTempoRatio(ratio: number): void;

  /** Mute, solo and volume of one track; unknown ids are ignored. */
  setTrackMix(id: string, mix: TrackMix): void;

  /** Metronome on/off. Clicks are not time-stretched: they sound at the played tempo. */
  setMetronome(enabled: boolean): void;

  /** Where the metronome clicks, in source time; replaced whenever the tempo map changes. */
  setClickTrack(clicks: ClickTrack): void;

  /** Subscribes to an event; returns the unsubscribe function. */
  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void;

  /** Releases the AudioContext and every resource. The engine is unusable afterwards. */
  dispose(): void;
}
