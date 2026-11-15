// `app`: exactly what the app's analysis does (the worker's decoding step is
// `resultFromOutputs` of app/src/analysis/engine/analyse.ts, called here the
// same way): the mix, the bass line read on the mix's 40–300 Hz band, the
// repeats of the form, the known chart found by the title (when the playlists
// are in $BANC_DATA/recueils/), « doubtful » from the reliability model.
// With BANC_TIGES=ideales|reelles, also the separated parts, as the app does
// once a piece has been separated.

import type { KnownCharts } from '../../../../../app/src/analysis/engine/chart';
import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { findChartCandidates, referenceCharts } from '../../../../../app/src/analysis/engine/knownChart';
import { modelsFor } from '../../../../../app/src/analysis/models';
import { normalizeTitle } from '../../../../../app/src/standards/match';
import { lowAudio } from '../ecoute';
import { harmonyOf, stemsOf } from '../ecoute-variante';
import { standards } from '../structure/commun';
import type { Variant } from '../types';

export function knownFor(title: string): KnownCharts | null {
  const lib = standards();
  const candidates = title ? findChartCandidates(lib.index, title) : [];
  if (!candidates.length) return null;
  const own = new Set(candidates.map((c) => normalizeTitle(c.chart.title)));
  return { candidates, references: referenceCharts(lib.charts, 60, (c) => own.has(normalizeTitle(c.title))) };
}

const app: Variant = async (input, ctx) => {
  const net = await ctx.networks(input.mixPath);
  const o = net.outputs;
  const which = process.env.BANC_TIGES as 'ideales' | 'reelles' | undefined;
  const stems = which ? stemsOf(input, which) : {};
  const harmony = which ? await harmonyOf(input, o, stems) : null;
  const bass = stems.bass
    ? { low: await lowAudio({ paths: [stems.bass] }), from: 'stem' as const }
    : { low: await lowAudio({ paths: [input.mixPath], transform: 'bass' }), from: 'band' as const };
  const h = input.truthGrid;
  const result = resultFromOutputs({
    outputs: { ...o, listening: { harmony, bass } },
    grid: h ? { times: h.times, downbeat: h.downbeat, meter: { numerator: h.beatsPerBar, denominator: 4 } } : null,
    key: null,
    known: knownFor(input.title),
    duration: net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
};

export default app;
