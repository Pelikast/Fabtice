// Signatures bar by bar (C13): the commands, « la noire reste la noire »,
// bar lines and numbers before, at and after each change, later changes kept
// in the music, pick-up bars, and the hand corrections of the grid keeping the
// user's signatures.

import { describe, expect, it } from 'vitest';
import type { Meter, TempoMap } from '../model/tempoMap';
import { tempoMapFromBeats } from './beats';
import { doubleTempo, downbeatNear, halveTempo, shiftDownbeat, withMeter, withNumerator } from './corrections';
import { formatPosition } from './format';
import { barLines, subGridLines } from './lines';
import {
  feltBeat,
  mainMeter,
  meterAtTime,
  meterChangeAt,
  meterChangeList,
  withMeterForBar,
  withMeterFrom,
  withMetersOf,
  withoutMeterChange,
} from './meters';
import {
  barBeatToBeat,
  barStartTime,
  beatToTime,
  beatUnit,
  constantTempoMap,
  meterAtBar,
  nominalBpm,
  timeToBar,
  withManualGrid,
} from './tempoMap';

const m = (numerator: number, denominator: number): Meter => ({ numerator, denominator });
/** 120 BPM in 4/4 from 0 s: a quarter lasts 0.5 s, a 4/4 bar 2 s. */
const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' });
const r = (x: number) => Math.round(x * 1e6) / 1e6;
const lines = (map: TempoMap, from: number, to: number) => barLines(map, from, to).map((l) => [l.bar, r(l.time)]);
const changes = (map: TempoMap) => map.meters.map((c) => [c.bar, c.beat, `${c.meter.numerator}/${c.meter.denominator}`]);

/** Analysed beats that move: about 0.5 s apart, never exactly. */
const analysedTimes = Array.from({ length: 80 }, (_, i) => 0.3 + i * 0.5 + 0.03 * Math.sin(i * 1.7));
const analysed = tempoMapFromBeats(analysedTimes, 0, m(4, 4), 'analysis');

