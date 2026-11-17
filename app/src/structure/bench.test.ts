// The structure bench, Tier S (symbolic): the harmony pass on the corpus truth
// read through simulated analysis errors. See web/spikes/structure/README.md.
//
//   npx vitest run src/structure/bench.test.ts                       # subset, table printed
//   FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts   # whole corpus, 2 draws,
//                    also writes web/spikes/structure/resultats/symbolique.md
//
// No figure fails while `bench/thresholds.ts` is empty (the detectors are
// stubs); the checks below are on the bench itself.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCase, loadCorpus, truthLines } from './bench/cases';
import { NOISE_LEVELS } from './bench/noise';
import { oracleDetectors } from './bench/oracle';
import { markdownReport, rowMetric, runTierS, type Row } from './bench/run';
import { METRICS, metricValue } from './bench/score';
import { STRUCTURE_BENCH_THRESHOLDS } from './bench/thresholds';

const FULL = process.env.FABTICE_STRUCTURE_FULL === '1';

describe('structure bench: the corpus and its cases', () => {
  const corpus = loadCorpus();

  it('has the pieces the bench needs', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(30);
    expect(corpus.some((p) => p.id === 'autumn-leaves')).toBe(true);
    expect(corpus.filter((p) => p.mode === 'pop').length).toBeGreaterThanOrEqual(4);
    expect(corpus.filter((p) => p.keyChanges.length > 0).length).toBeGreaterThanOrEqual(4);
    for (const p of corpus) {
      const lines = truthLines(p);
      for (let i = 1; i < lines.length; i++) expect(lines[i]!).toBeGreaterThan(lines[i - 1]!);
      expect(p.parts[0]!.firstBar).toBe(0);
      expect(p.parts[p.parts.length - 1]!.endBar).toBe(p.bars.length);
    }
  });

  it('builds every case without error, deterministically', () => {
    for (const p of corpus.filter((x) => x.subset)) {
      for (const level of NOISE_LEVELS) {
        const a = buildCase(p, { level, evidence: 'stems', known: true });
        const b = buildCase(p, { level, evidence: 'stems', known: true });
        expect(a.input.bars.length).toBeGreaterThan(8);
        expect(JSON.stringify(a.input.bars)).toBe(JSON.stringify(b.input.bars));
        expect(a.input.evidence!.stems!.drums!.length).toBe(a.input.bars.length);
        if (level === 'parfait') expect(a.input.bars.length).toBe(p.bars.length);
      }
    }
  });
});

describe('structure bench: the scorer', () => {
  it('gives the oracle (answers read from the truth) a perfect score on error-free cases', () => {
    const rows = runTierS({ pieces: 'all', levels: ['parfait'], evidence: ['stems', 'mix'], known: [false], detectorsFor: oracleDetectors });
    for (const row of rows) {
      for (const m of METRICS) {
        const v = metricValue(m, row.counts[m.key]);
        if (v === null || m.neutral) continue;
        if (m.lowerIsBetter) expect(v, `${m.key} ${row.label}`).toBe(0);
        else expect(v, `${m.key} ${row.label}`).toBeCloseTo(1, 6);
      }
      const autumn = row.runs.find((r) => r.autumn)!.autumn!;
      expect(autumn.chart).toEqual([]);
      expect(autumn.chain).toEqual([]);
    }
  });

  it('gives « nothing found » a zero score without error', () => {
    const nothing = { detectKeyChanges: () => [], detectStructure: () => null, simplifyChart: () => null };
    const rows = runTierS({ pieces: ['autumn-leaves', 'pont-autre-ton'], levels: ['realiste'], evidence: ['stems'], known: [true], detectors: nothing });
    expect(rows[0]!.runs.every((r) => !r.error && r.structure === null)).toBe(true);
    expect(rowMetric(rows[0]!, 'formExact')).toBe(0);
  });
});

describe('structure bench: Tier S', () => {
  const rows: Row[] = runTierS(FULL ? { pieces: 'all', evidence: ['stems', 'mix', 'none'], draws: 2 } : { pieces: 'subset' });

  it('runs the harmony pass on every case and prints the table', () => {
    const report = markdownReport(rows, FULL ? 'Tier S, corpus entier (2 tirages)' : 'Tier S, sous-ensemble');
    console.log(report);
    if (FULL) {
      const out = new URL('../../../web/spikes/structure/resultats/symbolique.md', import.meta.url);
      writeFileSync(out, `# Banc de structure — Tier S (symbolique)\n\nÉcrit par \`FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts\` (dans \`app/\`), avec les détecteurs de \`app/src/structure/index.ts\`.\n\n${report}\n`);
    }
    for (const r of rows) for (const x of r.runs) expect(x.error, `${r.label} ${x.piece.id}`).toBeUndefined();
  });

  it('keeps the opt-in thresholds', () => {
    for (const t of STRUCTURE_BENCH_THRESHOLDS) {
      const row = rows.find((r) => r.level === t.level && r.evidence === t.evidence && r.known === t.known);
      expect(row, `no row for ${t.level}/${t.evidence}/${t.known}`).toBeDefined();
      const v = rowMetric(row!, t.metric) ?? 0;
      if (t.min !== undefined) expect(v, `${t.metric} ${row!.label}`).toBeGreaterThanOrEqual(t.min);
      if (t.max !== undefined) expect(v, `${t.metric} ${row!.label}`).toBeLessThanOrEqual(t.max);
    }
  });
});
