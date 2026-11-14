import { describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { DEMO_SWING } from '../analysis/demoSwing';
import { tempoMapFromBeats } from '../grid/beats';
import { shiftDownbeat } from '../grid/corrections';
import { constantTempoMap } from '../grid/tempoMap';
import { chord, chordText } from '../harmony/chord';
import { emptyCorrections } from '../model/corrections';
import type { AnalysedChord } from '../model/analysis';
import { addSpan, removeSpan, splitBeat, withBarChords, withoutBarEdit, withSection } from './edits';
import { barProgress, chartBars, chartLines, loopBars, resolveChords, sectionBar } from './layout';

const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const an = (time: number, c = chord(0, 'maj7'), extra: Partial<AnalysedChord> = {}): AnalysedChord => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [], ...extra });
const B = 2; // seconds per bar at 120 BPM in 4/4

describe('chords in force', () => {
  it('puts analysed chords on the nearest beat', () => {
    const chords = resolveChords(map, [an(0.02), an(2.97, chord(5, '7'))], emptyCorrections());
    expect(chords.map((c) => c.beat)).toEqual([0, 6]);
    expect(chords.every((c) => c.origin === 'analysis')).toBe(true);
  });

  it('a bar rewritten by hand hides the analysis there, even after a new analysis', () => {
    const corr = withBarChords(emptyCorrections(), map, 1, [{ beatInBar: 0, chord: chord(2, 'min7') }]);
    const first = resolveChords(map, [an(0), an(2), an(3), an(4)], corr);
    expect(first.map((c) => [c.beat, c.origin])).toEqual([[0, 'analysis'], [4, 'manual'], [8, 'analysis']]);
    // Another analysis with other chords: the hand bar still wins.
    const again = resolveChords(map, [an(0), an(2.5, chord(7, '7')), an(4)], corr);
    expect(again.map((c) => [c.beat, c.origin])).toEqual([[0, 'analysis'], [4, 'manual'], [8, 'analysis']]);
  });

  it('two chords on one beat: the later one wins', () => {
    const chords = resolveChords(map, [an(1.0, chord(0, 'maj')), an(1.1, chord(2, 'min'))], emptyCorrections());
    expect(chords).toHaveLength(1);
    expect(chords[0]!.chord).toEqual(chord(2, 'min'));
  });
});

