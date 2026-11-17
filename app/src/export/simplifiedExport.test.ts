import { describe, expect, it } from 'vitest';
import { AUTUMN_LETTERS, AUTUMN_PARTS, autumnBars } from '../demo/demoAutumn';
import { chordText } from '../harmony/chord';
import { readIRealLink } from '../standards/irealRead';
import { simplifyChart, type SimplifiedChart, type SimplifyInput } from '../structure';
import { chartBars } from '../structure/testCharts';
import { exportToIRealPro, iRealMusic } from './ireal';
import { buildSimplifiedExportChart } from './simplifiedExport';

function autumn(): { chart: SimplifiedChart; input: SimplifyInput } {
  const bars = chartBars(autumnBars().map((b) => b.join(' ')).join(' | ') + ' | ');
  const parts = AUTUMN_PARTS.map(([type, , , first, end], i) => ({
    id: `autumn-${i + 1}`,
    type,
    firstBar: first,
    endBar: end,
    letters: AUTUMN_LETTERS.filter(([bar]) => bar >= first && bar < end).map(([, label]) => label),
  }));
  const input: SimplifyInput = { bars, sections: AUTUMN_LETTERS.map(([bar, label]) => ({ bar, label })), parts, keyChanges: [], known: [] };
  return { chart: simplifyChart(input)!, input };
}

const keyBm = { tonic: 11, mode: 'minor' as const };
const exportOf = (chart: SimplifiedChart, semitones = 0) => buildSimplifiedExportChart({ title: 'Feuilles mortes', chart, key: keyBm, semitones, tempo: 120 });

describe('the simplified chart for iReal Pro, with real repeats', () => {
  it('writes the sections once, a repeat round a passage played twice, x for % and the final bar', () => {
    const { chart } = autumn();
    const music = iRealMusic(exportOf(chart));
    // intro, then A repeated (`{ … }`), B, C, the end
    expect(music.startsWith('[*iT44')).toBe(true);
    expect(music).toContain(']{*A');
    expect(music).toContain('}[*B');
    expect(music).toContain('][*C');
    expect(music.endsWith('Z')).toBe(true);
    // the three % bars (end of A, of B, of C) are the one-bar repeat sign
    expect(music.match(/ x /g)?.length ?? 0).toBe(3);
  });

  it('is read back by the reader of the standards to the same bars', () => {
    const { chart } = autumn();
    const out = exportToIRealPro(exportOf(chart));
    const song = readIRealLink(out.url).songs[0]!;
    expect(song.title).toBe('Feuilles mortes');
    expect(song.key).toEqual(keyBm);
    // 25 written bars (1 + 8 + 8 + 8), 33 played: A twice
    expect(song.writtenBars).toBe(25);
    expect(song.bars).toHaveLength(33);
    expect(song.bars.map((b) => b.section).filter(Boolean)).toEqual(['i', 'A', 'A', 'B', 'C']);
    // every written bar comes back with its chords (the first time it is played)
    const first = new Map<number, (typeof song.bars)[number]>();
    for (const b of song.bars) if (!first.has(b.source)) first.set(b.source, b);
    chart.bars.forEach((w, i) => {
      const back = first.get(i)!;
      expect(back, `bar ${i}`).toBeDefined();
      if (w.simile) {
        expect(back.chords.length === 0 || back.simile !== null).toBe(true);
        return;
      }
      expect(back.chords.map((c) => c.beat), `beats of bar ${i}`).toEqual(w.chords.map((c) => c.beat));
      expect(back.chords.map((c) => chordText(c.chord)), `chords of bar ${i}`).toEqual(w.chords.map((c) => chordText(w.chords.find((x) => x.beat === c.beat)!.chord)));
    });
    // A is played twice in a row: passes 1 and 2
    const a = chart.sections.find((s) => 'letter' in s.label && s.label.letter === 'A')!;
    const passes = song.bars.filter((b) => b.source === a.bars[0]).map((b) => b.pass);
    expect(passes).toEqual([1, 2]);
  });

  it('transposes with the transport, like the full chart', () => {
    const { chart } = autumn();
    const song = readIRealLink(exportToIRealPro(exportOf(chart, 2)).url).songs[0]!;
    expect(song.key).toEqual({ tonic: 1, mode: 'minor' });
    expect(song.bars[0]!.chords[0]!.chord!.root).toBe(1);
  });

  it('writes a modulation as a comment on its bar and a variant letter as a note', () => {
    const { input } = autumn();
    // E major written from the bar where the second chorus of the solo begins (bar 41): a modulation in force
    const chart = simplifyChart({ ...input, keyChanges: [{ bar: 1, key: { tonic: 4, mode: 'major' } }] })!;
    const music = iRealMusic(exportOf(chart));
    expect(music).toContain('<Ton :');
  });
});
