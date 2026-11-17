// The real audio engine: one AudioWorklet renders every track with Signalsmith
// Stretch (live preview quality), ported from the validated spike
// (`web/spikes/lecteur/`). This file is the main-thread half: it owns the
// AudioContext, stores the tracks as 16-bit blocks in shared memory, sends
// commands to the worklet and reads the heard playhead from a shared block.
// The audio-thread half is `worklet/` (core.ts holds the timeline model).
//
// Notes for whoever integrates it
//   - The AudioContext is created by the first `loadTracks()` and resumed
//     inside `play()`, synchronously, so the call must come from the user's
//     gesture. After a pause it is suspended again (0.4 s) and, when nothing
//     has played for a while (`IDLE_RELEASE_MS`), CLOSED: the output goes back
//     to the system. `play()` then opens a new context, inside the gesture,
//     and gives it everything again (tracks, applied render, settings,
//     position, acceleration step): the user notices nothing but a slightly
//     longer start. `releaseDevice()` does the same at once (sleep, output
//     change, hidden page: see `deviceLifecycle.ts`).
//   - A context that fails to start, or an audio thread that stops reporting
//     while playing (watchdog), is torn down and rebuilt ONCE; if that fails
//     too the engine says so (`context` error) and waits for the next play.
//     Nothing retries on its own after that.
//   - Without cross-origin isolation (SharedArrayBuffer) or AudioWorklet,
//     `loadTracks()` rejects and the state becomes `error` / `unsupported`.
//     There is no fallback.
//   - `getPosition()` reads typed arrays only: no allocation, no message.

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
import type { Seconds, TimeRange } from '../model/project';
import { isShared, pcmToChannels, type PcmAudio } from './pcm';
import { storeTrack, type StoredTrack } from './storage';
import { journalPhrase, reasonText, recordAudio, recordPlay, type ReleaseReason } from './journal';
import {
  FLAG_PLAYING,
  SHARED_BYTES,
  sharedViews,
  type Diagnostics,
  type FromWorklet,
  type SharedViews,
  type ToWorklet,
} from './worklet/protocol';

const PROCESSOR_NAME = 'fabtice-player';
/** The extrapolation between two published positions never runs further than this. */
const MAX_EXTRAPOLATION_S = 0.1;
/** The context is suspended this long after a pause, so the hardware can sleep. */
const IDLE_SUSPEND_MS = 400;
/** After this long without playback the context is CLOSED: the audio output goes back to the system. */
export const IDLE_RELEASE_MS = 45_000;
/** While playing, the audio thread must publish its position at least this often, or the engine is rebuilt. */
const WATCHDOG_MS = 2500;
/** A context that has not started this long after `resume()` counts as failed. */
const START_TIMEOUT_MS = 8000;
/** A second failure this soon after an automatic rebuild is not retried: the user is told. */
const RECOVERY_WINDOW_MS = 60_000;

type Listeners = { [K in keyof EngineEvents]: Set<EngineEvents[K]> };

interface TrackEntry {
  stored: StoredTrack;
  mix: TrackMix;
}

/** The « Appliquer » set the engine holds (kept as given: its chunks are the ones the audio thread reads). */
interface AppliedSet {
  semitones: number;
  cents: number;
  tempoRatio: number;
  tracks: Map<string, PcmAudio>;
}

/** Why the browser cannot run this engine, or null when it can. */
export function unsupportedReason(): string | null {
  if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') return 'no AudioWorklet';
  if (typeof SharedArrayBuffer === 'undefined') return 'no SharedArrayBuffer (page not cross-origin isolated)';
  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) return 'page not cross-origin isolated';
  return null;
}

let wasmBytes: Promise<ArrayBuffer> | null = null;

export class WorkletEngine implements AudioEngine {
  readonly sampleRate = ENGINE_SAMPLE_RATE;

  private state: EngineState = 'empty';
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private graph: Promise<void> | null = null;
  private sharedBuffer: SharedArrayBuffer | null = null;
  private views: SharedViews | null = null;
  private readonly tracks = new Map<string, TrackEntry>();
  private applied: AppliedSet | null = null;
  private duration = 0;
  private disposed = false;
  private listeners: Listeners = { state: new Set(), ended: new Set(), error: new Set() };

  // settings, kept to (re)send them to a new worklet node
  private loop: { start: number; end: number } | null = null; // frames
  private semitones = 0;
  private cents = 0;
  private ratio = 1;
  private metronome = false;
  private clickFrames = new Float64Array(0);
  private clickAccents = new Uint8Array(0);
  private metronomeVolume = 0.5;
  private acceleration: AccelerationSchedule | null = null;
  private readonly metroStatus: MetronomeStatus = { countInLeft: 0, accelerationStep: -1 };

  /** Paused position (seconds); authoritative whenever the engine is not playing. */
  private pos = 0;
  private lastPos = 0;
  /** After a seek while playing: ignore the shared position until it reports the target. */
  private seekHold: { frame: number; until: number } | null = null;
  private startToken = 0;
  private loadToken = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pingId = 0;
  private pings = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private onReady: ((m: Extract<FromWorklet, { type: 'ready' }>) => void) | null = null;
  private diag: Diagnostics | null = null;