describe('bars of the chart', () => {
  const input = (chords: AnalysedChord[], extra: { sections?: { time: number; label: string }[]; duration?: number } = {}) => ({
    map,
    chords: resolveChords(map, chords, emptyCorrections()),
    sections: extra.sections ?? [],
    duration: extra.duration ?? 8 * B,
  });

  it('one entry per bar to the end of the piece, chords in their bar, repeat signs', () => {
    const bars = chartBars(input([an(0), an(2 * B, chord(5, 'min7')), an(2 * B + 1, chord(10, '7'))]));
    expect(bars).toHaveLength(8);
    expect(bars[0]!.chords.map((c) => c.beatInBar)).toEqual([0]);
    expect(bars[1]!.repeat).toBe(true);
    expect(bars[2]!.chords.map((c) => c.beatInBar)).toEqual([0, 2]);
    expect(bars[7]!.repeat).toBe(true);
  });

  it('no repeat sign before the first chord or after « N.C. »', () => {
    const bars = chartBars(input([an(B), an(3 * B, null as never)]));
    expect(bars[0]!.repeat).toBe(false);
    expect(bars[2]!.repeat).toBe(true);
    expect(bars[4]!.repeat).toBe(false);
  });

  it('section letters on the nearest bar line, a double bar except at the start', () => {
    const bars = chartBars(input([an(0)], { sections: [{ time: 0.1, label: 'A' }, { time: 4 * B - 0.3, label: 'B' }] }));
    expect(bars[0]!.section).toBe('A');
    expect(bars[0]!.doubleBar).toBe(false);
    expect(bars[4]!.section).toBe('B');
    expect(bars[4]!.doubleBar).toBe(true);
    expect(sectionBar(map, 4 * B + 0.9)).toBe(4);
    expect(sectionBar(map, 4 * B + 1.1)).toBe(5);
  });

  it('lines of four from « mesure 1 », a pick-up line of its own', () => {
    const m = constantTempoMap({ bpm: 120, firstDownbeat: 2, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const bars = chartBars({ map: m, chords: resolveChords(m, [an(0.5)], emptyCorrections()), sections: [], duration: 21 });
    const lines = chartLines(bars);
    expect(lines[0]!.pickup).toBe(true);
    expect(lines[0]!.bars.map((b) => b.bar)).toEqual([-1]);
    expect(lines[1]!.bars.map((b) => b.bar)).toEqual([0, 1, 2, 3]);
    expect(lines.at(-1)!.bars.map((b) => b.bar)).toEqual([8, 9]);
  });

  it('the loop and the current bar', () => {
    expect(loopBars(map, { start: 2 * B, end: 4 * B }, true)).toEqual({ first: 2, last: 3 });
    expect(loopBars(map, { start: 2 * B, end: 4 * B }, false)).toBeNull();
    expect(barProgress(map, 3 * B + 0.5)).toEqual({ bar: 3, progress: 0.25 });
  });
});

describe('the prototype excerpt as a chart', () => {
  const result = demoSwingResult(DEMO_SWING.chords.at(-1)![1]);
  const grid = tempoMapFromBeats(result.beats.times, 0, result.beats.meter);
  const bars = chartBars({ map: grid, chords: resolveChords(grid, result.chords, emptyCorrections()), sections: [], duration: result.duration });
  const key = { tonic: 11, mode: 'major' as const };

  it('twenty bars, one chord per bar or a repeat, as the ground truth says', () => {
    expect(bars).toHaveLength(20);
    const written = bars.map((b) => (b.repeat ? '%' : b.chords.map((c) => chordText(c.chord, { key })).join(' ')));
    expect(written.slice(0, 8)).toEqual(['B△(9)', 'C°7', 'C♯m7(9)', 'F♯7', 'Em7(9)', 'A7(9, 13)', 'B△', '%']);
    expect(written.slice(8, 12)).toEqual(['B7(9, 13)', 'E7(9, 13)', 'B7(♯9)', '%']);
  });

  it('the passing diminished chord is doubtful', () => {
    expect(bars[1]!.chords[0]!.doubtful).toBe(true);
    expect(bars.filter((b) => b.chords.some((c) => c.doubtful))).toHaveLength(1);
  });

  it('first beat moved: the chords stay with the music, on beat 4 of the previous bar', () => {
    const moved = shiftDownbeat(grid, 1);
    const b = chartBars({ map: moved, chords: resolveChords(moved, result.chords, emptyCorrections()), sections: [], duration: result.duration });
    expect(b[0]!.bar).toBe(-1);
    expect(b[0]!.chords[0]!.beatInBar).toBe(3);
  });
});

describe('hand edits', () => {
  it('spans merge and cut', () => {
    expect(addSpan([{ start: 0, end: 2 }], { start: 2, end: 4 })).toEqual([{ start: 0, end: 4 }]);
    expect(addSpan([{ start: 6, end: 8 }], { start: 0, end: 2 })).toEqual([{ start: 0, end: 2 }, { start: 6, end: 8 }]);
    expect(removeSpan([{ start: 0, end: 6 }], { start: 2, end: 4 })).toEqual([{ start: 0, end: 2 }, { start: 4, end: 6 }]);
  });

  it('a bar written by hand, then given back to the analysis', () => {
    let c = withBarChords(emptyCorrections(), map, 2, [{ beatInBar: 0, chord: chord(5, 'min7') }, { beatInBar: 2, chord: chord(10, '7') }, { beatInBar: 9, chord: chord(0, 'maj') }]);
    expect(c.chords.map((h) => h.time)).toEqual([4, 5]);
    expect(c.handSpans).toEqual([{ start: 4, end: 6 }]);
    c = withBarChords(c, map, 2, [{ beatInBar: 0, chord: chord(5, '7') }]);
    expect(c.chords).toEqual([{ time: 4, chord: chord(5, '7') }]);
    c = withoutBarEdit(c, map, 2);
    expect(c.chords).toEqual([]);
    expect(c.handSpans).toEqual([]);
  });

  it('sections: one per bar, trimmed, removable', () => {
    let c = withSection(emptyCorrections(), map, 4, '  B ');
    c = withSection(c, map, 0, 'A');
    c = withSection(c, map, 4, 'Pont');
    expect(c.sections).toEqual([{ time: 0, label: 'A' }, { time: 8, label: 'Pont' }]);
    expect(withSection(c, map, 4, null).sections).toEqual([{ time: 0, label: 'A' }]);
  });

  it('split on the middle beat', () => {
    expect([2, 3, 4, 5, 6, 7].map(splitBeat)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
