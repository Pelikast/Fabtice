import { describe, expect, it } from 'vitest';
import { chartBars, type ChartChord } from '../chart/layout';
import type { SectionMark } from '../model/corrections';
import { demoAnalysis, demoCorrections } from '../demo/demoAnalysis';
import { demoTempoMap } from '../demo/demoProject';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { CHORD_EXTENSIONS, CHORD_QUALITIES, type ChordSymbol, type Key } from '../model/harmony';
import type { TempoMap } from '../model/tempoMap';
import { initialState, type AppState } from '../store/store';
import { chartBarsOf, decodeChord, decodeIRealBookLink, decodeIRealLink, decodeKey, qualityOf, unhussle, tokenize, type DecodedChartBar } from '../test/irealDecoder';
import { buildExportChart, chartForExport, type ExportChart } from './chartExport';
import {
  IREAL_EXPORT_READY,
  IREAL_MUSIC_PREFIX,
  exportToIRealPro,
  hussle,
  iRealChordText,
  iRealFileName,
  iRealKey,
  iRealMusic,
  iRealPage,
  iRealText,
  obfuscate,
} from './ireal';
import { IREAL_QUALITIES, iRealCanonical, iRealQualityFor } from './irealChords';

// ---------------------------------------------------------------- helpers

const meter = (n: number) => ({ numerator: n, denominator: 4 });
const mapOf = (beats = 4): TempoMap => constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: meter(beats), origin: 'manual' });

function at(beat: number, c: ChordSymbol | null, doubtful = false): ChartChord {
  return { time: beat * 0.5, beat, chord: c, origin: 'analysis', confidence: 0.6, doubtful, alternatives: [] };
}

interface Build {
  title?: string;
  beats?: number;
  bars?: number;
  chords: ChartChord[];
  sections?: SectionMark[];
  key?: Key | null;
  semitones?: number;
  tempo?: number | null;
}

function chartOf(b: Build): ExportChart {
  const beats = b.beats ?? 4;
  const map = mapOf(beats);
  const barSeconds = beats * 0.5;
  const bars = chartBars({ map, chords: b.chords, sections: b.sections ?? [], duration: (b.bars ?? 8) * barSeconds });
  return buildExportChart({ title: b.title ?? 'Test', bars, key: b.key === undefined ? { tonic: 0, mode: 'major' } : b.key, semitones: b.semitones ?? 0, tempo: b.tempo === undefined ? 120 : b.tempo });
}

/** Bars of the chart as the decoder must give them back. */
function expectedBars(chart: ExportChart): Pick<DecodedChartBar, 'chords' | 'repeat' | 'section' | 'doubleBarBefore' | 'final'>[] {
  return chart.bars.map((b) => ({
    chords: b.chords.map((c) => ({ beat: c.beat, chord: c.chord === null ? null : iRealCanonical(c.chord) })),
    repeat: b.repeat,
    section: b.section,
    doubleBarBefore: b.doubleBarBefore,
    final: b.final,
  }));
}

/** Encodes, decodes with the independent reader, and checks that the chart comes back. */
function roundTrip(chart: ExportChart) {
  const out = exportToIRealPro(chart);
  expect(out.url).toMatch(/^irealb:\/\/[\x21-\x7e]+$/); // printable ASCII only: safe in a link and in an href
  const songs = decodeIRealLink(out.url);
  expect(songs).toHaveLength(1);
  const song = songs[0]!;
  const bars = chartBarsOf(song.bars);
  expect(bars.map((b) => ({ chords: b.chords, repeat: b.repeat, section: b.section, doubleBarBefore: b.doubleBarBefore, final: b.final }))).toEqual(
    expectedBars(chart).map((b) => ({ ...b, section: iRealSection(b.section) })),
  );
  expect(song.bars.map((b) => b.cells.length)).toEqual(chart.bars.map((_, i) => beatsAt(chart, i)));
  expect(song.bars[0]!.timeSignature).toEqual(chart.timeSignature);
  expect(song.key).toBe(iRealKey(chart.key));
  expect(song.bpm).toBe(chart.tempo !== null && chart.tempo >= 40 && chart.tempo <= 400 ? chart.tempo : 0);
  expect(song.title).toBe(iRealText(chart.title, 'Untitled'));
  // The old plain link carries the same chart string.
  const legacy = decodeIRealBookLink(out.legacyUrl);
  expect(legacy.music).toBe(song.music);
  expect(legacy.title).toBe(song.title);
  return { out, song, bars };
}

