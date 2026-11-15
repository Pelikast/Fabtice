// Evaluation of the structural evidence (repeats of the form, known chart,
// reliability), on the shared dev / held-out split (banc/partage.json).
//
//   node banc/build-structure.mjs
//   BANC_DATA=… node dist/structure.mjs [--grid detected|truth] [--conditions …] [--only …]
//        [--configs base,reprises,grille,les-deux] [--out resultats] [--set key=value,…] [--fit]
//
// Per configuration, split and condition: root, root + colour, missed and
// extra chord changes (as banc/score.ts), and root + colour on three kinds of
// bars: first chorus, later choruses played as the first (« reprises »), and
// later choruses REHARMONISED (the truth differs from the first chorus at the
// same bar of the form: tritone substitutes, added ii, passing diminished…).
// The chart is searched with a noisy title (as from a video link), and the
// acceptance of charts is tested with right, noisy, wrong and absent titles.
// `--fit` fits the reliability model on dev and checks it on held-out.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { networks } from './networks';
import { ROOT } from './paths';
import { addCounts, emptyCounts, levels, rates, scorePiece, type Counts } from './score';
import { chordAt, loadCorpus, truthGrid, type Truth } from './truth';
import type { VariantInput, VariantOutput } from './types';
import { analyse, type StructureConfig, type StructureRun } from './structure/analyse';
import { FEATURE_NAMES, RELIABILITY_DOUBT, type ReliabilityFeatures } from '../../../../app/src/analysis/engine/reliability';
import { chordQual, chordRoot } from '../../../../app/src/analysis/engine/chords';

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
const gridMode = opt.grid ?? 'detected';
const wanted = opt.conditions ? opt.conditions.split(',') : null;
const only = opt.only ? new Set(opt.only.split(',')) : null;
const outDir = resolve(process.cwd(), opt.out ?? 'resultats');
const configNames = (opt.configs ?? 'base,reprises,grille,les-deux').split(',');

