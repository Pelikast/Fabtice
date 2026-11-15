// The bench variants of the chord-model candidates (banc/variantes/modele-*.ts are one-line
// re-exports of these). The model is chosen with the environment variable MODELE (a folder
// of data/modeles/, filled by modeles/bench_precompute.py); run each model with its own
// --out folder.
//
//   MODELE=jiang2019 node dist/run.mjs --variant modele-brut --out resultats/modeles/jiang2019
//
// - modele-brut : the model alone, its best label on every beat (mean log probability over
//                 the beat), extensions and bass as the label (or its bass head) says.
// - modele-app  : the model folded onto the app's 169 chords and decoded by the app's beat
//                 decoder with the jazz prior (chartFromGrid), in place of CREMA.
// - modele-mix  : log-linear mix with CREMA, weight MIX_W for the model (0..1), then the app's
//                 decoder.
// - modele-dec  : the model's own decoder (Tsumugi: precomputed segments).

import { N_CHORDS, type ChordFrames } from '../../../../../app/src/analysis/engine/chords';
import { chartFromGrid, gridFromActivations, gridFromHint } from '../../../../../app/src/analysis/engine/pipeline';
import { toAnalysisResult } from '../../../../../app/src/analysis/engine/result';
import type { MeterScore } from '../../../../../app/src/analysis/engine/meter';
import { modelsFor } from '../../../../../app/src/analysis/models';
import type { ChordSymbol } from '../../../../../app/src/model/harmony';
import type { NetworkResult } from '../../banc/networks';
import type { Variant, VariantChord, VariantInput, VariantOutput } from '../../banc/types';
import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { lowAudio } from '../../banc/ecoute';
import { knownFor } from '../../banc/variantes/app';
import { harteToSymbol, onGrid, pooledArgmax, pooledBass, readModel, toChordFrames, type ModelFrames } from './lire';

const MODEL = process.env.MODELE ?? '';

function need(input: VariantInput): ModelFrames {
  if (!MODEL) throw new Error('set MODELE');
  const m = readModel(MODEL, input.mixPath);
  if (!m) throw new Error(`${MODEL}: no precomputed output for ${input.id} ${input.condition} (run bench_precompute.py, or --only the subset)`);
  return m;
}

function gridOf(input: VariantInput, net: NetworkResult) {
  const hint = input.truthGrid ?? null;
  if (hint) return { grid: gridFromHint(hint.times, hint.downbeat, hint.beatsPerBar), meterScores: [] as MeterScore[], repairs: [] as ReturnType<typeof gridFromActivations>['repairs'] };
  const r = gridFromActivations(net.outputs.act);
  return { grid: r.grid, meterScores: r.meterScores, repairs: r.repairs };
}

function decodeWith(input: VariantInput, net: NetworkResult, frames: ChordFrames, timeScale: number): VariantOutput {
  const { grid, meterScores, repairs } = gridOf(input, net);
  const hint = input.truthGrid ?? null;
  const chart = chartFromGrid(frames, timeScale, grid, null);
  const result = toAnalysisResult({
    grid,
    downbeat: hint ? hint.downbeat : undefined,
    meterScores,
    gridIsHint: !!hint,
    key: chart.key,
    keyIsHint: false,
    tuning: net.outputs.tuning,
    segments: chart.segments,
    repairs,
    duration: net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
}

function beatsOut(grid: ReturnType<typeof gridOf>['grid']) {
  return { times: grid.beats, downbeat: Math.max(0, grid.numbers.indexOf(1)), beatsPerBar: grid.beatsPerBar };
}

function push(chords: VariantChord[], time: number, sym: ChordSymbol | null, p: number) {
  const last = chords[chords.length - 1];
  if (last && JSON.stringify(last.chord) === JSON.stringify(sym)) return;
  chords.push({ time, chord: sym, confidence: p, doubtful: p < 0.35 });
}

export const brut: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const m = need(input);
  const { grid } = gridOf(input, net);
  const b = grid.beats;
  const chords: VariantChord[] = [];
  b.forEach((t, i) => {
    const t1 = b[i + 1] ?? t + (t - (b[i - 1] ?? t - 0.5));
    const { index, p } = pooledArgmax(m, t, t1);
    let sym = harteToSymbol(m.labels[index]!);
    if (sym && sym.bass === null && m.bass) {
      const bass = pooledBass(m, t, t1);
      if (bass !== null && bass !== sym.root) sym = { ...sym, bass };
    }
    push(chords, t, sym, p);
  });
  return { chords, beats: beatsOut(grid) };
};

export const app: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  return decodeWith(input, net, toChordFrames(need(input)), 1);
};

