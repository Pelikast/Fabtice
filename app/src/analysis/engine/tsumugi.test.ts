import { describe, expect, it } from 'vitest';
import { AnalysisError } from '../types';
import { N_CHORDS, NO_CHORD, QUALS } from './chords';
import type { RunControl, SessionLike, TensorLike } from './session';
import { runTsumugi, tsumugiAudio, tsumugiChordFrames, tsumugiInfo, tsumugiWindows, type TsumugiFrames } from './tsumugi';
import { TSUMUGI_LABELS, TSUMUGI_TO_APP } from './tsumugiVocab';

const ort = {
  Tensor: class {
    constructor(
      readonly type: string,
      readonly data: Float32Array,
      readonly dims: readonly number[],
    ) {}
  },
};

/** A stand-in for the graph: every output frame says which window and frame it is. */
function fakeSession(calls: Record<string, { dims: readonly number[]; data: Float32Array }>[]): SessionLike {
  return {
    inputNames: ['wave', 'beats', 'keys'],
    outputNames: ['detail', 'bass', 'root', 'tones', 'boundary'],
    async run(feeds) {
      calls.push(feeds as never);
      const n = calls.length;
      const make = (w: number): TensorLike => {
        const data = new Float32Array(750 * w);
        for (let f = 0; f < 750; f++) data[f * w] = n * 1000 + f;
        return { data, dims: [1, 750, w] };
      };
      return { detail: make(745), bass: make(13), root: make(13), tones: make(12), boundary: make(1) };
    },
  };
}

const ctl = (onCheck = () => {}): RunControl => ({ check: onCheck, progress() {}, yieldNow: () => Promise.resolve() });

describe('Tsumugi-Chords in the engine', () => {
  it('the vocabulary folds onto the app chords as the bench did', () => {
    expect(TSUMUGI_LABELS).toHaveLength(745);
    expect(TSUMUGI_TO_APP).toHaveLength(745);
    expect(TSUMUGI_LABELS[744]).toBe('N');
    expect(TSUMUGI_TO_APP[744]).toBe(NO_CHORD);
    // index 12 * quality + root: « A:7(9,13) » is A7 for the app
    const i = TSUMUGI_LABELS.indexOf('A:7(9,13)');
    expect(i % 12).toBe(9);
    expect(TSUMUGI_TO_APP[i]).toBe(9 * 14 + QUALS.indexOf('7'));
    expect(TSUMUGI_TO_APP[TSUMUGI_LABELS.indexOf('D:min7(9)')]).toBe(2 * 14 + QUALS.indexOf('min7'));
    expect(TSUMUGI_TO_APP.every((c) => c >= 0 && c < N_CHORDS)).toBe(true);
  });

  it('runs one window per 20 s kept, stitched in order, with cancellation between windows', async () => {
    const samples = 25_600 * 45; // 45 s: three windows (0-20, 20-40, 40-45 s)
    expect(tsumugiWindows(samples)).toBe(3);
    const left = new Float32Array(samples);
    const calls: Record<string, { dims: readonly number[]; data: Float32Array }>[] = [];
    const seen: [number, number][] = [];
    const out = await runTsumugi(ort, fakeSession(calls), left, left, tsumugiInfo([0, 0.5, 1, 1.5, 2], [1, 2, 3, 4, 1], { tonic: 7, minor: false }, 45), ctl(), (d, t) => seen.push([d, t]));
    expect(calls).toHaveLength(3);
    expect(calls[0]!.wave!.dims).toEqual([1, 2, 768_000]);
    expect(calls[0]!.beats!.dims).toEqual([1, 750, 11]);
    expect(calls[0]!.keys!.data[0 * 25 + 7]).toBe(1); // G major on every frame
    expect(seen).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    expect(out.frames).toBe(1125);
    // frame 0 from window 1, frame 500 from window 2 (which starts at frame 375), the last from window 3
    expect(out.detail[0]).toBe(1000);
    expect(out.detail[500 * 745]).toBe(2000 + 125);
    expect(out.detail[1124 * 745]).toBe(3000 + 1124 - 375);
    let n = 0;
    const stop = ctl(() => {
      if (++n === 2) throw new AnalysisError('cancelled');
    });
    await expect(runTsumugi(ort, fakeSession([]), left, left, null, stop)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('gives the decoder 169-chord frames with the model own notes and bass', () => {
    const T = 2;
    const f: TsumugiFrames = {
      frames: T,
      detail: new Float32Array(T * 745),
      bass: Float32Array.from({ length: T * 13 }, (_, i) => i),
      root: new Float32Array(T * 13),
      tones: Float32Array.from({ length: T * 12 }, (_, i) => i / 100),
      boundary: new Float32Array(T),
    };
    const a = TSUMUGI_LABELS.indexOf('C:7(9)');
    const b = TSUMUGI_LABELS.indexOf('C:7(13)');
    f.detail[a] = 0.3;
    f.detail[b] = 0.3;
    f.detail[744] = 0.4;
    const fr = tsumugiChordFrames(f);
    expect(fr.fps).toBe(25);
    expect(fr.probs[QUALS.indexOf('7')]).toBeCloseTo(0.6);
    expect(fr.probs[NO_CHORD]).toBeCloseTo(0.4);
    expect(fr.probs[N_CHORDS + NO_CHORD]).toBe(1); // an empty row is « no chord »
    expect([...fr.bass]).toEqual([...f.bass]);
    expect([...fr.pitch]).toEqual([...f.tones]);
  });

  it('feeds a mono piece on both channels, a stereo one as it is', () => {
    const l = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin(i / 10));
    const r = Float32Array.from({ length: 48_000 }, (_, i) => Math.cos(i / 10));
    const [ml, mr] = tsumugiAudio([l], 48_000);
    expect(mr).toBe(ml);
    expect(ml.length).toBe(25_600);
    const [sl, sr] = tsumugiAudio([l, r], 48_000);
    expect(sr).not.toBe(sl);
  });

  it('takes downbeats from the beat numbers and the key in its own names', () => {
    const info = tsumugiInfo([0, 1, 2, 3, 4], [3, 1, 2, 3, 1], { tonic: 10, minor: true }, 5);
    expect(info.downbeats).toEqual([1, 4]);
    expect(info.keys).toEqual([{ start: 0, end: 6, key: 'A#:minor' }]);
    expect(tsumugiInfo([0, 1], [1, 2], null, 2).keys).toEqual([]);
  });
});
