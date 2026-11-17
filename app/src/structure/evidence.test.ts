import { afterEach, describe, expect, it } from 'vitest';
import { clearAudio, registerAudio } from '../audio/registry';
import type { StemId } from '../model/separation';
import {
  arraySource, buildStructureEvidence, clearEvidenceCache, evidenceKey, EXCERPT_RATE, measureEvidence, MELODY_NONE, MELODY_SLOTS, readExcerpt, recogniseWinds, TIMBRE_BANDS, windsExcerpts,
} from './evidence';
import { AABA, chartBars, inputOf, repeat } from './testCharts';
import type { InstrumentRecognizer } from './types';

const SR = 22050;

/** A signal of `seconds`, `f(t)` per sample. */
function signal(seconds: number, f: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = f(i / SR);
  return out;
}

const A4 = (t: number) => 0.3 * Math.sin(2 * Math.PI * 440 * t);
const bars = (n: number, len = 2) => Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len }));

afterEach(() => {
  clearAudio();
  clearEvidenceCache();
});

describe('structure evidence: the core', () => {
  it('measures the level of each track per bar, and a melody where one pitch sounds', () => {
    // the voice sings A in bars 0-1, rests in bar 2; the piano plays two notes all along
    const voice = signal(6, (t) => (t < 4 ? A4(t) : 0));
    const piano = signal(6, (t) => 0.1 * Math.sin(2 * Math.PI * 261.6 * t) + 0.1 * Math.sin(2 * Math.PI * 329.6 * t));
    const ev = measureEvidence({ mix: null, stems: { vocals: arraySource(voice, SR), piano: arraySource(piano, SR) } }, bars(3));
    const v = ev.stems!.vocals!;
    expect(v[0]).toBeCloseTo(0.3 / Math.SQRT2, 2);
    expect(v[2]).toBe(0);
    const mel = ev.melody!.stems.vocals!;
    expect(ev.melody!.slots).toBe(MELODY_SLOTS);
    expect(Array.from(mel.subarray(0, 2 * MELODY_SLOTS)).every((pc) => pc === 9)).toBe(true); // A
    expect(Array.from(mel.subarray(2 * MELODY_SLOTS)).every((pc) => pc === MELODY_NONE)).toBe(true);
    // the timbre from the tracks added up when the mix is not in memory
    expect(ev.timbre.bands).toBe(TIMBRE_BANDS);
    expect(ev.timbre.data.length).toBe(3 * TIMBRE_BANDS);
    expect(ev.winds).toBeNull();
  });

  it('puts the energy of a low and a high sound in low and high bands', () => {
    const low = signal(4, (t) => 0.3 * Math.sin(2 * Math.PI * 80 * t));
    const high = signal(4, (t) => 0.3 * Math.sin(2 * Math.PI * 5000 * t));
    const a = measureEvidence({ mix: arraySource(low, SR), stems: {} }, bars(2)).timbre.data;
    const b = measureEvidence({ mix: arraySource(high, SR), stems: {} }, bars(2)).timbre.data;
    const top = (d: Float32Array) => Array.from(d.subarray(0, TIMBRE_BANDS)).indexOf(Math.max(...d.subarray(0, TIMBRE_BANDS)));
    expect(top(a)).toBeLessThan(2);
    expect(top(b)).toBeGreaterThan(5);
    expect(measureEvidence({ mix: arraySource(low, SR), stems: {} }, bars(2)).stems).toBeNull();
  });

  it('survives bars past the end of the audio and bars of zero length', () => {
    const ev = measureEvidence({ mix: null, stems: { other: arraySource(signal(1, A4), SR) } }, [{ start: 0, end: 1 }, { start: 1, end: 1 }, { start: 5, end: 6 }]);
    expect(Array.from(ev.stems!.other!)).toEqual([expect.any(Number), 0, 0]);
  });
});

