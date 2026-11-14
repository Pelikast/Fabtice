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
import type { PcmAudio } from './pcm';

/** The engine runs its AudioContext at this rate, whatever the machine's setting. */
export const ENGINE_SAMPLE_RATE = 48000;

/**
 * Decoded audio of one track, handed to the engine: EXACTLY ONE of `pcm` and
 * `channels`.
 *
 * Since lot 3 the app passes `pcm`, the app-wide in-memory form
 * (`audio/pcm.ts`, from `audio/registry.ts`): the engine must use those
 * chunks AS THEY ARE (the real engine posts the shared buffers to its audio
 * thread; never a second copy of the samples). `channels` stays accepted for
 * tests and simple callers; the engine then converts them once.
 */
export interface EngineTrack {
  /** Same id as the store's `Track.id`. */
  id: string;
  /** The track's samples in the app's in-memory form (preferred). */
  pcm?: PcmAudio;
  /** Or one Float32 PCM array per channel (1 or 2), all the same length. */
  channels?: Float32Array[];
  /** Must be `ENGINE_SAMPLE_RATE`; import resamples while decoding. */
  sampleRate: number;
}

/** Frames and channel count of an `EngineTrack`, whichever form it comes in. */
export function engineTrackShape(t: EngineTrack): { frames: number; channels: number } {
  if (t.pcm) return { frames: t.pcm.frames, channels: t.pcm.channelCount };
  const ch = t.channels ?? [];
  return { frames: ch[0]?.length ?? 0, channels: ch.length };
}

/**
 * Audio rendered offline by « Appliquer » (the best engine, `render/`), to be
 * played AS IT IS instead of the live preview. Lot 3 addition to the contract.
 *
 * Time mapping. The rendered audio of a track starts at source time 0 and
 * runs at the played tempo: rendered frame `k` is source time
 * `k * tempoRatio / sampleRate`. Its length is about `sourceFrames /
 * tempoRatio` (the engine pads with silence or ignores a few frames of
 * difference). Everything the interface sees stays in SOURCE time:
 * `getPosition()`, `seek()`, `setLoop()`, the click track and `getDuration()`
 * are unchanged; the engine converts.
 */
export interface RenderedSet {
  /** The settings baked into the audio; the set is heard only while the live ones are exactly these. */
  semitones: number;
  cents: number;
  tempoRatio: number;
  /** One entry per loaded track (`EngineTrack.id`), at `ENGINE_SAMPLE_RATE`. */
  tracks: { id: string; pcm: PcmAudio }[];
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

  /**
   * « Appliquer » (lot 3): hands the engine audio rendered offline for the
   * loaded tracks (see `RenderedSet`), or `null` to drop it. The set is HEARD
   * (`isRenderedInUse()`) only while all of these hold:
   *   - the live transposition (semitones and cents) and tempo ratio are
   *     exactly the set's;
   *   - it has an entry for every loaded track.
   * Otherwise the engine plays the live preview (Signalsmith) as before. The
   * switch either way happens at once, at the same source position, without
   * stopping and without a click (short crossfade), so a change of key or
   * tempo is heard immediately in preview quality, and coming back to the
   * applied values plays the applied audio again. While the set is heard the
   * tracks are not stretched nor transposed: mute, solo, volume, loop
   * (crossfade at the wrap, in source time), metronome and limiter behave as
   * in preview. `loadTracks()` and `clear()` drop the set; `removeTrack()`
   * drops that track's entry; a track added later has none (so the set is no
   * longer heard until a new one is given).
   * Resolves once the set can be heard; rejects (without changing the engine
   * state) when an id is unknown, the rate is not `ENGINE_SAMPLE_RATE`, or
   * this engine cannot play rendered audio yet.
   */
  setRenderedTracks(set: RenderedSet | null): Promise<void>;

  /** True while the rendered set is what is heard (see `setRenderedTracks`). Cheap. */
  isRenderedInUse(): boolean;

  /** Subscribes to an event; returns the unsubscribe function. */
  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void;

  /** Releases the AudioContext and every resource. The engine is unusable afterwards. */
  dispose(): void;
}
