// The separation's pure parts: STFT round trip, resampling quality (measured,
// figures printed), segmenting and overlap-add, the network adapters, and the
// whole pipeline with a stand-in network whose parts sum back to the piece.

import { describe, expect, it } from 'vitest';
import { checkParts, BadOutputError, pieceStats, separatePiece, segmentCount, type PipelineInput, type SegmentModel } from './pipeline';
import { ConfigError, parseConfig, planSegments, segmentWeight, type ToolConfig } from './plan';
import { baseOf, designResampler, inputSpan, resampleRange, resampledLength } from './resample';
import { makeRunner, type NetworkOutputs } from './runners';
import { fftInPlace, istftPair, makeWindow, padPair, reflectIndex, stftPair, triangleWindow, fadeWindow } from './stft';
import bundled from '../models.json';

const configs = Object.fromEntries(bundled.models.map((m) => [m.id, parseConfig(m.config as Record<string, unknown>)])) as Record<string, ToolConfig>;

const db = (x: number) => 10 * Math.log10(x);

function tone(n: number, f: number, rate: number, amp = 0.5): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / rate);
  return x;
}

/** Linear sweep from f0 to f1 over n samples. */
function sweep(n: number, f0: number, f1: number, rate: number, amp = 0.5): Float32Array {
  const x = new Float32Array(n);
  const T = n / rate;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    x[i] = amp * Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * T)));
  }
  return x;
}

const reader = (x: Float32Array) => (start: number, buf: Float32Array) => {
  for (let i = 0; i < buf.length; i++) {
    const k = start + i;
    buf[i] = k >= 0 && k < x.length ? x[k]! : 0;
  }
};

const down = designResampler(48000, 44100);
const up = designResampler(44100, 48000);

function to44(x: Float32Array): Float32Array {
  const y = new Float32Array(resampledLength(down, x.length));
  resampleRange(down, reader(x), 0, y);
  return y;
}
function to48(y: Float32Array, n: number): Float32Array {
  const z = new Float32Array(n);
  resampleRange(up, reader(y), 0, z);
  return z;
}

/** Error of `z` against `x` (dB relative to `x`), away from the ends. */
function errorDb(x: Float32Array, z: Float32Array, margin = 4800): number {
  let e = 0;
  let s = 0;
  for (let i = margin; i < x.length - margin; i++) {
    e += (z[i]! - x[i]!) ** 2;
    s += x[i]! ** 2;
  }
  return db(e / s);
}

/** Level of the strongest component of `x` other than near `f` (dB relative to the tone), by a Blackman–Harris windowed FFT. */
function spuriousDb(x: Float32Array, rate: number, f: number, from = 4000, length = 65536): number {
  const re = new Float64Array(length);
  const im = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const a = (2 * Math.PI * i) / (length - 1);
    const w = 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a);
    re[i] = x[from + i]! * w;
  }
  fftInPlace(re, im);
  const mag = (k: number) => Math.hypot(re[k]!, im[k]!);
  const bin = Math.round((f * length) / rate);
  let peak = 0;
  for (let k = bin - 6; k <= bin + 6; k++) peak = Math.max(peak, mag(k));
  let other = 0;
  for (let k = 20; k < length / 2; k++) if (Math.abs(k - bin) > 16) other = Math.max(other, mag(k));
  return 20 * Math.log10(other / peak);
}

