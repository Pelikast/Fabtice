// The player core with the real WebAssembly stretcher, in Node: pitch and
// tempo accuracy, alignment of tracks, loop continuity and drift, metronome
// placement, transport semantics. Ported from the spike's `tests/checks.mjs`
// (Signalsmith part). Quality by ear is not covered here.

import { describe, expect, it } from 'vitest';
import { N } from './core';
import { LIMITER_DELAY } from './limiter';
import {
  SR,
  addTrack,
  cents,
  f0auto,
  findBursts,
  harmonic,
  makeCore,
  pulses,
  quanta,
  run,
  seamMetric,
  sine,
  zeroCrossFreq,
} from './testing';

const T = 120_000; // generous: real wasm, tens of seconds of audio per case

describe('latency model', () => {
  it('is the 150 ms the spike measured', async () => {
    const core = await makeCore();
    const ms = (core.latencyOut(1) / SR) * 1000;
    expect(ms).toBeGreaterThan(120);
    expect(ms).toBeLessThan(180);
  });
});

describe('pitch accuracy', () => {
  // Pure low sines are the worst case for phase vocoders: 25 cents is the bar.
  const sines: [number, number][] = [[12, 1], [-12, 1], [5, 1], [-5, 1], [7.37, 1], [5, 0.55], [-7, 0.55], [12, 0.55], [3, 1.5]];
  it.each(sines)('sine %f st at rate %f', async (semi, rate) => {
    const core = await makeCore();
    addTrack(core, sine(220, 10));
    core.semitones = semi;
    core.rate = core.rateTarget = rate;
    core.play();
    const { L } = run(core, quanta(7));
    const f = zeroCrossFreq(L, 3 * SR, 6.5 * SR);
    const err = cents(f, 220 * 2 ** (semi / 12));
    expect(Math.abs(err)).toBeLessThan(25);
  }, T);

  const tones: [number, number][] = [[-7, 0.55], [5, 0.55], [12, 0.55], [-12, 1], [7, 1], [0.4, 1], [-0.5, 1]];
  it.each(tones)('harmonic tone, %f st (cents included) at rate %f', async (semi, rate) => {
    const core = await makeCore();
    addTrack(core, harmonic(110, 10));
    core.semitones = semi;
    core.rate = core.rateTarget = rate;
    core.play();
    const { L } = run(core, quanta(7));
    const fe = 110 * 2 ** (semi / 12);
    const f = f0auto(L, 3 * SR, 24000, fe);
    expect(Math.abs(cents(f, fe))).toBeLessThan(8);
  }, T);
});

describe('tempo', () => {
  it.each([0.55, 1, 1.5, 2])('bursts keep their spacing and sit where the latency model says, rate %f', async (rate) => {
    const core = await makeCore();
    const times: number[] = [];
    for (let t = 1; t < 24; t += 1) times.push(t);
    addTrack(core, pulses(26, times));
    core.rate = core.rateTarget = rate;
    core.play();
    const { L } = run(core, quanta(20 / rate));
    const found = findBursts(L, 0.15);
    const spacing = (found[found.length - 1]! - found[0]!) / (found.length - 1) / SR;
    expect(Math.abs(spacing * rate - 1)).toBeLessThan(0.0005);
    expect(found.length).toBeGreaterThanOrEqual(10);
    let maxErr = 0;
    for (let i = 0; i < found.length; i++) {
      const expected = (times[i]! * SR + 72) / rate + core.latencyOut(rate) + LIMITER_DELAY; // 72 = burst centre
      maxErr = Math.max(maxErr, Math.abs(found[i]! - expected) / SR * 1000);
    }
    expect(maxErr).toBeLessThan(12);
  }, T);

  it('the cursor is the integral of the tempo, whatever the changes (no drift)', async () => {
    const core = await makeCore();
    addTrack(core, sine(200, 160));
    core.play();
    let sum = 0;
    const rates = [1, 0.6, 1.3, 0.4, 2, 0.75];
    run(core, quanta(60), (q) => {
      if (q % 600 === 0) core.setRate(rates[((q / 600) | 0) % rates.length]!);
      if (q >= 1) sum += core.rate; // the rate used by the previous quantum
    });
    const used = sum + core.rate;
    expect(Math.abs(core.cursor - used * N)).toBeLessThan(1.5);
    expect(core.ended).toBe(false);
  }, T);
});

