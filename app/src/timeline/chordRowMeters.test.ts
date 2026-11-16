// The ruler's « Accords » row with signatures bar by bar (C13): a chord late
// in a long bar (up to 64 beats) stays in order, at the time of its beat.

import { describe, expect, it } from 'vitest';
import { chartBars, resolveChords } from '../chart/layout';
import { withMeterForBar } from '../grid/meters';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { emptyCorrections } from '../model/corrections';
import { inForceAt, orderKey, rowChords } from './chordRow';

const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const an = (time: number, c = chord(0, '7')) => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [] });

describe('the chord row across long bars', () => {
  it('a chord on the 41st beat of a 64/32 bar comes before the next bar, at its time', () => {
    // bar 2 in 64/32: from 2 s to 6 s, 32nds of 0.0625 s
    const map = withMeterForBar(c44, 1, { numerator: 64, denominator: 32 });
    const late = 2 + 40 * 0.0625;
    const chords = resolveChords(map, [an(0, chord(5, '7')), an(late, chord(7, '7')), an(6, chord(0, 'maj7'))], emptyCorrections());
    const items = rowChords(chartBars({ map, chords, sections: [], duration: 8 }), map);
    expect(items.map((i) => [i.bar, i.beatInBar, i.time])).toEqual([[0, 0, 0], [1, 40, late], [2, 0, 6]]);
    expect(items.map((i) => i.order)).toEqual([...items.map((i) => i.order)].sort((a, b) => a - b));
    expect(orderKey(1, 63)).toBeLessThan(orderKey(2, 0));
    expect(inForceAt(items, 2)!.bar).toBe(2);
  });
});
