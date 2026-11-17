import { describe, expect, it } from 'vitest';
import { AABA, AABA_A2, AABA_B, chartBars, repeat } from '../structure/testCharts';
import { simplifyChart, type HarmonyBar, type SimplifiedChart, type SimplifyInput } from '../structure';
import { formItems, formLineText, headingLetterText, headingOf, lastWrittenIndex, loopRange, nextOccurrence, placeOf, repeatTag, seekTarget, writtenBlocks } from './simplifiedLayout';

function marks(bars: HarmonyBar[], first: number, len: number, form: string, choruses: number): SimplifyInput['sections'] {
  const out: SimplifyInput['sections'] = [];
  for (let c = 0; c < choruses; c++) for (let k = 0; k < form.length; k++) out.push({ bar: bars[first + (c * form.length + k) * len]!.bar, label: form[k]! });
  return out;
}

/** AABA written A x2, B (the two A the same), three choruses: 24 written... played 96 bars. */
function aabaChart(choruses = 3): { chart: SimplifiedChart; bars: HarmonyBar[] } {
  const bars = chartBars(repeat([AABA_A2, AABA_A2, AABA_B, AABA_A2].join(' | '), choruses));
  const chart = simplifyChart({ bars, sections: marks(bars, 0, 8, 'AABA', choruses), parts: [], keyChanges: [], known: [] })!;
  return { chart, bars };
}

describe('the blocks of the written chart', () => {
  it('one block per section, its bars four to a line, the last line of 8 bars closes the block', () => {
    const { chart } = aabaChart();
    const blocks = writtenBlocks(chart);
    expect(blocks.map((b) => [headingOf(b.section), b.times, b.lines.map((l) => l.bars.length)])).toEqual([
      [{ kind: 'letter', letter: 'A', variant: null }, 2, [4, 4]],
      [{ kind: 'letter', letter: 'B', variant: null }, 1, [4, 4]],
    ]);
    expect(blocks[0]!.lines.map((l) => [l.first, l.last])).toEqual([[true, false], [false, true]]);
    // The bars of a line are the written bars of the chart, in order.
    expect(blocks[0]!.lines[1]!.bars.map((b) => b.index)).toEqual(chart.sections[0]!.bars.slice(4));
  });

  it('a short block (an intro) is one short line; the last written bar is the final one', () => {
    const bars = chartBars(['Bm', repeat(AABA, 2)].join(' | '));
    const chart = simplifyChart({ bars, sections: marks(bars.slice(1), 0, 8, 'AABA', 2).map((m) => ({ ...m, bar: m.bar + 1 })), parts: [{ id: 'i', type: 'intro', firstBar: 0, endBar: 1, letters: [] }], keyChanges: [], known: [] });
    expect(chart).not.toBeNull();
    const blocks = writtenBlocks(chart!);
    expect(blocks[0]!.heading).toEqual({ kind: 'part', part: 'intro' });
    expect(blocks[0]!.lines).toHaveLength(1);
    expect(blocks[0]!.lines[0]!.bars.length).toBe(blocks[0]!.section.bars.length);
    expect(blocks[0]!.lines[0]!.bars.length).toBeLessThan(4);
    expect(lastWrittenIndex(chart!)).toBe(chart!.sections.at(-1)!.bars.at(-1));
  });

  it('a variant is headed « A2 »', () => {
    expect(headingLetterText({ kind: 'letter', letter: 'A', variant: 2 })).toBe('A2');
    expect(headingLetterText({ kind: 'letter', letter: 'B', variant: null })).toBe('B');
    expect(headingOf({ id: 'A2', label: { letter: 'A' }, bars: [], times: 1, variant: 2 })).toEqual({ kind: 'letter', letter: 'A', variant: 2 });
  });
});

describe('the form line', () => {
  const parts = [
    { id: 'p1', type: 'intro' as const, number: null, instrument: null },
    { id: 'p2', type: 'theme' as const, number: 1, instrument: null },
    { id: 'p3', type: 'solo' as const, number: null, instrument: 'piano' },
  ];
  const name = (p: { type: string; number: number | null; instrument: string | null }) => `${p.type}${p.number ?? ''}${p.instrument ? `(${p.instrument})` : ''}`;
  it('writes the part and its letters, in the order of the form, leaving out a part that is gone', () => {
    const items = formItems(
      [
        { partId: 'p1', letters: '' },
        { partId: 'p2', letters: 'AABC' },
        { partId: 'gone', letters: 'AA' },
        { partId: 'p3', letters: 'AABC' },
      ],
      parts,
      name,
    );
    expect(items.map((i) => i.partId)).toEqual(['p1', 'p2', 'p3']);
    expect(formLineText(items)).toBe('intro, theme1 (AABC), solo(piano) (AABC)');
  });
});