  // the audio output (device) life cycle
  /** The context was closed on purpose (idle, sleep, output change, failure): the next play() opens a new one. */
  private released = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private idleReleaseMs = IDLE_RELEASE_MS;
  /** A play() (or an automatic rebuild) is starting the audio: no idle suspend, no release meanwhile. */
  private starting = false;
  /** Operations that need the worklet (adding a track, sending an applied render): no release meanwhile. */
  private busy = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private watchSeq = -1;
  private watchSince = 0;
  private recoveredAt = Number.NEGATIVE_INFINITY;
  private lastFailure: EngineError['code'] | null = null;
  /** Acceleration step and passes the closed audio thread had reached, given to the next one. */
  private accelResume: { step: number; passes: number } | null = null;
  /** Test hook: the next starts of the context fail this many times. */
  private failResumes = 0;

  getState(): EngineState {
    return this.state;
  }

  /** Last diagnostics sent by the audio thread (load, active tracks, latency model), for tests and debugging. */
  diagnostics(): Diagnostics | null {
    return this.diag;
  }

  /** The worklet node, so tests can tap its output. Not part of the contract. */
  get debugNode(): AudioWorkletNode | null {
    return this.node;
  }

  get debugContext(): AudioContext | null {
    return this.ctx;
  }

  /** Whether the engine holds the audio output now (an open AudioContext), and its state. For tests. */
  deviceState(): { held: boolean; context: AudioContextState | 'none'; released: boolean } {
    return { held: this.ctx !== null && this.ctx.state !== 'closed', context: this.ctx ? this.ctx.state : 'none', released: this.released };
  }

  /** Tests: how long without playback before the output is given back (default `IDLE_RELEASE_MS`). */
  setIdleReleaseDelay(ms: number): void {
    this.idleReleaseMs = Math.max(0, ms);
    if (this.releaseTimer !== null) this.scheduleIdle();
  }

  /** Tests: the next `n` starts of the context fail, as a broken output would. */
  debugFailResumes(n: number): void {
    this.failResumes = Math.max(0, Math.floor(n));
  }

  /** Tests: the audio thread stops rendering and publishing, as a stuck one would (the watchdog must notice). */
  debugStall(): void {
    this.post({ type: 'stall' });
  }

  /**
   * Bytes of audio the loaded tracks use in shared memory. Since lot 3 these
   * are the registry's own chunks (`EngineTrack.pcm`), not a second copy.
   */
  memoryBytes(): number {
    let b = 0;
    for (const t of this.tracks.values()) b += t.stored.bytes;
    return b;
  }

  /** Bytes of rendered audio the « Appliquer » set holds (the page's own chunks, shared with the audio thread, not a copy). */
  renderedBytes(): number {
    let b = 0;
    for (const p of this.applied?.tracks.values() ?? []) b += p.bytes;
    return b;
  }

  // ---------------------------------------------------------------- tracks

  async loadTracks(tracks: EngineTrack[], mixes: Record<string, TrackMix>): Promise<void> {
    const token = ++this.loadToken;
    this.stopPlayback();
    this.setState('loading');
    try {
      this.assertUsable();
      tracks.forEach((t) => this.check(t));
      if (tracks.length === 0) {
        this.clear();
        return;
      }
      // A released output stays released: the tracks wait here and go to the next context with the rest.
      if (!this.released) await this.ensureGraph();
      if (token !== this.loadToken) return;
      this.post({ type: 'clear' });
      this.tracks.clear();
      this.applied = null;
      this.accelResume = null;
      for (const t of tracks) {
        await this.put(t, mixes[t.id] ?? DEFAULT_MIX);
        if (token !== this.loadToken) return;
      }
      if (this.node) await this.roundTrip();
      if (token !== this.loadToken) return;
    } catch (e) {
      if (token === this.loadToken) this.fail(this.errorCode(e), (e as Error).message ?? String(e));
      throw e;
    }
    this.updateDuration();
    this.pos = 0;
    this.lastPos = 0;
    this.post({ type: 'seek', frame: 0 });
    this.setState(this.tracks.size ? 'ready' : 'empty');
    this.scheduleIdle();
  }

  async addTrack(track: EngineTrack, mix: TrackMix): Promise<void> {
    this.busy++;
    try {
      this.assertUsable();
      this.check(track);
      if (!this.released) await this.ensureGraph();
      await this.put(track, mix);
      if (this.node) await this.roundTrip();
    } catch (e) {
      this.fail(this.errorCode(e), (e as Error).message ?? String(e));
      throw e;
    } finally {
      this.busy--;
    }
    this.updateDuration();
    if (this.state === 'empty') this.setState('ready');
  }

