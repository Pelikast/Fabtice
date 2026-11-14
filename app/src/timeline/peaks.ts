// Waveform peaks: a multi-resolution pyramid computed in small time slices.
//
// Level 0 holds one bin per `BASE_BLOCK` frames, each upper level merges
// `LEVEL_FACTOR` bins of the one below. A bin stores the peak (largest
// absolute sample over all channels) and the mean square (energy, so levels
// merge exactly and the RMS is its square root). The timeline picks the level
// whose block is at most one pixel wide and merges the few bins that fall in
// each pixel column, so drawing costs the same at every zoom.
//
// Pure data and functions, no DOM: the cache that schedules the slices is in
// `peakCache.ts`.

import { CHUNK_BITS, type PcmAudio } from '../audio/pcm';

/** Frames per bin of level 0 (1.3 ms at 48 kHz: finer than the 400 px/s maximum zoom needs). */
export const BASE_BLOCK = 64;
/** Bins merged from one level into the next. */
export const LEVEL_FACTOR = 4;

export interface PeakLevel {
  /** Frames per bin. */
  block: number;
  /** Largest absolute sample of each bin (0…1, may exceed 1 on clipped files). */
  peak: Float32Array;
  /** Mean of the squared samples of each bin. */
  ms: Float32Array;
}

export interface PeakPyramid {
  sampleRate: number;
  frames: number;
  /** `levels[0]` first; upper levels exist once `ready`. */
  levels: PeakLevel[];
  /** Bins of level 0 computed so far (all of them once `ready`). */
  computedBins: number;
  /** All levels built. */
  ready: boolean;
  /** Largest peak seen so far. */
  maxPeak: number;
}

export function binCount(frames: number, block: number): number {
  return Math.ceil(frames / block);
}

/**
 * Builds a pyramid a slice at a time. `step(budgetMs)` works for about that
 * long and returns true once everything is computed.
 */
export class PeakBuilder {
  readonly pyramid: PeakPyramid;
  private readonly audio: PcmAudio;
  private cursor = 0;

  /** Reads the registry's 16-bit chunks directly (no copy of the audio). */
  constructor(audio: PcmAudio) {
    this.audio = audio;
    const frames = audio.frames;
    const bins = binCount(frames, BASE_BLOCK);
    this.pyramid = {
      sampleRate: audio.sampleRate,
      frames,
      levels: [{ block: BASE_BLOCK, peak: new Float32Array(bins), ms: new Float32Array(bins) }],
      computedBins: 0,
      ready: false,
      maxPeak: 0,
    };
    if (bins === 0) this.finish();
  }

  step(budgetMs: number, now: () => number = () => performance.now()): boolean {
    const py = this.pyramid;
    if (py.ready) return true;
    const level = py.levels[0]!;
    const bins = level.peak.length;
    const start = now();
    const chunks = this.audio.chunks;
    // Equal channels stored once: the second one would give the same peak and energy.
    const nch = this.audio.mono ? 1 : 2;
    const mask = (1 << CHUNK_BITS) - 1;
    let maxPeak = py.maxPeak;
    while (this.cursor < bins) {
      // A chunk of bins between two clock reads.
      const end = Math.min(bins, this.cursor + 512);
      for (let b = this.cursor; b < end; b++) {
        const from = b * BASE_BLOCK;
        const to = Math.min(py.frames, from + BASE_BLOCK);
        // BASE_BLOCK divides the chunk size: a bin never straddles two chunks.
        const chunk = chunks[from >> CHUNK_BITS]!;
        const o = from & mask;
        const n = to - from;
        let peak = 0;
        let sum = 0;
        for (let c = 0; c < nch; c++) {
          const data = c === 0 ? chunk.l : chunk.r!;
          for (let i = o; i < o + n; i++) {
            const v = data[i]!;
            const a = v < 0 ? -v : v;
            if (a > peak) peak = a;
            sum += v * v;
          }
        }
        // 16-bit units to the -1…1 scale.
        peak *= 1 / 32768;
        level.peak[b] = peak;
        level.ms[b] = sum / (nch * n * 1073741824);
        if (peak > maxPeak) maxPeak = peak;
      }
      this.cursor = end;
      py.computedBins = end;
      py.maxPeak = maxPeak;
      if (now() - start >= budgetMs) break;
    }
    if (this.cursor >= bins) this.finish();
    return py.ready;
  }

  private finish(): void {
    const py = this.pyramid;
    let prev = py.levels[0]!;
    while (prev.peak.length > 64) {
      const bins = Math.ceil(prev.peak.length / LEVEL_FACTOR);
      const next: PeakLevel = { block: prev.block * LEVEL_FACTOR, peak: new Float32Array(bins), ms: new Float32Array(bins) };
      for (let b = 0; b < bins; b++) {
        const from = b * LEVEL_FACTOR;
        const to = Math.min(prev.peak.length, from + LEVEL_FACTOR);
        let peak = 0;
        let ms = 0;
        for (let i = from; i < to; i++) {
          if (prev.peak[i]! > peak) peak = prev.peak[i]!;
          ms += prev.ms[i]!;
        }
        next.peak[b] = peak;
        next.ms[b] = ms / (to - from);
      }
      py.levels.push(next);
      prev = next;
    }
    py.computedBins = py.levels[0]!.peak.length;
    py.ready = true;
  }
}

/** Computes a whole pyramid at once (tests, small inputs). */
export function buildPeaks(audio: PcmAudio): PeakPyramid {
  const builder = new PeakBuilder(audio);
  while (!builder.step(1e9)) {
    /* one step is enough with this budget */
  }
  return builder.pyramid;
}

/**
 * The level to read at `framesPerPixel`: the coarsest one whose bins are at
 * most one pixel wide (level 0 when even that is coarser). While the pyramid
 * is being built only level 0 exists.
 */
export function levelFor(py: PeakPyramid, framesPerPixel: number): PeakLevel {
  if (!py.ready) return py.levels[0]!;
  let best = py.levels[0]!;
  for (const level of py.levels) {
    if (level.block <= framesPerPixel) best = level;
    else break;
  }
  return best;
}

/**
 * Fills, for `columns` consecutive columns starting at time `t0` and each
 * `secondsPerColumn` wide, the peak and the RMS of the audio under the
 * column. Columns outside the audio, or not computed yet, get -1 (so the
 * caller knows where to stop drawing).
 */
export function columnPeaks(
  py: PeakPyramid,
  t0: number,
  secondsPerColumn: number,
  columns: number,
  outPeak: Float32Array,
  outRms: Float32Array,
): void {
  const level = levelFor(py, secondsPerColumn * py.sampleRate);
  const binsPerSecond = py.sampleRate / level.block;
  const maxBin = py.ready ? level.peak.length : py.computedBins;
  for (let c = 0; c < columns; c++) {
    const from = (t0 + c * secondsPerColumn) * binsPerSecond;
    const to = from + secondsPerColumn * binsPerSecond;
    let i0 = Math.floor(from);
    let i1 = Math.max(i0 + 1, Math.ceil(to));
    if (i1 <= 0 || i0 >= maxBin) {
      outPeak[c] = -1;
      outRms[c] = -1;
      continue;
    }
    if (i0 < 0) i0 = 0;
    if (i1 > maxBin) i1 = maxBin;
    let peak = 0;
    let ms = 0;
    for (let i = i0; i < i1; i++) {
      if (level.peak[i]! > peak) peak = level.peak[i]!;
      ms += level.ms[i]!;
    }
    outPeak[c] = peak;
    outRms[c] = Math.sqrt(ms / (i1 - i0));
  }
}
