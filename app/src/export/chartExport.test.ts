import { describe, expect, it } from 'vitest';
import { demoAnalysis, demoCorrections } from '../demo/demoAnalysis';
import { demoTempoMap } from '../demo/demoProject';
import { emptyCorrections } from '../model/corrections';
import { initialState, type AppState } from '../store/store';
import { barStartTime } from '../grid/tempoMap';
import { chartForExport, exportToIRealPro, IREAL_EXPORT_READY } from './index';
import { iRealMusic, keyChangeComment } from './ireal';

function demoState(patch: Partial<AppState> = {}): AppState {
  const map = demoTempoMap('variable');
  const duration = 54;
  const s = initialState();
  return {
    ...s,
    project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' }, duration, sampleRate: 48000, createdAt: '' },
    tempoMap: map,
    analysis: demoAnalysis(map, duration),
    corrections: demoCorrections(map),
    ...patch,
  };
}

describe('the chart ready for export', () => {
  it('bars, sections, double bars, time signature, chords at concert pitch in the original key', () => {
    const chart = chartForExport(demoState())!;
    expect(chart.title).toBe('Blues du dimanche');
    expect(chart.key).toMatchObject({ tonic: 8, mode: 'major' });
    expect(chart.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(chart.tempo).toBe(110);
    expect(chart.repeats).toBe('none');
    expect(chart.bars[0]).toMatchObject({ bar: 0, section: 'A', doubleBarBefore: false, timeSignature: { numerator: 4, denominator: 4 } });
    expect(chart.bars[8]).toMatchObject({ section: 'B', doubleBarBefore: true, timeSignature: null });
    expect(chart.bars[14]!.chords.map((c) => [c.beat, c.text])).toEqual([[0, 'B♭m7'], [2, 'E♭7']]);
    expect(chart.bars[11]!.chords[0]).toMatchObject({ text: 'D♭m6', doubtful: true });
    expect(chart.bars.at(-1)).toMatchObject({ repeat: true, final: true });
  });

  it('the transport transposition applies, the instrument does not (iReal Pro transposes itself)', () => {
    const s = demoState();
    const chart = chartForExport({ ...s, playback: { ...s.playback, semitones: 5 }, view: { ...s.view, instrument: 'sib' } })!;
    expect(chart.key).toMatchObject({ tonic: 1, mode: 'major' });
    expect(chart.bars[0]!.chords[0]!.text).toBe('D♭△');
  });

  it('a piece not analysed yet: bars without chords, no key, no tempo', () => {
    const s = initialState();
    const chart = chartForExport({ ...s, project: demoState().project, corrections: emptyCorrections() })!;
    expect(chart.key).toBeNull();
    expect(chart.tempo).toBeNull();
    expect(chart.bars.every((b) => b.chords.length === 0 && !b.repeat)).toBe(true);
    expect(chartForExport(initialState())).toBeNull();
  });

  it('the iReal Pro encoding is written (see ireal.test.ts)', () => {
    expect(IREAL_EXPORT_READY).toBe(true);
    expect(exportToIRealPro(chartForExport(demoState())!).url).toMatch(/^irealb:\/\//);
  });
});

describe('C10: the modulations in the export', () => {
  it('chords spelled in the key of their passage, the main key kept, the new key as a comment on its bar', () => {
    const base = demoState();
    const e = { tonic: 4, mode: 'major' as const };
    const s = { ...base, corrections: { ...base.corrections, keyChanges: [{ time: barStartTime(base.tempoMap, 8) + 0.05, key: e }] } };
    const chart = chartForExport(s)!;
    expect(chart.key).toMatchObject({ tonic: 8, mode: 'major' });
    expect(chart.bars[7]).toMatchObject({ keyChange: null, key: { tonic: 8, mode: 'major' } });
    expect(chart.bars[8]).toMatchObject({ keyChange: e, key: e });
    // B♭m7 E♭7 in A♭, A♯m7 D♯7 in E.
    expect(chart.bars[14]!.chords.map((c) => c.text)).toEqual(['A♯m7', 'D♯7']);
    const music = iRealMusic(chart);
    expect(music).toContain('<Ton : E>');
    expect(music.indexOf('<Ton : E>')).toBeGreaterThan(music.indexOf('*B'));
    expect(music).toContain('A#-7');
    expect(keyChangeComment({ tonic: 8, mode: 'major' })).toBe('Ton : Ab');
    expect(keyChangeComment({ tonic: 6, mode: 'minor' })).toBe('Ton : F#m');
    // Transposed with the transport, as the chords.
    const up = chartForExport({ ...s, playback: { ...s.playback, semitones: 1 } })!;
    expect(up.bars[8]!.keyChange).toEqual({ tonic: 5, mode: 'major' });
  });
});