export const mix: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const m = need(input);
  const w = Number(process.env.MIX_W ?? 0.5);
  const cr = net.outputs.frames;
  const ts = net.outputs.timeScale;
  const other = onGrid(m, cr.T, cr.fps, ts);
  // Optional second model: MODELE2 with weight MIX_W2 (CREMA then weighs 1 - MIX_W - MIX_W2).
  const m2 = process.env.MODELE2 ? readModel(process.env.MODELE2, input.mixPath) : null;
  if (process.env.MODELE2 && !m2) throw new Error(`${process.env.MODELE2}: no output for ${input.id}`);
  const w2 = m2 ? Number(process.env.MIX_W2 ?? 0) : 0;
  const other2 = m2 ? onGrid(m2, cr.T, cr.fps, ts) : null;
  const probs = new Float32Array(cr.T * N_CHORDS);
  for (let f = 0; f < cr.T; f++) {
    let s = 0;
    for (let c = 0; c < N_CHORDS; c++) {
      const i = f * N_CHORDS + c;
      let lv = (1 - w - w2) * Math.log(cr.probs[i]! + 1e-4) + w * Math.log(other[i]! + 1e-4);
      if (other2) lv += w2 * Math.log(other2[i]! + 1e-4);
      const v = Math.exp(lv);
      probs[i] = v;
      s += v;
    }
    for (let c = 0; c < N_CHORDS; c++) probs[f * N_CHORDS + c]! /= s;
  }
  let bass = cr.bass;
  if (m.bass && process.env.MIX_BASS !== '0') {
    bass = new Float32Array(cr.T * 13);
    for (let f = 0; f < cr.T; f++) {
      const time = (f + 0.5) / cr.fps / ts;
      const g = Math.max(0, Math.min(m.T - 1, Math.floor((time - m.t0) / m.hop)));
      for (let k = 0; k < 13; k++) bass[f * 13 + k] = (1 - w) * cr.bass[f * 13 + k]! + w * m.bass[g * 13 + k]!;
    }
  }
  return decodeWith(input, net, { T: cr.T, fps: cr.fps, probs, pitch: cr.pitch, bass }, ts);
};

export const dec: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const m = need(input);
  if (!m.segments) throw new Error(`${MODEL} has no decoded segments`);
  const { grid } = gridOf(input, net);
  const chords: VariantChord[] = [];
  for (const [s, , label] of m.segments) push(chords, Number(s), harteToSymbol(label), 1);
  return { chords, beats: beatsOut(grid) };
};

// ------------------------------------------------------------- on top of stage A
// The same as the bench variant `app` (resultFromOutputs: bass band, repeats, known chart,
// reliability), with the chord network's frames replaced:
// - modele-a   : by the model alone (folded onto the 169 chords);
// - modele-amix: by the log-linear mix CREMA^(1-w) * model^w on CREMA's frames (w = MIX_W).

async function stageA(input: VariantInput, net: NetworkResult, frames: ChordFrames, timeScale: number): Promise<VariantOutput> {
  const o = net.outputs;
  const bass = { low: await lowAudio({ paths: [input.mixPath], transform: 'bass' }), from: 'band' as const };
  const h = input.truthGrid;
  const result = resultFromOutputs({
    outputs: { ...o, frames, timeScale, listening: { harmony: null, bass } },
    grid: h ? { times: h.times, downbeat: h.downbeat, meter: { numerator: h.beatsPerBar, denominator: 4 } } : null,
    key: null,
    known: await knownFor(input.title),
    duration: net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
}

export const appAlone: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  return stageA(input, net, toChordFrames(need(input)), 1);
};

export const appMix: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const m = need(input);
  const w = Number(process.env.MIX_W ?? 0.5);
  const cr = net.outputs.frames;
  const ts = net.outputs.timeScale;
  const other = onGrid(m, cr.T, cr.fps, ts);
  const probs = new Float32Array(cr.T * N_CHORDS);
  for (let f = 0; f < cr.T; f++) {
    let s = 0;
    for (let c = 0; c < N_CHORDS; c++) {
      const i = f * N_CHORDS + c;
      const v = Math.exp((1 - w) * Math.log(cr.probs[i]! + 1e-4) + w * Math.log(other[i]! + 1e-4));
      probs[i] = v;
      s += v;
    }
    for (let c = 0; c < N_CHORDS; c++) probs[f * N_CHORDS + c]! /= s;
  }
  return stageA(input, net, { T: cr.T, fps: cr.fps, probs, pitch: cr.pitch, bass: cr.bass }, ts);
};
