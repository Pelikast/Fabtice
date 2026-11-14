// The real offline renderer, in Node with the real WebAssembly binary, the
// page's side (`rubberband.ts`) talking to the worker's job (`rubberband/job.ts`)
// in this thread. Each check is a measurement; the figures are in the README.

import { describe, expect, it } from 'vitest';
import { fft, hann } from '../analysis/engine/fft';
import { pcmFromChannels } from '../audio/pcm';
import { cents, f0auto, seamMetric, sine } from '../audio/worklet/testing';
import { RubberBandRenderer } from './rubberband';
import { centroidAround } from './rubberband/stretcher';
import { channelOf, inProcessWorkers, noiseClicks, pcmOf, SR } from './rubberband/testing';
import { RenderError } from './types';

function renderer() {
  const w = inProcessWorkers();
  return { r: new RubberBandRenderer({ createWorker: w.create, parallel: 2 }), log: w.log };
}

/** Click times (s) that do not sit on any regular grid. */
const clickTimes = (from: number, to: number, step = 0.2713): number[] => {
  const t: number[] = [];
  for (let x = from; x < to; x += step) t.push(x);
  return t;
};

describe('length', () => {
  it('lasts exactly round(frames / tempo) for every ratio, whole or ranged', async () => {
    const { r } = renderer();
    const x = sine(220, 1.0371);
    const audio = pcmOf(x);
    for (const ratio of [0.25, 0.5, 0.7, 0.9, 1, 1.25, 1.7, 2]) {
      const out = await r.render({ audio, semitones: 0, cents: 0, tempoRatio: ratio, formants: false });
      expect(out.frames, `ratio ${ratio}`).toBe(Math.round(x.length / ratio));
      expect(out.sampleRate).toBe(SR);
    }
    for (const [ratio, semitones] of [[0.7, 3], [1.25, -5]] as const) {
      const range = { start: 0.2137, end: 0.9921 };
      const frames = Math.round(range.end * SR) - Math.round(range.start * SR);
      const out = await r.render({ audio, semitones, cents: 0, tempoRatio: ratio, formants: false, range });
      expect(out.frames, `range at ${ratio}`).toBe(Math.round(frames / ratio));
    }
  }, 60000);

  it('keeps the channel layout: mono stays mono, a true stereo track stays stereo', async () => {
    const { r } = renderer();
    const mono = await r.render({ audio: pcmOf(sine(330, 1)), semitones: 2, cents: 0, tempoRatio: 0.8, formants: false });
    expect(mono.channelCount).toBe(1);
    expect(mono.mono).toBe(true);
    const stereo = await r.render({ audio: pcmOf(sine(330, 1), sine(440, 1)), semitones: 2, cents: 0, tempoRatio: 0.8, formants: false });
    expect(stereo.channelCount).toBe(2);
    expect(stereo.mono).toBe(false);
    // two channels that happen to be equal are processed once and stay equal
    const equal = await r.render({ audio: pcmOf(sine(330, 1), sine(330, 1)), semitones: 2, cents: 0, tempoRatio: 0.8, formants: false });
    expect(equal.channelCount).toBe(2);
    expect(equal.mono).toBe(true);
  }, 60000);
});

describe('alignment', () => {
  // Output frame k is source time k * tempo / rate: a click that is in the source at t is in the render at t / tempo.
  const len = 48;
  const times = clickTimes(0.5, 7.5);
  const x = noiseClicks(8, times, len);
  const audio = pcmOf(x);
  const errorsMs = (out: Float32Array, ratio: number): number[] =>
    times.map((t) => {
      const wanted = (t * SR + len / 2) / ratio;
      return ((centroidAround(out, wanted, 1200) - wanted) / SR) * 1000;
    });

  it('puts every click of a train within ±2 ms of where it belongs (ratios 0.7 and 1.25, pitch −3, +2, +7, 0)', async () => {
    const { r } = renderer();
    const lines: string[] = [];
    for (const ratio of [0.7, 1.25]) {
      for (const semitones of [0, -3, 2, 7]) {
        const out = channelOf(await r.render({ audio, semitones, cents: 0, tempoRatio: ratio, formants: false }));
        const e = errorsMs(out, ratio);
        const worst = Math.max(...e.map(Math.abs));
        lines.push(`ratio ${ratio} semitones ${semitones}: first ${e[0]!.toFixed(2)} last ${e[e.length - 1]!.toFixed(2)} worst ${worst.toFixed(2)} ms`);
        expect(worst, lines[lines.length - 1]).toBeLessThanOrEqual(2);
      }
    }
  }, 120000);

  it('at ratio 0.5 (the engine\'s own hop grid is coarser): the bulk within ±2 ms, the rare outlier within one hop', async () => {
    const { r } = renderer();
    for (const semitones of [-3, 2, 7]) {
      const out = channelOf(await r.render({ audio, semitones, cents: 0, tempoRatio: 0.5, formants: false }));
      const e = errorsMs(out, 0.5);
      const within = e.filter((v) => Math.abs(v) <= 2).length / e.length;
      expect(within, `semitones ${semitones}: ${e.map((v) => v.toFixed(1)).join(' ')}`).toBeGreaterThanOrEqual(0.85);
      expect(Math.max(...e.map(Math.abs)), `semitones ${semitones}`).toBeLessThanOrEqual(5);
    }
  }, 120000);

  it('puts a rendered range at the right place: click k of the range is at (t − start) / tempo', async () => {
    const { r } = renderer();
    const range = { start: 2.5, end: 6.5 };
    const out = channelOf(await r.render({ audio, semitones: 2, cents: 0, tempoRatio: 0.7, formants: false, range }));
    for (const t of times.filter((v) => v > range.start + 0.2 && v < range.end - 0.2)) {
      const wanted = ((t - range.start) * SR + len / 2) / 0.7;
      const err = ((centroidAround(out, wanted, 1200) - wanted) / SR) * 1000;
      expect(Math.abs(err), `click at ${t}`).toBeLessThanOrEqual(2);
    }
  }, 60000);
});