/** What a decoder reads back of a section label: iReal's own marks only (the others become comments). */
function iRealSection(label: string | null): string | null {
  if (label === null) return null;
  if (/^[A-D]$/i.test(label)) return label.toUpperCase();
  if (/^(i|intro)$/i.test(label)) return 'i';
  if (/^(v|verse|couplet)$/i.test(label)) return 'v';
  return null;
}

function beatsAt(chart: ExportChart, index: number): number {
  let m = chart.timeSignature;
  for (let i = 0; i <= index; i++) m = chart.bars[i]!.timeSignature ?? m;
  return m.numerator;
}

const C = (q: ChordSymbol['quality'], root = 0, ext: ChordSymbol['extensions'] = [], bass: number | null = null) => chord(root, q, ext, bass);

// ---------------------------------------------------------------- the scrambling and the fields

describe('scrambling', () => {
  it('reproduces the example of the Perl reader (a chart shorter than 50 characters is not shuffled)', () => {
    expect(obfuscate('[T44C   |G   |C   |G   Z')).toBe('1r34LbKcu7[T44CXyQ|GXyQ|CXyQ|GXyQZ');
    expect(IREAL_MUSIC_PREFIX).toBe('1r34LbKcu7');
  });

  it('shuffles a piece of 50 only when two or more characters follow it, and undoes itself', () => {
    const text = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(33 + (i % 90))).join('');
    for (const n of [0, 1, 49, 50, 51, 52, 53, 99, 100, 101, 102, 103, 149, 150, 151, 152, 777]) {
      const s = text(n);
      const h = hussle(s);
      expect(h).toHaveLength(n);
      expect(hussle(h)).toBe(s);
      expect(unhussle(h)).toBe(s); // the reader's formulation agrees with the writer's
      if (n === 50 || n === 51) expect(h).toBe(s);
      if (n === 52) expect(h).not.toBe(s);
    }
  });

  it('shuffles the way the references do: swaps 0-4 with 49-45 and 10-23 with 39-26', () => {
    const s = Array.from({ length: 60 }, (_, i) => String.fromCharCode(65 + (i % 26)) + '').join('');
    const h = hussle(s);
    for (let i = 0; i < 5; i++) {
      expect(h[i]).toBe(s[49 - i]);
      expect(h[49 - i]).toBe(s[i]);
    }
    for (let i = 10; i < 24; i++) expect(h[i]).toBe(s[49 - i]);
    for (const i of [5, 6, 7, 8, 9, 24, 25, 40, 44]) expect(h[i]).toBe(s[i]);
    expect(h.slice(50)).toBe(s.slice(50));
  });

  it('substitutes XyQ, LZ and Kcl before the shuffle', () => {
    // Three spaces become XyQ, then a space before a bar line LZ, then a bar line and an x Kcl, in that order.
    expect(obfuscate('C   | x  |D-7 G7 Z')).toBe('1r34LbKcu7CXyQKcl LZD-7 G7 Z');
    expect(obfuscate('[T44C   |G   |C   |G   Z')).toBe('1r34LbKcu7[T44CXyQ|GXyQ|CXyQ|GXyQZ');
  });
});

