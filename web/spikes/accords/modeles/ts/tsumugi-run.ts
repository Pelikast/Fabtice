// Running the Tsumugi-Chords graph over a whole song, independent of the decoder: from the
// stereo audio at 25.6 kHz and the app's beats / downbeats / key to the 25 Hz outputs.
// The session is any onnxruntime-web InferenceSession created on the weight-free graph with
// `externalData: [{ path: 'chord-model.safetensors', data: <the author's file> }]`.

import {
  BEAT_FEATURES,
  FRAME_RATE,
  KEY_FEATURES,
  WINDOW_FRAMES,
  WINDOW_SAMPLES,
  beatFeatures,
  keyFeatures,
  stitch,
  windowPlan,
  windowWave,
  type KeySpan,
} from './tsumugi-features.ts';

export interface TensorCtor {
  new (type: 'float32', data: Float32Array, dims: readonly number[]): unknown;
}
export interface SessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>;
}

export interface TsumugiInfo {
  beats: readonly number[];
  downbeats: readonly number[];
  keys: readonly KeySpan[];
}

export interface TsumugiFrames {
  frames: number;
  fps: number;
  detail: Float32Array; // frames x 745: 12 * quality + root, N last
  bass: Float32Array; // frames x 13: C..B, none
  root: Float32Array; // frames x 13
  tones: Float32Array; // frames x 12
  boundary: Float32Array; // frames
}

const WIDTH = { detail: 745, bass: 13, root: 13, tones: 12, boundary: 1 } as const;

/** `info` null: no beats nor key (the model then reads zeros, as the author's code does). */
export async function runTsumugi(
  Tensor: TensorCtor,
  session: SessionLike,
  left: Float32Array,
  right: Float32Array,
  info: TsumugiInfo | null,
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
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const start = w.start / FRAME_RATE;
    const beats = info ? beatFeatures(info.beats, info.downbeats, start) : new Float32Array(WINDOW_FRAMES * BEAT_FEATURES);
    const keys = info ? keyFeatures(info.keys, start) : new Float32Array(WINDOW_FRAMES * KEY_FEATURES);
    const r = await session.run({
      wave: new Tensor('float32', windowWave(left, right, w), [1, 2, WINDOW_SAMPLES]),
      beats: new Tensor('float32', beats, [1, WINDOW_FRAMES, BEAT_FEATURES]),
      keys: new Tensor('float32', keys, [1, WINDOW_FRAMES, KEY_FEATURES]),
    });
    for (const k of Object.keys(WIDTH) as (keyof typeof WIDTH)[]) stitch(out[k], r[k]!.data as Float32Array, w, WIDTH[k]);
    onWindow?.(i + 1, windows.length);
  }
  return { frames, fps: FRAME_RATE, ...out };
}
