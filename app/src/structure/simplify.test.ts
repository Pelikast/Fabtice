import { describe, expect, it } from 'vitest';
import { chordText } from '../harmony/chord';
import { buildCase, loadCorpus } from './bench/cases';
import { truthSimplifyInput } from './bench/run';
import { autumnChartFailures } from './bench/score';
import { simplifyChart } from './simplify';
import { AABA, AABA_A1, AABA_A2, AABA_B, chartBars, repeat } from './testCharts';
import type { HarmonyBar, SimplifiedChart, SimplifyInput } from './types';

/** Written chart as text: « A x2: Cmaj7 A7 | Dm7 G7 | % » per section. */
function text(c: SimplifiedChart): string[] {
  return c.sections.map((s) => {
    const bars = s.bars.map((i) => {
      const b = c.bars[i]!;
      return b.simile ? '%' : b.chords.map((x) => (x.chord ? chordText(x.chord) : 'NC')).join(' ');
    });
    return `${s.id} x${s.times}: ${bars.join(' | ')}`;
  });
}

/** Marks every `len` bars from `first` with the letters of `form`, repeated. */
function marks(bars: HarmonyBar[], first: number, len: number, form: string, choruses: number): SimplifyInput['sections'] {
  const out: SimplifyInput['sections'] = [];
  for (let c = 0; c < choruses; c++) for (let k = 0; k < form.length; k++) out.push({ bar: bars[first + (c * form.length + k) * len]!.bar, label: form[k]! });
  return out;
}

const input = (bars: HarmonyBar[], sections: SimplifyInput['sections'], parts: SimplifyInput['parts'] = []): SimplifyInput => ({ bars, sections, parts, keyChanges: [], known: [] });

