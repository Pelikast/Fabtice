// The separation of a whole piece, segment after segment, with the least
// memory: the piece is read in ranges at the app's rate (48 kHz), resampled
// to the tool's rate for each segment only, the network's parts are added up
// (overlap-add, weights of the reference implementations) in buffers one
// segment long, and as soon as a stretch of the piece can no longer change
// (no later segment touches it) it is resampled back to 48 kHz and handed out
// (`emit`), then forgotten. Nothing the length of the piece is ever held here:
// the caller writes the parts where they belong (16-bit tracks).
//
// It can start again from any output frame (`fromFrame`): the segments that
// touch what is still to be written are computed again, the rest is skipped.
// That is how a separation goes on on the processor after the graphics chip
// failed: the frames already handed out are kept, the work resumes where it
// stopped, with the same tool.
//
// Port of the prototype (`web/spikes/separation/separator.js#separate`): same
// normalisation, segments, weights and network adapters; what changed is only
// where the samples live (and the 48 kHz ⇄ 44.1 kHz resampling, which the
// prototype left to the browser's decoder).
//
// Pure: no browser, tested in Node with a stand-in network.

import { baseOf, designResampler, resampleRange, resampleInto, resampledLength, type Polyphase } from './resample';
import { firstSegmentFrom, planSegments, segmentWeight, type SegmentPlan, type ToolConfig } from './plan';
import { reflectIndex } from './stft';

/** The network on one segment, in three steps (see `runners.ts`); P and O are its own. */
export interface SegmentModel<P = unknown, O = unknown> {
  prepare(l: Float32Array, r: Float32Array): P;
  run(p: P): Promise<O>;
  finish(p: P, out: O): [Float32Array, Float32Array][];
  /** Frees the outputs (graphics memory); optional. */
  release?(out: O): void;
}

/** The piece, at the app's rate, read in ranges. */
export interface PipelineInput {
  frames: number;
  sampleRate: number;
  /** False when the piece has one channel (or two equal ones): the right channel is the left. */
  stereo: boolean;
  /** Fills `out` with samples of `channel` from frame `start` (zeros outside the piece). */
  read(channel: 0 | 1, start: number, out: Float32Array): void;
}

export interface SegmentDone {
  /** Index of the segment just computed, and how many the piece has. */
  index: number;
  count: number;
  /** First segment of this run (> 0 when resuming). */
  first: number;
  /** Wall-clock seconds since the previous segment ended (or since the run began). */
  seconds: number;
  /** Output frames handed out so far (from frame 0). */
  written: number;
}

export interface PipelineOptions {
  cfg: ToolConfig;
  /** Parts the network gives. */
  stems: number;
  input: PipelineInput;
  model: SegmentModel;
  /** Output frame to start from (default 0): earlier frames are not handed out again. */
  fromFrame?: number;
  /** One channel per part (the mean of the network's two): for a piece in one channel. */
  monoOut?: boolean;
  /**
   * A finished stretch of every part at the app's rate: `parts[s]` holds one
   * array per output channel, all of the same length, starting at frame `offset`.
   * The arrays are the caller's (they may be transferred).
   */
  emit(offset: number, parts: Float32Array[][]): void | Promise<void>;
  onSegment?(done: SegmentDone): void;
  /** Throws to stop (cancellation); called between steps. */
  check?(): void;
  /** Lets other work (messages) through between segments. */
  yieldNow?(): Promise<void>;
  /** Prepare the next segment while the current one runs (graphics path). */
  pipelined?: boolean;
  /** Clock (seconds), replaceable in tests. */
  now?(): number;
}

/** A network that gives garbage (not finite, or nearly silent parts for a loud segment) must not pass for a result. */
export class BadOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadOutputError';
  }
}

/**
 * Checks one segment's parts: finite everywhere; on the first one also that
 * they carry a sensible share of the segment's energy (the prototype's test).
 */
