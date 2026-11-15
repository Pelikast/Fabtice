// The tempo hardening on its case set (`tempo.cases.ts`): level passages,
// displaced runs and negatives, before (the beat repair of analyser version 3)
// and now. The figures are printed and held by the checks below. The full set
// runs with FABTICE_REPAIR_FULL=1; by default every third level case.

import { describe, expect, it } from 'vitest';
import { current, displacedCases, levelCases, negativeCases, previous, scoreTempo, truthOutcome, type TempoCase, type TempoScore } from './tempo.cases';

const FULL = !!process.env.FABTICE_REPAIR_FULL;

interface Acc {
  n: number;
  placedBefore: number;
  placedNow: number;
  downBefore: number;
  downNow: number;
  downN: number;
  jumpsBefore: number;
  jumpsNow: number;
  zigBefore: number;
  zigNow: number;
  errBefore: number;
  errNow: number;
  fBefore: number;
  fNow: number;
  broken: number;
}

const acc = (): Acc => ({ n: 0, placedBefore: 0, placedNow: 0, downBefore: 0, downNow: 0, downN: 0, jumpsBefore: 0, jumpsNow: 0, zigBefore: 0, zigNow: 0, errBefore: 0, errNow: 0, fBefore: 0, fNow: 0, broken: 0 });

function add(a: Acc, c: TempoCase, b: TempoScore, n: TempoScore, t: TempoScore): void {
  a.n++;
  a.placedBefore += +b.barsInPlace;
  a.placedNow += +n.barsInPlace;
  a.broken += +(b.barsInPlace && !n.barsInPlace);
  if (b.downAfter !== null && n.downAfter !== null) {
    a.downN++;
    a.downBefore += b.downAfter;
    a.downNow += n.downAfter;
  }
  a.jumpsBefore += Math.max(0, b.jumps - t.jumps);
  a.jumpsNow += Math.max(0, n.jumps - t.jumps);
  a.zigBefore += Math.max(0, b.zigzags - t.zigzags);
  a.zigNow += Math.max(0, n.zigzags - t.zigzags);
  a.errBefore += b.passageError ?? 0;
  a.errNow += n.passageError ?? 0;
  a.fBefore += b.beatF;
  a.fNow += n.beatF;
  void c;
}

const pc = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(1)} %`;

function line(label: string, a: Acc): string {
  return `${label.padEnd(34)} ${String(a.n).padStart(5)}  bars in place ${pc(a.placedBefore, a.n).padStart(7)} → ${pc(a.placedNow, a.n).padStart(7)}  downbeats after ${pc(a.downBefore, a.downN).padStart(7)} → ${pc(a.downNow, a.downN).padStart(7)}  F ${pc(a.fBefore, a.n)} → ${pc(a.fNow, a.n)}  jumps ${a.jumpsBefore} → ${a.jumpsNow}  zigzags ${a.zigBefore} → ${a.zigNow}  broken ${a.broken}`;
}

function run(cases: TempoCase[], key: (c: TempoCase) => string) {
  const rows = new Map<string, Acc>();
  for (const c of cases) {
    const t = scoreTempo(c, truthOutcome(c));
    const b = scoreTempo(c, previous(c));
    const n = scoreTempo(c, current(c));
    for (const k of [key(c), `all ${c.split}`]) {
      const a = rows.get(k) ?? acc();
      add(a, c, b, n, t);
      rows.set(k, a);
    }
  }
  return rows;
}

describe('the tempo hardening on its case set', () => {
  const level = levelCases().filter((_, i) => FULL || i % 3 === 0);
  const byLevel = run(level, (c) => `${c.kind}, ${c.name.match(/for (\d+) bars/)![1]!.padStart(2)} bars`);
  const byEvidence = run(level, (c) => `${c.kind} | ${c.evidence}`);
  const displaced = displacedCases();
  const byShift = run(displaced, (c) => c.kind);
  const negatives = negativeCases();

  it('prints the level passages', () => {
    const lines = [`${level.length} level cases${FULL ? ' (full set)' : ' (every third)'}`];
    for (const [k, a] of [...byLevel.entries()].sort()) lines.push(line(k, a));
    for (const [k, a] of [...byEvidence.entries()].sort()) if (!k.startsWith('all')) lines.push(line(k, a));
    console.log(lines.join('\n'));
    expect(level.length).toBeGreaterThan(100);
  });

  it('prints the displaced runs', () => {
    const lines = [`${displaced.length} displaced runs`];
    for (const [k, a] of [...byShift.entries()].sort()) lines.push(`${line(k, a)}  passage error ${(a.errBefore / a.n).toFixed(0)} → ${(a.errNow / a.n).toFixed(0)} ms`);
    console.log(lines.join('\n'));
    expect(displaced.length).toBeGreaterThan(100);
  });

  it('moves nothing on the negatives', () => {
    const changed: string[] = [];
    const changedBefore: string[] = [];
    for (const c of negatives) {
      const same = (o: { beats: number[] }) => o.beats.length === c.detected.length && o.beats.every((t, i) => Math.abs(t - c.detected[i]!) < 1e-9);
      if (c.base.startsWith('ambiguous')) continue;
      if (!same(previous(c))) changedBefore.push(c.name);
      if (!same(current(c))) changed.push(c.name);
    }
    console.log(`negatives: ${negatives.length}, changed before ${changedBefore.length}, now ${changed.length}${changed.length ? `: ${changed.join('; ')}` : ''}`);
    expect(changed.filter((x) => !changedBefore.includes(x))).toEqual([]);
  });
});
