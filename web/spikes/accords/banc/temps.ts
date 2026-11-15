// The beat bench: the app's beat grid (or another beat post-processing) on
// every piece of the corpus, from the cached network outputs, against the true
// beats. Per piece: beat F-measure, downbeats found (the bench's definitions,
// `score.ts`), spurious tempo jumps (consecutive bars whose tempo differs by
// a ratio of 1.3 or more, minus those of the truth), and where the grid is at
// another metrical level than the truth (ratio of the found to the true local
// beat interval, grouped into runs). Usage:
//
//   node dist/temps.mjs [--methods app,none] [--only id1,id2] [--conditions propre,disque]
//                       [--runs] [--fixture <file.json> --fixture-ids id.condition,…]
//
// `--fixture` writes the network outputs (logits in tenths, signed bytes in
// base64) and the true grid of the listed pieces, for the app's tests
// (`app/src/analysis/engine/tempo.bench.test.ts`).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BeatActivations } from '../../../../app/src/analysis/engine/beats';
import { gridFromActivations, gridFromBeats } from '../../../../app/src/analysis/engine/pipeline';
import { downProbAt, pickPeaks, postMinimal } from '../../../../app/src/analysis/engine/beats';
import { REPAIR } from '../../../../app/src/analysis/engine/repair';
import { DISPLACED } from '../../../../app/src/analysis/engine/displaced';
import { STEADY, ruleBreaks } from '../../../../app/src/analysis/engine/steady';
import { TEMPO_FIX, applyTempoFix } from '../../../../app/src/analysis/engine/tempoFix';
import { BARS, barChains, downbeatPeaks, repairByBars } from '../../../../app/src/analysis/engine/bars';
import { firstDownbeat } from '../../../../app/src/analysis/engine/grid';
import { networks } from './networks';
import { ROOT } from './paths';
// @ts-expect-error the prototype is plain JavaScript
import { dbnDecode } from '../../analyse/lib/dbn.js';
import { loadCorpus, type Truth } from './truth';

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

export interface FoundGrid {
  times: number[];
  downbeat: number;
  beatsPerBar: number;
}

type Method = (act: BeatActivations) => FoundGrid;

const asGrid = (g: ReturnType<typeof gridFromActivations>): FoundGrid => ({ times: g.grid.beats, downbeat: firstDownbeat(g.grid), beatsPerBar: g.grid.beatsPerBar });

export const METHODS: Record<string, Method> = {
  /** What the app does. */
  app: (act) => asGrid(gridFromActivations(act)),
  /** The peaks, no repair (the single phase only). */
  none: (act) => asGrid(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), null)),
  /** The app with other options of the bar-led repair (BARS_OPTS, JSON) and of the beat repair (REPAIR_OPTS). */
  tune: (act) =>
    asGrid(
      gridFromBeats(
        postMinimal(act).beats,
        (t) => downProbAt(act, t),
        { ...REPAIR, ...JSON.parse(process.env.REPAIR_OPTS ?? '{}') },
        { ...BARS, ...JSON.parse(process.env.BARS_OPTS ?? '{}') },
        process.env.DISPLACED_OPTS === 'off' ? null : { ...DISPLACED, ...JSON.parse(process.env.DISPLACED_OPTS ?? '{}') },
        [3, 4],
        process.env.STEADY_OPTS === 'off' ? null : { ...STEADY, ...JSON.parse(process.env.STEADY_OPTS ?? '{}') },
      ),
    ),
  /** Analyser version 4: everything but the last safety net. */
  v4: (act) => asGrid(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), REPAIR, BARS, DISPLACED, [3, 4], null)),
  /** The app before the bar-led repair (the beat repair alone). */
  old: (act) => asGrid(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), REPAIR, null, null, [3, 4], null)),
  /** The prototype's beat-only DBN, then the app's metre and phase (no repair). */
  dbn: (act) => asGrid(gridFromBeats(dbnDecode(act, { beatsPerBar: 1, minBpm: 40, maxBpm: 300, lambda: LAMBDA }).beats, (t) => downProbAt(act, t), null)),
  /** The prototype's joint beat and bar DBN (3 or 4 beats). */
  joint: (act) => {
    const runs = [3, 4].map((m) => dbnDecode(act, { beatsPerBar: m, minBpm: 40, maxBpm: 300, lambda: LAMBDA }));
    runs.sort((a: { logProb: number }, b: { logProb: number }) => b.logProb - a.logProb);
    const r = runs[0];
    return { times: r.beats, downbeat: Math.max(0, r.numbers.indexOf(1)), beatsPerBar: r.beatsPerBar };
  },
};

