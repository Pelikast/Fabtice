// Whole analysis, independent of the browser: the page's worker and the Node benchmark
// both call these functions with an onnxruntime module and open sessions.

import { logMel, beatLogits, postMinimal, beatDownProb, tempoCurve } from './beats.js';
import { dbnDecode } from './dbn.js';
import { inferMeter } from './meter.js';
import { estimateTuning } from './tuning.js';
import { cremaFrames, poolSegments, rawSegments } from './chords.js';
import { decodeChords, buildSegments } from './harmony.js';
import { estimateKey } from './key.js';
import { makeGrid, resampleRatio } from './grid.js';

export const OPTION_DEFAULTS = {
  post: 'minimal',      // 'minimal' | 'dbn' | 'joint'
  meterSource: 'hmm',   // 'hmm' (meter HMM on beats) | 'network' (Beat This downbeats as is)
  minBpm: 40, maxBpm: 300, lambda: 100,
  tuningCorrection: true,
  harmonyPrior: true,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function beatStage(ort, sessions, audio22, progress = () => {}) {
  const t0 = now();
  const mel = await logMel(ort, sessions.logmel, audio22);
  const t1 = now();
  const act = await beatLogits(ort, sessions.beat, mel, (p) => progress('beats', p));
  return { act, timings: { logmel: t1 - t0, beatNet: now() - t1 } };
}

// From network activations to a grid, with the chosen post-processing.
export function gridFromActivations(act, opts) {
  const o = { ...OPTION_DEFAULTS, ...opts };
  if (o.post === 'joint') {
    const runs = [3, 4].map((m) => dbnDecode(act, { beatsPerBar: m, minBpm: o.minBpm, maxBpm: o.maxBpm, lambda: o.lambda }));
    runs.sort((a, b) => b.logProb - a.logProb);
    const r = runs[0];
    return { grid: makeGrid(r.beats, r.numbers, r.beatsPerBar), meterScores: runs.map((x) => ({ meter: x.beatsPerBar, logProb: x.logProb })) };
  }
  let beats, netDown = null;
  if (o.post === 'dbn') beats = dbnDecode(act, { beatsPerBar: 1, minBpm: o.minBpm, maxBpm: o.maxBpm, lambda: o.lambda }).beats;
  else { const m = postMinimal(act); beats = m.beats; netDown = m.downbeatIdx; }
  if (o.meterSource === 'network' && netDown) {
    // Number beats from the network's own downbeats; meter = most common bar length.
    const lens = {};
    for (let i = 1; i < netDown.length; i++) { const l = netDown[i] - netDown[i - 1]; lens[l] = (lens[l] || 0) + 1; }
    const bpb = Number(Object.entries(lens).sort((a, b) => b[1] - a[1])[0]?.[0] || 4);
    const numbers = new Array(beats.length);
    let last = -1, k = 0;
    const set = new Set(netDown);
    for (let i = 0; i < beats.length; i++) {
      if (set.has(i)) { last = i; numbers[i] = 1; continue; }
      numbers[i] = last < 0 ? ((i - (netDown[0] ?? 0)) % bpb + bpb) % bpb + 1 : ((i - last) % bpb) + 1;
      k++;
    }
    return { grid: makeGrid(beats, numbers, bpb), meterScores: [] };
  }
  const dp = beatDownProb(act, beats);
  const m = inferMeter(dp, { fixed: o.fixedMeter || null });
  return { grid: makeGrid(beats, m.numbers, m.beatsPerBar), meterScores: m.scores };
}

export async function chordStage(ort, sessions, audio44, tuning, opts) {
  const o = { ...OPTION_DEFAULTS, ...opts };
  const t0 = now();
  let input = audio44, timeScale = 1;
  if (o.tuningCorrection && tuning && Math.abs(tuning.cents) >= 5) {
    const ratio = Math.pow(2, -tuning.cents / 1200);
    input = resampleRatio(audio44, ratio);
    timeScale = 1 / ratio;
  }
  const t1 = now();
  const frames = await cremaFrames(ort, sessions.crema, input);
  return { frames, timeScale, timings: { tuningResample: t1 - t0, chordNet: now() - t1 } };
}

function beatSegments(beats) {
  return beats.map((t, i) => [t, beats[i + 1] ?? t + (i > 0 ? t - beats[i - 1] : 0.5)]);
}

// Chords on the grid, key estimate and chart. Cheap: re-run after every grid correction.
export function chartFromGrid(frames, timeScale, grid, opts = {}, fixedKey = null) {
  const o = { ...OPTION_DEFAULTS, ...opts };
  const t0 = now();
  const units = poolSegments(frames, beatSegments(grid.beats), timeScale);
  const prior = { priorOn: o.harmonyPrior, ...(o.decode || {}) };
  let key = fixedKey;
  if (!key) {
    const first = decodeChords(units, grid.numbers, grid.beatsPerBar, null, { ...prior, kappa: 0 });
    const segs = [];
    first.path.forEach((c, i) => segs.push({ chord: c, dur: units[i].t1 - units[i].t0 }));
    const chroma = new Array(12).fill(0);
    for (let f = 0; f < frames.T; f++) for (let k = 0; k < 12; k++) chroma[k] += frames.pitch[f * 12 + k];
    key = estimateKey(chroma, segs, o.key || {});
  }
  const dec = decodeChords(units, grid.numbers, grid.beatsPerBar, key.best, prior);
  const times = grid.beats.concat([beatSegments(grid.beats).at(-1)?.[1] ?? 0]);
  const segments = buildSegments(units, times, dec.path, dec.post);
  return { key, segments, path: dec.path, timing: now() - t0 };
}

export async function analyse(ort, sessions, { audio22, audio44 }, opts = {}, progress = () => {}) {
  const o = { ...OPTION_DEFAULTS, ...opts };
  const timings = {};
  let t = now();
  progress('tuning', 0);
  const tuning = estimateTuning(audio22, 22050);
  timings.tuning = now() - t;
  progress('beats', 0);
  const bs = await beatStage(ort, sessions, audio22, progress);
  Object.assign(timings, bs.timings);
  t = now();
  const g = gridFromActivations(bs.act, o);
  timings.postprocessing = now() - t;
  progress('chords', 0);
  const cs = await chordStage(ort, sessions, audio44, tuning, o);
  Object.assign(timings, cs.timings);
  const chart = chartFromGrid(cs.frames, cs.timeScale, g.grid, o);
  timings.chart = chart.timing;
  return {
    tuning, act: bs.act, grid: g.grid, meterScores: g.meterScores, tempo: tempoCurve(g.grid.beats),
    frames: cs.frames, timeScale: cs.timeScale, raw: rawSegments(cs.frames, cs.timeScale),
    key: chart.key, segments: chart.segments, timings,
  };
}
