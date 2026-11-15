// Check of the reader against REAL iReal Pro playlists. Off unless pointed at a folder that is
// OUTSIDE the repository (no playlist is ever committed):
//
//   FABTICE_IREAL_REAL_DIR=/tmp/playlists npx vitest run src/standards/irealRead.real
//
// Every `.txt` / `.html` file of the folder is read; the test prints how many songs were read
// without a problem and fails only when a playlist reads worse than the bounds below.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readIRealText } from './irealRead';

const dir = process.env.FABTICE_IREAL_REAL_DIR;
const run = dir && existsSync(dir) ? describe : describe.skip;

run('real playlists', () => {
  const files = dir && existsSync(dir) ? readdirSync(dir).filter((f) => /\.(txt|html?)$/i.test(f)) : [];
  it.each(files)('%s reads', (file) => {
    const t0 = performance.now();
    const pl = readIRealText(readFileSync(join(dir!, file), 'utf8'));
    const ms = Math.round(performance.now() - t0);
    const clean = pl.songs.filter((s) => s.warnings.length === 0).length;
    const approx = pl.songs.reduce((n, s) => n + s.bars.reduce((m, b) => m + b.chords.filter((c) => c.approximate).length, 0), 0);
    const chords = pl.songs.reduce((n, s) => n + s.bars.reduce((m, b) => m + b.chords.length, 0), 0);
    const warnCount = new Map<string, number>();
    for (const s of pl.songs) for (const w of s.warnings) warnCount.set(w.replace(/[«»].*$/, ''), (warnCount.get(w.replace(/[«»].*$/, '')) ?? 0) + 1);
    console.log(
      `${file}: name=${pl.name} songs=${pl.songs.length} skipped=${pl.skipped.length} withoutWarning=${clean} chords=${chords} approximate=${approx} ${ms} ms`,
      pl.skipped.slice(0, 5),
      [...warnCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    );
    expect(pl.songs.length).toBeGreaterThan(0);
  });
});
