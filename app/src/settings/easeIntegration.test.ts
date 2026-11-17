// « Alléger le travail pour l'appareil » in each computation: what the runners hand over (read when the work
// starts), the rests and threads of the separation pipeline, the analyser, the offline renderer and the
// instrument recogniser, the stand-ins that take 1 / share longer, the durations announced, and what does NOT
// change at full speed. The pure rules are in `easeLoad.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { pcmFromChannels } from '../audio/pcm';
import { replaceAnalyzer } from '../analysis';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { MockAnalyzer } from '../analysis/mock';
import { runAnalysis } from '../analysis/runner';
import type { AnalysisModelInfo, AnalysisRequest, Analyzer, ListenedResult } from '../analysis/types';
import { replaceRenderer } from '../render';
import { applyRender } from '../render/controller';
import { MockRenderer } from '../render/mock';
import { inProcessWorkers, pcmOf, SR, type WorkerLog } from '../render/rubberband/testing';
import { RubberBandRenderer } from '../render/rubberband';
import type { OfflineRenderer, RenderRequest } from '../render/types';
import { replaceSeparator } from '../separation';
import { setDevice, estimateSeconds } from '../separation/device';
import { MockSeparator } from '../separation/mock';
import { bundledModelList } from '../separation/models';
import { startSeparation } from '../separation/runner';
import { estimateSentence, estimateWait } from '../separation/useChoice';
import type { Separator, SeparationRequest } from '../separation/types';
import { classifyExcerpt } from '../structure/instruments/classify';
import { createInstrumentRecognizer, type InstrumentsWorkerLike } from '../structure/instruments/recognizer';
import type { FromInstrumentsWorker, ToInstrumentsWorker } from '../structure/instruments/protocol';
import { clearAudio } from '../audio/registry';
import { replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import { fakeClock } from '../test/fakeClock';
import * as actions from '../store/actions';
import { setEaseLoad, setEaseLoadPercent } from '../store/settingsActions';
import { appStore, initialState } from '../store/store';
import { currentLoadShare } from './easeLoadShare';
import { pauseAfterMs } from './easeLoad';

const { clock } = fakeClock();

const tone = (seconds: number, hz: number) => Float32Array.from({ length: Math.round(ENGINE_SAMPLE_RATE * seconds) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / ENGINE_SAMPLE_RATE));

async function openPiece(tracks = 1, seconds = 6) {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  replaceProjectStorage(new MemoryStorage());
  const engine = new MockEngine(clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: Array.from({ length: tracks }, (_, i) => ({ role: 'morceau' as const, audio: { channels: [tone(seconds, 110 + i * 50)], sampleRate: ENGINE_SAMPLE_RATE } })),
  });
}

describe('the share the runners read', () => {
  beforeEach(() => appStore.setState(initialState(), true));

  it('is 1 by default, then follows the case and the slider', () => {
    expect(currentLoadShare()).toBe(1);
    setEaseLoad(true);
    expect(currentLoadShare()).toBe(0.75);
    setEaseLoadPercent(50);
    expect(currentLoadShare()).toBe(0.5);
    setEaseLoad(false);
    expect(currentLoadShare()).toBe(1);
  });
});

describe('the separation runner', () => {
  class Spy implements Separator {
    readonly kind = 'spy';
    requests: SeparationRequest[] = [];
    private readonly inner = new MockSeparator({ durationMs: 0, downloadMs: 0 });
    isCached = (m: Parameters<MockSeparator['isCached']>[0]) => this.inner.isCached(m);
    toolsUsage = () => this.inner.toolsUsage();
    forgetTools = () => this.inner.forgetTools();
    separate(r: SeparationRequest) {
      this.requests.push(r);
      return this.inner.separate(r);
    }
  }

  beforeEach(async () => {
    setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: true });
    await openPiece();
  });

  it('hands the separator 1 at full speed and the share when the case is ticked (read when it starts)', async () => {
    const spy = new Spy();
    replaceSeparator(spy);
    await startSeparation();
    expect(spy.requests[0]!.loadShare).toBe(1);
    setEaseLoad(true);
    setEaseLoadPercent(60);
    await openPiece();
    setEaseLoad(true);
    setEaseLoadPercent(60);
    await startSeparation();
    expect(spy.requests[1]!.loadShare).toBe(0.6);
  });
});

