// Reads what the export writes with independent, published readers of the
// iReal Pro format, to be sure the links are not only consistent with our own
// decoder. They are development tools, never dependencies of the app, so this
// file does nothing unless pointed at a folder that has them installed:
//
//   mkdir /tmp/ireal-ref && cd /tmp/ireal-ref && npm init -y
//   npm i ireal-reader @music-i18n/ireal-musicxml        (MIT; GPL-3.0, only run here)
//   python3 -m venv venv && venv/bin/pip install pyRealParser   (MIT)
//   IREAL_REFERENCE_DIR=/tmp/ireal-ref IREAL_REFERENCE_PYTHON=/tmp/ireal-ref/venv/bin/python \
//     npx vitest run src/export/ireal.reference.test.ts
//
//   - ireal-reader (JavaScript): unscrambles, then reads the chord string into
//     bars of chords with its own tokenizer; also fed the HTML page itself.
//   - ireal-musicxml (JavaScript): the iReal Pro cell model with the playback
//     rules the author derived from the app; converts each chart to MusicXML
//     and logs what it cannot read (unknown chords, too many chords in a bar).
//   - pyRealParser (Python): another unscrambler and bar reader.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chartBars, type ChartChord } from '../chart/layout';
import { demoAnalysis, demoCorrections } from '../demo/demoAnalysis';
import { demoTempoMap } from '../demo/demoProject';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import { CHORD_EXTENSIONS, CHORD_QUALITIES, type ChordSymbol } from '../model/harmony';
import { initialState } from '../store/store';
import { buildExportChart, chartForExport, type ExportChart } from './chartExport';
import { exportToIRealPro, iRealChordText } from './ireal';

const dir = process.env.IREAL_REFERENCE_DIR;
const python = process.env.IREAL_REFERENCE_PYTHON;
const suite = dir ? describe : describe.skip;

const at = (beat: number, c: ChordSymbol | null): ChartChord => ({ time: beat * 0.5, beat, chord: c, origin: 'analysis', confidence: 0.6, doubtful: false, alternatives: [] });

function chartOf(chords: ChartChord[], bars: number, beats = 4, title = 'Reference'): ExportChart {
  const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: beats, denominator: 4 }, origin: 'manual' });
  return buildExportChart({ title, bars: chartBars({ map, chords, sections: [{ time: 0, label: 'A' }, { time: (bars / 2) * beats * 0.5, label: 'B' }], duration: bars * beats * 0.5 }), key: { tonic: 3, mode: 'major' }, semitones: 0, tempo: 132 });
}

function demoChart(): ExportChart {
  const map = demoTempoMap('variable');
  return chartForExport({
    ...initialState(),
    project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' }, duration: 54, sampleRate: 48000, createdAt: '' },
    tempoMap: map,
    analysis: demoAnalysis(map, 54),
    corrections: demoCorrections(map),
  })!;
}

function samples(): [string, ExportChart][] {
  const long: ChartChord[] = [];
  for (let b = 0; b < 120; b++) long.push(at(b * 4, chord((b * 5) % 12, (['maj7', 'min7', '7', 'min7'] as const)[b % 4]!, b % 7 === 0 ? ['9'] : [])));
  const qualities: ChartChord[] = [];
  let beat = 0;
  for (const q of CHORD_QUALITIES) {
    for (const e of [undefined, ...CHORD_EXTENSIONS]) {
      qualities.push(at(beat, chord(beat / 4 % 12, q, e ? [e] : [], beat % 8 === 0 ? 5 : null)));
      beat += 4;
    }
  }
  return [
    ['demo piece', demoChart()],
    ['3/4 with two chords', chartOf([at(0, chord(9, 'min7')), at(3, chord(2, '7')), at(5, chord(7, 'maj7')), at(6, chord(7, 'maj7')), at(9, chord(4, 'min7'))], 4, 3)],
    ['two and four chords, repeats, N.C.', chartOf([at(0, chord(2, 'min7')), at(2, chord(7, '7')), at(4, chord(0, 'maj7')), at(5, chord(9, 'min7')), at(6, chord(2, 'min7')), at(7, chord(7, '7')), at(12, null), at(16, chord(0, 'maj6'))], 6)],
    ['pick-up', chartOf([at(-2, chord(7, '7')), at(0, chord(0, 'maj7')), at(4, chord(2, 'min7'))], 4)],
    ['120 bars', chartOf(long, 120)],
    ['every quality and extension', chartOf(qualities, beat / 4)],
  ];
}

/** The chord texts the export writes for each bar, as a reader that knows the cell rules must give them back. */
function expectedMeasures(chart: ExportChart): (string | null)[][] {
  const out: (string | null)[][] = [];
  const single: boolean[] = []; // the bar is (or repeats) one chord on its first beat: « x » may stand for it
  chart.bars.forEach((bar) => {
    const list = bar.chords.map((c) => (c.chord === null ? null : iRealChordText(c.chord, chart.key)));
    if (list.length === 0 && bar.repeat && out.length > 0) {
      // « x »: the previous bar again. After a bar with several chords the export writes slashes instead, which carry no chord.
      const last = out.length - 1;
      out.push(single[last] ? [...out[last]!] : []);
      single.push(single[last]!);
    } else {
      out.push(list);
      single.push(bar.chords.length === 1 && bar.chords[0]!.beat === 0 && bar.chords[0]!.chord !== null);
    }
  });
  return out;
}

