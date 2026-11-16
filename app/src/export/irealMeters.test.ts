// The iReal Pro export with signatures bar by bar (C13): every change written
// where iReal Pro has the signature, the nearest one it has otherwise, with
// the real one in a comment; the produced link is read back with the
// independent decoder of the tests.

import { describe, expect, it } from 'vitest';
import { chartBars, resolveChords } from '../chart/layout';
import { withMeterForBar, withMeterFrom } from '../grid/meters';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { emptyCorrections } from '../model/corrections';
import type { Meter } from '../model/tempoMap';
import { chartBarsOf, decodeIRealLink } from '../test/irealDecoder';
import { buildExportChart } from './chartExport';
import { IREAL_METERS, exportToIRealPro, iRealMeterFor, iRealMeterToken, iRealMusic } from './ireal';

const m = (numerator: number, denominator: number): Meter => ({ numerator, denominator });
const c44 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: m(4, 4), origin: 'manual' });
const an = (time: number, c = chord(0, 'maj7')) => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [] });

// 4/4; bar 3 alone in 2/4 (4 to 5 s); 6/8 from bar 5 (7 s); bar 7 alone in 7/16 (10 to 10.875 s); 6/8 again.
const map = withMeterForBar(withMeterFrom(withMeterForBar(c44, 2, m(2, 4)), 4, m(6, 8)), 6, m(7, 16));

function chartOf(duration: number) {
  const chords = resolveChords(map, [an(0), an(4.5, chord(2, 'min7')), an(7.8, chord(7, '7')), an(10.5, chord(5, 'maj7')), an(10.875, chord(10, '7'))], emptyCorrections());
  return buildExportChart({ title: 'Signatures', bars: chartBars({ map, chords, sections: [], duration }), key: { tonic: 0, mode: 'major' }, semitones: 0, tempo: 120 });
}

describe('iReal Pro: signatures bar by bar', () => {
  it('knows its fourteen signatures and falls back to the nearest for the others', () => {
    for (const x of IREAL_METERS) expect(iRealMeterFor(x)).toEqual({ meter: x, exact: true });
    expect(iRealMeterToken(m(12, 8))).toBe('T12');
    expect(iRealMeterToken(m(6, 8))).toBe('T68');
    const fallback = (n: number, d: number) => {
      const f = iRealMeterFor(m(n, d));
      expect(f.exact).toBe(false);
      return `${f.meter.numerator}/${f.meter.denominator}`;
    };
    expect(fallback(7, 16)).toBe('3/8');
    expect(fallback(11, 16)).toBe('5/8');
    expect(fallback(1, 4)).toBe('3/8');
    expect(fallback(9, 4)).toBe('7/4');
    expect(fallback(64, 32)).toBe('7/4');
    expect(fallback(11, 8)).toBe('12/8');
    expect(fallback(8, 4)).toBe('7/4');
  });

  it('writes each change where it happens; an unknown one as the nearest, with a comment; the file reads back', () => {
    const chart = chartOf(12.3);
    expect(chart.bars.map((b) => (b.timeSignature ? `${b.timeSignature.numerator}/${b.timeSignature.denominator}` : null))).toEqual(['4/4', null, '2/4', '4/4', '6/8', null, '7/16', '6/8']);
    const music = iRealMusic(chart);
    expect(music).toContain('T38<7/16>');
    const out = exportToIRealPro(chart);
    const song = decodeIRealLink(out.url)[0]!;
    const sig = song.bars.map((b) => (b.timeSignature ? `${b.timeSignature.numerator}/${b.timeSignature.denominator}` : null));
    expect(sig).toEqual(['4/4', null, '2/4', '4/4', '6/8', null, '3/8', '6/8']);
    expect(song.bars.map((b) => b.cells.length)).toEqual([4, 4, 2, 4, 6, 6, 3, 6]);
    expect(song.bars[6]!.comments).toEqual(['7/16']);
    const bars = chartBarsOf(song.bars);
    // 2/4: the chord on its second beat; 6/8: on its fourth eighth (the middle); 7/16: sixteenth 4 of 7 -> cell 2 of 3.
    expect(bars[2]!.chords.map((c) => c.beat)).toEqual([1]);
    expect(bars[4]!.chords.map((c) => c.beat)).toEqual([3]);
    expect(bars[6]!.chords.map((c) => c.beat)).toEqual([2]);
    expect(bars[7]!.chords.map((c) => c.beat)).toEqual([0]);
    expect(song.bars[song.bars.length - 1]!.close).toBe('Z');
  });

  it('a 6/8 piece is written T68 (the bars keep their own signature)', () => {
    const six = constantTempoMap({ bpm: 240, firstDownbeat: 0, meter: m(6, 8), origin: 'manual' });
    const chords = resolveChords(six, [an(0), an(0.75, chord(7, '7'))], emptyCorrections());
    const chart = buildExportChart({ title: 'Six', bars: chartBars({ map: six, chords, sections: [], duration: 3 }), key: null, semitones: 0, tempo: 80 });
    expect(chart.timeSignature).toEqual(m(6, 8));
    const song = decodeIRealLink(exportToIRealPro(chart).url)[0]!;
    expect(song.bars[0]!.timeSignature).toEqual(m(6, 8));
    expect(chartBarsOf(song.bars)[0]!.chords.map((c) => c.beat)).toEqual([0, 3]);
  });
});