  removeTrack(id: string): void {
    if (!this.tracks.delete(id)) return;
    this.applied?.tracks.delete(id);
    this.post({ type: 'remove', id });
    if (this.tracks.size === 0) {
      this.clear();
      return;
    }
    this.updateDuration();
    if (this.state !== 'playing' && this.pos > this.duration) this.pos = this.duration;
  }

  clear(): void {
    this.stopPlayback();
    this.post({ type: 'clear' });
    this.tracks.clear();
    this.applied = null;
    this.accelResume = null;
    this.duration = 0;
    this.pos = 0;
    this.lastPos = 0;
    this.setState('empty');
  }

  getDuration(): Seconds {
    return this.duration;
  }

  // ---------------------------------------------------------------- transport

  async play(options?: PlayOptions): Promise<void> {
    // After an output failure the user's next play is a new attempt (never an automatic loop).
    const retry = this.state === 'error' && this.tracks.size > 0 && (this.lastFailure === 'context' || this.lastFailure === 'runtime');
    if ((this.state !== 'ready' && !retry) || this.disposed) return;
    if (retry) {
      this.lastFailure = null;
      this.recoveredAt = Number.NEGATIVE_INFINITY;
      this.setState('ready');
    }
    const token = ++this.startToken;
    this.cancelIdle();
    const t0 = now();
    const reopened = this.ctx === null || this.ctx.state === 'closed';
    this.starting = true;
    try {
      // The first call is synchronous up to its first await: a new context is created and resumed inside
      // the user's gesture.
      await this.startAudio(token, 1);
    } catch (e) {
      if (token !== this.startToken) {
        this.starting = false;
        return;
      }
      // Second and last try: a new context from scratch.
      this.teardown('failure');
      try {
        await this.startAudio(token, 2);
      } catch (e2) {
        this.starting = false;
        if (token === this.startToken) this.failDevice(`${(e as Error).message}; then ${(e2 as Error).message}`);
        return;
      }
    }
    this.starting = false;
    if (token !== this.startToken || this.state !== 'ready') {
      // paused (or replaced) while starting: the context goes back to sleep
      this.scheduleIdle();
      return;
    }
    if (this.pos >= this.duration - 1e-3) this.pos = 0;
    this.lastPos = this.pos;
    this.post({ type: 'seek', frame: Math.round(this.pos * this.sampleRate) });
    const ci = options?.countIn;
    const sr = this.sampleRate;
    this.post({ type: 'play', countIn: ci && ci.offsets.length > 0 ? { offsets: ci.offsets.map((o) => o * sr), levels: Uint8Array.from(ci.levels) } : null });
    this.seekHold = null;
    this.setState('playing');
    this.startWatchdog();
    const ms = now() - t0;
    if (reopened) recordAudio('reopen', { ms: Math.round(ms) });
    recordPlay(ms, reopened);
  }

  /**
   * Makes sure a context exists (a new one if the last was closed: created HERE, synchronously, so that a
   * call from a user gesture creates and resumes it inside that gesture), resumes it, waits for the worklet
   * and checks that the context really runs. Throws an `EngineFailure` (journaled) otherwise.
   */
  private async startAudio(token: number, attempt: number): Promise<void> {
    let ctx: AudioContext;
    let resumed: Promise<void>;
    try {
      ctx = this.ctx && this.ctx.state !== 'closed' ? this.ctx : this.openContext();
      if (this.failResumes > 0) {
        this.failResumes--;
        resumed = Promise.reject(new Error('simulated failure'));
      } else {
        resumed = ctx.resume();
      }
      resumed.catch(() => {});
    } catch (e) {
      recordAudio('start-failed', { attempt, detail: (e as Error).message ?? String(e) });
      throw e instanceof EngineFailure ? e : new EngineFailure('context', (e as Error).message ?? String(e));
    }
    try {
      await this.ensureGraph();
      if (token !== this.startToken) return;
      await withTimeout(resumed, START_TIMEOUT_MS, 'the audio output did not start in time');
    } catch (e) {
      recordAudio('start-failed', { attempt, detail: (e as Error).message ?? String(e) });
      throw e instanceof EngineFailure ? e : new EngineFailure('context', `AudioContext.resume() failed: ${(e as Error).message}`);
    }
    if (token !== this.startToken) return;
    if (ctx !== this.ctx || ctx.state !== 'running') {
      const detail = `AudioContext is ${ctx.state} after resume()`;
      recordAudio('start-failed', { attempt, detail });
      throw new EngineFailure('context', detail);
    }
  }

  pause(): void {
    this.startToken++;
    if (this.state !== 'playing') return;
    this.pos = this.getPosition();
    this.lastPos = this.pos;
    this.post({ type: 'pause' });
    this.stopWatchdog();
    this.setState('ready');
    this.scheduleIdle();
  }

