// Writes `prototype-values.json`: what the analysis PROTOTYPE
// (`web/spikes/analyse/lib/`) computes on the deterministic inputs of
// `inputs.mjs`. The unit tests of the port compare the ported code with it.
// Run it again only if the prototype's logic is changed on purpose:
//   node src/analysis/engine/fixtures/make-fixtures.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beatDownProb, postMinimal, refinePeak } from '../../../../../web/spikes/analyse/lib/beats.js';
import { fft } from '../../../../../web/spikes/analyse/lib/fft.js';
import { resampleRatio } from '../../../../../web/spikes/analyse/lib/grid.js';
import { inferMeter } from '../../../../../web/spikes/analyse/lib/meter.js';
import { estimateTuning } from '../../../../../web/spikes/analyse/lib/tuning.js';
import { poolSegments } from '../../../../../web/spikes/analyse/lib/chords.js';
import { buildSegments, changeProb, decodeChords, keyFit, motionScore } from '../../../../../web/spikes/analyse/lib/harmony.js';
import { estimateKey } from '../../../../../web/spikes/analyse/lib/key.js';
import { chartFromGrid } from '../../../../../web/spikes/analyse/lib/pipeline.js';
import { beatActivations, chordFrames, downProbs, rng, steadyGrid, tonePiece } from './inputs.mjs';

const out = {};
const round = (a, d = 12) => Array.from(a, (v) => Number(v.toFixed(d)));

// ---- fft
{
  const rand = rng(5);
  const re = Float64Array.from({ length: 64 }, () => rand() - 0.5);
  const im = new Float64Array(64);
  const input = Array.from(re);
  fft(re, im);
  out.fft = { input, re: Array.from(re), im: Array.from(im) };
}

// ---- resampling
{
  const x = tonePiece(44100, 0.5, 0, 6);
  const ratio = Math.pow(2, 30 / 1200);
  const y = resampleRatio(x, ratio);
  const z = resampleRatio(x, 48000 / 22050, 32);
  out.resample = {
    ratio,
    length: y.length,
    head: round(y.slice(100, 108)),
    tail: round(y.slice(-8)),
    sum: Number(Array.from(y).reduce((a, b) => a + b, 0).toFixed(9)),
    down: { length: z.length, head: round(z.slice(100, 108)), tail: round(z.slice(-8)) },
  };
}

// ---- tuning
{
  const cases = { sharp30: [22050, 6, 30, 1], flat17: [22050, 6, -17, 7], inTune: [22050, 6, 0, 8] };
  out.tuning = {};
  for (const [name, args] of Object.entries(cases)) {
    const t = estimateTuning(tonePiece(...args), 22050);
    out.tuning[name] = { cents: t.cents, refHz: t.refHz, confidence: t.confidence, peakiness: t.peakiness, peaks: t.peaks };
  }
  out.tuning.silence = estimateTuning(new Float32Array(22050 * 3), 22050);
  out.tuning.tooShort = estimateTuning(new Float32Array(1000), 22050);
}

// ---- beats
{
  const act = beatActivations(1000, 25);
  const m = postMinimal(act);
  out.beats = {
    refined: [3, 28, 53].map((f) => refinePeak(act.beat, f)),
    beats: m.beats,
    downbeatIdx: m.downbeatIdx,
    downProb: beatDownProb(act, m.beats),
  };
  // The 30 s chunks of the beat network, as `beatLogits` cuts them (the prototype keeps this inline).
  const starts = (T) => {
    const chunk = 1500, border = 6;
    const s = [];
    for (let k = -border; k < T - border; k += chunk - 2 * border) s.push(k);
    if (T > chunk - 2 * border) s[s.length - 1] = T - (chunk - border);
    return s;
  };
  out.chunkStarts = Object.fromEntries([200, 1488, 1489, 3001, 3700, 12000].map((T) => [T, starts(T)]));
}

// ---- meter
{
  const four = inferMeter(downProbs(40, 4, 1), { candidates: [3, 4] });
  const three = inferMeter(downProbs(45, 3, 2), { candidates: [3, 4] });
  const wide = inferMeter(downProbs(48, 4, 0, 11));
  const short = inferMeter([0.9, 0.1, 0.1]);
  out.meter = { four, three, wide, short };
}

