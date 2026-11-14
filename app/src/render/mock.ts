// A stand-in offline renderer: keeps the durations and the alignment right
// (the output lasts `duration / tempoRatio`, frame k is source time
// k * tempoRatio), with a plain overlap-add of windowed grains and no
// resampling, so the tempo changes and the pitch does not. It does NOT
// transpose and does not keep the timbre: it is a placeholder for the screens
// and the tests until Rubber Band R3 is in place (`render/types.ts`).

import { CHUNK, PcmWriter, readPcm, type PcmAudio } from '../audio/pcm';
import { RenderError, type OfflineRenderer, type RenderRequest } from './types';

const W = 2048;
const HOP = W / 4;
const WINDOW = Float32Array.from({ length: W }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W));
/** A periodic Hann window overlapped at a quarter of its length sums to 2. */
const OLA_GAIN = 0.5;

export interface MockRendererOptions {
  /** Extra wait per second of output, ms (to see the waiting screen); default 0. */
  msPerSecond?: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class MockRenderer implements OfflineRenderer {
  readonly kind = 'mock';
  readonly supportsFormants = true;

  constructor(private readonly opts: MockRendererOptions = {}) {}

  async render(req: RenderRequest): Promise<PcmAudio> {
    const { audio, signal } = req;
    const sr = audio.sampleRate;
    const ratio = Math.min(2, Math.max(0.25, req.tempoRatio));
    const start = req.range ? Math.max(0, Math.round(req.range.start * sr)) : 0;
    const end = req.range ? Math.min(audio.frames, Math.round(req.range.end * sr)) : audio.frames;
    if (end <= start) throw new RenderError('failed', 'empty range');
    if (signal?.aborted) throw new RenderError('cancelled');
    const outFrames = Math.round((end - start) / ratio);
    const writer = new PcmWriter(outFrames, sr, audio.channelCount);
    const channels = audio.mono ? 1 : 2;
    const block = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
    const grain = new Float32Array(W);
    const began = Date.now();
    for (let o0 = 0; o0 < outFrames; o0 += CHUNK) {
      const o1 = Math.min(outFrames, o0 + CHUNK);
      const n = o1 - o0;
      for (let c = 0; c < channels; c++) {
        const out = block[c]!.subarray(0, n).fill(0);
        if (ratio === 1) {
          readPcm(audio, c as 0 | 1, start + o0, out);
          continue;
        }
        // Grains centred on m * HOP in the output, read at m * HOP * ratio in the source.
        const m0 = Math.max(0, Math.floor((o0 - W / 2) / HOP));
        const m1 = Math.ceil((o1 + W / 2) / HOP);
        for (let m = m0; m <= m1; m++) {
          const centreOut = m * HOP;
          const centreIn = start + Math.round(centreOut * ratio);
          readPcm(audio, c as 0 | 1, centreIn - W / 2, grain);
          const from = centreOut - W / 2;
          for (let i = 0; i < W; i++) {
            const k = from + i - o0;
            if (k < 0 || k >= n) continue;
            const src = centreIn - W / 2 + i;
            if (src < start || src >= end) continue;
            out[k] = out[k]! + grain[i]! * WINDOW[i]! * OLA_GAIN;
          }
        }
      }
      writer.write(o0, block[0]!.subarray(0, n), channels === 2 ? block[1]!.subarray(0, n) : undefined);
      req.onProgress?.(o1 / outFrames);
      await tick();
      if (this.opts.msPerSecond) {
        const due = began + (o1 / sr) * this.opts.msPerSecond;
        if (due > Date.now()) await new Promise((r) => setTimeout(r, due - Date.now()));
      }
      if (signal?.aborted) throw new RenderError('cancelled');
    }
    return writer.finish();
  }
}
