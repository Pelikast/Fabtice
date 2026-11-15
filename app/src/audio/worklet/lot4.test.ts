// Lot 4 in the player core, with the real WebAssembly stretcher (Node): the
// count-in lands one beat before the music, sample-accurately, and the
// metronome goes on without a doubled or missing click; the loop accelerates
// step by step at the wraps, the clicks stay on the beats; the three click
// sounds and the volume.

import { describe, expect, it } from 'vitest';
import { METRONOME_VOLUME } from './core';
import { SR, addTrack, makeCore, pulses, quanta, run } from './testing';

const T = 120_000;

/** Onsets (first sample over `thr`, then at least `gap` samples of quiet). */
function onsets(a: Float32Array, thr: number, gap = 2000): number[] {
  const o: number[] = [];
  let last = -1e9;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]!) > thr) {
      if (i - last > gap) o.push(i);
      last = i;
    }
  }
  return o;
}

/** Left minus right: the track alone (it is on the left only); right: the clicks alone. */
function split(L: Float32Array, R: Float32Array): { music: Float32Array; clicks: Float32Array } {
  const music = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) music[i] = L[i]! - R[i]!;
  return { music, clicks: R };
}

describe('count-in', () => {
  it.each([0.8, 1, 1.3])('rate %f: clicks a played beat apart, the music comes in one beat after the last, the metronome goes on in step', async (rate) => {
    const core = await makeCore();
    const S = 2.0;
    const beat = 0.5;
    const beats = Array.from({ length: 16 }, (_, i) => S + i * beat);
    const x = pulses(14, beats);
    addTrack(core, x, new Float32Array(x.length));
    core.setRate(rate);
    core.setClicks(Float64Array.from(beats.map((b) => b * SR)), Uint8Array.from(beats.map((_, i) => (i % 4 === 0 ? 1 : 0))));
    core.setMetronome(true);
    core.seek(Math.round(S * SR));
    const offsets = Float64Array.from([4, 3, 2, 1].map((k) => k * beat * SR));
    core.play({ offsets, levels: Uint8Array.from([1, 0, 0, 0]) });
    expect(core.counting).toBe(true);
    expect(core.heardPos()).toBe(Math.round(S * SR)); // the position waits at the start
    const { L, R } = run(core, quanta(4 * beat / rate + 3));
    const { music, clicks } = split(L, R);
    const c = onsets(clicks, 0.05);
    const p = onsets(music, 0.1);
    const step = (beat / rate) * SR;
    // count-in (4) then the metronome: one click per played beat, evenly, none doubled, none missing
    expect(c.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i]! - c[i - 1]! - step)).toBeLessThanOrEqual(2);
    // the start (first pulse) is heard exactly where the fifth click is: one beat after the count-in
    expect(Math.abs(p[0]! - c[4]!)).toBeLessThan(0.003 * SR);
    expect(Math.abs(p[0]! - c[3]! - step)).toBeLessThan(0.003 * SR);
  }, T);

  it('pause during the count-in stops at once at the start; a seek starts playing from there', async () => {
    const core = await makeCore();
    addTrack(core, new Float32Array(SR * 6));
    core.seek(SR);
    core.play({ offsets: Float64Array.from([SR, SR / 2]), levels: Uint8Array.from([1, 0]) });
    run(core, 10);
    expect(core.countInLeft()).toBe(1);
    core.pause();
    expect(core.playing).toBe(false);
    expect(core.counting).toBe(false);
    expect(core.heardPos()).toBe(SR);
    core.play({ offsets: Float64Array.from([SR, SR / 2]), levels: Uint8Array.from([1, 0]) });
    run(core, 10);
    core.seek(3 * SR);
    expect(core.counting).toBe(false);
    expect(core.playing).toBe(true);
    expect(core.countInLeft()).toBe(0);
  }, T);
});

describe('loop wraps', () => {
  it.each([0.8, 0.75, 1.1])('rate %f: a loop that starts on a beat clicks on every pass (no click lost to rounding at the wrap)', async (rate) => {
    const core = await makeCore();
    addTrack(core, new Float32Array(SR * 6), undefined, { volume: 0 });
    const all = Array.from({ length: 12 }, (_, i) => i * 0.5);
    core.setClicks(Float64Array.from(all.map((b) => b * SR)), Uint8Array.from(all.map(() => 0)));
    core.setMetronome(true);
    core.setRate(rate);
    core.setLoop(true, 2 * SR, 4 * SR);
    core.seek(2 * SR);
    core.play();
    const sec = 12;
    const { R } = run(core, quanta(sec));
    const c = onsets(R, 0.001);
    const step = (0.5 / rate) * SR;
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i]! - c[i - 1]! - step)).toBeLessThanOrEqual(2);
    expect(c.length).toBeGreaterThanOrEqual(Math.floor((sec * SR - c[0]!) / step));
  }, T);
});

