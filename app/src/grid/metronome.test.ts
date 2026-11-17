import { describe, expect, it } from 'vitest';
import { defaultAcceleration } from '../model/metronome';
import { withMeter } from './corrections';
import { withMeterFrom } from './meters';
import {
  accelerationFactor,
  accelerationStatus,
  accelerationSteps,
  clampAcceleration,
  CLICK_ACCENT,
  CLICK_NORMAL,
  CLICK_SOFT,
  countInClicks,
  defaultGrouping,
  defaultPattern,
  feltUnits,
  groupingChoices,
  isValidPattern,
  levelsFromGrouping,
  metronomeClickTrack,
  nextLevel,
  patternFor,
  stepOfPass,
} from './metronome';
import { beatToTime, constantTempoMap, timeToBar, variableTempoMap } from './tempoMap';

const m = (numerator: number, denominator: number) => ({ numerator, denominator });

describe('meters and groupings', () => {
  it('felt beat: quarter in x/4, dotted quarter in 6/8 9/8 12/8, quarter in the other x/8', () => {
    expect(feltUnits(m(4, 4))).toBe(1);
    expect(feltUnits(m(6, 8))).toBe(3);
    expect(feltUnits(m(12, 8))).toBe(3);
    expect(feltUnits(m(7, 8))).toBe(2);
    expect(feltUnits(m(5, 8))).toBe(2);
  });

  it('default groupings', () => {
    expect(defaultGrouping(m(4, 4))).toEqual([4]);
    expect(defaultGrouping(m(3, 4))).toEqual([3]);
    expect(defaultGrouping(m(5, 4))).toEqual([3, 2]);
    expect(defaultGrouping(m(7, 4))).toEqual([4, 3]);
    expect(defaultGrouping(m(7, 8))).toEqual([2, 2, 3]);
    expect(defaultGrouping(m(6, 8))).toEqual([3, 3]);
    expect(defaultGrouping(m(12, 8))).toEqual([3, 3, 3, 3]);
    expect(defaultGrouping(m(11, 8)).reduce((a, b) => a + b)).toBe(11);
  });

  it('choices: none under five beats; 7/8 as 2+2+3, 2+3+2, 3+2+2; 5/4 as 3+2 or 2+3', () => {
    expect(groupingChoices(m(4, 4))).toEqual([]);
    expect(groupingChoices(m(7, 8)).map((g) => g.join('+'))).toEqual(['2+2+3', '2+3+2', '3+2+2']);
    expect(groupingChoices(m(5, 4)).map((g) => g.join('+'))).toEqual(['3+2', '2+3']);
    expect(groupingChoices(m(7, 4))[0]).toEqual([4, 3]);
    expect(groupingChoices(m(12, 8)).length).toBeLessThanOrEqual(6);
    for (const g of groupingChoices(m(12, 8))) expect(g.reduce((a, b) => a + b)).toBe(12);
  });

  it('default levels: bar accented, group starts normal, inside groups soft; one group: all normal', () => {
    expect(levelsFromGrouping([4])).toEqual(['accent', 'normal', 'normal', 'normal']);
    expect(levelsFromGrouping([2, 2, 3])).toEqual(['accent', 'soft', 'normal', 'soft', 'normal', 'soft', 'soft']);
    expect(levelsFromGrouping([3, 3])).toEqual(['accent', 'soft', 'soft', 'normal', 'soft', 'soft']);
  });

  it('patterns: the user’s when it fits the meter, else the default; levels cycle', () => {
    const p = { grouping: [3, 2], levels: ['accent', 'soft', 'soft', 'normal', 'silent'] as const };
    expect(isValidPattern(p, m(5, 4))).toBe(true);
    expect(isValidPattern(p, m(4, 4))).toBe(false);
    expect(isValidPattern({ grouping: [2, 2], levels: ['accent', 'x', 'normal', 'normal'] }, m(4, 4))).toBe(false);
    expect(patternFor({ '5/4': { grouping: [3, 2], levels: [...p.levels] } }, m(5, 4)).levels[4]).toBe('silent');
    expect(patternFor({ '5/4': { grouping: [2, 2], levels: ['accent'] } }, m(5, 4))).toEqual(defaultPattern(m(5, 4)));
    expect(nextLevel('accent')).toBe('normal');
    expect(nextLevel('normal')).toBe('soft');
    expect(nextLevel('soft')).toBe('silent');
    expect(nextLevel('silent')).toBe('accent');
  });
});

