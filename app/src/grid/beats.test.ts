// Variable tempo maps from analysed beats: the real, slightly moving beats of
// the analysis prototype's excerpt (`analysis/demoSwing.ts`, 150 BPM swing
// slowing to about 130), through every grid function the timeline uses.

import { describe, expect, it } from 'vitest';
import { DEMO_SWING } from '../analysis/demoSwing';
import { beatGridOf, beatTimes, tempoMapFromBeats } from './beats';
import { canDoubleTempo, canHalveTempo, doubleTempo, downbeatNear, halveTempo, shiftDownbeat, withNumerator } from './corrections';
import { barLines, barsOfRange, loopFromBars, metronomeClicks, snapTime, subGridLines } from './lines';
import { formatPosition } from './format';
import { tempoCurve, curveRange } from './tempoCurve';
import { barStartTime, bpmAt, constantTempoMap, firstDownbeat, maxBpm, nominalBpm, timeToBar, timeToBeat, withManualGrid } from './tempoMap';

const times = DEMO_SWING.beats.map(([t]) => t);
const downbeats = DEMO_SWING.beats.filter(([, n]) => n === 1).map(([t]) => t);
const map = tempoMapFromBeats(times, 0, { numerator: 4, denominator: 4 });
const END = times[times.length - 1]!;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('a tempo map from analysed beats', () => {
  it('puts every analysed beat on an integer beat, the downbeat on beat 0', () => {
    expect(map.origin).toBe('analysis');
    expect(map.segments).toHaveLength(times.length - 1);
    times.forEach((t, i) => expect(timeToBeat(map, t)).toBeCloseTo(i, 9));
    expect(firstDownbeat(map)).toBe(0);
  });

  it('bar lines are exactly the analysed downbeats', () => {
    const lines = barLines(map, 0, END);
    expect(lines.map((l) => l.bar)).toEqual(downbeats.map((_, i) => i));
    lines.forEach((l, i) => expect(near(l.time, downbeats[i]!)).toBe(true));
  });

  it('beat sub-grid lines are the other analysed beats, eighths fall half-way', () => {
    const quarters = subGridLines(map, 0, END, { subdivision: 1, triplets: false });
    const others = DEMO_SWING.beats.filter(([, n]) => n !== 1).map(([t]) => t);
    expect(quarters.length).toBe(others.length);
    quarters.forEach((l, i) => expect(near(l.time, others[i]!)).toBe(true));
    const eighths = subGridLines(map, times[4]!, times[8]!, { subdivision: 2, triplets: false });
    expect(near(eighths[0]!.time, (times[4]! + times[5]!) / 2)).toBe(true);
    expect(eighths.filter((l) => l.onBeat)).toHaveLength(3);
    expect(eighths).toHaveLength(7);
    // Swing triplets: a third of the way through each beat.
    const trip = subGridLines(map, times[4]!, times[5]!, { subdivision: 2, triplets: true });
    expect(near(trip[0]!.time, times[4]! + (times[5]! - times[4]!) / 3)).toBe(true);
  });

  it('positions, snapping and loops follow the moving tempo', () => {
    expect(formatPosition(map, times[13]! + 0.01)).toEqual({ bar: '4', beat: '2' });
    expect(near(snapTime(map, times[13]! + 0.1, { subdivision: 1, triplets: false }), times[13]!)).toBe(true);
    const loop = loopFromBars(map, 4, 7);
    expect(near(loop.start, downbeats[4]!) && near(loop.end, downbeats[8]!)).toBe(true);
    expect(barsOfRange(map, loop)).toEqual({ first: 4, last: 7 });
  });

  it('metronome clicks are the analysed beats, downbeats accented', () => {
    const clicks = metronomeClicks(map, 0, END + 0.001);
    expect(clicks.times.length).toBe(times.length);
    clicks.times.forEach((t, i) => expect(near(t, times[i]!)).toBe(true));
    expect([...clicks.accents]).toEqual(DEMO_SWING.beats.map(([, n]) => (n === 1 ? 1 : 0)));
  });

  it('the nominal tempo is the weighted median, the curve is per bar', () => {
    const bpm = nominalBpm(map, END);
    expect(bpm).toBeGreaterThan(128);
    expect(bpm).toBeLessThan(150);
    expect(maxBpm(map)).toBeGreaterThan(145);
    const curve = tempoCurve(map, 0, END);
    expect(curve).toHaveLength(20);
    expect(curve[0]!.bpm).toBeCloseTo((4 * 60) / downbeats[1]!, 6);
    const { lo, hi } = curveRange(curve);
    expect(lo).toBeGreaterThan(125);
    expect(hi).toBeLessThan(152);
    // A constant map gives a flat curve.
    const flat = tempoCurve(constantTempoMap({ bpm: 110, firstDownbeat: 0.5, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }), 0, 20);
    expect(flat.every((p) => near(p.bpm, 110, 1e-9))).toBe(true);
  });

  it('a pick-up: beats before the first downbeat make bar « 0 »', () => {
    const m = tempoMapFromBeats(times, 2, { numerator: 4, denominator: 4 });
    expect(near(firstDownbeat(m), times[2]!)).toBe(true);
    expect(timeToBar(m, times[0]!).bar).toBe(-1);
    expect(formatPosition(m, times[0]! + 0.01)).toEqual({ bar: '0', beat: '3' });
    // Before the first beat, the first interval's tempo extends backwards.
    expect(bpmAt(m, -1)).toBeCloseTo(60 / (times[1]! - times[0]!), 9);
  });

  it('drops beats too close together and needs two', () => {
    const m = tempoMapFromBeats([0, 0.5, 0.52, 1, 1.5], 0);
    expect(m.segments.map((s) => s.time)).toEqual([0, 0.5, 1]);
    expect(() => tempoMapFromBeats([1], 0)).toThrow();
  });

  it('gives its beats back (what the analyser takes as a grid)', () => {
    expect(beatTimes(map, 0, END).length).toBe(times.length);
    const g = beatGridOf(shiftDownbeat(map, 1), END);
    expect(g.downbeat).toBe(1);
    expect(g.times.length).toBe(times.length);
  });
});

