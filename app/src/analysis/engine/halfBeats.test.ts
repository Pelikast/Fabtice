// 1.0.3: the analysis' second look inside each beat (`halfBeats.ts`), on evidence built by hand:
// what it writes between two beats, and — more important — what it does not.

import { describe, expect, it } from 'vitest';
import { analyseChart } from './chart';
import { NO_CHORD, N_CHORDS, type ChordFrames } from './chords';
import { findHalfBeats } from './halfBeats';
import { beatSegments } from './pipeline';
import { toAnalysisResult, withHalfBeats } from './result';
import type { ChordSegment } from './decode';
import type { AnalysedChord } from '../../model/analysis';

const FPS = 25;
const C = (root: number, qual = 6) => root * 14 + qual; // quality 6: « 7 »; 7: maj7; 8: min7

/** Frames where the chord of each half beat is clearly heard (`p` for it, the rest spread). `halves`: one chord per half beat. */
function framesOf(halves: readonly number[], beatSeconds: number, p = 0.85): ChordFrames {
  const T = Math.ceil(halves.length * (beatSeconds / 2) * FPS) + 2;
  const probs = new Float32Array(T * N_CHORDS);
  for (let f = 0; f < T; f++) {
    const k = Math.min(halves.length - 1, Math.floor(((f + 0.001) / FPS) / (beatSeconds / 2)));
    const chord = halves[k]!;
    for (let c = 0; c < N_CHORDS; c++) probs[f * N_CHORDS + c] = (1 - p) / (N_CHORDS - 1);
    probs[f * N_CHORDS + chord] = p;
  }
  return { T, fps: FPS, probs, pitch: new Float32Array(T * 12), bass: new Float32Array(T * 13) };
}

const beatsOf = (n: number, beatSeconds: number) => Array.from({ length: n }, (_, i) => i * beatSeconds);

describe('chords between two beats', () => {
  const beat = 0.6; // 100 beats a minute

  it('a passing chord on the « et » of a beat is found, with the time of the middle of the beat', () => {
    // | C7 . F7 . | with B7 on the « et » of beat 1, and Bb7 on the « et » of beat 3.
    const halves = [C(0), C(11), C(0), C(0), C(5), C(10), C(5), C(5)];
    const path = [C(0), C(0), C(5), C(5)];
    const found = findHalfBeats(framesOf(halves, beat), 1, beatSegments(beatsOf(4, beat)), path);
    expect(found.map((h) => [h.beat, h.half, h.chord])).toEqual([
      [0, 'second', C(11)],
      [2, 'second', C(10)],
    ]);
    expect(found[0]!.time).toBeCloseTo(0.3, 9);
    expect(found[0]!.p).toBeGreaterThan(0.8);
  });

  it('a chord that only comes half a beat early, or leaves half a beat late, is not written', () => {
    // F7 comes on the « et » of beat 2 (anticipated), the decoder reads it on beat 3.
    const early = [C(0), C(0), C(0), C(5), C(5), C(5), C(5), C(5)];
    expect(findHalfBeats(framesOf(early, beat), 1, beatSegments(beatsOf(4, beat)), [C(0), C(0), C(5), C(5)])).toEqual([]);
    // C7 still sounds on the first half of beat 3, where the decoder already reads F7.
    const late = [C(0), C(0), C(0), C(0), C(0), C(5), C(5), C(5)];
    expect(findHalfBeats(framesOf(late, beat), 1, beatSegments(beatsOf(4, beat)), [C(0), C(0), C(5), C(5)])).toEqual([]);
    // The same root in another colour (F7 heard as Fmaj7 for half a beat) is the same chord for a chart.
    const colour = [C(5), C(5, 7), C(5), C(5), C(5), C(5), C(5), C(5)];
    expect(findHalfBeats(framesOf(colour, beat), 1, beatSegments(beatsOf(4, beat)), [C(5), C(5), C(5), C(5)])).toEqual([]);
  });

  it('a chord on the beat that gives way to the decoded one at its middle is found too', () => {
    // Beat 2: E7 for half a beat, then the A7 the decoder read; the beat before was D7.
    const halves = [C(2), C(2), C(4), C(9), C(9), C(9), C(9), C(9)];
    const found = findHalfBeats(framesOf(halves, beat), 1, beatSegments(beatsOf(4, beat)), [C(2), C(9), C(9), C(9)]);
    expect(found.map((h) => [h.beat, h.half, h.chord])).toEqual([[1, 'first', C(4)]]);
  });

  it('nothing is decided when the evidence is weak, the tempo fast, or there is no chord', () => {
    const halves = [C(0), C(11), C(0), C(0), C(5), C(5), C(5), C(5)];
    const path = [C(0), C(0), C(5), C(5)];
    // Weak: the passing chord barely above the rest.
    expect(findHalfBeats(framesOf(halves, beat, 0.3), 1, beatSegments(beatsOf(4, beat)), path)).toEqual([]);
    // Fast: 240 beats a minute, a half beat lasts an eighth of a second.
    expect(findHalfBeats(framesOf(halves, 0.25), 1, beatSegments(beatsOf(4, 0.25)), path)).toEqual([]);
    // A slow network (a frame every 0.2 s): a half beat holds fewer than three frames.
    const slow = framesOf(halves, beat);
    expect(findHalfBeats({ ...slow, fps: 5, T: Math.floor(slow.T / 5) }, 1, beatSegments(beatsOf(4, beat)), path)).toEqual([]);
    // « No chord » on the beat, or as the other half: nothing.
    expect(findHalfBeats(framesOf(halves, beat), 1, beatSegments(beatsOf(4, beat)), [NO_CHORD, C(0), C(5), C(5)])).toEqual([]);
    const silent = [C(0), NO_CHORD, C(0), C(0), C(5), C(5), C(5), C(5)];
    expect(findHalfBeats(framesOf(silent, beat), 1, beatSegments(beatsOf(4, beat)), path)).toEqual([]);
  });

  it('a chart with a chord per beat or per bar is left exactly as it was', () => {
    const halves = [C(0), C(0), C(9, 8), C(9, 8), C(2, 8), C(2, 8), C(7), C(7)];
    expect(findHalfBeats(framesOf(halves, beat), 1, beatSegments(beatsOf(4, beat)), [C(0), C(9, 8), C(2, 8), C(7)])).toEqual([]);
  });
});

