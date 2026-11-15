// `diag-basse`: a diagnostic for the bass cue. Same output as `base`; on the
// side, beat by beat, the bass distribution read several ways, written to
// data/diag/basse.jsonl, to be compared with the truth afterwards:
//   tete, bandeTete, tigeTete   the chord network's bass head (mix, 40–300 Hz band, separated bass)
//   bande, tige                 the chord network's pitch output (band, separated bass)
//   dspMix, dspBande, dspTige   harmonic summation (engine/bassline.ts) on the mix, the band, the bass
// Measured (dev half, true grid): the network's pitch output on a bass alone
// finds the root on a quarter of the beats only; harmonic summation on the
// separated bass finds it on 9 first beats out of 10.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bassBeats } from '../../../../../app/src/analysis/engine/bassline';
import type { PooledUnit } from '../../../../../app/src/analysis/engine/chords';
import { beatUnits, chartFromGrid } from '../../../../../app/src/analysis/engine/pipeline';
import { listen, lowAudio } from '../ecoute';
import { output, prepare, segmentsOf } from '../lib';
import { DATA } from '../paths';
import type { Variant } from '../types';

const r3 = (a: ArrayLike<number>) => Array.from(a, (v) => Math.round(v * 1000) / 1000);

function line(units: readonly PooledUnit[], source: 'pitch' | 'bass'): number[][] {
  return units.map((u) => {
    const q = Array.from({ length: 12 }, (_, k) => (source === 'pitch' ? u.pitch[k]! : u.bass[k]!) ** 2);
    const s = q.reduce((a, b) => a + b, 0) || 1;
    return r3(q.map((v) => v / s));
  });
}

const diag: Variant = async (input, ctx) => {
  const p = await prepare(input, ctx);
  const o = p.net.outputs;
  const lines: Record<string, number[][]> = {};
  lines.tete = line(beatUnits(o.frames, o.timeScale, p.grid), 'bass');
  const band = await listen({ paths: [input.mixPath], transform: 'bass' }, o.tuning);
  lines.bande = line(beatUnits(band.frames, band.timeScale, p.grid), 'pitch');
  lines.bandeTete = line(beatUnits(band.frames, band.timeScale, p.grid), 'bass');
  if (input.stemPaths.bass) {
    const l = await listen({ paths: [input.stemPaths.bass] }, o.tuning);
    lines.tige = line(beatUnits(l.frames, l.timeScale, p.grid), 'pitch');
    lines.tigeTete = line(beatUnits(l.frames, l.timeScale, p.grid), 'bass');
  }
  const segs = segmentsOf(p.grid);
  const cents = o.tuning.cents;
  lines.dspBande = bassBeats(await lowAudio({ paths: [input.mixPath], transform: 'bass' }), segs, cents).map((b) => r3(b.pcs));
  lines.dspMix = bassBeats(await lowAudio({ paths: [input.mixPath] }), segs, cents).map((b) => r3(b.pcs));
  if (input.stemPaths.bass) lines.dspTige = bassBeats(await lowAudio({ paths: [input.stemPaths.bass] }), segs, cents).map((b) => r3(b.pcs));
  mkdirSync(join(DATA, 'diag'), { recursive: true });
  appendFileSync(join(DATA, 'diag', 'basse.jsonl'), JSON.stringify({ id: input.id, condition: input.condition, beats: p.grid.beats, numbers: p.grid.numbers, lines }) + '\n');
  return output(input, p, chartFromGrid(o.frames, o.timeScale, p.grid, null));
};

export default diag;
