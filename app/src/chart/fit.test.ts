import { describe, expect, it } from 'vitest';
import { chord } from '../harmony/chord';
import { constantTempoMap } from '../grid/tempoMap';
import { emptyCorrections } from '../model/corrections';
import { movableBeats, withBarChords, withChordMoved, type BarEntry } from './edits';
import { chordStart, fitLayout, fitsAt, FIT_RATIOS, PRINT_GEOMETRY, type FitChord, type FitGeometry } from './fit';
import { chartBars, resolveChords } from './layout';

// A desktop bar: 206 px wide, chords of 30 px; a phone bar: 91 px, chords of 21 px.
const desktop: FitGeometry = { width: 206, padLeft: 16, padRight: 8, base: 30, room: 77 };
const phone: FitGeometry = { width: 91, padLeft: 8, padRight: 2, base: 21, room: 64 };

// Widths in em, in the order of what the chart's font gives: « Dm7 » 2.0, « G7 » 1.3, « C♯m7♭5 » 2.6, « F♯7♭9 » 2.6.
const SHORT = 2.0;
const LONG1 = 2.6;
const LONG2 = 2.6;
const at = (beat: number, beats: number, em: number): FitChord => ({ frac: beat / beats, em });

describe('where chords sit in a bar', () => {
  it('beat 3 of 4 is in the middle of the bar, beats 2 and 4 at the quarters', () => {
    const inside = desktop.width - desktop.padLeft - desktop.padRight;
    const x = [0, 1, 2, 3].map((b) => chordStart(b / 4, desktop));
    expect(x[0]).toBe(desktop.padLeft);
    expect(x[2]! - desktop.padLeft).toBeCloseTo(inside / 2, 6);
    expect(x[1]! - desktop.padLeft).toBeCloseTo(inside / 4, 6);
    expect(x[3]! - desktop.padLeft).toBeCloseTo((inside * 3) / 4, 6);
  });

  it('3/4 has three places, 6/4 six: in proportion', () => {
    const inside = desktop.width - desktop.padLeft - desktop.padRight;
    expect(chordStart(1 / 3, desktop) - desktop.padLeft).toBeCloseTo(inside / 3, 6);
    expect(chordStart(3 / 6, desktop) - desktop.padLeft).toBeCloseTo(inside / 2, 6);
  });
});

describe('the size of a bar’s chords', () => {
  it('two short chords on beats 1 and 3 keep the normal size, on one row', () => {
    expect(fitLayout([at(0, 4, SHORT), at(2, 4, SHORT)], desktop)).toEqual({ step: 0, rows: 1 });
  });

  it('one chord, even at beat 4, is not made smaller when it fits', () => {
    expect(fitLayout([at(3, 4, 1.2)], desktop)).toEqual({ step: 0, rows: 1 });
  });

  it('« C♯m7♭5 » then « F♯7♭9 » on beats 1 and 3: normal size when the bar is wide enough, the next steps when not', () => {
    const pair = [at(0, 4, LONG1), at(2, 4, LONG2)];
    expect(fitLayout(pair, desktop).step).toBe(0);
    // A bar of 150 px: the first symbol (78 px at 30 px) would touch the second at the middle.
    const narrow: FitGeometry = { ...desktop, width: 150, room: 77 };
    const r = fitLayout(pair, narrow);
    expect(r.step).toBeGreaterThan(0);
    expect(fitsAt(pair, narrow, FIT_RATIOS[r.step]!, r.rows)).toBe(true);
  });

  it('four chords on four beats of a desktop bar go down the steps on one row', () => {
    const four = [0, 1, 2, 3].map((b) => at(b, 4, SHORT));
    const r = fitLayout(four, desktop);
    expect(r.rows).toBe(1);
    expect(r.step).toBeGreaterThan(0);
    expect(fitsAt(four, desktop, FIT_RATIOS[r.step]!, 1)).toBe(true);
  });

  it('on a phone, chords that cannot be read side by side go on two rows rather than shrink further', () => {
    // Two chords one beat apart in a bar 91 px wide: side by side they would need 8 px letters.
    const close = [at(0, 4, 2.4), at(1, 4, 2.4)];
    const r = fitLayout(close, phone);
    expect(r.rows).toBe(2);
    expect(r.step).toBeLessThanOrEqual(2);
    expect(fitsAt(close, phone, FIT_RATIOS[r.step]!, 2)).toBe(true);
    expect(fitsAt(close, phone, FIT_RATIOS[2]!, 1)).toBe(false);
  });

  it('every answer that is not the last resort really fits', () => {
    for (const g of [desktop, phone, PRINT_GEOMETRY]) {
      for (const beats of [3, 4, 5, 7]) {
        for (const placed of [[0, 2], [0, 1], [0, 2, 3], [0, 1, 2, 3], [1, 3], [3]]) {
          const chords = placed.filter((b) => b < beats).map((b) => at(b, beats, 2.4));
          const r = fitLayout(chords, g);
          const last = r.step === FIT_RATIOS.length - 1;
          if (!last) expect(fitsAt(chords, g, FIT_RATIOS[r.step]!, r.rows)).toBe(true);
        }
      }
    }
  });

  it('a symbol too long for any step is still written, at the smallest step', () => {
    const r = fitLayout([at(0, 4, 40), at(1, 4, 40)], phone);
    expect(r.step).toBe(FIT_RATIOS.length - 1);
  });

  it('never leaves the bar: a last chord reaching past the bar line is made smaller', () => {
    const r = fitLayout([at(3, 4, 2.6)], desktop);
    expect(r.step).toBeGreaterThan(0);
  });
});

describe('putting a chord on a beat', () => {
  const two: BarEntry[] = [
    { beatInBar: 0, chord: chord(0, 'maj7') },
    { beatInBar: 2, chord: chord(7, '7') },
  ];

  it('the second chord of a bar can be on beat 2, 3 or 4; the first on beat 1 or 2', () => {
    expect(movableBeats(two, 1, 4)).toEqual([1, 2, 3]);
    expect(movableBeats(two, 0, 4)).toEqual([0, 1]);
  });

  it('a lone chord can go anywhere in its bar', () => {
    expect(movableBeats([{ beatInBar: 2, chord: chord(5, 'maj7') }], 0, 4)).toEqual([0, 1, 2, 3]);
    expect(movableBeats([{ beatInBar: 0, chord: chord(5, 'maj7') }], 0, 3)).toEqual([0, 1, 2]);
  });

  it('chords never pass each other: the beats of the neighbours are out of reach', () => {
    const four: BarEntry[] = [0, 1, 2, 3].map((b) => ({ beatInBar: b, chord: chord(b, 'min7') }));
    expect(movableBeats(four, 1, 4)).toEqual([1]);
  });

  it('moving a chord changes its beat only; a beat out of reach changes nothing', () => {
    expect(withChordMoved(two, 1, 3, 4).map((e) => e.beatInBar)).toEqual([0, 3]);
    expect(withChordMoved(two, 1, 0, 4).map((e) => e.beatInBar)).toEqual([0, 2]);
    expect(withChordMoved(two, 0, 3, 4).map((e) => e.beatInBar)).toEqual([0, 2]);
  });

  it('written in the bar, the chord is where its beat is: the chart puts it there', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const corr = withBarChords(emptyCorrections(), map, 0, withChordMoved(two, 1, 3, 4));
    const bars = chartBars({ map, chords: resolveChords(map, null, corr), sections: [], duration: 2 });
    expect(bars[0]!.chords.map((c) => c.beatInBar)).toEqual([0, 3]);
  });
});