describe('the cases of the plan', () => {
  it('7/8 for one bar: 3.5 quarters, then 4/4 again; bar lines and numbers before, at and after', () => {
    const map = withMeterForBar(c44, 2, m(7, 8));
    expect(lines(map, 0, 10)).toEqual([[0, 0], [1, 2], [2, 4], [3, 5.75], [4, 7.75], [5, 9.75]]);
    expect(changes(map)).toEqual([[0, 0, '4/4'], [2, 8, '7/8'], [3, 11.5, '4/4']]);
    expect(meterAtBar(map, 2)).toEqual(m(7, 8));
    expect(meterAtBar(map, 3)).toEqual(m(4, 4));
    // Inside the 7/8 bar the beats are eighths: 5 s is its fifth eighth.
    expect(timeToBar(map, 5)).toMatchObject({ bar: 2, beatInBar: 4 });
    expect(formatPosition(map, 5.01)).toEqual({ bar: '3', beat: '5' });
    expect(formatPosition(map, 6.3)).toEqual({ bar: '4', beat: '2' });
    expect(map.origin).toBe('manual');
  });

  it('5/4 from a bar on, permanent', () => {
    const map = withMeterFrom(c44, 1, m(5, 4));
    expect(lines(map, 0, 10)).toEqual([[0, 0], [1, 2], [2, 4.5], [3, 7], [4, 9.5]]);
    expect(meterAtTime(map, 30)).toEqual(m(5, 4));
  });

  it('a single bar in 2/4 inside 4/4: back to 4/4 at the next bar', () => {
    const map = withMeterForBar(c44, 3, m(2, 4));
    expect(lines(map, 0, 10)).toEqual([[0, 0], [1, 2], [2, 4], [3, 6], [4, 7], [5, 9]]);
    expect(meterAtBar(map, 4)).toEqual(m(4, 4));
    expect(meterChangeList(map).map((c) => [c.bar, c.time, c.change, c.single])).toEqual([[0, 0, false, false], [3, 6, true, true], [4, 7, true, false]]);
  });

  it('4/4 -> 6/8 keeps the quarter: the 6/8 bar lasts three quarters (constant grid)', () => {
    const map = withMeterFrom(c44, 2, m(6, 8));
    expect(lines(map, 0, 8)).toEqual([[0, 0], [1, 2], [2, 4], [3, 5.5], [4, 7]]);
    // An eighth lasts half a quarter: 0.25 s.
    expect(r(beatToTime(map, barBeatToBeat(map, 2, 1)) - 4)).toBe(0.25);
    expect(r(barStartTime(map, 3) - barStartTime(map, 2))).toBe(1.5);
    // The map still counts quarters: the tempo does not change.
    expect(nominalBpm(map)).toBe(120);
    expect(beatUnit(map)).toBe(4);
  });

  it('4/4 -> 6/8 on analysed beats: the bar lines fall on analysed beats, its eighths halve them', () => {
    const map = withMeterFrom(analysed, 2, m(6, 8));
    const t = analysedTimes;
    // bars 0 and 1 are four analysed beats, every 6/8 bar three
    expect([2, 3, 4, 5].map((b) => r(barStartTime(map, b)))).toEqual([t[8]!, t[11]!, t[14]!, t[17]!].map(r));
    const sub = subGridLines(map, t[8]!, t[11]! - 1e-6, { subdivision: 1, triplets: false });
    expect(sub.map((l) => l.beatInBar)).toEqual([1, 2, 3, 4, 5]);
    expect(r(sub[1]!.time)).toBe(r(t[9]!));
    expect(r(sub[0]!.time)).toBe(r((t[8]! + t[9]!) / 2));
    expect(map.origin).toBe('corrected');
  });

  it('1/4, 64/32 and 7/16 bars', () => {
    expect(lines(withMeterForBar(c44, 1, m(1, 4)), 0, 4.5)).toEqual([[0, 0], [1, 2], [2, 2.5], [3, 4.5]]);
    const big = withMeterForBar(c44, 1, m(64, 32));
    expect(lines(big, 0, 8)).toEqual([[0, 0], [1, 2], [2, 6], [3, 8]]);
    // A 32nd lasts an eighth of a quarter: 0.0625 s.
    expect(timeToBar(big, 2 + 0.0625 * 3)).toMatchObject({ bar: 1, beatInBar: 3 });
    const s16 = withMeterForBar(c44, 1, m(7, 16));
    expect(lines(s16, 0, 5)).toEqual([[0, 0], [1, 2], [2, 2.875], [3, 4.875]]);
    expect(timeToBar(s16, 2.5)).toMatchObject({ bar: 1, beatInBar: 4 });
  });

  it('pick-up bars keep the first meter: no signature of their own; bar 0 changes them too', () => {
    expect(withMeterFrom(c44, -1, m(3, 4))).toBe(c44);
    expect(withMeterForBar(c44, -2, m(3, 4))).toBe(c44);
    expect(withMeterFrom(c44, 1.5, m(3, 4))).toBe(c44);
    const three = withMeterFrom(c44, 0, m(3, 4));
    expect(barStartTime(three, -1)).toBe(-1.5);
    expect(formatPosition(three, -0.4)).toEqual({ bar: '0', beat: '3' });
    const pickUp = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: m(4, 4), origin: 'manual' });
    const changed = withMeterForBar(pickUp, 2, m(3, 4));
    expect(barStartTime(changed, -1)).toBe(-1);
    expect(meterAtTime(changed, 0.2)).toEqual(m(4, 4));
  });

  it('illegal signatures are refused', () => {
    expect(withMeterFrom(c44, 2, m(65, 4))).toBe(c44);
    expect(withMeterFrom(c44, 2, m(0, 4))).toBe(c44);
    expect(withMeterFrom(c44, 2, m(4, 2))).toBe(c44);
    expect(withMeterForBar(c44, 2, m(3.5, 4))).toBe(c44);
  });
});