describe('tracks', () => {
  it('stay aligned whatever their content (7 tracks, one untransposed... all share the transposition)', async () => {
    const core = await makeCore();
    const times: number[] = [];
    for (let t = 0.8; t < 12; t += 0.7) times.push(t);
    for (let k = 0; k < 7; k++) addTrack(core, pulses(14, times, 0.8, 1500 + 250 * k));
    core.semitones = 5;
    core.rate = core.rateTarget = 0.8;
    const per: number[][] = Array.from({ length: 7 }, () => []);
    core.onTrack = (i, l) => {
      for (let j = 0; j < N; j++) per[i]!.push(l[j]!);
    };
    core.play();
    run(core, quanta(14));
    const centres = per.map((a) => findBursts(Float32Array.from(a), 0.2));
    const m = Math.min(...centres.map((c) => c.length));
    let spread = 0;
    for (let i = 0; i < m; i++) {
      const v = centres.map((c) => c[i]!);
      spread = Math.max(spread, (Math.max(...v) - Math.min(...v)) / SR * 1000);
    }
    expect(m).toBeGreaterThanOrEqual(10);
    expect(spread).toBeLessThan(2.5);
  }, T);

  it('mono and stereo tracks mix as expected, volume and mute apply', async () => {
    const core = await makeCore();
    core.skipMuted = false;
    const a = addTrack(core, sine(440, 10, 0.2));
    const b = addTrack(core, sine(660, 10, 0.2), sine(660, 10, 0.2).map((v) => -v)); // stereo, opposite channels
    core.play();
    run(core, quanta(1.5));
    core.setMix(a, { volume: 0.5, mute: false, solo: false });
    core.setMix(b, { volume: 1, mute: true, solo: false });
    run(core, quanta(1));
    const { L, R } = run(core, quanta(1));
    const amp = (x: Float32Array, f: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < x.length; i++) {
        re += x[i]! * Math.cos((2 * Math.PI * f * i) / SR);
        im += x[i]! * Math.sin((2 * Math.PI * f * i) / SR);
      }
      return (2 * Math.hypot(re, im)) / x.length;
    };
    expect(amp(L, 440)).toBeGreaterThan(0.09);
    expect(amp(L, 440)).toBeLessThan(0.11);
    expect(amp(L, 660)).toBeLessThan(0.002);
    expect(amp(R, 440)).toBeGreaterThan(0.09);
  }, T);

  it('muted tracks are not computed unless asked', async () => {
    const core = await makeCore();
    addTrack(core, sine(440, 5));
    addTrack(core, sine(550, 5), undefined, { mute: true });
    core.play();
    run(core, quanta(0.5));
    expect(core.activeTracks).toBe(1);
  });
});

