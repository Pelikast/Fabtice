// The optional fine chord model, Tsumugi-Chords (anime-song, 2026; code MIT, weights
// CC BY-NC 4.0): from the stereo piece and the beats / downbeats / key the app found, the
// model's 25 Hz chord evidence as the engine's ChordFrames, which then go through the same
// decoding as CREMA's (`analyse.ts#resultFromOutputs`: bass band, repeats, known chart,
// reliability). Measured on the bench (web/spikes/accords/modeles/RECHERCHE.md, variant
// `modele-a`, then `app-fin`): colour per beat 67 → 88 % on clean synthetic jazz, 55 → 79 % on
// the old-record versions, 84 → 79 % on clean solo guitar.
//
// The graph (`tsumugi-chords.graph.onnx`, shipped with the app, no weights in it) reads the
// author's own `chord-model.safetensors` as ONNX external data: the session is created with
// `externalData: [{ path: TSUMUGI_WEIGHTS_LOCATION, data }]`.

import type { ChordFrames } from './chords';
import { N_CHORDS, NO_CHORD } from './chords';
import type { OrtLike, RunControl, SessionLike } from './session';
import {
  BEAT_FEATURES,
  FRAME_RATE,
  KEY_FEATURES,
  WINDOW_FRAMES,
  WINDOW_SAMPLES,
  beatFeatures,
  keyFeatures,
  keyName,
  resampleTo25600,
  stitch,
  windowPlan,
  windowWave,
  type KeySpan,
} from './tsumugiFeatures';
import { TSUMUGI_TO_APP } from './tsumugiVocab';

/** The name the graph gives its external weight file. */
export const TSUMUGI_WEIGHTS_LOCATION = 'chord-model.safetensors';

export interface TsumugiInfo {
  beats: readonly number[];
  downbeats: readonly number[];
  keys: readonly KeySpan[];
}

/** The model's raw outputs over the whole song, at 25 frames per second. */
export interface TsumugiFrames {
  frames: number;
  /** frames × 745: index 12 * quality + root, « no chord » last (softmax). */
  detail: Float32Array;
  /** frames × 13: C…B, none (softmax). */
  bass: Float32Array;
  /** frames × 13 (softmax). */
  root: Float32Array;
  /** frames × 12: the chord's notes (sigmoid). */
  tones: Float32Array;
  /** frames: chord changes (sigmoid). */
  boundary: Float32Array;
}

const WIDTH = { detail: 745, bass: 13, root: 13, tones: 12, boundary: 1 } as const;

/** Beats, downbeats and key of the app's own analysis (or the user's) as the model's inputs. */
export function tsumugiInfo(beats: readonly number[], numbers: readonly number[], key: { tonic: number; minor: boolean } | null, duration: number): TsumugiInfo {
  return {
    beats,
    downbeats: beats.filter((_, i) => numbers[i] === 1),
    keys: key ? [{ start: 0, end: duration + 1, key: keyName(key.tonic, key.minor ? 'minor' : 'major') }] : [],
  };
}

/** Both channels at the model's rate (a mono piece is fed on both, as the author does). */
export function tsumugiAudio(channels: readonly Float32Array[], sampleRate: number): [Float32Array, Float32Array] {
  const left = resampleTo25600(channels[0]!, sampleRate);
  const right = channels.length > 1 && channels[1] !== channels[0] ? resampleTo25600(channels[1]!, sampleRate) : left;
  return [left, right];
}

/** Number of 30 s windows the model runs for a piece of `samples` samples at 25.6 kHz. */
export function tsumugiWindows(samples: number): number {
  return windowPlan(samples).windows.length;
}

/**
 * Runs the model window by window (30 s, the middle 20 s kept). `onWindow(done, total)` after
 * each; `ctl.check()` between windows (cancellation); nothing is kept between windows but
 * the stitched outputs.
 */
export async function runTsumugi(
  ort: OrtLike,
  session: SessionLike,
  left: Float32Array,
  right: Float32Array,
  info: TsumugiInfo | null,
  ctl: RunControl,
  onWindow?: (done: number, total: number) => void,
): Promise<TsumugiFrames> {
  const { frames, windows } = windowPlan(left.length);
  const out = {
    detail: new Float32Array(frames * 745),
    bass: new Float32Array(frames * 13),
    root: new Float32Array(frames * 13),
    tones: new Float32Array(frames * 12),
    boundary: new Float32Array(frames),
  };
  onWindow?.(0, windows.length);
  for (let i = 0; i < windows.length; i++) {
    ctl.check();
    const w = windows[i]!;
    const start = w.start / FRAME_RATE;
    const beats = info ? beatFeatures(info.beats, info.downbeats, start) : new Float32Array(WINDOW_FRAMES * BEAT_FEATURES);
    const keys = info ? keyFeatures(info.keys, start) : new Float32Array(WINDOW_FRAMES * KEY_FEATURES);
    const r = await session.run({
      wave: new ort.Tensor('float32', windowWave(left, right, w), [1, 2, WINDOW_SAMPLES]),
      beats: new ort.Tensor('float32', beats, [1, WINDOW_FRAMES, BEAT_FEATURES]),
      keys: new ort.Tensor('float32', keys, [1, WINDOW_FRAMES, KEY_FEATURES]),
    });
    for (const k of Object.keys(WIDTH) as (keyof typeof WIDTH)[]) {
      const t = r[k];
      if (!t) throw new Error(`the chord model gave no ${k}`);
      stitch(out[k], Float32Array.from(t.data), w, WIDTH[k]);
    }
    ctl.progress((i + 1) / windows.length);
    onWindow?.(i + 1, windows.length);
    await ctl.yieldNow();
  }
  return { frames, ...out };
}

/**
 * The model's evidence as the engine's ChordFrames: the 745 classes summed onto the app's
 * 169 chords (extensions folded into their chord), the model's own notes, bass and classes. 25 frames
 * per second from time 0 of the piece: the decoding takes it with `timeScale` 1 (the model
 * needs no tuning correction).
 */
export function tsumugiChordFrames(f: TsumugiFrames): ChordFrames {
  const T = f.frames;
  const probs = new Float32Array(T * N_CHORDS);
  for (let t = 0; t < T; t++) {
    const row = t * N_CHORDS;
    let s = 0;
    for (let c = 0; c < 745; c++) {
      const v = f.detail[t * 745 + c]!;
      probs[row + TSUMUGI_TO_APP[c]!]! += v;
      s += v;
    }
    if (s > 0) for (let c = 0; c < N_CHORDS; c++) probs[row + c]! /= s;
    else probs[row + NO_CHORD] = 1;
  }
  // Its own 745 classes go along: the chord found takes the extensions of the model's best
  // class among those that fold onto it (1.0.1, `fineExtensions`).
  return { T, fps: FRAME_RATE, probs, pitch: f.tones.slice(), bass: f.bass.slice(), detail: f.detail.slice() };
}

