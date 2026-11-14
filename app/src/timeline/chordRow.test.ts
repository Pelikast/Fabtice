import { describe, expect, it } from 'vitest';
import { chartBars, type ChartChord } from '../chart/layout';
import { constantTempoMap } from '../grid/tempoMap';
import { tempoMapFromBeats } from '../grid/beats';
import { chord } from '../harmony/chord';
import type { ChordSymbol } from '../model/harmony';
import { LABEL_GAP_PX, PAD_BAR_PX, PAD_MID_PX, ROW_SIZES_PX, chooseRowSize, chordStride, inForceAt, placeChordRow, rowChords, type RowChord } from './chordRow';

// 120 BPM, 4/4, first downbeat at 0: a bar lasts 2 s.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });

function at(beat: number, c: ChordSymbol | null, doubtful = false): ChartChord {
  return { time: beat * 0.5, beat, chord: c, origin: 'analysis', confidence: 0.6, doubtful, alternatives: [] };
}
const bars = (chords: ChartChord[], duration = 40) => chartBars({ map, chords, sections: [], duration });

const C7 = chord(0, '7');
const F7 = chord(5, '7');
const Dm7 = chord(2, 'min7');
const wide = () => 40;

describe('what the row writes', () => {
  it('writes each chord once: a chord that repeats the one before is dropped', () => {
    const items = rowChords(bars([at(0, C7), at(4, C7), at(8, F7), at(12, F7), at(16, C7)]), map);
    expect(items.map((i) => i.id)).toEqual(['0:0', '2:0', '4:0']);
  });

  it('keeps a returning chord and N.C. runs once', () => {
    const items = rowChords(bars([at(0, C7), at(4, null), at(8, null), at(12, C7)]), map);
    expect(items.map((i) => i.chord)).toEqual([C7, null, C7]);
  });

  it('puts the chord of a mid-bar beat at its beat on the grid, small when the bar holds two', () => {
    const items = rowChords(bars([at(0, Dm7), at(2, F7), at(4, C7)]), map);
    expect(items.map((i) => [i.bar, i.beatInBar, i.small])).toEqual([[0, 0, true], [0, 2, true], [1, 0, false]]);
    expect(items[1]!.time).toBeCloseTo(1, 9);
  });

  it('is exact on a variable tempo (analysed beats): a chord stands on its beat', () => {
    const times = Array.from({ length: 33 }, (_, i) => i * 0.5 + 0.02 * Math.sin(i) + i * i * 0.002);
    const vmap = tempoMapFromBeats(times, 0, { numerator: 4, denominator: 4 });
    const items = rowChords(chartBars({ map: vmap, chords: [{ ...at(0, Dm7) }, { ...at(2, F7), beat: 2 }, { ...at(6, C7), beat: 6 }], sections: [], duration: 16 }), vmap);
    expect(items[1]!.time).toBeCloseTo(times[2]!, 9);
    expect(items[2]!.time).toBeCloseTo(times[6]!, 9);
  });

  it('knows the chord in force at a bar line', () => {
    const items = rowChords(bars([at(0, Dm7), at(6, F7)]), map);
    expect(inForceAt(items, 0)!.chord).toEqual(Dm7);
    expect(inForceAt(items, 1)!.chord).toEqual(Dm7); // F7 starts in bar 1 at beat 2
    expect(inForceAt(items, 2)!.chord).toEqual(F7);
    expect(inForceAt(items, -3)).toBeNull();
  });
});

function place(items: RowChord[], pps: number, viewW: number, t0 = 0, widthOf: (i: RowChord) => number = wide, maxWidth = 40) {
  return placeChordRow({ items, map, t0, pps, viewW, widthOf: (i) => widthOf(i), maxWidths: [maxWidth, maxWidth, maxWidth] });
}