describe('the song fields', () => {
  it('has ten fields: title, composer, empty, style, key, empty, chart, feel, tempo, repeats', () => {
    const chart = chartOf({ chords: [at(0, C('maj7'))], tempo: 96, title: 'Blues du dimanche', key: { tonic: 8, mode: 'major' } });
    const song = decodeIRealLink(exportToIRealPro(chart).url)[0]!;
    expect([song.title, song.composer, song.style, song.key, song.transpose, song.feel, song.bpm, song.repeats]).toEqual(['Blues du dimanche', 'Unknown', 'Medium Swing', 'Ab', '', 'Jazz-Medium Swing', 96, 0]);
  });

  it('writes iReal Pro’s 24 key names, and C when the key is unknown', () => {
    const majors = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const minors = ['C-', 'C#-', 'D-', 'Eb-', 'E-', 'F-', 'F#-', 'G-', 'G#-', 'A-', 'Bb-', 'B-'];
    for (let t = 0; t < 12; t++) {
      expect(iRealKey({ tonic: t, mode: 'major' })).toBe(majors[t]);
      expect(iRealKey({ tonic: t, mode: 'minor' })).toBe(minors[t]);
      expect(decodeKey(majors[t]!)).toEqual({ tonic: t, mode: 'major' });
      expect(decodeKey(minors[t]!)).toEqual({ tonic: t, mode: 'minor' });
    }
    expect(iRealKey(null)).toBe('C');
  });

  it('keeps the unknown composer and the tempo bounds', () => {
    const slow = decodeIRealLink(exportToIRealPro(chartOf({ chords: [at(0, C('maj'))], tempo: 30 })).url)[0]!;
    const fast = decodeIRealLink(exportToIRealPro(chartOf({ chords: [at(0, C('maj'))], tempo: 500 })).url)[0]!;
    const none = decodeIRealLink(exportToIRealPro(chartOf({ chords: [at(0, C('maj'))], tempo: null })).url)[0]!;
    expect([slow.bpm, fast.bpm, none.bpm]).toEqual([0, 0, 0]);
    expect(none.composer).toBe('Unknown');
  });

  it('makes free text safe for the field separators', () => {
    expect(iRealText('A=B==C===D', 'x')).toBe('A-B-C-D');
    expect(iRealText(' a\nb\t c ', 'x')).toBe('a b c');
    expect(iRealText('  \n ', 'Untitled')).toBe('Untitled');
  });
});

// ---------------------------------------------------------------- chords

