import { describe, expect, it } from 'vitest';
import { constantTempoMap, describePoint, formatLoop, formatPoint, loopFromBars } from './index';

// 120 BPM, 4/4, first downbeat at 0: a beat lasts 0.5 s, a bar 2 s, a sixteenth 0.125 s.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
/** Time of bar `bar` (1-based as shown), beat `beat` (1-based), plus `frac` of a beat. */
const at = (bar: number, beat: number, frac = 0) => (bar - 1) * 2 + (beat - 1) * 0.5 + frac * 0.5;

describe('describePoint', () => {
  it('names a point on a beat by bar and beat', () => {
    expect(describePoint(map, at(2, 2))).toEqual({ bar: 1, beat: 2, sub: null, approx: false });
    expect(describePoint(map, at(1, 1))).toEqual({ bar: 0, beat: 1, sub: null, approx: false });
  });

  it('names a point between two beats by the rank of its subdivision', () => {
    expect(describePoint(map, at(4, 3, 0.75))).toEqual({ bar: 3, beat: 3, sub: { rank: 4, count: 4 }, approx: false });
    expect(describePoint(map, at(4, 3, 0.5))).toEqual({ bar: 3, beat: 3, sub: { rank: 2, count: 2 }, approx: false });
    expect(describePoint(map, at(4, 3, 1 / 3))).toEqual({ bar: 3, beat: 3, sub: { rank: 2, count: 3 }, approx: false });
    expect(describePoint(map, at(4, 3, 2 / 3))).toEqual({ bar: 3, beat: 3, sub: { rank: 3, count: 3 }, approx: false });
    expect(describePoint(map, at(4, 3, 1 / 6))).toEqual({ bar: 3, beat: 3, sub: { rank: 2, count: 6 }, approx: false });
    expect(describePoint(map, at(4, 3, 3 / 8))).toEqual({ bar: 3, beat: 3, sub: { rank: 4, count: 8 }, approx: false });
  });

  it('a point a hair off a line is on it; just before a bar line is the next bar', () => {
    expect(describePoint(map, at(2, 2) + 0.0004)).toMatchObject({ bar: 1, beat: 2, sub: null });
    expect(describePoint(map, at(3, 1) - 0.0004)).toMatchObject({ bar: 2, beat: 1, sub: null });
  });

  it('a free point is approximate and reads as the nearest sixteenth', () => {
    const p = describePoint(map, at(2, 2, 0.3));
    expect(p.approx).toBe(true);
    expect(p).toMatchObject({ bar: 1, beat: 2, sub: { rank: 2, count: 4 } });
    // Nearly the next beat.
    expect(describePoint(map, at(2, 2, 0.9))).toMatchObject({ beat: 3, sub: null, approx: true });
    expect(formatPoint(p)).toBe('≈2.2 (2e double)');
  });
});

describe('formatLoop', () => {
  it('keeps the short form for whole bars', () => {
    expect(formatLoop(map, loopFromBars(map, 4, 7))).toMatchObject({ whole: true, text: '5–8', long: 'mesures 5 à 8' });
    expect(formatLoop(map, loopFromBars(map, 4, 4))).toMatchObject({ whole: true, text: '5', long: 'mesure 5' });
  });

  it('writes a loop that is not made of whole bars as two points', () => {
    // From beat 2 of bar 2 to the fourth sixteenth of beat 3 of bar 4.
    const l = formatLoop(map, { start: at(2, 2), end: at(4, 3, 0.75) });
    expect(l.whole).toBe(false);
    expect(l.text).toBe('2.2 à 4.3 (4e double)');
    expect(l.long).toBe('de la mesure 2, temps 2, à la mesure 4, temps 3, 4e double');
  });

  it('writes the cases a musician can make', () => {
    const text = (a: number, b: number) => formatLoop(map, { start: a, end: b }).text;
    expect(text(at(2, 2), at(4, 2))).toBe('2.2 à 4.2'); // on beats
    expect(text(at(2, 1), at(3, 3))).toBe('2.1 à 3.3'); // starts on a bar line, ends inside a bar
    expect(text(at(2, 3), at(4, 1))).toBe('2.3 à 4.1'); // ends on a bar line, starts inside a bar
    expect(text(at(2, 2, 0.5), at(3, 4, 0.5))).toBe('2.2 (2e croche) à 3.4 (2e croche)'); // off-beat eighths
    expect(text(at(2, 2), at(4, 3, 2 / 3))).toBe('2.2 à 4.3 (3e triolet)'); // triplets
    expect(text(at(2, 2, 0.25), at(2, 4, 0.75))).toBe('2.2 (2e double) à 2.4 (4e double)'); // inside one bar
    expect(text(at(1, 1, 0.125 * 2), at(1, 2))).toBe('1.1 (2e double) à 1.2');
    expect(text(at(2, 2, 0.3), at(4, 2, 0.9))).toBe('≈2.2 (2e double) à ≈4.3'); // free
  });

  it('counts the pick-up bar as 0', () => {
    const p = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    expect(formatLoop(p, { start: 0.5, end: 3 }).text).toBe('0.4 à 2.1');
  });
});