describe('loop', () => {
  const cases: [number, number][] = [[1, 0], [0.7, 0], [1.25, 0], [0.7, 5]];
  it.each(cases)('wrap is continuous (no click) at rate %f, %f st', async (rate, semi) => {
    const measure = async (noCrossfade: boolean) => {
      const core = await makeCore();
      addTrack(core, sine(330, 20, 0.5));
      core.setLoop(true, Math.round(0.5 * SR) + 37, Math.round(2.1 * SR) + 501);
      core.noCrossfade = noCrossfade;
      core.rate = core.rateTarget = rate;
      core.semitones = semi;
      core.ip = core.loop.start - 5000; // approach the loop from outside
      core.play();
      const { L } = run(core, quanta(14));
      return seamMetric(L, SR); // ignore the first second (latency, start-up)
    };
    const withCrossfade = await measure(false);
    expect(withCrossfade).toBeLessThan(4.5); // pure sine = 1.41
  }, T);

  it('the crossfade matters: a naive wrap is far worse', async () => {
    const run1 = async (noCrossfade: boolean) => {
      const core = await makeCore();
      addTrack(core, sine(330, 20, 0.5));
      core.setLoop(true, Math.round(0.5 * SR) + 37, Math.round(2.1 * SR) + 501);
      core.noCrossfade = noCrossfade;
      core.ip = core.loop.start - 5000;
      core.play();
      return seamMetric(run(core, quanta(10)).L, SR);
    };
    expect(await run1(true)).toBeGreaterThan(await run1(false));
  }, T);

  it('does not drift over many repetitions (rate 0.6)', async () => {
    const core = await makeCore();
    const loopStart = Math.round(0.5 * SR) + 37;
    const loopEnd = Math.round(1.3 * SR) + 501;
    const len = loopEnd - loopStart;
    const marker = pulses(3, [(loopStart + 6000) / SR]);
    addTrack(core, marker);
    core.setLoop(true, loopStart, loopEnd);
    core.rate = core.rateTarget = 0.6;
    core.ip = loopStart - 3000;
    core.play();
    const { L } = run(core, quanta(60));
    const b = findBursts(L, 0.2);
    const period = len / 0.6;
    const err = b.map((v, i) => v - b[0]! - i * period);
    const m = err.length;
    const mi = (m - 1) / 2;
    const me = err.reduce((a, c) => a + c, 0) / m;
    let sxy = 0;
    let sxx = 0;
    err.forEach((e, i) => {
      sxy += (i - mi) * (e - me);
      sxx += (i - mi) ** 2;
    });
    const slope = sxy / sxx;
    const resid = Math.max(...err.map((e, i) => Math.abs(e - (me + slope * (i - mi)))));
    expect(m).toBeGreaterThanOrEqual(30);
    expect(Math.abs(slope * m)).toBeLessThan(6);
    expect(resid).toBeLessThan(80);
  }, T);

  it('stays continuous when the tempo changes in the middle of the loop', async () => {
    const trial = async (withLoop: boolean) => {
      const core = await makeCore();
      addTrack(core, sine(260, 60));
      if (withLoop) {
        core.setLoop(true, Math.round(0.5 * SR) + 11, Math.round(2.5 * SR) + 333);
        core.ip = core.loop.start - 4000;
      }
      core.play();
      const { L } = run(core, quanta(16), (q) => {
        if (q === quanta(5)) core.setRate(0.5);
        if (q === quanta(9)) core.setRate(1.6);
        if (q === quanta(12)) core.setRate(0.8);
      });
      return seamMetric(L, SR);
    };
    const looping = await trial(true);
    const baseline = await trial(false);
    expect(looping).toBeLessThan(baseline * 1.5 + 0.5);
  }, T);

  it('plays on to the end when the playhead is past the loop end', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 6));
    core.setLoop(true, SR, 2 * SR);
    core.ip = 3 * SR; // after a seek beyond the loop
    core.play();
    run(core, quanta(5));
    expect(core.ended).toBe(true);
    expect(core.playing).toBe(false);
  }, T);

  it('heard position wraps with the sound, never jumps past the loop', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 10));
    core.setLoop(true, Math.round(1.0 * SR), Math.round(2.0 * SR));
    core.ip = Math.round(0.5 * SR);
    core.play();
    const seen: number[] = [];
    run(core, quanta(8), () => seen.push(core.heardPos() / SR));
    const late = seen.slice(quanta(1.5));
    expect(Math.min(...late)).toBeGreaterThanOrEqual(0.999);
    expect(Math.max(...late)).toBeLessThanOrEqual(2.001);
    let wraps = 0;
    for (let i = 1; i < late.length; i++) if (late[i]! < late[i - 1]! - 0.5) wraps++;
    expect(wraps).toBeGreaterThanOrEqual(4);
  }, T);
});

describe('metronome', () => {
  const cases: [number, boolean][] = [[0.6, false], [1.3, false], [0.75, true]];
  it.each(cases)('clicks land on irregular beats, rate %f, looping %s', async (rate, loop) => {
    const beats: number[] = [];
    let t = 1.0;
    let iv = 0.5;
    for (let i = 0; i < 60; i++) {
      beats.push(t);
      t += iv;
      iv = 0.5 + 0.12 * Math.sin(i / 3);
    }
    const x = pulses(40, beats);
    const frames = Float64Array.from(beats.map((b) => b * SR));
    const accents = Uint8Array.from(beats.map((_, i) => (i % 4 === 0 ? 1 : 0)));
    const render = async (metro: boolean) => {
      const core = await makeCore();
      const id = addTrack(core, x);
      core.rate = core.rateTarget = rate;
      if (loop) {
        core.setLoop(true, Math.round(beats[4]! * SR), Math.round(beats[12]! * SR));
        core.ip = Math.round(beats[2]! * SR);
      }
      core.setClicks(frames, accents);
      core.setMetronome(metro);
      if (metro) core.setMix(id, { volume: 1, mute: true, solo: false });
      core.play();
      return run(core, quanta(loop ? 20 : 30 / rate)).L;
    };
    const onsets = (a: Float32Array, thr: number) => {
      const o: number[] = [];
      let last = -1e9;
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i]!) > thr) {
          if (i - last > 2000) o.push(i);
          last = i;
        }
      }
      return o;
    };
    const so = onsets(await render(false), 0.04);
    const co = onsets(await render(true), 0.04);
    const n = Math.min(so.length, co.length);
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(so[i]! - co[i]!));
    expect(n).toBeGreaterThanOrEqual(8);
    expect((worst / SR) * 1000).toBeLessThan(6);
  }, T);

  it('clicks are not stretched: same length at any tempo', async () => {
    const lengths: number[] = [];
    for (const rate of [0.5, 2]) {
      const core = await makeCore();
      const id = addTrack(core, new Float32Array(SR * 6));
      core.setMix(id, { volume: 1, mute: true, solo: false });
      core.skipMuted = false;
      core.rate = core.rateTarget = rate;
      core.setClicks(Float64Array.from([SR * 2]), Uint8Array.from([0]));
      core.setMetronome(true);
      core.play();
      const { L } = run(core, quanta(5));
      let first = -1;
      let last = -1;
      for (let i = 0; i < L.length; i++) {
        if (Math.abs(L[i]!) > 0.01) {
          if (first < 0) first = i;
          last = i;
        }
      }
      lengths.push(last - first);
    }
    expect(Math.abs(lengths[0]! - lengths[1]!)).toBeLessThan(200);
    expect(lengths[0]!).toBeGreaterThan(500);
  }, T);
});