describe('the chart with its half beats', () => {
  const seg = (chord: number, beats: number[], t0: number, t1: number): ChordSegment => ({ chord, beats, t0, t1, posterior: 0.9, confidence: 0.8, alternatives: [], pitch: [], extensions: [], bass: null });
  const an = (time: number): AnalysedChord => ({ time, chord: null, confidence: 0.8, doubtful: false, alternatives: [] });
  const beats = [0, 1, 2, 3, 4, 5, 6, 7];

  it('second half: the other chord at the middle, then the beat’s own chord again when it goes on', () => {
    const segments = [seg(C(0), [0, 1, 2, 3], 0, 4), seg(C(5), [4, 5, 6, 7], 4, 8)];
    const out = withHalfBeats([an(0), an(4)], segments, [{ beat: 1, half: 'second', time: 1.5, chord: C(11), p: 0.9 }], beats);
    expect(out.map((c) => c.time)).toEqual([0, 1.5, 2, 4]);
    expect(out[1]!.chord).toEqual({ root: 11, quality: '7', extensions: [], bass: null });
    expect(out[1]!.doubtful).toBe(false);
    // On the last beat of its segment the next segment follows: no reminder needed.
    const end = withHalfBeats([an(0), an(4)], segments, [{ beat: 3, half: 'second', time: 3.5, chord: C(11), p: 0.4 }], beats);
    expect(end.map((c) => c.time)).toEqual([0, 3.5, 4]);
    expect(end[1]!.doubtful).toBe(true);
  });

  it('first half: the other chord on the beat, the beat’s own chord from the middle', () => {
    const segments = [seg(C(0), [0, 1, 2, 3], 0, 4), seg(C(5), [4, 5, 6, 7], 4, 8)];
    // Inside a segment: C7 … | E7 (half) C7 …
    const inside = withHalfBeats([an(0), an(4)], segments, [{ beat: 2, half: 'first', time: 2.5, chord: C(4), p: 0.9 }], beats);
    expect(inside.map((c) => c.time)).toEqual([0, 2, 2.5, 4]);
    // At the start of a segment: its chord moves to the middle of the beat.
    const start = withHalfBeats([an(0), an(4)], segments, [{ beat: 4, half: 'first', time: 4.5, chord: C(4), p: 0.9 }], beats);
    expect(start.map((c) => c.time)).toEqual([0, 4, 4.5]);
    expect(start[1]!.chord?.root).toBe(4);
  });

  it('two split beats in a row do not write two chords on the same place', () => {
    const segments = [seg(C(0), [0, 1, 2, 3], 0, 4)];
    const out = withHalfBeats([an(0)], segments, [
      { beat: 1, half: 'second', time: 1.5, chord: C(11), p: 0.9 },
      { beat: 2, half: 'first', time: 2.5, chord: C(4), p: 0.9 },
    ], beats);
    expect(out.map((c) => c.time)).toEqual([0, 1.5, 2, 2.5]);
    expect(new Set(out.map((c) => c.time)).size).toBe(out.length);
  });

  it('nothing found: the chords are the segments’, untouched', () => {
    const chords = [an(0), an(4)];
    expect(withHalfBeats(chords, [seg(C(0), [0, 1, 2, 3], 0, 4), seg(C(5), [4, 5, 6, 7], 4, 8)], [], beats)).toEqual(chords);
  });
});

describe('the whole chord analysis', () => {
  const beat = 0.6;
  // Two bars of C7 with B7 on the « et » of beat 2 of the first, then two bars of F7.
  const halves = [...[C(0), C(0), C(0), C(11), C(0), C(0), C(0), C(0)], ...new Array<number>(8).fill(C(0)), ...new Array<number>(16).fill(C(5))];
  const grid = { beats: beatsOf(16, beat), numbers: Array.from({ length: 16 }, (_, i) => (i % 4) + 1), beatsPerBar: 4 };
  const input = { frames: framesOf(halves, beat), timeScale: 1, grid, cents: 0, fixedKey: { tonic: 5, minor: false } };

  it('writes one chord per beat at most unless asked', () => {
    const run = analyseChart(input);
    expect(run.halves).toEqual([]);
    expect(run.segments.map((s) => s.chord)).toEqual([C(0), C(5)]);
  });

  it('asked, writes the passing chord between two beats and leaves the rest as it was', () => {
    const plain = analyseChart(input);
    const run = analyseChart({ ...input, settings: { halfBeats: {} } });
    expect(run.segments).toEqual(plain.segments);
    expect(run.halves.map((h) => [h.beat, h.half, h.chord])).toEqual([[1, 'second', C(11)]]);
    const result = toAnalysisResult({ grid, meterScores: [], gridIsHint: true, key: run.key, keyIsHint: true, tuning: { cents: 0, refHz: 440, confidence: 0, peaks: 0 }, segments: run.segments, duration: 16 * beat, models: [], reliability: run.reliability, halves: run.halves });
    expect(result.chords.map((c) => [Number(c.time.toFixed(3)), c.chord?.root])).toEqual([
      [0, 0],
      [0.9, 11],
      [1.2, 0],
      [4.8, 5],
    ]);
  });
});
