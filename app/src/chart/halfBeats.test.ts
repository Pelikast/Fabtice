// 1.0.3: up to eight chords in a bar, on the beats and between them. Where a stored chord is
// written, what the editor can do with a bar, and what stays as before for the chords on the beats.

import { describe, expect, it } from 'vitest';
import { tempoMapFromBeats } from '../grid/beats';
import { halveTempo } from '../grid/corrections';
import { constantTempoMap } from '../grid/tempoMap';
import { chord } from '../harmony/chord';
import type { AnalysedChord } from '../model/analysis';
import { emptyCorrections } from '../model/corrections';
import { entriesOf, movableBeats, withBarChords, withChordAdded, withChordMoved, type BarEntry } from './edits';
import { chartBars, HALF_BEAT_WINDOW, MAX_BAR_CHORDS, maxBarChords, nearestSlot, resolveChords, slotsPerBeat, snapToSlot } from './layout';

const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const an = (time: number, c = chord(0, 'maj7')): AnalysedChord => ({ time, chord: c, confidence: 0.8, doubtful: false, alternatives: [] });
const entry = (beatInBar: number, root = 0): BarEntry => ({ beatInBar, chord: chord(root, '7') });
const beatsOf = (c: ReturnType<typeof emptyCorrections>, bar: number, m = map) =>
  chartBars({ map: m, chords: resolveChords(m, null, c), sections: [], duration: 16 }).find((b) => b.bar === bar)!.chords.map((x) => x.beatInBar);

describe('where a stored chord is written', () => {
  it('on its beat, or on the middle of a beat when it is stored right there', () => {
    expect(snapToSlot(2)).toBe(2);
    expect(snapToSlot(2.5)).toBe(2.5);
    expect(snapToSlot(2.5 - HALF_BEAT_WINDOW)).toBe(2.5);
    expect(snapToSlot(2.5 + HALF_BEAT_WINDOW)).toBe(2.5);
    expect(snapToSlot(-0.5)).toBe(-0.5);
  });

  it('a chord on a beat stays on it when the grid moves a third of a beat under it, as before', () => {
    // The window around the middle is narrow on purpose: 0.3 or 0.7 of a beat is still the beat.
    expect(snapToSlot(2.3)).toBe(2);
    expect(snapToSlot(2.7)).toBe(3);
    expect(snapToSlot(2.34)).toBe(2);
    expect(nearestSlot(map, 1.15)).toBe(2);
    expect(nearestSlot(map, 1.25)).toBe(2.5);
  });

  it('an analysed chord between two beats is written there; the others where they were', () => {
    const chords = resolveChords(map, [an(0), an(0.75, chord(2, 'min7')), an(1.02, chord(7, '7'))], emptyCorrections());
    expect(chords.map((c) => c.beat)).toEqual([0, 1.5, 2]);
    const bars = chartBars({ map, chords, sections: [], duration: 4 });
    expect(bars[0]!.chords.map((c) => c.beatInBar)).toEqual([0, 1.5, 2]);
  });

  it('on a grid made of analysed beats, the middle of a beat is its « et » whatever the tempo does', () => {
    const times = [0, 0.5, 1.1, 1.6, 2.0, 2.5, 3.2, 3.7, 4.2];
    const m = tempoMapFromBeats(times, 0);
    expect(nearestSlot(m, (1.1 + 1.6) / 2)).toBe(2.5);
    expect(nearestSlot(m, (2.5 + 3.2) / 2)).toBe(5.5);
    expect(nearestSlot(m, 3.2)).toBe(6);
  });

  it('the tempo divided by two: a chord of beat 2 is then between two beats, where the music is', () => {
    const c = withBarChords(emptyCorrections(), map, 0, [entry(0), entry(1, 5), entry(2, 7)]);
    const half = halveTempo(map);
    expect(beatsOf(c, 0, half)).toEqual([0, 0.5, 1]);
  });
});

