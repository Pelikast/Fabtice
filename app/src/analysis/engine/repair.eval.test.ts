// The measured figures of the beat repair on the case set (`repair.cases.ts`):
// how many injected failures keep the bars in place after the passage, before
// and after the repair, and what the repair changes on the clean sequences.
// The figures are printed (one line per failure mode) and held by the checks
// below, so that a change of algorithm or threshold that makes them worse
// fails. The full set (8 016 cases) runs with FABTICE_REPAIR_FULL=1; by default
// the 12 ms jitter only, every other failure case.

import { describe, expect, it } from 'vitest';
import { after, before, buildCases, score, type Case } from './repair.cases';

const FULL = !!process.env.FABTICE_REPAIR_FULL;

interface Row {
  n: number;
  keptBefore: number;
  keptAfter: number;
  broken: number;
  passageBefore: number;
  passageAfter: number;
}

function evaluate(cases: Case[]) {
  const rows = new Map<string, Row>();
  const byEvidence = new Map<string, { n: number; kept: number; keptBefore: number; exact: number; exactBefore: number; broken: number }>();
  const clean = { n: 0, changed: 0, countChanged: 0, worstMove: 0, downbeatsLost: 0, ambiguous: 0, ambiguousChanged: 0 };
  for (const c of cases) {
    const b = before(c);
    const a = after(c);
    const sb = score(c, b);
    const sa = score(c, a);
    if (c.failure === 'clean') {
      const same = a.beats.length === c.detected.length && a.beats.every((t, i) => Math.abs(t - c.detected[i]!) < 1e-9);
      if (c.base.startsWith('ambiguous')) {
        clean.ambiguous++;
        if (!same) clean.ambiguousChanged++;
        continue;
      }
      clean.n++;
      if (!same) {
        clean.changed++;
        if (a.beats.length !== c.detected.length) clean.countChanged++;
        else a.beats.forEach((t, i) => (clean.worstMove = Math.max(clean.worstMove, Math.abs(t - c.detected[i]!))));
      }
      if (sa.downbeats !== null && sb.downbeats !== null && sa.downbeats < sb.downbeats - 1e-9) clean.downbeatsLost++;
      continue;
    }
    const m = c.truth.m;
    const kb = sb.countError !== null && sb.countError % m === 0;
    const ka = sa.countError !== null && sa.countError % m === 0;
    const r = rows.get(c.failure) ?? { n: 0, keptBefore: 0, keptAfter: 0, broken: 0, passageBefore: 0, passageAfter: 0 };
    r.n++;
    r.keptBefore += +kb;
    r.keptAfter += +ka;
    r.broken += +(kb && !ka);
    r.passageBefore += sb.passageRecall ?? 0;
    r.passageAfter += sa.passageRecall ?? 0;
    rows.set(c.failure, r);
    const e = byEvidence.get(c.evidence) ?? { n: 0, kept: 0, keptBefore: 0, exact: 0, exactBefore: 0, broken: 0 };
    e.n++;
    e.kept += +ka;
    e.keptBefore += +kb;
    e.exact += +(sa.countError === 0);
    e.exactBefore += +(sb.countError === 0);
    e.broken += +(kb && !ka);
    byEvidence.set(c.evidence, e);
  }
  return { rows, byEvidence, clean };
}

const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(1)} %`;

describe('the beat repair on the case set', () => {
  const all = buildCases();
  const cases = FULL ? all : all.filter((c, i) => c.jitter < 0.02 && (c.failure === 'clean' || i % 2 === 0));
  const { rows, byEvidence, clean } = evaluate(cases);

  it('prints its figures', () => {
    const lines = [`${cases.length} cases${FULL ? ' (full set)' : ' (default subset)'}`];
    lines.push('failure mode                 cases  bars kept before → after  broken  true beats of the passage before → after');
    for (const [name, r] of rows) {
      lines.push(`${name.padEnd(28)} ${String(r.n).padStart(5)}  ${pct(r.keptBefore, r.n).padStart(8)} → ${pct(r.keptAfter, r.n).padEnd(8)}  ${String(r.broken).padStart(6)}  ${pct(r.passageBefore, r.n)} → ${pct(r.passageAfter, r.n)}`);
    }
    for (const [ev, e] of byEvidence) lines.push(`downbeat evidence ${ev.padEnd(6)}: bars kept ${pct(e.keptBefore, e.n)} → ${pct(e.kept, e.n)} of ${e.n} (beat count exact ${pct(e.exactBefore, e.n)} → ${pct(e.exact, e.n)}), broken ${e.broken}`);
    lines.push(`clean: ${clean.changed} of ${clean.n} changed (beat count ${clean.countChanged}, worst move ${(clean.worstMove * 1000).toFixed(0)} ms), downbeats lost in ${clean.downbeatsLost}`);
    lines.push(`fermatas of exactly 2 and 3 beats: ${clean.ambiguousChanged} of ${clean.ambiguous} changed`);
    console.log(lines.join('\n'));
    expect(rows.size).toBeGreaterThan(10);
  });

  it('changes nothing on the clean sequences', () => {
    expect(clean.changed).toBe(0);
    expect(clean.downbeatsLost).toBe(0);
  });

  it('keeps the bars in place after most failures, and breaks few that were right', () => {
    const sharp = byEvidence.get('sharp')!;
    const weak = byEvidence.get('weak')!;
    const none = byEvidence.get('none')!;
    // Before the repair the bars after a failure are kept only when it adds or removes a whole number of bars.
    expect(sharp.kept / sharp.n).toBeGreaterThan(0.95);
    expect(weak.kept / weak.n).toBeGreaterThan(0.93);
    expect(none.kept / none.n).toBeGreaterThan(0.58);
    expect(sharp.exact / sharp.n).toBeGreaterThan(0.85);
    for (const e of [sharp, weak, none]) expect(e.kept).toBeGreaterThan(2 * e.keptBefore);
    expect(sharp.broken).toBe(0);
    expect(weak.broken).toBe(0);
    const broken = [...rows.values()].reduce((s, r) => s + r.broken, 0);
    const right = [...rows.values()].reduce((s, r) => s + r.keptBefore, 0);
    expect(broken / right).toBeLessThan(0.015);
  });
});