describe('transport', () => {
  it('seek while paused is exact, and the heard position is the cursor', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 10));
    core.seek(3 * SR);
    expect(core.heardPos()).toBe(3 * SR);
  });

  it('after a seek or a start the heard position shows the target until the new sound arrives, then advances', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 20));
    core.seek(5 * SR);
    core.play();
    const seen: number[] = [];
    run(core, quanta(2), () => seen.push(core.heardPos()));
    expect(seen[0]).toBe(5 * SR);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]! - 1e-6); // never goes back
    const last = seen[seen.length - 1]!;
    // 2 s of sound, minus the ~154 ms the engine (and limiter) delay it
    expect(last).toBeGreaterThan(5 * SR + 1.8 * SR);
    expect(last).toBeLessThan(5 * SR + 1.9 * SR);
  });

  it('a seek while playing shows the target at once and the sound continues from there', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 30));
    core.play();
    run(core, quanta(1));
    core.seek(20 * SR);
    expect(core.heardPos()).toBe(20 * SR);
    run(core, quanta(1.5));
    const h = core.heardPos() / SR;
    expect(h).toBeGreaterThan(21.2);
    expect(h).toBeLessThan(21.45);
  });

  it('pause fades out and keeps the heard position; play resumes from it', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 30, 0.5));
    core.play();
    run(core, quanta(2));
    const before = core.heardPos();
    core.pause();
    const frozen = core.heardPos();
    expect(Math.abs(frozen - before)).toBeLessThan(0.02 * SR);
    const { L } = run(core, quanta(0.3));
    // faded: the tail is silent, the start is not
    expect(Math.max(...L.subarray(L.length - 2000).map(Math.abs))).toBe(0);
    expect(core.playing).toBe(false);
    expect(core.heardPos()).toBeCloseTo(frozen, 0);
    // no jump bigger than the fade at the pause point
    let maxStep = 0;
    for (let i = 1; i < L.length; i++) maxStep = Math.max(maxStep, Math.abs(L[i]! - L[i - 1]!));
    expect(maxStep).toBeLessThan(0.1);
    core.play();
    run(core, quanta(2));
    expect(core.heardPos()).toBeGreaterThan(frozen + 1.0 * SR);
  });

  it('ended: stops at the end of the material, once everything was heard', async () => {
    const core = await makeCore();
    addTrack(core, sine(300, 3));
    core.seek(2 * SR);
    core.play();
    let endedAt = -1;
    run(core, quanta(3), (q) => {
      if (core.ended && endedAt < 0) endedAt = q;
    });
    expect(core.ended).toBe(true);
    expect(core.playing).toBe(false);
    expect(core.heardPos()).toBe(3 * SR);
    // 1 s of material + the ~150 ms latency
    const sec = (endedAt * N) / SR;
    expect(sec).toBeGreaterThan(1.1);
    expect(sec).toBeLessThan(1.4);
  }, T);

  it('tracks added while playing join in time', async () => {
    const core = await makeCore();
    const times = [1, 2, 3, 4, 5, 6];
    addTrack(core, pulses(8, times, 0.8, 1500));
    core.play();
    const parts: number[][] = [[], []];
    core.onTrack = (i, l) => {
      for (let j = 0; j < N; j++) parts[i]!.push(l[j]!);
    };
    run(core, quanta(1.5));
    addTrack(core, pulses(8, times, 0.8, 2500));
    run(core, quanta(5));
    const a = findBursts(Float32Array.from(parts[0]!), 0.2);
    const b = findBursts(Float32Array.from(parts[1]!), 0.2);
    expect(b.length).toBeGreaterThanOrEqual(3);
    // pulses of the added track fall on the same output frames as the first track's (offset by the start index)
    const base = parts[0]!.length - parts[1]!.length;
    for (let i = 0; i < b.length; i++) {
      const match = a.find((x) => Math.abs(x - (b[i]! + base)) < 200);
      expect(match, `burst ${i}`).toBeDefined();
    }
  }, T);
});
