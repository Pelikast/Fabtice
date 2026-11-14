// The analyser's main-thread side, against a scripted worker: what it sends,
// how it reports progress, how it ends, cancels and reuses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSwingResult } from './fromDemoSwing';
import { FabticeAnalyzer, DOWNLOAD_SHARE, STEP_WEIGHTS } from './fabtice';
import { resetModelStore, MemoryModelStore } from './models/store';
import { MODEL_REGISTRY } from './models';
import type { NetworkOutputs } from './engine/pipeline';
import { AnalysisError, type AnalysisProgress, type AnalysisRequest } from './types';
import type { FromWorker, ToWorker } from './worker/protocol';

class FakeWorker {
  onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: { message: ToWorker; transfer: Transferable[] }[] = [];
  terminated = false;
  constructor(readonly script?: (message: ToWorker, worker: FakeWorker) => void) {}
  postMessage(message: ToWorker, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer });
    this.script?.(message, this);
  }
  emit(m: FromWorker) {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  }
  terminate() {
    this.terminated = true;
  }
}

const OUTPUTS = { tuning: { cents: 0, refHz: 440, confidence: 0, peaks: 0 }, act: { beat: new Float32Array(0), down: new Float32Array(0), frames: 0, fps: 50 }, frames: { T: 0, fps: 10, probs: new Float32Array(0), pitch: new Float32Array(0), bass: new Float32Array(0) }, timeScale: 1 } as NetworkOutputs;
const RESULT = demoSwingResult(20, { id: 'fabtice', version: '1', models: ['beat-this-logmel'] });

function request(over: Partial<AnalysisRequest> = {}): AnalysisRequest {
  const left = Float32Array.from({ length: 48000 }, (_, i) => (i % 100) / 100);
  const right = Float32Array.from({ length: 48000 }, () => 0.5);
  return { channels: [left, right], sampleRate: 48000, audioId: 'audio-1', ...over };
}

