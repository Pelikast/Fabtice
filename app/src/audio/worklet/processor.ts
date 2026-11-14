// AudioWorklet entry: one processor renders every track (see core.ts for the
// timeline model). Vite emits this file as a self-contained script (`?worker&url`
// in `../assets.ts`); it is loaded with `audioWorklet.addModule()`.

import { PlayerCore, TrackData } from './core';
import { FLAG_PLAYING, sharedViews, type Diagnostics, type FromWorklet, type SharedViews, type ToWorklet } from './protocol';
import { calibrateLatency, SignalsmithEngine } from './stretch';

export const PROCESSOR_NAME = 'fabtice-player';

class FabticePlayer extends AudioWorkletProcessor {
  private core: PlayerCore | null = null;
  private readonly shared: SharedViews;
  private tick = 0;
  private lastEnded = false;
  private seq = 0;
  private starting = false;
  /** Messages that arrived while the wasm was still compiling. */
  private queue: ToWorklet[] = [];

  constructor(options?: { processorOptions?: unknown }) {
    super();
    const po = (options?.processorOptions ?? {}) as { shared: SharedArrayBuffer };
    this.shared = sharedViews(po.shared);
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.receive(e.data);
    this.port.onmessageerror = () => this.send({ type: 'error', message: 'messageerror (a posted value could not be deserialized)' });
  }

  private send(m: FromWorklet): void {
    this.port.postMessage(m);
  }

  private receive(m: ToWorklet): void {
    try {
      if (m.type === 'init') {
        void this.init(m.wasm);
        return;
      }
      if (!this.core) {
        if (m.type === 'ping') this.send({ type: 'pong', id: m.id });
        else this.queue.push(m);
        return;
      }
      this.handle(this.core, m);
    } catch (err) {
      this.send({ type: 'error', message: String((err as Error)?.stack ?? err) });
    }
  }

  private async init(bytes: ArrayBuffer): Promise<void> {
    if (this.starting || this.core) return;
    this.starting = true;
    try {
      const t0 = Date.now();
      const engine = await SignalsmithEngine.load(bytes, sampleRate);
      const lat = calibrateLatency(engine);
      this.core = new PlayerCore(sampleRate, engine, lat);
      this.send({ type: 'ready', latencyA: lat.a, latencyB: lat.b, wasmBytes: engine.memoryBytes, ms: Date.now() - t0 });
      for (const m of this.queue.splice(0)) this.receive(m);
    } catch (err) {
      this.send({ type: 'error', message: `init: ${String((err as Error)?.stack ?? err)}` });
    }
  }

  private handle(c: PlayerCore, m: ToWorklet): void {
    switch (m.type) {
      case 'track':
        c.addTrack(m.id, new TrackData(m.frames, m.mono, m.chunks), { volume: m.volume, mute: m.mute, solo: m.solo });
        break;
      case 'rendered': {
        const entries = new Map<string, TrackData>();
        for (const t of m.tracks) entries.set(t.id, new TrackData(t.frames, t.mono, t.chunks));
        c.setRendered(m.semitones, m.ratio, entries);
        break;
      }
      case 'rendered-clear':
        c.clearRendered();
        break;
      case 'remove':
        c.removeTrack(m.id);
        break;
      case 'clear':
        c.clearTracks();
        break;
      case 'mix':
        c.setMix(m.id, { volume: m.volume, mute: m.mute, solo: m.solo });
        break;
      case 'params':
        if (m.rate !== undefined) c.setRate(m.rate);
        if (m.semitones !== undefined) c.semitones = m.semitones;
        break;
      case 'loop':
        c.setLoop(m.enabled, m.start, m.end);
        break;
      case 'clicks':
        c.setClicks(m.frames, m.accents);
        break;
      case 'metronome':
        c.setMetronome(m.enabled);
        break;
      case 'play':
        c.play();
        break;
      case 'pause':
        c.pause();
        break;
      case 'seek':
        c.seek(m.frame);
        break;
      case 'ping':
        this.send({ type: 'pong', id: m.id });
        break;
    }
  }

  private publish(c: PlayerCore): void {
    const { i32, f64 } = this.shared;
    this.seq += 2;
    Atomics.store(i32, 0, this.seq - 1); // odd: being written
    f64[0] = c.heardPos();
    f64[1] = currentFrame;
    f64[2] = c.rate;
    Atomics.store(i32, 1, c.playing ? FLAG_PLAYING : 0);
    Atomics.store(i32, 0, this.seq); // even: consistent
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const c = this.core;
    if (!out || !out[0]) return true;
    if (!c) return true;
    const left = out[0];
    c.render(left, out.length > 1 ? out[1]! : left);
    this.publish(c);
    if ((++this.tick & 15) === 0) {
      const load = c.takeLoad();
      const d: Diagnostics = {
        loadAvg: load.avg,
        loadMax: load.max,
        overBudget: c.stat.over,
        activeTracks: c.activeTracks,
        missingChunks: c.missingChunks(),
        wasmBytes: c.memoryBytes,
        latencyA: c.latency.a,
        latencyB: c.latency.b,
        applied: c.mixApplied,
      };
      this.send({ type: 'status', diagnostics: d });
    }
    if (c.ended && !this.lastEnded) this.send({ type: 'ended' });
    this.lastEnded = c.ended;
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, FabticePlayer);