describe('STFT', () => {
  it('stftPair then istftPair gives the two channels back (torch conventions)', () => {
    for (const [kind, nfft, hop, normalized] of [
      ['hann', 2048, 512, false],
      ['hann', 4096, 1024, true],
      ['ones', 4096, 1024, true],
    ] as const) {
      const n = 20000;
      const l = sweep(n, 50, 15000, 44100);
      const r = tone(n, 440, 44100, 0.3);
      const st = { nfft, hop, window: makeWindow(kind, nfft), normalized };
      const z = stftPair(l, r, st);
      const [L, R] = istftPair(z, z.F, z.T, st, n);
      expect(errorDb(l, L, 0), `${kind} ${nfft}`).toBeLessThan(-120);
      expect(errorDb(r, R, 0)).toBeLessThan(-120);
    }
  });

  it('zeroDC (BS-RoFormer) drops the lowest bin: a constant shrinks (what the window spreads to the next bins stays), a tone stays', () => {
    const n = 8192;
    const st = { nfft: 2048, hop: 512, window: makeWindow('hann', 2048), normalized: false, zeroDC: true };
    const dc = new Float32Array(n).fill(0.5);
    const t = tone(n, 2000, 44100);
    const zd = stftPair(dc, t, st);
    const [L, R] = istftPair(zd, zd.F, zd.T, st, n);
    expect(Math.max(...L.subarray(2048, n - 2048).map(Math.abs))).toBeLessThan(0.5 / 2);
    expect(errorDb(t, R, 2048)).toBeLessThan(-100);
  });

  it('reflect padding and windows as the reference', () => {
    const [pl] = padPair(Float32Array.from([1, 2, 3, 4]), new Float32Array(4), 2, 3, 'reflect');
    expect(Array.from(pl)).toEqual([3, 2, 1, 2, 3, 4, 3, 2, 1]);
    expect(reflectIndex(-1, 4)).toBe(1);
    expect(reflectIndex(5, 4)).toBe(1);
    expect(reflectIndex(-9, 4)).toBe(-1);
    expect(Array.from(triangleWindow(4))).toEqual([0.5, 1, 1, 0.5]);
    expect(Array.from(fadeWindow(6, 2))).toEqual([0, 1, 1, 1, 1, 0]);
  });
});

describe('resampling 48 kHz ⇄ 44.1 kHz', () => {
  const N = 48000 * 3;

  it('a 1 kHz tone comes back from the round trip unchanged and in place', () => {
    const x = tone(N, 1000, 48000);
    const y = to44(x);
    expect(y.length).toBe(Math.ceil((N * 147) / 160));
    const z = to48(y, N);
    const err = errorDb(x, z);
    const spurious = spuriousDb(z, 48000, 1000);
    const spurious44 = spuriousDb(y, 44100, 1000);
    console.log(`resampling: 1 kHz tone, round trip error ${err.toFixed(1)} dB; strongest other component ${spurious.toFixed(1)} dB at 48 kHz, ${spurious44.toFixed(1)} dB at 44.1 kHz`);
    expect(err).toBeLessThan(-110);
    expect(spurious).toBeLessThan(-110);
    expect(spurious44).toBeLessThan(-110);
  });

  it('a 20 Hz – 20 kHz sweep comes back with an error under −90 dB', () => {
    const x = sweep(N, 20, 20000, 48000);
    const z = to48(to44(x), N);
    const err = errorDb(x, z);
    // Below 18 kHz the band is perfectly flat.
    const low = sweep(N, 20, 18000, 48000);
    const errLow = errorDb(low, to48(to44(low), N));
    console.log(`resampling: sweep 20 Hz – 20 kHz round trip error ${err.toFixed(1)} dB; 20 Hz – 18 kHz ${errLow.toFixed(1)} dB`);
    expect(err).toBeLessThan(-90);
    expect(errLow).toBeLessThan(-100);
  });

  it('what could fold into the audible band is removed (≥ 100 dB)', () => {
    // 48 → 44.1: a 23.5 kHz tone would fold to 20.6 kHz; 30 kHz is beyond the input band anyway, so use 23.5 and 23.9.
    for (const f of [23200, 23900]) {
      const x = tone(N, f, 48000);
      const y = to44(x);
      let s = 0;
      for (let i = 4000; i < y.length - 4000; i++) s += y[i]! ** 2;
      const level = db(s / (y.length - 8000) / 0.125);
      console.log(`resampling: ${f} Hz at 48 kHz, after the step to 44.1 kHz: ${level.toFixed(1)} dB`);
      expect(level).toBeLessThan(-100);
    }
    // 44.1 → 48: a 10 kHz tone has an image at 34.1 kHz, folding to 13.9 kHz.
    const y = tone(N, 10000, 44100);
    const z = to48(y, Math.floor((N * 160) / 147));
    const spurious = spuriousDb(z, 48000, 10000);
    console.log(`resampling: 10 kHz at 44.1 kHz, after the step to 48 kHz, strongest other component ${spurious.toFixed(1)} dB`);
    expect(spurious).toBeLessThan(-100);
  });

  it('the same rate on both sides is the identity (a piece already at the tool rate goes through untouched)', () => {
    const same = designResampler(44100, 44100);
    const x = sweep(5000, 100, 15000, 44100);
    const y = new Float32Array(1200);
    resampleRange(same, reader(x), 1000, y);
    expect(Array.from(y)).toEqual(Array.from(x.subarray(1000, 2200)));
    expect(resampledLength(same, 5000)).toBe(5000);
  });

  it('any range can be computed alone (random access), the same as in one go', () => {
    const x = sweep(20000, 100, 15000, 48000);
    const all = to44(x);
    const part = new Float32Array(1000);
    resampleRange(down, reader(x), 7777, part);
    for (let i = 0; i < part.length; i++) expect(part[i]).toBe(all[7777 + i]);
    const [first, end] = inputSpan(down, 7777, 1000);
    expect(first).toBe(baseOf(down, 7777) - down.H + 1);
    expect(end).toBe(baseOf(down, 8776) + down.H + 1);
  });
});

