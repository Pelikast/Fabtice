// The real offline renderer: Rubber Band R3 « finer » in a Web Worker
// (`./rubberband/worker.ts`), the page streaming the input in blocks and
// writing the output as it arrives. See `./types.ts` for the contract and
// `./rubberband/stretcher.ts` for what is done to keep the alignment.
//
// On this side, which runs on the interface's thread, nothing is held whole: a
// block of input (16 384 frames) is read from the 16-bit chunks with
// `readPcm`, transferred to the worker, and the blocks that come back are
// written with `PcmWriter`. At most a few blocks are in flight (the worker
// acknowledges each one), so a slow render does not pile up input in memory.
// Each render has its own worker, ended when it is done or cancelled.

import { PcmWriter, readPcm, type PcmAudio } from '../audio/pcm';
import { renderParallelism } from './budget';
import { BLOCKS_IN_FLIGHT, BLOCK_FRAMES, type FromRenderWorker, type ToRenderWorker } from './rubberband/protocol';
import { RenderError, type OfflineRenderer, type RenderRequest } from './types';

/** The part of a Worker this renderer uses (replaceable in tests). */
export interface RenderWorkerLike {
  postMessage(message: ToRenderWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<FromRenderWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
}

export interface RubberBandRendererOptions {
  createWorker?: () => RenderWorkerLike;
  /** How many renders may usefully run at once (`OfflineRenderer.parallel`). */
  parallel?: number;
}

function defaultWorker(): RenderWorkerLike {
  return new Worker(new URL('./rubberband/worker.ts', import.meta.url), { type: 'module', name: 'fabtice-render' }) as unknown as RenderWorkerLike;
}

/** Whether this browser can run the render at all. */
export function renderSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** 2 ms: the fade on an edge that cuts the audio inside (the start or end of a range), so it does not click. */
const EDGE_FADE_S = 0.002;
/**
 * Real audio fed before and after a range (frames at any rate: 170 ms at 48 kHz), so the engine starts and ends
 * on the sound itself and not on a cut: its start-up artefacts (about 5 ms of an odd waveform) are not in what
 * is kept. Only the audio that exists is used: a range at the start of the audio has none before it.
 */
const ROLL_FRAMES = 8192;

/** The lateness the engine was measured to have for given settings, kept for the page's life (a probe costs about 0.4 s). */
const delays = new Map<string, number>();

export class RubberBandRenderer implements OfflineRenderer {
  readonly kind = 'rubberband';
  readonly supportsFormants = true;
  readonly parallel: number;
  private readonly createWorker: () => RenderWorkerLike;
  private readonly injected: boolean;

  constructor(options: RubberBandRendererOptions = {}) {
    this.createWorker = options.createWorker ?? defaultWorker;
    this.injected = !!options.createWorker;
    this.parallel = options.parallel ?? renderParallelism();
  }

  render(req: RenderRequest): Promise<PcmAudio> {
    const { audio, signal } = req;
    if (!this.injected && !renderSupported()) return Promise.reject(new RenderError('unsupported'));
    if (signal?.aborted) return Promise.reject(new RenderError('cancelled'));
    const sr = audio.sampleRate;
    const ratio = Math.min(2, Math.max(0.25, req.tempoRatio));
    const semitones = Math.min(12, Math.max(-12, req.semitones)) + Math.min(50, Math.max(-50, req.cents)) / 100;
    const start = req.range ? Math.max(0, Math.round(req.range.start * sr)) : 0;
    const end = req.range ? Math.min(audio.frames, Math.round(req.range.end * sr)) : audio.frames;
    if (end <= start) return Promise.reject(new RenderError('failed', 'empty range'));
    const inFrames = end - start;
    const outFrames = Math.round(inFrames / ratio);
    const pre = Math.min(start, ROLL_FRAMES);
    const post = Math.min(audio.frames - end, ROLL_FRAMES);
    const feedFrames = pre + inFrames + post;
    if (outFrames < 1) return Promise.reject(new RenderError('failed', 'empty output'));
    const channels: 1 | 2 = audio.mono ? 1 : 2;
    const fade = Math.round(EDGE_FADE_S * sr);
    const formants = req.formants;
    const key = `${sr}|${semitones.toFixed(4)}|${ratio.toFixed(6)}|${formants ? 1 : 0}`;

    let writer: PcmWriter;
    try {
      writer = new PcmWriter(outFrames, sr, audio.channelCount);
    } catch (e) {
      return Promise.reject(new RenderError('memory', String((e as Error)?.message ?? e)));
    }
    let worker: RenderWorkerLike;
    try {
      worker = this.createWorker();
    } catch (e) {
      return Promise.reject(new RenderError('unsupported', String((e as Error)?.message ?? e)));
    }

    return new Promise<PcmAudio>((resolve, reject) => {
      let settled = false;
      let sent = 0;
      let inFlight = 0;
      let written = 0;
      let endSent = false;
      let ready = false;
      let lastFraction = 0;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
        fn();
      };
      const fail = (code: ConstructorParameters<typeof RenderError>[0], detail?: string) => finish(() => reject(new RenderError(code, detail)));
      const onAbort = () => fail('cancelled');
      signal?.addEventListener('abort', onAbort, { once: true });

      const progress = () => {
        const f = Math.min(1, written / outFrames);
        if (f > lastFraction) {
          lastFraction = f;
          req.onProgress?.(f);
        }
      };

      const pump = () => {
        if (settled || !ready) return;
        try {
          while (inFlight < BLOCKS_IN_FLIGHT && sent < feedFrames) {
            const n = Math.min(BLOCK_FRAMES, feedFrames - sent);
            const at = start - pre + sent;
            const l = new Float32Array(n);
            readPcm(audio, 0, at, l);
            let r: Float32Array | undefined;
            if (channels === 2) {
              r = new Float32Array(n);
              readPcm(audio, 1, at, r);
            }
            worker.postMessage({ type: 'block', l, r }, r ? [l.buffer, r.buffer] : [l.buffer]);
            sent += n;
            inFlight++;
          }
          if (sent >= feedFrames && !endSent) {
            endSent = true;
            worker.postMessage({ type: 'end' });
          }
        } catch (e) {
          fail('failed', String((e as Error)?.message ?? e));
        }
      };

      worker.onmessage = (e) => {
        const m = e.data;
        try {
          switch (m.type) {
            case 'ready':
              delays.set(key, m.delay);
              ready = true;
              pump();
              break;
            case 'ack':
              inFlight--;
              pump();
              break;
            case 'out':
              writer.write(written, m.l.subarray(0, m.n), m.r?.subarray(0, m.n));
              written += m.n;
              progress();
              break;
            case 'done':
              if (written !== outFrames) {
                fail('failed', `the worker delivered ${written} of ${outFrames} frames`);
                break;
              }
              finish(() => {
                req.onProgress?.(1);
                resolve(writer.finish());
              });
              break;
            case 'error':
              fail(m.memory ? 'memory' : 'failed', m.message);
              break;
          }
        } catch (err) {
          fail('failed', String((err as Error)?.message ?? err));
        }
      };
      worker.onerror = (e) => fail('failed', e.message || 'the render worker failed');
      worker.onmessageerror = () => fail('failed', 'a message to or from the render worker could not be read');

      worker.postMessage({
        type: 'start',
        sampleRate: sr,
        channels,
        semitones,
        tempoRatio: ratio,
        formants,
        outFrames,
        fadeIn: start > 0 ? fade : 0,
        fadeOut: end < audio.frames ? fade : 0,
        delay: delays.get(key) ?? null,
        preRoll: pre,
      });
    });
  }
}
