import { describe, expect, it } from 'vitest';
import { chordText } from '../harmony/chord';
import { simplifyChart, type SimplifyInput } from '../structure';
import { chartBars } from '../structure/testCharts';
import { AUTUMN_BAR_COUNT, AUTUMN_LETTERS, AUTUMN_MODULATION_BAR, AUTUMN_PARTS, autumnBars } from './demoAutumn';

function autumnInput(modulated = false): SimplifyInput {
  const bars = chartBars(autumnBars(modulated).map((b) => b.join(' ')).join(' | ') + ' | ');
  const parts = AUTUMN_PARTS.map(([type, , , first, end], i) => ({
    id: `autumn-${i + 1}`,
    type,
    firstBar: first,
    endBar: end,
    letters: AUTUMN_LETTERS.filter(([bar]) => bar >= first && bar < end).map(([, label]) => label),
  }));
  const keyChanges = modulated ? [{ bar: AUTUMN_MODULATION_BAR, key: { tonic: 1, mode: 'minor' as const } }] : [];
  return { bars, sections: AUTUMN_LETTERS.map(([bar, label]) => ({ bar, label })), parts, keyChanges, known: [] };
}

describe('the made-up piece of the simplified chart', () => {
  it('has 97 bars', () => {
    expect(autumnBars()).toHaveLength(AUTUMN_BAR_COUNT);
    expect(autumnInput().bars).toHaveLength(AUTUMN_BAR_COUNT);
  });

  it("is written as the owner's example: Intro, A x2, B, C, whatever the variations of the repeats", () => {
    const chart = simplifyChart(autumnInput())!;
    expect(chart).not.toBeNull();
    const text = chart.sections.map((s) => {
      const bars = s.bars.map((i) => {
        const b = chart.bars[i]!;
        return b.simile ? '%' : b.chords.map((x) => (x.chord ? chordText(x.chord) : 'NC')).join(' ');
      });
      return `${s.id} x${s.times}: ${bars.join(' | ')}`;
    });
    expect(text).toEqual([
      'intro x1: Bm',
      'A x2: Em7 | A7 | D△ | G△ | D♭m7♭5 | F♯7 | Bm | %',
      'B x1: D♭m7♭5 | F♯7 | Bm | % | Em7 | A7 | D△ | G△',
      'C x1: D♭m7♭5 | F♯7 | Bm B♭7 | Am7 A♭7 | D♭m7♭5 | F♯7 | Bm | %',
    ]);
    expect(chart.form.map((f) => f.letters)).toEqual(['', 'AABC', 'AABC', 'AA', 'BC']);
  });

  it('places every bar', () => {
    const chart = simplifyChart(autumnInput())!;
    for (let bar = 0; bar < AUTUMN_BAR_COUNT; bar++) expect(chart.places.has(bar)).toBe(true);
    // A is played 2 (theme) + 2 (solo) + 2 (trumpet) = 6 times
    const a = chart.bars[chart.sections[1]!.bars[0]!]!;
    expect(a.played).toEqual([1, 9, 33, 41, 65, 73]);
  });

  it('has a variant with a last chorus a tone higher: its B and C are written again, the modulation on the first bar of the first', () => {
    const chart = simplifyChart(autumnInput(true))!;
    expect(chart).not.toBeNull();
    const heads = chart.sections.map((s) => ('letter' in s.label ? s.label.letter : s.label.part));
    expect(heads).toEqual(['intro', 'A', 'B', 'C', 'B', 'C']);
    const upB = chart.sections[4]!;
    expect(chart.bars[upB.bars[0]!]!.keyChange).toEqual({ tonic: 1, mode: 'minor' });
    expect(chart.bars[chart.sections[5]!.bars[0]!]!.keyChange).toBeNull();
    for (let bar = 0; bar < AUTUMN_BAR_COUNT; bar++) expect(chart.places.has(bar)).toBe(true);
  });
});
