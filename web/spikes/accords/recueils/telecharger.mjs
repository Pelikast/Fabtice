// Fetches the verified public mirrors of the iReal Pro playlists listed in
// app/src/standards/collections.json (pinned revisions) into
// $BANC_DATA/recueils/ (default: data/recueils/ of the bench). Data only, never
// committed (data/ is ignored). Already fetched files are kept.
//
//   node recueils/telecharger.mjs

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bench = join(here, '..');
const data = process.env.BANC_DATA ?? join(bench, 'data');
const out = join(data, 'recueils');
const list = JSON.parse(readFileSync(join(bench, '../../../app/src/standards/collections.json'), 'utf8'));

mkdirSync(out, { recursive: true });
const wanted = new Set(['jazz-1460', 'latin-50', 'blues-50']);
for (const c of list.collections) {
  if (!wanted.has(c.id)) continue;
  const page = c.pages.find((p) => p.verified && p.kind === 'ireal-url-file' && p.url.startsWith('https://raw.githubusercontent.com/'));
  if (!page) {
    console.log(`${c.id}: no verified mirror`);
    continue;
  }
  const file = join(out, `${c.id}.txt`);
  if (existsSync(file) && statSync(file).size > 1000) {
    console.log(`${c.id}: already there`);
    continue;
  }
  let body = null;
  for (let attempt = 0; attempt < 4 && body === null; attempt++) {
    const r = await fetch(page.url);
    if (r.ok) body = Buffer.from(await r.arrayBuffer());
    else await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  if (!body) throw new Error(`${c.id}: download failed`);
  writeFileSync(file, body);
  console.log(`${c.id}: ${body.length} bytes, sha256 ${createHash('sha256').update(body).digest('hex')}`);
}
