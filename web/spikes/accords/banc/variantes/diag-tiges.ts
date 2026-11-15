// `diag-tiges`: a diagnostic for the harmony-stem selector. Same output as
// `base`; on the side, for every stem of the piece, the features the selector
// may use (written to data/diag/tiges.jsonl with the truth's harmony stems,
// for scoring the selector only).

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stemFeatures } from '../../../../../app/src/analysis/engine/listen';
import { beatUnits, chartFromGrid } from '../../../../../app/src/analysis/engine/pipeline';
import { listen } from '../ecoute';
import { stemsOf } from '../ecoute-variante';
import { output, prepare } from '../lib';
import { DATA } from '../paths';
import type { StemName, Variant } from '../types';

const diag: Variant = async (input, ctx) => {
  const p = await prepare(input, ctx);
  const o = p.net.outputs;
  const mixUnits = beatUnits(o.frames, o.timeScale, p.grid);
  const rows: Record<string, unknown>[] = [];
  const stems = process.env.BANC_TIGES === 'reelles' ? stemsOf(input, 'reelles') : input.stemPaths;
  for (const [name, path] of Object.entries(stems) as [StemName, string][]) {
    if (name === 'drums') continue;
    const l = await listen({ paths: [path] }, o.tuning);
    const f = stemFeatures(l.frames, l.rms, beatUnits(l.frames, l.timeScale, p.grid), mixUnits, p.grid.numbers);
    rows.push({ stem: name, ...f });
  }
  if (rows.length) {
    mkdirSync(join(DATA, 'diag'), { recursive: true });
    appendFileSync(
      join(DATA, 'diag', 'tiges.jsonl'),
      JSON.stringify({ id: input.id, condition: input.condition, stems: process.env.BANC_TIGES ?? 'ideales', truth: input.meta.harmonyStems, rows }) + '\n',
    );
  }
  return output(input, p, chartFromGrid(o.frames, o.timeScale, p.grid, null));
};

export default diag;
