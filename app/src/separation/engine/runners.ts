// What each tool's network takes and gives, ported from the prototype
// (`web/spikes/separation/separator.js#makeRunner`): one stereo segment in,
// one stereo segment per part out, same length. `prepare` is the processor
// work before the network (STFT), `finish` the work after it (iSTFT); the
// network itself runs in between (`run`). Splitting them lets the pipeline
// prepare the next segment while the graphics chip computes the current one.
//
// Pure: the ONNX Runtime tensor constructor is handed in.

import { istftPair, padPair, stftPair, type StftSettings } from './stft';
import { stftSettings, type ToolConfig } from './plan';

/** Builds an input tensor (ONNX Runtime's `new Tensor('float32', data, dims)`). */
export type TensorFactory = (data: Float32Array, dims: readonly number[]) => unknown;

/** What the network gives back: tensors by output name (their `data` read on the processor). */
export type NetworkOutputs = Record<string, { readonly data: unknown; dispose?: () => void }>;

export interface Prepared {
  feeds: Record<string, unknown>;
  F: number;
  T: number;
}

export interface SegmentRunner {
  /** Output names the network must give. */
  readonly outputs: readonly string[];
  /** Input tensors for one segment (`l`, `r`: `segment` samples each, already normalised). */
  prepare(l: Float32Array, r: Float32Array): Prepared;
  /** Each part's two channels, `segment` samples each. */
  finish(p: Prepared, out: NetworkOutputs): [Float32Array, Float32Array][];
}

function floats(out: NetworkOutputs, name: string): Float32Array {
  const t = out[name];
  if (!t) throw new Error(`the network gave no ${name}`);
  const d = t.data;
  if (d instanceof Float32Array) return d;
  // A half-precision output (an fp16 graph without a final cast): widen it.
  if (typeof Float16Array !== 'undefined' && d instanceof Float16Array) return Float32Array.from(d);
  if (d instanceof Uint16Array) return halfToFloat(d);
  throw new Error(`unexpected type for ${name}`);
}

/** IEEE 754 half precision bits to Float32. */
function halfToFloat(h: Uint16Array): Float32Array {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const x = h[i]!;
    const s = x & 0x8000 ? -1 : 1;
    const e = (x >> 10) & 0x1f;
    const m = x & 0x3ff;
    out[i] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
  }
  return out;
}