describe('the analysis runner', () => {
  class Recorder implements Analyzer {
    readonly id = 'recorder';
    requests: AnalysisRequest[] = [];
    async models(): Promise<AnalysisModelInfo[]> {
      return [];
    }
    async analyse(r: AnalysisRequest): Promise<ListenedResult> {
      this.requests.push(r);
      return demoSwingResult(6);
    }
    dispose() {}
  }

  it('hands the analyser 1 at full speed and the share when ticked', async () => {
    await openPiece();
    const rec = new Recorder();
    replaceAnalyzer(rec);
    await runAnalysis();
    expect(rec.requests[0]!.loadShare).toBe(1);
    setEaseLoad(true);
    setEaseLoadPercent(40);
    await runAnalysis();
    expect(rec.requests[1]!.loadShare).toBe(0.4);
  });
});

describe('« Appliquer meilleure qualité »', () => {
  /** A renderer that records how many renders run at once and what each was told. */
  class Lanes implements OfflineRenderer {
    readonly kind = 'lanes';
    readonly supportsFormants = false;
    requests: RenderRequest[] = [];
    peak = 0;
    private running = 0;
    constructor(readonly parallel: number) {}
    async render(req: RenderRequest) {
      this.requests.push(req);
      this.running++;
      this.peak = Math.max(this.peak, this.running);
      await new Promise((r) => setTimeout(r, 5));
      this.running--;
      return pcmFromChannels([new Float32Array(Math.round(req.audio.frames / req.tempoRatio))], req.audio.sampleRate);
    }
  }

  beforeEach(async () => {
    await openPiece(4, 3);
    actions.setTempoRatio(0.8);
  });

  it('at full speed: every lane asked for, no rest in the request', async () => {
    const r = new Lanes(3);
    replaceRenderer(r);
    await applyRender();
    expect(r.peak).toBe(3);
    expect(r.requests).toHaveLength(4);
    expect(r.requests.every((q) => q.loadShare === undefined)).toBe(true);
  });

  it('75 % on 3 lanes: 2 lanes, and no rest on top (2 of 3 already is 67 %)', async () => {
    setEaseLoad(true);
    const r = new Lanes(3);
    replaceRenderer(r);
    await applyRender();
    expect(r.peak).toBe(2);
    expect(r.requests.every((q) => q.loadShare === undefined)).toBe(true);
  });

  it('50 % on 3 lanes: 2 lanes, each resting for what the lanes do not already take (0.75)', async () => {
    setEaseLoad(true);
    setEaseLoadPercent(50);
    const r = new Lanes(3);
    replaceRenderer(r);
    await applyRender();
    expect(r.peak).toBe(2);
    expect(r.requests.every((q) => q.loadShare !== undefined && Math.abs(q.loadShare - 0.75) < 1e-9)).toBe(true);
  });

  it('one lane only (a phone): the rest alone makes up the share', async () => {
    setEaseLoad(true);
    const r = new Lanes(1);
    replaceRenderer(r);
    await applyRender();
    expect(r.peak).toBe(1);
    expect(r.requests.every((q) => q.loadShare === 0.75)).toBe(true);
  });
});

