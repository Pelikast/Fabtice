// The real audio engine: one AudioWorklet renders every track with Signalsmith
// Stretch (live preview quality), ported from the validated spike
// (`web/spikes/lecteur/`). This file is the main-thread half: it owns the
// AudioContext, stores the tracks as 16-bit blocks in shared memory, sends
// commands to the worklet and reads the heard playhead from a shared block.
// The audio-thread half is `worklet/` (core.ts holds the timeline model).
//
// Notes for whoever integrates it
//   - The AudioContext is created (suspended) by `loadTracks()` and resumed
//     inside `play()`, synchronously, so the call must come from the user's
//     gesture. After a pause it is suspended again to let the hardware sleep.
//   - Without cross-origin isolation (SharedArrayBuffer) or AudioWorklet,
//     `loadTracks()` rejects and the state becomes `error` / `unsupported`.
//     There is no fallback.
//   - `getPosition()` reads typed arrays only: no allocation, no message.

import {
  ENGINE_SAMPLE_RATE,
  engineTrackShape,
  type AudioEngine,
  type RenderedSet,
  type ClickTrack,
  type EngineError,
  type EngineEvents,
  type EngineState,
  type EngineTrack,
  type TrackMix,
} from './AudioEngine';
import type { Seconds, TimeRange } from '../model/project';
import { isShared, pcmToChannels } from './pcm';
import { storeTrack, type StoredTrack } from './storage';
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

type Listeners = { [K in keyof EngineEvents]: Set<EngineEvents[K]> };

interface TrackEntry {
  stored: StoredTrack;
  mix: TrackMix;
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

  /** Paused position (seconds); authoritative whenever the engine is not playing. */
  private pos = 0;
  private lastPos = 0;
  /** After a seek while playing: ignore the shared position until it reports the target. */
  private seekHold: { frame: number; until: number } | null = null;
  private startToken = 0;
  private loadToken = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pingId = 0;
  private pings = new Map<number, () => void>();
  private onReady: ((m: Extract<FromWorklet, { type: 'ready' }>) => void) | null = null;
  private diag: Diagnostics | null = null;

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

  /**
   * Bytes of audio the loaded tracks use in shared memory. Since lot 3 these
   * are the registry's own chunks (`EngineTrack.pcm`), not a second copy.
   */
  memoryBytes(): number {
    let b = 0;
    for (const t of this.tracks.values()) b += t.stored.bytes;
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
      await this.ensureGraph();
      if (token !== this.loadToken) return;
      this.post({ type: 'clear' });
      this.tracks.clear();
      for (const t of tracks) {
        await this.put(t, mixes[t.id] ?? DEFAULT_MIX);
        if (token !== this.loadToken) return;
      }
      await this.roundTrip();
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
    try {
      this.assertUsable();
      this.check(track);
      await this.ensureGraph();
      await this.put(track, mix);
      await this.roundTrip();
    } catch (e) {
      this.fail(this.errorCode(e), (e as Error).message ?? String(e));
      throw e;
    }
    this.updateDuration();
    if (this.state === 'empty') this.setState('ready');
  }

  removeTrack(id: string): void {
    if (!this.tracks.delete(id)) return;
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
    this.duration = 0;
    this.pos = 0;
    this.lastPos = 0;
    this.setState('empty');
  }

  getDuration(): Seconds {
    return this.duration;
  }

  // ---------------------------------------------------------------- transport

  async play(): Promise<void> {
    if (this.state !== 'ready' || !this.ctx || !this.node) return;
    const ctx = this.ctx;
    const token = ++this.startToken;
    this.cancelIdle();
    // Called synchronously, before any await: this is what the user gesture allows. Always called, even
    // when the context looks running: an idle `suspend()` may be in flight, and the resume queues after it.
    const resumed = ctx.resume();
    try {
      await resumed;
    } catch (e) {
      if (token === this.startToken) this.fail('context', `AudioContext.resume() failed: ${(e as Error).message}`);
      return;
    }
    if (token !== this.startToken || this.state !== 'ready') return;
    if (ctx.state !== 'running') {
      this.fail('context', `AudioContext is ${ctx.state} after resume()`);
      return;
    }
    if (this.pos >= this.duration - 1e-3) this.pos = 0;
    this.lastPos = this.pos;
    this.post({ type: 'seek', frame: Math.round(this.pos * this.sampleRate) });
    this.post({ type: 'play' });
    this.seekHold = null;
    this.setState('playing');
  }

  pause(): void {
    this.startToken++;
    if (this.state !== 'playing') return;
    this.pos = this.getPosition();
    this.lastPos = this.pos;
    this.post({ type: 'pause' });
    this.setState('ready');
    this.scheduleIdle();
  }

