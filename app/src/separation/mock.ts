// A stand-in separator: every « instrument » is a band-filtered copy of the
// piece (a low band for the bass, the middle for the voice…), so the screens,
// the storage and the tests see believable tracks of the right length, at a
// chosen pace, with the same progress, fallback, cancellation and errors as
// the real one will have. It is NOT a separation, and the separation panel
// says so whenever it is in use.

import { CHUNK, PcmWriter, readPcm } from '../audio/pcm';
import type { SeparationBackend, StemId } from '../model/separation';
import {
  SeparationError,
  type SeparatedTrack,
  type SeparationErrorCode,
  type SeparationModelSpec,
  type SeparationOutput,
  type SeparationProgress,
  type SeparationRequest,
  type Separator,
  type ToolsUsage,
} from './types';

export interface MockSeparatorOptions {
  /** Wall time of the computation for the whole piece, ms (default 2 500). */
  durationMs?: number;
  /** Wall time of the first « download » of a tool, ms (default 1 200; 0 = tools already there). */
  downloadMs?: number;
  /** Fail with this code half way. */
  failWith?: SeparationErrorCode;
  /** The graphics path « fails » at this fraction of the computation: the rest goes on the processor, same tool, slower. */
  fallbackAt?: number;
  /** Tools already on the device at start. */
  cached?: string[];
}