describe('hand corrections of the grid', () => {
  it('× 2: a beat between each analysed beat, same downbeats', () => {
    const d = doubleTempo(map);
    expect(d.origin).toBe('corrected');
    expect(near(timeToBeat(d, times[1]!), 2, 1e-9)).toBe(true);
    expect(near(timeToBeat(d, (times[1]! + times[2]!) / 2), 3, 1e-9)).toBe(true);
    // Twice as many bars, each as long as half an analysed bar.
    expect(near(barStartTime(d, 2), downbeats[1]!)).toBe(true);
    expect(nominalBpm(d, END)).toBeCloseTo(nominalBpm(map, END) * 2, 6);
  });

  it('÷ 2: every other beat, keeping the downbeats', () => {
    const h = halveTempo(map);
    expect(near(barStartTime(h, 1), downbeats[2]!)).toBe(true);
    expect(near(timeToBeat(h, times[2]!), 1, 1e-9)).toBe(true);
    expect(halveTempo(doubleTempo(map)).segments).toEqual(map.segments);
  });

  it('first beat one beat later or earlier: bar lines move by a beat, beats stay', () => {
    const later = shiftDownbeat(map, 1);
    expect(near(firstDownbeat(later), times[1]!)).toBe(true);
    expect(near(barStartTime(later, 1), times[5]!)).toBe(true);
    const earlier = shiftDownbeat(map, -1);
    expect(near(barStartTime(earlier, 1), times[3]!)).toBe(true);
    expect(shiftDownbeat(later, -1).segments).toEqual(map.segments);
  });

  it('« Premier temps ici » on analysed beats picks the nearest beat', () => {
    const m = downbeatNear(map, times[6]! + 0.05);
    expect(near(firstDownbeat(m), times[6]!)).toBe(true);
    expect(m.origin).toBe('corrected');
  });

  it('meter: 3 beats per bar on the same beats', () => {
    const m = withNumerator(map, 3);
    expect(near(barStartTime(m, 1), times[3]!)).toBe(true);
    expect(m.meters).toEqual([{ bar: 0, beat: 0, meter: { numerator: 3, denominator: 4 } }]);
  });

  it('a manual map stays manual; the tempo range bounds × 2 and ÷ 2', () => {
    const manual = constantTempoMap({ bpm: 160, firstDownbeat: 0.3, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    expect(doubleTempo(manual).origin).toBe('manual');
    expect(doubleTempo(manual).segments[0]!.bpm).toBe(320);
    expect(canDoubleTempo(manual)).toBe(false);
    expect(canHalveTempo(manual)).toBe(true);
    expect(canHalveTempo(constantTempoMap({ bpm: 50, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }))).toBe(false);
    // The lot 1 panel on analysed beats: a constant tempo by hand replaces them.
    const flat = withManualGrid(map, { bpm: 120 });
    expect(flat.origin).toBe('manual');
    expect(flat.segments).toHaveLength(1);
  });
});