describe('click track', () => {
  it('4/4 at 120: a click per beat, downbeats accented, codes 1 and 0', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' });
    const c = metronomeClickTrack(map, 0, 4, {});
    expect([...c.times]).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect([...c.accents]).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it('7/8 grouped 2+2+3, eighths at 280: levels from the grouping, silent beats have no click', () => {
    const map = constantTempoMap({ bpm: 280, firstDownbeat: 0, meter: m(7, 8), origin: 'manual' });
    const eighth = 60 / 280;
    const c = metronomeClickTrack(map, 0, 14 * eighth - 1e-9, {});
    expect(c.times.length).toBe(14);
    c.times.forEach((t, i) => expect(t).toBeCloseTo(i * eighth, 9));
    expect([...c.accents].slice(0, 7)).toEqual([CLICK_ACCENT, CLICK_SOFT, CLICK_NORMAL, CLICK_SOFT, CLICK_NORMAL, CLICK_SOFT, CLICK_SOFT]);
    const silenced = metronomeClickTrack(map, 0, 14 * eighth - 1e-9, { '7/8': { grouping: [2, 2, 3], levels: ['accent', 'silent', 'normal', 'silent', 'normal', 'silent', 'silent'] } });
    expect(silenced.times.length).toBe(6);
    expect(silenced.times[1]).toBeCloseTo(2 * eighth, 9);
  });

  it('follows a variable tempo map exactly (the beats are its beats)', () => {
    const map = variableTempoMap([{ time: 0.3, bpm: 100 }, { time: 2.7, bpm: 140 }, { time: 5, bpm: 90 }], [{ bar: 0, meter: m(3, 4) }], 'analysis');
    const c = metronomeClickTrack(map, 0, 8, {});
    c.times.forEach((t, i) => {
      const pos = timeToBar(map, t);
      expect(Math.abs(pos.beatInBar - Math.round(pos.beatInBar))).toBeLessThan(1e-9);
      expect(c.accents[i]).toBe(Math.round(pos.beatInBar) === 0 ? CLICK_ACCENT : CLICK_NORMAL);
    });
    expect(c.times.length).toBeGreaterThan(10);
  });
});

describe('count-in', () => {
  const map = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: m(4, 4), origin: 'manual' });
  it('one bar before a downbeat: four clicks a beat apart, the first accented, the last a beat before', () => {
    const ci = countInClicks(map, 5, 1, {})!;
    expect([...ci.offsets]).toEqual([2, 1.5, 1, 0.5]);
    expect([...ci.levels]).toEqual([CLICK_ACCENT, CLICK_NORMAL, CLICK_NORMAL, CLICK_NORMAL]);
  });

  it('two bars, at the tempo of the bar that follows the start', () => {
    const v = variableTempoMap([{ time: 0, bpm: 60 }, { time: 10, bpm: 150 }], [{ bar: 0, meter: m(4, 4) }], 'analysis');
    const start = beatToTime(v, 12);
    const ci = countInClicks(v, start, 2, {})!;
    expect(ci.offsets.length).toBe(8);
    expect(ci.offsets[0]).toBeCloseTo(8 * 0.4, 9);
    expect(ci.offsets[7]).toBeCloseTo(0.4, 9);
  });

  it('a start between two beats: the clicks stay on the grid’s beats, so the music comes in where it is', () => {
    const ci = countInClicks(map, 5.25, 1, {})!;
    expect([...ci.offsets]).toEqual([1.75, 1.25, 0.75, 0.25]);
    // the clicks are the beats at 3.5, 4, 4.5 and 5 s: the one at 5 s is a downbeat
    expect([...ci.levels]).toEqual([CLICK_NORMAL, CLICK_NORMAL, CLICK_NORMAL, CLICK_ACCENT]);
  });

  it('a silent beat of the pattern still counts (softly); none when off', () => {
    const ci = countInClicks(map, 5, 1, { '4/4': { grouping: [4], levels: ['silent', 'normal', 'silent', 'normal'] } })!;
    expect([...ci.levels]).toEqual([CLICK_SOFT, CLICK_NORMAL, CLICK_SOFT, CLICK_NORMAL]);
    expect(countInClicks(map, 5, 0, {})).toBeNull();
  });

  it('7/8: seven eighths before the start', () => {
    const map78 = constantTempoMap({ bpm: 280, firstDownbeat: 0, meter: m(7, 8), origin: 'manual' });
    const start = beatToTime(map78, 7);
    const ci = countInClicks(map78, start, 1, {})!;
    expect(ci.offsets.length).toBe(7);
    expect(ci.offsets[0]).toBeCloseTo(7 * (60 / 280), 9);
    expect([...ci.levels]).toEqual([CLICK_ACCENT, CLICK_SOFT, CLICK_NORMAL, CLICK_SOFT, CLICK_NORMAL, CLICK_SOFT, CLICK_SOFT]);
  });
});

