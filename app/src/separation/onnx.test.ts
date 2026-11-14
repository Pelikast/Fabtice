// The real separator's main-thread side, with a stand-in worker: the parts it
// writes, the progress (never back, honest remaining time), the processor
// taking over from the frames already written with the same tool, cancellation
// that ends the worker, the report, and the tools' store.

import { describe, expect, it } from 'vitest';
import { pcmFromChannels, readPcm } from '../audio/pcm';
import { MemoryModelStore } from '../analysis/models/store';
import { bundledModelList } from './models';
import { OnnxSeparator, Pace } from './onnx';
import { formatSeparationReport } from './report';
import { SeparationError, type SeparationProgress } from './types';
import type { FromWorker, SeparateMessage, ToWorker } from './worker/protocol';

const scnet = bundledModelList().models.find((m) => m.id === 'scnet')!;
const FRAMES = 48000 * 3;
const BLOCK = 48000 / 2;

interface Script {
  /** Fail on the graphics path after this many segments (null: never). */
  gpuFailAfter?: number | null;
  /** Stall (no message) after this many segments. */
  stallAfter?: number;
  /** Delay between messages, ms. */
  delay?: number;
}

/** A stand-in worker: segments of BLOCK frames, part s = (s + 1) / 10 (and its negative on the right). */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: ToWorker[] = [];
  constructor(private readonly script: Script) {
    FakeWorker.all.push(this);
  }
  terminate() {
    this.terminated = true;
  }
  private send(m: FromWorker) {
    if (!this.terminated) this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  }
  postMessage(m: ToWorker) {
    this.received.push(m);
    if (m.type !== 'separate') return;
    void this.play(m);
  }
  private async play(m: SeparateMessage) {
    const wait = () => new Promise((r) => setTimeout(r, this.script.delay ?? 1));
    const count = Math.ceil(m.audio.frames / BLOCK);
    await wait();
    this.send({ type: 'plan', downloadBytes: FakeWorker.all.length === 1 ? 1000 : 0 });
    if (FakeWorker.all.length === 1) this.send({ type: 'download', loaded: 1000, total: 1000 });
    this.send({ type: 'tool', seconds: 0.1, downloaded: FakeWorker.all.length === 1 });
    await wait();
    const first = Math.floor(m.fromFrame / BLOCK);
    this.send({ type: 'ready', backend: m.backend, sessionSeconds: 0.5, adapter: m.backend === 'gpu' ? 'apple · metal-3' : null, threads: 3, segments: count, first, segmentSeconds: 0.5 });
    let done = 0;
    for (let j = first; j < count; j++) {
      await wait();
      if (this.terminated) return;
      if (m.backend === 'gpu' && this.script.gpuFailAfter != null && done === this.script.gpuFailAfter) {
        this.send({ type: 'gpu-failed', stage: 'lost', segment: j, message: 'device lost' });
        return;
      }
      if (this.script.stallAfter !== undefined && done === this.script.stallAfter) return;
      const n = Math.min(BLOCK, m.audio.frames - j * BLOCK);
      const parts = Array.from({ length: m.stems }, (_, s) => (m.monoOut ? [new Float32Array(n).fill((s + 1) / 10)] : [new Float32Array(n).fill((s + 1) / 10), new Float32Array(n).fill(-(s + 1) / 10)]));
      this.send({ type: 'block', offset: j * BLOCK, parts });
      this.send({ type: 'segment', index: j, count, seconds: 1 + j * 0.01, written: j * BLOCK + n });
      done++;
    }
    this.send({ type: 'done', segments: count, computed: count - first });
  }
}

function piece(stereo: boolean) {
  const l = new Float32Array(FRAMES).fill(0.25);
  return pcmFromChannels(stereo ? [l, new Float32Array(FRAMES).fill(-0.25)] : [l], 48000);
}

function separator(script: Script) {
  FakeWorker.all = [];
  const store = new MemoryModelStore();
  const sep = new OnnxSeparator({ createWorker: () => new FakeWorker(script) as unknown as Worker, store: async () => store });
  return { sep, store };
}

async function runIt(script: Script, backend: 'auto' | 'cpu', stereo = true, signal = new AbortController().signal) {
  const { sep } = separator(script);
  const progress: SeparationProgress[] = [];
  const out = await sep.separate({ audio: piece(stereo), model: scnet, backend, onProgress: (p) => progress.push(p), signal });
  return { out, progress };
}