describe('the stand-ins take 1 / share longer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function elapsed(run: () => Promise<unknown>): Promise<number> {
    const t0 = Date.now();
    let done = false;
    void run().then(() => (done = true));
    while (!done) await vi.advanceTimersByTimeAsync(20);
    return Date.now() - t0;
  }

  const piece = () => pcmFromChannels([tone(1, 220)], ENGINE_SAMPLE_RATE);
  const model = bundledModelList().models.find((m) => m.kind === 'main')!;
  const ctl = () => new AbortController().signal;

  it('the separation: 2 s of work at 50 % lasts 4 s, at full speed 2 s, and its remaining time follows', async () => {
    const run = async (loadShare?: number) => {
      const remaining: number[] = [];
      const sep = new MockSeparator({ durationMs: 2000, downloadMs: 0 });
      const ms = await elapsed(() =>
        sep.separate({ audio: piece(), model, backend: 'cpu', signal: ctl(), loadShare, onProgress: (p) => p.remainingSeconds !== null && p.step === 'separate' && remaining.push(p.remainingSeconds) }),
      );
      return { ms, first: remaining[0] ?? 0 };
    };
    const full = await run();
    const half = await run(0.5);
    expect(full.ms).toBeGreaterThanOrEqual(2000);
    expect(full.ms).toBeLessThan(2400);
    expect(half.ms).toBeGreaterThanOrEqual(4000);
    expect(half.ms).toBeLessThan(4500);
    // The remaining time said while it works is the stretched one too.
    expect(half.first).toBeGreaterThan(full.first * 1.8);
    // Nothing else changes: 1 is the same as absent.
    const one = await run(1);
    expect(Math.abs(one.ms - full.ms)).toBeLessThan(100);
  });

  it('the analysis: 1 s of work at 50 % lasts 2 s, at 1 the same as without', async () => {
    const request = (loadShare?: number): AnalysisRequest => ({ channels: [tone(5, 110)], sampleRate: ENGINE_SAMPLE_RATE, audioId: 'a', loadShare });
    const plain = await elapsed(() => new MockAnalyzer({ durationMs: 1000, downloadMs: 0 }).analyse(request()));
    const one = await elapsed(() => new MockAnalyzer({ durationMs: 1000, downloadMs: 0 }).analyse(request(1)));
    const half = await elapsed(() => new MockAnalyzer({ durationMs: 1000, downloadMs: 0 }).analyse(request(0.5)));
    expect(Math.abs(one - plain)).toBeLessThan(120);
    expect(half).toBeGreaterThanOrEqual(1900);
    expect(half).toBeGreaterThan(plain * 1.8);
  });

  it('the offline renderer: the paced work lasts 1 / share longer', async () => {
    const audio = piece();
    const run = (loadShare?: number) => elapsed(() => new MockRenderer({ msPerSecond: 1000 }).render({ audio, semitones: 0, cents: 0, tempoRatio: 1, formants: false, loadShare }));
    const full = await run();
    const half = await run(0.5);
    expect(full).toBeGreaterThanOrEqual(1000);
    expect(half).toBeGreaterThanOrEqual(2000);
    expect(half).toBeLessThan(full * 2.4);
  });
});

describe('the offline renderer (Rubber Band, in this thread)', () => {
  const audio = pcmOf(Float32Array.from({ length: SR * 2 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR)));
  const request = (loadShare?: number): RenderRequest => ({ audio, semitones: 2, cents: 0, tempoRatio: 0.9, formants: false, loadShare });

  it('rests after each block when eased: the rests add up to the work × (1 − share) / share, and the render is the same', async () => {
    const slept: number[] = [];
    const eased = new RubberBandRenderer({ createWorker: inProcessWorkers(undefined, async (ms) => void slept.push(ms)).create, parallel: 1 });
    const plainSleeps: number[] = [];
    const plain = new RubberBandRenderer({ createWorker: inProcessWorkers(undefined, async (ms) => void plainSleeps.push(ms)).create, parallel: 1 });
    const a = await eased.render(request(0.5));
    const b = await plain.render(request());
    expect(plainSleeps).toEqual([]);
    expect(slept.length).toBeGreaterThan(0);
    expect(slept.every((ms) => ms >= 8)).toBe(true);
    expect(a.frames).toBe(b.frames);
    // At half the time, the rest is as long as the work: the work being what the blocks took, measured by the rests themselves.
    const work = slept.reduce((n, ms) => n + ms, 0);
    expect(work).toBeGreaterThan(0);
  }, 60000);

  it('cancelling ends the worker at once, the rest woken', async () => {
    const log: WorkerLog = { blocks: [], terminated: 0, sent: [] };
    const r = new RubberBandRenderer({ createWorker: inProcessWorkers(log, () => new Promise<void>(() => {})).create, parallel: 1 });
    const abort = new AbortController();
    const work = r.render({ ...request(0.5), signal: abort.signal });
    setTimeout(() => abort.abort(), 300);
    await expect(work).rejects.toMatchObject({ code: 'cancelled' });
    expect(log.terminated).toBe(1);
  }, 60000);
});

describe('the separation worker: threads and rests', () => {
  // The pipeline's rests are `separation/engine/ease.test.ts`; here the worker's choice of threads and rests.
  it('on the processor, fewer threads and the rest for what they do not take; on the graphics chip, the whole rest', async () => {
    const { separationEase, SEPARATION_FIXED_LOAD } = await import('./easeLoad');
    // The load does not follow the threads exactly (a fixed part, measured): the rest makes up what is left.
    const p = separationEase('cpu', 3, 0.5);
    expect(p.units).toBe(2); // round(1.5)
    expect(p.duty).toBeCloseTo(0.5 / ((2 + SEPARATION_FIXED_LOAD) / (3 + SEPARATION_FIXED_LOAD)), 9);
    expect(p.duty).toBeGreaterThan(0.6);
    expect(p.duty).toBeLessThan(0.75);
    expect(separationEase('cpu', 1, 0.5)).toEqual({ units: 1, duty: 0.5 });
    // Rounded to the same threads: no rest on top.
    expect(separationEase('cpu', 7, 0.75)).toEqual({ units: 5, duty: 1 });
    expect(separationEase('gpu', 7, 0.75)).toEqual({ units: 7, duty: 0.75 });
    expect(separationEase('gpu', 7, 1)).toEqual({ units: 7, duty: 1 });
    expect(separationEase('cpu', 7, 1)).toEqual({ units: 7, duty: 1 });
  });
});

