// Helpers for the render tests (Node, real WebAssembly): a stand-in for the
// page's `Worker` that runs the worker's own job in this thread, and signals
// to render. Not imported by the app.

import { readFileSync } from 'node:fs';
import { pcmFromChannels, readPcm, type PcmAudio } from '../../audio/pcm';
import type { RenderWorkerLike } from '../rubberband';
import { RenderJob } from './job';
import type { FromRenderWorker, ToRenderWorker } from './protocol';
import { RubberBandEngine } from './stretcher';

export const SR = 48000;

let engine: Promise<RubberBandEngine> | null = null;

/** The engine, loaded once per test file (the worker loads it from its URL, here from disk). */
export function loadEngine(): Promise<RubberBandEngine> {
  engine ??= RubberBandEngine.load(readFileSync(new URL('./rubberband-nosimd.wasm', import.meta.url)));
  return engine;
}

export interface WorkerLog {
  /** Frames of every input block the page posted. */
  blocks: number[];
  /** Number of workers terminated. */
  terminated: number;
  /** Everything the page sent. */
  sent: ToRenderWorker['type'][];
}

/**
 * `createWorker` for `RubberBandRenderer`: the real job in this thread, its
 * messages delivered asynchronously like a worker's. `log` collects what the
 * page did.
 */
export function inProcessWorkers(log: WorkerLog = { blocks: [], terminated: 0, sent: [] }): { create: () => RenderWorkerLike; log: WorkerLog } {
  const create = (): RenderWorkerLike => {
    let dead = false;
    const w: RenderWorkerLike = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(message) {
        if (dead) return;
        log.sent.push(message.type);
        if (message.type === 'block') log.blocks.push(message.l.length);
        // The message crosses to the worker: its buffers are the worker's now (a copy is as good here).
        job.receive(message.type === 'block' ? { ...message, l: message.l.slice(), r: message.r?.slice() } : message);
      },
      terminate() {
        if (dead) return;
        dead = true;
        log.terminated++;
        job.dispose();
      },
    };
    const job = new RenderJob(loadEngine, (m: FromRenderWorker) => {
      setTimeout(() => {
        if (!dead) w.onmessage?.({ data: m } as MessageEvent<FromRenderWorker>);
      }, 0);
    });
    return w;
  };
  return { create, log };
}

/** A stereo piece (or mono when `r` is omitted) in the app's in-memory form. */
export function pcmOf(l: Float32Array, r?: Float32Array): PcmAudio {
  return pcmFromChannels(r ? [l, r] : [l], SR);
}

/** Hann-windowed noise bursts of `len` frames starting at each time (seconds): clicks like the onset of a drum hit. */
export function noiseClicks(seconds: number, times: number[], len = 48, amp = 0.8, seed = 99): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  let s = seed;
  for (const t of times) {
    const start = Math.round(t * SR);
    for (let i = 0; i < len && start + i < a.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      a[start + i] = a[start + i]! + amp * Math.sin((Math.PI * (i + 0.5)) / len) ** 2 * (s / 2 ** 31 - 1);
    }
  }
  return a;
}

/** The decoded samples of one channel of a render, as Float32. */
export function channelOf(pcm: PcmAudio, channel: 0 | 1 = 0): Float32Array {
  const out = new Float32Array(pcm.frames);
  readPcm(pcm, channel, 0, out);
  return out;
}
