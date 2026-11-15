import { describe, expect, it } from 'vitest';
import { obfuscate } from '../export/ireal';
import { chord, chordText } from '../harmony/chord';
import { readIRealText, type StandardChart } from './irealRead';
import { beatsInForm, chordAt, semitonesBetween, transposeChart, transposeChartToKey } from './transposeTo';

function chartOf(music: string, key: string): StandardChart {
  const song = ['Test', 'Nobody Anna', '', 'Medium Swing', key, '', obfuscate(music), 'Jazz-Medium Swing', '120', '0'].join('=');
  const pl = readIRealText(`irealb://${encodeURIComponent(song)}`);
  expect(pl.songs).toHaveLength(1);
  return pl.songs[0]!;
}

// ii-V-I in G minor with a slash chord, an alternate chord and a bar that goes on.
const MINOR = '[T44C-7   |F7 Bb^7/D |pEb^7  |Ah7(A-7b5) D7b9 |G-6   Z';

describe('semitonesBetween', () => {
  it('takes the shortest way, in the mode of the chart', () => {
    expect(semitonesBetween({ tonic: 7, mode: 'minor' }, { tonic: 0, mode: 'minor' })).toBe(5);
    expect(semitonesBetween({ tonic: 0, mode: 'major' }, { tonic: 10, mode: 'major' })).toBe(-2);
    expect(semitonesBetween({ tonic: 0, mode: 'major' }, { tonic: 6, mode: 'major' })).toBe(6);
    expect(semitonesBetween({ tonic: 0, mode: 'major' }, { tonic: 0, mode: 'major' })).toBe(0);
    // A minor asked for C major: C major's relative minor is A minor
    expect(semitonesBetween({ tonic: 9, mode: 'minor' }, { tonic: 0, mode: 'major' })).toBe(0);
    // C major asked for F minor: F minor's relative major is A♭
    expect(semitonesBetween({ tonic: 0, mode: 'major' }, { tonic: 5, mode: 'minor' })).toBe(-4);
  });
});

describe('transposing a chart', () => {
  const chart = chartOf(MINOR, 'G-');

  it('moves every chord, bass note, alternate chord and the key; keeps the texts and does not touch the original', () => {
    const up = transposeChart(chart, 5);
    expect(up.key).toEqual({ tonic: 0, mode: 'minor' });
    expect(chart.key).toEqual({ tonic: 7, mode: 'minor' });
    expect(up.bars[0]!.chords[0]!.chord).toEqual(chord(5, 'min7'));
    expect(up.bars[1]!.chords.map((c) => chordText(c.chord))).toEqual(['B♭7', 'E♭△/G']);
    expect(up.bars[1]!.chords[1]!.chord!.bass).toBe(7);
    expect(up.bars[1]!.chords[1]!.text).toBe('Bb^7/D');
    expect(up.bars[3]!.alternates[0]!.chord).toEqual(chord(2, 'min7', ['b5']));
    expect(chart.bars[0]!.chords[0]!.chord).toEqual(chord(0, 'min7'));
    expect(transposeChart(chart, 12)).toBe(chart);
    expect(transposeChart(chart, 0)).toBe(chart);
    // N.C. stays N.C.
    const nc = transposeChart(chartOf('[T44n   |C   Z', 'C'), 3);
    expect(nc.bars[0]!.chords[0]!.chord).toBeNull();
  });

  it('puts a chart in the key of the recording, or says it cannot', () => {
    const inC = transposeChartToKey(chart, { tonic: 0, mode: 'minor' })!;
    expect(inC.bars.map((b) => b.chords.map((c) => chordText(c.chord)).join(' '))).toEqual(['Fm7', 'B♭7 E♭△/G', 'A♭△', 'Dm7♭5 G7(♭9)', 'Cm6']);
    const back = transposeChartToKey(inC, { tonic: 7, mode: 'minor' })!;
    expect(back.bars.map((b) => b.chords.map((c) => c.chord))).toEqual(chart.bars.map((b) => b.chords.map((c) => c.chord)));
    const unknownKey = chartOf('[T44C   |D   Z', 'H');
    expect(unknownKey.key).toBeNull();
    expect(transposeChartToKey(unknownKey, { tonic: 0, mode: 'major' })).toBeNull();
  });
});

describe('which chord sounds where', () => {
  const chart = chartOf(MINOR, 'G-');

  it('counts the beats of a chorus, with meter changes', () => {
    expect(beatsInForm(chart)).toBe(20);
    expect(beatsInForm(chartOf('[T44C   |D   |T34E  |F  Z', 'C'))).toBe(14);
  });

  it('gives the chord of a beat, saying where one starts and where it goes on', () => {
    const at = (bar: number, beat: number, choruses = 1) => {
      const s = chordAt(chart, bar, beat, choruses);
      return s && `${chordText(s.chord)}${s.onset ? '!' : ''}`;
    };
    expect(at(0, 0)).toBe('Cm7!');
    expect(at(0, 3)).toBe('Cm7');
    expect(at(1, 0)).toBe('F7!');
    expect(at(1, 1)).toBe('F7');
    expect(at(1, 2)).toBe('B♭△/D!');
    // bar 2 goes on from the bar before (slash): the chord at its beat 0 is not new, E♭ starts on beat 1
    expect(at(2, 0)).toBe('B♭△/D');
    expect(at(2, 1)).toBe('E♭△!');
    expect(at(3, 0)).toBe('Am7♭5!');
    expect(at(3, 1)).toBe('Am7♭5');
    expect(at(3, 2)).toBe('D7(♭9)!');
    expect(at(4, 3)).toBe('Gm6');
  });

  it('is null outside the piece and before the first chord, and repeats the form over choruses', () => {
    expect(chordAt(chart, 5, 0)).toBeNull();
    expect(chordAt(chart, -1, 0)).toBeNull();
    expect(chordAt(chart, 0, 4)).toBeNull();
    expect(chordAt(chart, 0, -1)).toBeNull();
    expect(chordAt(chart, 0.5, 0)).toBeNull();
    const three = (bar: number) => chordAt(chart, bar, 0, 3);
    expect(three(14)).not.toBeNull();
    expect(chordAt(chart, 15, 0, 3)).toBeNull();
    expect(three(5)!.chorus).toBe(1);
    expect(three(5)!.barInForm).toBe(0);
    expect(chordText(three(5)!.chord)).toBe('Cm7');
    expect(chordText(three(10)!.chord)).toBe('Cm7');
    // a chart that begins by going on: nothing sounds in the first chorus, the last chord of the form does after it
    const goesOn = chartOf('[T44pC7   |D7   Z', 'C');
    expect(chordAt(goesOn, 0, 0, 2)).toBeNull();
    expect(chordText(chordAt(goesOn, 2, 0, 2)!.chord)).toBe('D7');
    expect(chordAt(goesOn, 0, 1, 2)!.onset).toBe(true);
  });
});
