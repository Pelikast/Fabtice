import { describe, expect, it } from 'vitest';
import { tempoMapFromBeats } from '../grid/beats';
import { constantTempoMap } from '../grid/tempoMap';
import { wholeCurve } from './drawing';

describe('the tempo curve of the ruler', () => {
  it('is flat for a constant tempo, centred in a scale at least 8 BPM tall', () => {
    const map = constantTempoMap({ bpm: 96, firstDownbeat: 0.3, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const c = wholeCurve(map, 60);
    expect(c.flat).toBe(true);
    expect(c.hi - c.lo).toBeGreaterThanOrEqual(8 - 1e-9);
    expect((c.hi + c.lo) / 2).toBeCloseTo(96, 6);
    expect(c.points.length).toBeGreaterThan(20);
  });

  it('has one point per bar, not one per beat, on an analysed map', () => {
    // 4/4, tempo drifting from 100 to 120 BPM over 64 beats, with jitter on each beat.
    const times: number[] = [0];
    for (let i = 1; i <= 64; i++) times.push(times[i - 1]! + 60 / (100 + (20 * i) / 64) + 0.01 * Math.sin(i * 7));
    const map = tempoMapFromBeats(times, 0, { numerator: 4, denominator: 4 });
    const c = wholeCurve(map, times[64]!);
    expect(c.points.length).toBeLessThanOrEqual(17);
    expect(c.points.length).toBeLessThan(map.segments.length / 3);
    expect(c.flat).toBe(false);
    for (const p of c.points) {
      expect(p.bpm).toBeGreaterThanOrEqual(c.lo - 1e-9);
      expect(p.bpm).toBeLessThanOrEqual(c.hi + 1e-9);
    }
    expect(c.nominal).toBeGreaterThanOrEqual(c.lo);
    expect(c.nominal).toBeLessThanOrEqual(c.hi);
  });

  it('is computed once per map (the scale does not change while scrolling)', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    expect(wholeCurve(map, 30)).toBe(wholeCurve(map, 30));
  });
});