describe('where the row writes them', () => {
  const chords = Array.from({ length: 16 }, (_, i) => at(i * 4, i % 2 ? F7 : C7));
  const items = rowChords(bars(chords, 32), map);

  it('aligns a bar-first chord on its bar line, 9 px after it, at any zoom that has room', () => {
    for (const pps of [40, 60, 90]) {
      const { stride, placed } = place(items, pps, 800);
      expect(stride).toBe(1);
      for (const p of placed) expect(p.x).toBeCloseTo(p.item.time * pps + PAD_BAR_PX, 9);
    }
  });

  it('follows the scroll: the same chord moves by the scrolled pixels', () => {
    const a = place(items, 50, 400, 0).placed.find((p) => p.key === '3:0')!;
    const b = place(items, 50, 400, 2).placed.find((p) => p.key === '3:0')!;
    expect(a.x - b.x).toBeCloseTo(100, 9);
  });

  it('thins out regularly when zoomed out: one label every 2, 4, 8… bars, never overlapping', () => {
    for (const pps of [40, 20, 10, 5, 2.5]) {
      const { stride, placed } = place(items, pps, 1000);
      expect(stride).toBe(chordStride(2 * pps, 40));
      const sorted = [...placed].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.x - (sorted[i - 1]!.x + sorted[i - 1]!.width)).toBeGreaterThanOrEqual(LABEL_GAP_PX - 1e-9);
    }
    expect(place(items, 40, 1000).stride).toBe(1);
    expect(place(items, 20, 1000).stride).toBe(2);
    expect(place(items, 10, 1000).stride).toBe(4);
    expect(place(items, 5, 1000).stride).toBe(8);
  });

  it('writes, at a stride, the chord in force at the kept bar lines, once while it goes on', () => {
    const slow = rowChords(bars([at(0, C7), at(4, C7), at(8, F7), at(10, Dm7), at(16, Dm7), at(24, C7)], 32), map);
    const { stride, placed } = place(slow, 10, 1000);
    expect(stride).toBe(4);
    // Kept bar lines 0, 4, 8, 12…: C7; Dm7 (in force since beat 10 of bar 2); Dm7 again at 4… (not written); C7 from bar 6, in force at bar line 8.
    expect(placed.map((p) => p.key)).toEqual(['0:0@0', '2:2@4', '6:0@8']);
  });

  it('stride never depends on what is in view, only on the zoom and the widest label', () => {
    const a = place(items, 20, 300, 0);
    const b = place(items, 20, 300, 12);
    expect(a.stride).toBe(b.stride);
  });

  it('puts a second chord of the bar at its beat, or just after the first when they would touch', () => {
    const two = rowChords(bars([at(0, Dm7), at(2, F7), at(4, C7)], 8), map);
    const roomy = place(two, 100, 800, 0, () => 30, 30); // bar = 200 px
    const second = roomy.placed.find((p) => p.key === '0:2')!;
    expect(second.x).toBeCloseTo(1 * 100 + PAD_MID_PX, 9);
    const tight = place(two, 56, 800, 0, () => 45, 45); // bar = 112 px, beat 2 at 56: the first label ends at 9 + 45 = 54
    const pushed = tight.placed.find((p) => p.key === '0:2')!;
    expect(pushed.x).toBeCloseTo(9 + 45 + LABEL_GAP_PX, 9);
    expect(pushed.x + 45 + LABEL_GAP_PX).toBeLessThanOrEqual(112 + PAD_BAR_PX);
  });

  it('leaves out a mid-bar chord that would not fit before the next bar-first chord', () => {
    const two = rowChords(bars([at(0, Dm7), at(2, F7), at(4, C7)], 8), map);
    const cramped = place(two, 50, 800, 0, () => 45, 45); // bar = 100 px
    expect(cramped.placed.some((p) => p.key === '0:2')).toBe(false);
    expect(cramped.placed.map((p) => p.key)).toEqual(['0:0', '1:0']);
  });

  it('places nothing without chords or room', () => {
    expect(place([], 50, 400).placed).toEqual([]);
    expect(place(items, 50, 0).placed).toEqual([]);
  });

  it('only returns the labels in view (and a margin)', () => {
    const { placed } = place(items, 50, 300, 0);
    expect(placed.length).toBeGreaterThan(2);
    expect(placed.length).toBeLessThan(8);
    expect(Math.max(...placed.map((p) => p.x))).toBeLessThan(300 + 120);
  });
});