export function checkParts(parts: readonly [Float32Array, Float32Array][], l: Float32Array, r: Float32Array, len: number, trim: number, energy: boolean): void {
  let ein = 0;
  let eout = 0;
  for (let i = 0; i < len; i++) ein += l[trim + i]! * l[trim + i]! + r[trim + i]! * r[trim + i]!;
  for (const [pl, pr] of parts) {
    for (const x of [pl, pr]) {
      for (let i = 0; i < len; i++) {
        const v = x[trim + i]!;
        if (!Number.isFinite(v)) throw new BadOutputError('the network gave values that are not numbers');
        eout += v * v;
      }
    }
  }
  if (energy && ein > 1e-3 && eout < ein * 1e-4) throw new BadOutputError('the network gave nearly silent parts');
}

/** Mean and standard deviation of the mono mix of the piece (MSST `normalize_audio`, Demucs: unbiased). */
export function pieceStats(input: PipelineInput, unbiased: boolean): { mean: number; std: number } {
  const BLOCK = 65536;
  const l = new Float32Array(BLOCK);
  const r = new Float32Array(BLOCK);
  let sum = 0;
  let sq = 0;
  const n = input.frames;
  for (let s = 0; s < n; s += BLOCK) {
    const k = Math.min(BLOCK, n - s);
    const lv = l.subarray(0, k);
    input.read(0, s, lv);
    if (input.stereo) input.read(1, s, r.subarray(0, k));
    for (let i = 0; i < k; i++) {
      const m = input.stereo ? (lv[i]! + r[i]!) * 0.5 : lv[i]!;
      sum += m;
      sq += m * m;
    }
  }
  if (n < 2) return { mean: 0, std: 1 };
  const mean = sum / n;
  const v = Math.max(0, (sq - n * mean * mean) / (unbiased ? n - 1 : n));
  return { mean, std: Math.sqrt(v) || 1 };
}

export interface PipelineResult {
  segments: number;
  computed: number;
  /** Seconds of each computed segment. */
  times: number[];
}

