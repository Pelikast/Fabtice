// « Appliquer » beyond the stand-in's happy path: the memory budget and its calm
// refusal, several tracks rendered at once, the first failure stopping the
// others, progress that counts the work (frames), and what the budget is.

import { beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import type { PcmAudio } from '../audio/pcm';
import { clearAudio } from '../audio/registry';
import { replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import { fakeClock } from '../test/fakeClock';
import * as actions from '../store/actions';
import { appStore, initialState } from '../store/store';
import { appliedBytes, appliedFits, renderBudgetBytes, renderParallelism, setDeviceFactsForTests, totalAppliedBytes } from './budget';
import { applyRender, selectApplyError } from './controller';
import { renderProgressStore } from './progress';
import { replaceRenderer } from './index';
import { MockRenderer } from './mock';
import { RenderError, type OfflineRenderer, type RenderRequest } from './types';

const SR = ENGINE_SAMPLE_RATE;
const tone = (seconds: number, hz: number) => Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / SR));
const MB = 1024 * 1024;

let engine: MockEngine;

beforeEach(() => {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  replaceProjectStorage(new MemoryStorage());
  replaceRenderer(new MockRenderer());
});

async function openTracks(seconds: number[]) {
  await actions.openProject({
    title: 'Pistes',
    source: { kind: 'demo' },
    tracks: seconds.map((s, i) => ({ role: i === 0 ? 'morceau' : 'basse', audio: { channels: [tone(s, 110 + 40 * i), tone(s, 220 + 40 * i)], sampleRate: SR } })),
  });
}

describe('what a render weighs and what a device is allowed', () => {
  const stereo = { frames: 5 * 60 * SR, mono: false };
  const mono = { frames: 5 * 60 * SR, mono: true };

  it('weighs 16 bits per frame played, once for a mono track, twice for a stereo one', () => {
    expect(appliedBytes(stereo, 1) / MB).toBeCloseTo(55, 0);
    expect(appliedBytes(mono, 1) / MB).toBeCloseTo(27.5, 0);
    // at 0.7× tempo the audio lasts 1.43 times as long
    expect(appliedBytes(stereo, 0.7) / appliedBytes(stereo, 1)).toBeCloseTo(1 / 0.7, 2);
    expect(totalAppliedBytes(Array(7).fill(stereo), 0.7) / MB).toBeCloseTo((7 * 54.93) / 0.7, 0);
  });

  it('is a tenth of the memory the browser reports (a fifteenth on a phone), within 128 MB and 1.5 GB', () => {
    expect(renderBudgetBytes({ deviceMemoryGb: 8, phone: false })).toBe(Math.round(0.8 * 1024 * MB));
    expect(renderBudgetBytes({ deviceMemoryGb: 4, phone: false })).toBe(Math.round(0.4 * 1024 * MB));
    expect(renderBudgetBytes({ deviceMemoryGb: 4, phone: true }) / MB).toBeCloseTo(273, 0);
    expect(renderBudgetBytes({ deviceMemoryGb: 0.25, phone: false })).toBe(128 * MB);
    expect(renderBudgetBytes({ deviceMemoryGb: 64, phone: false })).toBe(1536 * MB);
  });

  it('is conservative when the browser says nothing: 768 MB on a computer, 192 MB on a phone', () => {
    expect(renderBudgetBytes({ phone: false })).toBe(768 * MB);
    expect(renderBudgetBytes({ phone: true })).toBe(192 * MB);
  });

  it('lets seven 5-minute stereo tracks at 0.7× through on an 8 GB computer, refuses them on a phone and on a 2 GB device', () => {
    const seven = Array(7).fill(stereo);
    expect(totalAppliedBytes(seven, 0.7) / MB).toBeCloseTo(550, -1);
    expect(appliedFits(seven, 0.7, { deviceMemoryGb: 8, phone: false })).toBe(true);
    expect(appliedFits(seven, 0.7, { phone: true })).toBe(false);
    expect(appliedFits(seven, 0.7, { deviceMemoryGb: 2, phone: false })).toBe(false);
    expect(appliedFits([mono], 1, { phone: true })).toBe(true);
  });

  it('renders one track at a time on a phone and at most three at once elsewhere, keeping a core for the audio thread', () => {
    expect(renderParallelism({ cores: 8, phone: true })).toBe(1);
    expect(renderParallelism({ cores: 8, phone: false })).toBe(3);
    expect(renderParallelism({ cores: 4, phone: false })).toBe(3);
    expect(renderParallelism({ cores: 2, phone: false })).toBe(1);
    expect(renderParallelism({ phone: false })).toBe(1);
  });
});

