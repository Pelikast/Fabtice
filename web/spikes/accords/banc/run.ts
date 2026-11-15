// The bench: runs a variant on the corpus and writes its scores.
//
//   node dist/run.mjs [--variant base] [--grid both|detected|truth]
//                     [--conditions propre,disque,reel,reel-disque] [--only id1,id2]
//                     [--out resultats] [--dump]
//
// A variant is banc/variantes/<name>.ts (see types.ts). Results go to
// resultats/<name>.json and resultats/<name>.md (or --out).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { networks } from './networks';
import { DATA, ROOT, RESULTS } from './paths';
import { report } from './report';
import { addCounts, emptyCounts, rates, scorePiece, type Counts } from './score';
import { loadCorpus, truthGrid } from './truth';
import type { Variant, VariantInput } from './types';

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i]!.replace(/^--/, '');
    const v = a[i + 1] && !a[i + 1]!.startsWith('--') ? a[++i]! : 'true';
    out[k] = v;
  }
  return out;
}

const opt = args();
const name = opt.variant ?? 'base';
const grids = opt.grid === 'detected' ? ['detected'] : opt.grid === 'truth' ? ['truth'] : ['detected', 'truth'];
const wanted = opt.conditions ? opt.conditions.split(',') : null;
const only = opt.only ? new Set(opt.only.split(',')) : null;
const outDir = opt.out ? resolve(process.cwd(), opt.out) : RESULTS;

/** The fixed dev / held-out split (banc/partage.json): tune on dev only. */
const partage = JSON.parse(readFileSync(join(ROOT, 'banc', 'partage.json'), 'utf8')) as { dev: string[]; test: string[] };
const inList = (id: string, list: string[]) => list.some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : p === id));
export const splitOf = (id: string): 'dev' | 'test' => (inList(id, partage.dev) ? 'dev' : inList(id, partage.test) ? 'test' : (() => { throw new Error(`${id} is in no split`); })());
const wantedSplit = opt.split && opt.split !== 'all' ? opt.split : null;

const mod = (await import(pathToFileURL(join(ROOT, 'dist', 'variantes', `${name}.mjs`)).href)) as { default: Variant };
const variant = mod.default;
const corpus = loadCorpus().filter((t) => (!only || only.has(t.id)) && (!wantedSplit || splitOf(t.id) === wantedSplit));
if (!corpus.length) {
  console.error('Corpus vide : lancer d’abord la préparation (voir README).');
  process.exit(1);
}

export interface PieceScore {
  id: string;
  title: string;
  style: string;
  source: string;
  condition: string;
  grid: string;
  counts: Counts;
}

const started = Date.now();
const scores: PieceScore[] = [];
let networkSeconds = 0;
let fresh = 0;
const ctx = {
  async networks(path: string) {
    const t = Date.now();
    const r = await networks(path);
    if (!r.cached) {
      fresh++;
      networkSeconds += (Date.now() - t) / 1000;
    }
    return r;
  },
};

for (const t of corpus) {
  for (const condition of Object.keys(t.conditions)) {
    if (wanted && !wanted.includes(condition)) continue;
    const c = t.conditions[condition]!;
    for (const grid of grids) {
      const input: VariantInput = {
        id: t.id,
        condition,
        mixPath: join(t.dir, c.mix),
        stemPaths: Object.fromEntries(Object.entries(c.stems).map(([k, v]) => [k, join(t.dir, v!)])),
        title: t.title,
        meta: { style: t.style, source: t.source, harmonyStems: t.harmonyStems, stems: t.stems, meter: t.meter },
      };
      if (grid === 'truth') input.truthGrid = truthGrid(t, condition);
      const out = await variant(input, ctx);
      const counts = scorePiece(t, condition, out);
      scores.push({ id: t.id, title: t.title, style: t.style, source: t.source, condition, grid, counts });
      if (opt.dump) {
        mkdirSync(join(DATA, 'sorties', name), { recursive: true });
        writeFileSync(join(DATA, 'sorties', name, `${t.id}.${condition}.${grid}.json`), JSON.stringify(out));
      }
      const r = rates(counts);
      process.stderr.write(
        `${t.id.padEnd(26)} ${condition.padEnd(11)} ${grid.padEnd(8)} fond. ${(100 * r.beat.fondamentale).toFixed(0).padStart(3)} %  coul. ${(100 * r.beat.couleur).toFixed(0).padStart(3)} %\n`,
      );
    }
  }
}

// sums by condition, by style, overall
type Group = Record<string, Counts>;
const groups: Record<string, Group> = { condition: {}, split: {}, style: {}, total: {} };
for (const s of scores) {
  const add = (g: Group, k: string) => {
    g[k] = addCounts(g[k] ?? emptyCounts(), s.counts);
  };
  add(groups.condition!, `${s.grid}|${s.condition}`);
  add(groups.split!, `${s.grid}|${splitOf(s.id)}|${s.condition}`);
  add(groups.style!, `${s.grid}|${s.condition}|${s.style}`);
  add(groups.total!, `${s.grid}|${s.source === 'synthese' ? 'synthese' : 'reel'}`);
  add(groups.total!, `${s.grid}|tout`);
}

const result = {
  variant: name,
  date: new Date().toISOString(),
  seconds: Math.round((Date.now() - started) / 1000),
  networkRuns: fresh,
  networkSeconds: Math.round(networkSeconds),
  pieces: corpus.length,
  groups: Object.fromEntries(
    Object.entries(groups).map(([g, v]) => [g, Object.fromEntries(Object.entries(v).map(([k, c]) => [k, { rates: rates(c), counts: c }]))]),
  ),
  perPiece: scores.map((s) => ({ id: s.id, split: splitOf(s.id), condition: s.condition, grid: s.grid, style: s.style, rates: rates(s.counts) })),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.json`), JSON.stringify(result, null, 1));
writeFileSync(join(outDir, `${name}.md`), report(result));
console.error(`\n${scores.length} mesures en ${result.seconds} s (réseaux : ${fresh} fichiers, ${result.networkSeconds} s). Résultats : ${join(outDir, name)}.md`);
