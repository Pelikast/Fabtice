// Signal processing for the separation spike: FFT, torch-compatible STFT / iSTFT
// for two channels at once, and the chunk weighting windows used by the
// reference implementations (MSST demix, Demucs apply_model).

const fftCache = new Map();

// Iterative radix-2 complex FFT working in place on Float64Array pairs.
class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of two');
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / n);
      this.sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
  }

  // Forward transform, X[k] = sum x[t] e^{-2 pi i k t / n}; inverse when sign = +1 (unscaled).
  transform(re, im, sign = -1) {
    const n = this.n, rev = this.rev, cs = this.cos, sn = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cs[k], wi = sign * sn[k];
          const a = start + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

function getFFT(n) {
  let f = fftCache.get(n);
  if (!f) { f = new FFT(n); fftCache.set(n, f); }
  return f;
}

// torch.hann_window(n) (periodic) or a window of ones.
export function makeWindow(kind, n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = kind === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n) : 1;
  return w;
}

// Reflect padding as torch.nn.functional.pad(mode="reflect"): index mirrored without
// repeating the edge sample. Out-of-range values beyond one reflection fall back to zero.
function reflectIndex(i, len) {
  if (i < 0) i = -i;
  if (i >= len) i = 2 * (len - 1) - i;
  return i >= 0 && i < len ? i : -1;
}

// Pads [left, right] channels: `before` and `after` samples, with 'reflect' or 'zero'.
export function padPair(l, r, before, after, mode) {
  const len = l.length, out = len + before + after;
  const pl = new Float32Array(out), pr = new Float32Array(out);
  pl.set(l, before); pr.set(r, before);
  if (mode === 'reflect') {
    for (let i = 0; i < before; i++) {
      const s = reflectIndex(i - before, len);
      if (s >= 0) { pl[i] = l[s]; pr[i] = r[s]; }
    }
    for (let i = 0; i < after; i++) {
      const s = reflectIndex(len + i, len);
      if (s >= 0) { pl[before + len + i] = l[s]; pr[before + len + i] = r[s]; }
    }
  }
  return [pl, pr];
}

// STFT of two real channels at once (z = left + i right), torch.stft semantics with
// center=True and pad_mode="reflect". Returns {F, T, lre, lim, rre, rim}, each a
// Float32Array laid out [F][T] (time fastest), the layout of an ONNX [.., F, T] tensor.
export function stftPair(l, r, { nfft, hop, window, normalized }) {
  const fft = getFFT(nfft);
  const half = nfft >> 1;
  const [pl, pr] = padPair(l, r, half, half, 'reflect');
  const T = 1 + Math.floor(l.length / hop);
  const F = half + 1;
  const lre = new Float32Array(F * T), lim = new Float32Array(F * T);
  const rre = new Float32Array(F * T), rim = new Float32Array(F * T);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const scale = normalized ? 1 / Math.sqrt(nfft) : 1;
  for (let t = 0; t < T; t++) {
    const off = t * hop;
    for (let i = 0; i < nfft; i++) {
      const w = window[i];
      re[i] = pl[off + i] * w;
      im[i] = pr[off + i] * w;
    }
    fft.transform(re, im, -1);
    for (let k = 0; k < F; k++) {
      const nk = (nfft - k) & (nfft - 1);
      const zr = re[k], zi = im[k], cr = re[nk], ci = im[nk];
      const idx = k * T + t;
      // X_L = (Z[k] + conj Z[n-k]) / 2, X_R = (Z[k] - conj Z[n-k]) / 2i
      lre[idx] = 0.5 * (zr + cr) * scale;
      lim[idx] = 0.5 * (zi - ci) * scale;
      rre[idx] = 0.5 * (zi + ci) * scale;
      rim[idx] = -0.5 * (zr - cr) * scale;
    }
  }
  return { F, T, lre, lim, rre, rim };
}

// Inverse of stftPair (torch.istft with center=True). The four spectra are read at
// base + k * strideF + t * strideT, so callers can pass any tensor layout without copying.
// Bins past F are zero. With tOffset / Ttotal, the T given frames sit at tOffset in a
// sequence of Ttotal frames whose others are zero (they still count in the window envelope).
// Returns [left, right] Float32Arrays of `length` samples.
export function istftPair(spec, F, T, { nfft, hop, window, normalized, zeroDC }, length, tOffset = 0, Ttotal = T) {
  const fft = getFFT(nfft);
  const half = nfft >> 1;
  const { lre, lim, rre, rim, base = 0, strideF = T, strideT = 1 } = spec;
  const total = nfft + hop * (Ttotal - 1);
  const ol = new Float64Array(total), or = new Float64Array(total), env = new Float64Array(total);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const scale = (normalized ? Math.sqrt(nfft) : 1) / nfft;
  const kmax = Math.min(F - 1, half);
  for (let tt = 0; tt < Ttotal; tt++) {
    const t = tt - tOffset;
    const off = tt * hop;
    if (t < 0 || t >= T) {
      for (let i = 0; i < nfft; i++) env[off + i] += window[i] * window[i];
      continue;
    }
    re.fill(0); im.fill(0);
    for (let k = zeroDC ? 1 : 0; k <= kmax; k++) {
      const idx = base + k * strideF + t * strideT;
      const ar = lre[idx], br = rre[idx];
      if (k === 0 || k === half) {
        // c2r transforms ignore the imaginary parts of DC and Nyquist.
        re[k] = ar; im[k] = br;
      } else {
        const ai = lim[idx], bi = rim[idx];
        re[k] = ar - bi; im[k] = ai + br;          // Z[k]   = X_L + i X_R
        re[nfft - k] = ar + bi; im[nfft - k] = br - ai; // Z[n-k] = conj X_L + i conj X_R
      }
    }
    fft.transform(re, im, 1);
    for (let i = 0; i < nfft; i++) {
      const w = window[i];
      ol[off + i] += re[i] * scale * w;
      or[off + i] += im[i] * scale * w;
      env[off + i] += w * w;
    }
  }
  const outL = new Float32Array(length), outR = new Float32Array(length);
  const n = Math.min(length, total - half);
  for (let i = 0; i < n; i++) {
    const e = env[i + half];
    if (e > 1e-11) {
      outL[i] = ol[i + half] / e;
      outR[i] = or[i + half] / e;
    }
  }
  return [outL, outR];
}

// MSST demix's _getWindowingArray: linear fade in and out over `fade` samples.
export function fadeWindow(size, fade) {
  const w = new Float32Array(size).fill(1);
  for (let i = 0; i < fade; i++) {
    const v = fade > 1 ? i / (fade - 1) : 1;
    w[i] = v;
    w[size - 1 - i] = v;
  }
  return w;
}

// Demucs apply_model's triangular weight (transition_power 1).
export function triangleWindow(size) {
  const w = new Float32Array(size);
  const h = Math.floor(size / 2);
  for (let i = 0; i < h; i++) w[i] = i + 1;
  for (let i = h; i < size; i++) w[i] = size - i;
  let max = 0;
  for (let i = 0; i < size; i++) if (w[i] > max) max = w[i];
  for (let i = 0; i < size; i++) w[i] /= max;
  return w;
}