const TOL = 0.07;
const LAMBDA = Number(process.env.LAMBDA ?? 100);

/** Per-bar tempo (BPM) of a grid: bars every `bpb` beats from `downbeat`. */
export function barTempi(times: readonly number[], downbeat: number, bpb: number, span: [number, number] = [-Infinity, Infinity]): number[] {
  const out: number[] = [];
  for (let i = downbeat; i + bpb < times.length; i += bpb) if (times[i]! >= span[0] - 0.07 && times[i + bpb]! <= span[1] + 0.07) out.push((60 * bpb) / (times[i + bpb]! - times[i]!));
  return out;
}

export function jumps(tempi: readonly number[], ratio = 1.3): number {
  let n = 0;
  for (let i = 1; i < tempi.length; i++) if (Math.max(tempi[i]! / tempi[i - 1]!, tempi[i - 1]! / tempi[i]!) >= ratio) n++;
  return n;
}

/** Bars faster than both neighbours, or slower than both, by `ratio` or more: the curve's zigzags. */
export function reversals(tempi: readonly number[], ratio = 1.05): number {
  let n = 0;
  for (let i = 1; i + 1 < tempi.length; i++) {
    const a = tempi[i - 1]!;
    const b = tempi[i]!;
    const c = tempi[i + 1]!;
    if ((b >= a * ratio && b >= c * ratio) || (b * ratio <= a && b * ratio <= c)) n++;
  }
  return n;
}

/** Total variation of the per-bar tempo, in log units per bar. */
export function variation(tempi: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < tempi.length; i++) s += Math.abs(Math.log(tempi[i]! / tempi[i - 1]!));
  return s / Math.max(1, tempi.length - 1);
}

export interface BeatScore {
  beatF: number;
  downbeats: number;
  jumps: number;
  truthJumps: number;
  /** Zigzags of 5 % or more, found and true. */
  rev: number;
  truthRev: number;
  /** Mean bar-to-bar tempo change (log), found and true. */
  tv: number;
  truthTv: number;
  found: number;
  truth: number;
}

export function scoreGrid(truth: { times: number[]; downbeat: number; meter: number }, g: FoundGrid): BeatScore {
  const tb = truth.times;
  const found = g.times;
  let hits = 0;
  let j = 0;
  for (const x of tb) {
    while (j < found.length - 1 && found[j + 1]! <= x) j++;
    const near = [found[j], found[j + 1]].filter((v): v is number => v !== undefined);
    if (near.some((v) => Math.abs(v - x) <= TOL)) hits++;
  }
  const p = hits / Math.max(1, found.length);
  const r = hits / Math.max(1, tb.length);
  const bpb = g.beatsPerBar;
  const downs = found.filter((_, i) => (((i - g.downbeat) % bpb) + bpb) % bpb === 0);
  const tdowns = tb.filter((_, i) => (((i - truth.downbeat) % truth.meter) + truth.meter) % truth.meter === 0);
  let dh = 0;
  for (const td of tdowns) if (downs.some((v) => Math.abs(v - td) <= TOL)) dh++;
  return {
    beatF: p + r ? (2 * p * r) / (p + r) : 0,
    downbeats: dh / Math.max(1, tdowns.length),
    jumps: jumps(barTempi(found, g.downbeat, bpb, [tb[0]!, tb[tb.length - 1]!])),
    truthJumps: jumps(barTempi(tb, truth.downbeat, truth.meter)),
    rev: reversals(barTempi(found, g.downbeat, bpb, [tb[0]!, tb[tb.length - 1]!])),
    truthRev: reversals(barTempi(tb, truth.downbeat, truth.meter)),
    tv: variation(barTempi(found, g.downbeat, bpb, [tb[0]!, tb[tb.length - 1]!])),
    truthTv: variation(barTempi(tb, truth.downbeat, truth.meter)),
    found: found.length,
    truth: tb.length,
  };
}

