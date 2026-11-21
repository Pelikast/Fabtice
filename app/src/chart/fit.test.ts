import { describe, expect, it } from 'vitest';
import { chord } from '../harmony/chord';
import { constantTempoMap } from '../grid/tempoMap';
import { emptyCorrections } from '../model/corrections';
import { movableBeats, withBarChords, withChordMoved, type BarEntry } from './edits';
import { chordStart, fitBar, fitChart, FIT_GAP_EM, FIT_MIN_RIGHT, FIT_RATIOS, type FitChord, type FitGeometry } from './fit';
import { chartBars, resolveChords } from './layout';

// A desktop bar: 206 px wide, chords of 30 px; a phone bar: 91 px, chords of 21 px.
const desktop: FitGeometry = { width: 206, padLeft: 16, padRight: 8, base: 30, room: 77 };
const phone: FitGeometry = { width: 91, padLeft: 8, padRight: 2, base: 21, room: 64 };

// Widths in em, as the chart's font gives: « Dm7 » 2.0, « G7 » 1.3.
const SHORT = 2.0;
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

describe('one size for the whole chart', () => {
  const bar = (chords: FitChord[], g: FitGeometry = desktop) => ({ chords, geometry: g });
  // « D♭7♯11 » is about 4.2 em wide in the chart's font, « D–7⁹ » about 3.2 em.
  const LATE = 4.2;
  const MINOR = 3.2;

  it('two short chords on beats 1 and 3, or one chord: normal size, one row, nothing pushed', () => {
    const r = fitChart([bar([at(0, 4, SHORT), at(2, 4, SHORT)]), bar([at(0, 4, 1.2)])]);
    expect(r.step).toBe(0);
    expect(r.bars.map((b) => b.rows)).toEqual([1, 1]);
    expect(r.bars.flatMap((b) => b.push)).toEqual([0, 0, 0]);
    expect(r.limitedBy).toBeNull();
  });

  it('bar 31: a long symbol on beat 4 does not shrink the bar, it is pushed back against the end bar line', () => {
    // Before: beat 4 starts at 153 px of a 206 px bar, 45 px of room for a 126 px symbol: the whole bar went to 11 px.
    const late = [at(0, 4, 2.2), at(3, 4, LATE)];
    const r = fitChart([bar(late)]);
    expect(r.step).toBe(0);
    const f = r.bars[0]!;
    expect(f.fits).toBe(true);
    expect(f.push[0]).toBe(0);
    expect(f.push[1]!).toBeLessThan(-50);
    // It ends inside the bar, against the bar line.
    const start = chordStart(3 / 4, desktop) + f.push[1]!;
    expect(start + LATE * 30).toBeLessThanOrEqual(desktop.width - FIT_MIN_RIGHT + 0.01);
    expect(start + LATE * 30).toBeGreaterThan(desktop.width - 10);
  });

  it('two long chords that then touch go on two rows at the same size, never smaller', () => {
    const r = fitChart([bar([at(0, 4, MINOR + 1), at(3, 4, LATE + 1)])]);
    expect(r.step).toBe(0);
    expect(r.bars[0]!.rows).toBe(2);
    expect(r.bars[0]!.fits).toBe(true);
  });

  it('the neighbours are not affected: a crowded bar changes its own rows, not the size of the others', () => {
    const calm = bar([at(0, 4, SHORT), at(2, 4, SHORT)]);
    const crowded = bar([at(0, 4, 1.8), at(1, 4, 1.8), at(2, 4, 1.8), at(3, 4, 2.4)]);
    const r = fitChart([calm, crowded, calm]);
    expect(r.step).toBe(0);
    expect(r.bars.map((b) => b.rows)).toEqual([1, 2, 1]);
  });

  it('a chord that would touch the one before it moves right of it rather than shrink everything', () => {
    // Three chords on a phone: beats 1 and 3 share a row and the first is a little too wide for the middle.
    const f = fitBar([at(0, 4, 2.0), at(1, 4, 1.4), at(2, 4, 1.4)], phone, 1);
    expect(f.rows).toBe(2);
    expect(f.fits).toBe(true);
    expect(f.push[2]!).toBeGreaterThan(0);
  });

  it('chords sharing a row are pushed against each other and keep their order and a gap', () => {
    const chords = [at(0, 4, 2), at(1, 4, 2), at(3, 4, LATE)];
    const f = fitBar(chords, desktop, 1);
    const size = desktop.base;
    // Rows by turns: chords 0 and 2 share the first row.
    const x0 = chordStart(0, desktop) + f.push[0]!;
    const x2 = chordStart(3 / 4, desktop) + f.push[2]!;
    expect(f.rows).toBe(2);
    expect(x2).toBeGreaterThanOrEqual(x0 + 2 * size + FIT_GAP_EM * size - 0.01);
  });

  it('the size goes down for the WHOLE chart, and only when a bar does not fit even on two rows', () => {
    // A symbol wider than any bar at the large sizes: every bar follows, the same step.
    const huge = bar([at(0, 4, 6.5)]);
    const calm = bar([at(0, 4, SHORT), at(2, 4, SHORT)]);
    const r = fitChart([calm, huge, calm]);
    expect(r.step).toBeGreaterThan(0);
    expect(r.limitedBy).toBe(1);
    expect(r.lastResort).toBe(false);
    expect(r.bars.every((b) => b.fits)).toBe(true);
    // The step is the largest that works: one larger, the huge bar does not fit.
    expect(fitBar(huge.chords, desktop, FIT_RATIOS[r.step - 1]!).fits).toBe(false);
  });

  it('on a phone a lone symbol of 4 em still fits at the normal size; four chords go on two rows', () => {
    const r = fitChart([bar([at(0, 4, 3.2)], phone), bar([0, 1, 2, 3].map((b) => at(b, 4, 1.4)), phone)]);
    expect(r.step).toBe(0);
    expect(r.bars[1]!.rows).toBe(2);
  });

  it('a symbol too long for any step is still written, at the smallest step, and says so', () => {
    const r = fitChart([bar([at(0, 4, 40), at(1, 4, 40)], phone)]);
    expect(r.step).toBe(FIT_RATIOS.length - 1);
    expect(r.lastResort).toBe(true);
  });

  it('a chart without chords has nothing to fit', () => {
    expect(fitChart([bar([]), bar([])])).toMatchObject({ step: 0, lastResort: false });
  });

  it('every bar of every beat count, on screen and paper, fits or is the declared last resort', () => {
    for (const g of [desktop, phone, { width: 206, padLeft: 16, padRight: 8, base: 30, room: 52 }]) {
      for (const beats of [3, 4, 5, 7]) {
        for (const placed of [[0, 2], [0, 1], [0, 2, 3], [0, 1, 2, 3], [1, 3], [3], [2, 3]]) {
          const chords = placed.filter((b) => b < beats).map((b) => at(b, beats, 3));
          const r = fitChart([bar(chords, g)]);
          expect(r.lastResort || r.bars[0]!.fits).toBe(true);
        }
      }
    }
  });
});

describe('putting a chord on a beat', () => {
  const two: BarEntry[] = [
    { beatInBar: 0, chord: chord(0, 'maj7') },
    { beatInBar: 2, chord: chord(7, '7') },
  ];

  // 1.0.3: a chord goes on a beat or between two beats (half beats: 1.5 is the « et » of beat 2).
  it('the second chord of a bar can be anywhere after the first, on the beats and between them; the first before the second', () => {
    expect(movableBeats(two, 1, 4)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(movableBeats(two, 0, 4)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('a lone chord can go anywhere in its bar', () => {
    expect(movableBeats([{ beatInBar: 2, chord: chord(5, 'maj7') }], 0, 4)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(movableBeats([{ beatInBar: 0, chord: chord(5, 'maj7') }], 0, 3)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it('chords never pass each other: the places of the neighbours are out of reach', () => {
    const four: BarEntry[] = [0, 1, 2, 3].map((b) => ({ beatInBar: b, chord: chord(b, 'min7') }));
    expect(movableBeats(four, 1, 4)).toEqual([0.5, 1, 1.5]);
    const eight: BarEntry[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => ({ beatInBar: b, chord: chord(b * 2, 'min7') }));
    expect(movableBeats(eight, 3, 4)).toEqual([1.5]);
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