describe('segments', () => {
  it('the tools of the list have settings this version runs; unknown settings are refused', () => {
    expect(Object.keys(configs)).toEqual(['bs-roformer-sw', 'htdemucs-6s', 'scnet']);
    expect(() => parseConfig({ ...configs.scnet, io: 'other' } as unknown as Record<string, unknown>)).toThrow(ConfigError);
    expect(() => parseConfig({ ...configs.scnet, segment: 'long' } as unknown as Record<string, unknown>)).toThrow(ConfigError);
    expect(() => parseConfig({ ...configs['htdemucs-6s'], overlap: 2 } as unknown as Record<string, unknown>)).toThrow(ConfigError);
  });

  it('msst: every half segment, mirrored borders, weights that cover every sample', () => {
    const cfg = { ...configs.scnet!, segment: 1000 };
    const plan = planSegments(cfg, 4321);
    expect(plan.border).toBe(500);
    expect(plan.total).toBe(4321 + 1000);
    expect(plan.segments[1]!.start).toBe(500);
    const sum = new Float64Array(plan.total);
    plan.segments.forEach((s, j) => {
      for (let i = 0; i < s.len; i++) sum[s.start + i] = sum[s.start + i]! + segmentWeight(plan, j, i);
    });
    expect(Math.min(...sum)).toBeGreaterThan(0.5);
    // A short piece is not mirrored.
    expect(planSegments(cfg, 900).border).toBe(0);
  });

  it('demucs: a quarter overlap, the short last segment centred', () => {
    const cfg = { ...configs['htdemucs-6s']!, segment: 1000 };
    const plan = planSegments(cfg, 2600);
    expect(plan.segments.map((s) => s.start)).toEqual([0, 750, 1500, 2250]);
    const lastSeg = plan.segments[3]!;
    expect(lastSeg.len).toBe(350);
    expect(lastSeg.trim).toBe(325);
    expect(lastSeg.readStart).toBe(2250 - 325);
  });

  it('segment counts for a 4-minute piece', () => {
    const frames = 240 * 48000;
    const counts = Object.fromEntries(Object.entries(configs).map(([id, c]) => [id, segmentCount(c, frames)]));
    console.log(`segments for a 4-minute piece: ${JSON.stringify(counts)}`);
    expect(counts['bs-roformer-sw']).toBe(122);
    expect(counts.scnet).toBeGreaterThan(40);
  });
});

/** A stand-in network on the time signal: part s is the segment times gain[s] (the gains sum to 1). */
function gainModel(gains: number[], log?: number[]): SegmentModel<[Float32Array, Float32Array], [Float32Array, Float32Array]> {
  return {
    prepare: (l, r) => [l, r],
    run: async (p) => {
      log?.push(1);
      return p;
    },
    finish: (_p, [l, r]) => gains.map((g) => [l.map((v) => v * g), r.map((v) => v * g)] as [Float32Array, Float32Array]),
  };
}

function pieceInput(l: Float32Array, r: Float32Array | null): PipelineInput {
  return {
    frames: l.length,
    sampleRate: 48000,
    stereo: r !== null,
    read: (ch, start, out) => reader(ch === 1 && r ? r : l)(start, out),
  };
}

