// A silent engine driven by a clock: the playhead advances at the tempo ratio,
// wraps in the loop and stops at the end, exactly as the real engine should
// behave, so the interface and the timeline can be built and tested before
// the real engine exists. It keeps every setting it receives (see
// `snapshot()`) so tests can check the wiring.

import type { Seconds, TimeRange } from '../model/project';
import {
  ENGINE_SAMPLE_RATE,
  type AudioEngine,
  type ClickTrack,
  type EngineError,
  type EngineEvents,
  type EngineState,
  type EngineTrack,
  type TrackMix,
} from './AudioEngine';

/** Time source of the mock; injectable for tests. Times in milliseconds. */
export interface Clock {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface MockEngineSnapshot {
  state: EngineState;
  duration: Seconds;
  position: Seconds;
  tracks: { id: string; frames: number; channels: number; mix: TrackMix }[];
  loop: TimeRange | null;
  semitones: number;
  cents: number;
  tempoRatio: number;
  metronome: boolean;
  clicks: number;
}

type Listeners = { [K in keyof EngineEvents]: Set<EngineEvents[K]> };

export class MockEngine implements AudioEngine {
  readonly sampleRate = ENGINE_SAMPLE_RATE;

  private state: EngineState = 'empty';
  private tracks = new Map<string, { frames: number; channels: number; mix: TrackMix }>();
  private duration = 0;
  private playing = false;
  /** Position at `anchorTime` (ms on the clock). */
  private anchorPos = 0;
  private anchorTime = 0;
  private loop: TimeRange | null = null;
  private ratio = 1;
  private semitones = 0;
  private cents = 0;
  private metronome = false;
  private clicks: ClickTrack = { times: new Float64Array(0), accents: new Uint8Array(0) };
  private endTimer: unknown = null;
  private disposed = false;
  private listeners: Listeners = { state: new Set(), ended: new Set(), error: new Set() };

  constructor(private readonly clock: Clock = realClock) {}

  getState(): EngineState {
    return this.state;
  }

  async loadTracks(tracks: EngineTrack[], mixes: Record<string, TrackMix>): Promise<void> {
    this.stop();
    this.setState('loading');
    await Promise.resolve();
    try {
      tracks.forEach((t) => this.check(t));
    } catch (e) {
      this.fail('load', (e as Error).message);
      throw e;
    }
    this.tracks.clear();
    for (const t of tracks) {
      this.tracks.set(t.id, { frames: t.channels[0]!.length, channels: t.channels.length, mix: { ...(mixes[t.id] ?? DEFAULT_MIX) } });
    }
    this.updateDuration();
    this.anchorPos = 0;
    this.setState(this.tracks.size ? 'ready' : 'empty');
  }

  async addTrack(track: EngineTrack, mix: TrackMix): Promise<void> {
    this.check(track);
    this.tracks.set(track.id, { frames: track.channels[0]!.length, channels: track.channels.length, mix: { ...mix } });
    this.updateDuration();
    if (this.state === 'empty') this.setState('ready');
  }

  removeTrack(id: string): void {
    if (!this.tracks.delete(id)) return;
    this.updateDuration();
    if (this.tracks.size === 0) this.clear();
    else this.seek(Math.min(this.getPosition(), this.duration));
  }

  clear(): void {
    this.stop();
    this.tracks.clear();
    this.duration = 0;
    this.anchorPos = 0;
    this.setState('empty');
  }

  getDuration(): Seconds {
    return this.duration;
  }

  async play(): Promise<void> {
    if (this.state !== 'ready') return;
    if (this.anchorPos >= this.duration) this.anchorPos = 0;
    this.anchorTime = this.clock.now();
    this.playing = true;
    this.setState('playing');
    this.scheduleEnd();
  }

  pause(): void {
    if (!this.playing) return;
    this.stop();
    this.setState('ready');
  }

  seek(time: Seconds): void {
    this.anchorPos = Math.min(this.duration, Math.max(0, time));
    this.anchorTime = this.clock.now();
    if (this.playing) this.scheduleEnd();
  }

