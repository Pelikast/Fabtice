// The two manual tempo actions of the bar menu (`tempoFix.ts`) on the tempo
// case set (`tempo.cases.ts`), with the network's outputs rebuilt from each
// case's detected beats (`activationsOf`). The figures: of the cases the
// automatic analysis leaves wrong, how many each action puts right when it is
// applied at the bar where the wrong passage starts (and again at the next
// passage, on the grid as it then is). Full set with FABTICE_REPAIR_FULL=1.

import { describe, expect, it } from 'vitest';
import type { Outcome } from './repair.cases';
import { activationsOf, current, levelCases, negativeCases, scoreTempo, truthOutcome, type TempoCase } from './tempo.cases';
import { applyTempoFix, type TempoFixKind } from './tempoFix';
import type { GridHint } from '../types';

const FULL = !!process.env.FABTICE_REPAIR_FULL;

const asHint = (g: Outcome): GridHint => ({ times: g.beats, downbeat: g.numbers.indexOf(1), meter: { numerator: g.m, denominator: 4 } });
const asOutcome = (h: GridHint): Outcome => {
  const m = h.meter.numerator;
  return { beats: h.times, numbers: h.times.map((_, i) => ((((i - h.downbeat) % m) + m) % m) + 1), m, repaired: 0 };
};

/** The downbeat of `g` at or before the start of a passage: the bar the user would choose. */
function barBefore(g: GridHint, at: number): number | null {
  const m = g.meter.numerator;
  let d = g.times.findIndex((t) => t > at + 0.07) - 1;
  while (d > 0 && (((d - g.downbeat) % m) + m) % m !== 0) d--;
  return d > 0 ? g.times[d]! : null;
}

/** The action at each passage in turn. */
function applyAt(c: TempoCase, kind: TempoFixKind, g: GridHint): GridHint {
  const act = activationsOf(c);
  let r = g;
  for (const p of c.passages) {
    const from = barBefore(r, p[0]);
    if (from !== null) r = applyTempoFix(act, { kind, from, grid: r });
  }
  return r;
}

function right(c: TempoCase, o: Outcome): boolean {
  const s = scoreTempo(c, o);
  const t = scoreTempo(c, truthOutcome(c));
  return s.barsInPlace && (s.downAfter ?? 1) >= 0.97 && s.jumps <= t.jumps && s.beatF >= 0.97;
}

describe('the manual tempo actions', () => {
  it('put back the passages the automatic analysis leaves wrong, and never move a beat before the bar', { timeout: 600_000 }, () => {
    // Passages at the very start have no tempo before them to go on with: not this action's case.
    const cases = levelCases().filter((c, i) => c.downAt && !c.name.includes('at start') && (FULL || (i * 31 + 7) % 97 < 12));
    const rows = new Map<string, { wrong: number; continuity: number; fresh: number }>();
    let prefixMoved = 0;
    for (const c of cases) {
      const g = current(c);
      if (right(c, g)) continue;
      const key = `${c.split} | ${c.evidence}`;
      const row = rows.get(key) ?? { wrong: 0, continuity: 0, fresh: 0 };
      row.wrong++;
      for (const kind of ['continuity', 'fresh'] as const) {
        const hint = asHint(g);
        const r = applyAt(c, kind, hint);
        row[kind] += +right(c, asOutcome(r));
        // Before the first chosen bar, beat for beat the same.
        const from = barBefore(hint, c.passages[0]![0])!;
        hint.times.filter((t) => t < from - 1e-6).forEach((t, i) => (prefixMoved += +(r.times[i] !== t)));
      }
      rows.set(key, row);
    }
    const lines = [`${cases.length} level cases${FULL ? ' (full set)' : ' (a scattered eighth)'}; left wrong by the analysis → put right by each action`];
    for (const [k, r] of [...rows.entries()].sort()) lines.push(`${k.padEnd(14)} wrong ${String(r.wrong).padStart(4)}  « Corriger » ${String(r.continuity).padStart(4)}  « Réanalyser » ${String(r.fresh).padStart(4)}`);
    console.log(lines.join('\n'));
    expect(prefixMoved).toBe(0);
    const all = [...rows.values()].reduce((a, r) => ({ wrong: a.wrong + r.wrong, continuity: a.continuity + r.continuity, fresh: a.fresh + r.fresh }), { wrong: 0, continuity: 0, fresh: 0 });
    expect(all.wrong).toBeGreaterThan(20);
    expect(all.continuity / all.wrong).toBeGreaterThan(0.6);
  });

  it('« Réanalyser » leaves rubato and a real lasting change after the bar as they are; « Corriger » holds the tempo before, by design', () => {
    const pick = (name: string) => negativeCases().find((c) => c.name === name)!;
    for (const name of ['rubato ±8% 4/4 | jitter 12 ms | sharp', '120 then 160 (4/3), lasting | jitter 12 ms | sharp']) {
      const c = pick(name);
      const g = asHint(current(c));
      const from = g.times[g.downbeat + 8 * g.meter.numerator]!;
      const fresh = applyTempoFix(activationsOf(c), { kind: 'fresh', from, grid: g });
      expect(scoreTempo(c, asOutcome(fresh)).beatF, name).toBeGreaterThan(0.99);
      if (name.startsWith('120')) {
        const held = applyTempoFix(activationsOf(c), { kind: 'continuity', from, grid: g });
        expect(scoreTempo(c, asOutcome(held)).beatF).toBeLessThan(0.8);
      }
    }
  });

  it('compose: a second action starts from the grid the first one left', () => {
    const c = levelCases().find((x) => x.name === 'swing 120 4/4 | half for 4 bars at twice | jitter 12 ms | lost')!;
    const g = asHint(current(c));
    const act = activationsOf(c);
    const first = applyTempoFix(act, { kind: 'continuity', from: barBefore(g, c.passages[0]![0])!, grid: g });
    const from2 = barBefore(first, c.passages[1]![0])!;
    const second = applyTempoFix(act, { kind: 'continuity', from: from2, grid: first });
    // Everything before the second bar is the first action's grid.
    const before = first.times.filter((t) => t < from2 - 1e-6);
    expect(second.times.slice(0, before.length)).toEqual(before);
    expect(scoreTempo(c, asOutcome(second)).beatF).toBeGreaterThanOrEqual(scoreTempo(c, asOutcome(first)).beatF);
    expect(scoreTempo(c, asOutcome(second)).jumps).toBeLessThanOrEqual(scoreTempo(c, asOutcome(first)).jumps);
  });
});
