// The optional chord model SheetSage2 (m-a-p, 2026; weights CC BY-NC 4.0, non-commercial), run in
// the app as its authors run it (their `pipeline_sheetsage2` / `generation_sheetsage2`), asked for
// time stamps and full chords only:
//
//   1. the piece at 24 kHz mono, in windows of 300 s (one window for a piece up to 5 minutes);
//   2. per window, the log-mel frames (`sheetsage2Mel.ts`), then the MERT-v2 encoder in parts of
//      four layers, each part's session created, run and released in turn (only one part's
//      weights in memory at a time), then the cross-attention keys and values;
//   3. the decoder token by token, greedy, under the authors' event grammar (`Grammar`), up to the
//      end of the window (or of the part of it kept);
//   4. the tokens read back as events (`decodeEvents`, `timeMap`), and at each chord the model
//      writes, its probabilities over its 361 chord labels (softmax of the chord logits at that step).
//
// The graphs (`assets/sheetsage2/`, made by web/spikes/accords/modeles/convert_sheetsage2.py and
// checked there against the authors' PyTorch model) hold no weights: they read slices of the
// authors' own files (`model.safetensors` of SheetSage2 and of MERT-v2-FullSong).
//
// Long pieces: windows of 300 s every 200 s, each keeping the middle of its overlaps; each window is
// read on its own (the authors' default also feeds the previous window's events to the next one;
// not done here).

import { N_CHORDS, NO_CHORD, chordPcs, type ChordFrames } from './chords';
import type { RunControl, TensorLike } from './session';
import { SS2_FRAMES, SS2_MEL_FRAMES, SS2_MELS, SS2_RATE, SS2_WINDOW_SAMPLES, SS2_WINDOW_SECONDS, melFrames, type MelFront } from './sheetsage2Mel';
import { SS2_BASS, SS2_LABELS, SS2_LAYOUT, SS2_TO_APP } from './sheetsage2Vocab';

const L = SS2_LAYOUT;
export const SS2_CHORDS = L.chord[1] - L.chord[0];
/** The decoder's context (`max_output_seq_len`). */
export const SS2_MAX_TOKENS = 5120;
const DEC_LAYERS = 6;
const DEC_HEADS = 8;
const HEAD_DIM = 64;
const MEMORY_WIDTH = 512;
/** Frames per second of the evidence handed to the decoding (as Tsumugi's). */
export const SS2_FPS = 25;

// ---------------------------------------------------------------------------- grammar

const FIELD = { timestamp: 0, rhythm: 1, structure: 2, key: 3, chord: 4, melody: 5 } as const;
type Incomplete = null | 'rhythm' | 'melody';

const inRange = (t: number, r: readonly [number, number]) => t >= r[0] && t < r[1];

/**
 * The authors' `PromptGrammarState`: which tokens may come next. Token families in the order the
 * vocabulary lays them out; `ranges()` lists the allowed ones as [start, end) ranges.
 */
export class Grammar {
  inShift = true;
  shiftRun = 0;
  payload = 0;
  lastField = -1;
  incomplete: Incomplete = null;

  ranges(): [number, number][] {
    const out: [number, number][] = [];
    if (this.payload > 0) out.push([L.eos, L.eos + 1]);
    if ((this.payload > 0 || this.inShift) && this.shiftRun < 4) out.push([L.shift[0], L.shift[1]]);
    if (this.incomplete === 'rhythm') {
      out.push([L.eighth[0], L.eighth[1]]);
      return out;
    }
    if (this.incomplete === 'melody') {
      out.push([L.duration[0], L.duration[1]], [L.pitch[0], L.pitch[1]]);
      return out;
    }
    if (this.lastField < FIELD.timestamp) out.push([L.time[0], L.time[1]]);
    if (this.lastField < FIELD.rhythm) out.push([L.meter[0], L.meter[1]], [L.eighth[0], L.eighth[1]]);
    if (this.lastField < FIELD.structure) out.push([L.structure[0], L.structure[1]]);
    if (this.lastField < FIELD.key) out.push([L.key[0], L.key[1]]);
    if (this.lastField < FIELD.chord) out.push([L.chord[0], L.chord[1]]);
    if (this.lastField <= FIELD.melody) out.push([L.pitch[0], L.pitch[1]]);
    return out;
  }

