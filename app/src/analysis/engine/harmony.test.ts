// The chord decoding, the key and the whole « decode on a grid » step against
// the prototype's own values (see `fixtures/make-fixtures.mjs`), then the
// mapping of the engine's output to the app's `AnalysisResult`.

import { describe, expect, it } from 'vitest';
import { CREMA_LABELS, NO_CHORD, N_CHORDS, QUALS, chordPcs, chordQual, chordRoot, harteLabel, poolSegments } from './chords';
import { buildSegments, changeProb, decodeChords, keyFit, motionScore } from './decode';
import { estimateKey } from './key';
import { chartFromGrid, gridFromHint } from './pipeline';
import { DOUBT, symbolOf, toAnalysisResult, type ResultInput } from './result';
import { chordFrames, steadyGrid } from './fixtures/inputs.mjs';
import values from './fixtures/prototype-values.json';
import { CHORD_QUALITIES } from '../../model/harmony';
import { ANALYSIS_RESULT_VERSION } from '../../model/analysis';

const close = (a: ArrayLike<number>, b: readonly number[], digits = 9) => {
  expect(a.length).toBe(b.length);
  b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, digits));
};

describe('chord vocabulary', () => {
  it('has the 170 labels CREMA sorts, our 169 chords and the Harte names', () => {
    expect(CREMA_LABELS.length).toBe(170);
    expect(CREMA_LABELS[0]).toBe('A#:7');
    expect(CREMA_LABELS).toContain('N');
    expect(CREMA_LABELS).toContain('X');
    expect(N_CHORDS).toBe(169);
    expect(harteLabel(0)).toBe('C:maj');
    expect(harteLabel(2 * 14 + 8)).toBe('D:min7');
    expect(harteLabel(NO_CHORD)).toBe('N');
    expect(chordRoot(NO_CHORD)).toBe(-1);
    expect(chordQual(7)).toBe('maj7');
    expect(chordPcs(7 * 14 + 6)).toEqual([7, 11, 2, 5]);
    expect(chordPcs(NO_CHORD)).toEqual([]);
  });

  it('uses qualities the app names the same way', () => {
    for (const q of QUALS) expect(CHORD_QUALITIES).toContain(q);
  });
});

describe('harmony prior', () => {
  it('scores root motions as the prototype does', () => {
    for (const { a, b, score } of values.motion) expect(motionScore(a, b)).toBeCloseTo(score, 12);
  });
  it('fits chords to keys as the prototype does', () => {
    for (const { c, tonic, minor, fit } of values.keyFit) expect(keyFit(c, tonic, minor)).toBe(fit);
  });
  it('lets chords change on the bar start and half bar, like the prototype', () => {
    for (const { n, b, p } of values.changeProb) expect(changeProb(n, b)).toBe(p);
  });
});

describe('decoding a progression', () => {
  const bars = values.framesSpec.bars;
  const frames = chordFrames(values.progression, { bars });
  const grid = steadyGrid(bars * 4 + 1, 4);
  const segs = grid.beats.map((t, i) => [t, grid.beats[i + 1] ?? t + 0.5] as [number, number]);
  const units = poolSegments(frames, segs, 1);

  it('pools the frames of each beat as the prototype does', () => {
    const u = units[0]!;
    expect(u.t0).toBe(values.pool.first.t0);
    expect(u.t1).toBe(values.pool.first.t1);
    expect(u.frames).toBe(values.pool.first.frames);
    close(u.logp.slice(0, 6), values.pool.first.logp, 9);
    close(u.pitch, values.pool.first.pitch, 9);
    close(u.bass, values.pool.first.bass, 9);
    expect(units.map((x) => x.frames)).toEqual(values.pool.frames);
  });

  it('follows the prototype through Viterbi, with a key and without', () => {
    const withKey = decodeChords(units, grid.numbers, 4, { tonic: 0, minor: false });
    expect(withKey.path).toEqual(values.decode.path);
    withKey.post.forEach((p, i) => expect(Math.max(...p)).toBeCloseTo(values.decode.postMax[i]!, 8));
    expect(decodeChords(units, grid.numbers, 4, null, { kappa: 0 }).path).toEqual(values.decode.pathNoKey);
  });

  it('finds the chords that were put in', () => {
    const { path } = decodeChords(units, grid.numbers, 4, { tonic: 0, minor: false });
    // One chord per bar, as written: Dm7 G7 Cmaj7 Cmaj7 Dm7 G7 Cmaj7 A7.
    for (let bar = 0; bar < bars; bar++) expect(path[bar * 4 + 1]).toBe(values.progression[bar]);
  });

  it('builds the prototype\'s segments, confidences, suggestions and bass', () => {
    const dec = decodeChords(units, grid.numbers, 4, { tonic: 0, minor: false });
    const times = grid.beats.concat([segs[segs.length - 1]![1]]);
    const built = buildSegments(units, times, dec.path, dec.post);
    expect(built.length).toBe(values.segments.length);
    built.forEach((s, i) => {
      const w = values.segments[i]!;
      expect(s.chord).toBe(w.chord);
      expect(s.beats).toEqual(w.beats);
      expect(s.t0).toBeCloseTo(w.t0, 12);
      expect(s.t1).toBeCloseTo(w.t1, 12);
      expect(s.posterior).toBeCloseTo(w.posterior, 9);
      expect(s.confidence).toBeCloseTo(w.confidence, 9);
      expect(s.alternatives.map((a) => a.chord)).toEqual(w.alternatives.map((a) => a.chord));
      expect(s.extensions.map((e) => e.name)).toEqual(w.extensions.map((e) => e.name));
      expect(s.bass).toEqual(w.bass);
      close(s.pitch, w.pitch, 8);
    });
  });
});

