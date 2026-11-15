// `app-fin`: what the app does with the optional fine chord model (Réglages avancés →
// Modèle d'accords → Détaillé): the worker's own steps, from the same engine functions —
// Tsumugi-Chords' outputs turned into ChordFrames by `engine/tsumugi.ts#tsumugiChordFrames`,
// then `resultFromOutputs` with them (bass band, repeats, known chart, reliability), as
// `app` does with CREMA's. The model's outputs come from the bench cache
// (data/modeles/tsumugi/<sha>.f32, written by modeles/bench_precompute.py with the beats and
// key the app detects); pieces without them are left out (run with --only the subset).

import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { tsumugiChordFrames } from '../../../../../app/src/analysis/engine/tsumugi';
import { CHORD_MODEL_ID, modelsFor } from '../../../../../app/src/analysis/models';
import { readModel } from '../../modeles/bench/lire';
import { lowAudio } from '../ecoute';
import type { Variant } from '../types';
import { knownFor } from './app';

const appFin: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const m = readModel('tsumugi', input.mixPath);
  if (!m || !m.bass || !m.pitch || m.C !== 745) throw new Error(`no fine-model output for ${input.id} ${input.condition} (bench_precompute.py --models tsumugi)`);
  const frames = tsumugiChordFrames({
    frames: m.T,
    detail: m.probs,
    bass: m.bass,
    tones: m.pitch,
    root: new Float32Array(m.T * 13),
    boundary: new Float32Array(m.T),
  });
  const o = net.outputs;
  const bass = { low: await lowAudio({ paths: [input.mixPath], transform: 'bass' }), from: 'band' as const };
  const h = input.truthGrid;
  const result = resultFromOutputs({
    outputs: { ...o, frames, timeScale: 1, listening: { harmony: null, bass } },
    grid: h ? { times: h.times, downbeat: h.downbeat, meter: { numerator: h.beatsPerBar, denominator: 4 } } : null,
    key: null,
    known: await knownFor(input.title),
    duration: net.duration,
    models: modelsFor('light').map((s) => (s.id === CHORD_MODEL_ID.crema ? CHORD_MODEL_ID.fine : s.id)),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
};

export default appFin;
