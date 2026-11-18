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
import { beatUnits, chartFromGrid, gridFromActivations, gridFromHint } from '../../../../../app/src/analysis/engine/pipeline';
import { toAnalysisResult } from '../../../../../app/src/analysis/engine/result';
import type { MeterScore } from '../../../../../app/src/analysis/engine/meter';
import { modelsFor } from '../../../../../app/src/analysis/models';
import type { ChordSymbol } from '../../../../../app/src/model/harmony';
import type { NetworkResult } from '../../banc/networks';
import type { Variant, VariantChord, VariantInput, VariantOutput } from '../../banc/types';
import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { listen, lowAudio } from '../../banc/ecoute';
import { knownFor } from '../../banc/variantes/app';
import { HAND, type HandHint } from '../../../../../app/src/analysis/engine/hand';
import type { HarmonyListening, KnownCharts } from '../../../../../app/src/analysis/engine/chart';
import { engineIndex } from '../../../../../app/src/analysis/engine/knownChart';
import { chordAt, loadCorpus, type TruthChord } from '../../banc/truth';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { selectHarmony, stemFeatures, type StemFeatures } from '../../../../../app/src/analysis/engine/listen';
import { stemsOf, type StemSource } from '../../banc/ecoute-variante';
import { DATA } from '../../banc/paths';
import type { StemName } from '../../banc/types';
import type { AnalysisResult } from '../../../../../app/src/model/analysis';
import { tsumugiFrames } from './tsumugiApp';
import { sheetsage2ChordFrames } from '../../../../../app/src/analysis/engine/sheetsage2';
import { SS2_LABELS } from '../../../../../app/src/analysis/engine/sheetsage2Vocab';
import { COMBINE_AGREEMENT, COMBINE_WEIGHTS, combineFrames } from '../../../../../app/src/analysis/engine/combine';
import { audioSha, harteToSymbol, onGrid, pooledArgmax, pooledBass, readModel, toChordFrames, type ModelFrames } from './lire';

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