describe('a bar written by hand', () => {
  it('holds chords on the beats and between them', () => {
    const c = withBarChords(emptyCorrections(), map, 1, [entry(0), entry(0.5, 2), entry(1.5, 4), entry(3.5, 7)]);
    expect(c.chords.map((h) => h.time)).toEqual([2, 2.25, 2.75, 3.75]);
    expect(beatsOf(c, 1)).toEqual([0, 0.5, 1.5, 3.5]);
  });

  it('holds eight chords in 4/4, and never more', () => {
    const eight = Array.from({ length: 8 }, (_, k) => entry(k / 2, k));
    const c = withBarChords(emptyCorrections(), map, 0, eight);
    expect(beatsOf(c, 0)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(MAX_BAR_CHORDS).toBe(8);
    const m = (numerator: number, denominator = 4) => ({ numerator, denominator });
    expect(maxBarChords(m(4))).toBe(8);
    expect(maxBarChords(m(3))).toBe(6);
    expect(maxBarChords(m(2))).toBe(4);
    expect(maxBarChords(m(6))).toBe(8);
    // Beats that are eighths already: a chord per beat, eight at most.
    expect(maxBarChords(m(6, 8))).toBe(6);
    expect(maxBarChords(m(7, 8))).toBe(7);
    expect(maxBarChords(m(12, 8))).toBe(8);
  });

  it('in 6/8 the places are the six eighths: nothing between them', () => {
    const m68 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 6, denominator: 8 }, origin: 'manual' });
    expect(slotsPerBeat({ numerator: 6, denominator: 8 })).toBe(1);
    expect(slotsPerBeat({ numerator: 4, denominator: 4 })).toBe(2);
    expect(slotsPerBeat({ numerator: 2, denominator: 2 })).toBe(2);
    const six = Array.from({ length: 6 }, (_, k) => entry(k, k));
    expect(beatsOf(withBarChords(emptyCorrections(), m68, 0, six), 0, m68)).toEqual([0, 1, 2, 3, 4, 5]);
    // A place given between two eighths goes to an eighth; a chord stored there is written on an eighth too.
    expect(beatsOf(withBarChords(emptyCorrections(), m68, 0, [entry(0), entry(2.4, 2)]), 0, m68)).toEqual([0, 2]);
    expect(nearestSlot(m68, 0.75)).toBe(2);
    expect(movableBeats([entry(0), entry(3, 2)], 1, 6, { numerator: 6, denominator: 8 })).toEqual([1, 2, 3, 4, 5]);
    const meter = { numerator: 6, denominator: 8 };
    expect(withChordAdded([entry(0)], 0, 6, meter)!.entries.map((e) => e.beatInBar)).toEqual([0, 3]);
    let entries = [entry(0)];
    for (let n = 1; n < 6; n++) entries = withChordAdded(entries, 0, 6, meter)!.entries;
    expect(entries.map((e) => e.beatInBar)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(withChordAdded(entries, 0, 6, meter)).toBeNull();
  });

  it('a place given roughly goes to the nearest half beat; a place outside the bar is dropped', () => {
    const c = withBarChords(emptyCorrections(), map, 0, [entry(0.4), entry(2.3, 2), entry(4, 5), entry(-0.5, 7)]);
    expect(beatsOf(c, 0)).toEqual([0.5, 2.5]);
  });

  it('what the chart shows can be handed back to the editor unchanged', () => {
    const c = withBarChords(emptyCorrections(), map, 0, [entry(0), entry(2.5, 2)]);
    const shown = chartBars({ map, chords: resolveChords(map, null, c), sections: [], duration: 4 })[0]!.chords;
    const again = withBarChords(c, map, 0, entriesOf(shown));
    expect(again.chords).toEqual(c.chords);
  });
});

describe('one more chord in a bar', () => {
  it('goes to the middle of the room after the chosen chord, on a beat when it can', () => {
    expect(withChordAdded([entry(0)], 0, 4)!.entries.map((e) => e.beatInBar)).toEqual([0, 2]);
    expect(withChordAdded([entry(0), entry(2)], 0, 4)!.entries.map((e) => e.beatInBar)).toEqual([0, 1, 2]);
    expect(withChordAdded([entry(0), entry(2)], 1, 4)!.entries.map((e) => e.beatInBar)).toEqual([0, 2, 3]);
    expect(withChordAdded([entry(0), entry(1)], 0, 4)!.entries.map((e) => e.beatInBar)).toEqual([0, 0.5, 1]);
    // Three beats of room: beat 2, not « 1 et ».
    expect(withChordAdded([entry(0)], 0, 3)!.entries.map((e) => e.beatInBar)).toEqual([0, 1]);
    expect(withChordAdded([entry(0.5), entry(3)], 0, 4)!.entries.map((e) => e.beatInBar)).toEqual([0.5, 2, 3]);
  });

  it('starts as a copy of the chord before it, and says where it is', () => {
    const added = withChordAdded([entry(0, 5), entry(2, 7)], 1, 4)!;
    expect(added.index).toBe(2);
    expect(added.entries[2]).toEqual({ beatInBar: 3, chord: chord(7, '7') });
  });

  it('with no room after the chosen chord, takes the widest room of the bar', () => {
    const tight = [entry(0), entry(0.5, 2), entry(3, 4)];
    const added = withChordAdded(tight, 0, 4)!;
    expect(added.entries.map((e) => e.beatInBar)).toEqual([0, 0.5, 2, 3]);
    expect(added.index).toBe(2);
    // Room only before the first chord: the bar line.
    const late = [entry(3), entry(3.5, 2)];
    expect(withChordAdded(late, 1, 4)!.entries.map((e) => e.beatInBar)).toEqual([0, 3, 3.5]);
  });

  it('adding one after another fills the bar up to eight, then stops', () => {
    let entries = [entry(0)];
    for (let n = 1; n < 8; n++) {
      const added = withChordAdded(entries, entries.length - 1, 4);
      expect(added, `chord ${n + 1}`).not.toBeNull();
      entries = added!.entries;
      expect(entries.map((e) => e.beatInBar)).toEqual([...entries.map((e) => e.beatInBar)].sort((a, b) => a - b));
      expect(new Set(entries.map((e) => e.beatInBar)).size).toBe(entries.length);
    }
    expect(entries.map((e) => e.beatInBar)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(withChordAdded(entries, 0, 4)).toBeNull();
    expect(withChordAdded([], 0, 4)).toBeNull();
  });

  it('a 2/4 bar holds four', () => {
    let entries = [entry(0)];
    for (let n = 1; n < 4; n++) entries = withChordAdded(entries, 0, 2)!.entries;
    expect(entries.map((e) => e.beatInBar)).toEqual([0, 0.5, 1, 1.5]);
    expect(withChordAdded(entries, 0, 2)).toBeNull();
  });
});

describe('moving a chord between two beats', () => {
  it('to the « et » of a beat and back', () => {
    const two = [entry(0), entry(2, 7)];
    const moved = withChordMoved(two, 1, 2.5, 4);
    expect(moved.map((e) => e.beatInBar)).toEqual([0, 2.5]);
    expect(withChordMoved(moved, 1, 2, 4).map((e) => e.beatInBar)).toEqual([0, 2]);
    expect(movableBeats(moved, 0, 4)).toEqual([0, 0.5, 1, 1.5, 2]);
  });
});