// --set repeats.weight=0.5,chart.minZ=3 : overrides for tuning (dev only)
const overrides: { repeats: Record<string, number>; chart: Record<string, number> } = { repeats: {}, chart: {} };
for (const kv of (opt.set ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=') as [string, string];
  const [group, name] = k.split('.') as ['repeats' | 'chart', string];
  overrides[group][name] = Number(v);
}

const CONFIGS: Record<string, StructureConfig> = {
  base: { repeats: null, chart: null },
  reprises: { repeats: overrides.repeats, chart: null },
  grille: { repeats: null, chart: overrides.chart },
  'les-deux': { repeats: overrides.repeats, chart: overrides.chart },
};

const split = JSON.parse(readFileSync(join(ROOT, 'banc', 'partage.json'), 'utf8')) as { dev: string[]; controle: string[] };
const half = (id: string) => (split.dev.includes(id) ? 'dev' : split.controle.includes(id) ? 'controle' : 'hors');

/** A noisy title, as a video link gives it (deterministic). */
export function noisyTitle(title: string, id: string): string {
  const forms = [
    (t: string) => `${t} (Live, 1958) [Remastered]`,
    (t: string) => `Quartet - ${t.toLowerCase()} - take 2`,
    (t: string) => `${t.toUpperCase()} | Official Audio`,
    (t: string) => `${t} feat. the Trio (1961)`,
  ];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return forms[h % forms.length]!(title);
}

/** A wrong title for the negative tests: another tune's (a blues titled All the Things You Are…). */
function wrongTitle(t: Truth): string {
  if (/blues|st-louis|valse/.test(t.id)) return 'All the Things You Are';
  if (t.id === 'tous-ces-trucs') return 'Autumn Leaves';
  if (t.style === 'bossa') return 'Corcovado';
  if (t.source !== 'synthese') return 'All the Things You Are';
  return 'Blue Bossa' === t.title ? 'Satin Doll' : t.title === 'Satin Doll' ? 'Blue Bossa' : 'Body and Soul';
}

type BarKind = 'premier' | 'reprise' | 'reharm';

/** Kind of each bar of the truth. */
function barKinds(t: Truth): BarKind[] {
  const choruses = Number(t.choruses ?? 1) || 1;
  const L = Math.round(t.bars.length / choruses);
  const sig = (i: number) => {
    const bar = t.bars[i]!;
    return bar.beats.map((_, j) => {
      const c = chordAt(bar, j + 1);
      return `${c.root}:${c.quality}`;
    }).join(' ');
  };
  return t.bars.map((b, i) => {
    if (b.chorus <= 1 || i < L) return 'premier';
    return sig(i) === sig(i % L) ? 'reprise' : 'reharm';
  });
}

interface KindCounts { beats: number; right: number; root: number }
type Kinds = Record<BarKind, KindCounts>;
const emptyKinds = (): Kinds => ({ premier: { beats: 0, right: 0, root: 0 }, reprise: { beats: 0, right: 0, root: 0 }, reharm: { beats: 0, right: 0, root: 0 } });
function addKinds(a: Kinds, b: Kinds): Kinds {
  const o = emptyKinds();
  for (const k of Object.keys(o) as BarKind[]) for (const f of ['beats', 'right', 'root'] as const) o[k][f] = a[k][f] + b[k][f];
  return o;
}

function chordAtTime(out: VariantOutput, x: number) {
  let cur = null as VariantOutput['chords'][number] | null;
  for (const c of out.chords) if (c.time <= x) cur = c;
  return cur;
}

function scoreKinds(t: Truth, condition: string, out: VariantOutput): Kinds {
  const k = emptyKinds();
  const kinds = barKinds(t);
  const s = t.conditions[condition]!.timeScale;
  const chords = [...out.chords].sort((a, b) => a.time - b.time);
  t.bars.forEach((bar, i) => {
    const ends = bar.beats.slice(1).concat([bar.end]);
    bar.beats.forEach((b0, j) => {
      const d = chordAtTime({ ...out, chords }, ((b0 + ends[j]!) / 2) * s);
      const l = levels(chordAt(bar, j + 1), d?.chord ?? null);
      const kk = k[kinds[i]!];
      kk.beats++;
      if (l.couleur) kk.right++;
      if (l.fondamentale) kk.root++;
    });
  });
  return k;
}

/** Agreement of the aligned chart with the truth, per beat (what the chart alone would score). */
function chartVsTruth(t: Truth, condition: string, run: StructureRun): { beats: number; root: number; colour: number } {
  const r = { beats: 0, root: 0, colour: 0 };
  const fit = run.chart;
  if (!fit?.accepted) return r;
  const s = t.conditions[condition]!.timeScale;
  const beats = run.prepared.grid.beats;
  for (const bar of t.bars) {
    const ends = bar.beats.slice(1).concat([bar.end]);
    bar.beats.forEach((b0, j) => {
      const mid = ((b0 + ends[j]!) / 2) * s;
      let bi = -1;
      for (let q = 0; q < beats.length; q++) if (beats[q]! <= mid) bi = q;
      if (bi < 0) return;
      const c = fit.chordOfBeat[bi];
      r.beats++;
      if (c === null || c === undefined || c === 168) return;
      const tr = chordAt(bar, j + 1);
      if (chordRoot(c) === tr.root) {
        r.root++;
        const q = chordQual(c);
        if (q === tr.quality || (tr.quality === '7sus4' && q === 'sus4') || (tr.quality === 'aug7' && q === 'aug')) r.colour++;
      }
    });
  }
  return r;
}

function inputOf(t: Truth, condition: string): VariantInput {
  const c = t.conditions[condition]!;
  const input: VariantInput = {
    id: t.id,
    condition,
    mixPath: join(t.dir, c.mix),
    stemPaths: Object.fromEntries(Object.entries(c.stems).map(([k, v]) => [k, join(t.dir, v!)])),
    title: t.title,
    meta: { style: t.style, source: t.source, harmonyStems: t.harmonyStems, stems: t.stems, meter: t.meter },
  };
  if (gridMode === 'truth') input.truthGrid = truthGrid(t, condition);
  return input;
}

const corpus = loadCorpus().filter((t) => !only || only.has(t.id));
const started = Date.now();
type Key = string;
const counts = new Map<Key, Counts>();
const kinds = new Map<Key, Kinds>();
const add = (key: Key, c: Counts, k: Kinds) => {
  counts.set(key, addCounts(counts.get(key) ?? emptyCounts(), c));
  kinds.set(key, addKinds(kinds.get(key) ?? emptyKinds(), k));
};
const acceptance: { id: string; half: string; condition: string; scenario: string; title: string; standard: boolean; accepted: boolean; matched: string | null; z: number | null; agree: number | null; reason: string | null; transpose: number | null; scale: number | null; formLength: number | null }[] = [];
const chartTruth = new Map<string, { beats: number; root: number; colour: number }>();
const forms: { id: string; condition: string; truthForm: number; found: number | null; lags: number[]; choruses: number }[] = [];
const rel: { half: string; condition: string; config: string; f: ReliabilityFeatures; beats: number; right: number; oldDoubt: boolean }[] = [];
const timing: Record<string, number> = {};

for (const t of corpus) {
  const h = half(t.id);
  for (const condition of Object.keys(t.conditions)) {
    if (wanted && !wanted.includes(condition)) continue;
    const input = inputOf(t, condition);
    const net = await networks(input.mixPath);
    const noisy = t.source === 'synthese' ? noisyTitle(t.title, t.id) : '';
    for (const name of configNames) {
      const cfg = { ...CONFIGS[name]!, title: noisy };
      const t0 = performance.now();
      const run = analyse(input, net, cfg);
      timing[name] = (timing[name] ?? 0) + performance.now() - t0;
      const c = scorePiece(t, condition, run.out);
      const k = scoreKinds(t, condition, run.out);
      add(`${name}|${h}|${condition}`, c, k);
      add(`${name}|tout|${condition}`, c, k);
      if (name === 'reprises' && opt.lags) {
        const al = run.repeats?.allLags ?? [];
        process.stdout.write(`${t.id} ${condition}: ${[...al].sort((a, b) => b.z - a.z).slice(0, 8).map((l) => `${l.lag}:${l.score.toFixed(2)}/z${l.z.toFixed(1)}`).join(' ')}\n`);
      }
      if (name === 'reprises' || name === 'les-deux') {
        if (name === 'reprises') forms.push({ id: t.id, condition, truthForm: Math.round(t.bars.length / (Number(t.choruses ?? 1) || 1)), found: run.repeats?.formLength ?? null, lags: run.repeats?.lags.map((l) => l.lag) ?? [], choruses: run.repeats?.choruses.length ?? 0 });
      }
      if (name === 'grille' && t.standard) {
        const ct = chartVsTruth(t, condition, run);
        const key = `${h}|${condition}`;
        const old = chartTruth.get(key) ?? { beats: 0, root: 0, colour: 0 };
        chartTruth.set(key, { beats: old.beats + ct.beats, root: old.root + ct.root, colour: old.colour + ct.colour });
      }
      // reliability rows: every segment, weighted by its beats, right = root + colour at the beat middles
      if (opt.fit) {
        const s = t.conditions[condition]!.timeScale;
        const segs = run.decoding.segments;
        const flat: { mid: number; ok: boolean }[] = [];
        for (const bar of t.bars) {
          const ends = bar.beats.slice(1).concat([bar.end]);
          bar.beats.forEach((b0, j) => {
            const mid = ((b0 + ends[j]!) / 2) * s;
            const d = chordAtTime(run.out, mid);
            flat.push({ mid, ok: levels(chordAt(bar, j + 1), d?.chord ?? null).couleur });
          });
        }
        segs.forEach((sg, si) => {
          const inSeg = flat.filter((x) => x.mid >= sg.t0 && x.mid < sg.t1);
          if (!inSeg.length) return;
          rel.push({ half: h, condition, config: name, f: run.features[si]!, beats: inSeg.length, right: inSeg.filter((x) => x.ok).length, oldDoubt: sg.confidence < 0.35 });
        });
      }
    }
    // chart acceptance: right title (clean and noisy), wrong title, no title
    if (configNames.includes('grille')) {
      const scenarios: [string, string][] = t.source === 'synthese'
        ? [['titre exact', t.title], ['titre bruité', noisy], ['titre d’un autre morceau', wrongTitle(t)]]
        : [['sans titre', ''], ['titre d’un autre morceau', wrongTitle(t)]];
      for (const [scenario, title] of scenarios) {
        const run = analyse(input, net, { repeats: null, chart: overrides.chart, title });
        const fit = run.chart;
        acceptance.push({
          id: t.id, half: h, condition, scenario, title, standard: t.standard && scenario !== 'titre d’un autre morceau',
          accepted: !!fit?.accepted, matched: fit?.chart?.title ?? null, z: fit?.best?.z ?? null, agree: fit?.best?.agree ?? null,
          reason: fit?.reason ?? null, transpose: fit?.best?.transpose ?? null, scale: fit?.best?.scale ?? null,
          formLength: fit?.chart ? fit.chart.bars.length : null,
        });
      }
    }
    process.stderr.write(`${t.id} ${condition}\n`);
  }
}

// ------------------------------------------------------------------ report

const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)} %` : '—');
const CONDS = ['propre', 'disque', 'reel', 'reel-disque'];
const CNAME: Record<string, string> = { propre: 'synthèse, son propre', disque: 'synthèse, vieux disque', reel: 'GuitarSet', 'reel-disque': 'GuitarSet, vieux disque' };
const lines: string[] = [];
lines.push(`# Banc accords — preuves de structure (reprises, grille connue)\n`);
lines.push(`Grille ${gridMode === 'truth' ? 'vraie' : 'détectée'}, ${corpus.length} morceaux, ${Math.round((Date.now() - started) / 1000)} s. Réglages : ${opt.set ?? 'par défaut'}.\n`);
for (const h of ['dev', 'controle', 'tout']) {
  lines.push(`\n## ${h === 'dev' ? 'Développement' : h === 'controle' ? 'Contrôle (jamais réglé dessus)' : 'Tout le corpus'}\n`);
  lines.push('| Son | Variante | Fondamentale | Couleur | Manqués | En trop | Couleur 1re grille | Couleur reprises | Couleur réharmonisées (temps) |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const cond of CONDS) {
    for (const name of configNames) {
      const c = counts.get(`${name}|${h}|${cond}`);
      if (!c) continue;
      const r = rates(c);
      const k = kinds.get(`${name}|${h}|${cond}`)!;
      const kr = (x: KindCounts) => (x.beats ? `${pct(x.right / x.beats)}` : '—');
      lines.push(`| ${CNAME[cond]} | ${name} | ${pct(r.beat.fondamentale)} | ${pct(r.beat.couleur)} | ${pct(r.missing)} | ${pct(r.extra)} | ${kr(k.premier)} | ${kr(k.reprise)} | ${kr(k.reharm)}${k.reharm.beats ? ` (${k.reharm.beats})` : ''} |`);
    }
  }
}
if (forms.length) {
  lines.push('\n## Forme trouvée (variante « reprises »)\n');
  lines.push('| Morceau | Son | Forme vraie (mesures) | Forme trouvée | Décalages gardés | Grilles |');
  lines.push('|---|---|---|---|---|---|');
  for (const f of forms) lines.push(`| ${f.id} | ${f.condition} | ${f.truthForm} | ${f.found ?? '—'} | ${f.lags.join(', ')} | ${f.choruses} |`);
}
if (acceptance.length) {
  lines.push('\n## Grille connue : acceptée ou refusée\n');
  const tally = (rows: typeof acceptance) => {
    const ta = rows.filter((r) => r.standard && r.accepted).length;
    const fr = rows.filter((r) => r.standard && !r.accepted).length;
    const fa = rows.filter((r) => !r.standard && r.accepted).length;
    const tr = rows.filter((r) => !r.standard && !r.accepted).length;
    return `${ta} | ${fr} | ${fa} | ${tr}`;
  };
  lines.push('| Partie | Scénario | Bonne grille acceptée | Bonne grille refusée | Mauvaise grille acceptée | Refusée à raison (ou rien trouvé) |');
  lines.push('|---|---|---|---|---|---|');
  for (const h of ['dev', 'controle']) {
    for (const sc of ['titre exact', 'titre bruité', 'titre d’un autre morceau', 'sans titre']) {
      const rows = acceptance.filter((r) => r.half === h && r.scenario === sc);
      if (rows.length) lines.push(`| ${h} | ${sc} | ${tally(rows)} |`);
    }
  }
  lines.push('\nDétail (z : écart de la meilleure position aux autres ; accord : part des temps où la grille et le réseau sont d’accord) :\n');
  lines.push('| Morceau | Son | Scénario | Titre | Grille trouvée | z | Accord | Transp. | Échelle | Décision |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of acceptance) {
    if (!r.matched) continue;
    lines.push(`| ${r.id} | ${r.condition} | ${r.scenario} | ${r.title} | ${r.matched} | ${r.z?.toFixed(1)} | ${r.agree !== null ? pct(r.agree) : ''} | ${r.transpose} | ${r.scale} | ${r.accepted ? 'acceptée' : `refusée (${r.reason})`} |`);
  }
}
if (chartTruth.size) {
  lines.push('\n## La grille connue alignée, comparée à la vérité (standards, titre bruité)\n');
  lines.push('| Partie | Son | Temps | Fondamentale | Couleur |');
  lines.push('|---|---|---|---|---|');
  for (const [k, v] of chartTruth) lines.push(`| ${k.replace('|', ' | ')} | ${v.beats} | ${pct(v.root / (v.beats || 1))} | ${pct(v.colour / (v.beats || 1))} |`);
}
lines.push(`\nTemps de calcul par variante (décodage compris, réseaux en cache) : ${Object.entries(timing).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(', ')}.\n`);