  getPosition(): Seconds {
    if (!this.playing) return this.anchorPos;
    const raw = this.anchorPos + ((this.clock.now() - this.anchorTime) / 1000) * this.ratio;
    const loop = this.loop;
    if (loop && this.anchorPos < loop.end && raw >= loop.end) {
      const len = loop.end - loop.start;
      return loop.start + ((raw - loop.end) % len);
    }
    return Math.min(raw, this.duration);
  }

  setLoop(region: TimeRange | null): void {
    this.rebase();
    this.loop = region && region.end > region.start ? { start: region.start, end: region.end } : null;
    if (this.playing) this.scheduleEnd();
  }

  setTransposition(semitones: number, cents: number): void {
    this.semitones = semitones;
    this.cents = cents;
  }

  setTempoRatio(ratio: number): void {
    this.rebase();
    this.ratio = Math.min(2, Math.max(0.25, ratio));
    if (this.playing) this.scheduleEnd();
  }

  setTrackMix(id: string, mix: TrackMix): void {
    const t = this.tracks.get(id);
    if (t) t.mix = { ...mix };
  }

  setMetronome(enabled: boolean): void {
    this.metronome = enabled;
  }

  setClickTrack(clicks: ClickTrack): void {
    this.clicks = clicks;
  }

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    const set = this.listeners[event] as Set<EngineEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
    for (const set of Object.values(this.listeners)) set.clear();
  }

  /** Everything the engine was told, for tests and the smoke script (not part of the contract). */
  snapshot(): MockEngineSnapshot {
    return {
      state: this.state,
      duration: this.duration,
      position: this.getPosition(),
      tracks: [...this.tracks].map(([id, t]) => ({ id, frames: t.frames, channels: t.channels, mix: { ...t.mix } })),
      loop: this.loop ? { ...this.loop } : null,
      semitones: this.semitones,
      cents: this.cents,
      tempoRatio: this.ratio,
      metronome: this.metronome,
      clicks: this.clicks.times.length,
    };
  }

  // ---------------------------------------------------------------- internals

  private check(t: EngineTrack): void {
    if (this.disposed) throw new Error('engine disposed');
    if (t.sampleRate !== this.sampleRate) throw new Error(`track ${t.id}: sample rate ${t.sampleRate}, expected ${this.sampleRate}`);
    if (t.channels.length < 1 || t.channels.length > 2) throw new Error(`track ${t.id}: ${t.channels.length} channels`);
    const n = t.channels[0]!.length;
    if (n === 0 || t.channels.some((c) => c.length !== n)) throw new Error(`track ${t.id}: empty or uneven channels`);
  }

  private updateDuration(): void {
    let frames = 0;
    for (const t of this.tracks.values()) frames = Math.max(frames, t.frames);
    this.duration = frames / this.sampleRate;
  }

  /** Moves the anchor to now, so a change of rate or loop applies from here. */
  private rebase(): void {
    if (!this.playing) return;
    this.anchorPos = this.getPosition();
    this.anchorTime = this.clock.now();
  }

  private stop(): void {
    if (this.playing) this.anchorPos = this.getPosition();
    this.playing = false;
    this.cancelEnd();
  }

  private cancelEnd(): void {
    if (this.endTimer !== null) this.clock.clearTimer(this.endTimer);
    this.endTimer = null;
  }

  /** Arms a timer for the end of the material (not while the loop holds the playhead). */
  private scheduleEnd(): void {
    this.cancelEnd();
    const pos = this.getPosition();
    if (this.loop && pos < this.loop.end) return;
    const ms = ((this.duration - pos) / this.ratio) * 1000;
    this.endTimer = this.clock.setTimer(() => {
      this.endTimer = null;
      if (!this.playing) return;
      if (this.getPosition() < this.duration - 1e-6) {
        this.scheduleEnd();
        return;
      }
      this.playing = false;
      this.anchorPos = this.duration;
      this.setState('ready');
      this.listeners.ended.forEach((fn) => fn());
    }, Math.max(0, ms) + 1);
  }

  private setState(state: EngineState): void {
    if (state === this.state) return;
    this.state = state;
    this.listeners.state.forEach((fn) => fn(state));
  }

  private fail(code: EngineError['code'], detail: string): void {
    this.listeners.error.forEach((fn) => fn({ code, detail }));
    this.setState('error');
  }
}

const DEFAULT_MIX: TrackMix = { mute: false, solo: false, volume: 1 };