describe('progressive acceleration', () => {
  it('the loop plays at 80, 90 then 100 %, stepping at the wraps; the clicks stay on the beats, none doubled or missing', async () => {
    const core = await makeCore();
    const L0 = 1.0;
    const L1 = 3.0;
    const beats = [1.0, 1.5, 2.0, 2.5];
    const x = pulses(8, beats);
    addTrack(core, x, new Float32Array(x.length));
    core.setClicks(Float64Array.from(beats.map((b) => b * SR)), Uint8Array.from([1, 0, 0, 0]));
    core.setMetronome(true);
    core.setLoop(true, L0 * SR, L1 * SR);
    core.setRate(1);
    core.setAcceleration({ factors: Float64Array.from([0.8, 0.9, 1]), every: 1 });
    expect(core.rateTarget).toBeCloseTo(0.8, 12);
    core.seek(L0 * SR);
    core.play();
    const passes = [2 / 0.8, 2 / 0.9, 2, 2];
    const { L, R } = run(core, quanta(passes.reduce((a, b) => a + b) + 0.6));
    const { music, clicks } = split(L, R);
    const p = onsets(music, 0.1);
    const c = onsets(clicks, 0.05);
    // the pulse at the loop start, pass after pass
    const starts = p.filter((_, i) => i % 4 === 0);
    expect(starts.length).toBeGreaterThanOrEqual(5);
    for (let k = 0; k < 4; k++) {
      const got = (starts[k + 1]! - starts[k]!) / SR;
      expect(Math.abs(got - passes[k]!)).toBeLessThan(0.015);
    }
    expect(core.accelStep).toBe(2);
    // every click on its beat, one for one
    const n = Math.min(p.length, c.length);
    expect(n).toBeGreaterThanOrEqual(16);
    expect(Math.abs(p.length - c.length)).toBeLessThanOrEqual(1);
    // the onset finder sees a stretched pulse a little late, the same at every beat of a tempo: each click is within
    // 1 ms of that offset, transitions included (the first beat of each new step too), and within 6 ms in absolute
    const off = Array.from({ length: n }, (_, i) => c[i]! - p[i]!);
    const sorted = [...off].sort((a, b) => a - b);
    const median = sorted[n >> 1]!;
    for (let i = 0; i < n; i++) {
      expect(Math.abs(off[i]!)).toBeLessThan(0.006 * SR);
      if (i > 0) expect(Math.abs(off[i]! - median)).toBeLessThan(0.001 * SR);
    }
  }, T);

  it('the live tempo scales the steps; a new loop or a restart goes back to the first step; no loop, no acceleration', async () => {
    const core = await makeCore();
    addTrack(core, new Float32Array(SR * 4));
    core.setAcceleration({ factors: Float64Array.from([0.5, 0.75, 1]), every: 1 });
    expect(core.rateTarget).toBe(1); // the loop is off
    core.setLoop(true, 0, SR);
    expect(core.rateTarget).toBe(0.5);
    core.setRate(1.2);
    expect(core.rateTarget).toBeCloseTo(0.6, 12);
    core.seek(0);
    core.play();
    run(core, quanta(2 / 0.6 + 0.3));
    expect(core.accelStep).toBeGreaterThanOrEqual(1);
    core.restartAcceleration();
    expect(core.accelStep).toBe(0);
    run(core, quanta(2 / 0.6 + 0.3));
    expect(core.accelStep).toBeGreaterThanOrEqual(1);
    core.setLoop(true, 0, 2 * SR);
    expect(core.accelStep).toBe(0);
    core.setLoop(true, 0, 2 * SR); // the same loop again: nothing starts over
    core.setAcceleration(null);
    expect(core.rateTarget).toBeCloseTo(1.2, 12);
  }, T);
});

describe('click sounds and volume', () => {
  it('accent louder than normal, normal louder than soft; the volume scales them', async () => {
    const peaks = async (vol: number) => {
      const core = await makeCore();
      addTrack(core, new Float32Array(SR * 4), undefined, { volume: 0 });
      core.setClicks(Float64Array.from([0.5, 1.0, 1.5].map((s) => s * SR)), Uint8Array.from([1, 0, 2]));
      core.setMetronome(true);
      core.setMetronomeVolume(vol);
      core.play();
      const { R } = run(core, quanta(2));
      const peak = (a: number, b: number) => {
        let m = 0;
        for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) m = Math.max(m, Math.abs(R[i]!));
        return m;
      };
      // the clicks are heard after the stretcher's latency: look at each beat's half second
      return [peak(0.5, 1.0), peak(1.0, 1.5), peak(1.5, 2.0)] as const;
    };
    const [a, n, s] = await peaks(METRONOME_VOLUME);
    expect(a).toBeGreaterThan(n * 1.1);
    expect(n).toBeGreaterThan(s * 2);
    const [a2] = await peaks(METRONOME_VOLUME / 2);
    expect(a2 / a).toBeGreaterThan(0.45);
    expect(a2 / a).toBeLessThan(0.55);
  }, T);
});