/** An analyser whose workers are the ones this test makes. */
function analyser(script?: (message: ToWorker, worker: FakeWorker) => void) {
  const workers: FakeWorker[] = [];
  const a = new FabticeAnalyzer({
    createWorker: () => {
      const w = new FakeWorker(script);
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return { a, workers };
}

const finishWith = (w: FakeWorker, outputs: NetworkOutputs | null = OUTPUTS) => w.emit({ type: 'result', result: RESULT, outputs, models: ['beat-this-logmel'] });

describe('FabticeAnalyzer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetModelStore();
  });

  it('hands the worker one mono mix of the piece by transfer, and ends it with the result', async () => {
    const { a, workers } = analyser();
    const req = request();
    const work = a.analyse(req);
    await vi.advanceTimersByTimeAsync(0);
    const w = workers[0]!;
    const sent = w.posted[0]!;
    expect(sent.message.type).toBe('analyse');
    if (sent.message.type !== 'analyse') throw new Error('unreachable');
    expect(sent.message.sampleRate).toBe(48000);
    expect(sent.message.duration).toBe(1);
    expect(sent.message.beatModel).toBe('light');
    expect(sent.message.grid).toBeNull();
    expect(sent.message.key).toBeNull();
    expect(sent.message.mono.length).toBe(48000);
    expect(sent.message.mono[50]).toBeCloseTo((0.5 + 0.5) / 2, 6);
    expect(sent.message.mono[0]).toBeCloseTo(0.25, 6);
    expect(sent.transfer).toEqual([sent.message.mono.buffer]);
    // The piece the engine plays is untouched.
    expect(req.channels[0]!.byteLength).toBe(48000 * 4);
    expect(req.channels[0]![50]).toBeCloseTo(0.5, 6);
    finishWith(w);
    await expect(work).resolves.toBe(RESULT);
    expect(w.terminated).toBe(true);
  });

  it('mixes a long piece in slices without blocking, to the same result', async () => {
    const { a, workers } = analyser();
    const n = 3_000_000;
    const ch = Float32Array.from({ length: n }, (_, i) => (i % 7) / 7);
    const work = a.analyse({ ...request(), channels: [ch] });
    await vi.advanceTimersByTimeAsync(10);
    const sent = workers[0]!.posted[0]!.message;
    if (sent.type !== 'analyse') throw new Error('unreachable');
    expect(sent.mono.length).toBe(n);
    expect(sent.mono[1_500_001]).toBe(ch[1_500_001]);
    finishWith(workers[0]!);
    await work;
  });

  it('turns the steps into one fraction that never goes back, with the download first', async () => {
    const { a, workers } = analyser();
    const seen: AnalysisProgress[] = [];
    const work = a.analyse(request({ onProgress: (p) => seen.push(p) }));
    await vi.advanceTimersByTimeAsync(0);
    const w = workers[0]!;
    w.emit({ type: 'plan', downloadBytes: 17_000_000 });
    w.emit({ type: 'step', step: 'download' });
    w.emit({ type: 'progress', step: 'download', fraction: 0.5, download: { modelId: 'beat-this-small0', loaded: 8_500_000, total: 17_000_000 } });
    w.emit({ type: 'progress', step: 'download', fraction: 1, download: { modelId: 'crema-chords', loaded: 17_000_000, total: 17_000_000 } });
    w.emit({ type: 'step', step: 'prepare' });
    w.emit({ type: 'progress', step: 'prepare', fraction: 0.5 });
    w.emit({ type: 'step', step: 'tuning' });
    w.emit({ type: 'step', step: 'beats' });
    w.emit({ type: 'progress', step: 'beats', fraction: 0.5 });
    w.emit({ type: 'progress', step: 'beats', fraction: 0.2 }); // a step cannot take the whole back
    w.emit({ type: 'step', step: 'chords' });
    w.emit({ type: 'step', step: 'finish' });
    finishWith(w);
    await work;
    const f = seen.map((p) => p.fraction);
    expect(f.every((v, i) => i === 0 || v >= f[i - 1]!)).toBe(true);
    expect(f[f.length - 1]).toBe(1);
    const at = (step: string, pick: (list: AnalysisProgress[]) => AnalysisProgress | undefined = (l) => l[l.length - 1]) => pick(seen.filter((p) => p.step === step));
    expect(at('download')!.fraction).toBeCloseTo(DOWNLOAD_SHARE, 6);
    expect(at('download')!.download).toEqual({ modelId: 'crema-chords', loaded: 17_000_000, total: 17_000_000 });
    expect(at('prepare')!.fraction).toBeCloseTo(DOWNLOAD_SHARE + (1 - DOWNLOAD_SHARE) * STEP_WEIGHTS.prepare * 0.5, 6);
    expect(at('beats', (l) => l[0])!.fraction).toBeCloseTo(DOWNLOAD_SHARE + (1 - DOWNLOAD_SHARE) * (STEP_WEIGHTS.prepare + STEP_WEIGHTS.tuning), 6);
    expect(Object.values(STEP_WEIGHTS).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
  });

  it('starts from zero without a download when the tools are already on the device', async () => {
    const { a, workers } = analyser();
    const seen: AnalysisProgress[] = [];
    const work = a.analyse(request({ onProgress: (p) => seen.push(p) }));
    await vi.advanceTimersByTimeAsync(0);
    const w = workers[0]!;
    w.emit({ type: 'plan', downloadBytes: 0 });
    w.emit({ type: 'step', step: 'prepare' });
    w.emit({ type: 'step', step: 'tuning' });
    w.emit({ type: 'progress', step: 'tuning', fraction: 1 });
    expect(seen[0]!.fraction).toBe(0);
    expect(seen[seen.length - 1]!.fraction).toBeCloseTo(STEP_WEIGHTS.prepare + STEP_WEIGHTS.tuning, 6);
    expect(seen.some((p) => p.step === 'download')).toBe(false);
    finishWith(w);
    await work;
  });

  it('keeps the progress alive while the chord network gives no news, without ever finishing it', async () => {
    const { a, workers } = analyser();
    const seen: AnalysisProgress[] = [];
    const work = a.analyse(request({ onProgress: (p) => seen.push(p) }));
    await vi.advanceTimersByTimeAsync(0);
    const w = workers[0]!;
    w.emit({ type: 'plan', downloadBytes: 0 });
    w.emit({ type: 'step', step: 'chords' });
    const n = seen.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen.length).toBeGreaterThanOrEqual(n + 4); // a beat every few hundred ms
    const chords = seen.filter((p) => p.step === 'chords').map((p) => p.fraction);
    expect(chords[chords.length - 1]!).toBeGreaterThan(chords[0]!);
    const stepEnd = STEP_WEIGHTS.prepare + STEP_WEIGHTS.tuning + STEP_WEIGHTS.beats + STEP_WEIGHTS.chords;
    expect(Math.max(...chords)).toBeLessThan(stepEnd);
    finishWith(w);
    await work;
  });

  it('does not let a failing listener break the analysis', async () => {
    const { a, workers } = analyser();
    const work = a.analyse(request({ onProgress: () => void (() => { throw new Error('listener'); })() }));
    await vi.advanceTimersByTimeAsync(0);
    workers[0]!.emit({ type: 'step', step: 'prepare' });
    finishWith(workers[0]!);
    await expect(work).resolves.toBe(RESULT);
  });

  it('rejects with the worker\'s error code and ends the worker', async () => {
    const { a, workers } = analyser();
    const work = a.analyse(request());
    await vi.advanceTimersByTimeAsync(0);
    workers[0]!.emit({ type: 'error', code: 'download-failed', message: 'offline' });
    const e = await work.catch((x) => x);
    expect(e).toBeInstanceOf(AnalysisError);
    expect(e.code).toBe('download-failed');
    expect(workers[0]!.terminated).toBe(true);
  });

  it('rejects with `failed` when the worker itself breaks', async () => {
    const { a, workers } = analyser();
    const work = a.analyse(request());
    await vi.advanceTimersByTimeAsync(0);
    workers[0]!.onerror?.({ message: 'script error', preventDefault() {} } as unknown as ErrorEvent);
    expect((await work.catch((x) => x)).code).toBe('failed');
    expect(workers[0]!.terminated).toBe(true);
  });

  it('refuses silence and an empty piece, and a piece asked to stop before it starts', async () => {
    const { a, workers } = analyser();
    expect((await a.analyse({ ...request(), channels: [] }).catch((x) => x)).code).toBe('no-music');
    expect((await a.analyse({ ...request(), channels: [new Float32Array(0)] }).catch((x) => x)).code).toBe('no-music');
    const stopped = new AbortController();
    stopped.abort();
    expect((await a.analyse(request({ signal: stopped.signal })).catch((x) => x)).code).toBe('cancelled');
    expect(workers.length).toBe(0);
  });

  describe('cancelling', () => {
    it('rejects at once, asks the worker to stop, and ends it after a short grace', async () => {
      const { a, workers } = analyser();
      const controller = new AbortController();
      const work = a.analyse(request({ signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(0);
      const w = workers[0]!;
      controller.abort();
      const e = await work.catch((x) => x);
      expect(e).toBeInstanceOf(AnalysisError);
      expect(e.code).toBe('cancelled');
      expect(w.posted.map((p) => p.message.type)).toEqual(['analyse', 'cancel']);
      expect(w.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(w.terminated).toBe(true);
    });

    it('ignores what a cancelled worker still says', async () => {
      const { a, workers } = analyser();
      const controller = new AbortController();
      const seen: AnalysisProgress[] = [];
      const work = a.analyse(request({ signal: controller.signal, onProgress: (p) => seen.push(p) }));
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await work.catch(() => {});
      const n = seen.length;
      workers[0]!.emit({ type: 'step', step: 'beats' });
      finishWith(workers[0]!);
      await vi.advanceTimersByTimeAsync(1000);
      expect(seen.length).toBe(n);
    });

    it('lets the next analysis start at once, in a new worker (a new import right after)', async () => {
      const { a, workers } = analyser();
      const controller = new AbortController();
      const first = a.analyse(request({ signal: controller.signal })).catch((x) => x);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(); // and, in the same breath, what the runner does:
      const second = a.analyse(request({ audioId: 'audio-2' }));
      await vi.advanceTimersByTimeAsync(0);
      expect((await first).code).toBe('cancelled');
      expect(workers.length).toBe(2);
      finishWith(workers[1]!);
      await expect(second).resolves.toBe(RESULT);
    });

    it('can be stopped while the piece is still being mixed', async () => {
      const { a, workers } = analyser();
      const controller = new AbortController();
      const n = 3_000_000;
      const work = a.analyse({ ...request({ signal: controller.signal }), channels: [new Float32Array(n)] }).catch((x) => x);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(100);
      expect((await work).code).toBe('cancelled');
      expect(workers.length).toBe(0);
    });
  });

  it('runs one analysis at a time', async () => {
    const { a, workers } = analyser();
    const first = a.analyse(request());
    await vi.advanceTimersByTimeAsync(0);
    expect((await a.analyse(request()).catch((x) => x)).code).toBe('failed');
    finishWith(workers[0]!);
    await first;
    const again = a.analyse(request());
    await vi.advanceTimersByTimeAsync(0);
    finishWith(workers[1]!);
    await expect(again).resolves.toBe(RESULT);
  });

  describe('the user\'s grid and key on the same audio', () => {
    const hint = { times: [0, 0.5, 1, 1.5], downbeat: 0, meter: { numerator: 4, denominator: 4 } };

    it('decodes again on the kept outputs, without sending the piece', async () => {
      const { a, workers } = analyser();
      const first = a.analyse(request());
      await vi.advanceTimersByTimeAsync(0);
      finishWith(workers[0]!);
      await first;
      const second = a.analyse(request({ grid: hint, key: { tonic: 2, mode: 'minor' } }));
      await vi.advanceTimersByTimeAsync(0);
      const sent = workers[1]!.posted[0]!;
      expect(sent.message.type).toBe('decode');
      if (sent.message.type !== 'decode') throw new Error('unreachable');
      expect(sent.message.outputs).toBe(OUTPUTS);
      expect(sent.message.grid).toEqual(hint);
      expect(sent.message.key).toEqual({ tonic: 2, mode: 'minor' });
      expect(sent.message.models).toEqual(['beat-this-logmel']);
      expect(sent.transfer).toEqual([]);
      finishWith(workers[1]!, null);
      await second;
    });

    it('analyses from scratch without a hint, for another audio, or after the outputs were lost', async () => {
      const { a, workers } = analyser();
      const kinds = () => workers.map((w) => w.posted[0]?.message.type);
      const run = async (req: AnalysisRequest, outputs: NetworkOutputs | null = OUTPUTS) => {
        const p = a.analyse(req);
        await vi.advanceTimersByTimeAsync(0);
        finishWith(workers[workers.length - 1]!, outputs);
        await p;
      };
      await run(request());
      await run(request()); // no hint: a fresh analysis
      await run(request({ audioId: 'other', grid: hint })); // not the audio that was kept
      await run(request({ audioId: 'other', grid: hint }), null); // the audio just analysed: its outputs are used
      await run(request({ audioId: 'other', grid: hint })); // and again, a decoding gives none to keep but they stay
      expect(kinds()).toEqual(['analyse', 'analyse', 'analyse', 'decode', 'decode']);
    });

    it('forgets the kept outputs when disposed', async () => {
      const { a, workers } = analyser();
      const p = a.analyse(request());
      await vi.advanceTimersByTimeAsync(0);
      finishWith(workers[0]!);
      await p;
      a.dispose();
      const q = a.analyse(request({ grid: hint }));
      await vi.advanceTimersByTimeAsync(0);
      expect(workers[1]!.posted[0]!.message.type).toBe('analyse');
      finishWith(workers[1]!);
      await q;
    });
  });

  it('ends a running worker when disposed', async () => {
    const { a, workers } = analyser();
    void a.analyse(request()).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    a.dispose();
    expect(workers[0]!.terminated).toBe(true);
  });

  describe('models()', () => {
    it('lists the three files of the light set with source, licence and size, and what is kept', async () => {
      const store = new MemoryModelStore();
      resetModelStore(store);
      const logmel = MODEL_REGISTRY['beat-this-logmel'];
      await store.putFile({ id: logmel.id, bytes: logmel.bytes, sha256: logmel.sha256, data: new ArrayBuffer(logmel.bytes) });
      const list = await new FabticeAnalyzer().models();
      expect(list.map((m) => m.id)).toEqual(['beat-this-logmel', 'beat-this-small0', 'crema-chords']);
      expect(list.map((m) => m.cached)).toEqual([true, false, false]);
      expect(list.every((m) => m.host === 'Hugging Face' && m.url.startsWith('https://huggingface.co/') && m.licence && m.bytes > 0)).toBe(true);
      expect(list.some((m) => 'sha256' in m)).toBe(false);
      expect(list.reduce((s, m) => s + m.bytes, 0)).toBe(4468830 + 10555642 + 2728454);
    });

    it('lists the full network instead when asked', async () => {
      resetModelStore(new MemoryModelStore());
      const list = await new FabticeAnalyzer({ beatModel: 'full' }).models();
      expect(list.map((m) => m.id)).toEqual(['beat-this-logmel', 'beat-this-final0', 'crema-chords']);
    });
  });
});
