// `explorer`: a scratch variant for trying listening options from the command
// line (environment variables), before freezing the ones kept into named
// variants. E_SRC: mix | sans-batterie | oracle (diagnostic: reads the true
// harmony stems) ; E_MIXW: weight of the mix when it is pooled with E_SRC.

import { N_CHORDS, poolSegments, type PooledUnit } from '../../../../../app/src/analysis/engine/chords';
import { beatUnits, chartFromUnits, frameChroma } from '../../../../../app/src/analysis/engine/pipeline';
import { selectHarmony, stemFeatures, type StemFeatures } from '../../../../../app/src/analysis/engine/listen';
import { listen } from '../ecoute';
import { output, prepare } from '../lib';
import type { StemName, Variant } from '../types';

function blend(a: readonly PooledUnit[], b: readonly PooledUnit[], wa: number): PooledUnit[] {
  const wb = 1 - wa;
  return a.map((u, i) => {
    const v = b[i]!;
    const logp = new Float64Array(N_CHORDS);
    for (let c = 0; c < N_CHORDS; c++) logp[c] = wa * u.logp[c]! + wb * v.logp[c]!;
    return { ...u, logp, pitch: u.pitch.map((x, k) => wa * x + wb * v.pitch[k]!), bass: u.bass.map((x, k) => wa * x + wb * v.bass[k]!) };
  });
}

const explorer: Variant = async (input, ctx) => {
  const p = await prepare(input, ctx);
  const o = p.net.outputs;
  const segs = p.grid.beats.map((t, i, b) => [t, b[i + 1] ?? t + (i > 0 ? t - b[i - 1]! : 0.5)] as [number, number]);
  let units = poolSegments(o.frames, segs, o.timeScale);
  let chroma = frameChroma(o.frames);
  const src = process.env.E_SRC ?? 'mix';
  const stems = input.stemPaths;
  let pick: StemName[] = [];
  if (src === 'sans-batterie') pick = (Object.keys(stems) as StemName[]).filter((s) => s !== 'drums');
  if (src === 'oracle') pick = [...new Set([...(input.meta.harmonyStems as StemName[]), 'bass' as StemName])].filter((s) => stems[s]);
  if (src === 'oracle-sans-basse') pick = (input.meta.harmonyStems as StemName[]).filter((s) => stems[s]);
  if (src === 'selection' || src === 'selection-sans-basse') {
    const mixUnits = beatUnits(o.frames, o.timeScale, p.grid);
    const feats: Record<string, StemFeatures> = {};
    for (const [name, path] of Object.entries(stems) as [StemName, string][]) {
      if (name === 'drums' || name === 'bass') continue;
      const l = await listen({ paths: [path] }, o.tuning);
      feats[name] = stemFeatures(l.frames, l.rms, beatUnits(l.frames, l.timeScale, p.grid), mixUnits, p.grid.numbers);
    }
    pick = selectHarmony(feats) as StemName[];
    if (src === 'selection' && stems.bass) pick.push('bass');
  }
  if (pick.length) {
    const l = await listen({ paths: pick.map((s) => stems[s]!) }, o.tuning);
    const su = poolSegments(l.frames, segs, l.timeScale);
    const w = Number(process.env.E_MIXW ?? 0);
    units = w > 0 ? blend(units, su, w) : su;
    if (process.env.E_CHROMA === 'src') chroma = frameChroma(l.frames);
  }
  return output(input, p, chartFromUnits(units, p.grid, chroma, null));
};

export default explorer;