describe('pitch', () => {
  it('is right to within a few cents, and the cents setting is honoured', async () => {
    const { r } = renderer();
    const audio = pcmOf(sine(440, 3, 0.5));
    const measure = async (semitones: number, centsValue: number, ratio: number) => {
      const out = channelOf(await r.render({ audio, semitones, cents: centsValue, tempoRatio: ratio, formants: false }));
      const mid = Math.round(out.length / 2) - 4800;
      const expected = 440 * 2 ** ((semitones + centsValue / 100) / 12);
      return cents(f0auto(out, mid, 9600, expected), 440);
    };
    const base = await measure(0, 0, 1);
    expect(Math.abs(base)).toBeLessThan(3);
    for (const [semitones, c, ratio] of [[7, 0, 1], [-5, 0, 0.7], [2, 30, 1.25], [0, -40, 1], [3, 50, 0.8]] as const) {
      const got = await measure(semitones, c, ratio);
      const want = semitones * 100 + c;
      expect(Math.abs(got - want), `${semitones} st + ${c} c at ${ratio}: ${got.toFixed(1)} cents`).toBeLessThan(5);
    }
  }, 120000);
});

describe('formants', () => {
  /** Energy-weighted mean frequency of a window of `x` (Hz). */
  function spectralCentroid(x: Float32Array, at: number): number {
    const n = 8192;
    const win = hann(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[at + i]! * win[i]!;
    fft(re, im);
    let num = 0;
    let den = 0;
    for (let k = 1; k < n / 2; k++) {
      const m = re[k]! ** 2 + im[k]! ** 2;
      num += m * ((k * SR) / n);
      den += m;
    }
    return num / den;
  }

  // A voice-like tone: 150 Hz harmonics under a broad formant peak near 900 Hz.
  const voice = (() => {
    const a = new Float32Array(Math.round(3 * SR));
    for (let k = 1; k <= 40; k++) {
      const f = 150 * k;
      const amp = 0.25 * Math.exp(-0.5 * ((f - 900) / 350) ** 2);
      for (let i = 0; i < a.length; i++) a[i]! += amp * Math.sin((2 * Math.PI * f * i) / SR + k);
    }
    return a;
  })();

  it('changes the result only when asked, and keeps the timbre then', async () => {
    const { r } = renderer();
    const audio = pcmOf(voice);
    const run = async (formants: boolean) => channelOf(await r.render({ audio, semitones: 7, cents: 0, tempoRatio: 1, formants }));
    const off1 = await run(false);
    const off2 = await run(false);
    const on = await run(true);
    expect(Array.from(off1.subarray(20000, 20200))).toEqual(Array.from(off2.subarray(20000, 20200)));
    const c0 = spectralCentroid(voice, 60000);
    const cOff = spectralCentroid(off1, 60000);
    const cOn = spectralCentroid(on, 60000);
    // Shifted formants move up with the pitch (×1.5); preserved ones stay put.
    expect(cOff / c0, `without: ${cOff.toFixed(0)} Hz against ${c0.toFixed(0)} Hz`).toBeGreaterThan(1.3);
    expect(cOn / c0, `with: ${cOn.toFixed(0)} Hz against ${c0.toFixed(0)} Hz`).toBeLessThan(1.15);
    expect(cOn).not.toBeCloseTo(cOff, -1);
  }, 60000);

  it('is offered by the renderer (the advanced setting depends on it)', () => {
    expect(new RubberBandRenderer({ createWorker: inProcessWorkers().create }).supportsFormants).toBe(true);
  });
});

describe('no click, stereo image', () => {
  it('starts and ends without a click, whole or ranged', async () => {
    const { r } = renderer();
    const tone = sine(300, 6, 0.6);
    const audio = pcmOf(tone);
    for (const range of [undefined, { start: 1.2345, end: 4.4321 }]) {
      for (const [semitones, ratio] of [[3, 0.7], [-4, 1.3], [0, 1]] as const) {
        const out = channelOf(await r.render({ audio, semitones, cents: 0, tempoRatio: ratio, formants: false, range }));
        const edge = 480; // 10 ms
        const maxStep = (a: Float32Array) => {
          let m = 0;
          for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - a[i - 1]!));
          return m;
        };
        // a 300 Hz sine at 0.6 steps by at most 0.6 * 2π * 300 / 48000 = 0.0236 per frame
        const head = out.subarray(0, edge);
        const tail = out.subarray(out.length - edge);
        const label = `${range ? 'range' : 'whole'} ${semitones} st ${ratio}`;
        expect(maxStep(head), `${label}: start`).toBeLessThan(0.05);
        expect(maxStep(tail), `${label}: end`).toBeLessThan(0.05);
        if (range) {
          expect(Math.abs(out[0]!), `${label}: first frame`).toBeLessThan(0.01);
          expect(Math.abs(out[out.length - 1]!), `${label}: last frame`).toBeLessThan(0.01);
        }
        // nothing inside either: a pure sine gives 1.41, a click far more
        expect(seamMetric(out.subarray(4800, out.length - 4800), 0), label).toBeLessThan(3);
      }
    }
  }, 120000);

  it('keeps the stereo image: channels are processed together, a left-only sound stays left, levels and phase hold', async () => {
    const { r } = renderer();
    const a = sine(262, 3, 0.5);
    const b = sine(262, 3, 0.25);
    // right is the left one at half level: the same sound, panned
    const out = await r.render({ audio: pcmFromChannels([a, b], SR), semitones: 4, cents: 0, tempoRatio: 0.75, formants: false });
    const L = channelOf(out, 0);
    const R = channelOf(out, 1);
    const rms = (x: Float32Array, from: number, n: number) => Math.sqrt(x.subarray(from, from + n).reduce((s, v) => s + v * v, 0) / n);
    const mid = Math.round(L.length / 2) - 4800;
    expect(rms(R, mid, 9600) / rms(L, mid, 9600)).toBeCloseTo(0.5, 1);
    // in phase: R is L / 2 sample by sample (to 16-bit rounding)
    let worst = 0;
    for (let i = mid; i < mid + 9600; i++) worst = Math.max(worst, Math.abs(R[i]! - L[i]! / 2));
    expect(worst).toBeLessThan(0.01);
    // left-only stays left
    const solo = await r.render({ audio: pcmFromChannels([a, new Float32Array(a.length)], SR), semitones: 4, cents: 0, tempoRatio: 0.75, formants: false });
    expect(rms(channelOf(solo, 1), mid, 9600)).toBeLessThan(0.002);
    expect(rms(channelOf(solo, 0), mid, 9600)).toBeGreaterThan(0.2);
  }, 60000);
});