describe('key', () => {
  const kk = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const chroma = Array.from({ length: 12 }, (_, i) => kk[(i - 10 + 12) % 12]! * 3 + 0.2 * Math.sin(i));

  it('finds the prototype\'s key from a pitch-class profile', () => {
    const k = estimateKey(chroma, null);
    expect([k.best.tonic, k.best.minor]).toEqual([10, false]);
    expect(k.best.p).toBeCloseTo(values.key.plain.best[2] as number, 10);
    k.ranked.forEach((r, i) => {
      const w = values.key.plain.ranked[i]!;
      expect([r.tonic, r.minor]).toEqual([w[0], w[1]]);
      expect(r.p).toBeCloseTo(w[2] as number, 10);
    });
  });

  it('can also weigh how well the decoded chords fit each key', () => {
    const dec = values.decode.path.map((chord) => ({ chord, dur: 0.5 }));
    const k = estimateKey(chroma, dec, { wChords: 0.5 });
    k.ranked.forEach((r, i) => {
      const w = values.key.withChords.ranked[i]!;
      expect([r.tonic, r.minor]).toEqual([w[0], w[1]]);
      expect(r.p).toBeCloseTo(w[2] as number, 10);
    });
  });
});

describe('the decoding step on a grid', () => {
  const bars = values.framesSpec.bars;
  const frames = chordFrames(values.progression, { bars });
  const grid = steadyGrid(bars * 4 + 1, 4);

  const compare = (got: ReturnType<typeof chartFromGrid>, want: (typeof values.chart)[keyof typeof values.chart]) => {
    expect([got.key.best.tonic, got.key.best.minor]).toEqual([want.key.best[0], want.key.best[1]]);
    if (want.key.best[2] === null) expect(got.key.best.p).toBeUndefined();
    else expect(got.key.best.p).toBeCloseTo(want.key.best[2] as number, 10);
    expect(got.key.ranked.length).toBe(want.key.ranked.length);
    got.key.ranked.forEach((r, i) => expect([r.tonic, r.minor]).toEqual([want.key.ranked[i]![0], want.key.ranked[i]![1]]));
    expect(got.segments.length).toBe(want.segments.length);
    got.segments.forEach((s, i) => {
      const w = want.segments[i]!;
      expect(s.chord).toBe(w.chord);
      expect(s.t0).toBeCloseTo(w.t0, 12);
      expect(s.t1).toBeCloseTo(w.t1, 12);
      expect(s.confidence).toBeCloseTo(w.confidence, 9);
      expect(s.extensions.map((e) => e.name)).toEqual(w.extensions);
      expect(s.bass ? s.bass.pc : null).toBe(w.bass);
      expect(s.alternatives.map((a) => a.chord)).toEqual(w.alternatives);
    });
  };

  it('is the prototype\'s chart (key estimated, then chords)', () => compare(chartFromGrid(frames, 1, grid), values.chart.whole));
  it('is the prototype\'s chart after a tuning correction (time scale)', () => compare(chartFromGrid(frames, 1.0175, grid), values.chart.scaled));
  it('keeps the key it is given and says so', () => {
    const got = chartFromGrid(frames, 1, grid, { tonic: 7, minor: false });
    compare(got, values.chart.fixed);
    expect(got.key.ranked).toEqual([]);
  });

  it('numbers a grid made by the user from their first downbeat', () => {
    const g = gridFromHint([0.5, 1, 1.5, 2, 2.5, 3, 3.5], 2, 4);
    expect(g.numbers).toEqual([3, 4, 1, 2, 3, 4, 1]);
    expect(g.beatsPerBar).toBe(4);
  });
});

// ----------------------------------------------------------- the app's model