// ------------------------------------------------------------------ reliability

let relOut: unknown = null;
if (opt.fit && rel.length) {
  const train = rel.filter((r) => r.half === 'dev' && r.config === (opt.fitConfig ?? 'les-deux'));
  const names = FEATURE_NAMES;
  const X = (f: ReliabilityFeatures) => [1, ...names.map((n) => f[n])];
  // logistic regression by Newton steps, rows weighted by their beats, small ridge
  const d = names.length + 1;
  let w = new Array<number>(d).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = new Array<number>(d).fill(0);
    const H = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (const r of train) {
      const x = X(r.f);
      const z = x.reduce((s, v, i) => s + v * w[i]!, 0);
      const p = 1 / (1 + Math.exp(-z));
      // binomial: right of beats
      for (let i = 0; i < d; i++) {
        g[i]! += (r.right - r.beats * p) * x[i]!;
        for (let j = 0; j < d; j++) H[i]![j]! += r.beats * p * (1 - p) * x[i]! * x[j]!;
      }
    }
    for (let i = 1; i < d; i++) {
      g[i]! -= 1 * w[i]!;
      H[i]![i]! += 1;
    }
    // solve H δ = g
    const A = H.map((row, i) => [...row, g[i]!]);
    for (let i = 0; i < d; i++) {
      let piv = i;
      for (let r = i + 1; r < d; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[piv]![i]!)) piv = r;
      [A[i], A[piv]] = [A[piv]!, A[i]!];
      const div = A[i]![i]! || 1e-9;
      for (let j = i; j <= d; j++) A[i]![j]! /= div;
      for (let r = 0; r < d; r++) if (r !== i) {
        const f = A[r]![i]!;
        for (let j = i; j <= d; j++) A[r]![j]! -= f * A[i]![j]!;
      }
    }
    const delta = A.map((row) => row[d]!);
    w = w.map((v, i) => v + delta[i]!);
    if (Math.max(...delta.map(Math.abs)) < 1e-7) break;
  }
  const predict = (f: ReliabilityFeatures) => 1 / (1 + Math.exp(-X(f).reduce((s, v, i) => s + v * w[i]!, 0)));
  const evalRows = (rows: typeof rel, p: (r: (typeof rel)[number]) => number) => {
    const bins = Array.from({ length: 10 }, () => ({ n: 0, pred: 0, right: 0 }));
    let brier = 0;
    let n = 0;
    let flagged = 0;
    let wrong = 0;
    let wrongFlagged = 0;
    let doubt = 0;
    let doubtWrong = 0;
    for (const r of rows) {
      const q = p(r);
      const b = bins[Math.min(9, Math.floor(q * 10))]!;
      b.n += r.beats;
      b.pred += q * r.beats;
      b.right += r.right;
      brier += r.right * (1 - q) ** 2 + (r.beats - r.right) * q ** 2;
      n += r.beats;
      wrong += r.beats - r.right;
      if (q < RELIABILITY_DOUBT) {
        doubt += r.beats;
        doubtWrong += r.beats - r.right;
        wrongFlagged += r.beats - r.right;
      }
      flagged += q < RELIABILITY_DOUBT ? r.beats : 0;
    }
    const ece = bins.reduce((s, b) => s + (b.n ? Math.abs(b.pred / b.n - b.right / b.n) * b.n : 0), 0) / (n || 1);
    return {
      beats: n,
      brier: brier / (n || 1),
      ece,
      doubtfulShare: doubt / (n || 1),
      wrongIfDoubtful: doubtWrong / (doubt || 1),
      wrongIfSure: (wrong - doubtWrong) / ((n - doubt) || 1),
      errorsFlagged: wrongFlagged / (wrong || 1),
      curve: bins.map((b, i) => ({ bin: `${i / 10}–${(i + 1) / 10}`, beats: b.n, predicted: b.n ? b.pred / b.n : null, observed: b.n ? b.right / b.n : null })),
    };
  };
  const oldP = (r: (typeof rel)[number]) => Math.exp(r.f.logNet);
  const rows: string[] = [];
  const res: Record<string, unknown> = { coefficients: Object.fromEntries([['intercept', w[0]], ...names.map((n, i) => [n, w[i + 1]])]) };
  rows.push('\n## Fiabilité : une probabilité d’être juste par accord\n');
  rows.push(`Modèle logistique réglé sur « dev » (${opt.fitConfig ?? 'les-deux'}), coefficients : ${names.map((n, i) => `${n} ${w[i + 1]!.toFixed(3)}`).join(', ')}, constante ${w[0]!.toFixed(3)}.\n`);
  rows.push('| Partie | Variante | Son | Temps | Brier (nouveau / ancien) | ECE (nouveau / ancien) | Douteux | Faux si douteux | Faux si sûr | Erreurs signalées (nouveau / ancien) |');
  rows.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const h of ['dev', 'controle']) {
    for (const cfgName of configNames) {
      for (const cond of CONDS) {
        const sel = rel.filter((r) => r.half === h && r.config === cfgName && r.condition === cond);
        if (!sel.length) continue;
        const a = evalRows(sel, (r) => predict(r.f));
        const b = evalRows(sel, (r) => (r.oldDoubt ? 0.25 : 0.75));
        const bOld = evalRows(sel, oldP);
        res[`${h}|${cfgName}|${cond}`] = { nouveau: a, ancienSeuil: b, ancienneConfiance: bOld };
        rows.push(`| ${h} | ${cfgName} | ${CNAME[cond]} | ${a.beats} | ${a.brier.toFixed(3)} / ${bOld.brier.toFixed(3)} | ${pct(a.ece)} / ${pct(bOld.ece)} | ${pct(a.doubtfulShare)} | ${pct(a.wrongIfDoubtful)} | ${pct(a.wrongIfSure)} | ${pct(a.errorsFlagged)} / ${pct(b.errorsFlagged)} |`);
      }
    }
  }
  const held = rel.filter((r) => r.half === 'controle' && r.config === (opt.fitConfig ?? 'les-deux'));
  const curve = evalRows(held, (r) => predict(r.f)).curve;
  const curveOld = evalRows(held, oldP).curve;
  res.curveControle = curve;
  res.curveControleAncienne = curveOld;
  rows.push('\nCourbe de fiabilité sur « contrôle » (toutes conditions) : probabilité annoncée → part réellement juste (temps).\n');
  rows.push('| Tranche | Temps | Annoncé | Observé | Ancienne confiance : temps | annoncé | observé |');
  rows.push('|---|---|---|---|---|---|---|');
  curve.forEach((c, i) => {
    const o2 = curveOld[i]!;
    rows.push(`| ${c.bin} | ${c.beats} | ${c.predicted !== null ? pct(c.predicted) : '—'} | ${c.observed !== null ? pct(c.observed) : '—'} | ${o2.beats} | ${o2.predicted !== null ? pct(o2.predicted) : '—'} | ${o2.observed !== null ? pct(o2.observed) : '—'} |`);
  });
  lines.push(...rows);
  relOut = res;
}

mkdirSync(outDir, { recursive: true });
const base = opt.name ?? `structure-${gridMode}`;
writeFileSync(join(outDir, `${base}.md`), lines.join('\n') + '\n');
writeFileSync(join(outDir, `${base}.json`), JSON.stringify({
  grid: gridMode, settings: opt.set ?? null,
  results: Object.fromEntries([...counts.entries()].map(([k, c]) => [k, { rates: rates(c), kinds: kinds.get(k) }])),
  acceptance, forms, chartTruth: Object.fromEntries(chartTruth), reliability: relOut,
}, null, 1));
console.error(`→ ${join(outDir, base)}.md`);