/** Runs the separation; resolves once every frame from `fromFrame` on has been handed out. */
export async function separatePiece(o: PipelineOptions): Promise<PipelineResult> {
  const { cfg, input, model } = o;
  const now = o.now ?? (() => performance.now() / 1000);
  const check = o.check ?? (() => {});
  const yieldNow = o.yieldNow ?? (() => Promise.resolve());
  const S = o.stems;
  const seg = cfg.segment;
  const outCh = o.monoOut ? 1 : 2;
  const frames = input.frames;
  const W = Math.max(0, Math.min(frames, Math.floor(o.fromFrame ?? 0)));
  const down = designResampler(input.sampleRate, cfg.sampleRate);
  const up = designResampler(cfg.sampleRate, input.sampleRate);
  const length = resampledLength(down, frames);
  const plan = planSegments(cfg, length);
  const n = plan.segments.length;
  if (W >= frames || n === 0) return { segments: n, computed: 0, times: [] };

  const norm = cfg.family === 'demucs' || cfg.normalize;
  const { mean, std } = norm ? pieceStats(input, cfg.family === 'demucs') : { mean: 0, std: 1 };
  check();

  // Where to start: what the first frame still to write needs at the tool's rate.
  const uNeed = W === 0 ? 0 : Math.max(0, baseOf(up, W) - up.H + 1);
  const j0 = W === 0 ? 0 : firstSegmentFrom(plan, uNeed + plan.border);

  // ---- reading one segment (normalised, at the tool's rate)
  const read48 = (ch: 0 | 1) => (start: number, buf: Float32Array) => input.read(input.stereo ? ch : 0, start, buf);
  let scratch: Float32Array | undefined;
  const span = new Float32Array(seg);
  const spanR = new Float32Array(seg);
  /** The piece at the tool's rate, samples [first, first + count), both channels, into span / spanR. */
  const readSpan = (first: number, count: number): [Float32Array, Float32Array] => {
    const a = count <= span.length ? span.subarray(0, count) : new Float32Array(count);
    const b = count <= spanR.length ? spanR.subarray(0, count) : new Float32Array(count);
    scratch = resampleRange(down, read48(0), first, a, scratch);
    if (input.stereo) scratch = resampleRange(down, read48(1), first, b, scratch);
    else b.set(a);
    return [a, b];
  };
  const inputOf = (j: number): [Float32Array, Float32Array] => {
    const sg = plan.segments[j]!;
    const l = new Float32Array(seg);
    const r = new Float32Array(seg);
    if (cfg.family === 'msst') {
      // Padded positions [start, start + len) are piece samples start - border … (mirrored at the ends).
      const map = (p: number) => {
        const u = p - plan.border;
        return u >= 0 && u < length ? u : reflectIndex(u, length);
      };
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < sg.len; i++) {
        const u = map(sg.start + i);
        if (u < 0) continue;
        if (u < lo) lo = u;
        if (u > hi) hi = u;
      }
      if (hi >= lo) {
        const [a, b] = readSpan(lo, hi - lo + 1);
        for (let i = 0; i < sg.len; i++) {
          const u = map(sg.start + i);
          if (u < 0) continue;
          l[i] = (a[u - lo]! - mean) / std;
          r[i] = (b[u - lo]! - mean) / std;
        }
      }
      if (sg.len < seg) {
        // A short segment is completed as the reference does: mirrored if more than half is there, zeros otherwise.
        if (sg.len > seg / 2) {
          for (let i = sg.len; i < seg; i++) {
            const s = reflectIndex(i, sg.len);
            if (s >= 0) {
              l[i] = l[s]!;
              r[i] = r[s]!;
            }
          }
        }
      }
      return [l, r];
    }
    // demucs: the network's window starts at readStart; outside the piece, zeros (after normalisation).
    const from = Math.max(0, sg.readStart);
    const to = Math.min(length, sg.readStart + seg);
    if (to > from) {
      const [a, b] = readSpan(from, to - from);
      for (let q = from; q < to; q++) {
        l[q - sg.readStart] = (a[q - from]! - mean) / std;
        r[q - sg.readStart] = (b[q - from]! - mean) / std;
      }
    }
    return [l, r];
  };

  // ---- overlap-add, one segment long
  const acc = Array.from({ length: S }, () => [new Float32Array(seg), new Float32Array(seg)]);
  const wsum = new Float32Array(seg);
  const weight = new Float32Array(seg);
  let accBase = plan.segments[j0]!.start;

  // ---- finished samples at the tool's rate, waiting to be resampled to 48 kHz
  const cap = seg + 2 * up.H + 16;
  const hist = Array.from({ length: S }, () => Array.from({ length: outCh }, () => new Float32Array(cap)));
  let histStart = uNeed;
  let histLen = 0;
  let next = W; // next output frame

  const finalize = (to: number) => {
    const count = to - accBase;
    for (let k = 0; k < count; k++) {
      const u = accBase + k - plan.border;
      if (u < uNeed || u >= length) continue;
      const w = wsum[k]!;
      if (histLen === 0) histStart = u;
      for (let s = 0; s < S; s++) {
        const a = acc[s]!;
        let vl = w > 0 ? a[0]![k]! / w : 0;
        let vr = w > 0 ? a[1]![k]! / w : 0;
        if (!Number.isFinite(vl)) vl = 0;
        if (!Number.isFinite(vr)) vr = 0;
        vl = vl * std + mean;
        vr = vr * std + mean;
        const h = hist[s]!;
        if (outCh === 1) h[0]![histLen] = (vl + vr) * 0.5;
        else {
          h[0]![histLen] = vl;
          h[1]![histLen] = vr;
        }
      }
      histLen++;
    }
    // Shift the overlap-add buffers.
    for (let s = 0; s < S; s++) {
      for (const a of acc[s]!) {
        a.copyWithin(0, count);
        a.fill(0, seg - count);
      }
    }
    wsum.copyWithin(0, count);
    wsum.fill(0, seg - count);
    accBase = to;
  };

  const emitReady = async (all: boolean) => {
    const histEnd = histStart + histLen;
    let end: number;
    if (all) end = frames;
    else {
      const lastBase = histEnd - up.H - 1; // the last input centre whose kernel is complete
      end = lastBase < 0 ? 0 : Math.floor((lastBase * up.L + up.L - 1) / up.M) + 1;
      end = Math.min(frames, end);
    }
    if (end <= next) return;
    const parts = hist.map((h) =>
      h.map((buf) => {
        const out = new Float32Array(end - next);
        resampleInto(up, buf.subarray(0, histLen), histStart, next, out);
        return out;
      }),
    );
    await o.emit(next, parts);
    next = end;
    // Forget what no later output needs.
    const keepFrom = baseOf(up, next) - up.H + 1;
    const drop = Math.min(histLen, keepFrom - histStart);
    if (drop > 0) {
      for (const h of hist) for (const buf of h) buf.copyWithin(0, drop, histLen);
      histStart += drop;
      histLen -= drop;
    }
  };

  // ---- the segments
  type Started = { j: number; l: Float32Array; r: Float32Array; p: unknown; out: Promise<unknown> };
  const start = (j: number): Started => {
    check();
    const [l, r] = inputOf(j);
    const p = model.prepare(l, r);
    const out = model.run(p);
    // A segment started ahead may fail while the current one is being finished: it is awaited (and its error
    // seen) in its turn, never left unhandled.
    out.catch(() => {});
    return { j, l, r, p, out };
  };
  const times: number[] = [];
  let last = now();
  let pending: Started | null = start(j0);
  for (let j = j0; j < n; j++) {
    const cur: Started = pending!;
    pending = null;
    const out = await cur.out;
    check();
    if (o.pipelined && j + 1 < n) {
      pending = start(j + 1);
      // Let the runtime hand the next segment to the graphics chip before this one's post-processing.
      await yieldNow();
    }
    const parts = model.finish(cur.p, out);
    model.release?.(out);
    const sg = plan.segments[j]!;
    checkParts(parts, cur.l, cur.r, sg.len, sg.trim, j === j0);
    if (parts.length !== S) throw new BadOutputError(`the network gave ${parts.length} parts instead of ${S}`);
    // Add this segment's parts.
    const off = sg.start - accBase;
    for (let i = 0; i < sg.len; i++) {
      const w = segmentWeight(plan, j, i);
      weight[i] = w;
      wsum[off + i] = wsum[off + i]! + w;
    }
    for (let s = 0; s < S; s++) {
      const [pl, pr] = parts[s]!;
      const [al, ar] = acc[s]!;
      for (let i = 0; i < sg.len; i++) {
        const w = weight[i]!;
        al![off + i] = al![off + i]! + pl[sg.trim + i]! * w;
        ar![off + i] = ar![off + i]! + pr[sg.trim + i]! * w;
      }
    }
    const isLast = j === n - 1;
    finalize(isLast ? plan.total : plan.segments[j + 1]!.start);
    await emitReady(isLast);
    const t = now();
    times.push(t - last);
    last = t;
    o.onSegment?.({ index: j, count: n, first: j0, seconds: times[times.length - 1]!, written: next });
    if (!pending && j + 1 < n) {
      await yieldNow();
      pending = start(j + 1);
    }
  }
  return { segments: n, computed: n - j0, times };
}

/** How many segments a piece of `frames` (at `sampleRate`) takes with this tool. */
export function segmentCount(cfg: ToolConfig, frames: number, sampleRate = 48000): number {
  return planOf(cfg, frames, sampleRate).segments.length;
}

export function planOf(cfg: ToolConfig, frames: number, sampleRate = 48000): SegmentPlan {
  const down: Polyphase = designResampler(sampleRate, cfg.sampleRate);
  return planSegments(cfg, resampledLength(down, frames));
}
