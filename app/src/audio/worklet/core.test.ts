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
  applySet,
  cents,
  chirp,
  chirpRendered,
  chirpSecond,
  f0auto,
  findBursts,
  harmonic,
  makeCore,
  pulses,
  quanta,
  renderedOf,
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

// « Appliquer »: the player reads audio rendered offline as it is. The offline renderer is replaced here by the
// ideal one for each signal (a chirp, a sine, pulses at known times), so what is measured is the player.
describe('applied playback (« Appliquer »)', () => {
  const F0 = 400;
  const BETA = 100; // Hz per source second: the frequency heard says the source second heard
  const SEC = 60;
  const RATIO = 0.7;
  const quant = (x: Float32Array) => Float32Array.from(x, (v) => Math.round(v * 32768) / 32768);

  /** A core with one chirp track and its ideal rendered version, the live settings at `live` (a tempo). */
  async function chirpCore(live: number, ratio = RATIO) {
    const core = await makeCore();
    const id = addTrack(core, chirp(F0, BETA, SEC));
    core.rate = core.rateTarget = live;
    applySet(core, [id], [renderedOf(chirpRendered(F0, BETA, SEC, ratio))], 0, ratio);
    return { core, id };
  }

  it('plays the rendered audio as it is: no stretcher in the path, only the limiter\'s delay', async () => {
    const { core } = await chirpCore(RATIO);
    const rendered = quant(chirpRendered(F0, BETA, SEC, RATIO));
    core.seek(10 * SR);
    core.play();
    const { L } = run(core, quanta(2));
    expect(core.path).toBe(1);
    expect(core.mixApplied).toBe(1);
    expect(core.appliedInUse).toBe(true);
    // output frame i is rendered frame r0 + i - LIMITER_DELAY (the position is source time, rendered frame k is source frame k * ratio)
    const r0 = Math.round((10 * SR) / RATIO);
    let worst = 0;
    for (let i = Math.round(0.3 * SR); i < L.length; i++) worst = Math.max(worst, Math.abs(L[i]! - rendered[r0 + i - LIMITER_DELAY]!));
    expect(worst).toBeLessThan(1e-6);
  }, T);

  it('while the live settings are not the set\'s the preview is heard exactly as without a set', async () => {
    const trial = async (withSet: boolean) => {
      const core = await makeCore();
      const id = addTrack(core, chirp(F0, BETA, 30));
      core.rate = core.rateTarget = 0.9;
      core.semitones = 3;
      if (withSet) applySet(core, [id], [renderedOf(chirpRendered(F0, BETA, 30, RATIO))], 0, RATIO);
      core.seek(4 * SR);
      core.play();
      return run(core, quanta(3)).L;
    };
    const a = await trial(false);
    const b = await trial(true);
    expect(Array.from(b)).toEqual(Array.from(a));
  }, T);

  it('a set is used only for the same key and tempo, and only when it covers every track', async () => {
    const { core, id } = await chirpCore(RATIO);
    core.play();
    run(core, 4);
    expect(core.path).toBe(1);
    core.semitones = 0.01;
    run(core, 1);
    expect(core.path).toBe(0);
    core.semitones = 0;
    run(core, 1);
    expect(core.path).toBe(1);
    // a track added later has no rendered audio: back to the preview
    addTrack(core, sine(200, 10));
    run(core, 1);
    expect(core.path).toBe(0);
    core.removeTrack(core.tracks[1]!.id);
    run(core, 1);
    expect(core.path).toBe(1);
    // the tempo must have reached the set's, not only be on its way
    core.setRate(0.9);
    run(core, 1);
    expect(core.path).toBe(0);
    run(core, 70); // the tempo reaches 0.9 (0.004 a quantum)
    core.setRate(RATIO);
    run(core, 2);
    expect(core.path).toBe(0); // smoothing: 0.9 → 0.7 takes about 50 quanta, the rendered audio waits for it
    run(core, 80);
    expect(core.path).toBe(1);
    core.clearRendered();
    run(core, 1);
    expect(core.path).toBe(0);
    expect(core.tracks[0]!.id).toBe(id);
    expect(core.hasRendered(id)).toBe(false);
  }, T);

  it('switches between preview and applied while playing: the heard position does not jump, the sound is where the position says', async () => {
    const { core } = await chirpCore(0.9);
    core.seek(8 * SR);
    core.play();
    const heard: number[] = [];
    const rates: number[] = [];
    const mix: number[] = [];
    const total = quanta(11);
    const { L } = run(core, total, (q) => {
      if (q === quanta(3)) core.setRate(RATIO); // → applied once the tempo has settled
      if (q === quanta(7)) core.setRate(0.9); // → preview at once
      heard.push(core.heardPos());
      rates.push(core.heardRate);
      mix.push(core.mixApplied);
    });
    // it did go to the rendered audio and came back (the stretchers need their latency, about 150 ms, before they sound)
    const firstApplied = mix.findIndex((m) => m >= 1);
    const backAt = mix.findIndex((m, i) => i > firstApplied && m < 1);
    expect(firstApplied).toBeGreaterThan(quanta(3));
    expect(core.path).toBe(0);
    const handOver = ((backAt - quanta(7)) * N) / SR;
    expect(handOver, 'seconds from the change of tempo to the preview taking over').toBeGreaterThan(0.12);
    expect(handOver).toBeLessThan(0.3);
    // the heard position never jumps (a jump of the engine's latency would be 7 000 frames), whichever way it goes;
    // where nothing changes it advances by exactly what the tempo says
    let worst = 0;
    let calmWorst = 0;
    for (let q = 80; q < heard.length; q++) {
      const dev = Math.abs(heard[q]! - heard[q - 1]! - N * rates[q]!);
      worst = Math.max(worst, dev);
      if (rates[q] === rates[q - 1] && mix[q] === mix[q - 1] && Math.abs(rates[q]! - core.rate) < 1e-9 + 0.2) calmWorst = Math.max(calmWorst, dev);
    }
    expect(worst, 'largest difference between a step of the heard position and N * rate (frames)').toBeLessThan(400);
    expect(calmWorst, 'same, where the tempo and the route are steady (frames)').toBeLessThan(30);
    // and what is heard is where it says: the chirp's frequency gives the source second
    const win = 4096;
    let maxErr = 0;
    for (const sec of [1.5, 2.8, 4.4, 5.4, 6.2, 7.8, 9.4, 10.5]) {
      const q = Math.round((sec * SR) / N);
      const from = q * N - win / 2;
      const seen = chirpSecond(L, from, win, F0, BETA);
      const said = heard[q]! / SR;
      maxErr = Math.max(maxErr, Math.abs(seen - said));
    }
    expect(maxErr * 1000, 'ms between the source second heard and the one reported').toBeLessThan(30);
  }, T);

  it('no click at the switches: the largest step stays within 1.5 times a steady sine\'s, both ways', async () => {
    // the same 2 kHz sine in the preview and in the rendered audio: only the two engines' phases differ
    const trial = async (back: boolean) => {
      const core = await makeCore();
      const id = addTrack(core, sine(2000, 30, 0.5));
      core.rate = core.rateTarget = 0.9;
      applySet(core, [id], [renderedOf(sine(2000, 30 / RATIO, 0.5))], 0, RATIO);
      core.play();
      const { L } = run(core, quanta(9), (q) => {
        if (q === quanta(3)) core.setRate(RATIO);
        if (back && q === quanta(6)) core.setRate(0.9);
      });
      return L;
    };
    const steady = 0.5 * 2 * Math.PI * (2000 / SR);
    for (const back of [false, true]) {
      const L = await trial(back);
      let worst = 0;
      for (let i = Math.round(0.8 * SR); i < L.length; i++) worst = Math.max(worst, Math.abs(L[i]! - L[i - 1]!));
      expect(worst / steady, `largest step over a steady sine's, ${back ? 'there and back' : 'to the rendered audio'}`).toBeLessThan(1.5);
    }
  }, T);

  it('the loop returns to the right place turn after turn, with no drift (100 turns at 0.7)', async () => {
    const core = await makeCore();
    const t0 = 2.0;
    const t1 = 3.5;
    const marks = [t0 + 0.2, t0 + 0.55, t0 + 1.1, t0 + 1.3]; // source seconds, inside the loop and clear of its crossfade
    const rendered = pulses(40, marks.map((m) => m / RATIO).concat(marks.map((m) => (m + 5) / RATIO)), 0.8, 2000);
    const id = addTrack(core, new Float32Array(SEC * SR));
    core.rate = core.rateTarget = RATIO;
    applySet(core, [id], [renderedOf(rendered)], 0, RATIO);
    core.setLoop(true, Math.round(t0 * SR), Math.round(t1 * SR));
    core.ip = Math.round(t0 * SR) - 1000;
    core.play();
    const turns = 100;
    const turn = ((t1 - t0) * SR) / RATIO; // output frames of one turn
    const { L } = run(core, quanta(turns * (turn / SR) + 3));
    const found = findBursts(L, 0.3, 2400).filter((x) => x > 0.5 * SR);
    expect(found.length).toBeGreaterThanOrEqual(marks.length * (turns - 2));
    // the same mark of consecutive turns is exactly one turn apart; the first and the last are `n` turns apart
    const per = marks.length;
    let worst = 0;
    for (let i = 0; i + per < found.length; i++) worst = Math.max(worst, Math.abs(found[i + per]! - found[i]! - turn));
    expect(worst, 'frames between a mark and the same mark one turn later, against the exact turn').toBeLessThan(2);
    const n = Math.floor((found.length - 1) / per);
    expect(Math.abs((found[n * per]! - found[0]!) / n - turn), 'mean turn against the exact one (frames)').toBeLessThan(0.05);
    expect(core.heardPos()).toBeGreaterThanOrEqual(Math.round(t0 * SR) - 200);
    expect(core.heardPos()).toBeLessThanOrEqual(Math.round(t1 * SR) + 200);
  }, T);

  it('the loop wrap has no click (the same crossfade as the preview)', async () => {
    const core = await makeCore();
    const id = addTrack(core, sine(330, 30, 0.5));
    core.rate = core.rateTarget = RATIO;
    applySet(core, [id], [renderedOf(sine(330, 30 / RATIO, 0.5))], 0, RATIO);
    core.setLoop(true, Math.round(2.003 * SR), Math.round(3.611 * SR));
    core.ip = Math.round(1.5 * SR);
    core.play();
    const { L } = run(core, quanta(14));
    expect(seamMetric(L, 2 * SR)).toBeLessThan(4.5);
    core.noCrossfade = true;
    const bare = run(core, quanta(14)).L;
    expect(seamMetric(bare, 0)).toBeGreaterThan(seamMetric(L, 2 * SR)); // the crossfade is what removes the click
  }, T);

  it('the metronome clicks land on the beats, at the same output frames as the beats of the rendered audio (ratio 0.7)', async () => {
    const beats: number[] = [];
    for (let b = 1; b < 24; b += 0.5) beats.push(b);
    const trial = async (clicks: boolean) => {
      const core = await makeCore();
      const id = addTrack(core, new Float32Array(30 * SR));
      core.rate = core.rateTarget = RATIO;
      // the rendered audio carries a pulse on every beat (at the played speed), or nothing
      applySet(core, [id], [renderedOf(clicks ? new Float32Array(Math.round((30 / RATIO) * SR)) : pulses(30 / RATIO, beats.map((b) => b / RATIO), 0.8, 2000))], 0, RATIO);
      if (clicks) {
        core.setClicks(Float64Array.from(beats.map((b) => b * SR)), Uint8Array.from(beats.map((_, i) => (i % 4 === 0 ? 1 : 0))));
        core.setMetronome(true);
      }
      core.play();
      return run(core, quanta(18)).L;
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
    const so = onsets(await trial(false), 0.04); // pulse onsets (raised cosine: the 0.04 level is reached a few frames in)
    const co = onsets(await trial(true), 0.04);
    const n = Math.min(so.length, co.length);
    expect(n).toBeGreaterThanOrEqual(20);
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(so[i]! - co[i]!));
    expect((worst / SR) * 1000, 'ms between a click and the beat of the rendered audio').toBeLessThan(1);
    // and each click is where its beat is: output frame = (beat - start) / ratio + limiter delay, the pulse reaching 0.04 about 10 frames in
    for (let i = 0; i < n; i++) expect(Math.abs(co[i]! - (beats[i]! * SR) / RATIO - LIMITER_DELAY)).toBeLessThan(60);
  }, T);

  it('no click is lost or doubled across the switches', async () => {
    const beats: number[] = [];
    for (let b = 0.5; b < 40; b += 0.5) beats.push(b);
    const core = await makeCore();
    const id = addTrack(core, new Float32Array(50 * SR));
    core.rate = core.rateTarget = 0.9;
    applySet(core, [id], [renderedOf(new Float32Array(Math.round((50 / RATIO) * SR)))], 0, RATIO);
    core.setClicks(Float64Array.from(beats.map((b) => b * SR)), Uint8Array.from(beats.map(() => 0)));
    core.setMetronome(true);
    core.seek(2 * SR);
    core.play();
    const heard: number[] = [];
    const rates: number[] = [];
    const { L } = run(core, quanta(16), (q) => {
      if (q === quanta(2)) core.setRate(RATIO);
      if (q === quanta(6)) core.setRate(0.9);
      if (q === quanta(9)) core.setRate(RATIO);
      if (q === quanta(12.3)) core.setRate(0.8);
      heard.push(core.heardPos());
      rates.push(core.rate);
    });
    const found: number[] = [];
    let last = -1e9;
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i]!) > 0.02) {
        if (i - last > 4000) found.push(i);
        last = i;
      }
    }
    // the source second of each click, from the heard position at its onset
    const seconds = found.map((f) => {
      const q = Math.floor(f / N);
      return (heard[q]! + (f - q * N) * rates[q]!) / SR;
    });
    const index = seconds.map((s) => beats.findIndex((b) => Math.abs(b - s) < 0.04));
    expect(index.every((k) => k >= 0), `each click at a beat: ${seconds.map((s) => s.toFixed(3)).join(' ')}`).toBe(true);
    for (let i = 1; i < index.length; i++) expect(index[i]! - index[i - 1]!, `click ${i} follows the previous beat`).toBe(1);
    expect(found.length).toBeGreaterThan(12);
  }, T);

  it('costs clearly less processor than the preview (7 tracks)', async () => {
    const load = async (applied: boolean) => {
      const core = await makeCore();
      const ids: string[] = [];
      const data = [];
      for (let k = 0; k < 7; k++) {
        ids.push(addTrack(core, harmonic(110 * 2 ** (k / 7), 30), harmonic(110 * 2 ** (k / 7) + 1, 30)));
        data.push(renderedOf(harmonic(110 * 2 ** (k / 7), 30 / RATIO), harmonic(110 * 2 ** (k / 7) + 1, 30 / RATIO)));
      }
      core.rate = core.rateTarget = RATIO;
      core.semitones = applied ? 0 : 2; // the preview works on a key change, the applied path on its own set
      applySet(core, ids, data, 0, RATIO);
      core.play();
      run(core, quanta(2));
      core.takeLoad();
      run(core, quanta(12));
      expect(core.mixApplied).toBe(applied ? 1 : 0);
      return core.takeLoad().avg;
    };
    const preview = await load(false);
    const applied = await load(true);
    expect(applied, `applied ${(applied * 100).toFixed(2)} % of the quantum, preview ${(preview * 100).toFixed(2)} %`).toBeLessThan(preview / 5);
  }, T);

  it('mixing is the preview\'s: mute, solo, volume', async () => {
    const core = await makeCore();
    const a = addTrack(core, sine(300, 30, 0.4));
    const b = addTrack(core, sine(700, 30, 0.4));
    core.rate = core.rateTarget = RATIO;
    applySet(core, [a, b], [renderedOf(sine(300, 30 / RATIO, 0.4)), renderedOf(sine(700, 30 / RATIO, 0.4))], 0, RATIO);
    const tone = (x: Float32Array, f: number) => {
      let re = 0;
      let im = 0;
      for (let i = SR; i < x.length; i++) {
        re += x[i]! * Math.cos((2 * Math.PI * f * i) / SR);
        im += x[i]! * Math.sin((2 * Math.PI * f * i) / SR);
      }
      return (2 * Math.hypot(re, im)) / (x.length - SR);
    };
    core.play();
    let L = run(core, quanta(2)).L;
    expect(tone(L, 300)).toBeCloseTo(0.4, 1);
    expect(tone(L, 700)).toBeCloseTo(0.4, 1);
    core.setMix(b, { volume: 0.5, mute: false, solo: false });
    L = run(core, quanta(2)).L;
    expect(tone(L, 700)).toBeCloseTo(0.2, 1);
    core.setMix(b, { volume: 0.5, mute: true, solo: false });
    L = run(core, quanta(2)).L;
    expect(tone(L, 700)).toBeLessThan(0.01);
    expect(tone(L, 300)).toBeCloseTo(0.4, 1);
    core.setMix(b, { volume: 1, mute: false, solo: true });
    L = run(core, quanta(2)).L;
    expect(tone(L, 300)).toBeLessThan(0.01);
    expect(tone(L, 700)).toBeCloseTo(0.4, 1);
    expect(core.mixApplied).toBe(1);
  }, T);

  it('transport: pause holds the position, play resumes, a seek while playing continues from the target, the end is reached', async () => {
    const { core } = await chirpCore(RATIO);
    core.seek(5 * SR);
    core.play();
    run(core, quanta(2));
    core.pause();
    run(core, quanta(0.1));
    expect(core.playing).toBe(false);
    const held = core.heardPos();
    expect(held / SR).toBeGreaterThan(6.2);
    expect(held / SR).toBeLessThan(6.5);
    core.play();
    run(core, quanta(1));
    expect(core.heardPos()).toBeGreaterThan(held + 0.6 * SR);
    expect(core.path).toBe(1);
    core.seek(20 * SR);
    expect(core.heardPos()).toBe(20 * SR);
    const { L } = run(core, quanta(1.5));
    const h = core.heardPos() / SR;
    expect(h).toBeGreaterThan(20.9);
    expect(h).toBeLessThan(21.2);
    expect(chirpSecond(L, L.length - 4096, 4096, F0, BETA)).toBeCloseTo(h, 1);
    core.seek((SEC - 1) * SR);
    let endedAt = -1;
    run(core, quanta(2), (q) => {
      if (core.ended && endedAt < 0) endedAt = q;
    });
    expect(core.ended).toBe(true);
    expect(core.heardPos()).toBe(SEC * SR);
    expect((endedAt * N) / SR, 'one source second at 0.7 takes 1.43 s, no engine latency').toBeLessThan(1.6);
  }, T);

  it('the set goes with the tracks: removeTrack, clearTracks', async () => {
    const core = await makeCore();
    const a = addTrack(core, sine(300, 5));
    const b = addTrack(core, sine(500, 5));
    core.rate = core.rateTarget = RATIO;
    applySet(core, [a, b], [renderedOf(sine(300, 5 / RATIO)), renderedOf(sine(500, 5 / RATIO))], 0, RATIO);
    run(core, 2);
    expect(core.path).toBe(1);
    core.removeTrack(a);
    run(core, 2);
    expect(core.path).toBe(1);
    expect(core.hasRendered(a)).toBe(false);
    expect(core.hasRendered(b)).toBe(true);
    core.clearTracks();
    expect(core.path).toBe(0);
    expect(core.tracks.length).toBe(0);
    addTrack(core, sine(300, 5));
    run(core, 2);
    expect(core.path).toBe(0); // nothing rendered for it
  });
});