describe('structure evidence: the app wrapper and the wind step', () => {
  it('reads the registry in slices, and caches per audio and grid', async () => {
    const voice = signal(8, A4);
    registerAudio('voice', { channels: [voice, voice], sampleRate: SR });
    registerAudio('mix', { channels: [voice], sampleRate: SR });
    const grid = bars(4);
    const sources = { mix: 'mix', stems: { vocals: 'voice' } as Partial<Record<StemId, string>> };
    const a = await buildStructureEvidence(sources, grid, { sliceMs: 0 });
    expect(a!.stems!.vocals![1]).toBeCloseTo(0.3 / Math.SQRT2, 1);
    expect(await buildStructureEvidence(sources, grid)).toBe(a);
    expect(evidenceKey(sources, grid)).not.toBe(evidenceKey(sources, bars(3)));
    expect(await buildStructureEvidence({ mix: 'missing', stems: {} }, grid)).toBeNull();
    const ctl = new AbortController();
    ctl.abort();
    await expect(buildStructureEvidence(sources, bars(5), { signal: ctl.signal })).rejects.toThrow();
  });

  it('asks the recogniser once per chorus the « Autres » track leads, and fills the bars', async () => {
    const harmony = chartBars(repeat(AABA, 3));
    const n = harmony.length;
    const lv = (f: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => f(i));
    const stems: Partial<Record<StemId, Float32Array>> = {
      other: lv((i) => (i < 64 ? 0.2 : 0.002)),
      piano: lv((i) => (i < 64 ? 0.08 : 0.24)),
      bass: lv(() => 0.1),
      drums: lv(() => 0.12),
    };
    const input = inputOf(harmony, { evidence: { stems, timbre: { bands: 8, data: new Float32Array(n * 8) }, winds: null } });
    const excerpts = windsExcerpts(input, []);
    expect(excerpts.map((e) => `${e.firstBar}-${e.endBar}`)).toEqual(['0-32', '32-64']);
    const calls: number[] = [];
    const recognizer: InstrumentRecognizer = {
      async recognise(mono, rate) {
        calls.push(mono.length / rate);
        return calls.length === 1 ? { instrument: 'trumpet', confidence: 0.9 } : null;
      },
    };
    const other = arraySource(signal(harmony[n - 1]!.end, A4), SR);
    const ev = await recogniseWinds(input.evidence!, harmony, excerpts, recognizer, other);
    expect(calls).toEqual([64, 64]);
    expect(ev.winds![0]).toEqual({ instrument: 'trumpet', confidence: 0.9 });
    expect(ev.winds![40]).toBeNull();
    expect(ev.winds![80]).toBeNull();
    expect(ev.stems).toBe(input.evidence!.stems);
  });

  it('reads an excerpt at 16 kHz block by block, as the recogniser would resample it', async () => {
    const src = arraySource(signal(30, A4), SR);
    const x = (await readExcerpt(src, 3, 23))!;
    expect(x.length).toBe(20 * EXCERPT_RATE);
    // the same sine, at the new rate (away from the edges)
    let err = 0;
    for (let i = 1000; i < x.length - 1000; i++) err = Math.max(err, Math.abs(x[i]! - A4(3 + i / EXCERPT_RATE)));
    expect(err).toBeLessThan(0.01);
    // nothing outside the excerpt leaks in
    expect(Math.abs(x[0]!)).toBeLessThan(0.2);
    expect(await readExcerpt(src, 40, 50)).toBeNull();
    const abort = new AbortController();
    abort.abort();
    await expect(readExcerpt(src, 0, 10, abort.signal)).rejects.toThrow(/abort/i);
  });

  it('a detailed separation without a drum track: its drum parts make the « drums » level', () => {
    const kick = signal(4, (t) => 0.3 * Math.sin(2 * Math.PI * 60 * t));
    const hat = signal(4, (t) => (t < 2 ? 0.4 * Math.sin(2 * Math.PI * 3000 * t) : 0));
    const ev = measureEvidence({ mix: null, stems: { kick: arraySource(kick, SR), hihat: arraySource(hat, SR) } }, bars(2));
    const d = ev.stems!.drums!;
    expect(d[0]).toBeCloseTo(Math.hypot(0.3, 0.4) / Math.SQRT2, 2);
    expect(d[1]).toBeCloseTo(0.3 / Math.SQRT2, 2);
  });
});
