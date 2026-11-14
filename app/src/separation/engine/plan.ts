// The settings of a separation tool (the `config` of `models.json`, opaque to
// the rest of the app) and how a piece is cut into segments for it.
//
// Segmenting mirrors the reference implementations, as the prototype does
// (`web/spikes/separation/separator.js#planChunks`):
//   - `msst` (SCNet, BS-RoFormer: MSST demix, generic mode, batch size 1):
//     segments of `segment` samples every `segment / overlap`, the piece
//     mirrored by `segment - step` samples at both ends (when it is long
//     enough), each segment weighted by a linear fade of `segment / 10` (none
//     at the outer edges of the first and last segments);
//   - `demucs` (HTDemucs: apply_model, split=True, shifts=0): segments every
//     `(1 - overlap) · segment`, a short last segment centred in a zero-padded
//     window, triangular weights.
// Weights are added up per sample and the sum divides the result.
//
// Pure: no browser, tested in Node.

import { fadeWindow, makeWindow, triangleWindow, type StftSettings, type WindowKind } from './stft';

export type ToolFamily = 'msst' | 'demucs';
export type ToolIo = 'scnet' | 'roformer' | 'unblend-demucs';

export interface ToolConfig {
  family: ToolFamily;
  io: ToolIo;
  /** The tool's sample rate (44 100 for the three tools of the list). */
  sampleRate: number;
  /** Segment length, samples at `sampleRate`. */
  segment: number;
  /** `msst`: segments per segment length (2: every half segment). `demucs`: overlap fraction (0.25). */
  overlap: number;
  /** `msst`: the piece is normalised (mean / standard deviation) before the network. Demucs always is. */
  normalize: boolean;
  stft: { nfft: number; hop: number; window: WindowKind; normalized: boolean; zeroDC: boolean };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`separation tool settings: ${message}`);
    this.name = 'ConfigError';
  }
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Reads the opaque `config` of a list entry. A remote list may carry settings
 * this version does not know: they are refused (the tool cannot be run), never
 * guessed.
 */
export function parseConfig(raw: Record<string, unknown>): ToolConfig {
  const family = raw.family;
  const io = raw.io;
  if (family !== 'msst' && family !== 'demucs') throw new ConfigError(`unknown family ${String(family)}`);
  if (io !== 'scnet' && io !== 'roformer' && io !== 'unblend-demucs') throw new ConfigError(`unknown io ${String(io)}`);
  if ((io === 'unblend-demucs') !== (family === 'demucs')) throw new ConfigError('io and family do not match');
  if (!isInt(raw.sampleRate, 8000, 192000)) throw new ConfigError('sampleRate');
  if (!isInt(raw.segment, 4096, 10_000_000)) throw new ConfigError('segment');
  const overlap = raw.overlap;
  if (typeof overlap !== 'number' || !Number.isFinite(overlap)) throw new ConfigError('overlap');
  if (family === 'msst' && !(Number.isInteger(overlap) && overlap >= 1 && overlap <= 8)) throw new ConfigError('overlap of an msst tool');
  if (family === 'demucs' && !(overlap >= 0 && overlap < 1)) throw new ConfigError('overlap of a demucs tool');
  const st = raw.stft as Record<string, unknown> | undefined;
  if (!st || typeof st !== 'object') throw new ConfigError('stft');
  if (!isInt(st.nfft, 16, 65536) || (st.nfft & (st.nfft - 1)) !== 0) throw new ConfigError('stft.nfft');
  if (!isInt(st.hop, 1, st.nfft)) throw new ConfigError('stft.hop');
  if (st.window !== 'hann' && st.window !== 'ones') throw new ConfigError('stft.window');
  if (typeof st.normalized !== 'boolean') throw new ConfigError('stft.normalized');
  if (st.zeroDC !== undefined && typeof st.zeroDC !== 'boolean') throw new ConfigError('stft.zeroDC');
  if (raw.normalize !== undefined && typeof raw.normalize !== 'boolean') throw new ConfigError('normalize');
  return {
    family,
    io,
    sampleRate: raw.sampleRate,
    segment: raw.segment,
    overlap,
    normalize: raw.normalize === true,
    stft: { nfft: st.nfft, hop: st.hop, window: st.window, normalized: st.normalized, zeroDC: st.zeroDC === true },
  };
}

export function stftSettings(cfg: ToolConfig): StftSettings {
  return { ...cfg.stft, window: makeWindow(cfg.stft.window, cfg.stft.nfft) };
}

export interface Segment {
  /** First sample of the segment in the (padded, for msst) signal at the tool's rate. */
  start: number;
  /** Samples of the segment that count (≤ `segment`). */
  len: number;
  /** demucs: where the network's window starts (the short last segment is centred); msst: = start. */
  readStart: number;
  /** demucs: offset of the counted samples in the network's output; msst: 0. */
  trim: number;
}

export interface SegmentPlan {
  segments: Segment[];
  /** Length of the signal the segments cover (the piece plus both mirrored borders for msst). */
  total: number;
  /** msst: mirrored samples added before (and after) the piece; 0 otherwise. */
  border: number;
  /** Length of the piece at the tool's rate. */
  length: number;
  /** The weight of each segment's samples (shared). */
  weights: Float32Array;
  /** msst: the fade length, whose outer edges are 1 for the first and last segments. */
  fade: number;
}

export function planSegments(cfg: ToolConfig, length: number): SegmentPlan {
  const seg = cfg.segment;
  const segments: Segment[] = [];
  if (cfg.family === 'msst') {
    const step = Math.floor(seg / cfg.overlap);
    const fade = Math.floor(seg / 10);
    const border = seg - step;
    const padded = length > 2 * border && border > 0;
    const total = padded ? length + 2 * border : length;
    for (let i = 0; i < total; i += step) segments.push({ start: i, len: Math.min(seg, total - i), readStart: i, trim: 0 });
    return { segments, total, border: padded ? border : 0, length, weights: fadeWindow(seg, fade), fade };
  }
  const stride = Math.max(1, Math.floor((1 - cfg.overlap) * seg));
  for (let off = 0; off < length; off += stride) {
    const len = Math.min(seg, length - off);
    const delta = seg - len;
    segments.push({ start: off, len, readStart: off - Math.floor(delta / 2), trim: Math.floor(delta / 2) });
  }
  return { segments, total: length, border: 0, length, weights: triangleWindow(seg), fade: 0 };
}

/** Weight of sample `i` (0 ≤ i < len) of segment `j`. */
export function segmentWeight(plan: SegmentPlan, j: number, i: number): number {
  if (plan.fade > 0) {
    if (j === 0 && i < plan.fade) return 1;
    if (j === plan.segments.length - 1 && i >= plan.weights.length - plan.fade) return 1;
  }
  return plan.weights[i]!;
}

/** End (exclusive) of segment `j` in the signal the plan covers. */
export const segmentEnd = (s: Segment): number => s.start + s.len;

/**
 * The first segment that touches the covered signal at or after `position`
 * (segment ends never decrease, so every later segment touches it too).
 */
export function firstSegmentFrom(plan: SegmentPlan, position: number): number {
  const list = plan.segments;
  for (let j = 0; j < list.length; j++) if (segmentEnd(list[j]!) > position) return j;
  return list.length;
}
