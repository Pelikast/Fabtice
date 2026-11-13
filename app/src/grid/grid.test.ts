import { describe, expect, it } from 'vitest';
import {
  addTap,
  barLines,
  barStartTime,
  barsOfRange,
  beatToTime,
  clipRange,
  constantTempoMap,
  defaultTempoMap,
  firstDownbeat,
  formatBarNumber,
  formatClock,
  formatDuration,
  formatLoopBars,
  formatPosition,
  formatSigned,
  isSubGridVisible,
  linesPerBeat,
  loopFromBars,
  metronomeClicks,
  nominalBpm,
  snapTime,
  subGridLines,
  subGridSpacingPx,
  tapTempo,
  timeToBar,
  timeToBeat,
  variableTempoMap,
  withManualGrid,
} from './index';

// 120 BPM, 4/4: one beat = 0.5 s, one bar = 2 s; first downbeat at 1 s.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('time <-> beat <-> bar', () => {
  it('maps the first downbeat to bar 0, beat 0', () => {
    expect(timeToBeat(map, 1)).toBe(0);
    expect(timeToBar(map, 1)).toMatchObject({ bar: 0, beatInBar: 0 });
    expect(firstDownbeat(map)).toBe(1);
  });

  it('round-trips time and beats', () => {
    for (const t of [-3.3, 0, 1, 2.25, 17.9, 300]) close(beatToTime(map, timeToBeat(map, t)), t);
  });

  it('finds bar and beat inside a bar', () => {
    const p = timeToBar(map, 1 + 2 * 4 + 0.75); // bar 4, 1.5 beats in
    expect(p.bar).toBe(4);
    close(p.beatInBar, 1.5);
  });

  it('is robust to float noise on bar lines', () => {
    const t = barStartTime(map, 37);
    expect(timeToBar(map, t).bar).toBe(37);
    expect(timeToBar(map, t - 1e-6).bar).toBe(36);
  });

  it('extends the grid before the first downbeat (pick-up)', () => {
    // 0.25 s before the downbeat: last eighth of bar -1, shown as bar « 0 », beat 4
    const p = timeToBar(map, 0.75);
    expect(p.bar).toBe(-1);
    close(p.beatInBar, 3.5);
    expect(formatPosition(map, 0.75)).toEqual({ bar: '0', beat: '4' });
    expect(formatPosition(map, 1 - 2 * 2)).toEqual({ bar: '−1', beat: '1' }); // start of bar -2
    expect(barStartTime(map, -1)).toBe(-1);
  });

  it('handles other meters', () => {
    const m3 = constantTempoMap({ bpm: 90, firstDownbeat: 0, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    expect(timeToBar(m3, 60 / 90 * 3 * 5).bar).toBe(5);
    expect(formatPosition(m3, 60 / 90 * 4).beat).toBe('2');
  });

  it('supports variable tempo maps', () => {
    // 60 BPM from 0 s, then 120 BPM from 4 s (beat 4)
    const v = variableTempoMap([{ time: 0, bpm: 60 }, { time: 4, bpm: 120 }], [{ bar: 0, meter: { numerator: 4, denominator: 4 } }], 'analysis');
    expect(v.segments[1]!.beat).toBe(4);
    close(timeToBeat(v, 5), 6);
    close(beatToTime(v, 6), 5);
    expect(timeToBar(v, 5)).toMatchObject({ bar: 1 });
    close(barStartTime(v, 2), 6);
    expect(nominalBpm(v, 10)).toBe(120); // 6 s at 120 against 4 s at 60
  });

  it('supports meter changes on bar lines', () => {
    const v = variableTempoMap([{ time: 0, bpm: 60 }], [
      { bar: 0, meter: { numerator: 4, denominator: 4 } },
      { bar: 2, meter: { numerator: 3, denominator: 4 } },
    ], 'analysis');
    expect(v.meters[1]!.beat).toBe(8);
    expect(timeToBar(v, 8).bar).toBe(2);
    expect(timeToBar(v, 11).bar).toBe(3);
    expect(barLines(v, 0, 14).map((l) => l.time)).toEqual([0, 4, 8, 11, 14]);
  });
});

describe('manual grid entry', () => {
  it('starts from a default 120 BPM 4/4 grid at 0', () => {
    const d = defaultTempoMap();
    expect(d.origin).toBe('default');
    expect(nominalBpm(d)).toBe(120);
    expect(firstDownbeat(d)).toBe(0);
  });

  it('changes tempo, meter and downbeat independently, clamped', () => {
    const a = withManualGrid(defaultTempoMap(), { bpm: 96 });
    expect(a.origin).toBe('manual');
    expect(nominalBpm(a)).toBe(96);
    const b = withManualGrid(a, { firstDownbeat: 3.2 });
    expect(nominalBpm(b)).toBe(96);
    expect(firstDownbeat(b)).toBe(3.2);
    const c = withManualGrid(b, { numerator: 9 });
    expect(c.meters[0]!.meter.numerator).toBe(7);
    expect(firstDownbeat(c)).toBe(3.2);
    expect(nominalBpm(withManualGrid(c, { bpm: 1000 }))).toBe(300);
    expect(nominalBpm(withManualGrid(c, { bpm: 2 }))).toBe(30);
  });
});