describe('the playing and the repeat tag', () => {
  it('places a played bar and says nothing for a bar played once', () => {
    // one chorus A A B A, A written once and played three times: bars 0-7, 8-15 and 24-31
    const { chart } = aabaChart(1);
    expect(placeOf(chart, 0)).toMatchObject({ pass: 1, passes: 3 });
    expect(placeOf(chart, 8)).toMatchObject({ pass: 2, passes: 3 });
    expect(placeOf(chart, 24)).toMatchObject({ pass: 3, passes: 3 });
    expect(placeOf(chart, 16)).toMatchObject({ pass: 1, passes: 1 });
    expect(placeOf(chart, 99)).toBeNull();
    expect(repeatTag(placeOf(chart, 16))).toBeNull();
    expect(repeatTag(placeOf(chart, 8))).toEqual({ kind: 'ordinal', n: 2 });
    expect(repeatTag(null)).toBeNull();
  });

  it('counts « fois » up to four passes, then « reprise n/total »', () => {
    expect(repeatTag({ written: 0, pass: 2, passes: 2 })).toEqual({ kind: 'ordinal', n: 2 });
    expect(repeatTag({ written: 0, pass: 4, passes: 4 })).toEqual({ kind: 'ordinal', n: 4 });
    expect(repeatTag({ written: 0, pass: 3, passes: 6 })).toEqual({ kind: 'of', n: 3, total: 6 });
  });
});

describe('the next occurrence', () => {
  it('is the first played bar after the one being played, the first one when none is after', () => {
    expect(nextOccurrence([0, 8, 32], 3)).toBe(8);
    expect(nextOccurrence([0, 8, 32], 8)).toBe(32);
    expect(nextOccurrence([0, 8, 32], 40)).toBe(0);
    expect(nextOccurrence([5], 5)).toBe(5);
    expect(nextOccurrence([], 5)).toBeNull();
  });

  it('seekTarget reads it from the written bar; an unknown bar goes nowhere', () => {
    const { chart } = aabaChart(1);
    const firstA = chart.sections[0]!.bars[0]!;
    expect(chart.bars[firstA]!.played).toEqual([0, 8, 24]);
    expect(seekTarget(chart, firstA, 0)).toBe(8);
    expect(seekTarget(chart, firstA, 8)).toBe(24);
    expect(seekTarget(chart, firstA, 24)).toBe(0);
    expect(seekTarget(chart, 999, 0)).toBeNull();
  });
});

describe('a loop dragged over written bars', () => {
  it('is the played bars of the next occurrence when they follow one another', () => {
    const { chart } = aabaChart(3);
    const [a0, a1, a2] = chart.sections[0]!.bars;
    // the first A bar is played at 0, 8, 24 | 32, 40, 56 | 64, 72, 88
    expect(chart.bars[a0!]!.played).toEqual([0, 8, 24, 32, 40, 56, 64, 72, 88]);
    expect(loopRange(chart, a0!, a2!, 0)).toEqual({ first: 8, last: 10 });
    expect(loopRange(chart, a2!, a0!, 0)).toEqual({ first: 8, last: 10 });
    expect(loopRange(chart, a0!, a1!, 20)).toEqual({ first: 24, last: 25 });
    // after the last occurrence: the first one again
    expect(loopRange(chart, a0!, a1!, 90)).toEqual({ first: 0, last: 1 });
  });

  it('crossing from A to B is contiguous only where the B follows the A', () => {
    const { chart } = aabaChart(1);
    const aLast = chart.sections[0]!.bars.at(-1)!;
    const bFirst = chart.sections[1]!.bars[0]!;
    // the last bar of A is played at 7 (A again follows), 15 (B follows) and 31 (the end)
    expect(chart.bars[aLast]!.played).toEqual([7, 15, 31]);
    expect(loopRange(chart, aLast, bFirst, 0)).toEqual({ first: 15, last: 16 });
  });

  it('is refused when no occurrence is followed that way', () => {
    // played order: written 0, 2, 1 — bars 0 and 1 are never played one after the other
    const bar = (index: number, played: number[]) => ({ index, beats: 4, meter: { numerator: 4, denominator: 4 }, signature: null, chords: [], simile: false, keyChange: null, played });
    const chart: SimplifiedChart = {
      form: [],
      sections: [{ id: 'A', label: { letter: 'A' }, bars: [0, 1, 2], times: 1 }],
      bars: [bar(0, [0]), bar(1, [2]), bar(2, [1])],
      places: new Map([
        [0, { written: 0, pass: 1, passes: 1 }],
        [1, { written: 2, pass: 1, passes: 1 }],
        [2, { written: 1, pass: 1, passes: 1 }],
      ]),
    };
    expect(loopRange(chart, 0, 1, 0)).toBeNull();
    expect(loopRange(chart, 1, 2, 0)).toBeNull();
    expect(loopRange(chart, 0, 0, 0)).toEqual({ first: 0, last: 0 });
    expect(loopRange(chart, 0, 999, 0)).toBeNull();
  });
});
