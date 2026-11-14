// A stand-in analyser: no model, no worker. It walks through the steps of the
// real one on a timer (with a simulated first download of the models, so the
// interface for it can be built and tested) and returns a fixed result: the
// prototype's excerpt repeated (`./fromDemoSwing.ts`), or what `fixture`
// gives (the `?demo` piece passes its own, see `demo/demoAnalysis.ts`).
// Grid and key hints are honoured as the real analyser must.

import { tempoMapFromBeats } from '../grid/beats';
import type { AnalysisResult } from '../model/analysis';
import { demoSwingResult } from './fromDemoSwing';
import { ANALYSIS_MODELS } from './models';
import {
  AnalysisError,
  type AnalysisModelInfo,
  type AnalysisProgress,
  type AnalysisRequest,
  type AnalysisStep,
  type Analyzer,
} from './types';

export interface MockAnalyzerOptions {
  /** Total time of an analysis once the models are « downloaded », in ms. Default 900. */
  durationMs?: number;
  /** Time of the simulated first download, in ms (0: models already cached). Default 1500. */
  downloadMs?: number;
  /** The result for a request; default: the prototype's excerpt over the piece's duration. */
  fixture?: (request: AnalysisRequest, duration: number) => AnalysisResult;
  /** Make every analysis fail with this code (tests of the error states). */
  failWith?: AnalysisError['code'];
  /** Timer, replaceable in tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const STEPS: [AnalysisStep, number][] = [['prepare', 0.1], ['tuning', 0.15], ['beats', 0.35], ['chords', 0.3], ['finish', 0.1]];
const TICK_MS = 50;

export class MockAnalyzer implements Analyzer {
  readonly id = 'mock';
  private cached = false;
  private running = false;
  private readonly opts: Required<Omit<MockAnalyzerOptions, 'fixture' | 'failWith'>> & Pick<MockAnalyzerOptions, 'fixture' | 'failWith'>;

  constructor(options: MockAnalyzerOptions = {}) {
    this.opts = {
      durationMs: options.durationMs ?? 900,
      downloadMs: options.downloadMs ?? 1500,
      fixture: options.fixture,
      failWith: options.failWith,
      setTimer: options.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
    if (this.opts.downloadMs <= 0) this.cached = true;
  }

  async models(): Promise<AnalysisModelInfo[]> {
    return ANALYSIS_MODELS.map(({ sha256: _sha, ...m }) => ({ ...m, cached: this.cached }));
  }

  async analyse(request: AnalysisRequest): Promise<AnalysisResult> {
    if (this.running) throw new AnalysisError('failed', 'an analysis is already running');
    this.running = true;
    try {
      const duration = (request.channels[0]?.length ?? 0) / request.sampleRate;
      // The first time, the download takes the first half of the progress.
      let base = 0;
      if (!this.cached) {
        base = 0.5;
        const total = ANALYSIS_MODELS.reduce((s, m) => s + m.bytes, 0);
        await this.walk(request, this.opts.downloadMs, (f) => {
          const loaded = Math.round(total * f);
          let acc = 0;
          const current = ANALYSIS_MODELS.find((m) => (acc += m.bytes) >= loaded) ?? ANALYSIS_MODELS[ANALYSIS_MODELS.length - 1]!;
          return { step: 'download', fraction: f * 0.5, download: { modelId: current.id, loaded, total } };
        });
        this.cached = true;
      }
      let done = 0;
      for (const [step, share] of STEPS) {
        const from = done;
        await this.walk(request, this.opts.durationMs * share, (f) => ({ step, fraction: base + (1 - base) * (from + share * f) }));
        done += share;
      }
      if (this.opts.failWith) throw new AnalysisError(this.opts.failWith);
      const result = this.opts.fixture ? this.opts.fixture(request, duration) : demoSwingResult(duration);
      return honourHints(result, request);
    } finally {
      this.running = false;
    }
  }

  dispose(): void {}

  /** Waits `ms`, reporting progress every tick; rejects on abort. */
  private walk(request: AnalysisRequest, ms: number, progress: (f: number) => AnalysisProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      const { signal } = request;
      if (signal?.aborted) return reject(new AnalysisError('cancelled'));
      const start = Date.now();
      let handle: unknown;
      const onAbort = () => {
        this.opts.clearTimer(handle);
        reject(new AnalysisError('cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const tick = () => {
        const f = ms <= 0 ? 1 : Math.min(1, (Date.now() - start) / ms);
        try {
          request.onProgress?.(progress(f));
        } catch {
          // a failing listener never breaks the analysis
        }
        if (f >= 1) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        } else handle = this.opts.setTimer(tick, TICK_MS);
      };
      tick();
    });
  }
}

/** The user's grid and key, when given, replace what the fixture says (as the real analyser must do). */
function honourHints(result: AnalysisResult, request: AnalysisRequest): AnalysisResult {
  let out = result;
  if (request.grid) {
    // Validate the hint the way the app will read it back.
    tempoMapFromBeats(request.grid.times, request.grid.downbeat, request.grid.meter);
    out = { ...out, beats: { times: [...request.grid.times], downbeat: request.grid.downbeat, meter: { ...request.grid.meter }, meterConfidence: 1 } };
  }
  if (request.key) out = { ...out, key: { ...request.key, confidence: 1, alternatives: [] } };
  return out;
}
