// `app`: exactly what the app's analysis does (the worker's decoding step is
// `resultFromOutputs` of app/src/analysis/engine/analyse.ts, called here the
// same way): the mix, the bass line read on the mix's 40–300 Hz band, the
// repeats of the form, the known chart found by the title (when the playlists
// are in $BANC_DATA/recueils/), « doubtful » from the reliability model.
// With BANC_TIGES=ideales|reelles, also the separated parts, as the app does
// once a piece has been separated.

import type { KnownCharts } from '../../../../../app/src/analysis/engine/chart';
import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chartsForAnalysis } from '../../../../../app/src/standards/forAnalysis';
import { MemoryCollectionStore } from '../../../../../app/src/standards/libraryStore';
import { DATA } from '../paths';
import { modelsFor } from '../../../../../app/src/analysis/models';
import { lowAudio } from '../ecoute';
import { harmonyOf, stemsOf } from '../ecoute-variante';
import type { Variant } from '../types';

let store: MemoryCollectionStore | null = null;

/** The playlists of $BANC_DATA/recueils/ as the app keeps them (one record per collection, its links). */
function libraryStore(): MemoryCollectionStore {
  if (store) return store;
  store = new MemoryCollectionStore();
  const dir = join(DATA, 'recueils');
  const names: Record<string, string> = { 'jazz-1460': 'Jazz 1460', 'blues-50': 'Blues 50', 'latin-50': 'Latin 50' };
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
      const id = f.replace(/\.txt$/, '');
      const links = readFileSync(join(dir, f), 'utf8');
      void store.put({ id, name: names[id] ?? id, tunes: (links.match(/irealb:\/\//g) ?? []).length, source: `file:${f}`, date: '2026-11-15', links });
    }
  }
  return store;
}

/** Exactly what the app's runner hands the worker: `chartsForAnalysis(title)`, then a structured clone (the message). */
export async function knownFor(title: string): Promise<KnownCharts | null> {
  const r = await chartsForAnalysis(title, { store: libraryStore() });
  if (!r || !r.candidates.length) return null;
  return structuredClone({ candidates: r.candidates, references: r.references });
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
    known: await knownFor(input.title),
    duration: net.duration,
    models: modelsFor('light').map((m) => m.id),
  });
  if (process.env.BANC_DEBUG) process.stderr.write(`${input.id} ${input.condition}: ${JSON.stringify((result as { evidence?: unknown }).evidence)}\n`);
  return {
    chords: result.chords.map((c) => ({ time: c.time, chord: c.chord, confidence: c.confidence, doubtful: c.doubtful })),
    beats: { times: result.beats.times, downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : undefined,
  };
};

export default app;
