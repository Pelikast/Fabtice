// The chord chart with signatures bar by bar (C13): bars of different
// lengths, chords on the beats of their bar's own signature, the signature
// written where it changes, hand edits and the playhead in such bars.

import { describe, expect, it } from 'vitest';
import { withMeterForBar, withMeterFrom } from '../grid/meters';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import type { AnalysedChord } from '../model/analysis';
import { emptyCorrections } from '../model/corrections';
import type { Meter } from '../model/tempoMap';
import { withBarChords } from './edits';
import { barProgress, chartBars, resolveChords, sectionBar, timeOfBeatInBar } from './layout';

const m = (numerator: number, denominator: number): Meter => ({ numerator, denominator });
const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' });
const an = (time: number, c = chord(0, 'maj7')): AnalysedChord => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [] });
const key = (x: Meter | null) => (x ? `${x.numerator}/${x.denominator}` : null);

// 4/4; bar 3 alone in 2/4 (4 to 5 s); 6/8 from bar 5 (7 s, bars of 1.5 s).
const map = withMeterFrom(withMeterForBar(c44, 2, m(2, 4)), 4, m(6, 8));

describe('the chart with several signatures', () => {
  it('bars of different lengths, the signature written where it changes and in the first bar', () => {
    const bars = chartBars({ map, chords: [], sections: [], duration: 10 });
    expect(bars.map((b) => [b.bar, b.start, b.end, b.beats])).toEqual([
      [0, 0, 2, 4],
      [1, 2, 4, 4],
      [2, 4, 5, 2],
      [3, 5, 7, 4],
      [4, 7, 8.5, 6],
      [5, 8.5, 10, 6],
    ]);
    expect(bars.map((b) => key(b.signature))).toEqual(['4/4', null, '2/4', '4/4', '6/8', null]);
    expect(bars.map((b) => key(b.meter))).toEqual(['4/4', '4/4', '2/4', '4/4', '6/8', '6/8']);
  });

  it('a piece with one signature writes none in its bars (the title line has it)', () => {
    expect(chartBars({ map: c44, chords: [], sections: [], duration: 8 }).every((b) => b.signature === null)).toBe(true);
  });

  it('chords go to the nearest beat of their bar’s own signature: the eighths of a 6/8 bar', () => {
    const chords = resolveChords(map, [an(0), an(4.52, chord(2, 'min7')), an(7.02, chord(7, '7')), an(7.8, chord(0, 'maj7')), an(8.4, chord(9, 'min7'))], emptyCorrections());
    const bars = chartBars({ map, chords, sections: [], duration: 10 });
    expect(bars[2]!.chords.map((c) => c.beatInBar)).toEqual([1]);
    // 7.8 s is the 4th eighth of the 6/8 bar (3.2 eighths in): beat 3, the middle of the bar, not a quarter.
    expect(bars[4]!.chords.map((c) => c.beatInBar)).toEqual([0, 3]);
    // 8.4 s is 0.1 s before the next bar line: it starts the next bar.
    expect(bars[5]!.chords.map((c) => c.beatInBar)).toEqual([0]);
  });

  it('a hand bar in 6/8: chords on its eighths; the playhead and the sections follow the bar', () => {
    const corr = withBarChords(emptyCorrections(), map, 4, [{ beatInBar: 0, chord: chord(2, 'min7') }, { beatInBar: 3, chord: chord(7, '7') }, { beatInBar: 6, chord: chord(0, 'maj7') }]);
    expect(corr.chords.map((c) => c.time)).toEqual([7, 7.75]);
    expect(timeOfBeatInBar(map, 4, 3)).toBe(7.75);
    expect(timeOfBeatInBar(map, 2, 1)).toBe(4.5);
    const bars = chartBars({ map, chords: resolveChords(map, null, corr), sections: [], duration: 10 });
    expect(bars[4]!.chords.map((c) => [c.beatInBar, c.origin])).toEqual([[0, 'manual'], [3, 'manual']]);
    expect(barProgress(map, 7.75)).toEqual({ bar: 4, progress: 0.5 });
    expect(barProgress(map, 4.5)).toEqual({ bar: 2, progress: 0.5 });
    expect(sectionBar(map, 7.6)).toBe(4);
    expect(sectionBar(map, 8.1)).toBe(5);
  });

  it('pick-up bars keep the first signature: it is written once, in the first bar shown', () => {
    const pick = withMeterForBar(constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: m(4, 4), origin: 'manual' }), 2, m(3, 4));
    const bars = chartBars({ map: pick, chords: resolveChords(pick, [an(0.5)], emptyCorrections()), sections: [], duration: 9 });
    expect(bars[0]!.bar).toBe(-1);
    expect(bars.map((b) => key(b.signature))).toEqual(['4/4', null, null, '3/4', '4/4', null]);
  });
});