describe('the real separator (stand-in worker)', () => {
  it('writes every part at the piece length, from the blocks the worker hands back', async () => {
    const { out, progress } = await runIt({}, 'cpu');
    expect(out.tracks.map((t) => t.stem)).toEqual(scnet.stems);
    const a = out.tracks[1]!.audio;
    expect(a.frames).toBe(FRAMES);
    expect(a.sampleRate).toBe(48000);
    expect(a.mono).toBe(false);
    const l = new Float32Array(10);
    readPcm(a, 0, FRAMES - 10, l);
    expect(l[9]).toBeCloseTo(0.2, 3);
    const r = new Float32Array(10);
    readPcm(a, 1, 1000, r);
    expect(r[0]).toBeCloseTo(-0.2, 3);
    expect(out.backend).toBe('cpu');
    expect(out.fellBack).toBe(false);
    // Progress: never back, ends high, the remaining time said once two segments are timed.
    const fr = progress.map((p) => p.fraction);
    expect(fr.every((f, i) => i === 0 || f >= fr[i - 1]!)).toBe(true);
    expect(fr[fr.length - 1]!).toBeGreaterThan(0.95);
    const separating = progress.filter((p) => p.step === 'separate');
    expect(separating[0]!.remainingSeconds).toBeNull();
    expect(separating.some((p) => p.remainingSeconds !== null)).toBe(true);
    expect(progress.some((p) => p.step === 'download' && p.download?.total === 1000)).toBe(true);
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
    // The report.
    expect(out.report?.segments).toBe(6);
    expect(out.report?.download?.bytes).toBe(1000);
    const text = formatSeparationReport(out.report!);
    expect(text).toMatch(/SCNet/);
    expect(text).toMatch(/processeur \(WebAssembly\)/);
  });

  it('a piece in one channel gives one channel per part', async () => {
    const { out } = await runIt({}, 'cpu', false);
    expect(out.tracks[0]!.audio.mono).toBe(true);
    expect(out.tracks[0]!.audio.frames).toBe(FRAMES);
    expect((FakeWorker.all[0]!.received[0] as SeparateMessage).monoOut).toBe(true);
  });

  it('graphics failure: the same tool goes on on the processor from the frames written, said at once', async () => {
    const { out, progress } = await runIt({ gpuFailAfter: 2 }, 'auto');
    expect(FakeWorker.all).toHaveLength(2);
    const [gpu, cpu] = FakeWorker.all as [FakeWorker, FakeWorker];
    expect(gpu.terminated).toBe(true);
    const second = cpu.received[0] as SeparateMessage;
    expect(second.backend).toBe('cpu');
    expect(second.tool.sha256).toBe(scnet.file.sha256);
    expect(second.fromFrame).toBe(2 * BLOCK);
    expect(out.fellBack).toBe(true);
    expect(out.backend).toBe('cpu');
    const firstFallback = progress.findIndex((p) => p.fellBack);
    expect(progress[firstFallback]!.backend).toBe('cpu');
    expect(progress.slice(firstFallback).every((p) => p.fellBack)).toBe(true);
    const fr = progress.map((p) => p.fraction);
    expect(fr.every((f, i) => i === 0 || f >= fr[i - 1]!)).toBe(true);
    // Every frame written once in all: the part is whole.
    const l = new Float32Array(FRAMES);
    readPcm(out.tracks[3]!.audio, 0, 0, l);
    expect(Math.min(...l.filter((_, i) => i % 1000 === 0))).toBeCloseTo(0.4, 3);
    expect(out.report?.fallback).toMatchObject({ stage: 'lost', segment: 2 });
    expect(formatSeparationReport(out.report!)).toMatch(/au segment 3 sur 6/);
  });

  it('cancellation rejects at once and ends the worker', async () => {
    const abort = new AbortController();
    const { sep } = separator({ delay: 20 });
    const p = sep.separate({ audio: piece(true), model: scnet, backend: 'cpu', onProgress: () => {}, signal: abort.signal });
    await new Promise((r) => setTimeout(r, 70));
    abort.abort();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    expect((FakeWorker.all[0]!.received.at(-1) as ToWorker).type).toBe('cancel');
    await new Promise((r) => setTimeout(r, 260));
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    // A new separation can start.
    await expect(sep.separate({ audio: piece(true), model: scnet, backend: 'cpu', onProgress: () => {}, signal: new AbortController().signal })).resolves.toBeTruthy();
  });

  it('a worker error on the processor fails the run with a code', async () => {
    FakeWorker.all = [];
    const sep = new OnnxSeparator({
      createWorker: () => {
        const w = new FakeWorker({});
        w.postMessage = (m: ToWorker) => {
          if (m.type === 'separate') setTimeout(() => w.onmessage?.({ data: { type: 'error', code: 'memory', message: 'out of memory' } } as MessageEvent<FromWorker>), 1);
        };
        return w as unknown as Worker;
      },
      store: async () => new MemoryModelStore(),
    });
    await expect(sep.separate({ audio: piece(true), model: scnet, backend: 'cpu', onProgress: () => {}, signal: new AbortController().signal })).rejects.toEqual(new SeparationError('memory', 'out of memory'));
  });

  it('the tools: found on the device, listed with their size, forgotten', async () => {
    const { sep, store } = separator({});
    expect(await sep.isCached(scnet)).toBe(false);
    await store.putFile({ id: 'scnet', bytes: scnet.file.bytes, sha256: scnet.file.sha256, data: new ArrayBuffer(4) });
    expect(await sep.isCached(scnet)).toBe(true);
    expect(await sep.toolsUsage()).toEqual({ cached: [{ id: 'scnet', bytes: scnet.file.bytes }], bytes: scnet.file.bytes });
    await sep.forgetTools();
    expect(await sep.isCached(scnet)).toBe(false);
    expect((await sep.toolsUsage()).bytes).toBe(0);
  });

  it('the pace: nothing said from one segment, the first left out after', () => {
    const p = new Pace();
    p.add(10);
    expect(p.remaining(5)).toBeNull();
    p.add(4);
    p.add(6);
    expect(p.perSegment()).toBe(5);
    expect(p.remaining(3)).toBe(15);
    p.reset();
    expect(p.remaining(3)).toBeNull();
  });
});