describe('grid lines', () => {
  it('lists bar lines in a range, bounds included', () => {
    expect(barLines(map, 1, 7).map((l) => [l.time, l.bar])).toEqual([[1, 0], [3, 1], [5, 2], [7, 3]]);
    expect(barLines(map, 0, 1.5).map((l) => l.bar)).toEqual([0]);
    expect(barLines(map, -2, 0.5).map((l) => l.bar)).toEqual([-1]);
  });

  it('counts sub-grid lines per beat, triplets x1.5', () => {
    expect(linesPerBeat({ subdivision: 1, triplets: false })).toBe(1);
    expect(linesPerBeat({ subdivision: 2, triplets: true })).toBe(3);
    expect(linesPerBeat({ subdivision: 4, triplets: true })).toBe(6);
    expect(linesPerBeat({ subdivision: 1, triplets: true })).toBe(1.5);
  });

  it('lists sub-grid lines without the bar lines', () => {
    const eighths = subGridLines(map, 1, 3, { subdivision: 2, triplets: false });
    expect(eighths.length).toBe(7); // 8 eighths per bar, minus the bar line
    expect(eighths.filter((l) => l.onBeat).length).toBe(3);
    close(eighths[0]!.time, 1.25);
    const triplets = subGridLines(map, 1, 3, { subdivision: 2, triplets: true });
    expect(triplets.length).toBe(11);
  });

  it('restarts quarter-note triplets at each bar line in 3/4', () => {
    const m3 = constantTempoMap({ bpm: 60, firstDownbeat: 0, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    const lines = subGridLines(m3, 0, 3, { subdivision: 1, triplets: true });
    expect(lines.map((l) => +l.beatInBar.toFixed(3))).toEqual([0.667, 1.333, 2, 2.667]);
  });

  it('hides the sub-grid when lines would be closer than 5 px', () => {
    const opts = { subdivision: 8, triplets: false } as const; // 0.0625 s apart at 120 BPM
    expect(subGridSpacingPx(map, 100, opts)).toBeCloseTo(6.25);
    expect(isSubGridVisible(map, 100, opts)).toBe(true);
    expect(isSubGridVisible(map, 70, opts)).toBe(false);
  });
});

describe('snapping', () => {
  const eighths = { subdivision: 2, triplets: false } as const;
  it('snaps to the nearest sub-grid line', () => {
    close(snapTime(map, 1.1, eighths), 1);
    close(snapTime(map, 1.2, eighths), 1.25);
    close(snapTime(map, 2.9, eighths), 3); // next bar line
  });
  it('snaps before the first downbeat too', () => {
    close(snapTime(map, 0.3, { subdivision: 1, triplets: false }), 0.5);
  });
  it('prefers the bar line over an uneven last triplet step', () => {
    const m3 = constantTempoMap({ bpm: 60, firstDownbeat: 0, meter: { numerator: 3, denominator: 4 }, origin: 'manual' });
    close(snapTime(m3, 2.9, { subdivision: 1, triplets: true }), 3);
    close(snapTime(m3, 2.7, { subdivision: 1, triplets: true }), 8 / 3);
  });
});

describe('loops', () => {
  it('builds a loop from a bar selection, in any order', () => {
    expect(loopFromBars(map, 4, 7)).toEqual({ start: 9, end: 17 });
    expect(loopFromBars(map, 7, 4)).toEqual({ start: 9, end: 17 });
    expect(barsOfRange(map, { start: 9, end: 17 })).toEqual({ first: 4, last: 7 });
    expect(formatLoopBars(map, { start: 9, end: 17 })).toBe('5–8');
    expect(formatLoopBars(map, loopFromBars(map, 2, 2))).toBe('3');
  });
  it('clips a range to the piece', () => {
    expect(clipRange({ start: -1, end: 5 }, 4)).toEqual({ start: 0, end: 4 });
    expect(clipRange({ start: 5, end: 6 }, 4)).toBeNull();
  });
});

describe('metronome clicks', () => {
  it('clicks on every beat and accents downbeats', () => {
    const c = metronomeClicks(map, 0, 3);
    expect(Array.from(c.times)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(Array.from(c.accents)).toEqual([0, 0, 1, 0, 0, 0]);
  });
});

describe('formatting', () => {
  it('formats clock times like the mockup', () => {
    expect(formatClock(16)).toBe('0:16,0');
    expect(formatClock(75.36)).toBe('1:15,4');
    expect(formatClock(59.97)).toBe('1:00,0');
    expect(formatClock(3.05, '.')).toBe('0:03.1');
  });
  it('formats durations for the top bar', () => {
    expect(formatDuration(273)).toBe('4 min 33');
    expect(formatDuration(240)).toBe('4 min');
    expect(formatDuration(45.2)).toBe('45 s');
    expect(formatDuration(62)).toBe('1 min 02');
  });
  it('formats bar numbers and signed values', () => {
    expect(formatBarNumber(0)).toBe('1');
    expect(formatBarNumber(-1)).toBe('0');
    expect(formatBarNumber(-3)).toBe('−2');
    expect(formatSigned(5)).toBe('+5');
    expect(formatSigned(-3)).toBe('−3');
    expect(formatSigned(0)).toBe('0');
  });
});

describe('tap tempo', () => {
  it('needs two taps, then uses the median interval', () => {
    let taps = addTap([], 0);
    expect(tapTempo(taps)).toBeNull();
    for (const t of [500, 1000, 1700, 2000]) taps = addTap(taps, t);
    expect(tapTempo(taps)).toBe(120);
  });
  it('starts a new series after a pause and keeps a window', () => {
    let taps = [0, 500, 1000];
    taps = addTap(taps, 5000);
    expect(taps).toEqual([5000]);
    for (let i = 1; i <= 12; i++) taps = addTap(taps, 5000 + i * 600);
    expect(taps.length).toBe(8);
    expect(tapTempo(taps)).toBe(100);
  });
});
