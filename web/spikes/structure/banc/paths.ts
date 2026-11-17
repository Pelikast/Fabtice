// Where the structure bench keeps things (data/ is re-created, never committed).
// The chords bench's code, bundled here, finds the same root (its `paths.ts`
// looks for the nearest folder with a package.json and a banc/ folder).

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function benchRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(d, 'package.json')) || !existsSync(join(d, 'banc'))) {
    const up = dirname(d);
    if (up === d) throw new Error('bench folder not found');
    d = up;
  }
  return d;
}

export const ROOT = benchRoot();
export const DATA = process.env.BANC_DATA ?? join(ROOT, 'data');
export const CORPUS = join(DATA, 'corpus');
export const VERITES = join(ROOT, 'verites');
export const RESULTS = join(ROOT, 'resultats');
