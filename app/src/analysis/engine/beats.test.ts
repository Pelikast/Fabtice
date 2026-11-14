// Beat peaks, chunking and meter against the prototype's own values, plus the
// network steps run on a scripted session (no ONNX Runtime in unit tests).

import { describe, expect, it } from 'vitest';
import { BT, beatDownProb, beatLogits, chunkStarts, logMel, pickPeaks, postMinimal, refinePeak, sigmoid, type LogMel } from './beats';
import { firstDownbeat, makeGrid, renumber } from './grid';
import { inferMeter } from './meter';
import { noControl, type OrtLike, type SessionLike, type TensorLike } from './session';
import { beatActivations, downProbs } from './fixtures/inputs.mjs';
import values from './fixtures/prototype-values.json';

describe('beat peaks', () => {
  const act = beatActivations(1000, 25);

  it('finds the prototype\'s beats and downbeats', () => {
    const m = postMinimal(act);
    expect(m.beats.length).toBe(values.beats.beats.length);
    m.beats.forEach((b, i) => expect(b).toBeCloseTo(values.beats.beats[i]!, 12));
    expect(m.downbeatIdx).toEqual(values.beats.downbeatIdx);
  });

  it('refines a peak to a fraction of a frame like the prototype', () => {
    [3, 28, 53].forEach((f, i) => expect(refinePeak(act.beat, f)).toBeCloseTo(values.beats.refined[i]!, 12));
  });

  it('gives the prototype\'s downbeat probability at each beat', () => {
    const p = beatDownProb(act, postMinimal(act).beats);
    p.forEach((v, i) => expect(v).toBeCloseTo(values.beats.downProb[i]!, 12));
  });

  it('picks local maxima above zero (a peak is the highest within 3 frames either side)', () => {
    // 5 is a peak; 1 too (a tie with 2 is no defeat) but not 2, beaten by 4 at 5; 10 beats 9; the negative hump is ignored.
    expect(pickPeaks([0, 2, 2, -1, -3, 4, -2, -1, -5, 1, 3, -1, -2])).toEqual([1, 5, 10]);
  });

  it('merges adjacent peaks into their middle', () => {
    expect(pickPeaks([0, 3, 3, 0, 0, 0, 0, 0, -1, 2, 0, 0, 0, 0])).toEqual([1.5, 9]);
  });

  it('does not refine at the edges or on a flat top', () => {
    expect(refinePeak([1, 2, 3], 0)).toBe(0);
    expect(refinePeak([1, 2, 3], 2)).toBe(2);
    expect(refinePeak([0, 1, 1, 1, 0], 2)).toBe(2);
  });

  it('has a sigmoid in 0…1', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(40)).toBeCloseTo(1, 12);
    expect(sigmoid(-40)).toBeCloseTo(0, 12);
  });
});

describe('chunks of the beat network', () => {
  it('cuts the piece as the prototype does', () => {
    for (const [T, starts] of Object.entries(values.chunkStarts)) expect(chunkStarts(Number(T))).toEqual(starts);
  });

  it('covers every frame', () => {
    for (const T of [1, 100, 1488, 1489, 5000, 12345]) {
      const starts = chunkStarts(T);
      const covered = new Uint8Array(T);
      for (const s of starts) for (let t = Math.max(0, s + BT.border); t < Math.min(T, s + BT.chunk - BT.border); t++) covered[t] = 1;
      expect(covered.every((v) => v === 1)).toBe(true);
    }
  });
});

describe('meter', () => {
  type Meter = { beatsPerBar: number; numbers: number[]; scores: { meter: number; prob: number }[] };
  const compare = (got: ReturnType<typeof inferMeter>, want: Meter) => {
    expect(got.beatsPerBar).toBe(want.beatsPerBar);
    expect(got.numbers).toEqual(want.numbers);
    expect(got.scores.length).toBe(want.scores.length);
    got.scores.forEach((s, i) => {
      expect(s.meter).toBe(want.scores[i]!.meter);
      expect(s.prob).toBeCloseTo(want.scores[i]!.prob, 9);
    });
  };

  it('finds 4 beats and the phase, like the prototype', () => compare(inferMeter(downProbs(40, 4, 1), { candidates: [3, 4] }), values.meter.four));
  it('finds 3 beats, like the prototype', () => compare(inferMeter(downProbs(45, 3, 2), { candidates: [3, 4] }), values.meter.three));
  it('chooses among 2…7 by default, like the prototype', () => compare(inferMeter(downProbs(48, 4, 0, 11)), values.meter.wide));
  it('numbers a very short piece in 4', () => compare(inferMeter([0.9, 0.1, 0.1]), values.meter.short));

  it('counts from the first downbeat', () => {
    const m = inferMeter(downProbs(40, 4, 1), { candidates: [3, 4] });
    expect(m.numbers.slice(0, 6)).toEqual([4, 1, 2, 3, 4, 1]);
    expect(firstDownbeat(makeGrid(m.numbers.map((_, i) => i), m.numbers, 4))).toBe(1);
  });
});

