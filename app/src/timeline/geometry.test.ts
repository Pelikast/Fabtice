import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import { PX_PER_SECOND, TRACK_HEIGHT } from '../view/zoom';
import { barsInView, minBarGapPx } from './drawing';
import {
  adjustLoopEdge,
  barAtTime,
  barKept,
  barNumber,
  barStride,
  clampT0,
  fitToView,
  followT0,
  hitLoopEdge,
  loopFromDrag,
  nearestBarLine,
  pxPerSecondForBarWidth,
  sliderAnchorX,
  tempoRange,
  timeToX,
  wheelPixels,
  wheelZoomFactor,
  xToTime,
  zoomAround,
} from './geometry';
import { rulerHeight, rulerRows, TRACKS_FOOT } from './layout';

// 120 BPM, 4/4: a bar lasts 2 s. First downbeat at 0.5 s: bar -1 is the pick-up.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0.5, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const DURATION = 60;

describe('visible range and scroll', () => {
  it('converts between time and pixels', () => {
    expect(timeToX(12, 10, 40)).toBe(80);
    expect(xToTime(80, 10, 40)).toBe(12);
  });

  it('keeps the view inside the piece', () => {
    expect(clampT0(-5, 60, 800, 40)).toBe(0);
    expect(clampT0(100, 60, 800, 40)).toBe(40); // 800 px = 20 s
    expect(clampT0(7, 60, 800, 40)).toBe(7);
    expect(clampT0(7, 10, 800, 40)).toBe(0); // the whole piece fits
  });

  it('keeps the anchor under the pointer when zooming', () => {
    const t0 = 10;
    const next = zoomAround(t0, 40, 80, 300);
    // The time under x=300 was 17.5 s before and must be after.
    expect(xToTime(300, next, 80)).toBeCloseTo(17.5, 9);
    expect(zoomAround(t0, 40, 20, 0)).toBe(10);
  });

  it('anchors slider zooms on the playhead when visible, else on the centre', () => {
    expect(sliderAnchorX(12, 10, 40, 800)).toBe(80);
    expect(sliderAnchorX(5, 10, 40, 800)).toBe(400);
    expect(sliderAnchorX(40, 10, 40, 800)).toBe(400);
  });

  it('zooms by a smooth factor and reads wheel units', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10)).toBeLessThan(1);
    expect(wheelZoomFactor(10) * wheelZoomFactor(-10)).toBeCloseTo(1, 12);
    expect(wheelZoomFactor(-10000)).toBeCloseTo(Math.exp(0.48), 9); // clamped
    expect(wheelPixels(3, 0, 800)).toBe(3);
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });
});

describe('Auto fit', () => {
  const rows = rulerRows({ hasChords: false });
  const base = { duration: 54, viewW: 1068, viewH: 700, trackCount: 4, rulerHeight: rulerHeight(rows), foot: TRACKS_FOOT };

  it('fits the piece to the width and the tracks to the height', () => {
    const r = fitToView(base)!;
    expect(r.pxPerSecond).toBeCloseTo(1068 / 54, 9);
    expect(r.trackHeight).toBe(Math.floor((700 - rulerHeight(rows) - TRACKS_FOOT) / 4));
    // No overflow: ruler + tracks + foot fit in the height.
    expect(rulerHeight(rows) + 4 * r.trackHeight + TRACKS_FOOT).toBeLessThanOrEqual(700);
  });

  it('respects the limits of the sliders', () => {
    expect(fitToView({ ...base, duration: 5000 })!.pxPerSecond).toBe(PX_PER_SECOND.min);
    expect(fitToView({ ...base, duration: 0.5 })!.pxPerSecond).toBe(PX_PER_SECOND.max);
    expect(fitToView({ ...base, viewH: 200 })!.trackHeight).toBe(TRACK_HEIGHT.min);
    expect(fitToView({ ...base, viewH: 5000, trackCount: 1 })!.trackHeight).toBe(TRACK_HEIGHT.max);
  });

  it('shows ten minutes of music in a laptop window', () => {
    expect(fitToView({ ...base, duration: 600 })!.pxPerSecond).toBeGreaterThanOrEqual(PX_PER_SECOND.min);
    expect(1068 / 600).toBeGreaterThanOrEqual(PX_PER_SECOND.min);
  });

  it('gives nothing to fit when there is nothing to show', () => {
    expect(fitToView({ ...base, duration: 0 })).toBeNull();
    expect(fitToView({ ...base, viewW: 0 })).toBeNull();
    expect(fitToView({ ...base, trackCount: 0 })).toBeNull();
  });

  it('puts a bar at 86 px on a phone', () => {
    expect(pxPerSecondForBarWidth(86, 2)).toBe(43);
    expect(pxPerSecondForBarWidth(86, 0.001)).toBe(PX_PER_SECOND.max);
  });
});

describe('following the playhead', () => {
  const view = { pps: 40, viewW: 800, duration: 200 }; // 20 s per page

  it('leaves the view alone while the playhead is in it', () => {
    expect(followT0({ ...view, t0: 10, position: 15 })).toBeNull();
    expect(followT0({ ...view, t0: 10, position: 10 })).toBeNull();
  });

  it('turns the page when the playhead reaches the right edge', () => {
    const next = followT0({ ...view, t0: 10, position: 29.9 })!;
    expect(next).toBeGreaterThan(10);
    // The playhead lands near the left edge of the new page.
    expect(timeToX(29.9, next, 40)).toBeCloseTo(96, 6);
  });

  it('turns back when a loop wraps before the left edge', () => {
    const next = followT0({ ...view, t0: 50, position: 12 })!;
    expect(next).toBeLessThan(12);
    expect(timeToX(12, next, 40)).toBeGreaterThanOrEqual(0);
  });

  it('does not keep asking for a turn at the end of the piece', () => {
    expect(followT0({ ...view, t0: 180, position: 199.9 })).toBeNull();
  });
});