describe('the chord vocabulary', () => {
  it('maps the sixteen qualities of the app, written on C', () => {
    const expected: Record<string, string> = {
      maj: 'C', min: 'C-', aug: 'C+', dim: 'Co', sus2: 'C2', sus4: 'Csus', '7': 'C7', maj7: 'C^7', min7: 'C-7', minmaj7: 'C-^7',
      maj6: 'C6', min6: 'C-6', dim7: 'Co7', hdim7: 'Ch7', '7sus4': 'C7sus', aug7: 'C7#5',
    };
    expect(CHORD_QUALITIES).toHaveLength(16);
    for (const q of CHORD_QUALITIES) expect(iRealChordText(C(q), null)).toBe(expected[q]);
  });

  it('spells roots and basses as the key does, and writes slash chords', () => {
    const flatKey: Key = { tonic: 8, mode: 'major' };
    expect(iRealChordText(C('7', 10), flatKey)).toBe('Bb7');
    expect(iRealChordText(C('maj7', 3, [], 10), flatKey)).toBe('Eb^7/Bb');
    expect(iRealChordText(C('min7', 6), { tonic: 4, mode: 'major' })).toBe('F#-7');
    expect(iRealChordText(C('7', 0, ['b9'], 4), null)).toBe('C7b9/E');
  });

  it('every iReal quality text means what the table says, and the encoder writes exactly it back', () => {
    const seen = new Set<string>();
    for (const q of IREAL_QUALITIES) {
      expect(seen.has(q.text), q.text).toBe(false);
      seen.add(q.text);
      const meaning = qualityOf(q.text); // the reader's grammar, not the encoder's table
      expect(meaning.quality, q.text).toBe(q.quality);
      expect([...meaning.extensions].sort(), q.text).toEqual([...q.ext].sort());
      const c: ChordSymbol = { root: 7, quality: q.quality, extensions: [...q.ext], bass: null };
      expect(iRealQualityFor(c).text, q.text).toBe(q.text);
    }
  });

  it('writes every chord of the vocabulary with every single extension, and reads back its canonical form', () => {
    let approximated = 0;
    for (const quality of CHORD_QUALITIES) {
      for (const ext of [undefined, ...CHORD_EXTENSIONS]) {
        const c: ChordSymbol = { root: 2, quality, extensions: ext ? [ext] : [], bass: null };
        const text = iRealChordText(c, null);
        const back = decodeChord(text)!;
        expect(back, `${quality} ${ext} → ${text}`).toEqual(iRealCanonical(c));
        if (JSON.stringify(back) !== JSON.stringify({ ...c, quality })) approximated++;
      }
    }
    expect(approximated).toBeGreaterThan(0); // some combinations have no iReal text (see IREAL-FORMAT.md)
  });

  it('keeps the approximations written in IREAL-FORMAT.md', () => {
    const t = (q: ChordSymbol['quality'], ext: ChordSymbol['extensions'] = []) => iRealChordText(C(q, 0, ext), null);
    expect(t('aug7')).toBe('C7#5'); // C+7: same notes, iReal's text
    expect(t('aug7', ['9'])).toBe('C9#5');
    expect(t('maj', ['6'])).toBe('C6');
    expect(t('min', ['6'])).toBe('C-6');
    expect(t('7', ['6'])).toBe('C13'); // a dominant « with a 6 » is a 13
    expect(t('7', ['9', '13'])).toBe('C13'); // the 13 implies the 9
    expect(t('maj7', ['9', '13'])).toBe('C^13');
    expect(t('min7', ['9', '11'])).toBe('C-11');
    expect(t('maj', ['#11'])).toBe('C'); // no major triad with a sharp 11: the triad
    expect(t('sus4', ['9'])).toBe('Csus');
    expect(t('min7', ['13'])).toBe('C-7');
    expect(t('7', ['alt', 'b9'])).toBe('C7alt');
    expect(t('hdim7', ['b13'])).toBe('Ch7');
    expect(t('dim7', ['9'])).toBe('Co7');
    expect(t('7', ['b9', '#11', '13'])).toBe('C7b9#11'); // three extensions, no row: the first of the richest that fit (the 13 is dropped)
  });

  it('writes the doubtful chord like any other', () => {
    const chart = chartOf({ chords: [at(0, C('min7', 2), true), at(4, C('7', 7), false)], bars: 2 });
    expect(iRealMusic(chart)).toBe('[T44D-7   ,'.replace(',', '') + '|G7   Z');
  });
});

// ---------------------------------------------------------------- charts