describe('grid', () => {
  it('numbers beats from a chosen downbeat, before it too', () => {
    expect(renumber([0, 1, 2, 3, 4, 5, 6], 4, 2)).toEqual([3, 4, 1, 2, 3, 4, 1]);
    expect(renumber([0, 1, 2, 3], 3, 0)).toEqual([1, 2, 3, 1]);
  });
  it('copies what it is given', () => {
    const beats = [0, 0.5];
    const g = makeGrid(beats, [1, 2], 2);
    beats[0] = 9;
    expect(g.beats[0]).toBe(0);
    expect(firstDownbeat({ beats: [0, 1], numbers: [2, 2], beatsPerBar: 2 })).toBe(0);
  });
});

// ---------------------------------------------------------------- scripted sessions

class FakeTensor {
  constructor(public readonly type: string, public readonly data: Float32Array, public readonly dims: readonly number[]) {}
}
const ort: OrtLike = { Tensor: FakeTensor as unknown as OrtLike['Tensor'] };

describe('log-mel in segments', () => {
  it('runs the graph on 60 s segments with two frames of context and stitches the frames', async () => {
    const runs: { length: number }[] = [];
    // A fake graph that gives each hop's index as its "mel": frames = floor(n / hop) + 1, every value the frame number.
    const session: SessionLike = {
      inputNames: ['audio'],
      outputNames: ['mel'],
      async run(feeds) {
        const audio = (feeds.audio as FakeTensor).data;
        runs.push({ length: audio.length });
        const frames = Math.floor(audio.length / BT.hop) + 1;
        const data = new Float32Array(frames * 128);
        // The first sample of the segment carries its absolute position, so each frame can be numbered.
        const base = Math.round(audio[0]! / BT.hop);
        for (let f = 0; f < frames; f++) data.fill(base + f, f * 128, (f + 1) * 128);
        return { mel: { data, dims: [frames, 128] } as TensorLike };
      },
    };
    const n = BT.hop * 7000; // 7001 frames: three segments
    const audio = Float32Array.from({ length: n }, (_, i) => i);
    const mel = await logMel(ort, session, audio, noControl);
    expect(mel.frames).toBe(7001);
    expect(runs.length).toBe(3);
    for (let f = 0; f < mel.frames; f += 500) expect(mel.data[f * 128]).toBe(f);
    expect(mel.data[7000 * 128 + 127]).toBe(7000);
  });
});

describe('beat network in chunks', () => {
  it('runs 30 s chunks, drops the borders and lets earlier chunks win', async () => {
    const T = 4000;
    const mel: LogMel = { data: new Float32Array(T * 128), frames: T };
    // Each chunk is told apart by the first mel value of what it is given (frame number in column 0).
    for (let f = 0; f < T; f++) mel.data[f * 128] = f;
    const seen: number[] = [];
    const session: SessionLike = {
      inputNames: ['x'],
      outputNames: ['beat', 'down'],
      async run(feeds) {
        const x = feeds.x as FakeTensor;
        const len = x.dims[1]!;
        seen.push(len);
        const beat = new Float32Array(len).fill(seen.length); // chunk number
        const down = new Float32Array(len).fill(-seen.length);
        return { beat: { data: beat, dims: [1, len] }, down: { data: down, dims: [1, len] } };
      },
    };
    const progress: number[] = [];
    const act = await beatLogits(ort, session, mel, { ...noControl, progress: (p) => progress.push(p) });
    expect(act.frames).toBe(T);
    expect(act.fps).toBe(50);
    expect(act.beat.length).toBe(T);
    expect(seen.length).toBe(chunkStarts(T).length);
    expect(progress[progress.length - 1]).toBe(1);
    // Frame 0 comes from chunk 1 (earlier chunks overwrite later ones), the last frame from the last chunk.
    expect(act.beat[0]).toBe(1);
    expect(act.beat[T - 1]).toBe(seen.length);
    expect(act.down[0]).toBe(-1);
    expect(Array.from(act.beat).every((v) => v > 0)).toBe(true);
  });

  it('stops when the analysis is cancelled', async () => {
    const mel: LogMel = { data: new Float32Array(3000 * 128), frames: 3000 };
    let runs = 0;
    const session: SessionLike = {
      inputNames: ['x'],
      outputNames: ['beat', 'down'],
      async run(feeds) {
        runs++;
        const len = (feeds.x as FakeTensor).dims[1]!;
        return { beat: { data: new Float32Array(len), dims: [1, len] }, down: { data: new Float32Array(len), dims: [1, len] } };
      },
    };
    let stop = false;
    const ctl = {
      ...noControl,
      check() {
        if (stop) throw new Error('cancelled');
      },
      progress() {
        stop = true;
      },
    };
    await expect(beatLogits(ort, session, mel, ctl)).rejects.toThrow('cancelled');
    expect(runs).toBe(1);
  });
});