describe('bar thinning', () => {
  it('keeps every bar while they are far enough apart', () => {
    expect(barStride(50, 40)).toBe(1);
    expect(barStride(40, 40)).toBe(1);
  });

  it('thins out by powers of two', () => {
    expect(barStride(30, 40)).toBe(2);
    expect(barStride(15, 40)).toBe(4);
    expect(barStride(6, 40)).toBe(8);
    expect(barStride(2.5, 6)).toBe(4);
  });

  it('always keeps the spacing of the kept bars at the minimum or more', () => {
    for (const gap of [0.4, 1, 2.2, 3, 7, 11, 19, 33]) {
      expect(gap * barStride(gap, 40)).toBeGreaterThanOrEqual(40);
    }
  });

  it('keeps the same bars whatever the scroll, bar 1 first, pick-up bars included', () => {
    const kept = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => barKept(b, 4));
    expect(kept).toEqual([-4, 0, 4, 8]);
    expect(barKept(0, 8)).toBe(true);
    expect(barKept(-8, 8)).toBe(true);
    expect(barKept(-3, 2)).toBe(false);
  });

  it('numbers the pick-up bar 0', () => {
    expect(barNumber(-1)).toBe(0);
    expect(barNumber(0)).toBe(1);
    expect(barNumber(7)).toBe(8);
  });

  it('measures the narrowest bar in view', () => {
    const bars = barsInView(map, 0, 20);
    expect(bars[0]!.bar).toBe(-1); // the pick-up bar contains time 0
    expect(bars[0]!.time).toBeCloseTo(-1.5, 9);
    expect(bars[bars.length - 1]!.time).toBeGreaterThan(20);
    expect(minBarGapPx(bars, 10)).toBeCloseTo(20, 9);
  });
});

describe('loop selection by bars', () => {
  it('finds the bar under a time, clamped to the piece', () => {
    expect(barAtTime(map, 0.2, DURATION)).toBe(-1);
    expect(barAtTime(map, 0.5, DURATION)).toBe(0);
    expect(barAtTime(map, 2.49, DURATION)).toBe(0);
    expect(barAtTime(map, 2.5, DURATION)).toBe(1);
    expect(barAtTime(map, -3, DURATION)).toBe(-1);
    expect(barAtTime(map, 1e6, DURATION)).toBe(barAtTime(map, DURATION - 1e-6, DURATION));
  });

  it('selects whole bars from where the drag started to where it is, either direction', () => {
    const forward = loopFromDrag(map, 3, 8.2, DURATION); // bar 1 … bar 3
    expect(forward.start).toBeCloseTo(2.5, 9);
    expect(forward.end).toBeCloseTo(8.5, 9);
    expect(loopFromDrag(map, 8.2, 3, DURATION)).toEqual(forward);
    // A tiny drag inside one bar selects that bar.
    const one = loopFromDrag(map, 3.1, 3.4, DURATION);
    expect(one.start).toBeCloseTo(2.5, 9);
    expect(one.end).toBeCloseTo(4.5, 9);
  });

  it('grabs the nearest loop edge within the tolerance', () => {
    expect(hitLoopEdge(100, 100, 300, 6)).toBe('start');
    expect(hitLoopEdge(95, 100, 300, 6)).toBe('start');
    expect(hitLoopEdge(305, 100, 300, 6)).toBe('end');
    expect(hitLoopEdge(200, 100, 300, 6)).toBeNull();
    expect(hitLoopEdge(107, 100, 300, 6)).toBeNull();
    // A one-bar loop 8 px wide: the nearest edge wins.
    expect(hitLoopEdge(103, 100, 108, 6)).toBe('start');
    expect(hitLoopEdge(106, 100, 108, 6)).toBe('end');
  });

  it('finds the nearest bar line', () => {
    expect(nearestBarLine(map, 2.6)).toBe(1); // line of bar 1 is at 2.5
    expect(nearestBarLine(map, 3.4)).toBe(1);
    expect(nearestBarLine(map, 3.6)).toBe(2);
  });

  it('drags the edges bar by bar, keeping at least one bar', () => {
    const region = { start: 2.5, end: 8.5 }; // bars 1…3
    const start = adjustLoopEdge(map, region, 'start', 0.6, DURATION); // nearest line: bar 0 at 0.5
    expect(start.start).toBeCloseTo(0.5, 9);
    expect(start.end).toBeCloseTo(8.5, 9);
    const end = adjustLoopEdge(map, region, 'end', 12.4, DURATION); // nearest line: bar 6 at 12.5
    expect(end.start).toBeCloseTo(2.5, 9);
    expect(end.end).toBeCloseTo(12.5, 9);
    // Dragged past the other edge: one bar remains.
    const crushed = adjustLoopEdge(map, region, 'start', 30, DURATION);
    expect(crushed.start).toBeCloseTo(6.5, 9);
    expect(crushed.end).toBeCloseTo(8.5, 9);
    const crushedEnd = adjustLoopEdge(map, region, 'end', 0, DURATION);
    expect(crushedEnd.start).toBeCloseTo(2.5, 9);
    expect(crushedEnd.end).toBeCloseTo(4.5, 9);
  });
});

describe('tempo row', () => {
  it('centres a constant tempo and gives a variable one a readable span', () => {
    const flat = tempoRange([110]);
    expect((flat.lo + flat.hi) / 2).toBe(110);
    expect(flat.hi - flat.lo).toBeGreaterThanOrEqual(8);
    const varied = tempoRange([100, 120]);
    expect(varied.lo).toBe(100);
    expect(varied.hi).toBe(120);
  });
});