async function collect(cfg: ToolConfig, input: PipelineInput, model: SegmentModel, stems: number, extra: { fromFrame?: number; monoOut?: boolean; pipelined?: boolean } = {}) {
  const ch = extra.monoOut ? 1 : 2;
  const out = Array.from({ length: stems }, () => Array.from({ length: ch }, () => new Float32Array(input.frames)));
  const written: [number, number][] = [];
  const res = await separatePiece({
    cfg,
    stems,
    input,
    model,
    ...extra,
    emit: (offset, parts) => {
      written.push([offset, parts[0]![0]!.length]);
      parts.forEach((p, s) => p.forEach((a, c) => out[s]![c]!.set(a, offset)));
    },
  });
  return { out, written, res };
}

describe('the whole pipeline (stand-in network)', () => {
  const N = 48000 * 7 + 123;
  const l = sweep(N, 40, 16000, 48000, 0.4);
  const r = tone(N, 330, 48000, 0.3);
  const gains = [0.1, 0.2, 0.3, 0.4];

  for (const id of ['scnet', 'bs-roformer-sw', 'htdemucs-6s']) {
    it(`${id} segmenting: the parts sum back to the piece, every frame handed out once, in order`, async () => {
      const cfg = { ...configs[id]!, segment: id === 'htdemucs-6s' ? 60000 : 44100 };
      const { out, written } = await collect(cfg, pieceInput(l, r), gainModel(gains), 4);
      let at = 0;
      for (const [o, n] of written) {
        expect(o).toBe(at);
        at += n;
      }
      expect(at).toBe(N);
      for (const [c, x] of [[0, l], [1, r]] as const) {
        // Each part gets the piece's mean back (the references denormalise every part): remove the extra ones.
        const norm = cfg.family === 'demucs' || cfg.normalize;
        const { mean } = norm ? pieceStats(pieceInput(l, r), cfg.family === 'demucs') : { mean: 0 };
        const sum = new Float32Array(N);
        for (let s = 0; s < 4; s++) for (let i = 0; i < N; i++) sum[i] = sum[i]! + out[s]![c]![i]!;
        for (let i = 0; i < N; i++) sum[i] = sum[i]! - 3 * mean;
        const err = errorDb(x, sum, 2000);
        console.log(`pipeline ${id}: sum of the parts vs the piece, channel ${c}: ${err.toFixed(1)} dB`);
        expect(err).toBeLessThan(-85);
        // Each part is its share of the piece.
        expect(errorDb(x.map((v) => 0.3 * v + 0.7 * mean), out[2]![c]!, 2000)).toBeLessThan(-85);
      }
    });
  }

  it('resumes from any frame with the same result (the processor taking over)', async () => {
    const cfg = { ...configs.scnet!, segment: 44100 };
    const whole = await collect(cfg, pieceInput(l, r), gainModel(gains), 4);
    const W = 123457;
    const calls: number[] = [];
    const rest = await collect(cfg, pieceInput(l, r), gainModel(gains, calls), 4, { fromFrame: W });
    expect(rest.written[0]![0]).toBe(W);
    expect(rest.res.computed).toBeLessThan(rest.res.segments);
    expect(calls.length).toBe(rest.res.computed);
    let maxDiff = 0;
    for (let s = 0; s < 4; s++) for (let i = W; i < N; i++) maxDiff = Math.max(maxDiff, Math.abs(rest.out[s]![0]![i]! - whole.out[s]![0]![i]!));
    expect(maxDiff).toBeLessThan(1e-6);
    for (let i = 0; i < W; i++) expect(rest.out[0]![0]![i]).toBe(0);
  });

  it('a piece in one channel gives one channel per part; pipelined runs give the same', async () => {
    const cfg = { ...configs['bs-roformer-sw']!, segment: 44100 };
    const mono = await collect(cfg, pieceInput(l, null), gainModel(gains), 4, { monoOut: true });
    expect(mono.out[0]!.length).toBe(1);
    const sum = new Float32Array(N);
    for (let s = 0; s < 4; s++) for (let i = 0; i < N; i++) sum[i] = sum[i]! + mono.out[s]![0]![i]!;
    expect(errorDb(l, sum, 2000)).toBeLessThan(-85);
    const piped = await collect(cfg, pieceInput(l, null), gainModel(gains), 4, { monoOut: true, pipelined: true });
    expect(Array.from(piped.out[1]![0]!.subarray(1000, 1100))).toEqual(Array.from(mono.out[1]![0]!.subarray(1000, 1100)));
  });

  it('a network that gives garbage is refused (NaN, silence), and cancellation stops between steps', async () => {
    const cfg = { ...configs.scnet!, segment: 44100 };
    const nan: SegmentModel = { ...gainModel([1, 0]), finish: () => [[new Float32Array(44100).fill(NaN), new Float32Array(44100)], [new Float32Array(44100), new Float32Array(44100)]] };
    await expect(collect(cfg, pieceInput(l, r), nan, 2)).rejects.toThrow(BadOutputError);
    const silent: SegmentModel = { ...gainModel([1, 0]), finish: () => [[new Float32Array(44100), new Float32Array(44100)], [new Float32Array(44100), new Float32Array(44100)]] };
    await expect(collect(cfg, pieceInput(l, r), silent, 2)).rejects.toThrow(/silent/);
    expect(() => checkParts([[Float32Array.of(1), Float32Array.of(1)]], Float32Array.of(1), Float32Array.of(1), 1, 0, true)).not.toThrow();
    let n = 0;
    await expect(
      separatePiece({
        cfg,
        stems: 4,
        input: pieceInput(l, r),
        model: gainModel(gains),
        emit: () => {},
        check: () => {
          if (++n > 5) throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('normalisation as the references: mean and standard deviation of the mono mix', () => {
    const a = Float32Array.from([1, 2, 3, 4]);
    const b = Float32Array.from([3, 2, 1, 0]);
    expect(pieceStats(pieceInput(a, b), false)).toEqual({ mean: 2, std: 1 });
    const s = pieceStats(pieceInput(a, null), true);
    expect(s.mean).toBe(2.5);
    expect(s.std).toBeCloseTo(Math.sqrt(5 / 3), 6);
  });
});

describe('network adapters (the STFT around a stand-in network)', () => {
  // The stand-in gives each part a share of the input spectrum, in the layout the real network uses.
  for (const id of ['scnet', 'bs-roformer-sw', 'htdemucs-6s']) {
    it(`${id}: parts that are shares of the input come back as shares of the segment`, async () => {
      // BS-RoFormer drops the lowest bin (its `zero_dc`, as the reference): checked apart, below.
      const base = configs[id]!;
      const cfg = { ...base, segment: id === 'bs-roformer-sw' ? 22050 : 44100, stft: { ...base.stft, zeroDC: false } };
      const S = 3;
      const gains = [0.5, 0.3, 0.2];
      const runner = makeRunner(cfg, S, (data, dims) => ({ data, dims }));
      const seg = cfg.segment;
      const l = sweep(seg, 60, 12000, 44100, 0.4);
      const r = tone(seg, 523, 44100, 0.3);
      const p = runner.prepare(l, r);
      const feeds = p.feeds as Record<string, { data: Float32Array; dims: number[] }>;
      let out: NetworkOutputs;
      if (cfg.io === 'scnet') {
        const x = feeds.mix_spec!.data;
        const n = p.F * p.T;
        const y = new Float32Array(S * 4 * n);
        for (let s = 0; s < S; s++) for (let k = 0; k < 4; k++) for (let i = 0; i < n; i++) y[(s * 4 + k) * n + i] = x[k * n + i]! * gains[s]!;
        out = { stems_spec: { data: y } };
      } else {
        const re = feeds.spec_real!.data;
        const im = feeds.spec_imag!.data;
        const m = re.length;
        const yr = new Float32Array(S * m);
        const yi = new Float32Array(S * m);
        for (let s = 0; s < S; s++)
          for (let i = 0; i < m; i++) {
            yr[s * m + i] = re[i]! * gains[s]!;
            yi[s * m + i] = im[i]! * gains[s]!;
          }
        out = { out_spec_real: { data: yr }, out_spec_imag: { data: yi } };
        if (cfg.io === 'unblend-demucs') out.out_wave = { data: new Float32Array(S * 2 * seg) };
      }
      const parts = runner.finish(p, out);
      expect(parts).toHaveLength(S);
      for (let s = 0; s < S; s++) {
        const margin = cfg.io === 'unblend-demucs' ? 3000 : 0;
        expect(errorDb(l.map((v) => v * gains[s]!), parts[s]![0], margin), `${id} part ${s}`).toBeLessThan(-80);
        expect(errorDb(r.map((v) => v * gains[s]!), parts[s]![1], margin)).toBeLessThan(-80);
      }
    });
  }
});