describe('progressive acceleration', () => {
  it('steps from the start to the target, the last one is the target', () => {
    expect(accelerationSteps({ ...defaultAcceleration(), startPercent: 70, stepPercent: 5, targetPercent: 100 })).toEqual([70, 75, 80, 85, 90, 95, 100]);
    expect(accelerationSteps({ ...defaultAcceleration(), startPercent: 70, stepPercent: 7, targetPercent: 90 })).toEqual([70, 77, 84, 90]);
    expect(accelerationFactor({ ...defaultAcceleration(), startPercent: 60, stepPercent: 10, targetPercent: 80 }, 99)).toBe(0.8);
  });

  it('passes per step, and it stays at the target', () => {
    const plan = { ...defaultAcceleration(), startPercent: 80, stepPercent: 10, everyRepeats: 2, targetPercent: 100 };
    expect([0, 1, 2, 3, 4, 5, 6, 40].map((p) => stepOfPass(plan, p))).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
    expect(accelerationStatus(plan, 2)).toEqual({ step: 2, steps: 3, percent: 100, atTarget: true });
    expect(accelerationStatus(plan, 0).atTarget).toBe(false);
  });

  it('numbers are kept in range, the start below the target', () => {
    const p = clampAcceleration({ enabled: true, startPercent: 120, stepPercent: 0, everyRepeats: 99, targetPercent: 100 });
    expect(p).toEqual({ enabled: true, startPercent: 99, stepPercent: 1, everyRepeats: 16, targetPercent: 100 });
  });
});

describe('meter correction (withMeter)', () => {
  const map = constantTempoMap({ bpm: 120, firstDownbeat: 0.5, meter: m(4, 4), origin: 'manual' });
  it('4/4 to 6/8: the quarter beats become dotted quarters, the beat times stay', () => {
    const six = withMeter(map, m(6, 8));
    expect(six.meters[0]!.meter).toEqual(m(6, 8));
    // bar 2 starts two old beats later (2 dotted quarters), the eighth grid at 360
    expect(beatToTime(six, 6)).toBeCloseTo(beatToTime(map, 2), 9);
    expect(six.segments[0]!.bpm).toBe(360);
  });
  it('4/4 to 7/8: the quarter stays the quarter (two eighths)', () => {
    const seven = withMeter(map, m(7, 8));
    expect(beatToTime(seven, 7)).toBeCloseTo(beatToTime(map, 3.5), 9);
  });
  it('back to 4/4 gives the same beats; an unchanged meter is the same map; others refused', () => {
    const back = withMeter(withMeter(map, m(6, 8)), m(4, 4));
    expect(beatToTime(back, 4)).toBeCloseTo(beatToTime(map, 4), 9);
    expect(withMeter(map, m(4, 4))).toBe(map);
    expect(() => withMeter(map, m(4, 3))).toThrow();
  });
});

describe('a piece with several signatures (C13)', () => {
  // 4/4 for two bars (8 beats), then 7/8 from bar 3 (3.5 quarters each): the click follows each bar's own pattern.
  it('clicks the accents of the signature of each bar', () => {
    const map = withMeterFrom(constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' }), 2, m(7, 8));
    const levels = ['accent', 'silent', 'soft', 'accent', 'normal', 'normal', 'soft'] as const;
    const track = metronomeClickTrack(map, 0, 8 * 0.5 + 7 * 0.25 - 0.01, { '7/8': { grouping: [3, 4], levels: [...levels] } });
    expect([...track.accents.slice(0, 8)]).toEqual([CLICK_ACCENT, CLICK_NORMAL, CLICK_NORMAL, CLICK_NORMAL, CLICK_ACCENT, CLICK_NORMAL, CLICK_NORMAL, CLICK_NORMAL]);
    // the 7/8 bar: its second beat is silent (no click), the others follow the user's levels
    expect([...track.accents.slice(8)]).toEqual([CLICK_ACCENT, CLICK_SOFT, CLICK_ACCENT, CLICK_NORMAL, CLICK_NORMAL, CLICK_SOFT]);
    expect(track.times.length).toBe(14); // 8 + 7 beats minus the silent one
  });
});
