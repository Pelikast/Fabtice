// The tapped correction's computation (`tapGrid.ts`) on small synthetic
// cases: what each part does with the taps. The measured figures are the
// bench's (`tapGrid.bench.test.ts`).

import { describe, expect, it } from 'vitest';
import type { GridHint } from '../types';
import { activationsFrom } from './tapGrid.cases';
import { applyTappedFix, localPeriods, manualTempoGrid, tapLevel, tapSpread, type TappedGrid } from './tapGrid';
import { applyTempoFix } from './tempoFix';

/** A steady truth: beats every `p` s from 0.5 s, 4/4, the first one a downbeat. */
function steady(n: number, p: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.5 + i * p);
}

const hint = (times: number[], downbeat = 0): GridHint => ({ times, downbeat, meter: { numerator: 4, denominator: 4 } });
const downs = (truth: number[]) => (t: number) => (truth.some((b, i) => i % 4 === 0 && Math.abs(b - t) < 0.04) ? 0.98 : 0.01);

/** The grid in force: right up to beat `k0`, then at half tempo (every other beat), then right again from `k1`. */
function halfFrom(truth: number[], k0: number, k1: number): number[] {
  return truth.filter((_, i) => i <= k0 || i >= k1 || (i - k0) % 2 === 0);
}

const near = (a: readonly number[], t: number) => Math.min(...a.map((x) => Math.abs(x - t)));