  /** True when the sequence is finished. */
  update(t: number): boolean {
    if (t === L.eos) return true;
    if (inRange(t, L.shift)) {
      if (!this.inShift && this.payload > 0) {
        this.payload = 0;
        this.lastField = -1;
        this.incomplete = null;
      }
      this.inShift = true;
      this.shiftRun++;
      return false;
    }
    this.inShift = false;
    this.shiftRun = 0;
    this.payload++;
    if (inRange(t, L.time)) [this.lastField, this.incomplete] = [FIELD.timestamp, null];
    else if (inRange(t, L.meter)) [this.lastField, this.incomplete] = [FIELD.rhythm, 'rhythm'];
    else if (inRange(t, L.eighth)) [this.lastField, this.incomplete] = [FIELD.rhythm, null];
    else if (inRange(t, L.structure)) [this.lastField, this.incomplete] = [FIELD.structure, null];
    else if (inRange(t, L.key)) [this.lastField, this.incomplete] = [FIELD.key, null];
    else if (inRange(t, L.chord)) [this.lastField, this.incomplete] = [FIELD.chord, null];
    else if (inRange(t, L.pitch)) [this.lastField, this.incomplete] = [FIELD.melody, 'melody'];
    else if (inRange(t, L.duration)) [this.lastField, this.incomplete] = [FIELD.melody, null];
    else throw new Error(`unexpected token ${t}`);
    return false;
  }
}