  /**
   * Gives the audio output back to the system now: pauses first (with the usual fade) if playing, then
   * closes the context. Tracks, applied render, settings and position are kept; the next `play()` opens a
   * new context. Waits for an operation in progress (loading, a start) to finish first.
   */
  releaseDevice(reason: ReleaseReason): void {
    if (this.disposed) return;
    if (this.state === 'loading' || this.starting || this.busy > 0) {
      // something is using the worklet: try again in a moment (loading and starting have their own time limits)
      setTimeout(() => this.releaseDevice(reason), 1000);
      return;
    }
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.pos = this.getPosition();
      this.lastPos = this.pos;
      this.startToken++;
      this.post({ type: 'pause' });
      this.stopWatchdog();
      this.setState('ready');
    }
    if (!this.ctx) {
      this.cancelIdle();
      return;
    }
    recordAudio('release', { reason: reasonText(reason), playing: wasPlaying ? journalPhrase('audioJournal.playing') : '' });
    // after a pause, let the 8 ms fade-out be heard before the stream goes
    this.teardown(reason, wasPlaying ? 60 : 0);
  }

  seek(time: Seconds): void {
    const t = Math.min(this.duration, Math.max(0, Number.isFinite(time) ? time : 0));
    this.pos = t;
    this.lastPos = t;
    const frame = Math.round(t * this.sampleRate);
    if (this.state === 'playing' && this.ctx) this.seekHold = { frame, until: this.ctx.currentTime + 0.5 };
    this.post({ type: 'seek', frame });
  }

  getOutputLatency(): Seconds {
    // The frame rendered at `currentTime` reaches the system after `baseLatency`, the ears after `outputLatency`.
    const ctx = this.ctx;
    if (!ctx) return 0;
    const v = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    return Number.isFinite(v) && v > 0 && v < 1 ? v : 0;
  }

  getPosition(): Seconds {
    if (this.state !== 'playing' || !this.views || !this.ctx) return this.pos;
    const { i32, f64 } = this.views;
    let heard = 0;
    let stamp = 0;
    let rate = 1;
    let flags = 0;
    let ok = false;
    for (let k = 0; k < 4; k++) {
      const s1 = Atomics.load(i32, 0);
      if (s1 & 1) continue;
      heard = f64[0]!;
      stamp = f64[1]!;
      rate = f64[2]!;
      flags = Atomics.load(i32, 1);
      if (Atomics.load(i32, 0) === s1) {
        ok = true;
        break;
      }
    }
    if (!ok || !(flags & FLAG_PLAYING)) return this.lastPos;
    const hold = this.seekHold;
    if (hold) {
      if (Math.abs(heard - hold.frame) <= 0.5 * this.sampleRate || this.ctx.currentTime > hold.until) this.seekHold = null;
      else return this.pos;
    }
    const sr = this.sampleRate;
    let ahead = this.ctx.currentTime * sr - stamp;
    if (ahead < 0) ahead = 0;
    else if (ahead > MAX_EXTRAPOLATION_S * sr) ahead = MAX_EXTRAPOLATION_S * sr;
    let p = heard + ahead * rate;
    const loop = this.loop;
    if (loop && heard < loop.end && p >= loop.end) p = loop.start + ((p - loop.end) % (loop.end - loop.start));
    const total = this.duration * sr;
    if (p > total) p = total;
    this.lastPos = p / sr;
    return this.lastPos;
  }

  // ---------------------------------------------------------------- settings

  setLoop(region: TimeRange | null): void {
    const before = this.loop;
    if (region && region.end > region.start) {
      this.loop = { start: Math.round(region.start * this.sampleRate), end: Math.round(region.end * this.sampleRate) };
    } else this.loop = null;
    // a new loop starts the acceleration again (as the audio thread does)
    if (before?.start !== this.loop?.start || before?.end !== this.loop?.end) this.accelResume = null;
    this.postLoop();
  }

  setTransposition(semitones: number, cents: number): void {
    this.semitones = Math.min(12, Math.max(-12, semitones));
    this.cents = Math.min(50, Math.max(-50, cents));
    this.post({ type: 'params', semitones: this.semitones + this.cents / 100 });
  }

  setTempoRatio(ratio: number): void {
    this.ratio = Math.min(2, Math.max(0.25, ratio));
    this.post({ type: 'params', rate: this.ratio });
  }

  setTrackMix(id: string, mix: TrackMix): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.mix = { ...mix };
    this.post({ type: 'mix', id, volume: mix.volume, mute: mix.mute, solo: mix.solo });
  }

  setMetronome(enabled: boolean): void {
    this.metronome = enabled;
    this.post({ type: 'metronome', enabled });
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.5));
    this.post({ type: 'metronome-volume', volume: this.metronomeVolume });
  }

  setAcceleration(schedule: AccelerationSchedule | null): void {
    this.acceleration = schedule && schedule.factors.length > 0 ? { factors: Float64Array.from(schedule.factors), every: schedule.every } : null;
    this.accelResume = null;
    this.postAcceleration();
  }

  restartAcceleration(): void {
    this.accelResume = null;
    this.post({ type: 'acceleration-restart' });
  }

  getMetronomeStatus(): MetronomeStatus {
    const st = this.metroStatus;
    st.countInLeft = 0;
    st.accelerationStep = -1;
    if (!this.views) {
      // output released: the step the next audio thread will carry on from
      if (this.accelResume && this.acceleration && this.loop) st.accelerationStep = this.accelResume.step;
      return st;
    }
    const { i32, f64 } = this.views;
    for (let k = 0; k < 4; k++) {
      const s1 = Atomics.load(i32, 0);
      if (s1 & 1) continue;
      const left = f64[3]!;
      const step = f64[4]!;
      if (Atomics.load(i32, 0) === s1) {
        st.countInLeft = this.state === 'playing' ? left : 0;
        st.accelerationStep = step;
        break;
      }
    }
    return st;
  }

  private postAcceleration(): void {
    const a = this.acceleration;
    this.post({ type: 'acceleration', factors: a ? a.factors : null, every: a?.every ?? 1 });
  }

  setClickTrack(clicks: ClickTrack): void {
    const sr = this.sampleRate;
    this.clickFrames = new Float64Array(clicks.times.length);
    for (let i = 0; i < clicks.times.length; i++) this.clickFrames[i] = clicks.times[i]! * sr;
    this.clickAccents = Uint8Array.from(clicks.accents);
    this.postClicks();
  }

  // ---------------------------------------------------------------- « Appliquer » (lot 3)

  /**
   * Hands the audio thread the audio rendered offline (the very chunks the
   * page holds, in shared memory: nothing is copied). The worklet plays it as
   * it is while the live key and tempo are exactly the set's and it covers
   * every track (see `AudioEngine.setRenderedTracks`); `isRenderedInUse()` says
   * the same on this side. Rejects, changing nothing, for an unknown track,
   * another rate, an empty or oddly shaped audio.
   */
  async setRenderedTracks(set: RenderedSet | null): Promise<void> {
    if (set === null) {
      if (this.applied) this.post({ type: 'rendered-clear' });
      this.applied = null;
      return;
    }
    if (this.disposed) throw new EngineFailure('load', 'engine disposed');
    const seen = new Set<string>();
    for (const t of set.tracks) {
      if (!this.tracks.has(t.id)) throw new EngineFailure('load', `rendered audio for an unknown track ${t.id}`);
      if (seen.has(t.id)) throw new EngineFailure('load', `rendered audio twice for track ${t.id}`);
      seen.add(t.id);
      if (t.pcm.sampleRate !== this.sampleRate) throw new EngineFailure('load', `rendered track ${t.id}: sample rate ${t.pcm.sampleRate}, expected ${this.sampleRate}`);
      if (t.pcm.frames === 0 || t.pcm.channelCount < 1 || t.pcm.channelCount > 2) throw new EngineFailure('load', `rendered track ${t.id}: empty or ${t.pcm.channelCount} channels`);
    }
    if (!(set.tempoRatio >= 0.25 && set.tempoRatio <= 2)) throw new EngineFailure('load', `rendered set: tempo ${set.tempoRatio}`);
    if (!this.node && !this.released) throw new EngineFailure('context', 'no audio worklet to play the rendered audio');
    const token = this.loadToken;
    this.applied = { semitones: set.semitones, cents: set.cents, tempoRatio: set.tempoRatio, tracks: new Map(set.tracks.map((t) => [t.id, t.pcm])) };
    // output released: the set is kept here and given to the next context with the tracks
    if (!this.node) return;
    this.post({
      type: 'rendered',
      semitones: set.semitones + set.cents / 100,
      ratio: set.tempoRatio,
      tracks: set.tracks.map((t) => ({ id: t.id, frames: t.pcm.frames, mono: t.pcm.mono, chunks: t.pcm.chunks })),
    });
    this.busy++;
    try {
      await this.roundTrip();
    } catch (e) {
      // not sure what the audio thread holds: nothing, on both sides
      this.applied = null;
      this.post({ type: 'rendered-clear' });
      throw e;
    } finally {
      this.busy--;
    }
    if (token !== this.loadToken) throw new EngineFailure('load', 'the tracks were replaced while the rendered audio was sent');
  }

  /** True while the rendered set is what is heard: same key and tempo as the live ones, every loaded track covered. */
  isRenderedInUse(): boolean {
    const a = this.applied;
    if (!a || this.tracks.size === 0) return false;
    if (Math.abs(a.semitones + a.cents / 100 - (this.semitones + this.cents / 100)) > 1e-9 || a.tempoRatio !== this.ratio) return false;
    for (const id of this.tracks.keys()) if (!a.tracks.has(id)) return false;
    return true;
  }

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    const set = this.listeners[event] as Set<EngineEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.teardown('dispose');
    for (const set of Object.values(this.listeners)) set.clear();
  }

  // ---------------------------------------------------------------- internals

  private assertUsable(): void {
    if (this.disposed) throw new EngineFailure('load', 'engine disposed');
    const why = unsupportedReason();
    if (why) throw new EngineFailure('unsupported', why);
  }

  private check(t: EngineTrack): void {
    if (t.sampleRate !== this.sampleRate) throw new EngineFailure('load', `track ${t.id}: sample rate ${t.sampleRate}, expected ${this.sampleRate}`);
    if (!!t.pcm === !!t.channels) throw new EngineFailure('load', `track ${t.id}: give either pcm or channels`);
    const { frames, channels } = engineTrackShape(t);
    if (channels < 1 || channels > 2) throw new EngineFailure('load', `track ${t.id}: ${channels} channels`);
    if (frames === 0 || (t.channels && t.channels.some((c) => c.length !== frames))) throw new EngineFailure('load', `track ${t.id}: empty or uneven channels`);
  }

  private errorCode(e: unknown): EngineError['code'] {
    return e instanceof EngineFailure ? e.code : 'load';
  }

  /** Stores a track in shared memory and sends it to the worklet. */
  private async put(t: EngineTrack, mix: TrackMix): Promise<void> {
    await Promise.resolve(); // let the loading state paint between big tracks
    // The registry's chunks are used as they are (shared with the audio thread, no copy).
    // Plain channels, or chunks that are not in shared memory, are converted once.
    const stored: StoredTrack = t.pcm && isShared(t.pcm) ? t.pcm : storeTrack(t.channels ?? pcmToChannels(t.pcm!));
    this.tracks.set(t.id, { stored, mix: { ...mix } });
    this.post({ type: 'track', id: t.id, frames: stored.frames, mono: stored.mono, chunks: stored.chunks, volume: mix.volume, mute: mix.mute, solo: mix.solo });
  }

  private updateDuration(): void {
    let frames = 0;
    for (const t of this.tracks.values()) frames = Math.max(frames, t.stored.frames);
    this.duration = frames / this.sampleRate;
  }

  /** Creates the context (unless one is open), the worklet and the wasm engine; once per context. */
  private ensureGraph(): Promise<void> {
    if (this.graph && this.ctx && this.ctx.state !== 'closed') return this.graph;
    let ctx: AudioContext;
    try {
      ctx = this.ctx && this.ctx.state !== 'closed' ? this.ctx : this.openContext();
    } catch (e) {
      return Promise.reject(e);
    }
    const graph = this.buildGraph(ctx);
    this.graph = graph;
    graph.catch(() => {
      if (this.graph === graph) this.graph = null;
    });
    return graph;
  }

  /** A new AudioContext at the engine's rate (synchronous: may run inside a user gesture). Journaled. */
  private openContext(): AudioContext {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: this.sampleRate, latencyHint: 'playback' });
    } catch (e) {
      throw new EngineFailure('context', `AudioContext: ${(e as Error).message}`);
    }
    if (ctx.sampleRate !== this.sampleRate) {
      void ctx.close().catch(() => {});
      throw new EngineFailure('context', `AudioContext runs at ${ctx.sampleRate} Hz, ${this.sampleRate} Hz required`);
    }
    this.ctx = ctx;
    this.graph = null;
    this.released = false;
    ctx.onstatechange = () => this.onContextState(ctx);
    recordAudio('context-created', { rate: ctx.sampleRate, base: ((ctx.baseLatency ?? 0) * 1000).toFixed(1), state: ctx.state });
    return ctx;
  }

  private async buildGraph(ctx: AudioContext): Promise<void> {
    try {
      const { workletUrl, wasmUrl } = await import('./assets');
      await ctx.audioWorklet.addModule(workletUrl);
      if (!wasmBytes) {
        wasmBytes = fetch(wasmUrl).then((r) => {
          if (!r.ok) throw new Error(`fetch ${wasmUrl}: ${r.status}`);
          return r.arrayBuffer();
        });
        wasmBytes.catch(() => {
          wasmBytes = null;
        });
      }
      const bytes = await wasmBytes;
      this.sharedBuffer = new SharedArrayBuffer(SHARED_BYTES);
      this.views = sharedViews(this.sharedBuffer);
      const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { shared: this.sharedBuffer },
      });
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onWorkletMessage(e.data);
      node.onprocessorerror = () => void this.recover('runtime', 'processor error');
      node.connect(ctx.destination);
      this.node = node;
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new EngineFailure('context', 'the audio worklet did not start in time')), 30000);
        this.onReady = (m) => {
          clearTimeout(timer);
          this.diag = { loadAvg: 0, loadMax: 0, overBudget: 0, activeTracks: 0, missingChunks: 0, wasmBytes: m.wasmBytes, latencyA: m.latencyA, latencyB: m.latencyB, applied: 0 };
          resolve();
        };
      });
      const copy = bytes.slice(0); // the posted buffer is transferred: keep the cached one intact
      node.port.postMessage({ type: 'init', wasm: copy } satisfies ToWorklet, [copy]);
      await ready;
      if (ctx !== this.ctx) throw new EngineFailure('context', 'the audio output was released while it opened');
    } catch (e) {
      if (ctx === this.ctx) {
        ctx.onstatechange = null;
        void ctx.close().catch(() => {});
        this.ctx = null;
        this.node = null;
        this.views = null;
      }
      if (e instanceof EngineFailure) throw e;
      throw new EngineFailure('context', (e as Error).message ?? String(e));
    }
    // Everything the engine holds, for a new node: the settings made before it existed and, after the
    // output was released, the tracks, the applied render, the acceleration step and the position.
    this.post({ type: 'params', rate: this.ratio, semitones: this.semitones + this.cents / 100 });
    this.post({ type: 'metronome', enabled: this.metronome });
    this.post({ type: 'metronome-volume', volume: this.metronomeVolume });
    this.postClicks();
    for (const [id, t] of this.tracks) {
      const st = t.stored;
      this.post({ type: 'track', id, frames: st.frames, mono: st.mono, chunks: st.chunks, volume: t.mix.volume, mute: t.mix.mute, solo: t.mix.solo });
    }
    const a = this.applied;
    if (a) {
      this.post({
        type: 'rendered',
        semitones: a.semitones + a.cents / 100,
        ratio: a.tempoRatio,
        tracks: [...a.tracks].map(([id, p]) => ({ id, frames: p.frames, mono: p.mono, chunks: p.chunks })),
      });
    }
    this.postLoop();
    this.postAcceleration();
    const r = this.accelResume;
    if (r && this.acceleration) this.post({ type: 'acceleration-state', step: r.step, passes: r.passes });
    this.accelResume = null;
    this.post({ type: 'seek', frame: Math.round(this.pos * this.sampleRate) });
  }

  private post(m: ToWorklet): void {
    this.node?.port.postMessage(m);
  }

  private postLoop(): void {
    const l = this.loop;
    this.post({ type: 'loop', enabled: l !== null, start: l?.start ?? 0, end: l?.end ?? 0 });
  }

  private postClicks(): void {
    this.post({ type: 'clicks', frames: this.clickFrames, accents: this.clickAccents });
  }

  /** Resolves once the worklet has handled everything posted before. */
  private roundTrip(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.node) return reject(new EngineFailure('context', 'no audio worklet'));
      const id = ++this.pingId;
      const timer = setTimeout(() => {
        this.pings.delete(id);
        reject(new EngineFailure('load', 'the audio worklet did not answer'));
      }, 30000);
      this.pings.set(id, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.post({ type: 'ping', id });
    });
  }

  private onWorkletMessage(m: FromWorklet): void {
    switch (m.type) {
      case 'ready':
        this.onReady?.(m);
        break;
      case 'pong': {
        const f = this.pings.get(m.id);
        this.pings.delete(m.id);
        f?.resolve();
        break;
      }
      case 'status':
        this.diag = m.diagnostics;
        break;
      case 'ended':
        if (this.state === 'playing') {
          this.pos = this.duration;
          this.lastPos = this.duration;
          this.setState('ready');
          this.listeners.ended.forEach((fn) => fn());
          this.scheduleIdle();
        }
        break;
      case 'error':
        void this.recover('runtime', m.message);
        break;
    }
  }

  private onContextState(ctx: AudioContext): void {
    if (ctx !== this.ctx || this.disposed) return;
    const st = ctx.state as string;
    if (st === 'running') {
      // A context that comes to run while nothing plays (it starts by itself where autoplay is allowed, as
      // in the Mac app) goes back to sleep: the output is never left running for nothing.
      if (this.state !== 'playing' && !this.starting) this.scheduleIdle();
      return;
    }
    if (st !== 'closed' && this.state !== 'playing') return; // our own idle suspend, or a context not started yet
    // Closed by someone else, or interrupted by the system (call, another app, the output went away) while
    // playing: stop where we were and let this context go; the next play() opens a new one.
    recordAudio('context-state', { state: st, while: journalPhrase(this.state === 'playing' ? 'audioJournal.whilePlaying' : 'audioJournal.whileIdle') });
    if (this.state === 'playing') {
      this.pos = this.lastPos;
      this.startToken++;
      this.post({ type: 'pause' });
      this.stopWatchdog();
      this.setState('ready');
    }
    if (!this.starting) this.teardown('system');
  }

  /**
   * Closes the context and drops the node (the output goes back to the system); keeps every track and
   * setting for the next context. `delayMs` lets a fade-out finish first.
   */
  private teardown(reason: ReleaseReason, delayMs = 0): void {
    this.cancelIdle();
    this.stopWatchdog();
    const ctx = this.ctx;
    const node = this.node;
    // the acceleration step reached, for the next audio thread
    if (this.views && this.acceleration && this.loop) {
      const step = this.views.f64[4]!;
      const passes = this.views.f64[5]!;
      if (step >= 0) this.accelResume = { step, passes };
    }
    this.ctx = null;
    this.node = null;
    this.graph = null;
    this.views = null;
    this.sharedBuffer = null;
    this.onReady = null;
    this.released = true;
    const gone = new EngineFailure('context', 'the audio output was released');
    for (const p of this.pings.values()) p.reject(gone);
    this.pings.clear();
    if (node) {
      node.port.onmessage = null;
      node.onprocessorerror = null;
    }
    if (!ctx) return;
    ctx.onstatechange = null;
    const close = () => {
      node?.disconnect();
      if (ctx.state !== 'closed') void ctx.close().catch(() => {});
    };
    if (delayMs > 0) setTimeout(close, delayMs);
    else close();
    recordAudio('context-closed', { reason: reasonText(reason) });
  }

  /**
   * The audio thread failed (watchdog, processor error): rebuild once and, if it was playing, carry on
   * from where it was heard. A second failure within `RECOVERY_WINDOW_MS` is not retried: the engine
   * reports the error and waits for the user's next play.
   */
  private async recover(code: 'runtime' | 'context', detail: string): Promise<void> {
    if (this.disposed || this.starting || this.state === 'error') return;
    recordAudio('error', { code, detail: detail.slice(0, 200) });
    if (this.state === 'loading' || this.state === 'empty') {
      // nothing to carry on: let the output go, the next load or play opens a new one
      this.teardown('failure');
      return;
    }
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.pos = this.lastPos;
      this.startToken++;
      this.stopWatchdog();
      this.setState('ready');
    }
    const t = now();
    if (t - this.recoveredAt < RECOVERY_WINDOW_MS) {
      this.failDevice(`again within a minute: ${detail}`, code);
      return;
    }
    this.recoveredAt = t;
    this.teardown('failure');
    if (!wasPlaying) {
      recordAudio('recovery', { result: journalPhrase('audioJournal.recovery.idle') });
      return;
    }
    const token = ++this.startToken;
    this.starting = true;
    try {
      await this.startAudio(token, 1);
    } catch (e) {
      this.starting = false;
      if (token === this.startToken) this.failDevice((e as Error).message, code);
      return;
    }
    this.starting = false;
    if (token !== this.startToken || this.state !== 'ready') {
      this.scheduleIdle();
      return;
    }
    this.lastPos = this.pos;
    this.post({ type: 'seek', frame: Math.round(this.pos * this.sampleRate) });
    this.post({ type: 'play', countIn: null });
    this.seekHold = null;
    this.setState('playing');
    this.startWatchdog();
    recordAudio('recovery', { result: journalPhrase('audioJournal.recovery.ok') });
  }

  /** The output could not be started even after a new try: let it go and say so (`engine.errorDevice`). */
  private failDevice(detail: string, code: EngineError['code'] = 'context'): void {
    this.teardown('failure');
    recordAudio('recovery', { result: journalPhrase('audioJournal.recovery.failed', { detail: detail.slice(0, 160) }) });
    this.fail(code === 'runtime' ? 'runtime' : 'context', detail);
  }

  // ----- watchdog: while playing, the audio thread publishes its position every quantum (2.7 ms)

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchSeq = -1;
    this.watchSince = now();
    this.watchdog = setInterval(() => this.checkWatchdog(), 500);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private checkWatchdog(): void {
    if (this.state !== 'playing' || !this.views) return;
    const seq = Atomics.load(this.views.i32, 0);
    const t = now();
    if (seq !== this.watchSeq) {
      this.watchSeq = seq;
      this.watchSince = t;
      return;
    }
    if (t - this.watchSince >= WATCHDOG_MS) {
      recordAudio('stall', { s: ((t - this.watchSince) / 1000).toFixed(1) });
      void this.recover('runtime', 'the audio thread stopped reporting');
    }
  }

  private stopPlayback(): void {
    this.startToken++;
    this.stopWatchdog();
    if (this.state === 'playing') {
      this.pos = this.getPosition();
      this.post({ type: 'pause' });
    }
  }

  /** Not playing: suspend the context soon (0.4 s), and close it after `idleReleaseMs` (the output goes back). */
  private scheduleIdle(): void {
    this.cancelIdle();
    if (!this.ctx || this.disposed) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      const ctx = this.ctx;
      if (ctx && ctx.state === 'running' && this.state !== 'playing' && !this.starting && !this.disposed) {
        ctx.suspend().catch((e: Error) => {
          // a context that cannot sleep is not kept open: close it
          recordAudio('suspend-failed', { detail: e?.message ?? String(e) });
          if (ctx === this.ctx && this.state !== 'playing') this.releaseDevice('failure');
        });
      }
    }, IDLE_SUSPEND_MS);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.state !== 'playing' && !this.disposed) this.releaseDevice('idle');
    }, this.idleReleaseMs);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
  }

  private setState(state: EngineState): void {
    if (state === this.state) return;
    this.state = state;
    this.listeners.state.forEach((fn) => fn(state));
  }

  private fail(code: EngineError['code'], detail: string): void {
    this.startToken++;
    this.stopWatchdog();
    this.lastFailure = code;
    // a broken output is never kept open
    if ((code === 'context' || code === 'runtime') && this.ctx) this.teardown('failure');
    recordAudio('error', { code, detail: detail.slice(0, 200) });
    this.listeners.error.forEach((fn) => fn({ code, detail }));
    this.setState('error');
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EngineFailure('context', message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

class EngineFailure extends Error {
  constructor(
    readonly code: EngineError['code'],
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_MIX: TrackMix = { mute: false, solo: false, volume: 1 };

