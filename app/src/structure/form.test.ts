import { describe, expect, it } from 'vitest';
import { transposeChord } from '../harmony/chord';
import type { HarmonyBar } from './types';
import { analyseForm } from './form';
import { knownStandard, loadCorpus } from './bench/cases';
import { AABA, BLUES, chartBars, repeat } from './testCharts';

const opts = { known: [], key: null, keyChanges: [] };
const INTRO = 'Dm7 | G7 | Em7 A7 | Dm7 G7';

describe('structure form: chorus length and letters', () => {
  it('finds an AABA of 32 bars after a 4-bar intro, and its letters', () => {
    const bars = chartBars(`${INTRO} | ${repeat(AABA, 4)}`);
    const fa = analyseForm(bars, opts);
    expect(fa.chorus?.chorusLength).toBe(32);
    expect(fa.chorus?.form).toBe('AABA');
    expect(fa.chorus?.introEnd).toBe(4);
    expect(fa.chorus?.outroStart).toBe(bars.length);
    expect(fa.chorus?.choruses.map((c) => c.first)).toEqual([4, 36, 68, 100]);
    expect(fa.chorus?.sections.map((s) => s.letter).join('')).toBe('AABA'.repeat(4));
  });

  it('starts the choruses where the user wrote the first letter by hand (fixed points)', () => {
    const bars = chartBars(repeat(BLUES, 6));
    expect(analyseForm(bars, opts).chorus?.choruses[1]!.first).toBe(12);
    const fixed = [4, 16, 28].map((bar) => ({ bar, letter: 'A' }));
    const fa = analyseForm(bars, { ...opts, fixed });
    expect(fa.chorus?.chorusLength).toBe(12);
    expect(fa.chorus?.choruses.map((c) => c.first).slice(0, 3)).toEqual([4, 16, 28]);
  });

  it('starts the choruses where a part written by hand starts (Thème, Solo), and the phrases on its bounds', () => {
    const bars = chartBars(repeat(BLUES, 6));
    const fa = analyseForm(bars, { ...opts, anchors: { chorus: [5, 17], phrase: [] } });
    expect(fa.chorus?.choruses.map((c) => c.first).slice(0, 2)).toEqual([5, 17]);
    const song = chartBars(repeat('C | Am | F | G | C | Am | F | G | F | G | Em | Am | F | G | C | C', 3));
    expect(analyseForm(song, opts).phrases?.sections[1]!.first).toBe(8);
    expect(analyseForm(song, { ...opts, anchors: { chorus: [], phrase: [3] } }).phrases?.sections.map((x) => x.first).slice(0, 2)).toEqual([3, 11]);
  });

  it('takes 12 bars for a blues played many times, not 24', () => {
    const fa = analyseForm(chartBars(repeat(BLUES, 6)), opts);
    expect(fa.chorus?.chorusLength).toBe(12);
    expect(fa.chorus?.form).toBe('A');
  });

  it('finds nothing in a piece played once without repeats, and invents no letter', () => {
    const once = 'Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | E7 | Dm7 | G7 | Cmaj7 | A7 | Dm7 | E7 | Am7 | Am7 | Fmaj7 | Bb7 | Am7 | D7 | Gm7 | C7 | Fmaj7 | E7 | Am7 | Am7 | F#m7b5 | Fmaj7 | Dm7 | E7 | Am7 | Am7';
    const fa = analyseForm(chartBars(once), opts);
    expect(fa.chorus).toBeNull();
    expect(fa.phrases).toBeNull();
  });

  it('survives a bar dropped by the grid in the middle of the piece', () => {
    const bars = chartBars(repeat(AABA, 4));
    // bars 50 and 51 read as one (the second's chords squashed in)
    const merged: HarmonyBar = { ...bars[50]!, end: bars[51]!.end, chords: [...bars[50]!.chords, ...bars[51]!.chords.map((c) => ({ ...c, beat: 3 }))] };
    const dropped = [...bars.slice(0, 50), merged, ...bars.slice(52)].map((b, i) => ({ ...b, bar: i }));
    const fa = analyseForm(dropped, opts);
    expect(fa.chorus?.chorusLength).toBe(32);
    expect(fa.chorus?.choruses.length).toBe(4);
    expect(fa.chorus?.choruses[2]!.first).toBe(63);
  });

  it('finds a last chorus played a half step up', () => {
    const bars = chartBars(repeat(AABA, 4));
    const up = bars.map((b, i) => (i < 96 ? b : { ...b, chords: b.chords.map((c) => ({ ...c, chord: c.chord ? transposeChord(c.chord, 1) : null })) }));
    const fa = analyseForm(up, opts);
    expect(fa.chorus?.chorusLength).toBe(32);
    expect(fa.chorus?.choruses.map((c) => c.transpose)).toEqual([0, 0, 0, 1]);
    expect(fa.chorus?.outroStart).toBe(128);
  });

  it('numbers pick-up bars below zero without changing the form', () => {
    const bars = chartBars(`G7 | ${repeat(AABA, 3)}`, { firstBar: -1 });
    const fa = analyseForm(bars, opts);
    expect(bars[0]!.bar).toBe(-1);
    expect(fa.chorus?.form).toBe('AABA');
    expect(fa.chorus?.introEnd).toBe(1);
  });

  it('reads N.C. bars as nothing: a drum solo chorus does not break the run', () => {
    const nc = Array.from({ length: 32 }, () => 'N.C.').join(' | ');
    const fa = analyseForm(chartBars([AABA, AABA, nc, AABA].join(' | ')), opts);
    expect(fa.chorus?.chorusLength).toBe(32);
    expect(fa.chorus?.introEnd).toBe(0);
    expect(fa.chorus?.outroStart).toBe(128);
  });

  it('handles a meter change mid-piece and a piece of 6 bars without throwing', () => {
    const waltz = chartBars(repeat(BLUES, 2), { beats: 3 });
    const four = chartBars(repeat(BLUES, 3), { start: waltz[waltz.length - 1]!.end });
    const mixed = [...waltz, ...four].map((b, i) => ({ ...b, bar: i }));
    expect(analyseForm(mixed, opts).chorus?.chorusLength).toBe(12);
    const tiny = analyseForm(chartBars('C | F | G7 | C | F | G7'), opts);
    expect(tiny.chorus).toBeNull();
  });

  it('takes the letters and the length of a known chart that fits (AABA with a 16-bar bridge)', () => {
    const ipanema = loadCorpus().find((p) => p.id === 'ipanema-chant')!;
    const known = knownStandard(ipanema)!;
    const body = known.chart.bars.map((b) => b.chords.map((c) => c.text).join(' ')).join(' | ');
    const bars = chartBars(repeat(body, 3));
    const fa = analyseForm(bars, { known: [known], key: { tonic: ipanema.key.tonic, mode: ipanema.key.mode }, keyChanges: [] });
    expect(fa.knownFits).toBe(true);
    expect(fa.chorus?.source).toBe('known');
    expect(fa.chorus?.chorusLength).toBe(40);
    expect(fa.chorus?.form).toBe('AABA');
    expect(fa.chorus?.formSections.map((s) => s.end - s.start)).toEqual([8, 8, 16, 8]);
  });
});

describe('structure form: pop phrases', () => {
  it('cuts a song into 8-bar phrases after its intro, with letters only for what repeats', () => {
    const verse = 'A | E | F#m | D | A | E | D | E';
    const chorus = 'D | A | E | F#m | D | A | E | E';
    const bars = chartBars(['A | E | A | E', verse, chorus, verse, chorus, 'Bm | E | C#m | F#m | Bm | E | A | A', chorus, chorus, 'A | A'].join(' | '));
    const fa = analyseForm(bars, opts);
    expect(fa.phrases?.introEnd).toBe(4);
    expect(fa.phrases?.sections.map((s) => s.letter).join('')).toBe('ABABCBB');
    expect(fa.phrases?.outroStart).toBe(bars.length - 2);
  });
});
