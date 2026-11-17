// Tier R of the structure bench: the harmony pass on the app's real analysis
// of rendered pieces.
//
//   node banc/build.mjs
//   node dist/run.mjs                              # every piece with an analysis (analyses/) or a render (data/)
//   node dist/run.mjs --only autumn-leaves --conditions disque
//   node dist/run.mjs --analyse                    # run the app's analysis again on the renders (slow)
//   node dist/run.mjs --evidence stems,mix,none --known false,true --out resultats
//
// Writes resultats/rendu.md (and rendu.json: the counts). With no audio in
// data/, it re-scores from the committed analyses/ (beats, chords and the
// evidence measured on the renders): no render, no network needed.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StemId } from '../../../../app/src/model/separation';
import { beatTime, chordOf, type TruthPiece } from '../../../../app/src/structure/bench/cases';
import { addCounts, emptyCounts, sameFamily } from '../../../../app/src/structure/bench/score';
import { markdownReport, runInput, type Row } from '../../../../app/src/structure/bench/run';
import { oracleDetectors } from '../../../../app/src/structure/bench/oracle';
import type { EvidenceKind } from '../../../../app/src/structure/bench/simEvidence';
import { analyse, readAnalysis, type DetectedAnalysis } from './analyse';
import { barsFromAnalysis, harmonyInput } from './adapter';
import { CORPUS, ROOT, VERITES } from './paths';

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
const only = opt.only ? new Set(opt.only.split(',')) : null;
const wantedConditions = opt.conditions ? opt.conditions.split(',') : null;
const evidenceKinds = (opt.evidence ?? 'stems,mix').split(',') as EvidenceKind[];
const knownModes = (opt.known ?? 'false,true').split(',').map((x) => x === 'true');
const outDir = resolve(process.cwd(), opt.out ?? join(ROOT, 'resultats'));

/** How good the app's analysis was on this render: chords (family, per beat) and bar lines (±70 ms). */
function analysisQuality(piece: TruthPiece, a: DetectedAnalysis): { chords: [number, number]; downbeats: [number, number] } {
  let hit = 0;
  let total = 0;
  for (const b of piece.bars) {
    for (let k = 0; k < b.beats; k++) {
      const t = (beatTime(b, k) + beatTime(b, k + 1)) / 2;
      let want = null;
      for (const c of b.chords) if (c.beat <= k) want = chordOf(c.text);
      let got = null;
      for (const c of a.chords) if (c.time <= t * a.timeScale) got = c.chord;
      total++;
      if (sameFamily(want, got)) hit++;
    }
  }
  const lines = barsFromAnalysis(a).map((b) => b.start / a.timeScale);
  let dh = 0;
  for (const b of piece.bars) if (lines.some((x) => Math.abs(x - b.start) < 0.07)) dh++;
  return { chords: [hit, total], downbeats: [dh, piece.bars.length] };
}

async function main(): Promise<void> {
  const pieces = readdirSync(VERITES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(VERITES, f), 'utf8')) as TruthPiece & { render: string[] })
    .filter((p) => !only || only.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const rows = new Map<string, Row>();
  const quality = new Map<string, { chords: [number, number]; downbeats: [number, number]; pieces: number }>();
  const skipped: string[] = [];
  for (const piece of pieces) {
    for (const condition of piece.render) {
      if (wantedConditions && !wantedConditions.includes(condition)) continue;
      const dir = join(CORPUS, piece.id);
      const rendered = existsSync(join(dir, condition, 'mix.flac'));
      let a = opt.analyse ? null : readAnalysis(piece.id, condition);
      if (!a) {
        if (!rendered) {
          skipped.push(`${piece.id}.${condition}`);
          continue;
        }
        const info = JSON.parse(readFileSync(join(dir, 'rendu.json'), 'utf8')) as { stems: string[]; conditions: Record<string, { timeScale: number }> };
        const stems: Partial<Record<StemId, string>> = {};
        for (const s of info.stems) stems[s as StemId] = join(dir, condition, `${s}.flac`);
        process.stderr.write(`analyse ${piece.id} ${condition}…\n`);
        a = await analyse(piece.id, piece.title, condition, join(dir, condition, 'mix.flac'), stems, info.conditions[condition]!.timeScale);
      }
      const q = analysisQuality(piece, a);
      const qa = quality.get(condition) ?? { chords: [0, 0], downbeats: [0, 0], pieces: 0 };
      qa.chords[0] += q.chords[0];
      qa.chords[1] += q.chords[1];
      qa.downbeats[0] += q.downbeats[0];
      qa.downbeats[1] += q.downbeats[1];
      qa.pieces++;
      quality.set(condition, qa);
      for (const kind of evidenceKinds) {
        for (const known of knownModes) {
          const key = `${condition}|${kind}|${known}`;
          const ev = { stems: 'pistes (rendus séparés)', mix: 'sans séparation', none: 'sans audio' }[kind];
          let row = rows.get(key);
          if (!row) {
            row = { label: `${condition} / ${ev} / ${known ? 'grille connue' : 'sans grille'}`, level: condition, evidence: kind, known, cases: 0, counts: emptyCounts(), ms: 0, runs: [] };
            rows.set(key, row);
          }
          const r = runInput(piece, harmonyInput(piece, a, a.evidence, kind, known), opt.oracle ? oracleDetectors(piece) : undefined);
          addCounts(row.counts, r.counts);
          row.ms += r.ms;
          row.cases++;
          row.runs.push(r);
          if (r.error) process.stderr.write(`${piece.id} ${condition}: ${r.error}\n`);
        }
      }
    }
  }
  const list = [...rows.values()];
  const pct = (c: [number, number]) => (c[1] ? `${((100 * c[0]) / c[1]).toFixed(1)} %` : '–');
  const head = [
    '# Banc de structure — Tier R (rendus, analyse réelle de l’app)',
    '',
    'Écrit par `node dist/run.mjs` (dans `web/spikes/structure/`), avec les détecteurs de `app/src/structure/index.ts`.',
    'Grille et accords : l’analyse de l’app sur le mélange rendu. Pistes : les rendus séparés de chaque instrument (séparation PARFAITE, idéalisée) ;',
    'reconnaissance des vents simulée (taux « realiste » du Tier S).',
    '',
    '| Condition | Morceaux | Accords de l’analyse justes (famille, par temps) | Barres de mesure trouvées (±70 ms) |',
    '|---|---:|---:|---:|',
    ...[...quality.entries()].map(([c, q]) => `| ${c} | ${q.pieces} | ${pct(q.chords)} | ${pct(q.downbeats)} |`),
    '',
    skipped.length ? `Sans analyse ni rendu (ignorés) : ${skipped.join(', ')}.\n` : '',
  ];
  const report = `${head.join('\n')}\n${markdownReport(list, 'Tier R')}\n`;
  const base = opt.oracle ? 'rendu-oracle' : 'rendu';
  writeFileSync(join(outDir, `${base}.md`), report);
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify(list.map((r) => ({ label: r.label, cases: r.cases, counts: r.counts })), null, 1) + '\n');
  process.stdout.write(report);
}

await main();