async function appResult(input: VariantInput, net: NetworkResult, frames: ChordFrames, timeScale: number, hand?: HandHint[], harmony: HarmonyListening | null = null): Promise<AnalysisResult> {
  const o = net.outputs;
  const bass = { low: await lowAudio({ paths: [input.mixPath], transform: 'bass' }), from: 'band' as const };
  const h = input.truthGrid;
  return resultFromOutputs({
    outputs: { ...o, frames, timeScale, listening: { harmony, bass } },
    settings: process.env.MIX_WEIGHT ? { mixWeight: Number(process.env.MIX_WEIGHT) } : undefined,
    grid: h ? { times: h.times, downbeat: h.downbeat, meter: { numerator: h.beatsPerBar, denominator: 4 } } : null,
    key: null,
    known: await withHand(await knownFor(input.title), hand),
    duration: net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
}

async function stageA(input: VariantInput, net: NetworkResult, frames: ChordFrames, timeScale: number, hand?: HandHint[], harmony: HarmonyListening | null = null): Promise<VariantOutput> {
  const result = await appResult(input, net, frames, timeScale, hand, harmony);
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
}

/**
 * The fine model's frames for `audio` (the mix, or a remix of its parts). MODELE=app: the app's own
 * code run here (`tsumugiApp.ts`), fed the beats and key of the first decoding of the mix (CREMA),
 * as the worker does; otherwise the outputs precomputed by bench_precompute.py.
 */
async function fineFrames(input: VariantInput, net: NetworkResult, audio = input.mixPath): Promise<ChordFrames | null> {
  if (MODEL !== 'app') {
    const m = readModel(MODEL, audio);
    if (!m && audio === input.mixPath) need(input);
    return m ? toChordFrames(m) : null;
  }
  const first = await appResult(input, net, net.outputs.frames, net.outputs.timeScale);
  return tsumugiFrames(audio, first, net.duration);
}

async function withHand(known: KnownCharts | null, hand?: HandHint[]): Promise<KnownCharts | null> {
  if (!hand?.length) return known;
  return { ...(known ?? { candidates: [], references: [] }), hand };
}

/** The chord sounding at time `t` (chords sorted by time). */
function chordAtTime(chords: VariantChord[], t: number): VariantChord | null {
  let cur: VariantChord | null = null;
  for (const c of chords) {
    if (c.time <= t + 1e-6) cur = c;
    else break;
  }
  return cur;
}

const sameColour = (a: ChordSymbol | null, b: TruthChord) => !!a && a.root === b.root && a.quality === b.quality;

/**
 * Corrections by hand, simulated (1.0.1, `hand.ts`): a user who corrects, in the first chorus,
 * every bar where the analysis is wrong (root or colour), writing the true chords. Then the
 * analysis runs again with those chords as hints (HAND_HINTS=0: not given, the chart only shows
 * them over the analysis, as before 1.0.1); the output shows the hand chords on their bars, as
 * the app's chart does. HAND_CHORUSES: how many choruses the user corrects (default 1).
 */
export const appHand: Variant = async (input, ctx) => {
  // HAND_OWN / HAND_PARTNER / HAND_EXACT: the weights of `hand.ts#HAND`, for the sweep.
  if (process.env.HAND_OWN) HAND.own = Number(process.env.HAND_OWN);
  if (process.env.HAND_PARTNER) HAND.partner = Number(process.env.HAND_PARTNER);
  if (process.env.HAND_EXACT) HAND.exact = Number(process.env.HAND_EXACT);
  const net = await ctx.networks(input.mixPath);
  const frames = (await fineFrames(input, net))!;
  const first = await stageA(input, net, frames, 1);
  const truth = loadCorpus().find((t) => t.id === input.id);
  if (!truth) throw new Error(`no truth for ${input.id}`);
  const s = truth.conditions[input.condition]!.timeScale;
  const upTo = Number(process.env.HAND_CHORUSES ?? 1);
  const chords = [...first.chords].sort((a, b) => a.time - b.time);
  const hand: { time: number; end: number; chord: ChordSymbol }[] = [];
  for (const bar of truth.bars) {
    if (bar.chorus > upTo) continue;
    const ends = bar.beats.slice(1).concat([bar.end]);
    const wrong = bar.beats.some((b0, j) => !sameColour(chordAtTime(chords, ((b0 + ends[j]!) / 2) * s)?.chord ?? null, chordAt(bar, j + 1)));
    if (!wrong) continue;
    bar.chords.forEach((c, k) => {
      const next = bar.chords[k + 1];
      const t0 = bar.beats[c.beat - 1]! * s;
      const t1 = (next ? bar.beats[next.beat - 1]! : bar.end) * s;
      hand.push({ time: t0, end: t1, chord: { root: c.root, quality: c.quality, extensions: c.extensions, bass: c.bass } as ChordSymbol });
    });
  }
  // In the app a chord written by hand sits on a beat of the grid in force: snap to the detected beats.
  const grid = first.beats?.times ?? [];
  const snap = (t: number) => grid.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), grid[0] ?? t);
  for (const h of hand) {
    h.time = snap(h.time);
    h.end = snap(h.end);
  }
  const hints: HandHint[] = hand.filter((h) => h.end > h.time).map((h) => ({ time: h.time, chord: engineIndex(h.chord) }));
  const out = process.env.HAND_HINTS === '0' || !hints.length ? first : await stageA(input, net, frames, 1, hints);
  // The chart: the hand chords over the analysis on their bars.
  let merged = [...out.chords].sort((a, b) => a.time - b.time);
  for (const h of hand) {
    const resume = chordAtTime(merged, h.end + 1e-4);
    merged = merged.filter((c) => c.time < h.time - 1e-6 || c.time >= h.end - 1e-6);
    merged.push({ time: h.time, chord: h.chord, confidence: 1, doubtful: false });
    if (resume && !merged.some((c) => Math.abs(c.time - h.end) < 1e-6)) merged.push({ ...resume, time: h.end });
    merged.sort((a, b) => a.time - b.time);
  }
  return { ...out, chords: merged };
};

/**
 * Step 5 of 1.0.1: chords on the separated instruments, with the fine model. CREMA (fast) on each
 * real stem chooses the harmony parts (`listen.ts#selectHarmony`), as the app would; their remix
 * with the bass (data/remix/<tool>/<piece>/<condition>.flac) gets ONE Tsumugi pass
 * (bench_precompute.py --remix), pooled with the whole piece (`CHART_SETTINGS.mixWeight`,
 * MIX_WEIGHT=…). Without the remix's Tsumugi output yet: TIGES_PREP=1 writes the remix and its
 * grid and returns stage A alone, else it fails. BANC_TIGES: htdemucs (default) or roformer.
 */
