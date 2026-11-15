// `app`: exactly what the app's analysis does (the worker's decoding step is
// `resultFromOutputs` of app/src/analysis/engine/analyse.ts, called here the
// same way): the mix, the bass line read on the mix's 40–300 Hz band, the
// repeats of the form, the known chart found by the title (when the playlists
// are in $BANC_DATA/recueils/), « doubtful » from the reliability model.
// With BANC_TIGES=ideales|htdemucs|roformer, also the separated parts (BANC_HARMONIE=selection:
// the harmony parts chosen by `selectHarmony`, remixed with the bass; sans-batterie: the mix
// minus the separated drums; aucune), and the bass cue from the separated bass (BANC_BASSE=tige,
// or bande: the mix's band as without separation).

import type { KnownCharts } from '../../../../../app/src/analysis/engine/chart';
import { resultFromOutputs } from '../../../../../app/src/analysis/engine/analyse';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chartsForAnalysis } from '../../../../../app/src/standards/forAnalysis';
import { MemoryCollectionStore } from '../../../../../app/src/standards/libraryStore';
import { DATA } from '../paths';
import { modelsFor } from '../../../../../app/src/analysis/models';
import { listen, lowAudio } from '../ecoute';
import type { HarmonyListening } from '../../../../../app/src/analysis/engine/chart';
import { harmonyOf, stemsOf, type StemSource } from '../ecoute-variante';
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
  const which = process.env.BANC_TIGES as StemSource | undefined;
  const stems = which ? stemsOf(input, which) : {};
  const mode = process.env.BANC_HARMONIE ?? 'selection';
  let harmony: HarmonyListening | null = null;
  if (which && mode === 'selection') harmony = await harmonyOf(input, o, stems);
  if (which && mode === 'sans-batterie' && stems.drums) {
    // Everything but the drums: the mix minus the separated drums (no selector, no trust in the labels).
    const l = await listen({ paths: [input.mixPath, stems.drums], gains: [1, -1] }, o.tuning);
    harmony = { frames: l.frames, timeScale: l.timeScale, stems: [] };
  }
  const bassFrom = process.env.BANC_BASSE ?? 'tige';
  const bass = stems.bass && bassFrom === 'tige'
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
