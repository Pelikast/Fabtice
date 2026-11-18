// SheetSage2's front end (MERT-v2, `modeling_mert2.MERT2MelFrontend`), computed here rather than in
// the graphs: 24 kHz mono, power spectrogram (2048-point FFT, Hann window, hop 240 = 100 frames per
// second, centred with reflection), 128 mel bands, 10 log10, the checkpoint's own normalisation;
// the last frame dropped. Its constants (window, mel filters, mean and deviation) are read from the
// authors' MERT-v2 file itself (its first bytes, `SS2_FRONT_BYTES`), never copied into the app.

import { fft } from './fft';

export const SS2_RATE = 24000;
export const SS2_N_FFT = 2048;
export const SS2_HOP = 240;
export const SS2_MELS = 128;
/** One model window: 300 s. */
export const SS2_WINDOW_SECONDS = 300;
export const SS2_WINDOW_SAMPLES = SS2_WINDOW_SECONDS * SS2_RATE;
/** Mel frames of one window (100 per second); the encoder makes 25 per second of them. */
export const SS2_MEL_FRAMES = SS2_WINDOW_SAMPLES / SS2_HOP;
export const SS2_FRAMES = SS2_MEL_FRAMES / 4;

/** The bytes of the MERT-v2 file that hold its header and the front end's four tensors. */
export const SS2_FRONT_BYTES = 629616;

export interface MelFront {
  window: Float32Array;
  /** [1025, 128]: frequency bin × mel band. */
  fb: Float32Array;
  mean: Float32Array;
  std: Float32Array;
}

/** A float32 tensor of a .safetensors buffer that holds its header (at least up to the tensor's end). */
export function safetensor(buf: ArrayBuffer, name: string): Float32Array {
  const view = new DataView(buf);
  const n = Number(view.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n))) as Record<string, { dtype: string; shape: number[]; data_offsets: [number, number] }>;
  const t = header[name];
  if (!t || t.dtype !== 'F32') throw new Error(`no float32 tensor ${name}`);
  const [a, b] = t.data_offsets;
  if (8 + n + b > buf.byteLength) throw new Error(`tensor ${name} is beyond the bytes given`);
  return new Float32Array(buf.slice(8 + n + a, 8 + n + b));
}

/** The front end's constants, from the first `SS2_FRONT_BYTES` of the MERT-v2 file. */
export function melFront(head: ArrayBuffer): MelFront {
  return {
    window: safetensor(head, 'feature_extractor.spectrogram.window'),
    fb: safetensor(head, 'feature_extractor.mel_scale.fb'),
    mean: safetensor(head, 'feature_extractor.mel_mean'),
    std: safetensor(head, 'feature_extractor.mel_std'),
  };
}

/**
 * The normalised log-mel frames [frames, 128] of `x` (24 kHz mono, a length that is a multiple of
 * the hop: one window is `SS2_WINDOW_SAMPLES`). `between` is awaited every few hundred frames
 * (cancellation, fluid interface).
 */
export async function melFrames(x: Float32Array, front: MelFront, between: () => Promise<void> = async () => {}): Promise<Float32Array> {
  const N = SS2_N_FFT;
  const half = N / 2;
  const bins = half + 1;
  const frames = Math.floor(x.length / SS2_HOP); // 1 + L / hop centred frames, the last one dropped
  // The non-zero range of each band's filter.
  const lo = new Int32Array(SS2_MELS);
  const hi = new Int32Array(SS2_MELS);
  for (let m = 0; m < SS2_MELS; m++) {
    let a = -1;
    let b = -1;
    for (let f = 0; f < bins; f++) {
      if (front.fb[f * SS2_MELS + m] !== 0) {
        if (a < 0) a = f;
        b = f;
      }
    }
    lo[m] = a < 0 ? 0 : a;
    hi[m] = a < 0 ? -1 : b;
  }
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const power = new Float64Array(bins);
  const out = new Float32Array(frames * SS2_MELS);
  const L = x.length;
  // Reflection at both ends (torch.stft, center=True, pad_mode='reflect').
  const at = (i: number): number => {
    if (i < 0) i = -i;
    if (i >= L) i = 2 * (L - 1) - i;
    return x[i]!;
  };
  for (let t = 0; t < frames; t++) {
    const start = t * SS2_HOP - half;
    if (start >= 0 && start + N <= L) {
      for (let i = 0; i < N; i++) re[i] = x[start + i]! * front.window[i]!;
    } else {
      for (let i = 0; i < N; i++) re[i] = at(start + i) * front.window[i]!;
    }
    im.fill(0);
    fft(re, im);
    for (let f = 0; f < bins; f++) power[f] = re[f]! * re[f]! + im[f]! * im[f]!;
    const row = t * SS2_MELS;
    for (let m = 0; m < SS2_MELS; m++) {
      let s = 0;
      for (let f = lo[m]!; f <= hi[m]!; f++) s += power[f]! * front.fb[f * SS2_MELS + m]!;
      const db = 10 * Math.log10(Math.max(s, 1e-10));
      out[row + m] = (db - front.mean[m]!) / Math.max(front.std[m]!, 1e-5);
    }
    if (t % 500 === 499) await between();
  }
  return out;
}