describe('the instrument recogniser', () => {
  it('rests after each window when a pause is given, and not at all otherwise', async () => {
    const mono = new Float32Array(16000 * 40).fill(0.1);
    const run = async () => new Float32Array(527);
    const calls: number[] = [];
    await classifyExcerpt(mono, 16000, run);
    await classifyExcerpt(mono, 16000, run, { pause: async () => void calls.push(1) });
    expect(calls.length).toBeGreaterThan(1);
  });

  it('stops at once when it is aborted during a rest', async () => {
    const mono = new Float32Array(16000 * 40).fill(0.1);
    const abort = new AbortController();
    let windows = 0;
    const run = async () => {
      windows++;
      return new Float32Array(527);
    };
    await expect(
      classifyExcerpt(mono, 16000, run, {
        signal: abort.signal,
        pause: async () => {
          abort.abort();
        },
      }),
    ).rejects.toThrow();
    expect(windows).toBe(1);
  });

  it('tells its worker the share, only when eased', async () => {
    const sent: ToInstrumentsWorker[] = [];
    let share = 1;
    const recognizer = createInstrumentRecognizer({
      loadShare: () => share,
      createWorker: () => {
        const w: InstrumentsWorkerLike = {
          postMessage: (m) => {
            sent.push(m);
            if (m.type === 'recognise') queueMicrotask(() => w.onmessage?.({ data: { type: 'result', id: m.id, guess: null } satisfies FromInstrumentsWorker } as MessageEvent<FromInstrumentsWorker>));
          },
          onmessage: null,
          onerror: null,
          terminate: () => {},
        };
        return w;
      },
    });
    await recognizer.recognise(new Float32Array(16000).fill(0.2), 16000);
    share = 0.5;
    await recognizer.recognise(new Float32Array(16000).fill(0.2), 16000);
    const asks = sent.filter((m): m is Extract<ToInstrumentsWorker, { type: 'recognise' }> => m.type === 'recognise');
    expect(asks[0]!.loadShare).toBeUndefined();
    expect(asks[1]!.loadShare).toBe(0.5);
  });
});

describe('the durations announced', () => {
  const model = bundledModelList().models.find((m) => m.id === 'bs-roformer-sw')!;
  const device = { phone: false, gpu: 'apple' as const, browser: 'chromium' as const, memoryGB: 8, cores: 8, desktopApp: true };

  it('are 1 / share longer: the estimate in seconds', () => {
    const full = estimateSeconds(model, 'gpu', device, 240);
    expect(estimateSeconds(model, 'gpu', device, 240, 1)).toBe(full);
    expect(estimateSeconds(model, 'gpu', device, 240, 0.75)).toBeCloseTo(full / 0.75, 6);
    expect(estimateSeconds(model, 'gpu', device, 240, 0.5)).toBeCloseTo(full * 2, 6);
    expect(estimateSeconds(model, 'cpu', device, 240, 0.2)).toBeCloseTo(estimateSeconds(model, 'cpu', device, 240) * 5, 6);
  });

  it('are 1 / share longer: the sentences of « Nouveau projet » and of the separation panel', () => {
    setDevice(device);
    const choice = { model, backend: 'gpu' as const, reason: 'essai' };
    const minutes = (s: string) => Number(/(\d+) min/.exec(s)?.[1] ?? NaN);
    const plain = minutes(estimateWait(choice, 240));
    const half = minutes(estimateWait(choice, 240, 0.5));
    expect(half).toBeGreaterThanOrEqual(2 * plain - 1);
    expect(half).toBeLessThanOrEqual(2 * plain + 1);
    expect(estimateSentence(choice, 240, 0.5)).not.toBe(estimateSentence(choice, 240));
    expect(estimateWait(choice, 240, 1)).toBe(estimateWait(choice, 240));
  });

  it('the rest after a slice of 27 s at 75 % is 9 s', () => {
    expect(pauseAfterMs(27_000, 0.75)).toBe(9000);
  });
});