describe('the tapped correction', () => {
  const P = 0.5;
  const truth = steady(160, P);
  const act = activationsFrom(truth, downs(truth), 82, 3);
  const grid = hint(halfFrom(truth, 40, 72));
  const from = truth[40]!;
  const tapped = (taps: number[], a = act, g = grid): TappedGrid => applyTappedFix(a, { kind: 'tapped', from, grid: g, taps });

  it('keeps every beat before the bar, the bar where it was, and places the passage on the network’s beats', () => {
    const taps = truth.slice(40, 77).map((t, i) => t + 0.08 + 0.02 * Math.sin(i));
    const out = tapped(taps);
    expect(out.times.slice(0, 40)).toEqual(grid.times.slice(0, 40));
    expect(out.times[40]).toBe(from);
    for (let k = 40; k <= 76; k++) expect(Math.abs(out.times[k]! - truth[k]!)).toBeLessThan(0.01);
    expect(out.tapped.offset).toBeGreaterThan(0.06);
    expect(out.tapped.offset).toBeLessThan(0.1);
    expect(out.tapped.end).toBeCloseTo(truth[76]!, 1);
    expect(out.tapped.snapped).toBeGreaterThan(0.9);
    // The rest analysed again joins one beat later, and is right.
    expect(out.times[77]! - out.times[76]!).toBeCloseTo(P, 1);
    for (let k = 77; k < 150; k++) expect(near(out.times, truth[k]!)).toBeLessThan(0.02);
    expect(out.times.length).toBe(truth.length);
  });

  it('fills forgotten taps, drops doubled ones, and keeps the count', () => {
    const taps = truth.slice(40, 77).filter((_, i) => i % 7 !== 3 && i % 11 !== 5);
    taps.push(truth[50]! + 0.05, truth[61]! + 0.07);
    const out = tapped(taps.sort((a, b) => a - b));
    for (let k = 40; k <= 76; k++) expect(Math.abs(out.times[k]! - truth[k]!)).toBeLessThan(0.02);
    expect(out.tapped.filled).toBeGreaterThanOrEqual(6);
    expect(out.tapped.dropped).toBe(2);
  });

  it('where the network heard nothing, the beats are the smoothed taps', () => {
    const silent = activationsFrom(truth.filter((_, i) => i < 41 || i > 76), downs(truth), 82, 5);
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.08; // ±40 ms
    const taps = truth.slice(40, 77).map((t) => t + noise());
    const out = tapped(taps, silent);
    const errs = truth.slice(41, 77).map((t, i) => Math.abs(out.times[41 + i]! - t));
    expect(Math.max(...errs)).toBeLessThan(0.035);
    // Mostly one constant shift: with nothing but the taps, the offset is known only as well as their mean (±8 ms here).
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(0.025);
    expect(out.tapped.snapped).toBeLessThan(0.1);
  });

  it('does not lock half a beat off where the network hears the off-beats', () => {
    const off = activationsFrom([...truth.filter((_, i) => i < 41 || i > 76), ...truth.slice(41, 76).map((t) => t + P / 2)].sort((a, b) => a - b), downs(truth), 82, 7);
    const g = hint(halfFrom(truth, 40, 72));
    const out = tapped(truth.slice(40, 77).map((t) => t - 0.03), off, g);
    for (let k = 41; k <= 76; k++) expect(Math.abs(out.times[k]! - truth[k]!)).toBeLessThan(0.03);
    expect(Math.abs(out.tapped.offset + 0.03)).toBeLessThan(0.02);
  });

  it('reads a held beat (a fermata) as one beat, not filled', () => {
    const held = truth.map((t, i) => (i <= 52 ? t : t + 1.5 * P)); // beat 52 lasts 2.5 beats
    const a = activationsFrom(held, downs(held), 84, 9);
    const g = hint(halfFrom(held, 40, 72));
    const out = tapped(held.slice(40, 77), a, g);
    for (let k = 40; k <= 76; k++) expect(Math.abs(out.times[k]! - held[k]!)).toBeLessThan(0.02);
    expect(out.tapped.held).toBe(1);
    expect(out.tapped.filled).toBe(0);
  });

  it('taps in half notes fill the beats between (taps every two beats of the grid)', () => {
    const taps = truth.slice(40, 77).filter((_, i) => i % 2 === 0);
    expect(tapLevel(taps, P)).toBe(2);
    const out = tapped(taps);
    for (let k = 40; k <= 76; k++) expect(Math.abs(out.times[k]! - truth[k]!)).toBeLessThan(0.02);
    expect(out.tapped.level).toBe(2);
  });

  it('says when the taps are too irregular', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const taps = Array.from({ length: 30 }, () => from + 18 * rnd()).sort((a, b) => a - b);
    expect(tapped(taps).tapped.irregular).toBe(true);
  });

  it('without network outputs (the stand-in analyser), the taps alone and the grid in force after them', () => {
    const taps = truth.slice(40, 60);
    const out = applyTappedFix(null, { kind: 'tapped', from, grid, taps });
    for (let k = 41; k < 60; k++) expect(Math.abs(out.times[k]! - truth[k]!)).toBeLessThan(0.03);
    expect(out.times.filter((t) => t > out.tapped.end + 0.01)[0]).toBe(grid.times.find((t) => t > out.tapped.end + 0.25));
    expect(manualTempoGrid(null, { kind: 'fresh', from, grid })).toBe(grid);
  });

  it('measures the tapper from the taps alone', () => {
    const x = truth.slice(0, 40).map((t, i) => t + (i % 2 ? 0.02 : -0.02));
    expect(tapSpread(x)).toBeGreaterThan(0.015);
    expect(tapSpread(x)).toBeLessThan(0.06);
    const forgot = truth.slice(0, 40).filter((_, i) => i % 5 !== 2);
    for (const q of localPeriods(forgot)) expect(q).toBeCloseTo(P, 2);
  });
});

describe('the two other actions on a bar that starts between two beats of the grid (after a 7/8 bar)', () => {
  it('start at that bar’s start, added to the grid sent, and follow the music from it', () => {
    const P = 0.5;
    const old = steady(120, P);
    // The bar starts half a beat after beat 40 of the grid; the music's beats go on from it.
    const from = old[40]! + P / 2;
    const music = [...old.slice(0, 41), ...Array.from({ length: 78 }, (_, k) => from + k * P)];
    const act = activationsFrom(music, null, 62, 4);
    const times = [...old.slice(0, 41), from, ...old.slice(41)];
    const g = hint(times);
    for (const kind of ['continuity', 'fresh'] as const) {
      const out = applyTempoFix(act, { kind, from, grid: g, anchored: true });
      expect(out.times.slice(0, 42), kind).toEqual(times.slice(0, 42));
      for (let k = 1; k < 70; k++) expect(Math.abs(out.times[41 + k]! - (from + k * P)), `${kind} ${k}`).toBeLessThan(0.03);
    }
  });
});