const LEVELS: [string, number][] = [
  ['1/4', 1 / 4], ['1/3', 1 / 3], ['1/2', 1 / 2], ['2/3', 2 / 3], ['3/4', 3 / 4], ['1', 1],
  ['4/3', 4 / 3], ['3/2', 3 / 2], ['2', 2], ['3', 3], ['4', 4],
];

/** Runs of the ratio found interval / true local interval, as « level×count from time ». */
export function levelRuns(truth: readonly number[], found: readonly number[]): string {
  const trueInterval = (t: number) => {
    let i = 0;
    while (i < truth.length - 2 && truth[i + 1]! < t) i++;
    return truth[i + 1]! - truth[i]!;
  };
  const labels = found.slice(1).map((t, i) => {
    const mid = (t + found[i]!) / 2;
    const r = (t - found[i]!) / trueInterval(mid);
    let best = '?';
    for (const [name, v] of LEVELS) if (Math.abs(Math.log(r / v)) < 0.1) best = name;
    return { best, t: found[i]! };
  });
  const runs: string[] = [];
  let k = 0;
  while (k < labels.length) {
    let e = k;
    while (e + 1 < labels.length && labels[e + 1]!.best === labels[k]!.best) e++;
    runs.push(`${labels[k]!.best}×${e - k + 1}@${labels[k]!.t.toFixed(1)}`);
    k = e + 1;
  }
  return runs.join(' ');
}

export function truthOf(t: Truth, condition: string) {
  const s = t.conditions[condition]!.timeScale;
  return { times: t.beats.map((x) => x * s), downbeat: t.downbeat, meter: t.meter };
}

/**
 * The first bar of a grid that goes wrong: the bar (its downbeat in the grid)
 * holding the first true beat not found, or found with the wrong bar number.
 * Null when the grid is right all through.
 */
export function firstWrongBar(truth: { times: number[]; downbeat: number; meter: number }, g: FoundGrid): number | null {
  const m = g.beatsPerBar;
  let lastGood = -1;
  let good = 0;
  for (let k = 0; k < truth.times.length; k++) {
    const x = truth.times[k]!;
    if (x < g.times[0]! - TOL) continue; // before the grid begins
    let i = -1;
    for (let q = Math.max(0, lastGood); q < g.times.length; q++) {
      if (Math.abs(g.times[q]! - x) <= TOL) {
        i = q;
        break;
      }
      if (g.times[q]! > x + TOL) break;
    }
    const trueDown = (((k - truth.downbeat) % truth.meter) + truth.meter) % truth.meter === 0;
    const down = i >= 0 && (((i - g.downbeat) % m) + m) % m === 0;
    if (i < 0 || trueDown !== down) {
      // Wrong before two right bars: the grid is wrong from its start (a phase error, not a tempo accident).
      if (good < 2 * m) return null;
      let d = lastGood;
      while (d > 0 && (((d - g.downbeat) % m) + m) % m !== 0) d--;
      return g.times[d]!;
    }
    lastGood = i;
    good++;
  }
  return null;
}

/**
 * Every tempo jump (≥ `ratio` between neighbouring bars) of a grid, with what
 * causes it: `edge` (first or last bar of the music), `lost` (fewer than half
 * of the bar's beats on true beats: the network lost the pulse), `count` (the
 * beats are true beats, but the bar holds another number of them than the
 * metre), `downbeat` (the right number, the bar line a beat early or late),
 * `timing` (all right but the beats' own placing).
 */