export const appStems: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const frames = (await fineFrames(input, net))!;
  const which = (process.env.BANC_TIGES ?? 'htdemucs') as StemSource;
  const stems = stemsOf(input, which);
  if (!Object.keys(stems).length) throw new Error(`no ${which} stems for ${input.id} ${input.condition}`);
  const o = net.outputs;
  const grid = gridFromActivations(o.act).grid;
  const mixUnits = beatUnits(o.frames, o.timeScale, grid);
  const feats: Record<string, StemFeatures> = {};
  for (const [name, path] of Object.entries(stems) as [StemName, string][]) {
    if (name === 'drums' || name === 'bass') continue;
    const l = await listen({ paths: [path] }, o.tuning);
    feats[name] = stemFeatures(l.frames, l.rms, beatUnits(l.frames, l.timeScale, grid), mixUnits, grid.numbers);
  }
  const pick = selectHarmony(feats) as StemName[];
  if (!pick.length) return stageA(input, net, frames, 1);
  if (stems.bass) pick.push('bass');
  const dir = join(DATA, 'remix', which, input.id);
  const remix = join(dir, `${input.condition}.flac`);
  const tag = join(dir, `${input.condition}.json`);
  const same = existsSync(tag) && JSON.parse(readFileSync(tag, 'utf8')).stems.join() === pick.join();
  if (!same) {
    mkdirSync(dir, { recursive: true });
    const args = ['-v', 'error', '-y'];
    for (const st of pick) args.push('-i', stems[st]!);
    // Mono, as the app would hand the worker its parts (memory: one channel per part).
    args.push('-filter_complex', `amix=inputs=${pick.length}:normalize=0`, '-ac', '1', '-c:a', 'flac', '-sample_fmt', 's16', remix);
    execFileSync('ffmpeg', args);
    writeFileSync(tag, JSON.stringify({ stems: pick }));
    // Tsumugi on the remix gets the beats and key of the whole piece, as in the app.
    const gdir = join(DATA, 'modeles', 'app-grid');
    copyFileSync(join(gdir, `${audioSha(input.mixPath)}.json`), join(gdir, `${audioSha(remix)}.json`));
  }
  appendFileSync(join(DATA, 'remix', 'liste.txt'), `${remix}\n`);
  const r = await fineFrames(input, net, remix);
  if (!r) {
    if (process.env.TIGES_PREP === '1') return stageA(input, net, frames, 1);
    throw new Error(`no ${MODEL} output for the remix of ${input.id} ${input.condition}`);
  }
  const harmony: HarmonyListening = { frames: r, timeScale: 1, stems: pick };
  const out = await stageA(input, net, frames, 1, undefined, harmony);
  console.error(`  ${input.id} ${input.condition}: ${pick.join('+')}`);
  return out;
};

export const appAlone: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  return stageA(input, net, (await fineFrames(input, net))!, 1);
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

// ------------------------------------------------------------- 1.0.2: SheetSage2
// SheetSage2's chords from the authors' PyTorch run (modeles/dump_sheetsage2.py, data/modeles/
// sheetsage2/<id>.<condition>.json: the events and, at each chord, its probabilities), turned into
// ChordFrames by the app's own `sheetsage2ChordFrames` (the app's TypeScript gives the same tokens:
// modeles/ts/ss2-parity.ts), then the app's decoding (stage A), as the worker does.
// - ss2-seul : SheetSage2 alone;
// - ss2-combi: the combination of the app (`engine/combine.ts`): Tsumugi (MODELE=tsumugi, the
//              precomputed outputs, or MODELE=app) and SheetSage2 vote the chord with the weights
//              SS2_W and TS_W (default: the app's `COMBINE_WEIGHTS`), Tsumugi's notes, bass and
//              extensions kept.

function ss2Frames(input: VariantInput): ChordFrames {
  const path = join(DATA, 'modeles', 'sheetsage2', `${input.id}.${input.condition}.json`);
  if (!existsSync(path)) throw new Error(`no SheetSage2 output for ${input.id} ${input.condition} (dump_sheetsage2.py)`);
  const d = JSON.parse(readFileSync(path, 'utf8')) as { duration: number; events: { time: number; chord?: string }[]; chords: { label: string; probs: number[] }[] };
  const withChord = d.events.filter((e) => e.chord !== undefined);
  if (withChord.length !== d.chords.length) throw new Error(`SheetSage2 output of ${input.id}: events and chords do not match`);
  const chords = withChord.map((e, k) => ({ time: e.time, label: SS2_LABELS.indexOf(e.chord!), probs: Float32Array.from(d.chords[k]!.probs) }));
  return sheetsage2ChordFrames({ duration: d.duration, chords, tokens: [] });
}

export const ss2Alone: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  return stageA(input, net, ss2Frames(input), 1);
};

export const ss2Combined: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const ts = (await fineFrames(input, net))!;
  const w = { sheetsage2: Number(process.env.SS2_W ?? COMBINE_WEIGHTS.sheetsage2), tsumugi: Number(process.env.TS_W ?? COMBINE_WEIGHTS.tsumugi) };
  // AGREE_DOUBT=0 / AGREE_DROP=0: without the owner's rule (doubtful, no extensions where the models disagree).
  if (process.env.AGREE_DOUBT) COMBINE_AGREEMENT.doubt = process.env.AGREE_DOUBT !== '0';
  if (process.env.AGREE_DROP) COMBINE_AGREEMENT.dropExtensions = process.env.AGREE_DROP !== '0';
  return stageA(input, net, combineFrames(ts, ss2Frames(input), w), 1);
};