describe('merging, removing, the changes after', () => {
  it('the signature already in force is no change: the same map', () => {
    expect(withMeterFrom(c44, 2, m(4, 4))).toBe(c44);
    expect(withMeterForBar(c44, 2, m(4, 4))).toBe(c44);
    expect(withMeterFrom(c44, 0, m(4, 4))).toBe(c44);
    const three = withMeterFrom(c44, 2, m(3, 4));
    expect(withMeterFrom(three, 4, m(3, 4))).toBe(three);
    expect(changes(withMeterFrom(three, 4, m(4, 4)))).toEqual([[0, 0, '4/4'], [2, 8, '3/4'], [4, 14, '4/4']]);
    // meters[0] is always bar 0, beat 0
    expect(withMeterFrom(three, 0, m(5, 4)).meters[0]).toEqual({ bar: 0, beat: 0, meter: m(5, 4) });
  });

  it('removing a change gives back the signature before it; a one-bar change goes whole', () => {
    const single = withMeterForBar(c44, 3, m(2, 4));
    expect(withoutMeterChange(single, 3).meters).toEqual(c44.meters);
    const three = withMeterFrom(c44, 2, m(3, 4));
    expect(withoutMeterChange(three, 2).meters).toEqual(c44.meters);
    expect(withoutMeterChange(three, 0)).toBe(three);
    expect(withoutMeterChange(three, 5)).toBe(three);
    expect(meterChangeAt(three, 2)?.meter).toEqual(m(3, 4));
    expect(meterChangeAt(three, 3)).toBeNull();
  });

  it('a later change keeps its time: it moves to the nearest new bar line', () => {
    const base = withMeterFrom(c44, 8, m(2, 4)); // 2/4 from 16 s
    expect(barStartTime(base, 8)).toBe(16);
    // 3/4 from bar 2: bar lines every 1.5 s from 4 s; 16 s is one of them (bar 10).
    const a = withMeterFrom(base, 2, m(3, 4));
    expect(changes(a).map(([bar, , k]) => [bar, k])).toEqual([[0, '4/4'], [2, '3/4'], [10, '2/4']]);
    expect(barStartTime(a, 10)).toBe(16);
    // 5/4 from bar 2: lines at 4, 6.5, 9, 11.5, 14, 16.5: the nearest to 16 s.
    const b = withMeterFrom(base, 2, m(5, 4));
    expect(meterChangeList(b).map((c) => [c.bar, c.time])).toEqual([[0, 0], [2, 4], [7, 16.5]]);
    // Exactly halfway between two new bar lines (15 and 17 s), it keeps its bar number.
    const c = withMeterForBar(base, 2, m(2, 4));
    expect(meterChangeList(c).map((x) => [x.bar, x.time])).toEqual([[0, 0], [2, 4], [3, 5], [8, 15]]);
  });

  it('« only this bar » before an existing change: that change is the next bar', () => {
    const base = withMeterFrom(c44, 4, m(3, 4));
    expect(changes(withMeterForBar(base, 3, m(2, 4)))).toEqual([[0, 0, '4/4'], [3, 12, '2/4'], [4, 14, '3/4']]);
    // and a permanent change before it holds until it
    expect(changes(withMeterFrom(base, 2, m(5, 4))).map(([bar, , k]) => [bar, k])).toEqual([[0, '4/4'], [2, '5/4'], [4, '3/4']]);
  });

  it('a new denominator on bar 1 renumbers the map: the quarter stays the quarter, the times stay', () => {
    const six = withMeterFrom(c44, 0, m(6, 8));
    expect(beatUnit(six)).toBe(8);
    expect(six.segments[0]!.bpm).toBe(240);
    expect(lines(six, 0, 3)).toEqual([[0, 0], [1, 1.5], [2, 3]]);
    // the whole piece in 6/8: the tempo is read per dotted quarter
    expect(mainMeter(six, 60)).toEqual(m(6, 8));
    expect(nominalBpm(six) / feltBeat(six, 60)).toBe(80);
    // only bar 1 in 6/8: the piece is in 4/4, its tempo still reads 120
    const one = withMeterForBar(c44, 0, m(6, 8));
    expect(lines(one, 0, 4)).toEqual([[0, 0], [1, 1.5], [2, 3.5]]);
    expect(mainMeter(one, 60)).toEqual(m(4, 4));
    expect(nominalBpm(one) / feltBeat(one, 60)).toBe(120);
    // and back to 4/4: the map of before
    expect(withMeterFrom(one, 0, m(4, 4))).toEqual(c44);
  });

  it('a change at a bar after a fractional bar (7/8) works from its own bar line', () => {
    const map = withMeterFrom(withMeterForBar(c44, 1, m(7, 8)), 3, m(3, 4));
    expect(lines(map, 0, 9)).toEqual([[0, 0], [1, 2], [2, 3.75], [3, 5.75], [4, 7.25], [5, 8.75]]);
  });
});

