// A silent engine driven by a clock: the playhead advances at the tempo ratio,
// wraps in the loop and stops at the end, exactly as the real engine should
// behave, so the interface and the timeline can be built and tested before
// the real engine exists. It keeps every setting it receives (see
// `snapshot()`) so tests can check the wiring.

import type { Seconds, TimeRange } from '../model/project';
import {
  ENGINE_SAMPLE_RATE,
  engineTrackShape,
  type AudioEngine,
  type RenderedSet,
  type AccelerationSchedule,
  type ClickTrack,
  type MetronomeStatus,
  type PlayOptions,
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
  /** Lot 4: click gain, acceleration given (factors, passes per step) and the step heard. */
  metronomeVolume: number;
  acceleration: { factors: number[]; every: number } | null;
  accelerationStep: number;
  /** Count-in of the last `play()` (offsets in source seconds), null when none. */
  lastCountIn: number[] | null;
  /** The « Appliquer » audio received (null when none) and whether it is the one heard. */
  rendered: { tracks: string[]; semitones: number; cents: number; tempoRatio: number; inUse: boolean } | null;
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
  private metronomeVolume = 0.5;
  private acceleration: AccelerationSchedule | null = null;
  private accelStep = 0;
  private accelPasses = 0;
  /** Count-in in progress: the clock times (ms) its clicks sound at; the music starts at `anchorTime`. */
  private countInAt: number[] = [];
  private lastCountIn: number[] | null = null;
  private readonly metroStatus: MetronomeStatus = { countInLeft: 0, accelerationStep: -1 };
  private rendered: RenderedSet | null = null;
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
    this.rendered = null;
    for (const t of tracks) {
      this.tracks.set(t.id, { ...engineTrackShape(t), mix: { ...(mixes[t.id] ?? DEFAULT_MIX) } });
    }
    this.updateDuration();
    this.anchorPos = 0;
    this.setState(this.tracks.size ? 'ready' : 'empty');
  }

  async addTrack(track: EngineTrack, mix: TrackMix): Promise<void> {
    this.check(track);
    this.tracks.set(track.id, { ...engineTrackShape(track), mix: { ...mix } });
    this.updateDuration();
    if (this.state === 'empty') this.setState('ready');
  }

  removeTrack(id: string): void {
    if (!this.tracks.delete(id)) return;
    if (this.rendered) this.rendered = { ...this.rendered, tracks: this.rendered.tracks.filter((t) => t.id !== id) };
    this.updateDuration();
    if (this.tracks.size === 0) this.clear();
    else this.seek(Math.min(this.getPosition(), this.duration));
  }

  clear(): void {
    this.stop();
    this.rendered = null;
    this.tracks.clear();
    this.duration = 0;
    this.anchorPos = 0;
    this.setState('empty');
  }

  getDuration(): Seconds {
    return this.duration;
  }

  async play(options?: PlayOptions): Promise<void> {
    if (this.state !== 'ready') return;
    if (this.anchorPos >= this.duration) this.anchorPos = 0;
    this.anchorTime = this.clock.now();
    const ci = options?.countIn;
    this.countInAt = [];
    this.lastCountIn = ci && ci.offsets.length > 0 ? [...ci.offsets] : null;
    if (ci && ci.offsets.length > 0) {
      // the position waits at the start while the count-in clicks
      const r = this.effectiveRatio();
      const lead = Math.max(...ci.offsets) / r;
      this.anchorTime += lead * 1000;
      this.countInAt = [...ci.offsets].map((o) => this.anchorTime - (o / r) * 1000);
    }
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
    const now = this.clock.now();
    if (now < this.anchorTime) return this.anchorPos; // count-in
    const raw = this.anchorPos + ((now - this.anchorTime) / 1000) * this.effectiveRatio();
    const loop = this.loop;
    if (loop && this.anchorPos < loop.end && raw >= loop.end) {
      const len = loop.end - loop.start;
      if (this.acceleration) {
        // one pass at a time: each wrap may start the next step, at its own tempo
        const over = raw - loop.end;
        const at = now - (over / this.effectiveRatio()) * 1000;
        this.notePass();
        this.anchorPos = loop.start;
        this.anchorTime = at;
        return this.getPosition();
      }
      return loop.start + ((raw - loop.end) % len);
    }
    return Math.min(raw, this.duration);
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeVolume = Math.min(1, Math.max(0, volume));
  }

  setAcceleration(schedule: AccelerationSchedule | null): void {
    this.rebase();
    this.acceleration = schedule && schedule.factors.length > 0 ? { factors: Float64Array.from(schedule.factors), every: schedule.every } : null;
    this.accelStep = 0;
    this.accelPasses = 0;
    if (this.playing) this.scheduleEnd();
  }

  restartAcceleration(): void {
    this.rebase();
    this.accelStep = 0;
    this.accelPasses = 0;
  }

  getMetronomeStatus(): MetronomeStatus {
    const st = this.metroStatus;
    const now = this.clock.now();
    st.countInLeft = this.playing ? this.countInAt.filter((t) => t >= now).length : 0;
    st.accelerationStep = this.acceleration && this.loop ? this.accelStep : -1;
    return st;
  }

  private effectiveRatio(): number {
    const a = this.acceleration;
    if (!a || !this.loop) return this.ratio;
    return this.ratio * a.factors[Math.min(this.accelStep, a.factors.length - 1)]!;
  }

  private notePass(): void {
    const a = this.acceleration;
    if (!a) return;
    this.accelPasses++;
    if (this.accelPasses >= a.every && this.accelStep < a.factors.length - 1) {
      this.accelStep++;
      this.accelPasses = 0;
    }
  }

  setLoop(region: TimeRange | null): void {
    this.rebase();
    const next = region && region.end > region.start ? { start: region.start, end: region.end } : null;
    if (next?.start !== this.loop?.start || next?.end !== this.loop?.end) {
      this.accelStep = 0;
      this.accelPasses = 0;
    }
    this.loop = next;
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

  async setRenderedTracks(set: RenderedSet | null): Promise<void> {
    if (this.disposed) throw new Error('engine disposed');
    if (set) {
      for (const t of set.tracks) {
        if (!this.tracks.has(t.id)) throw new Error(`rendered audio for an unknown track ${t.id}`);
        if (t.pcm.sampleRate !== this.sampleRate) throw new Error(`rendered track ${t.id}: sample rate ${t.pcm.sampleRate}`);
      }
    }
    await Promise.resolve();
    this.rendered = set ? { ...set, tracks: [...set.tracks] } : null;
  }

  isRenderedInUse(): boolean {
    const r = this.rendered;
    if (!r || r.semitones !== this.semitones || r.cents !== this.cents || r.tempoRatio !== this.ratio) return false;
    const ids = new Set(r.tracks.map((t) => t.id));
    for (const id of this.tracks.keys()) if (!ids.has(id)) return false;
    return this.tracks.size > 0;
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
      metronomeVolume: this.metronomeVolume,
      acceleration: this.acceleration ? { factors: [...this.acceleration.factors], every: this.acceleration.every } : null,
      accelerationStep: this.getMetronomeStatus().accelerationStep,
      lastCountIn: this.lastCountIn,
      rendered: this.rendered
        ? {
            tracks: this.rendered.tracks.map((t) => t.id),
            semitones: this.rendered.semitones,
            cents: this.rendered.cents,
            tempoRatio: this.rendered.tempoRatio,
            inUse: this.isRenderedInUse(),
          }
        : null,
    };
  }

  // ---------------------------------------------------------------- internals

  private check(t: EngineTrack): void {
    if (this.disposed) throw new Error('engine disposed');
    if (t.sampleRate !== this.sampleRate) throw new Error(`track ${t.id}: sample rate ${t.sampleRate}, expected ${this.sampleRate}`);
    if (!!t.pcm === !!t.channels) throw new Error(`track ${t.id}: give either pcm or channels`);
    const { frames, channels } = engineTrackShape(t);
    if (channels < 1 || channels > 2) throw new Error(`track ${t.id}: ${channels} channels`);
    if (frames === 0 || (t.channels && t.channels.some((c) => c.length !== frames))) throw new Error(`track ${t.id}: empty or uneven channels`);
  }

  private updateDuration(): void {
    let frames = 0;
    for (const t of this.tracks.values()) frames = Math.max(frames, t.frames);
    this.duration = frames / this.sampleRate;
  }

  /** Moves the anchor to now, so a change of rate or loop applies from here. */
  private rebase(): void {
    if (!this.playing || this.clock.now() < this.anchorTime) return;
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
    const ms = ((this.duration - pos) / this.effectiveRatio()) * 1000 + Math.max(0, this.anchorTime - this.clock.now());
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
