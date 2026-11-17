import { describe, expect, it } from 'vitest';
import { chordText } from '../harmony/chord';
import { buildCase, knownStandard, loadCorpus } from './bench/cases';
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

describe('simplified chart: leaning on the known chart', () => {
  const autumn = loadCorpus().find((p) => p.id === 'autumn-leaves')!;
  const book = knownStandard(autumn)!;
  const A = 'Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | F#7 | Bm7 | Bm7';
  const B = 'C#m7b5 | F#7 | Bm7 | Bm7 | Em7 | A7 | Dmaj7 | Gmaj7';
  const C = 'C#m7b5 | F#7 | Bm7 Bb7 | Am7 G#7 | C#m7b5 | F#7 | Bm7 | Bm7';
  /** Choruses AABC, each given as its four sections (so that a test can misread one repeat only). */
  const play = (choruses: [string, string, string, string][]) => {
    const bars = chartBars(choruses.map((c) => c.join(' | ')).join(' | '));
    return { bars, sections: marks(bars, 0, 8, 'AABC', choruses.length) };
  };
  const chartOf = (p: ReturnType<typeof play>, known = true) => text(simplifyChart({ ...input(p.bars, p.sections), known: known ? [book] : [] })!);
  const misread = (sec: string, from: string, to: string) => sec.replace(from, to);

  it('the same root in another family, read at every repeat: the book\'s family (D△, not D7)', () => {
    const A7 = misread(A, 'Dmaj7', 'D7');
    const p = play([[A7, A7, B, C], [A7, A7, B, C], [A7, A7, B, C]]);
    expect(chartOf(p, false)[0]).toBe('A x2: Em7 | A7 | D7 | G△ | D♭m7♭5 | F♯7 | Bm | %');
    expect(chartOf(p)[0]).toBe('A x2: Em7 | A7 | D△ | G△ | D♭m7♭5 | F♯7 | Bm | %');
  });

  it('but a reading that is strong (every repeat, none doubtful, and written by hand once) stays', () => {
    const A7 = misread(A, 'Dmaj7', 'D7');
    const p = play([[A7, A7, B, C], [A7, A7, B, C], [A7, A7, B, C]]);
    p.bars[2]!.chords = p.bars[2]!.chords.map((c) => ({ ...c, byHand: true }));
    expect(chartOf(p)[0]).toBe('A x2: Em7 | A7 | D7 | G△ | D♭m7♭5 | F♯7 | Bm | %');
  });

  it('another root: kept when the repeats agree clearly, the book\'s when one repeat alone says it', () => {
    const sub = misread(B, 'Em7 | A7', 'Em7 | C7');
    const all = play([[A, A, sub, C], [A, A, sub, C], [A, A, sub, C]]);
    expect(chartOf(all)[1]).toBe('B x1: D♭m7♭5 | F♯7 | Bm | % | Em7 | C7 | D△ | G△');
    const once = play([[A, A, sub, C], [A, A, misread(B, 'Em7 | A7', 'Em7 | F7'), C], [A, A, B, C]]);
    expect(chartOf(once)[1]).toBe('B x1: D♭m7♭5 | F♯7 | Bm | % | Em7 | A7 | D△ | G△');
  });

  it('nothing heard inside the form (an empty bar, N.C.): the book\'s chord', () => {
    const hole = misread(A, 'Gmaj7', 'N.C.');
    const p = play([[hole, hole, B, C], [hole, hole, B, C], [hole, hole, B, C]]);
    expect(chartOf(p, false)[0]).toBe('A x2: Em7 | A7 | D△ | NC | D♭m7♭5 | F♯7 | Bm | %');
    expect(chartOf(p)[0]).toBe('A x2: Em7 | A7 | D△ | G△ | D♭m7♭5 | F♯7 | Bm | %');
  });

  it('the bar\'s rhythm: the book\'s two chords when the repeats disagree', () => {
    const p = play([
      [A, A, B, misread(C, 'Bm7 Bb7', 'F#7')],
      [A, A, B, misread(C, 'Bm7 Bb7', 'Bm7')],
      [A, A, B, misread(C, 'Bm7 Bb7', 'D7')],
    ]);
    expect(chartOf(p)[2]).toBe('C x1: D♭m7♭5 | F♯7 | Bm B♭7 | Am7 A♭7 | D♭m7♭5 | F♯7 | Bm | %');
  });

  it('a chart that does not fit the piece is not used', () => {
    const other = knownStandard(loadCorpus().find((p) => p.id === 'satin-doll-tag')!)!;
    const A7 = misread(A, 'Dmaj7', 'D7');
    const p = play([[A7, A7, B, C], [A7, A7, B, C], [A7, A7, B, C]]);
    expect(text(simplifyChart({ ...input(p.bars, p.sections), known: [other] })!)).toEqual(chartOf(p, false));
  });

  it('a chorus a semitone up reads the book a semitone up', () => {
    const names: Record<string, string> = { C: 'C#', 'C#': 'D', D: 'Eb', Db: 'D', Eb: 'E', E: 'F', F: 'F#', 'F#': 'G', Gb: 'G', G: 'Ab', 'G#': 'A', Ab: 'A', A: 'Bb', Bb: 'B', B: 'C' };
    const up = (sec: string) => sec.replace(/\b([A-G][b#]?)/g, (n) => names[n] ?? n);
    const A7 = misread(A, 'Dmaj7', 'D7');
    const p = play([[A, A, B, C], [A7, A7, B, C], [up(A7), up(A7), up(B), up(C)]]);
    const chart = simplifyChart({ ...input(p.bars, p.sections), known: [book], keyChanges: [{ bar: 64, key: { tonic: 0, mode: 'minor' } }] })!;
    const t = text(chart);
    // (the minor tonic is written plain in the last key only: Bm7 here)
    expect(t[0]).toBe('A x2: Em7 | A7 | D△ | G△ | D♭m7♭5 | F♯7 | Bm7 | %');
    expect(t[3]).toMatch(/^A@2 x2: Fm7 \| B♭7 \| E♭△ \| A♭△ /);
    expect(chart.bars[chart.sections[3]!.bars[0]!]!.keyChange).toEqual({ tonic: 0, mode: 'minor' });
  });

  it('a lone doubt in the intro, between twice the same chord, is that chord', () => {
    const bars = chartBars(`Bm7 | F#7 | Bm7 | Bm7 | ${repeat(AABA, 2)}`);
    bars[1]!.chords = bars[1]!.chords.map((c) => ({ ...c, doubtful: true }));
    const parts: SimplifyInput['parts'] = [{ id: 'i', type: 'intro', firstBar: 0, endBar: 4, letters: [] }];
    const t = text(simplifyChart(input(bars, marks(bars, 4, 8, 'AABA', 2), parts))!);
    expect(t[0]).toBe('intro x1: Bm7 | % | % | %');
    bars[1]!.chords = bars[1]!.chords.map((c) => ({ ...c, doubtful: false }));
    expect(text(simplifyChart(input(bars, marks(bars, 4, 8, 'AABA', 2), parts))!)[0]).toBe('intro x1: Bm7 | F♯7 | Bm7 | %');
  });
});

