// C10, « Affichage »: the chords are spelled in the key of their passage, the bar where a passage
// starts carries its key (`ChartBar.keyChange`), and the contexts stay the same objects while
// nothing they depend on changes (so that the chart and the timeline do not redraw for nothing).

import { describe, expect, it } from 'vitest';
import { chartBars } from '../chart/layout';
import { demoAnalysis, demoCorrections } from '../demo/demoAnalysis';
import { demoTempoMap } from '../demo/demoProject';
import { barStartTime } from '../grid/tempoMap';
import { displayChordText } from '../harmony/display';
import type { Key } from '../model/harmony';
import { selectBarChords, selectBarContext, selectBarContexts, selectChartBars, selectDisplayContext, selectDisplayContextAt } from './chartSelectors';
import { initialState, type AppState } from './store';

const E: Key = { tonic: 4, mode: 'major' };

function demoState(patch: Partial<AppState> = {}): AppState {
  const map = demoTempoMap('variable');
  const s = initialState();
  return {
    ...s,
    project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' }, duration: 54, sampleRate: 48000, createdAt: '' },
    tempoMap: map,
    analysis: demoAnalysis(map, 54),
    corrections: demoCorrections(map),
    ...patch,
  };
}

/** The demo piece with a modulation to E major found a little after the start of bar 8 (index). */
function modulating(patch: Partial<AppState> = {}): AppState {
  const s = demoState(patch);
  const at = barStartTime(s.tempoMap, 8) + 0.1;
  return { ...s, analysis: { ...s.analysis!, keyChanges: [{ time: at, key: { ...E, confidence: 0.8, alternatives: [] } }] } };
}

describe('ChartBar.keyChange', () => {
  it('on the bar line nearest the change, null elsewhere; the first bar never carries one', () => {
    const bars = selectChartBars(modulating());
    expect(bars.filter((b) => b.keyChange).map((b) => [b.bar, b.keyChange])).toEqual([[8, E]]);
    const s = demoState();
    const atStart = chartBars({ map: s.tempoMap, chords: [], sections: [], duration: 54, keyChanges: [{ time: 0.01, key: E }] });
    expect(atStart.every((b) => b.keyChange === null)).toBe(true);
  });

  it('the hand list in force wins over the detected one', () => {
    const s = modulating();
    const hand = { ...s, corrections: { ...s.corrections, keyChanges: [{ time: barStartTime(s.tempoMap, 12), key: { tonic: 1, mode: 'major' as const } }] } };
    expect(selectChartBars(hand).filter((b) => b.keyChange).map((b) => b.bar)).toEqual([12]);
  });
});

describe('spelling by passage', () => {
  it('the bars from the change on are spelled in the new key; before it, in the main one', () => {
    const s = modulating();
    const before = selectBarChords(s, 6);
    const after = selectBarChords(s, 14);
    expect(before.ctx.key).toEqual({ tonic: 8, mode: 'major' });
    expect(after.ctx.key).toEqual(E);
    // Bar 15 of the demo is B♭m7 E♭7: A♯m7 D♯7 in E.
    expect(after.chords.map((c) => displayChordText(c.chord, after.ctx))).toEqual(['A♯m7', 'D♯7']);
    expect(selectDisplayContextAt(s, barStartTime(s.tempoMap, 10)).key).toEqual(E);
    expect(selectDisplayContextAt(s, 1).key).toEqual({ tonic: 8, mode: 'major' });
    // The main key's context is still the title's.
    expect(selectDisplayContext(s).key).toEqual({ tonic: 8, mode: 'major' });
    expect(selectBarContext(s, 0)).toBe(selectDisplayContext(s));
  });

  it('the transposition and the instrument move every passage together', () => {
    const s = modulating();
    const up = { ...s, playback: { ...s.playback, semitones: 2 }, view: { ...s.view, instrument: 'sib' as const } };
    expect(selectBarContext(up, 3).key).toEqual({ tonic: 0, mode: 'major' }); // A♭ + 2 + 2
    expect(selectBarContext(up, 14).key).toEqual({ tonic: 8, mode: 'major' }); // E + 4
    expect(selectBarContext(up, 14).shift).toBe(selectDisplayContext(up).shift);
  });

  it('the same context objects while nothing they depend on changes (a chord edit, a refresh finding the same)', () => {
    const s = modulating();
    const a = selectBarContexts(s);
    const edited = { ...s, corrections: { ...s.corrections, chords: [...s.corrections.chords] } };
    const b = selectBarContexts(edited);
    expect(b.get(3)).toBe(a.get(3));
    expect(b.get(14)).toBe(a.get(14));
    expect(selectDisplayContext(edited)).toBe(selectDisplayContext(s));
    // A refreshed analysis with the same chords: the same chords and bars.
    const refreshed = { ...s, analysis: { ...s.analysis!, structure: null } };
    expect(selectChartBars(refreshed)).toBe(selectChartBars(s));
    expect(selectBarContexts(refreshed)).toBe(selectBarContexts(s));
  });
});
