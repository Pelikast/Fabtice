// Check of the reader, the matcher and the transposer against REAL iReal Pro playlists. Off unless
// pointed at a folder that is OUTSIDE the repository (no playlist is ever committed):
//
//   FABTICE_IREAL_REAL_DIR=/tmp/playlists npx vitest run src/standards/irealRead.real --silent=false
//
// Every `.txt` / `.html` file of the folder is read; the test prints how many songs were read
// without a problem and fails only when a playlist reads worse than the bounds below. The matching
// check wants a `jazz1460.txt` in the folder.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chordText } from '../harmony/chord';
import { readIRealText, type StandardChart } from './irealRead';
import { buildTitleIndex, findTitle } from './match';
import { transposeChartToKey } from './transposeTo';

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
    expect(pl.skipped.length).toBeLessThanOrEqual(Math.ceil(pl.songs.length * 0.01));
  });

  const jazz = dir ? join(dir, 'jazz1460.txt') : '';
  it.skipIf(!existsSync(jazz))('finds standards of the real Jazz playlist from noisy titles, and transposes one', () => {
    const pl = readIRealText(readFileSync(jazz, 'utf8'));
    const t0 = performance.now();
    const index = buildTitleIndex(pl.songs.map((s) => ({ id: String(s.index), title: s.rawTitle, composer: s.composerRaw, data: s })));
    const built = Math.round(performance.now() - t0);
    const queries = [
      'Lester Young - All The Things You Are (1945) [Remastered]',
      'Les feuilles mortes',
      'Miles Davis - So What (Official Audio)',
      'Autumn Leaves - Live at Montreux',
      'Chet Baker - My Funny Valentine',
      'Stompin at the Savoy - Benny Goodman 1936',
      'Sonny Rollins - St. Thomas',
      'Garota de Ipanema',
      'Bill Evans - Waltz for Debby',
      'Take the A Train',
      'Never Gonna Give You Up',
    ];
    const t1 = performance.now();
    const rows = queries.map((q) => {
      const m = findTitle(index, q)[0];
      return `${q} -> ${m ? `${m.entry.title} (${m.score.toFixed(2)}, ${m.kind}${m.viaAlias ? ', alias' : ''})` : 'none'}`;
    });
    console.log(`index of ${pl.songs.length} titles in ${built} ms, ${queries.length} lookups in ${Math.round(performance.now() - t1)} ms\n${rows.join('\n')}`);
    const autumn = findTitle(index, 'Autumn Leaves')[0]!;
    const song = autumn.entry.data as StandardChart;
    const inC = transposeChartToKey(song, { tonic: 0, mode: 'minor' });
    console.log(song.title, song.keyText, `${song.bars.length} bars; in C minor:`, inC!.bars.slice(0, 4).map((b) => b.chords.map((c) => chordText(c.chord)).join(' ')).join(' | '));
    expect(song.bars.length).toBeGreaterThan(8);
  });
});