describe('size first, then stride', () => {
  // Widths of the widest label at 18, 16 and 14.5 px (proportional to the font size).
  const widths = [38, 38 * (16 / 18), 38 * (14.5 / 18)];
  const need = widths.map((w) => w + LABEL_GAP_PX); // 46, 41.8, 38.6

  it('keeps the comfortable size and every chord when the bars have room', () => {
    expect(chooseRowSize(80, widths)).toEqual({ size: 0, stride: 1 });
    expect(chooseRowSize(need[0]!, widths)).toEqual({ size: 0, stride: 1 });
  });

  it('writes the whole row smaller before dropping any chord', () => {
    expect(chooseRowSize(43, widths)).toEqual({ size: 1, stride: 1 });
    expect(chooseRowSize(need[1]! - 0.1, widths)).toEqual({ size: 2, stride: 1 });
    expect(chooseRowSize(39, widths)).toEqual({ size: 2, stride: 1 });
  });

  it('thins with a stride, at the smallest size, only when that size does not fit either', () => {
    expect(chooseRowSize(need[2]! - 0.1, widths)).toEqual({ size: 2, stride: 2 });
    expect(chooseRowSize(10, widths)).toEqual({ size: 2, stride: 4 });
  });

  it('never goes below the two-chord size', () => {
    expect(ROW_SIZES_PX[ROW_SIZES_PX.length - 1]).toBe(14.5);
    for (let gap = 1; gap < 120; gap += 3) expect(chooseRowSize(gap, widths).size).toBeLessThanOrEqual(2);
  });

  const items = rowChords(bars(Array.from({ length: 16 }, (_, i) => at(i * 4, i % 2 ? F7 : C7)), 32), map);
  const run = (pps: number, t0: number, viewW = 300) =>
    placeChordRow({ items, map, t0, pps, viewW, widthOf: (_, size) => widths[size]!, maxWidths: widths });

  it('writes every chord at the middle size where the old row kept one in two (a 43 px bar)', () => {
    const r = run(43 / 2, 0, 1000);
    expect(r.size).toBe(1);
    expect(r.stride).toBe(1);
    expect(r.placed.map((p) => p.key)).toEqual(items.filter((i) => i.bar <= 22).map((i) => i.id));
  });

  it('a size is one for the whole row and a mid-bar chord keeps its own small size', () => {
    const r = run(43 / 2, 0, 1000);
    expect(new Set(r.placed.map((p) => p.item.small)).size).toBe(1);
    expect(r.size).toBe(1);
  });

  it('does not depend on the scroll position: same size and stride at any t0', () => {
    for (const pps of [60, 30, 21.5, 19, 15, 6]) {
      const a = run(pps, 0);
      for (const t0 of [1, 7.3, 15, 28]) {
        const b = run(pps, t0);
        expect([b.size, b.stride]).toEqual([a.size, a.stride]);
      }
    }
  });

  it('depends on the narrowest bar of the piece, not on the bars in view', () => {
    // A variable tempo: one bar much shorter than the others, far from the view.
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15];
    const vmap = tempoMapFromBeats(beats, 0, { numerator: 4, denominator: 4 });
    const vitems = rowChords(chartBars({ map: vmap, chords: [at(0, C7), at(4, F7), at(8, C7), at(12, F7), at(16, C7), at(20, F7), at(24, C7), at(28, F7)], sections: [], duration: 16 }), vmap);
    const go = (t0: number) => placeChordRow({ items: vitems, map: vmap, t0, pps: 40, viewW: 200, widthOf: (_, s) => widths[s]!, maxWidths: widths });
    const a = go(0);
    const b = go(10);
    expect([a.size, a.stride]).toEqual([b.size, b.stride]);
  });
});
