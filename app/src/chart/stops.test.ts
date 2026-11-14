import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { emptyCorrections } from '../model/corrections';
import type { AnalysedChord } from '../model/analysis';
import { chartBars, resolveChords } from './layout';
import { chordStops, moveStop, stopKey } from './stops';

const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const an = (time: number, c = chord(0, 'maj7')): AnalysedChord => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [] });
// 12 bars of 2 s. Chords: bar 0, bar 1 (two chords), bar 2 (none: repeat), bar 3 (none), bar 4, bars 5-11 repeat.
const bars = chartBars({
  map,
  chords: resolveChords(map, [an(0), an(2), an(3, chord(5, '7')), an(8), an(10 + 0, chord(7, '7'))], emptyCorrections()),
  sections: [],
  duration: 24,
});

describe('keyboard stops', () => {
  it('one per chord, one per bar without chords', () => {
    const keys = chordStops(bars).map(stopKey);
    expect(keys.slice(0, 6)).toEqual(['0:0', '1:0', '1:1', '2:-1', '3:-1', '4:0']);
    expect(keys).toHaveLength(13); // bars 0, 1 (two chords), 2, 3, 4, 5 and the six bars of repeat signs
  });

  it('left and right go from chord to chord and stop at the ends', () => {
    expect(moveStop(bars, { bar: 0, index: 0 }, 'right')).toEqual({ bar: 1, index: 0 });
    expect(moveStop(bars, { bar: 1, index: 0 }, 'right')).toEqual({ bar: 1, index: 1 });
    expect(moveStop(bars, { bar: 1, index: 1 }, 'right')).toEqual({ bar: 2, index: -1 });
    expect(moveStop(bars, { bar: 0, index: 0 }, 'left')).toEqual({ bar: 0, index: 0 });
    expect(moveStop(bars, { bar: 11, index: -1 }, 'right')).toEqual({ bar: 11, index: -1 });
  });

  it('up and down keep the column, from line to line', () => {
    expect(moveStop(bars, { bar: 1, index: 1 }, 'down')).toEqual({ bar: 5, index: 0 });
    expect(moveStop(bars, { bar: 6, index: -1 }, 'up')).toEqual({ bar: 2, index: -1 });
    expect(moveStop(bars, { bar: 6, index: -1 }, 'down')).toEqual({ bar: 10, index: -1 });
    expect(moveStop(bars, { bar: 2, index: -1 }, 'up')).toEqual({ bar: 2, index: -1 });
  });

  it('first and last', () => {
    expect(moveStop(bars, { bar: 6, index: -1 }, 'first')).toEqual({ bar: 0, index: 0 });
    expect(moveStop(bars, { bar: 6, index: -1 }, 'last')).toEqual({ bar: 11, index: -1 });
  });

  it('a stop that no longer exists starts from the first', () => {
    expect(moveStop(bars, { bar: 99, index: 0 }, 'right')).toEqual({ bar: 1, index: 0 });
  });
});
