import { describe, expect, it } from 'vitest';
import { BASS_SR, bassAudio, bassBeats } from './bassline';
import { bassBand } from './bassband';
import { analyseChart } from './chart';
import { N_CHORDS, NO_CHORD, chordQual, chordRoot, type ChordFrames, type PooledUnit } from './chords';
import { decodeChords } from './decode';
import { applyEvidence } from './evidence';
import { makeGrid, renumber } from './grid';
import { applyBassCue, bassSource, harmonyScore, selectHarmony, type StemFeatures } from './listen';
import { chartFromGrid } from './pipeline';

/** A bass note with its first six harmonics, `seconds` long, at 44.1 kHz. */
function note(midi: number, seconds: number, sr = 44100): Float32Array {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin((2 * Math.PI * f * h * i) / sr) / h;
    out[i] = 0.2 * v;
  }
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('bass line', () => {
  it('finds the pitch class of each beat, by harmonic summation', () => {
    // A1, D2, G1, C2: half a second each.
    const midis = [33, 38, 31, 36];
    const audio = concat(midis.map((m) => note(m, 0.5)));
    const low = bassAudio(audio, 44100);
    expect(Math.abs(low.length - (audio.length * BASS_SR) / 44100)).toBeLessThan(2);
    const beats = bassBeats(low, midis.map((_, i) => [i * 0.5, i * 0.5 + 0.5] as const));
    expect(beats.map((b) => b.pcs.indexOf(Math.max(...b.pcs)))).toEqual(midis.map((m) => m % 12));
    for (const b of beats) expect(b.strength).toBeGreaterThan(0.5);
  });

  it('still finds it when the fundamental is filtered away (band-pass 40–300 Hz of the mix, old records)', () => {
    const audio = note(33, 1); // A1 = 55 Hz
    const band = bassBand(audio, 44100);
    const beats = bassBeats(bassAudio(band, 44100), [[0, 1]]);
    expect(beats[0]!.pcs.indexOf(Math.max(...beats[0]!.pcs))).toBe(9);
  });

  it('as evidence: the same decision as folding the cue in, and a no-op on silent beats', () => {
    const units: PooledUnit[] = Array.from({ length: 8 }, (_, i) => {
      const logp = new Float64Array(N_CHORDS).fill(Math.log(0.002));
      // Dm7 and G7 equally likely on every beat (rootless voicing): the bass decides.
      logp[2 * 14 + 8] = Math.log(0.3);
      logp[7 * 14 + 6] = Math.log(0.3);
      return { t0: i * 0.5, t1: i * 0.5 + 0.5, logp, pitch: new Float64Array(12), bass: new Float64Array(13), frames: 10 };
    });
    const numbers = [1, 2, 3, 4, 1, 2, 3, 4];
    const pcs = (pc: number) => Float64Array.from({ length: 12 }, (_, k) => (k === pc ? 1 : 0));
    const bass = numbers.map((_, i) => ({ pcs: pcs(i < 4 ? 2 : 7), strength: 1 }));
    const a = applyBassCue(units, bass, numbers, 4);
    const b = applyEvidence(units, [bassSource(bass, numbers, 4)]);
    const pa = decodeChords(a, numbers, 4, null).path;
    const pb = decodeChords(b, numbers, 4, null).path;
    expect(pa).toEqual(pb);
    expect(pa.slice(0, 4).every((c) => chordRoot(c) === 2 && chordQual(c) === 'min7')).toBe(true);
    expect(pa.slice(4).every((c) => chordRoot(c) === 7 && chordQual(c) === '7')).toBe(true);
    const silent = bassSource(numbers.map(() => ({ pcs: new Float64Array(12).fill(1 / 12), strength: 0 })), numbers, 4);
    const c = applyEvidence(units, [silent]);
    for (let i = 0; i < units.length; i++) {
      const d = c[i]!.logp[2 * 14 + 8]! - c[i]!.logp[7 * 14 + 6]!;
      expect(Math.abs(d)).toBeLessThan(1e-9);
    }
    expect(NO_CHORD).toBe(168);
  });
});

describe('harmony parts', () => {
  const f = (polyphony: number, noChord: number, activity = 0.8): StemFeatures => ({
    activity, level: 0.05, polyphony, chordness: 0.4, noChord, agreement: 0.5, rootAgreement: 0.2,
  });
  it('keeps the parts that play chords, never the bass or the drums, never a melody', () => {
    expect(selectHarmony({ piano: f(3.5, 0), other: f(1.5, 0.3), bass: f(3, 0), drums: f(4, 0) })).toEqual(['piano']);
    expect(selectHarmony({ vocals: f(3.3, 0.02), other: f(0.9, 0.5) })).toEqual(['vocals']);
    expect(selectHarmony({ guitar: f(3.6, 0), other: f(3.5, 0.0) })).toEqual(['guitar', 'other']);
  });
  it('takes the best part when none reaches the threshold, and nothing that is silent', () => {
    expect(selectHarmony({ other: f(1.5, 0.3), guitar: f(2.3, 0.05) })).toEqual(['guitar']);
    expect(selectHarmony({ guitar: f(3.6, 0, 0.01) })).toEqual([]);
    expect(harmonyScore(f(3, 0.25))).toBeCloseTo(2);
  });
});

describe('analyseChart', () => {
  it('with every extra source off, is the prototype chart (chartFromGrid)', () => {
    const T = 200;
    const probs = new Float32Array(T * N_CHORDS);
    for (let t = 0; t < T; t++) {
      const c = Math.floor(t / 25) % 2 ? 2 * 14 + 8 : 7 * 14 + 6;
      for (let k = 0; k < N_CHORDS; k++) probs[t * N_CHORDS + k] = k === c ? 0.6 : 0.4 / (N_CHORDS - 1);
    }
    const frames: ChordFrames = { T, fps: 44100 / 4096, probs, pitch: new Float32Array(T * 12).fill(0.2), bass: new Float32Array(T * 13).fill(1 / 13) };
    const times = Array.from({ length: 36 }, (_, i) => i * 0.5);
    const grid = makeGrid(times, renumber(times, 4, 0), 4);
    const a = chartFromGrid(frames, 1, grid, null);
    const b = analyseChart({ frames, timeScale: 1, grid, cents: 0, settings: { bass: null, repeats: null, chart: null } });
    expect(b.segments.map((s) => [s.chord, s.beats])).toEqual(a.segments.map((s) => [s.chord, s.beats]));
    expect(b.key.best).toEqual(a.key.best);
    expect(b.reliability.every((p) => p > 0 && p < 1)).toBe(true);
    expect(b.evidence).toEqual({ harmonyStems: [], bass: null, formBars: null, knownChart: null });
  });
});
