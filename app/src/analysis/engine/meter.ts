// Time signature and downbeat phase from a beat sequence, ported unchanged
// from the prototype (`web/spikes/analyse/lib/meter.js`): one small HMM per
// candidate meter over "position in bar", fed with the network's downbeat
// probability at each beat. A small phase-jump probability lets the bar
// restart (an extra 2/4 bar, a missed beat).

export const METER_PRIOR: Record<number, number> = { 2: 0.06, 3: 0.2, 4: 0.6, 5: 0.04, 6: 0.04, 7: 0.03, 8: 0.03 };

interface Emissions {
  on: number[];
  off: number[];
}

function emissions(p: readonly number[]): Emissions {
  const q = p.map((x) => Math.min(0.98, Math.max(0.02, x)));
  return { on: q.map(Math.log), off: q.map((x) => Math.log(1 - x)) };
}

function logSumExp(arr: readonly number[]): number {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  if (m === -Infinity) return m;
  let s = 0;
  for (const v of arr) s += Math.exp(v - m);
  return m + Math.log(s);
}

/** Forward log-likelihood and Viterbi path for meter m. */
function runMeter(e: Emissions, m: number, jump: number): { ll: number; path: number[] } {
  const n = e.on.length;
  const stay = Math.log(1 - jump);
  const other = m > 1 ? Math.log(jump / (m - 1)) : -Infinity;
  const em = (i: number, pos: number) => (pos === 0 ? e.on[i]! : e.off[i]!);
  let alpha = Array.from({ length: m }, (_, pos) => -Math.log(m) + em(0, pos));
  let delta = alpha.slice();
  const bp: number[][] = [];
  for (let i = 1; i < n; i++) {
    const na = new Array<number>(m);
    const nd = new Array<number>(m);
    const b = new Array<number>(m);
    for (let pos = 0; pos < m; pos++) {
      const terms: number[] = [];
      let best = -Infinity;
      let arg = 0;
      for (let pp = 0; pp < m; pp++) {
        const tr = (pp + 1) % m === pos ? stay : other;
        terms.push(alpha[pp]! + tr);
        const v = delta[pp]! + tr;
        if (v > best) {
          best = v;
          arg = pp;
        }
      }
      na[pos] = logSumExp(terms) + em(i, pos);
      nd[pos] = best + em(i, pos);
      b[pos] = arg;
    }
    alpha = na;
    delta = nd;
    bp.push(b);
  }
  const ll = logSumExp(alpha);
  let pos = delta.indexOf(Math.max(...delta));
  const path = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    path[i] = pos;
    if (i > 0) pos = bp[i - 1]![pos]!;
  }
  return { ll, path };
}

export interface MeterScore {
  meter: number;
  /** Posterior over the candidates (prior included). */
  prob: number;
}

export interface MeterResult {
  beatsPerBar: number;
  /** Beat numbers in the bar, 1-based. */
  numbers: number[];
  /** Candidates, best first. */
  scores: MeterScore[];
}

export interface MeterOptions {
  candidates?: readonly number[];
  jump?: number;
  fixed?: number | null;
}

/**
 * downProb: per-beat downbeat probability. Returns the chosen meter, beat
 * numbers (1-based) and the per-meter scores so the interface can offer
 * alternatives.
 */
export function inferMeter(downProb: readonly number[], { candidates = [2, 3, 4, 5, 6, 7], jump = 0.002, fixed = null }: MeterOptions = {}): MeterResult {
  if (downProb.length < 4) {
    const bpb = fixed || 4;
    return { beatsPerBar: bpb, numbers: downProb.map((_, i) => (i % bpb) + 1), scores: [] };
  }
  const e = emissions(downProb);
  const cands = fixed ? [fixed] : candidates;
  const scores = cands.map((m) => {
    const r = runMeter(e, m, jump);
    return { meter: m, ll: r.ll, score: r.ll + Math.log(METER_PRIOR[m] || 0.02), path: r.path };
  });
  scores.sort((a, b) => b.score - a.score);
  const z = logSumExp(scores.map((s) => s.score));
  const best = scores[0]!;
  return {
    beatsPerBar: best.meter,
    numbers: best.path.map((p) => p + 1),
    scores: scores.map((s) => ({ meter: s.meter, prob: Math.exp(s.score - z) })),
  };
}