describe('mapping to the app\'s model', () => {
  it('turns engine chords into symbols', () => {
    expect(symbolOf(NO_CHORD)).toBeNull();
    expect(symbolOf(2 * 14 + 8)).toEqual({ root: 2, quality: 'min7', extensions: [], bass: null });
    expect(symbolOf(7 * 14 + 6, ['13', 'b9'])).toEqual({ root: 7, quality: '7', extensions: ['b9', '13'], bass: null });
    expect(symbolOf(0, [], 4)).toEqual({ root: 0, quality: 'maj', extensions: [], bass: 4 });
    expect(symbolOf(0, [], 0)?.bass).toBeNull();
  });

  it('writes « sus4 + 7 » as the quality 7sus4, and drops « sus2 + 7 »', () => {
    expect(symbolOf(7 * 14 + 5, ['9', '7'])).toEqual({ root: 7, quality: '7sus4', extensions: ['9'], bass: null });
    expect(symbolOf(7 * 14 + 5, ['7'])).toEqual({ root: 7, quality: '7sus4', extensions: [], bass: null });
    expect(symbolOf(7 * 14 + 4, ['7'])).toEqual({ root: 7, quality: 'sus2', extensions: [], bass: null });
  });

  it('knows every extension the prototype can suggest', () => {
    const all = ['b9', '9', '#9', '#11', 'b13', '13', '6', '11'];
    expect(symbolOf(7 * 14 + 6, all)?.extensions.length).toBe(all.length);
  });

  const grid = steadyGrid(9, 4);
  const base = (over: Partial<ResultInput> = {}): ResultInput => ({
    grid,
    meterScores: [{ meter: 4, prob: 0.91 }, { meter: 3, prob: 0.09 }],
    gridIsHint: false,
    key: { best: { tonic: 11, minor: false, p: 0.83 }, ranked: [{ tonic: 11, minor: false, p: 0.83 }, { tonic: 8, minor: true, p: 0.1 }, { tonic: 4, minor: false, p: 0.04 }] },
    keyIsHint: false,
    tuning: { cents: 30.5, refHz: 447.9, confidence: 0.99, peaks: 120 },
    segments: [
      { chord: 11 * 14 + 7, beats: [0, 1, 2, 3], t0: 0.2, t1: 2.2, posterior: 0.9, confidence: 0.8, alternatives: [{ chord: 11 * 14, p: 0.1 }, { chord: NO_CHORD, p: 0.05 }], pitch: [], extensions: [{ name: '9', p: 0.7 }], bass: null },
      { chord: NO_CHORD, beats: [4, 5], t0: 2.2, t1: 3.2, posterior: 0.5, confidence: 0.2, alternatives: [], pitch: [], extensions: [], bass: null },
    ],
    duration: 12,
    models: ['beat-this-logmel', 'beat-this-small0', 'crema-chords'],
    now: new Date('2026-11-14T10:00:00Z'),
    ...over,
  });

  it('maps an analysis to the result of the model', () => {
    const r = toAnalysisResult(base());
    expect(r.version).toBe(ANALYSIS_RESULT_VERSION);
    expect(r.analyser).toEqual({ id: 'fabtice', version: '1', models: ['beat-this-logmel', 'beat-this-small0', 'crema-chords'] });
    expect(r.analysedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(r.duration).toBe(12);
    expect(r.beats).toEqual({ times: grid.beats, downbeat: 0, meter: { numerator: 4, denominator: 4 }, meterConfidence: 0.91 });
    expect(r.key).toEqual({ tonic: 11, mode: 'major', confidence: 0.83, alternatives: [{ tonic: 8, mode: 'minor', confidence: 0.1 }, { tonic: 4, mode: 'major', confidence: 0.04 }] });
    expect(r.tuning).toEqual({ cents: 30.5, confidence: 0.99 });
    expect(r.chords).toEqual([
      { time: 0.2, chord: { root: 11, quality: 'maj7', extensions: ['9'], bass: null }, confidence: 0.8, doubtful: false, alternatives: [{ root: 11, quality: 'maj', extensions: [], bass: null }] },
      { time: 2.2, chord: null, confidence: 0.2, doubtful: true, alternatives: [] },
    ]);
  });

  it('flags a chord as doubtful below the prototype\'s 0.35', () => {
    expect(DOUBT).toBe(0.35);
    const seg = (confidence: number) => ({ ...base().segments[0]!, confidence });
    const r = toAnalysisResult(base({ segments: [seg(0.349), seg(0.35), seg(0.9)] }));
    expect(r.chords.map((c) => c.doubtful)).toEqual([true, false, false]);
  });

  it('puts the first downbeat where the numbering starts, or where the user put it', () => {
    const pickup = { ...grid, numbers: [3, 4, 1, 2, 3, 4, 1, 2, 3] };
    expect(toAnalysisResult(base({ grid: pickup })).beats.downbeat).toBe(2);
    const mine = toAnalysisResult(base({ grid: { ...grid, numbers: gridFromHint(grid.beats, 6, 4).numbers }, gridIsHint: true, downbeat: 6 }));
    expect(mine.beats.downbeat).toBe(6);
    expect(mine.beats.meterConfidence).toBe(1);
  });

  it('says a key the user gave is certain', () => {
    const r = toAnalysisResult(base({ keyIsHint: true, key: { best: { tonic: 2, minor: true }, ranked: [] } }));
    expect(r.key).toEqual({ tonic: 2, mode: 'minor', confidence: 1, alternatives: [] });
  });

  it('has no tuning when no peak was found', () => {
    expect(toAnalysisResult(base({ tuning: { cents: 0, refHz: 440, confidence: 0, peaks: 0 } })).tuning).toBeNull();
  });
});