export function jumpCauses(truth: { times: number[]; downbeat: number; meter: number }, g: FoundGrid, ratio = 1.3): { at: number; cause: string; tempi: [number, number] }[] {
  const m = g.beatsPerBar;
  const tb = truth.times;
  const span: [number, number] = [tb[0]!, tb[tb.length - 1]!];
  const bars: { t0: number; t1: number; i0: number; tempo: number }[] = [];
  for (let i = g.downbeat; i + m < g.times.length; i += m) {
    const t0 = g.times[i]!;
    const t1 = g.times[i + m]!;
    if (t0 >= span[0] - TOL && t1 <= span[1] + TOL) bars.push({ t0, t1, i0: i, tempo: (60 * m) / (t1 - t0) });
  }
  const onTrue = (t: number) => tb.some((x) => Math.abs(x - t) <= TOL);
  const trueDown = (t: number) => tb.some((x, k) => Math.abs(x - t) <= TOL && (((k - truth.downbeat) % truth.meter) + truth.meter) % truth.meter === 0);
  const out: { at: number; cause: string; tempi: [number, number] }[] = [];
  for (let k = 1; k < bars.length; k++) {
    const a = bars[k - 1]!;
    const b = bars[k]!;
    if (Math.max(a.tempo / b.tempo, b.tempo / a.tempo) < ratio) continue;
    let cause = 'timing';
    if (k === 1 || k === bars.length - 1) cause = 'edge';
    else {
      const lost = [a, b].some((x) => g.times.slice(x.i0, x.i0 + m).filter(onTrue).length < m / 2);
      const nTrue = (x: typeof a) => tb.filter((t) => t >= x.t0 - TOL && t < x.t1 - TOL).length;
      if (lost) cause = 'lost';
      else if (nTrue(a) !== truth.meter || nTrue(b) !== truth.meter) cause = 'count';
      else if (![a.t0, b.t0, b.t1].every(trueDown)) cause = 'downbeat';
    }
    out.push({ at: b.t0, cause, tempi: [a.tempo, b.tempo] });
  }
  return out;
}

