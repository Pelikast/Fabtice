import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import { placeMarkers } from '../timeline/markerLayer';
import {
  barForNewSection,
  cleanName,
  defaultLoopName,
  loopWithRegion,
  nextSectionLetter,
  sectionAt,
  sectionRanges,
  withLoopAdded,
  withLoopMoved,
  withLoopRemoved,
  withLoopRenamed,
} from './markers';

const map = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }); // 2 s bars from 1 s

describe('sections as ranges', () => {
  it('from each letter’s bar line to the next one’s, the last to the end of the piece', () => {
    const r = sectionRanges(map, [{ time: 1, label: 'A' }, { time: 17.1, label: 'B' }, { time: 33, label: 'A' }], 40);
    expect(r).toEqual([
      { label: 'A', bar: 0, start: 1, end: 17 },
      { label: 'B', bar: 8, start: 17, end: 33 },
      { label: 'A', bar: 16, start: 33, end: 40 },
    ]);
    expect(sectionAt(r, 20)?.label).toBe('B');
    expect(sectionAt(r, 0.5)).toBeNull();
  });

  it('follow a corrected grid (letters stay on the music, ranges on the bar lines)', () => {
    const faster = constantTempoMap({ bpm: 240, firstDownbeat: 1, meter: { numerator: 4, denominator: 4 }, origin: 'corrected' });
    const r = sectionRanges(faster, [{ time: 1, label: 'A' }, { time: 17, label: 'B' }], 40);
    expect(r[1]).toEqual({ label: 'B', bar: 16, start: 17, end: 40 });
  });

  it('new section: the bar holding the time; next free letter', () => {
    expect(barForNewSection(map, 4.2)).toBe(1);
    expect(barForNewSection(map, 3)).toBe(1); // on a bar line: that bar
    expect(nextSectionLetter([{ time: 1, label: 'A' }, { time: 3, label: 'b' }])).toBe('C');
    expect(nextSectionLetter([])).toBe('A');
  });
});

describe('named loops', () => {
  const a = { id: 'a', name: 'Boucle 1', region: { start: 1, end: 3 } };
  const b = { id: 'b', name: 'Pont', region: { start: 5.5, end: 7.25 } };
  it('names: cleaned, never empty; « Boucle n » with the first free number', () => {
    expect(cleanName('  Le   pont ')).toBe('Le pont');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(60))!.length).toBe(40);
    expect(defaultLoopName([a, b], 'Boucle')).toBe('Boucle 2');
  });
  it('add, find by region, rename, move, remove', () => {
    let m = withLoopAdded(withLoopAdded({ loops: [] }, a), b);
    expect(loopWithRegion(m, { start: 5.5, end: 7.25 })?.id).toBe('b');
    expect(loopWithRegion(m, { start: 5.5, end: 7.3 })).toBeNull();
    m = withLoopRenamed(m, 'a', 'Thème');
    expect(withLoopRenamed(m, 'a', ' ')).toBe(m);
    m = withLoopMoved(m, 'b', -1);
    expect(m.loops.map((l) => l.name)).toEqual(['Pont', 'Thème']);
    expect(withLoopMoved(m, 'b', -1)).toBe(m);
    expect(withLoopRemoved(m, 'b').loops.map((l) => l.id)).toEqual(['a']);
  });
});

describe('ruler placement', () => {
  const spans = [
    { kind: 'section' as const, ref: '0', text: 'A', title: 'A', start: 1, end: 17, current: false },
    { kind: 'loop' as const, ref: 'x', text: 'Pont', title: 'Pont', start: 1.2, end: 5, current: true },
    { kind: 'loop' as const, ref: 'y', text: 'Solo', title: 'Solo', start: 1.4, end: 3, current: false },
    { kind: 'loop' as const, ref: 'z', text: 'Fin', title: 'Fin', start: 90, end: 95, current: false },
  ];
  it('labels in view, a label that would run into another is compact, out of view is left out', () => {
    const placed = placeMarkers(spans, 0, 50, 1000, (text) => text.length * 8 + 10);
    expect(placed.map((p) => p.key)).toEqual(['section:0', 'loop:x', 'loop:y']);
    expect(placed[0]!.x).toBe(53); // 1 s at 50 px/s, plus 3 px after the bar line
    expect(placed[1]!.compact).toBe(true); // runs into the section box
    expect(placed[2]!.compact).toBe(true);
    expect(placed[1]!.width).toBeCloseTo(190, 6);
    const wide = placeMarkers(spans, 0, 400, 3000, (text) => text.length * 8 + 10);
    expect(wide.find((p) => p.key === 'loop:x')!.compact).toBe(false);
  });
});