export function makeRunner(cfg: ToolConfig, stems: number, tensor: TensorFactory): SegmentRunner {
  const st: StftSettings = stftSettings(cfg);
  const S = stems;
  const seg = cfg.segment;

  if (cfg.io === 'scnet') {
    // SCNet.forward pads the end so that the frame count is even.
    const hop = st.hop;
    let pad = hop - (seg % hop);
    if (((seg + pad) / hop) % 2 === 0) pad += hop;
    return {
      outputs: ['stems_spec'],
      prepare(l, r) {
        const [pl, pr] = padPair(l, r, 0, pad, 'zero');
        const z = stftPair(pl, pr, st);
        const n = z.F * z.T;
        const x = new Float32Array(4 * n);
        x.set(z.lre, 0);
        x.set(z.lim, n);
        x.set(z.rre, 2 * n);
        x.set(z.rim, 3 * n);
        return { feeds: { mix_spec: tensor(x, [1, 4, z.F, z.T]) }, F: z.F, T: z.T };
      },
      finish(p, out) {
        const y = floats(out, 'stems_spec');
        const n = p.F * p.T;
        const parts: [Float32Array, Float32Array][] = [];
        for (let s = 0; s < S; s++) {
          const b = (c: number, k: number) => y.subarray(((s * 2 + c) * 2 + k) * n, ((s * 2 + c) * 2 + k + 1) * n);
          const [L, R] = istftPair({ lre: b(0, 0), lim: b(0, 1), rre: b(1, 0), rim: b(1, 1) }, p.F, p.T, st, seg + pad);
          parts.push([L.subarray(0, seg), R.subarray(0, seg)]);
        }
        return parts;
      },
    };
  }

  if (cfg.io === 'roformer') {
    return {
      outputs: ['out_spec_real', 'out_spec_imag'],
      prepare(l, r) {
        const z = stftPair(l, r, st);
        const n = z.F * z.T;
        const re = new Float32Array(2 * n);
        const im = new Float32Array(2 * n);
        re.set(z.lre, 0);
        re.set(z.rre, n);
        im.set(z.lim, 0);
        im.set(z.rim, n);
        return { feeds: { spec_real: tensor(re, [1, 2, z.F, z.T]), spec_imag: tensor(im, [1, 2, z.F, z.T]) }, F: z.F, T: z.T };
      },
      finish(p, out) {
        const yr = floats(out, 'out_spec_real');
        const yi = floats(out, 'out_spec_imag');
        const n = p.F * p.T;
        const parts: [Float32Array, Float32Array][] = [];
        for (let s = 0; s < S; s++) {
          const b = (y: Float32Array, c: number) => y.subarray((s * 2 + c) * n, (s * 2 + c + 1) * n);
          parts.push(istftPair({ lre: b(yr, 0), lim: b(yi, 0), rre: b(yr, 1), rim: b(yi, 1) }, p.F, p.T, st, seg));
        }
        return parts;
      },
    };
  }

  // unblend-demucs: HTDemucs._spec / _ispec framing: reflect pad by 3/4 hop, drop the Nyquist bin and two edge frames.
  const hop = st.hop;
  const le = Math.ceil(seg / hop);
  const pad = (hop / 2) * 3;
  const F = st.nfft / 2;
  const T = le;
  return {
    outputs: ['out_spec_real', 'out_spec_imag', 'out_wave'],
    prepare(l, r) {
      const [pl, pr] = padPair(l, r, pad, pad + le * hop - seg, 'reflect');
      const z = stftPair(pl, pr, st);
      const n = F * T;
      const re = new Float32Array(2 * n);
      const im = new Float32Array(2 * n);
      for (let k = 0; k < F; k++) {
        const src = k * z.T + 2;
        const dst = k * T;
        re.set(z.lre.subarray(src, src + T), dst);
        re.set(z.rre.subarray(src, src + T), n + dst);
        im.set(z.lim.subarray(src, src + T), dst);
        im.set(z.rim.subarray(src, src + T), n + dst);
      }
      const audio = new Float32Array(2 * seg);
      audio.set(l, 0);
      audio.set(r, seg);
      return {
        feeds: { spec_real: tensor(re, [1, 2, F, T]), spec_imag: tensor(im, [1, 2, F, T]), audio: tensor(audio, [1, 2, seg]) },
        F,
        T,
      };
    },
    finish(_p, out) {
      const yr = floats(out, 'out_spec_real');
      const yi = floats(out, 'out_spec_imag');
      const w = floats(out, 'out_wave');
      const n = F * T;
      const parts: [Float32Array, Float32Array][] = [];
      for (let s = 0; s < S; s++) {
        const b = (y: Float32Array, c: number) => y.subarray((s * 2 + c) * n, (s * 2 + c + 1) * n);
        const [L, R] = istftPair({ lre: b(yr, 0), lim: b(yi, 0), rre: b(yr, 1), rim: b(yi, 1) }, F, T, st, le * hop + 2 * pad, 2, T + 4);
        const outL = new Float32Array(seg);
        const outR = new Float32Array(seg);
        const wl = s * 2 * seg;
        const wr = (s * 2 + 1) * seg;
        for (let i = 0; i < seg; i++) {
          outL[i] = L[pad + i]! + w[wl + i]!;
          outR[i] = R[pad + i]! + w[wr + i]!;
        }
        parts.push([outL, outR]);
      }
      return parts;
    },
  };
}