describe('the chart string', () => {
  it('writes four cells per 4/4 bar, a chord on its beat, and sections with double bars', () => {
    const chart = chartOf({
      chords: [at(0, C('maj7')), at(4, C('min7', 2)), at(8, C('7', 7)), at(10, C('maj7')), at(12, C('min7', 9)), at(14, C('7', 2)), at(16, C('maj7'))],
      sections: [{ time: 0, label: 'A' }, { time: 6, label: 'B' }],
      bars: 6,
    });
    // Bar 3 starts section B: the bar before closes with a double bar, the bar opens with one.
    expect(iRealMusic(chart)).toBe('[*AT44C^7   |D-7   |G7 C^7 ][*BA-7 D7 |C^7   | x  Z');
  });

  it('round-trips the demo piece: chords, sections, double bars, repeat bars, key, tempo', () => {
    const map = demoTempoMap('variable');
    const duration = 54;
    const s: AppState = {
      ...initialState(),
      project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' }, duration, sampleRate: 48000, createdAt: '' },
      tempoMap: map,
      analysis: demoAnalysis(map, duration),
      corrections: demoCorrections(map),
    };
    const chart = chartForExport(s)!;
    const { song, bars } = roundTrip(chart);
    expect(chart.bars.length).toBeGreaterThan(20);
    expect(bars.some((b) => b.chords.length === 2)).toBe(true); // bar 15: two chords
    expect(bars.some((b) => b.doubleBarBefore)).toBe(true);
    expect(song.key).toBe('Ab');
    expect(song.bpm).toBe(110);
    expect(song.bars[0]!.open).toBe('[');
    expect(song.bars.at(-1)!.close).toBe('Z');
    expect(song.bars.map((b) => b.section).filter(Boolean)).toEqual(['A', 'B', 'A']);
  });

  it('follows the transposition of the transport (concert pitch, no instrument)', () => {
    const map = demoTempoMap('variable');
    const duration = 54;
    const s: AppState = {
      ...initialState(),
      project: { id: 'p', title: 'T', source: { kind: 'demo' }, duration, sampleRate: 48000, createdAt: '' },
      tempoMap: map,
      analysis: demoAnalysis(map, duration),
      corrections: demoCorrections(map),
    };
    const plain = decodeIRealLink(exportToIRealPro(chartForExport(s)!).url)[0]!;
    const up = decodeIRealLink(exportToIRealPro(chartForExport({ ...s, playback: { ...s.playback, semitones: 5 }, view: { ...s.view, instrument: 'sib' } })!).url)[0]!;
    expect(plain.key).toBe('Ab');
    expect(up.key).toBe('Db');
    const first = (song: typeof plain) => decodeChord(song.bars[0]!.cells.find((c) => c !== '')!)!;
    expect(first(plain)).toEqual({ root: 8, quality: 'maj7', extensions: [], bass: null });
    expect(first(up)).toEqual({ root: 1, quality: 'maj7', extensions: [], bass: null });
  });

  it('3/4: three cells per bar, T34 once', () => {
    const chart = chartOf({ beats: 3, chords: [at(0, C('min7', 9)), at(3, C('7', 2)), at(5, C('maj7', 7)), at(6, C('maj7', 7)), at(9, C('min7', 4)), at(10, C('7', 9))], bars: 4 });
    const { song } = roundTrip(chart);
    expect(song.bars.map((b) => b.cells.length)).toEqual([3, 3, 3, 3]);
    expect(song.music.match(/T34/g)).toHaveLength(1);
    expect(song.music.startsWith('[T34A-7  |D7 G^7|')).toBe(true);
  });

  it('writes the other meters, 2/4 to 7/4, with one cell per beat', () => {
    for (const beats of [2, 3, 4, 5, 6, 7]) {
      const chart = chartOf({ beats, chords: [at(0, C('maj7')), at(beats, C('min7', 2)), at(beats * 2 + 1, C('7', 7))], bars: 3 });
      const { song } = roundTrip(chart);
      expect(song.bars.every((b) => b.cells.length === beats)).toBe(true);
      expect(song.bars[0]!.timeSignature).toEqual({ numerator: beats, denominator: 4 });
    }
  });

  it('two chords and four chords in a bar land on their beats', () => {
    const chart = chartOf({
      chords: [at(0, C('min7', 2)), at(2, C('7', 7)), at(4, C('maj7')), at(5, C('min7', 9)), at(6, C('min7', 2)), at(7, C('7', 7)), at(8, C('maj7')), at(9, C('maj6', 0))],
      bars: 3,
    });
    const { song } = roundTrip(chart);
    expect(song.music).toBe('[T44D-7 G7 |C^7,A-7,D-7,G7|C^7,C6  Z');
    expect(song.bars[1]!.cells).toEqual(['C^7', 'A-7', 'D-7', 'G7']);
    expect(song.bars[0]!.cells).toEqual(['D-7', '', 'G7', '']);
  });

  it('a chord that goes on: « x » after a single-chord bar, slashes after a bar with several, slashes before a late first chord', () => {
    const chart = chartOf({ chords: [at(0, C('maj7')), at(8, C('min7', 2)), at(10, C('7', 7)), at(18, C('maj7'))], bars: 6 });
    // bars: 0 C^7 | 1 (goes on) | 2 D-7 G7 | 3 (goes on) | 4 late chord C^7 at beat 2 | 5 (goes on)
    const { song } = roundTrip(chart);
    expect(song.bars[1]!.cells).toEqual(['', 'x', '', '']);
    expect(song.bars[3]!.cells).toEqual(['p', 'p', 'p', 'p']);
    expect(song.bars[4]!.cells).toEqual(['p', 'p', 'C^7', '']);
    expect(song.bars[5]!.cells).toEqual(['p', 'p', 'p', 'p']); // the last chord started late in its bar: « x » would repeat the slashes
    expect(song.music.startsWith('[T44C^7   | x  |D-7 G7 |pppp|ppC^7 |pppp')).toBe(true);
    expect(obfuscate(song.music)).toContain('Kcl'); // the real files write « | x » as Kcl once scrambled
  });

  it('N.C. is a cell of its own and the silence after it is empty, not a repeat', () => {
    const chart = chartOf({ chords: [at(0, C('7', 7)), at(4, null), at(12, C('maj7'))], bars: 4 });
    const { song, bars } = roundTrip(chart);
    expect(song.bars[1]!.cells).toEqual(['n', '', '', '']);
    expect(song.bars[2]!.cells).toEqual(['', '', '', '']);
    expect(bars[2]!.repeat).toBe(false);
  });

  it('a pick-up bar comes first, as a whole bar with its chord on the last beats', () => {
    const chart = chartOf({ chords: [at(-2, C('7', 7)), at(0, C('maj7')), at(4, C('min7', 2))], bars: 3 });
    expect(chart.bars[0]!.bar).toBe(-1);
    const { song } = roundTrip(chart);
    expect(song.bars[0]!.cells).toEqual(['', '', 'G7', '']);
    expect(song.bars.length).toBe(chart.bars.length);
  });

  it('a change of meter writes its signature where it happens', () => {
    const chart = chartOf({ chords: [at(0, C('maj7')), at(4, C('min7', 2))], bars: 2 });
    chart.bars[1]!.timeSignature = meter(3);
    chart.bars[1]!.chords = [{ beat: 0, chord: C('min7', 2), text: '', doubtful: false }];
    const song = decodeIRealLink(exportToIRealPro(chart).url)[0]!;
    expect(song.bars[0]!.cells).toHaveLength(4);
    expect(song.bars[1]!.cells).toHaveLength(3);
    expect(song.bars[1]!.timeSignature).toEqual(meter(3));
    expect(song.music).toContain('|T34D-7');
  });

  it('a long piece: hundreds of bars, line breaks every 16 cells are iReal’s own, sections kept', () => {
    const chords: ChartChord[] = [];
    const qualities: ChordSymbol['quality'][] = ['maj7', 'min7', '7', 'min7', 'dim7', 'hdim7', 'min6', 'maj6'];
    for (let bar = 0; bar < 300; bar++) {
      chords.push(at(bar * 4, C(qualities[bar % 8]!, (bar * 7) % 12, bar % 5 === 0 ? ['9'] : [])));
      if (bar % 6 === 3) chords.push(at(bar * 4 + 2, C('7', (bar * 5) % 12, ['b9'])));
    }
    const sections = Array.from({ length: 10 }, (_, i): SectionMark => ({ time: i * 30 * 2, label: 'ABCDivEF'[i % 8]! }));
    const chart = chartOf({ chords, sections, bars: 300 });
    const { song } = roundTrip(chart);
    expect(song.bars).toHaveLength(300);
    expect(song.music.length).toBeGreaterThan(1500);
    // Whatever the length, the scrambled field is the chart string's length plus the substitutions' savings.
    expect(obfuscate(song.music).length).toBeGreaterThan(1000);
    expect(song.music).not.toMatch(/\n/);
  });

  it('exercises the 50-character boundaries of the shuffle with charts of every small size', () => {
    for (let bars = 1; bars <= 40; bars++) {
      const chords = Array.from({ length: bars }, (_, i) => at(i * 4, C(i % 2 ? 'min7' : '7', (i * 5) % 12)));
      roundTrip(chartOf({ chords, bars }));
    }
  });

  it('every quality, every root, every extension, with basses, in a chart that is read back', () => {
    const chords: ChartChord[] = [];
    let beat = 0;
    for (const quality of CHORD_QUALITIES) {
      for (const ext of [undefined, ...CHORD_EXTENSIONS]) {
        chords.push(at(beat, { root: (beat / 4) % 12, quality, extensions: ext ? [ext] : [], bass: beat % 8 === 0 ? ((beat / 4) % 12 + 5) % 12 : null }));
        beat += 4;
      }
    }
    roundTrip(chartOf({ chords, bars: beat / 4 }));
  });

  it('empty chart: bars without chords are empty cells, the chart is still a valid link', () => {
    const chart = chartOf({ chords: [], bars: 3, key: null, tempo: null });
    const { song } = roundTrip(chart);
    expect(song.bars.every((b) => b.cells.every((c) => c === ''))).toBe(true);
  });

  it('unusual titles: quotes, accents, separators, emoji, control characters, very long', () => {
    for (const title of ['Café = Été "Live" <b>&amp;</b> 100% ♭ — ç/é', 'A=B===C', "L'été d'un \"ange\" (take 2) #1", '日本語のタイトル 🎷', 'x'.repeat(300), '\n  \t ', 'a%20b', '??/\\:*|']) {
      const chart = chartOf({ chords: [at(0, C('maj7'))], title });
      const { out, song } = roundTrip(chart);
      expect(song.title).toBe(iRealText(title, 'Untitled'));
      expect(out.html).not.toMatch(/<b>/);
      expect(out.fileName).toMatch(/^[^/\\:*?"<>|\u0000-\u001f]+\.html$/);
    }
  });
});

// ---------------------------------------------------------------- the page and the file name

describe('the page handed to the user', () => {
  it('is named after the piece, holds the link and one French sentence', () => {
    const out = exportToIRealPro(chartOf({ chords: [at(0, C('maj7'))], title: 'Blues du dimanche' }));
    expect(out.fileName).toBe('Blues du dimanche.html');
    expect(out.html).toContain(`<a href="${out.url}">`);
    expect(out.html).toContain('lang="fr"');
    expect(out.html).toMatch(/ouvrez ce fichier avec iReal Pro/);
    expect(out.html).toContain('<title>Blues du dimanche · iReal Pro</title>');
    // The link is the only thing in it that looks like a link.
    expect(out.html.match(/irealb:\/\//g)).toHaveLength(1);
  });

  it('escapes the title', () => {
    const page = iRealPage('<script>alert("x")</script> & co', 'irealb://x');
    expect(page).not.toContain('<script>');
    expect(page).toContain('&#60;script&#62;');
  });

  it('makes a file name every system accepts', () => {
    expect(iRealFileName('Blues du dimanche')).toBe('Blues du dimanche.html');
    expect(iRealFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.html');
    expect(iRealFileName('...  ')).toBe('grille.html');
    expect(iRealFileName('é'.repeat(200))).toHaveLength(80 + '.html'.length);
  });

  it('is ready', () => {
    expect(IREAL_EXPORT_READY).toBe(true);
  });

  it('tokenizes what it writes into bars with no stray text', () => {
    const chart = chartOf({ chords: [at(0, C('maj7')), at(4, C('7', 7))], bars: 4 });
    const bars = tokenize(iRealMusic(chart));
    expect(bars).toHaveLength(4);
    expect(bars.at(-1)!.close).toBe('Z');
  });
});