describe('simplified chart', () => {
  it('writes the cahier\'s Autumn Leaves exactly from the true structure', () => {
    const piece = loadCorpus().find((p) => p.id === 'autumn-leaves')!;
    const c = buildCase(piece, { level: 'parfait', evidence: 'none', known: false });
    const chart = simplifyChart(truthSimplifyInput(piece, c.input))!;
    expect(autumnChartFailures(chart)).toEqual([]);
    expect(text(chart)).toEqual([
      'intro x1: Bm | % | % | %',
      'A x2: Em7 | A7 | D△ | G△ | D♭m7♭5 | F♯7 | Bm | %',
      'B x1: D♭m7♭5 | F♯7 | Bm | % | Em7 | A7 | D△ | G△',
      'C x1: D♭m7♭5 | F♯7 | Bm B♭7 | Am7 A♭7 | D♭m7♭5 | F♯7 | Bm | %',
    ]);
    expect(chart.form.map((f) => f.letters)).toEqual(['', 'AABC', 'AABC', 'AA', 'BC']);
  });

  it('places every played bar, counts the passes, and lists the occurrences of each written bar', () => {
    const bars = chartBars(repeat(AABA, 3));
    const chart = simplifyChart(input(bars, marks(bars, 0, 8, 'AABA', 3)))!;
    expect(chart.sections.map((s) => [s.label, s.times, s.variant ?? 1])).toEqual([
      [{ letter: 'A' }, 1, 1],
      [{ letter: 'A' }, 1, 2],
      [{ letter: 'B' }, 1, 1],
    ]);
    for (const b of bars) expect(chart.places.has(b.bar)).toBe(true);
    // A2 is played twice per chorus: six times in all
    const a2first = chart.sections[1]!.bars[0]!;
    expect(chart.bars[a2first]!.played).toEqual([8, 24, 40, 56, 72, 88]);
    expect(chart.places.get(24)).toEqual({ written: a2first, pass: 2, passes: 6 });
    expect(chart.places.get(0)).toEqual({ written: chart.sections[0]!.bars[0], pass: 1, passes: 3 });
  });

  it('writes AA as one section played twice when the two A are the same', () => {
    const bars = chartBars(repeat([AABA_A2, AABA_A2, AABA_B, AABA_A2].join(' | '), 2));
    const chart = simplifyChart(input(bars, marks(bars, 0, 8, 'AABA', 2)))!;
    expect(text(chart)).toEqual(['A x2: C△ A7 | Dm7 G7 | C△ A7 | Dm7 G7 | F△ Fm7 | Em7 A7 | Dm7 G7 | C△', 'B x1: E7 | % | A7 | % | D7 | % | G7 | %']);
  });

  it('brings a tritone substitute back to the dominant when another repeat plays it', () => {
    const a = 'Dm7 | G7 | Cmaj7 | Cmaj7';
    const sub = 'Dm7 | Db7 | Cmaj7 | Cmaj7';
    const bars = chartBars([a, sub, sub].map((x) => `${x} | ${x}`).join(' | '));
    const chart = simplifyChart(input(bars, [0, 8, 16].map((k) => ({ bar: k, label: 'A' }))))!;
    expect(text(chart)[0]).toBe('A x3: Dm7 | G7 | C△ | % | Dm7 | G7 | C△ | %');
  });

  it('writes a tag once with its number of repeats, and an intro in full', () => {
    const tag = 'Em7 A7 | Dm7 G7';
    const bars = chartBars(`Dm7 | G7 | Dm7 | G7 | ${repeat(AABA, 2)} | ${repeat(tag, 3)}`);
    const sections = marks(bars, 4, 8, 'AABA', 2);
    const parts: SimplifyInput['parts'] = [
      { id: 'i', type: 'intro', firstBar: 0, endBar: 4, letters: [] },
      { id: 't', type: 'theme', firstBar: 4, endBar: 68, letters: ['A', 'A', 'B', 'A', 'A', 'A', 'B', 'A'] },
      { id: 'o', type: 'outro', firstBar: 68, endBar: 74, letters: [] },
    ];
    const chart = simplifyChart(input(bars, sections, parts))!;
    const t = text(chart);
    expect(t[0]).toBe('intro x1: Dm7 | G7 | Dm7 | G7');
    expect(t[t.length - 1]).toBe('outro x3: Em7 A7 | Dm7 G7');
    expect(chart.places.get(72)).toEqual({ written: chart.sections[chart.sections.length - 1]!.bars[0], pass: 3, passes: 3 });
  });

  it('writes the modulations in force above the first bar of a section in another key', () => {
    const bars = chartBars(repeat(AABA, 2));
    const key = { tonic: 4, mode: 'major' as const };
    const s = input(bars, marks(bars, 0, 8, 'AABA', 2));
    s.keyChanges = [{ bar: 16, key }, { bar: 24, key: { tonic: 0, mode: 'major' } }, { bar: 48, key }, { bar: 56, key: { tonic: 0, mode: 'major' } }];
    const chart = simplifyChart(s)!;
    const b = chart.sections.find((x) => 'letter' in x.label && x.label.letter === 'B')!;
    expect(chart.bars[b.bars[0]!]!.keyChange).toEqual(key);
    // the A after the bridge, back in the main key, is the same A: written once
    expect(chart.sections.filter((x) => 'letter' in x.label && x.label.letter === 'A').length).toBe(2);
  });

  it('has nothing to fold without letters, or when no letter comes back', () => {
    const bars = chartBars(repeat(AABA, 2));
    expect(simplifyChart(input(bars, []))).toBeNull();
    expect(simplifyChart(input(bars, ['A', 'B', 'C', 'D'].map((l, k) => ({ bar: k * 16, label: l }))))).toBeNull();
  });

  it('never throws on letters written by hand that disagree, and still places every bar', () => {
    const bars = chartBars(repeat(AABA, 3));
    // an A of 8 bars, then an A of 16, a « B » of 3, letters of several characters, a part cutting a section
    const sections = [
      { bar: 0, label: 'A' }, { bar: 8, label: 'A' }, { bar: 24, label: 'B' }, { bar: 27, label: 'Pont' }, { bar: 40, label: 'A' },
      { bar: 41, label: 'A' }, { bar: 64, label: 'Coda 1' }, { bar: 90, label: 'A' },
    ];
    const parts: SimplifyInput['parts'] = [
      { id: 'a', type: 'theme', firstBar: 0, endBar: 20, letters: ['A', 'A'] },
      { id: 'b', type: 'solo', firstBar: 20, endBar: 61, letters: [] },
      { id: 'c', type: 'outro', firstBar: 61, endBar: 96, letters: [] },
    ];
    const chart = simplifyChart(input(bars, sections, parts));
    expect(chart).not.toBeNull();
    for (const b of bars) expect(chart!.places.has(b.bar)).toBe(true);
    expect(chart!.form.map((f) => f.partId)).toEqual(['a', 'b', 'c']);
    for (const s of chart!.sections) for (let k = 1; k < s.bars.length; k++) expect(s.bars[k]).toBe(s.bars[k - 1]! + 1);
  });

  it('writes N.C. bars, bars of another meter and pick-up bars', () => {
    const pickup = chartBars('G7', { firstBar: -1 });
    const body = chartBars(repeat(`${AABA_A1} | N.C. | N.C.`, 2), { start: 2 });
    const waltz = chartBars('C | F', { beats: 3, start: body[body.length - 1]!.end, firstBar: body.length });
    const bars = [...pickup, ...body, ...waltz];
    const outro: SimplifyInput['parts'] = [{ id: 'o', type: 'outro', firstBar: 20, endBar: 22, letters: [] }];
    const chart = simplifyChart(input(bars, [{ bar: 0, label: 'A' }, { bar: 10, label: 'A' }], outro))!;
    expect(chart.sections[0]!.id).toBe('intro');
    const a = chart.sections[1]!;
    expect(a.times).toBe(2);
    expect(chart.bars[a.bars[8]!]!.chords).toEqual([{ beat: 0, chord: null }]);
    expect(chart.places.get(-1)).toBeDefined();
    const outroBars = chart.sections[chart.sections.length - 1]!.bars.map((i) => chart.bars[i]!);
    expect(outroBars.map((b) => b.beats)).toEqual([3, 3]);
    // the signature is written where it changes, not again on the next bar
    expect(outroBars.map((b) => b.signature)).toEqual([{ numerator: 3, denominator: 4 }, null]);
  });
});