// ---- harmony
const DOM = 6;
const chord = (root, qual) => root * 14 + qual;
const progression = [chord(2, 8), chord(7, DOM), chord(0, 7), chord(0, 7), chord(2, 8), chord(7, DOM), chord(0, 7), chord(9, DOM)];
out.progression = progression;
{
  const pairs = [[36, 104], [104, 7], [7, 36], [7, 104], [7, 49], [104, 49], [36, 168], [168, 7], [7, 21], [21, 36], [132, 36], [78, 146], [146, 7], [7, 7 + 14 * 6]];
  out.motion = pairs.map(([a, b]) => ({ a, b, score: motionScore(a, b) }));
  const fits = [];
  for (const [tonic, minor] of [[0, false], [11, false], [9, true], [2, true]]) {
    for (const c of [7, 36, 104, 132, 49, 168, 90, 175 - 7]) fits.push({ c, tonic, minor, fit: keyFit(c, tonic, minor) });
  }
  out.keyFit = fits;
  out.changeProb = [[1, 4], [3, 4], [2, 4], [1, 3], [2, 3], [4, 4], [1, 6], [4, 6]].map(([n, b]) => ({ n, b, p: changeProb(n, b) }));
}

// ---- chords on a grid
{
  const bars = 8;
  const frames = chordFrames(progression, { bars });
  const grid = steadyGrid(bars * 4 + 1, 4);
  out.framesSpec = { bars };
  const segs = grid.beats.map((t, i) => [t, grid.beats[i + 1] ?? t + 0.5]);
  const units = poolSegments(frames, segs, 1);
  out.pool = { first: { t0: units[0].t0, t1: units[0].t1, frames: units[0].frames, logp: round(units[0].logp.slice(0, 6)), pitch: round(units[0].pitch), bass: round(units[0].bass) }, frames: units.map((u) => u.frames) };
  const dec = decodeChords(units, grid.numbers, 4, { tonic: 0, minor: false });
  const nokey = decodeChords(units, grid.numbers, 4, null, { kappa: 0 });
  out.decode = { path: dec.path, pathNoKey: nokey.path, postMax: dec.post.map((p) => Number(Math.max(...p).toFixed(10))) };
  const times = grid.beats.concat([segs[segs.length - 1][1]]);
  out.segments = buildSegments(units, times, dec.path, dec.post).map((s) => ({
    chord: s.chord, beats: s.beats, t0: s.t0, t1: s.t1, posterior: s.posterior, confidence: s.confidence,
    alternatives: s.alternatives, pitch: round(s.pitch, 10), extensions: s.extensions, bass: s.bass,
  }));

  // Key from a chroma that looks like B-flat major, with and without the chord fit.
  const kk = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const chroma = Array.from({ length: 12 }, (_, i) => kk[(i - 10 + 12) % 12] * 3 + 0.2 * Math.sin(i));
  const k = estimateKey(chroma, null);
  const kc = estimateKey(chroma, dec.path.map((c, i) => ({ chord: c, dur: 0.5 })), { wChords: 0.5 });
  out.key = {
    plain: { best: [k.best.tonic, k.best.minor, k.best.p], ranked: k.ranked.map((r) => [r.tonic, r.minor, r.p]) },
    withChords: { best: [kc.best.tonic, kc.best.minor, kc.best.p], ranked: kc.ranked.map((r) => [r.tonic, r.minor, r.p]) },
  };

  // The whole decoding step, as the prototype's pipeline does it.
  const whole = chartFromGrid(frames, 1, grid, {});
  const scaled = chartFromGrid(frames, 1.0175, grid, {});
  const fixed = chartFromGrid(frames, 1, grid, {}, { best: { tonic: 7, minor: false } });
  const brief = (c) => ({
    key: { best: [c.key.best.tonic, c.key.best.minor, c.key.best.p ?? null], ranked: (c.key.ranked ?? []).map((r) => [r.tonic, r.minor, r.p ?? null]) },
    segments: c.segments.map((s) => ({ chord: s.chord, t0: s.t0, t1: s.t1, confidence: s.confidence, extensions: s.extensions.map((e) => e.name), bass: s.bass ? s.bass.pc : null, alternatives: s.alternatives.map((a) => a.chord) })),
  });
  out.chart = { whole: brief(whole), scaled: brief(scaled), fixed: brief(fixed) };
}

const file = fileURLToPath(new URL('./prototype-values.json', import.meta.url));
fs.writeFileSync(file, `${JSON.stringify(out)}\n`);
console.log(`written ${file} (${fs.statSync(file).size} bytes)`);
