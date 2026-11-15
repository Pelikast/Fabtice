// The « listening » variants, one factory: what the analysis listens to
// besides the mix (the separated parts that carry the harmony, the bass line)
// and how. Every named variant of banc/variantes/ that listens is one call.
//
// Stems: `ideales` are the corpus's own renders (rendered separately);
// `reelles` are what the app's separation (HTDemucs 6 sources) gives on the
// mix, made by banc/separer.ts into data/separes/ — a piece without them
// falls back to the mix alone (the variant says nothing about it: run it with
// --only on the separated pieces).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bassBeats } from '../../../../app/src/analysis/engine/bassline';
import { applyBassCue, blendUnits, selectHarmony, stemFeatures, type BassCueOptions, type StemFeatures } from '../../../../app/src/analysis/engine/listen';
import type { DecodeOptions } from '../../../../app/src/analysis/engine/decode';
import type { HarmonyListening } from '../../../../app/src/analysis/engine/chart';
import { beatUnits, chartFromUnits, frameChroma, gridFromActivations, type NetworkOutputs } from '../../../../app/src/analysis/engine/pipeline';
import { listen, lowAudio } from './ecoute';
import { output, prepare, segmentsOf } from './lib';
import { DATA } from './paths';
import type { StemName, Variant, VariantInput } from './types';

export interface ListeningConfig {
  /** Which parts make the remix the chord network hears besides the mix. */
  harmony: 'aucune' | 'selection' | 'oracle' | 'sans-batterie';
  /** Weight of the mix when pooled with the remix (0: the remix alone). */
  mixWeight: number;
  /** Where the bass line is read: the separated bass, the 40–300 Hz band of the mix, the stem when there is one else the band. */
  bass: 'aucune' | 'tige' | 'bande' | 'auto';
  bassOptions?: Partial<BassCueOptions>;
  stems?: StemSource;
  decode?: Partial<DecodeOptions>;
}

const ALL: StemName[] = ['drums', 'bass', 'piano', 'guitar', 'other', 'vocals'];

/** Ideal stems (rendered apart), or what one of the app's separation tools gives (`reelles` = HTDemucs). */
export type StemSource = 'ideales' | 'reelles' | 'htdemucs' | 'roformer';

export function stemsOf(input: VariantInput, which: StemSource): Partial<Record<StemName, string>> {
  if (which === 'ideales') return input.stemPaths;
  const tool = which === 'roformer' ? 'bs-roformer-sw' : 'htdemucs-6s';
  const dir = join(DATA, 'separes', tool, input.id, input.condition);
  if (!ALL.every((s) => existsSync(join(dir, `${s}.flac`)))) return {};
  return Object.fromEntries(ALL.map((s) => [s, join(dir, `${s}.flac`)]));
}

/**
 * As the app's worker does after a separation: the network on each part but
 * the drums and the bass, the harmony parts chosen from what it heard, then
 * the network on the remix of those parts and the bass. Null without stems.
 */
export async function harmonyOf(input: VariantInput, o: NetworkOutputs, stems: Partial<Record<StemName, string>>): Promise<HarmonyListening | null> {
  void input;
  const grid = gridFromActivations(o.act).grid;
  const mixUnits = beatUnits(o.frames, o.timeScale, grid);
  const feats: Record<string, StemFeatures> = {};
  for (const [name, path] of Object.entries(stems) as [StemName, string][]) {
    if (name === 'drums' || name === 'bass') continue;
    const l = await listen({ paths: [path] }, o.tuning);
    feats[name] = stemFeatures(l.frames, l.rms, beatUnits(l.frames, l.timeScale, grid), mixUnits, grid.numbers);
  }
  const pick = selectHarmony(feats) as StemName[];
  if (!pick.length) return null;
  if (stems.bass) pick.push('bass');
  const l = await listen({ paths: pick.map((s) => stems[s]!) }, o.tuning);
  return { frames: l.frames, timeScale: l.timeScale, stems: pick };
}

export function listening(cfg: ListeningConfig): Variant {
  return async (input, ctx) => {
    const p = await prepare(input, ctx);
    const o = p.net.outputs;
    let units = beatUnits(o.frames, o.timeScale, p.grid);
    const mixUnits = units;
    const stems = stemsOf(input, cfg.stems ?? 'ideales');
    let pick: StemName[] = [];
    if (cfg.harmony === 'sans-batterie') pick = (Object.keys(stems) as StemName[]).filter((s) => s !== 'drums');
    if (cfg.harmony === 'oracle') pick = [...new Set([...(input.meta.harmonyStems as StemName[]), 'bass' as StemName])].filter((s) => stems[s]);
    if (cfg.harmony === 'selection') {
      const feats: Record<string, StemFeatures> = {};
      for (const [name, path] of Object.entries(stems) as [StemName, string][]) {
        if (name === 'drums' || name === 'bass') continue;
        const l = await listen({ paths: [path] }, o.tuning);
        feats[name] = stemFeatures(l.frames, l.rms, beatUnits(l.frames, l.timeScale, p.grid), mixUnits, p.grid.numbers);
      }
      pick = selectHarmony(feats) as StemName[];
      if (pick.length && stems.bass) pick.push('bass');
    }
    if (pick.length) {
      const l = await listen({ paths: pick.map((s) => stems[s]!) }, o.tuning);
      const hu = beatUnits(l.frames, l.timeScale, p.grid);
      units = cfg.mixWeight > 0 ? blendUnits(units, hu, cfg.mixWeight) : hu;
    }
    const bassFrom = cfg.bass === 'auto' ? (stems.bass ? 'tige' : 'bande') : cfg.bass;
    if (bassFrom === 'tige' && stems.bass) {
      const b = bassBeats(await lowAudio({ paths: [stems.bass] }), segmentsOf(p.grid), o.tuning.cents);
      units = applyBassCue(units, b, p.grid.numbers, p.grid.beatsPerBar, cfg.bassOptions);
    } else if (bassFrom === 'bande') {
      const b = bassBeats(await lowAudio({ paths: [input.mixPath], transform: 'bass' }), segmentsOf(p.grid), o.tuning.cents);
      units = applyBassCue(units, b, p.grid.numbers, p.grid.beatsPerBar, cfg.bassOptions);
    }
    return output(input, p, chartFromUnits(units, p.grid, frameChroma(o.frames), null, cfg.decode));
  };
}
