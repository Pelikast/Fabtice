// The beat repair on small sequences whose answer is obvious.

import { describe, expect, it } from 'vitest';
import { gridFromBeats } from './pipeline';
import { REPAIR, bestPhase, fillBeats, outOfTempo, phaseScores, repairBars, repairBeats, repairTempo, type DownbeatAt } from './repair';

/** n beats at `bpm` from t0, with a tiny deterministic wobble (a tracker is never exact). */
function steady(n: number, bpm: number, t0 = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => t0 + (i * 60) / bpm + 0.004 * Math.sin(i * 2.3));
}

/** The network's downbeat output: high near the true downbeats (every m beats from `first`), low elsewhere. */
function downbeats(truth: readonly number[], m: number, first = 0, on = 0.95, off = 0.02): DownbeatAt {
  return (t) => {
    let best = 0;
    truth.forEach((x, i) => {
      if (Math.abs(x - t) < Math.abs(truth[best]! - t)) best = i;
    });
    const near = Math.abs(truth[best]! - t) < 0.06;
    return near && (best - first) % m === 0 ? on : off;
  };
}

const without = (a: number[], ...idx: number[]) => a.filter((_, i) => !idx.includes(i));

describe('fillBeats', () => {
  it('fills evenly at a constant tempo', () => {
    expect(fillBeats(0, 3, 3, 1, 1)).toEqual([1, 2]);
  });
  it('follows the tempo from one side to the other and lands exactly on the far end', () => {
    const inner = fillBeats(10, 13.5, 4, 0.8, 1);
    expect(inner).toHaveLength(3);
    const all = [10, ...inner, 13.5];
    const d = all.slice(1).map((t, i) => t - all[i]!);
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThan(d[i - 1]!);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(3.5, 12);
  });
});

describe('bar phase', () => {
  it('scores each phase by the downbeat probabilities', () => {
    const p = [0.1, 0.9, 0.1, 0.1, 0.1, 0.9, 0.1, 0.1];
    const s = phaseScores(p, 4);
    expect(s.indexOf(Math.max(...s))).toBe(3); // beat 1 at position (1 + 3) % 4 = 0
    expect(bestPhase(p, 4)).toBe(1);
  });
  it('takes the phase most of the piece agrees with, not the first bars', () => {
    // Two bars numbered from beat 0, then twelve bars from beat 10.
    const p = Array.from({ length: 58 }, (_, i) => ((i < 8 && i % 4 === 0) || (i >= 10 && (i - 10) % 4 === 0) ? 0.9 : 0.05));
    expect(bestPhase(p, 4)).toBe(2);
  });
});

describe('out-of-tempo intervals', () => {
  it('flags the two halves of an extra beat, nothing else', () => {
    const b = steady(40, 100);
    b.splice(20, 0, (b[19]! + b[20]!) / 2);
    const bad = outOfTempo(b);
    expect(bad.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)).toEqual([19, 20]);
  });
  it('flags nothing in a steady sequence or a slow accelerando', () => {
    expect(outOfTempo(steady(60, 120)).some(Boolean)).toBe(false);
    const acc: number[] = [0];
    for (let i = 1; i < 80; i++) acc.push(acc[i - 1]! + 60 / (90 + i * 0.5));
    expect(outOfTempo(acc).some(Boolean)).toBe(false);
  });
});