/** The allowed token with the highest logit (the first one on a tie, as torch.argmax). */
export function bestAllowed(logits: ArrayLike<number>, ranges: readonly (readonly [number, number])[]): number {
  let best = -1;
  let v = -Infinity;
  for (const [a, b] of ranges) {
    for (let i = a; i < b; i++) {
      const x = logits[i]!;
      if (x > v || (x === v && i < best)) {
        v = x;
        best = i;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------- events

export interface Ss2Event {
  subbeat: number;
  /** Seconds in the window, when the event carries a time stamp. */
  timestamp?: number;
  /** Index into SS2_LABELS. */
  chord?: number;
  /** Position of the chord token in the generated tokens (to find its probabilities). */
  chordToken?: number;
}

/**
 * The authors' `decode_sequence(strict=False)` for what the app reads: the events (subbeat step,
 * time stamp, chord) of the tokens after the prompt. Other fields are skipped.
 */
export function decodeEvents(tokens: readonly number[]): Ss2Event[] {
  const out = tokens.indexOf(L.out);
  if (out < 0) throw new Error('the sequence has no output marker');
  const events: Ss2Event[] = [];
  let pos = out + 1;
  let step = 0;
  while (pos < tokens.length) {
    if (tokens[pos] === L.eos) break;
    while (pos < tokens.length && inRange(tokens[pos]!, L.shift)) step += tokens[pos++]! - L.shift[0];
    const e: Ss2Event = { subbeat: step };
    let payload = 0;
    while (pos < tokens.length) {
      const t = tokens[pos]!;
      if (inRange(t, L.shift) || t === L.eos) break;
      payload++;
      if (inRange(t, L.time) && e.timestamp === undefined) e.timestamp = (t - L.time[0]) / L.timeHz;
      else if (inRange(t, L.chord) && e.chord === undefined) {
        e.chord = t - L.chord[0];
        e.chordToken = pos - out - 1;
      }
      pos++;
    }
    if (payload) events.push(e);
  }
  return events;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The authors' `event_time_map`: seconds in the window of a subbeat step. */
export function timeMap(events: readonly Ss2Event[], target: number): (step: number) => number {
  const byStep = new Map<number, number>();
  for (const e of events) if (e.timestamp !== undefined) byStep.set(e.subbeat, e.timestamp);
  const clip = (x: number) => Math.min(target, Math.max(0, x));
  if (!byStep.size) return (step) => clip(step * 0.125);
  const steps = [...byStep.keys()].sort((a, b) => a - b);
  const times = steps.map((s) => byStep.get(s)!);
  let stepSeconds = 0.125;
  if (steps.length >= 2) {
    const r: number[] = [];
    for (let i = 1; i < steps.length; i++) r.push((times[i]! - times[i - 1]!) / Math.max(steps[i]! - steps[i - 1]!, 1));
    const m = median(r);
    if (Number.isFinite(m) && m > 0) stepSeconds = m;
  }
  return (step) => {
    if (step <= steps[0]!) return clip(times[0]! + (step - steps[0]!) * stepSeconds);
    const n = steps.length - 1;
    if (step >= steps[n]!) return clip(times[n]! + (step - steps[n]!) * stepSeconds);
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (steps[mid]! <= step) lo = mid;
      else hi = mid;
    }
    const f = (step - steps[lo]!) / (steps[hi]! - steps[lo]!);
    return times[lo]! + f * (times[hi]! - times[lo]!);
  };
}

// ---------------------------------------------------------------------------- windows

export interface Ss2Window {
  start: number;
  /** The part of the piece this window's events are kept for, in seconds of the piece. */
  acceptStart: number;
  acceptEnd: number;
}

/** 300 s windows every 200 s, the last one ending with the piece; each keeps the middle of its overlaps. */
export function ss2Windows(duration: number): Ss2Window[] {
  const W = SS2_WINDOW_SECONDS;
  if (duration <= W) return [{ start: 0, acceptStart: 0, acceptEnd: duration }];
  const starts: number[] = [];
  for (let s = 0; ; s += 200) {
    if (s + W >= duration) {
      starts.push(Math.max(0, duration - W));
      break;
    }
    starts.push(s);
  }
  return starts.map((start, i) => ({
    start,
    acceptStart: i === 0 ? 0 : (start + starts[i - 1]! + W) / 2,
    acceptEnd: i === starts.length - 1 ? duration : (starts[i + 1]! + start + W) / 2,
  }));
}

// ---------------------------------------------------------------------------- running

/** A chord the model wrote: from `time` (seconds of the piece) until the next one. */
export interface Ss2Chord {
  time: number;
  label: number;
  /** Probabilities over SS2_LABELS at that point. */
  probs: Float32Array;
}

export interface Ss2Output {
  duration: number;
  chords: Ss2Chord[];
  /** Tokens generated per window (diagnostics). */
  tokens: number[][];
}

/** One graph of the manifest (`assets/sheetsage2/sheetsage2-manifest.json`). */
export interface Ss2GraphInfo {
  graph: string;
  bytes: number;
  sha256: string;
  slices: { file: 'mert' | 'ss2'; name: string; start: number; end: number }[];
  layers?: [number, number];
}

export interface Ss2Manifest {
  layersPerPart: number;
  parts: Ss2GraphInfo[];
  cross: Ss2GraphInfo;
  step: Ss2GraphInfo;
}

export interface Ss2Session {
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>;
  release(): Promise<void>;
}

/** What the engine needs from ONNX Runtime and the worker. */
export interface Ss2Runtime {
  Tensor: new (type: 'float32' | 'int64', data: Float32Array | BigInt64Array, dims: readonly number[]) => unknown;
  /** Creates the session of a graph of the manifest, its weights read from the authors' files. */
  open(info: Ss2GraphInfo): Promise<Ss2Session>;
}

/** Relative cost of the steps of one window, measured (4 threads, WASM): encoder part 0 is the heaviest. */
const COST = { mel: 0.03, parts: [0.17, 0.11, 0.11, 0.11, 0.11, 0.11], cross: 0.01, decode: 0.24 };
/** Tokens the decoder writes per second of music, measured on the bench (timestamps and chords). */
const TOKENS_PER_SECOND = 7;

function softmaxRange(logits: ArrayLike<number>, a: number, b: number): Float32Array {
  const out = new Float32Array(b - a);
  let m = -Infinity;
  for (let i = a; i < b; i++) m = Math.max(m, logits[i]!);
  let s = 0;
  for (let i = a; i < b; i++) s += out[i - a] = Math.exp(logits[i]! - m);
  for (let i = 0; i < out.length; i++) out[i]! /= s;
  return out;
}

/** Pieces of work of one window, of comparable length: each encoder part, then the decoder. */
export const ss2Units = (duration: number, manifest: Ss2Manifest): number => ss2Windows(duration).length * (manifest.parts.length + 1);

export interface Ss2Progress {
  /** The whole run, 0…1. */
  fraction: number;
  /** Pieces of work done and in all (`ss2Units`): for a steady progress between two of them. */
  done: number;
  total: number;
}

/**
 * SheetSage2 over the piece (`audio`: mono at 24 kHz). `onProgress` as the work goes;
 * `ctl.check()` between the pieces of work.
 */
export async function runSheetSage2(rt: Ss2Runtime, manifest: Ss2Manifest, front: MelFront, audio: Float32Array, ctl: RunControl, onProgress?: (p: Ss2Progress) => void): Promise<Ss2Output> {
  const duration = audio.length / SS2_RATE;
  const windows = ss2Windows(duration);
  const chords: Ss2Chord[] = [];
  const tokensOut: number[][] = [];
  const total = windows.length;
  const units = ss2Units(duration, manifest);
  let unitsDone = 0;
  const report = (w: number, f: number) => {
    const x = Math.min(1, (w + f) / total);
    ctl.progress(x);
    onProgress?.({ fraction: x, done: unitsDone, total: units });
  };
  const between = async () => {
    ctl.check();
    await ctl.yieldNow();
  };
  for (let w = 0; w < total; w++) {
    const win = windows[w]!;
    let done = 0;
    // 1. Mel frames of the window (silence after the end of the piece, as the authors pad).
    const seg = new Float32Array(SS2_WINDOW_SAMPLES);
    const from = Math.round(win.start * SS2_RATE);
    seg.set(audio.subarray(from, Math.min(audio.length, from + SS2_WINDOW_SAMPLES)));
    const mel = await melFrames(seg, front, between);
    done += COST.mel;
    report(w, done);
    // 2. Encoder, part after part.
    let feeds: Record<string, unknown> = { mel: new rt.Tensor('float32', mel, [1, SS2_MEL_FRAMES, SS2_MELS]) };
    let memory: TensorLike | null = null;
    for (let k = 0; k < manifest.parts.length; k++) {
      ctl.check();
      const s = await rt.open(manifest.parts[k]!);
      try {
        const r = await s.run(feeds);
        if (r['memory']) memory = r['memory'];
        else feeds = { hidden: r['hidden_out'], mixed: r['mixed_out'] };
      } finally {
        await s.release();
      }
      done += COST.parts[k] ?? COST.parts[1]!;
      unitsDone++;
      report(w, done);
      await between();
    }
    if (!memory || memory.dims[1] !== SS2_FRAMES || memory.dims[2] !== MEMORY_WIDTH) throw new Error('the SheetSage2 encoder gave no memory');
    feeds = {};
    // 3. Cross-attention keys and values, then the decoder.
    const cross = await rt.open(manifest.cross);
    let ckv: Record<string, TensorLike>;
    try {
      ckv = await cross.run({ memory });
    } finally {
      await cross.release();
    }
    memory = null;
    done += COST.cross;
    report(w, done);
    const step = await rt.open(manifest.step);
    const localStop = Math.min(SS2_WINDOW_SECONDS, win.acceptEnd - win.start);
    const expected = Math.max(64, TOKENS_PER_SECOND * localStop);
    const tokens: number[] = [...L.prefix];
    const chordProbs = new Map<number, Float32Array>();
    try {
      const grammar = new Grammar();
      let self: unknown[] = Array.from({ length: 2 * DEC_LAYERS }, () => new rt.Tensor('float32', new Float32Array(DEC_HEADS * HEAD_DIM), [1, DEC_HEADS, 1, HEAD_DIM]));
      let input: number[] = [...L.prefix];
      while (tokens.length < SS2_MAX_TOKENS) {
        const P = (self[0] as TensorLike).dims[2]!;
        const n = input.length;
        const at = tokens.length - n;
        // Causal mask over the new tokens; the first cache entry is a dummy, never attended to.
        const mask = new Float32Array(n * (P + n));
        for (let i = 0; i < n; i++) {
          mask[i * (P + n)] = -Infinity;
          for (let j = P + i + 1; j < P + n; j++) mask[i * (P + n) + j] = -Infinity;
        }
        const f: Record<string, unknown> = {
          ids: new rt.Tensor('int64', BigInt64Array.from(input, (t) => BigInt(t)), [1, n]),
          positions: new rt.Tensor('int64', BigInt64Array.from(input, (_, i) => BigInt(at + i)), [1, n]),
          mask: new rt.Tensor('float32', mask, [1, 1, n, P + n]),
        };
        for (let i = 0; i < DEC_LAYERS; i++) {
          f[`self_${i}_k`] = self[2 * i];
          f[`self_${i}_v`] = self[2 * i + 1];
          f[`cross_${i}_k`] = ckv[`cross_${i}_k`];
          f[`cross_${i}_v`] = ckv[`cross_${i}_v`];
        }
        const r = await step.run(f);
        self = [];
        for (let i = 0; i < DEC_LAYERS; i++) self.push(r[`new_self_${i}_k`], r[`new_self_${i}_v`]);
        const logits = r['logits']!.data;
        const t = bestAllowed(logits, grammar.ranges());
        if (inRange(t, L.chord)) chordProbs.set(tokens.length - L.prefix.length, softmaxRange(logits, L.chord[0], L.chord[1]));
        tokens.push(t);
        let finished = grammar.update(t);
        if (!finished && inRange(t, L.time) && (t - L.time[0]) / L.timeHz >= localStop) {
          tokens.push(L.eos);
          finished = true;
        }
        if (finished) break;
        input = [t];
        const generated = tokens.length - L.prefix.length;
        if (generated % 32 === 0) {
          report(w, done + COST.decode * Math.min(1, generated / expected));
          await between();
        }
      }
    } finally {
      await step.release();
    }
    if (tokens[tokens.length - 1] !== L.eos) tokens.push(L.eos);
    tokensOut.push(tokens);
    // 4. The chords of the part of the window kept, with the one sounding when it starts.
    const events = decodeEvents(tokens);
    const at = timeMap(events, SS2_WINDOW_SECONDS);
    let before: Ss2Chord | null = null;
    const kept: Ss2Chord[] = [];
    for (const e of events) {
      if (e.chord === undefined) continue;
      const time = Math.min(duration, Math.max(0, win.start + at(e.subbeat)));
      const probs = chordProbs.get(e.chordToken!) ?? oneHot(e.chord);
      const c = { time, label: e.chord, probs };
      if (time < win.acceptStart - 1e-4) before = c;
      else if (time < win.acceptEnd - 1e-4) kept.push(c);
    }
    if (before && (!kept.length || kept[0]!.time > win.acceptStart + 1e-4)) kept.unshift({ ...before, time: win.acceptStart });
    chords.push(...kept);
    unitsDone++;
    report(w, 1);
  }
  return { duration, chords, tokens: tokensOut };
}

function oneHot(label: number): Float32Array {
  const p = new Float32Array(SS2_CHORDS);
  p[label] = 1;
  return p;
}

// ---------------------------------------------------------------------------- evidence

/**
 * The model's chords as the engine's ChordFrames, 25 per second from time 0: each frame takes the
 * probabilities of the chord the model wrote last (no chord before the first one), folded onto the
 * app's 169 chords (inversions onto their chord); the bass from the inversions; the chord's notes
 * from the folded chords' templates. No `detail`: SheetSage2 names no extensions.
 */
export function sheetsage2ChordFrames(out: Ss2Output): ChordFrames {
  const T = Math.max(1, Math.ceil(out.duration * SS2_FPS));
  const probs = new Float32Array(T * N_CHORDS);
  const pitch = new Float32Array(T * 12);
  const bass = new Float32Array(T * 13);
  // Per distinct chord written, its rows once.
  const rows = out.chords.map((c) => folded(c.probs));
  let k = -1;
  for (let t = 0; t < T; t++) {
    const time = t / SS2_FPS;
    while (k + 1 < out.chords.length && out.chords[k + 1]!.time <= time + 1e-6) k++;
    if (k < 0) {
      probs[t * N_CHORDS + NO_CHORD] = 1;
      bass[t * 13 + 12] = 1;
      continue;
    }
    const r = rows[k]!;
    probs.set(r.probs, t * N_CHORDS);
    pitch.set(r.pitch, t * 12);
    bass.set(r.bass, t * 13);
  }
  return { T, fps: SS2_FPS, probs, pitch, bass };
}

function folded(p: Float32Array): { probs: Float32Array; pitch: Float32Array; bass: Float32Array } {
  const probs = new Float32Array(N_CHORDS);
  const pitch = new Float32Array(12);
  const bass = new Float32Array(13);
  for (let c = 0; c < p.length; c++) {
    const v = p[c]!;
    if (!v) continue;
    const app = SS2_TO_APP[c]!;
    probs[app]! += v;
    if (app === NO_CHORD) {
      bass[12]! += v;
      continue;
    }
    const root = Math.floor(app / 14);
    bass[(root + SS2_BASS[c]!) % 12]! += v;
    for (const pc of chordPcs(app)) pitch[pc]! += v;
  }
  return { probs, pitch, bass };
}

/** The label of a chord index, e.g. `G:7/b7` (diagnostics). */
export const ss2Label = (i: number): string => SS2_LABELS[i] ?? '?';
