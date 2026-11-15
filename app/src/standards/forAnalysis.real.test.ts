// Size and time of what the analysis receives, on REAL playlists kept outside the repository:
//
//   FABTICE_IREAL_REAL_DIR=/folder npx vitest run src/standards/forAnalysis.real --silent=false
//
// Every `.txt` of the folder becomes one collection of a memory library; prints the payload size and
// the time of a first (cold) and a repeated (warm) call. Off without the folder.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chartsForAnalysis, resetChartsForAnalysisCache } from './forAnalysis';
import { findStandard, resetLibraryCache } from './library';
import { MemoryCollectionStore } from './libraryStore';

const dir = process.env.FABTICE_IREAL_REAL_DIR;
const run = dir && existsSync(dir) ? describe : describe.skip;

run('charts for the analysis, real playlists', () => {
  it('measures payload and time', async () => {
    const store = new MemoryCollectionStore();
    for (const f of readdirSync(dir!).filter((x) => x.endsWith('.txt'))) {
      await store.put({ id: f, name: f, tunes: 0, source: `file:${f}`, date: '2026-11-15', links: readFileSync(join(dir!, f), 'utf8') });
    }
    resetLibraryCache();
    resetChartsForAnalysisCache();
    const rows: string[] = [];
    const ti = performance.now();
    await findStandard('warm the title index', { store });
    rows.push(`title index of the library (library.ts, once): ${(performance.now() - ti).toFixed(0)} ms`);
    for (const title of ['Bill Evans - Autumn Leaves (1959) [Remastered]', 'Quartet - so what - take 2', 'ALL THE THINGS YOU ARE | Official Audio', 'Autumn Leaves', 'Never Heard Of It']) {
      const t0 = performance.now();
      const r = await chartsForAnalysis(title, { store });
      const ms = performance.now() - t0;
      const t1 = performance.now();
      if (r) structuredClone(r);
      const clone = performance.now() - t1;
      const bytes = r ? JSON.stringify(r).length : 0;
      const cand = r ? JSON.stringify(r.candidates).length : 0;
      rows.push(`${title}: ${ms.toFixed(0)} ms, ${r ? `${r.candidates.length} candidates (${(cand / 1024).toFixed(1)} KiB), ${r.references.length} references, payload ${(bytes / 1024).toFixed(0)} KiB, structuredClone ${clone.toFixed(1)} ms` : 'null'}`);
    }
    console.log(rows.join('\n'));
    expect(rows).toHaveLength(6);
  });
});