describe('page side', () => {
  it('streams the audio in blocks (never a whole track) and reports a progress that only goes forward to 1', async () => {
    const { r, log } = renderer();
    const audio = pcmOf(noiseClicks(8, clickTimes(0.5, 7.5), 48), noiseClicks(8, clickTimes(0.4, 7.4), 48, 0.5, 7));
    const seen: number[] = [];
    await r.render({ audio, semitones: 1, cents: 0, tempoRatio: 0.9, formants: false, onProgress: (f) => seen.push(f) });
    expect(log.blocks.length).toBeGreaterThan(20);
    expect(Math.max(...log.blocks)).toBeLessThanOrEqual(16384);
    expect(log.blocks.reduce((a, b) => a + b, 0)).toBe(audio.frames);
    expect(seen.length).toBeGreaterThan(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]).toBe(1);
    expect(log.terminated).toBe(1); // the worker is ended when the render ends
  }, 60000);

  it('cancels quickly: the worker is terminated and the call rejects with `cancelled`', async () => {
    const { r, log } = renderer();
    const audio = pcmOf(sine(200, 30));
    const abort = new AbortController();
    const t0 = performance.now();
    const p = r.render({ audio, semitones: 2, cents: 0, tempoRatio: 0.7, formants: false, signal: abort.signal, onProgress: (f) => f > 0.02 && abort.abort() });
    await expect(p).rejects.toMatchObject({ name: 'RenderError', code: 'cancelled' });
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(log.terminated).toBe(1);
    // already cancelled: not even started
    await expect(r.render({ audio, semitones: 0, cents: 0, tempoRatio: 0.7, formants: false, signal: abort.signal })).rejects.toBeInstanceOf(RenderError);
  }, 60000);

  it('rejects an empty range and reports a worker failure as an error, not a hang', async () => {
    const { r } = renderer();
    const audio = pcmOf(sine(200, 1));
    await expect(r.render({ audio, semitones: 0, cents: 0, tempoRatio: 1, formants: false, range: { start: 0.5, end: 0.5 } })).rejects.toMatchObject({ code: 'failed' });
    const broken = new RubberBandRenderer({
      createWorker: () => {
        throw new Error('no worker here');
      },
    });
    await expect(broken.render({ audio, semitones: 0, cents: 0, tempoRatio: 1, formants: false })).rejects.toMatchObject({ code: 'unsupported' });
  });
});
