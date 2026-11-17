// The bench of the tapped correction (`tapGrid.ts`, cases and tappers in
// `tapGrid.cases.ts`): the grid it gives against the true one, for each kind
// of passage and each kind of tapper. A subset runs with `npm test`, with
// thresholds; the whole table prints with FABTICE_TAP_FULL=1 (three seeds,
// every tapper, every recorded piece):
//   FABTICE_TAP_FULL=1 npx vitest run src/analysis/engine/tapGrid.bench.test.ts
// Figures per row: passage beats index-matched from the chosen bar (median,
// 95th percentile and worst error in ms; share within 35 and 70 ms); the count
// of the passage right; bar phase kept over the eight bars after it; beats
// found there (F, 70 ms); the first beat after the passage in place. « before »
// is the grid in force, scored the same way.

import { describe, expect, it } from 'vitest';
import { applyTappedFix } from './tapGrid';
import { recordedCases, scoreBefore, scoreTap, simulateTaps, syntheticCases, tappers, type TapCase, type TapScore, type Tapper } from './tapGrid.cases';

const FULL = !!process.env.FABTICE_TAP_FULL;

interface Run {
  c: TapCase;
  tapper: Tapper;
  seed: number;
  s: TapScore;
}

const FAST_TAPPERS = ['precise', '±60 ms', '±100 ms', 'late +120 ms ±60', 'forgets 20 % ±30', 'extra 10 % ±30', 'average: −40 ±60, drift, 10 % forgotten, 5 % extra'];

function runAll(): { runs: Run[]; before: Map<string, TapScore>; cases: TapCase[] } {
  const all = [...recordedCases(FULL), ...syntheticCases()];
  const cases = FULL ? all : all.filter((_, i) => i % 2 === 0);
  const only = process.env.FABTICE_TAP_ONLY;
  const ts = only ? tappers().filter((t) => t.name.startsWith(only)) : FULL ? tappers() : tappers().filter((t) => FAST_TAPPERS.includes(t.name));
  const seeds = FULL ? [1, 2, 3] : [1];
  const runs: Run[] = [];
  const before = new Map<string, TapScore>();
  for (const c of cases) {
    before.set(c.name, scoreBefore(c));
    for (const tapper of ts) {
      for (const seed of seeds) {
        const taps = simulateTaps(c, tapper, seed * 7919 + c.fromK);
        const out = applyTappedFix(c.act, { kind: 'tapped', from: c.grid.times[c.fromIdx]!, grid: c.grid, taps });
        runs.push({ c, tapper, seed, s: scoreTap(c, out) });
      }
    }
  }
  return { runs, before, cases };
}

interface Row {
  n: number;
  median: number;
  p95: number;
  worst: number;
  within35: number;
  within70: number;
  count: number;
  phase: number;
  after: number;
  junction: number;
}

function summarise(scores: readonly TapScore[]): Row {
  const med = (v: number[]) => {
    const a = v.slice().sort((x, y) => x - y);
    return a.length ? a[Math.floor((a.length - 1) / 2)]! : NaN;
  };
  const q = (v: number[], p: number) => {
    const a = v.slice().sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : NaN;
  };
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  return {
    n: scores.length,
    median: med(scores.map((s) => s.median)),
    p95: q(scores.map((s) => s.worst), 0.95),
    worst: Math.max(...scores.map((s) => s.worst)),
    within35: mean(scores.map((s) => s.within35)),
    within70: mean(scores.map((s) => s.within70)),
    count: mean(scores.map((s) => +s.count)),
    phase: mean(scores.map((s) => s.phase)),
    after: mean(scores.map((s) => s.after)),
    junction: mean(scores.map((s) => +s.junction)),
  };
}

const pct = (x: number) => `${(100 * x).toFixed(0).padStart(3)} %`;
const ms = (x: number) => (x >= 1e4 ? '  lost' : `${x.toFixed(0).padStart(6)}`);

function line(label: string, r: Row): string {
  return `${label.padEnd(52)} ${String(r.n).padStart(4)} ${ms(r.median)} ${ms(r.p95)} ${ms(r.worst)} ${pct(r.within35)} ${pct(r.within70)} ${pct(r.count)} ${pct(r.phase)} ${pct(r.after)} ${pct(r.junction)}`;
}

const HEAD = `${''.padEnd(52)} runs median p95worst  worst  ≤35   ≤70 count phase after junct`;

describe('the tapped correction on the bench', () => {
  const { runs, before, cases } = runAll();

  it('prints the table', () => {
    const lines = [`${cases.length} cases, ${runs.length} runs${FULL ? ' (full bench)' : ' (subset; FABTICE_TAP_FULL=1 for all)'}`, HEAD];
    const byTapper = new Map<string, TapScore[]>();
    const byFamily = new Map<string, TapScore[]>();
    for (const r of runs) {
      byTapper.set(r.tapper.name, [...(byTapper.get(r.tapper.name) ?? []), r.s]);
      byFamily.set(r.c.family, [...(byFamily.get(r.c.family) ?? []), r.s]);
    }
    lines.push('by tapper');
    for (const [k, v] of byTapper) lines.push(line(`  ${k}`, summarise(v)));
    lines.push('by passage');
    for (const [k, v] of byFamily) lines.push(line(`  ${k}`, summarise(v)));
    lines.push(line('all', summarise(runs.map((r) => r.s))));
    lines.push(line('the grid in force (before tapping)', summarise([...before.values()])));
    if (FULL || process.env.FABTICE_TAP_CASES) {
      lines.push('by case');
      for (const c of cases) lines.push(line(`  ${c.name.slice(0, 50)}`, summarise(runs.filter((r) => r.c === c).map((r) => r.s))));
    }
    console.log(lines.join('\n'));
    expect(runs.length).toBeGreaterThan(0);
  });

  it('never moves a beat before the chosen bar', () => {
    expect(runs.filter((r) => !r.s.prefixKept).map((r) => `${r.c.name} / ${r.tapper.name}`)).toEqual([]);
  });

  it('places the passage’s beats close to the true ones, with the count and the bars right', () => {
    // The thresholds hold for the subset's tappers (the full bench adds the hardest ones: see its table).
    const all = summarise(runs.filter((r) => FAST_TAPPERS.includes(r.tapper.name)).map((r) => r.s));
    expect(all.median).toBeLessThan(20);
    expect(all.within70).toBeGreaterThan(FULL ? 0.85 : 0.9);
    expect(all.count).toBeGreaterThan(0.85);
    expect(all.phase).toBeGreaterThan(0.85);
    expect(all.junction).toBeGreaterThan(0.85);
  });

  it('precise and moderately jittery tappers get the passage right almost always', () => {
    for (const name of ['precise', '±60 ms']) {
      const r = summarise(runs.filter((x) => x.tapper.name === name).map((x) => x.s));
      expect(r.count, name).toBeGreaterThan(0.9);
      expect(r.within70, name).toBeGreaterThan(0.95);
    }
  });
});