describe('« Appliquer » with several tracks', () => {
  /** A renderer that records how many renders run at once and can fail one of them. */
  class Probe extends MockRenderer implements OfflineRenderer {
    running = 0;
    peak = 0;
    started: number[] = [];
    readonly parallel: number;
    constructor(parallel: number, private readonly failOn: number | null = null) {
      super({ msPerSecond: 0 });
      this.parallel = parallel;
    }
    override async render(req: RenderRequest): Promise<PcmAudio> {
      this.started.push(req.audio.frames);
      this.running++;
      this.peak = Math.max(this.peak, this.running);
      try {
        await new Promise((r) => setTimeout(r, 5));
        if (this.failOn !== null && this.started.length === this.failOn) throw new RenderError('failed', 'boom');
        return await super.render(req);
      } finally {
        this.running--;
      }
    }
  }

  it('renders the longest tracks first, `parallel` at a time, and hands the set over whole', async () => {
    await openTracks([2, 6, 4, 3]);
    actions.setTempoRatio(0.8);
    const probe = new Probe(2);
    replaceRenderer(probe);
    await applyRender();
    expect(appStore.getState().render.status).toBe('applied');
    expect(probe.peak).toBe(2);
    expect(probe.started).toEqual([6, 4, 3, 2].map((s) => s * SR));
    expect(engine.snapshot().rendered!.tracks).toHaveLength(4);
    expect(engine.snapshot().rendered!.inUse).toBe(true);
  });

  it('one at a time when the renderer says nothing', async () => {
    await openTracks([2, 3, 2]);
    actions.setTempoRatio(0.8);
    const probe = new Probe(1);
    replaceRenderer(probe);
    await applyRender();
    expect(probe.peak).toBe(1);
  });

  it('progress counts frames and never goes back', async () => {
    await openTracks([1, 3]);
    actions.setTempoRatio(0.8);
    replaceRenderer(new Probe(2));
    const seen: number[] = [];
    const stop = renderProgressStore.subscribe((p) => seen.push(p.apply));
    await applyRender();
    stop();
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('the first failure is the one reported and stops the other tracks; nothing reaches the engine', async () => {
    await openTracks([2, 6, 4, 3]);
    actions.setTempoRatio(0.8);
    const probe = new Probe(2, 2);
    replaceRenderer(probe);
    await applyRender();
    expect(appStore.getState().render).toMatchObject({ status: 'error', code: 'failed' });
    expect(selectApplyError(appStore.getState())).toBe('failed');
    expect(probe.running).toBe(0);
    expect(engine.snapshot().rendered).toBeNull();
  });
});

describe('the calm refusal', () => {
  it('a piece the device could not hold is refused before any work: `memory`, the preview stays, nothing was rendered', async () => {
    await openTracks([2]);
    actions.setTempoRatio(0.5);
    const probe = new (class extends MockRenderer {
      calls = 0;
      override async render(req: RenderRequest): Promise<PcmAudio> {
        this.calls++;
        return super.render(req);
      }
    })();
    replaceRenderer(probe);
    try {
      setDeviceFactsForTests({ phone: true, budgetBytes: 1000 });
      await applyRender();
      expect(appStore.getState().render).toMatchObject({ status: 'error', code: 'memory' });
      expect(selectApplyError(appStore.getState())).toBe('memory');
      expect(probe.calls).toBe(0);
      expect(engine.snapshot().rendered).toBeNull();
      expect(appStore.getState().transport.engine).toBe('ready');
      // the same piece on a device that can hold it
      setDeviceFactsForTests({ phone: true, budgetBytes: 100 * MB });
      await applyRender();
      expect(appStore.getState().render.status).toBe('applied');
      expect(probe.calls).toBe(1);
    } finally {
      setDeviceFactsForTests(null);
    }
  });
});

describe('a render error is dismissed with the next change', () => {
  it('the error belongs to the key and tempo it was made for', async () => {
    await openTracks([2]);
    actions.setTempoRatio(0.8);
    replaceRenderer({
      kind: 'broken',
      supportsFormants: false,
      render: async () => {
        throw new RenderError('memory', 'nope');
      },
    });
    await applyRender();
    expect(selectApplyError(appStore.getState())).toBe('memory');
    actions.setTempoRatio(0.9);
    expect(selectApplyError(appStore.getState())).toBeNull();
  });
});
