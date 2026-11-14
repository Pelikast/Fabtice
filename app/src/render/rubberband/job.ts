// The work of one render worker, apart from the worker's own plumbing so that
// the tests can drive it in Node: messages in, messages out. The engine is
// loaded on the first `start` (the page decides when: only when « Appliquer »
// or an export is used).

import type { FromRenderWorker, StartMessage, ToRenderWorker } from './protocol';
import { measureDelay, OfflineStretch, type RubberBandEngine } from './stretcher';

export type Post = (message: FromRenderWorker, transfer?: Transferable[]) => void;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** True for the errors a lack of memory raises (WebAssembly growth, typed array allocation). */
export function isMemoryError(e: unknown): boolean {
  const text = `${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`;
  return /RangeError|out of memory|Array buffer allocation failed|Cannot allocate|memory access out of bounds/i.test(text);
}

export class RenderJob {
  private engine: Promise<RubberBandEngine> | null = null;
  private stretch: OfflineStretch | null = null;
  private computeMs = 0;
  /** Messages are handled one at a time, in order (the first one waits for the engine to load). */
  private chain: Promise<void> = Promise.resolve();
  private dead = false;

  constructor(
    private readonly loadEngine: () => Promise<RubberBandEngine>,
    private readonly post: Post,
  ) {}

  receive(message: ToRenderWorker): void {
    this.chain = this.chain.then(() => this.handle(message));
  }

  dispose(): void {
    this.dead = true;
    this.stretch?.destroy();
    this.stretch = null;
  }

  private async handle(m: ToRenderWorker): Promise<void> {
    if (this.dead) return;
    try {
      if (m.type === 'start') await this.start(m);
      else if (m.type === 'block') this.block(m.l, m.r);
      else this.end();
    } catch (e) {
      this.stretch?.destroy();
      this.stretch = null;
      this.dead = true;
      this.post({ type: 'error', message: String((e as Error)?.stack ?? e), memory: isMemoryError(e) });
    }
  }

  private async start(m: StartMessage): Promise<void> {
    const t0 = now();
    this.engine ??= this.loadEngine();
    const engine = await this.engine;
    const delay = m.delay ?? measureDelay(engine, { sampleRate: m.sampleRate, semitones: m.semitones, tempoRatio: m.tempoRatio, formants: m.formants });
    this.stretch = new OfflineStretch(
      engine,
      {
        sampleRate: m.sampleRate,
        channels: m.channels,
        semitones: m.semitones,
        tempoRatio: m.tempoRatio,
        formants: m.formants,
        outFrames: m.outFrames,
        fadeIn: m.fadeIn,
        fadeOut: m.fadeOut,
        delay: Math.round(delay + m.preRoll / m.tempoRatio),
      },
      (l, r, n) => {
        const ol = l.slice(0, n);
        const or = r ? r.slice(0, n) : undefined;
        this.post({ type: 'out', l: ol, r: or, n }, or ? [ol.buffer, or.buffer] : [ol.buffer]);
      },
    );
    this.post({ type: 'ready', delay, ms: now() - t0 });
  }

  private block(l: Float32Array, r: Float32Array | undefined): void {
    if (!this.stretch) throw new Error('block before start');
    const t0 = now();
    this.stretch.push(l, r, l.length);
    this.computeMs += now() - t0;
    this.post({ type: 'ack' });
  }

  private end(): void {
    if (!this.stretch) throw new Error('end before start');
    const t0 = now();
    this.stretch.finish();
    this.computeMs += now() - t0;
    this.stretch.destroy();
    this.stretch = null;
    this.post({ type: 'done', computeMs: this.computeMs });
  }
}