  seek(time: Seconds): void {
    const t = Math.min(this.duration, Math.max(0, Number.isFinite(time) ? time : 0));
    this.pos = t;
    this.lastPos = t;
    const frame = Math.round(t * this.sampleRate);
    if (this.state === 'playing' && this.ctx) this.seekHold = { frame, until: this.ctx.currentTime + 0.5 };
    this.post({ type: 'seek', frame });
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
    if (region && region.end > region.start) {
      this.loop = { start: Math.round(region.start * this.sampleRate), end: Math.round(region.end * this.sampleRate) };
    } else this.loop = null;
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

  setClickTrack(clicks: ClickTrack): void {
    const sr = this.sampleRate;
    this.clickFrames = new Float64Array(clicks.times.length);
    for (let i = 0; i < clicks.times.length; i++) this.clickFrames[i] = clicks.times[i]! * sr;
    this.clickAccents = Uint8Array.from(clicks.accents);
    this.postClicks();
  }

  // ---------------------------------------------------------------- « Appliquer » (lot 3)

  /**
   * NOT YET IMPLEMENTED: the render agent owns this path (see the contract in
   * `AudioEngine.ts#setRenderedTracks` and `app/README.md`, « Rendu
   * Appliquer »). Until then it rejects without touching the engine's state,
   * and the interface stays on the live preview.
   */
  setRenderedTracks(set: RenderedSet | null): Promise<void> {
    if (set === null) return Promise.resolve();
    return Promise.reject(new EngineFailure('unsupported', 'playing rendered audio is not implemented in this engine yet'));
  }

  /** NOT YET IMPLEMENTED (see `setRenderedTracks`): never in use. */
  isRenderedInUse(): boolean {
    return false;
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
    this.cancelIdle();
    this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.views = null;
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

  /** Creates the context, the worklet and the wasm engine, once. */
  private ensureGraph(): Promise<void> {
    if (this.graph && this.ctx && this.ctx.state !== 'closed') return this.graph;
    this.graph = this.buildGraph();
    this.graph.catch(() => {
      this.graph = null;
    });
    return this.graph;
  }

  private async buildGraph(): Promise<void> {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: this.sampleRate, latencyHint: 'playback' });
    } catch (e) {
      throw new EngineFailure('context', `AudioContext: ${(e as Error).message}`);
    }
    if (ctx.sampleRate !== this.sampleRate) {
      void ctx.close();
      throw new EngineFailure('context', `AudioContext runs at ${ctx.sampleRate} Hz, ${this.sampleRate} Hz required`);
    }
    this.ctx = ctx;
    ctx.onstatechange = () => this.onContextState();
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
      node.onprocessorerror = () => this.fail('runtime', 'processor error');
      node.connect(ctx.destination);
      this.node = node;
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new EngineFailure('context', 'the audio worklet did not start in time')), 30000);
        this.onReady = (m) => {
          clearTimeout(timer);
          this.diag = { loadAvg: 0, loadMax: 0, overBudget: 0, activeTracks: 0, missingChunks: 0, wasmBytes: m.wasmBytes, latencyA: m.latencyA, latencyB: m.latencyB };
          resolve();
        };
      });
      const copy = bytes.slice(0); // the posted buffer is transferred: keep the cached one intact
      node.port.postMessage({ type: 'init', wasm: copy } satisfies ToWorklet, [copy]);
      await ready;
    } catch (e) {
      void ctx.close().catch(() => {});
      this.ctx = null;
      this.node = null;
      if (e instanceof EngineFailure) throw e;
      throw new EngineFailure('context', (e as Error).message ?? String(e));
    }
    // the settings made before the node existed
    this.post({ type: 'params', rate: this.ratio, semitones: this.semitones + this.cents / 100 });
    this.post({ type: 'metronome', enabled: this.metronome });
    this.postClicks();
    this.postLoop();
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
      this.pings.set(id, () => {
        clearTimeout(timer);
        resolve();
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
        f?.();
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
        this.fail('runtime', m.message);
        break;
    }
  }

  private onContextState(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (ctx.state === 'closed') {
      if (this.state !== 'empty') this.fail('context', 'the AudioContext was closed');
    } else if (ctx.state !== 'running' && this.state === 'playing') {
      // Interrupted by the system (call, another app, tab discarded): stop where we were; play() will resume.
      this.pos = this.lastPos;
      this.post({ type: 'pause' });
      this.setState('ready');
    }
  }

  private stopPlayback(): void {
    this.startToken++;
    if (this.state === 'playing') {
      this.pos = this.getPosition();
      this.post({ type: 'pause' });
    }
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      const ctx = this.ctx;
      if (ctx && ctx.state === 'running' && this.state !== 'playing' && !this.disposed) void ctx.suspend().catch(() => {});
    }, IDLE_SUSPEND_MS);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private setState(state: EngineState): void {
    if (state === this.state) return;
    this.state = state;
    this.listeners.state.forEach((fn) => fn(state));
  }

  private fail(code: EngineError['code'], detail: string): void {
    this.startToken++;
    this.listeners.error.forEach((fn) => fn({ code, detail }));
    this.setState('error');
  }
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