suite('readers of the iReal Pro format, on the links the export writes', () => {
  // Even a skipped suite runs its body to collect the tests: load the readers only when they are asked for.
  const req = dir ? createRequire(path.join(dir, 'package.json')) : (() => ({}) as never);
  const readIReal = req('ireal-reader') as (data: string) => { songs: { title: string; composer: string; style: string; key: string; bpm: number | null; music: { measures: (string | null)[][] } }[] };
  const ml = req('@music-i18n/ireal-musicxml') as {
    Playlist: new (data: string) => { songs: { title: string; key: string; bpm: number; cells: unknown[]; style: string }[] };
    Converter: { convert(song: unknown, options?: object): string };
    LogLevel: Record<string, number>;
  };

  it.each(samples())('ireal-reader reads %s: fields and bars of chords, from the link and from the page', (_name, chart) => {
    const out = exportToIRealPro(chart);
    for (const input of [out.url, out.html]) {
      const { songs } = readIReal(input);
      expect(songs).toHaveLength(1);
      const song = songs[0]!;
      expect(song.title).toBe(chart.title);
      expect(song.style).toBe('Medium Swing');
      expect(song.bpm).toBe(chart.tempo);
      const measures = song.music.measures.filter((m) => m.length > 0);
      expect(measures).toEqual(expectedMeasures(chart).filter((m) => m.length > 0));
    }
    console.log(`ireal-reader: ${chart.title} / ${_name}: ${chart.bars.length} bars read`);
  });

  it.each(samples())('ireal-musicxml reads %s into cells and converts it to MusicXML without a warning', (_name, chart) => {
    const out = exportToIRealPro(chart);
    const playlist = new ml.Playlist(out.url);
    expect(playlist.songs).toHaveLength(1);
    const song = playlist.songs[0]!;
    expect(song.title).toBe(chart.title);
    expect(song.key).toBe(chart.key ? out.url && decodeURIComponent(out.url).split('=')[4] : 'C');
    let beats = 3;
    let total = 0;
    chart.bars.forEach((b, i) => {
      if (i === 0) beats = chart.timeSignature.numerator;
      if (b.timeSignature) beats = b.timeSignature.numerator;
      total += beats;
    });
    // One cell per beat, nothing else counted as a cell (the reader adds an empty one after the final bar line when nothing follows it).
    expect([total, total + 1]).toContain(song.cells.length);
    const logs: string[] = [];
    const spies = (['warn', 'error', 'info', 'debug'] as const).map((m) => {
      const orig = console[m];
      console[m] = (...a: unknown[]) => void logs.push(a.join(' '));
      return () => (console[m] = orig);
    });
    let xml = '';
    try {
      xml = ml.Converter.convert(song, { logLevel: ml.LogLevel.Warn });
    } finally {
      spies.forEach((restore) => restore());
    }
    expect(logs).toEqual([]);
    expect((xml.match(/<measure /g) ?? []).length).toBeGreaterThanOrEqual(chart.bars.filter((b) => b.chords.length > 0 || b.repeat).length);
    expect(xml).toContain('<harmony');
    console.log(`ireal-musicxml: ${_name}: ${song.cells.length} cells, ${(xml.match(/<measure /g) ?? []).length} measures converted, no warning`);
  });

  it('ireal-musicxml recognises every chord quality the export can write', () => {
    for (const q of CHORD_QUALITIES) {
      const text = iRealChordText(chord(0, q), null);
      const chart = chartOf([at(0, chord(0, q)), at(4, chord(0, q, ['9']))], 2);
      const song = new ml.Playlist(exportToIRealPro(chart).url).songs[0]!;
      const logs: string[] = [];
      const orig = console.warn;
      console.warn = (...a: unknown[]) => void logs.push(a.join(' '));
      try {
        ml.Converter.convert(song, { logLevel: ml.LogLevel.Warn });
      } finally {
        console.warn = orig;
      }
      expect(logs.filter((l) => /Unrecognized chord/.test(l)), text).toEqual([]);
    }
  });

  const pyTest = python ? it.each(samples()) : it.skip.each(samples());
  pyTest('pyRealParser reads %s: title, key, tempo and the chords of each bar', (_name, chart) => {
    const out = exportToIRealPro(chart);
    const script = [
      'import sys, json',
      'from pyRealParser import Tune',
      'tunes = Tune.parse_ireal_url(sys.argv[1])',
      't = tunes[0]',
      'print("@@" + json.dumps({"title": t.title, "key": t.key, "bpm": t.bpm, "style": t.style, "measures": t.measures_as_strings}))',
    ].join('\n');
    const run = spawnSync(python!, ['-I', '-c', script, out.url], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const json = JSON.parse(run.stdout.split('@@')[1]!) as { title: string; key: string; bpm: number | string; style: string; measures: string[] };
    expect(json.title).toBe(chart.title);
    expect(json.style).toBe('Medium Swing');
    expect(Number(json.bpm)).toBe(chart.tempo);
    // This reader glues the chords of a bar together (« D-7G7 »), writes the chord before in place of each slash,
    // and strips every « l » from the text (it takes it for a « large chord » mark, so 7alt becomes 7at): compare bar by bar as text.
    let beats = chart.timeSignature.numerator;
    let last = '';
    const wanted: string[] = [];
    expectedMeasures(chart).forEach((m, i) => {
      const bar = chart.bars[i]!;
      if (bar.timeSignature) beats = bar.timeSignature.numerator;
      if (m.length === 0 && bar.repeat) wanted.push(last.repeat(beats));
      else wanted.push(m.map((c) => c ?? 'n').join(''));
      const chords = m.filter((c) => c !== null);
      if (chords.length > 0) last = chords[chords.length - 1]!.replace(/\/.*/, '');
    });
    const read = json.measures.filter((m) => m !== '');
    expect(read).toEqual(wanted.filter((m) => m !== '').map((m) => m.replaceAll('alt', 'at')));
    console.log(`pyRealParser: ${_name}: ${json.measures.length} measures read`);
  });
});
