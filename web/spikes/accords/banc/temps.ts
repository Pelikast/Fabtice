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
      ),
    ),
  /** The app before the bar-led repair (the beat repair alone). */
  old: (act) => asGrid(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), REPAIR, null, null)),
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

const opt = args();
if (process.argv[1]?.endsWith('temps.mjs')) {
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