/** RBJ biquad, one per channel. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}
  static make(kind: 'low' | 'high' | 'band', f: number, q: number, sr: number): Biquad {
    const w = (2 * Math.PI * f) / sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (kind === 'low') return new Biquad((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
    if (kind === 'high') return new Biquad((1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
    return new Biquad(alpha / a0, 0, -alpha / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }
  run(buf: Float32Array, gain: number): void {
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i]!;
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      buf[i] = y * gain;
    }
  }
}

/** The band each « instrument » keeps: kind, frequency, Q, gain. */
const BANDS: Record<StemId, ['low' | 'high' | 'band', number, number, number]> = {
  bass: ['low', 160, 0.8, 0.9],
  drums: ['high', 3500, 0.7, 1.4],
  vocals: ['band', 900, 0.9, 1.1],
  guitar: ['band', 450, 1.2, 1.2],
  piano: ['band', 1800, 1.1, 1.3],
  winds: ['band', 1300, 1.4, 1.3],
  other: ['band', 250, 0.9, 0.9],
  kick: ['low', 90, 1, 1],
  snare: ['band', 220, 1.5, 1.2],
  hihat: ['high', 7000, 0.8, 1.5],
  toms: ['band', 140, 1.6, 1.1],
  cymbals: ['high', 9000, 0.7, 1.5],
  saxophone: ['band', 700, 1.3, 1.2],
  brass: ['band', 1100, 1.3, 1.2],
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new SeparationError('cancelled'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SeparationError('cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

export class MockSeparator implements Separator {
  readonly kind = 'mock';
  private readonly cached: Set<string>;
  private running = false;

  constructor(private readonly opts: MockSeparatorOptions = {}) {
    this.cached = new Set(opts.cached ?? []);
  }

  async isCached(model: SeparationModelSpec): Promise<boolean> {
    return this.cached.has(model.id);
  }

  async toolsUsage(): Promise<ToolsUsage> {
    // Sizes as the list says (nothing is really downloaded).
    const { getModelList } = await import('./models');
    const cached = getModelList().list.models.filter((m) => this.cached.has(m.id)).map((m) => ({ id: m.id, bytes: m.file.bytes }));
    return { cached, bytes: cached.reduce((n, c) => n + c.bytes, 0) };
  }

  async forgetTools(): Promise<void> {
    this.cached.clear();
  }

  async separate(request: SeparationRequest): Promise<SeparationOutput> {
    if (this.running) throw new SeparationError('failed', 'a separation is already running');
    this.running = true;
    try {
      return await this.work(request);
    } finally {
      this.running = false;
    }
  }

  private async work(request: SeparationRequest): Promise<SeparationOutput> {
    const { audio, model, signal } = request;
    const report = (p: SeparationProgress) => {
      try {
        request.onProgress(p);
      } catch {
        // never into the separator
      }
    };
    let backend: SeparationBackend | null = null;
    let fellBack = false;

    // « Download » of the tool, the first time.
    const downloadMs = this.opts.downloadMs ?? 1200;
    const downloading = !this.cached.has(model.id) && downloadMs > 0;
    const dlShare = downloading ? 0.15 : 0;
    if (downloading) {
      const total = model.file.bytes;
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await sleep(downloadMs / steps, signal);
        report({ step: 'download', fraction: (dlShare * i) / steps, remainingSeconds: null, download: { loaded: Math.round((total * i) / steps), total }, backend, fellBack });
      }
    }
    this.cached.add(model.id);

    report({ step: 'prepare', fraction: dlShare, remainingSeconds: null, backend, fellBack });
    await sleep(80, signal);
    backend = request.backend === 'cpu' ? 'cpu' : 'gpu';

    const durationMs = this.opts.durationMs ?? 2500;
    const sr = audio.sampleRate;
    const stereo = !audio.mono;
    const writers = model.stems.map((stem) => ({ stem, writer: new PcmWriter(audio.frames, sr, audio.channelCount), band: BANDS[stem] }));
    const filters = writers.map((w) => [Biquad.make(w.band[0], w.band[1], w.band[2], sr), Biquad.make(w.band[0], w.band[1], w.band[2], sr)]);
    const inL = new Float32Array(CHUNK);
    const inR = new Float32Array(CHUNK);
    const work = new Float32Array(CHUNK);
    const workR = new Float32Array(CHUNK);
    const started = Date.now();
    let paceStart = started;
    let paceBase = 0;
    let pace = durationMs;
    for (let s = 0; s < audio.frames; s += CHUNK) {
      if (signal.aborted) throw new SeparationError('cancelled');
      const n = Math.min(CHUNK, audio.frames - s);
      const l = n === CHUNK ? inL : inL.subarray(0, n);
      const r = n === CHUNK ? inR : inR.subarray(0, n);
      readPcm(audio, 0, s, l);
      if (stereo) readPcm(audio, 1, s, r);
      writers.forEach((w, k) => {
        const a = n === CHUNK ? work : work.subarray(0, n);
        a.set(l);
        filters[k]![0]!.run(a, w.band[3]);
        if (stereo) {
          const b = n === CHUNK ? workR : workR.subarray(0, n);
          b.set(r);
          filters[k]![1]!.run(b, w.band[3]);
          w.writer.write(s, a, b);
        } else w.writer.write(s, a);
      });
      const done = (s + n) / audio.frames;
      if (this.opts.failWith && done >= 0.5) throw new SeparationError(this.opts.failWith, 'mock failure');
      if (!fellBack && backend === 'gpu' && this.opts.fallbackAt !== undefined && done >= this.opts.fallbackAt) {
        // The graphics path « fails »: the same tool goes on, on the processor, more slowly.
        fellBack = true;
        backend = 'cpu';
        paceStart = Date.now();
        paceBase = done;
        pace = durationMs * 1.6;
      }
      const target = paceStart + (done - paceBase) * pace;
      // Like a real separator: the remaining time is said once a little has been measured.
      const remaining = done > 0.02 ? (pace * (1 - done)) / 1000 : null;
      report({ step: 'separate', fraction: dlShare + (1 - dlShare) * 0.97 * done, remainingSeconds: remaining, backend, fellBack });
      await sleep(target - Date.now(), signal);
    }
    report({ step: 'finish', fraction: dlShare + (1 - dlShare) * 0.98, remainingSeconds: 0, backend, fellBack });
    const tracks: SeparatedTrack[] = writers.map((w) => ({ stem: w.stem, audio: w.writer.finish() }));
    tracks.forEach((tr) => request.onTrack?.(tr));
    return { tracks, backend, fellBack, computeSeconds: (Date.now() - started) / 1000 };
  }
}
