// The tempo hardening on REAL network outputs: the beat network (the app's,
// as the bench runs it) on pieces of the chord bench where the grid was wrong
// (passages read at half tempo, the old-record condition) and on pieces where
// it was right, with their true beats. Written by
// `web/spikes/accords/banc/temps.ts --fixture` (logits in tenths).

import { describe, expect, it } from 'vitest';
import { downProbAt, postMinimal, type BeatActivations } from './beats';
import recorded from './fixtures/network-cases/bench-cases.json';
import { firstDownbeat } from './grid';
import { gridFromActivations, gridFromBeats } from './pipeline';
import { REPAIR } from './repair';
import { jumpsOf, zigzagsOf } from './tempo.cases';

interface Recorded {
  split: 'dev' | 'test';
  beat: string;
  down: string;
  truth: { times: number[]; downbeat: number; meter: number };
}

const unpack = (s: string) => Float32Array.from(new Int8Array(Uint8Array.from(Buffer.from(s, 'base64')).buffer), (x) => x / 10);

interface Grid {
  times: number[];
  downbeat: number;
  bpb: number;
}

/** The chord bench's scores (`banc/score.ts`): beat F-measure and true downbeats found, 70 ms. */
function scoreGrid(truth: Recorded['truth'], g: Grid) {
  const TOL = 0.07;
  const tb = truth.times;
  let hits = 0;
  let j = 0;
  for (const x of tb) {
    while (j < g.times.length - 1 && g.times[j + 1]! <= x) j++;
    if ([g.times[j], g.times[j + 1]].some((v) => v !== undefined && Math.abs(v - x) <= TOL)) hits++;
  }
  const p = hits / g.times.length;
  const r = hits / tb.length;
  const downs = g.times.filter((_, i) => (((i - g.downbeat) % g.bpb) + g.bpb) % g.bpb === 0);
  const tdowns = tb.filter((_, i) => (((i - truth.downbeat) % truth.meter) + truth.meter) % truth.meter === 0);
  const dh = tdowns.filter((td) => downs.some((v) => Math.abs(v - td) <= TOL)).length;
  const tempi: number[] = [];
  for (let i = g.downbeat; i + g.bpb < g.times.length; i += g.bpb) if (g.times[i]! >= tb[0]! - TOL && g.times[i + g.bpb]! <= tb[tb.length - 1]! + TOL) tempi.push((60 * g.bpb) / (g.times[i + g.bpb]! - g.times[i]!));
  return { f: (2 * p * r) / (p + r || 1), down: dh / tdowns.length, jumps: jumpsOf(tempi), zigzags: zigzagsOf(tempi) };
}

const results = Object.entries(recorded.cases as unknown as Record<string, Recorded>).map(([name, r]) => {
  const beat = unpack(r.beat);
  const act: BeatActivations = { beat, down: unpack(r.down), frames: beat.length, fps: recorded.fps };
  const downAt = (t: number) => downProbAt(act, t);
  const was = gridFromBeats(postMinimal(act).beats, downAt, REPAIR, null, null).grid;
  const is = gridFromActivations(act).grid;
  const asGrid = (g: typeof was): Grid => ({ times: g.beats, downbeat: firstDownbeat(g), bpb: g.beatsPerBar });
  return { name, split: r.split, was: scoreGrid(r.truth, asGrid(was)), is: scoreGrid(r.truth, asGrid(is)), same: JSON.stringify(was.beats) === JSON.stringify(is.beats) };
});

describe('the tempo hardening on real network outputs (chord bench pieces)', () => {
  it('prints the figures', () => {
    const f = (x: number) => `${(100 * x).toFixed(1)} %`;
    console.log(
      results
        .map((r) => `${r.name.padEnd(32)} ${r.split.padEnd(4)} beats ${f(r.was.f)} → ${f(r.is.f)}, downbeats ${f(r.was.down)} → ${f(r.is.down)}, tempo jumps ${r.was.jumps} → ${r.is.jumps}, zigzags ${r.was.zigzags} → ${r.is.zigzags}${r.same ? ' (unchanged)' : ''}`)
        .join('\n'),
    );
    expect(results.length).toBe(15);
  });

  it('puts back the passages the network read at half tempo', () => {
    for (const name of ['anatole-sib.propre', 'blues-bird.propre', 'blues-sib-basie.propre', 'deux-cinq-mineur-rapide.propre', 'blue-bossa.disque', 'saints.disque']) {
      const r = results.find((x) => x.name === name)!;
      expect(r.is.f, name).toBeGreaterThan(0.99);
      expect(r.is.down, name).toBeGreaterThan(0.99);
      expect(r.is.jumps, name).toBe(0);
    }
  });

  it('leaves the right grids alone and makes none worse', () => {
    for (const name of ['valse-sib.propre', 'feuilles-mortes.propre', 'georgia.disque', 'ballade-cuivres.disque', 'bill-bailey.propre']) expect(results.find((x) => x.name === name)!.same, name).toBe(true);
    for (const r of results) {
      expect(r.is.jumps, r.name).toBeLessThanOrEqual(r.was.jumps);
      expect(r.is.f, r.name).toBeGreaterThanOrEqual(r.was.f - 0.02);
    }
  });
});
