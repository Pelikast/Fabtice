// Where the bench keeps things. Everything under data/ is re-created by the
// prepare scripts and never committed.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The bench folder: the nearest parent that holds the bench's package.json. */
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
export const RESULTS = join(ROOT, 'resultats');