const opt = args();
if (process.argv[1]?.endsWith('temps.mjs') && opt.net) {
  // --net id.condition: the passages the last safety net re-grids, the beats before and after it, the true beats.
  const [id, cond] = opt.net.split('.');
  const t = loadCorpus().find((x) => x.id === id)!;
  const act = (await networks(`${t.dir}/${t.conditions[cond!]!.mix}`)).outputs.act;
  const tr = truthOf(t, cond!);
  const r = gridFromBeats(postMinimal(act).beats, (x) => downProbAt(act, x), REPAIR, BARS, DISPLACED, [3, 4], process.env.STEADY_OPTS === 'off' ? null : { ...STEADY, ...JSON.parse(process.env.STEADY_OPTS ?? '{}') });
  const before = METHODS.v4!(act);
  const all = (g: FoundGrid) => barTempi(g.times, g.downbeat, g.beatsPerBar).map((x) => x.toFixed(0)).join(' ');
  console.log(`bar tempi v4   ${all(before)}\nbar tempi now  ${all(asGrid({ grid: r.grid, meterScores: [], repairs: [] }))}\nbar tempi true ${barTempi(tr.times, tr.downbeat, tr.meter).map((x) => x.toFixed(0)).join(' ')}`);
  for (const j of jumpCauses(tr, before)) console.log(`jump v4 ${j.at.toFixed(2)} ${j.cause} ${j.tempi.map((x) => x.toFixed(0)).join('→')}`);
  for (const p of r.repairs.filter((x) => x.cause === 'steady')) {
    const show = (a: readonly number[]) => a.filter((x) => x >= p.start - 0.01 && x <= p.end + 0.01).map((x) => x.toFixed(2)).join(' ');
    const tempi = (g: FoundGrid) => barTempi(g.times, g.downbeat, g.beatsPerBar, [p.start - 8, p.end + 8]).map((x) => x.toFixed(0)).join(' ');
    console.log(`steady ${p.start.toFixed(2)}–${p.end.toFixed(2)} found ${p.found} placed ${p.placed}\n  v4    ${show(before.times)}\n  now   ${show(r.grid.beats)}\n  true  ${show(tr.times)}\n  bar tempi v4 ${tempi(before)}\n  bar tempi now ${tempi(asGrid({ grid: r.grid, meterScores: [], repairs: [] }))}`);
  }
} else if (process.argv[1]?.endsWith('temps.mjs') && opt.jumps) {
  // --jumps: every tempo jump of the app's grid, by cause.
  const tally = new Map<string, number>();
  for (const t of loadCorpus()) {
    for (const condition of Object.keys(t.conditions)) {
      const act = (await networks(`${t.dir}/${t.conditions[condition]!.mix}`)).outputs.act;
      const truth = truthOf(t, condition);
      const g = METHODS[opt.jumps === 'true' ? 'app' : opt.jumps]!(act);
      const js = jumpCauses(truth, g);
      // Passages that still break the owner's rule on the grid shown (the last safety net's own test).
      const downs = g.times.filter((_, i) => i >= g.downbeat && (i - g.downbeat) % g.beatsPerBar === 0);
      const left = ruleBreaks(g.times, g.times.map((_, i) => ((((i - g.downbeat) % g.beatsPerBar) + g.beatsPerBar) % g.beatsPerBar === 0 ? 1 : 2)), g.beatsPerBar, { ...STEADY, ...JSON.parse(process.env.STEADY_OPTS ?? '{}') });
      if (left.length) {
        tally.set(`${condition}|rule broken`, (tally.get(`${condition}|rule broken`) ?? 0) + left.length);
        console.log(`${t.id.padEnd(24)} ${condition.padEnd(11)} RULE ${left.map((p) => `${downs[p.from]!.toFixed(1)}–${downs[p.to + 1]!.toFixed(1)}s`).join(' ')}`);
      }
      if (!js.length) continue;
      for (const j of js) tally.set(`${condition}|${j.cause}`, (tally.get(`${condition}|${j.cause}`) ?? 0) + 1);
      console.log(`${t.id.padEnd(24)} ${condition.padEnd(11)} ${js.map((j) => `${j.at.toFixed(1)}s ${j.cause} ${j.tempi[0].toFixed(0)}→${j.tempi[1].toFixed(0)}`).join(' | ')}`);
    }
  }
  console.log('\n' + [...tally.entries()].sort().map(([k, v]) => `${k.padEnd(24)} ${v}`).join('\n'));
} else if (process.argv[1]?.endsWith('temps.mjs') && opt.manual) {
  // --manual: the two actions of the bar menu applied at the first wrong bar of the app's grid, on every piece where it is wrong.
  const partage = JSON.parse(readFileSync(join(ROOT, 'banc', 'partage.json'), 'utf8')) as { dev: string[]; test: string[] };
  const inList = (id: string, list: string[]) => list.some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : p === id));
  const ok = (s: BeatScore) => s.beatF >= 0.97 && s.downbeats >= 0.97 && s.jumps <= s.truthJumps;
  const tally = new Map<string, { wrong: number; fixed: number; better: number; worse: number }>();
  const fixOpts = { ...TEMPO_FIX, ...JSON.parse(process.env.FIX_OPTS ?? '{}') };
  for (const t of loadCorpus()) {
    if (opt.split && !inList(t.id, opt.split === 'dev' ? partage.dev : partage.test)) continue;
    for (const condition of Object.keys(t.conditions)) {
      const act = (await networks(`${t.dir}/${t.conditions[condition]!.mix}`)).outputs.act;
      const truth = truthOf(t, condition);
      const g = METHODS.app!(act);
      const s0 = scoreGrid(truth, g);
      if (ok(s0)) continue;
      const from = firstWrongBar(truth, g);
      const cells: string[] = [`app F ${(100 * s0.beatF).toFixed(1)} D ${(100 * s0.downbeats).toFixed(1)} J ${s0.jumps}`];
      for (const kind of ['continuity', 'fresh'] as const) {
        const key = `${condition}|${kind}`;
        const tl = tally.get(key) ?? { wrong: 0, fixed: 0, better: 0, worse: 0 };
        tl.wrong++;
        if (from === null) {
          tally.set(key, tl);
          cells.push(`${kind}: wrong from the start`);
          continue;
        }
        const hint = { times: g.times, downbeat: g.downbeat, meter: { numerator: g.beatsPerBar, denominator: 4 } };
        const r = applyTempoFix(act, { kind, from, grid: hint }, fixOpts);
        if (opt.only === t.id) {
          const show = (a: readonly number[]) => a.filter((x) => x >= from - 3 && x <= from + 12).map((x) => x.toFixed(2)).join(' ');
          const downs = (a: readonly number[], d: number, mm: number) => a.filter((x, i) => (((i - d) % mm) + mm) % mm === 0 && x >= from - 3 && x <= from + 12).map((x) => x.toFixed(2)).join(' ');
          console.log(`  ${kind}\n    grid  ${show(g.times)}\n    now   ${show(r.times)}\n    true  ${show(truth.times)}\n    downs now ${downs(r.times, r.downbeat, r.meter.numerator)} | true ${downs(truth.times, truth.downbeat, truth.meter)}`);
        }
        const s1 = scoreGrid(truth, { times: r.times, downbeat: r.downbeat, beatsPerBar: r.meter.numerator });
        const gain = s1.beatF - s0.beatF + s1.downbeats - s0.downbeats;
        tl.fixed += +ok(s1);
        tl.better += +(gain > 0.02);
        tl.worse += +(gain < -0.02);
        tally.set(key, tl);
        cells.push(`${kind} F ${(100 * s1.beatF).toFixed(1)} D ${(100 * s1.downbeats).toFixed(1)} J ${s1.jumps}`);
      }
      console.log(`${t.id.padEnd(24)} ${condition.padEnd(11)} from ${from === null ? '-' : from.toFixed(1)} | ${cells.join(' | ')}`);
    }
  }
  console.log('\ncondition    action       wrong  fixed  better  worse');
  for (const [k, v] of [...tally.entries()].sort()) {
    const [c, a] = k.split('|');
    console.log(`${c!.padEnd(12)} ${a!.padEnd(11)} ${String(v.wrong).padStart(6)} ${String(v.fixed).padStart(6)} ${String(v.better).padStart(7)} ${String(v.worse).padStart(6)}`);
  }
} else if (process.argv[1]?.endsWith('temps.mjs')) {
  const methods = (opt.methods ?? 'none,app').split(',');
  const only = opt.only ? new Set(opt.only.split(',')) : null;
  const wanted = opt.conditions ? opt.conditions.split(',') : null;
  const fixtureIds = opt['fixture-ids'] ? new Set(opt['fixture-ids'].split(',')) : null;
  const fixture: Record<string, unknown> = {};
  const totals = new Map<string, { n: number; f: number; d: number; jumps: number; truthJumps: number; perfect: number; rev: number; truthRev: number; tv: number; truthTv: number }>();
  const partage = JSON.parse(readFileSync(join(ROOT, 'banc', 'partage.json'), 'utf8')) as { dev: string[]; test: string[] };
  const inList = (id: string, list: string[]) => list.some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : p === id));
  for (const t of loadCorpus()) {
    if (only && !only.has(t.id)) continue;
    if (opt.split && !inList(t.id, opt.split === 'dev' ? partage.dev : partage.test)) continue;
    for (const condition of Object.keys(t.conditions)) {
      if (wanted && !wanted.includes(condition)) continue;
      const net = await networks(`${t.dir}/${t.conditions[condition]!.mix}`);
      const act = net.outputs.act;
      const truth = truthOf(t, condition);
      const cells: string[] = [];
      for (const m of methods) {
        const g = METHODS[m]!(act);
        const s = scoreGrid(truth, g);
        const key = `${condition}|${m}`;
        const tot = totals.get(key) ?? { n: 0, f: 0, d: 0, jumps: 0, truthJumps: 0, perfect: 0, rev: 0, truthRev: 0, tv: 0, truthTv: 0 };
        tot.rev += s.rev;
        tot.truthRev += s.truthRev;
        tot.tv += s.tv;
        tot.truthTv += s.truthTv;
        tot.n++;
        tot.f += s.beatF;
        tot.d += s.downbeats;
        tot.jumps += Math.max(0, s.jumps - s.truthJumps);
        tot.truthJumps += s.truthJumps;
        tot.perfect += +(s.beatF > 0.97 && s.downbeats > 0.97);
        totals.set(key, tot);
        cells.push(`${m} F ${(100 * s.beatF).toFixed(1).padStart(5)} D ${(100 * s.downbeats).toFixed(1).padStart(5)} J ${String(s.jumps).padStart(2)} n ${s.found} Z ${s.rev}/${s.truthRev} V ${(100 * s.tv).toFixed(1)}/${(100 * s.truthTv).toFixed(1)}`);
        if (opt.runs && m === methods[methods.length - 1]) cells.push(`\n    ${levelRuns(truth.times, g.times)}`);
      }
      console.log(`${t.id.padEnd(24)} ${condition.padEnd(11)} truth n ${truth.times.length} J ${scoreGrid(truth, { times: truth.times, downbeat: truth.downbeat, beatsPerBar: truth.meter }).jumps} | ${cells.join(' | ')}`);
      if (fixtureIds?.has(`${t.id}.${condition}`)) {
        // Logits in tenths, as signed bytes (−12.7 … 12.7), base64: what the grid needs, small enough to commit.
        const pack = (a: Float32Array) => Buffer.from(Int8Array.from(a, (x) => Math.max(-127, Math.min(127, Math.round(x * 10)))).buffer).toString('base64');
        fixture[`${t.id}.${condition}`] = {
          split: inList(t.id, partage.dev) ? 'dev' : 'test',
          beat: pack(act.beat),
          down: pack(act.down),
          truth: { times: truth.times.map((x) => Math.round(x * 1000) / 1000), downbeat: truth.downbeat, meter: truth.meter },
        };
      }
    }
  }
  console.log('\ncondition    method   pieces  beat F   downbeats  spurious jumps  right (F, D > 97 %)  zigzags ≥5 % (true)  bar-to-bar change % (true)');
  for (const [k, v] of [...totals.entries()].sort()) {
    const [c, m] = k.split('|');
    console.log(`${c!.padEnd(12)} ${m!.padEnd(8)} ${String(v.n).padStart(6)}  ${((100 * v.f) / v.n).toFixed(1).padStart(5)} %  ${((100 * v.d) / v.n).toFixed(1).padStart(6)} %  ${String(v.jumps).padStart(8)}        ${String(v.perfect).padStart(3)}               ${v.rev} (${v.truthRev})            ${((100 * v.tv) / v.n).toFixed(2)} (${((100 * v.truthTv) / v.n).toFixed(2)})`);
  }
  if (opt.chains) {
    // --chains id.condition — the bar chains of the bar-led repair, with each bar's beat count and the true bars.
    const [id, cond] = opt.chains.split('.');
    const t = loadCorpus().find((x) => x.id === id)!;
    const act = (await networks(`${t.dir}/${t.conditions[cond!]!.mix}`)).outputs.act;
    const tr = truthOf(t, cond!);
    const { beats } = postMinimal(act);
    const downAt = (x: number) => downProbAt(act, x);
    const peaks = downbeatPeaks(downAt, 0, beats[beats.length - 1]! + 2, BARS.minDown);
    const chains = barChains(peaks, beats);
    const tdowns = tr.times.filter((_, i) => (((i - tr.downbeat) % tr.meter) + tr.meter) % tr.meter === 0);
    const fixed = repairByBars(beats, downAt, [3, 4], 4);
    console.log('meter', fixed.meter);
    for (const name of ['old', 'app']) {
      const g = METHODS[name]!(act);
      const downs = g.times.filter((_, i) => (((i - g.downbeat) % g.beatsPerBar) + g.beatsPerBar) % g.beatsPerBar === 0);
      const tds = tr.times.filter((_, i) => (((i - tr.downbeat) % tr.meter) + tr.meter) % tr.meter === 0);
      console.log(name.padEnd(4), 'true downbeats hit:', tds.map((x) => (downs.some((v) => Math.abs(v - x) <= 0.07) ? '1' : '.')).join(''));
      console.log('     downbeats', downs.slice(0, 8).map((x) => x.toFixed(2)).join(' '), '| true', tds.slice(0, 8).map((x) => x.toFixed(2)).join(' '), '| meter', g.beatsPerBar);
      // Zigzags of the bar tempo: the bar, its neighbours' tempi, and how far each beat around is from the nearest true beat (ms).
      const bt = barTempi(g.times, g.downbeat, g.beatsPerBar);
      const err = (x: number) => Math.round(1000 * (x - tr.times[Math.max(0, Math.min(tr.times.length - 1, tr.times.findIndex((v) => v > x) - 0.5 < 0 ? 0 : tr.times.reduce((bi, v, i) => (Math.abs(v - x) < Math.abs(tr.times[bi]! - x) ? i : bi), 0)))]!));
      for (let b = 1; b + 1 < bt.length; b++) {
        const [a, c, d] = [bt[b - 1]!, bt[b]!, bt[b + 1]!];
        if (!((c >= a * 1.05 && c >= d * 1.05) || (c * 1.05 <= a && c * 1.05 <= d))) continue;
        const i0 = g.downbeat + b * g.beatsPerBar;
        const around = g.times.slice(Math.max(0, i0 - g.beatsPerBar), i0 + 2 * g.beatsPerBar + 1);
        console.log(`     zigzag bar at ${g.times[i0]!.toFixed(2)}: ${a.toFixed(0)} ${c.toFixed(0)} ${d.toFixed(0)} BPM; beat errors ms ${around.map(err).join(' ')}`);
      }
    }
    for (const r of fixed.repairs) {
      const show = (a: readonly number[]) => a.filter((x) => x >= r.start - 1e-6 && x <= r.end + 1e-6).map((x) => x.toFixed(2)).join(' ');
      console.log(`repaired ${r.start.toFixed(2)}–${r.end.toFixed(2)}\n  found ${show(beats)}\n  now   ${show(fixed.beats)}\n  true  ${show(tr.times)}`);
    }
    chains.forEach((c, k) => {
      console.log(`chain ${k}: ${c.length} bars`);
      console.log(
        '  ' +
          c
            .map((b) => {
              const n = beats.filter((x) => x >= b.t0 - 1e-6 && x < b.t1 - 1e-6).length;
              const td = tdowns.some((x) => Math.abs(x - b.t0) < 0.07) ? '' : '!';
              return `${b.t0.toFixed(1)}${td}:${n}${b.n > 1 ? `/${b.n}` : ''}`;
            })
            .join(' '),
      );
    });
  }
  if (opt.peaks) {
    // --peaks id.condition:from:to — the network's beat and downbeat peaks there, with the true beats.
    const [pc, from, to] = opt.peaks.split(':');
    const [id, cond] = pc!.split('.');
    const t = loadCorpus().find((x) => x.id === id)!;
    const act = (await networks(`${t.dir}/${t.conditions[cond!]!.mix}`)).outputs.act;
    const tr = truthOf(t, cond!);
    const inR = (x: number) => x >= Number(from) && x <= Number(to);
    const fmt = (a: number[]) => a.filter(inR).map((x) => x.toFixed(2)).join(' ');
    const { beats } = postMinimal(act);
    const dpk = pickPeaks(act.down).map((f) => f / act.fps);
    console.log('true beats ', fmt(tr.times));
    console.log('true downs ', fmt(tr.times.filter((_, i) => (((i - tr.downbeat) % tr.meter) + tr.meter) % tr.meter === 0)));
    console.log('beat peaks ', fmt(beats));
    console.log('down peaks ', fmt(dpk));
    const near = (x: number) => { let m = -99; for (let f = Math.round(x * act.fps) - 2; f <= Math.round(x * act.fps) + 2; f++) m = Math.max(m, act.beat[f] ?? -99); return m; };
    console.log('logit at true beats', tr.times.filter(inR).map((x) => near(x).toFixed(1)).join(' '));
    console.log('beat logits', fmt(beats).split(' ').map((x) => act.beat[Math.round(Number(x) * act.fps)]!.toFixed(1)).join(' '));
  }
  if (opt.fixture) writeFileSync(opt.fixture, JSON.stringify({ fps: 50, cases: fixture }));
}