describe('the tempo repair (short deviation, back to the tempo before)', () => {
  it('removes an extra beat', () => {
    const truth = steady(48, 72);
    const found = [...truth.slice(0, 21), (truth[20]! + truth[21]!) / 2, ...truth.slice(21)];
    const r = repairTempo(found, 4, null);
    expect(r.beats).toHaveLength(truth.length);
    r.beats.forEach((t, i) => expect(Math.abs(t - truth[i]!)).toBeLessThan(0.03));
    expect(r.repairs).toEqual([{ start: found[20], end: found[22], found: 1, placed: 0, cause: 'tempo' }]);
  });

  it('puts back one or two missing beats, where they were', () => {
    const truth = steady(48, 72);
    for (const missing of [[24], [24, 25]]) {
      const r = repairTempo(without(truth, ...missing), 4, null);
      expect(r.beats).toHaveLength(truth.length);
      r.beats.forEach((t, i) => expect(Math.abs(t - truth[i]!)).toBeLessThan(0.03));
      expect(r.repairs[0]!.placed).toBe(missing.length);
    }
  });

  it('replaces two bars at another rate by the beats of the surrounding tempo', () => {
    const truth = steady(64, 90);
    // Beats 24…32 heard at 4 for 3 (11 beats where there are 8 intervals).
    const burst = Array.from({ length: 10 }, (_, q) => truth[24]! + ((q + 1) * (truth[32]! - truth[24]!)) / 11);
    const found = [...truth.slice(0, 25), ...burst, ...truth.slice(32)];
    const r = repairTempo(found, 4, null);
    expect(r.beats).toHaveLength(truth.length);
    r.beats.forEach((t, i) => expect(Math.abs(t - truth[i]!)).toBeLessThan(0.03));
  });

  it('keeps a tempo change that holds', () => {
    const b = [...steady(64 * 4, 100)];
    const last = b[b.length - 1]!;
    for (let i = 1; i <= 64; i++) b.push(last + (i * 60) / 135);
    expect(repairTempo(b, 4, null).beats).toEqual(b);
  });

  it('keeps a fermata that does not last a whole number of beats', () => {
    const b = steady(48, 100);
    const held = b.map((t, i) => (i > 24 ? t + 1.5 * 0.6 : t)); // beat 24 held 2.5 beats
    expect(repairTempo(held, 4, null).beats).toEqual(held);
  });

  it('keeps a free introduction', () => {
    const intro = [0.3, 1.2, 1.75, 2.9, 3.4, 4.6, 5.2];
    const b = [...intro, ...steady(40, 96, 6)];
    expect(repairTempo(b, 4, null).beats).toEqual(b);
  });

  it('keeps a beat held exactly two beats when the downbeats say the bars go on as found', () => {
    // Beat 30 lasts two beats and the bars count it as one: the downbeats fall every 4 beats as found.
    const held = without(steady(64, 100), 31);
    const downAt = downbeats(held, 4, 0);
    expect(repairTempo(held, 4, downAt).beats).toEqual(held);
    // Without the evidence, the timing alone takes it for a missing beat (the documented limit).
    expect(repairTempo(held, 4, null).beats).toHaveLength(held.length + 1);
  });
});

describe('the bar repair (the downbeats moved)', () => {
  it('finds a slow slip by one beat and refills it', () => {
    const truth = steady(96, 80);
    // Beats 40…48 heard as 9 intervals over 8: each only 11 % short, below the tempo repair's threshold.
    const slip = Array.from({ length: 8 }, (_, q) => truth[40]! + ((q + 1) * (truth[48]! - truth[40]!)) / 9);
    const found = [...truth.slice(0, 41), ...slip, ...truth.slice(48)];
    const downAt = downbeats(truth, 4, 0);
    expect(repairTempo(found, 4, downAt).repairs).toEqual([]);
    const r = repairBars(found, 4, downAt);
    expect(r.beats).toHaveLength(truth.length);
    expect(r.repairs).toHaveLength(1);
    expect(r.repairs[0]!.cause).toBe('bar');
  });

  it('leaves a real two-beat bar alone (no timing accident to explain it)', () => {
    const truth = steady(96, 80);
    // A 2/4 bar at beat 48: the downbeats after it are two beats later in the count.
    const downAt: DownbeatAt = (t) => {
      const i = truth.findIndex((x) => Math.abs(x - t) < 0.06);
      if (i < 0) return 0.02;
      return (i < 48 ? i % 4 === 0 : (i - 50) % 4 === 0) ? 0.95 : 0.02;
    };
    expect(repairBars(truth, 4, downAt).beats).toEqual(truth);
  });
});

describe('the grid from the beats', () => {
  it('keeps the bars in place after an extra beat (before: shifted by one beat for the rest of the piece)', () => {
    const truth = steady(96, 72);
    const found = [...truth.slice(0, 51), (truth[50]! + truth[51]!) / 2, ...truth.slice(51)];
    const g = gridFromBeats(found, downbeats(truth, 4, 1));
    expect(g.grid.beats).toHaveLength(truth.length);
    expect(g.grid.beatsPerBar).toBe(4);
    g.grid.numbers.forEach((n, i) => expect(n).toBe(((i - 1 + 4) % 4) + 1));
    expect(g.repairs).toHaveLength(1);
  });

  it('changes nothing on a clean sequence, with or without downbeat evidence', () => {
    const truth = steady(120, 140);
    for (const downAt of [downbeats(truth, 3, 2), null]) {
      const g = gridFromBeats(truth, downAt);
      expect(g.grid.beats).toEqual(truth);
      expect(g.repairs).toEqual([]);
    }
    expect(gridFromBeats(truth, downbeats(truth, 3, 2)).grid.numbers.slice(0, 6)).toEqual([2, 3, 1, 2, 3, 1]);
  });

  it('can be switched off', () => {
    const truth = steady(96, 72);
    const found = [...truth.slice(0, 51), (truth[50]! + truth[51]!) / 2, ...truth.slice(51)];
    expect(gridFromBeats(found, null, null, undefined, undefined, undefined, null).grid.beats).toEqual(found);
    expect(repairBeats(found, 4, null, REPAIR).beats).toHaveLength(truth.length);
  });
});