describe('the corrections of the grid keep the user’s signatures', () => {
  const T = analysedTimes[16]!; // bar 4 of the analysed grid
  const single = withMeterForBar(analysed, 4, m(2, 4)); // 2/4 at T, 4/4 again one analysed beat pair later
  const timeOf = (map: TempoMap, k: string) => meterChangeList(map).filter((c) => `${c.meter.numerator}/${c.meter.denominator}` === k && c.change).map((c) => r(c.time));

  it('tempo × 2 and ÷ 2 keep the change at its time', () => {
    expect(timeOf(doubleTempo(single), '2/4')).toEqual([r(T)]);
    expect(timeOf(doubleTempo(single), '4/4')).toEqual([r(analysedTimes[18]!)]);
    expect(timeOf(halveTempo(single), '2/4')).toEqual([r(T)]);
  });

  it('moving the first beat moves the bar lines, the change goes with its bar', () => {
    const later = shiftDownbeat(single, 1);
    expect(meterChangeAt(later, 4)?.meter).toEqual(m(2, 4));
    expect(r(barStartTime(later, 4))).toBe(r(analysedTimes[17]!));
    const near = downbeatNear(single, analysedTimes[2]! + 0.05);
    expect(meterChangeAt(near, 4)?.meter ?? meterChangeAt(near, 3)?.meter).toEqual(m(2, 4));
  });

  it('beats per bar and the metronome panel’s meter change the first signature only', () => {
    const three = withMeterFrom(analysed, 4, m(3, 4));
    const two = withNumerator(three, 2);
    expect(changes(two).map(([bar, , k]) => [bar, k])).toEqual([[0, '2/4'], [8, '3/4']]);
    expect(r(barStartTime(two, 8))).toBe(r(T));
    const six = withMeter(three, m(6, 8));
    expect(six.meters[0]!.meter).toEqual(m(6, 8));
    expect(timeOf(six, '3/4')).toEqual([r(T)]);
  });

  it('a typed tempo keeps the bar numbers of the changes', () => {
    const manual = withMeterFrom(c44, 4, m(3, 4));
    const slower = withManualGrid(manual, { bpm: 100 });
    expect(changes(slower)).toEqual([[0, 0, '4/4'], [4, 16, '3/4']]);
    expect(withManualGrid(manual, { numerator: 3 }).meters.length).toBe(1);
  });

  it('signatures are placed again on a new grid by time', () => {
    const fresh = tempoMapFromBeats(analysedTimes.map((t) => t + 0.01), 0, m(4, 4), 'analysis');
    const back = withMetersOf(fresh, single);
    expect(back.origin).toBe('corrected');
    expect(meterChangeList(back).map((c) => [c.bar, `${c.meter.numerator}/${c.meter.denominator}`])).toEqual([[0, '4/4'], [4, '2/4'], [5, '4/4']]);
    expect(withMetersOf(fresh, analysed)).toBe(fresh);
    // the target's own changes are replaced by the source's
    expect(withMetersOf(single, analysed).meters).toEqual(analysed.meters);
  });
});
