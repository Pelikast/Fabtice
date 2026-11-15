// The owner's realistic cases, on the beat network outputs the APP computes
// (Chromium decoding; the bench decodes with ffmpeg and gets other outputs):
// two pieces of the chord bench in the old-record condition, recorded with
// the app (`?debug`, the kept outputs; logits in tenths). So What: the
// network locks for a while onto the swung eighth (beats added, the grid on
// the off-beats), a dozen bar-to-bar jumps. Blues for Bird: a pickup and a
// missing beat in the first bars. Automatic analysis, then the bar menu's
// « Corriger un changement de tempo indésirable » at the first jumping bar of
// the grid the owner had (analyser version 4, before the last safety net).

import { describe, expect, it } from 'vitest';
import { downProbAt, postMinimal, type BeatActivations } from './beats';
import recorded from './fixtures/network-cases/app-cases.json';
import { gridFromActivations, gridFromBeats } from './pipeline';
import { ruleBreaks } from './steady';
import { applyTempoFix } from './tempoFix';
import type { GridHint } from '../types';

interface Recorded {
  beat: string;
  down: string;
  truth: { times: number[]; downbeat: number; meter: number };
}

const unpack = (s: string) => Float32Array.from(new Int8Array(Uint8Array.from(Buffer.from(s, 'base64')).buffer), (x) => x / 10);
const TOL = 0.07;

/** Beats found and true downbeats found (70 ms), within the music; bar-to-bar jumps (ratio beyond 1.25), within the music too. */
function score(truth: Recorded['truth'], g: GridHint) {
  const tb = truth.times;
  const inside = g.times.filter((v) => v >= tb[0]! - 0.5 && v <= tb[tb.length - 1]! + 0.5);
  const hits = tb.filter((x) => inside.some((v) => Math.abs(v - x) <= TOL)).length;
  const p = inside.filter((v) => tb.some((x) => Math.abs(v - x) <= TOL)).length / inside.length;
  const r = hits / tb.length;
  const m = g.meter.numerator;
  const downs = g.times.filter((_, i) => (((i - g.downbeat) % m) + m) % m === 0);
  const tdowns = tb.filter((_, i) => (((i - truth.downbeat) % truth.meter) + truth.meter) % truth.meter === 0);
  const down = tdowns.filter((td) => downs.some((v) => Math.abs(v - td) <= TOL)).length / tdowns.length;
  const bars: number[] = [];
  for (let i = g.downbeat; i + m < g.times.length; i += m) if (g.times[i + m]! <= tb[tb.length - 1]! + 0.5) bars.push(g.times[i + m]! - g.times[i]!);
  let jumps = 0;
  let first = -1;
  for (let k = 1; k < bars.length; k++) {
    if (Math.abs(Math.log(bars[k]! / bars[k - 1]!)) > Math.log(1.25)) {
      jumps++;
      if (first < 0) first = k;
    }
  }
  return { f: (2 * p * r) / (p + r || 1), down, jumps, first, beats: inside.length };
}

const hint = (g: { beats: number[]; numbers: number[]; beatsPerBar: number }): GridHint => ({ times: g.beats, downbeat: g.numbers.indexOf(1), meter: { numerator: g.beatsPerBar, denominator: 4 } });

const results = Object.entries(recorded.cases as unknown as Record<string, Recorded>).map(([name, r]) => {
  const beat = unpack(r.beat);
  const act: BeatActivations = { beat, down: unpack(r.down), frames: beat.length, fps: recorded.fps };
  const before = hint(gridFromBeats(postMinimal(act).beats, (t) => downProbAt(act, t), undefined, undefined, undefined, undefined, null).grid);
  const now = hint(gridFromActivations(act).grid);
  const s0 = score(r.truth, before);
  const from = before.times[before.downbeat + before.meter.numerator * s0.first]!;
  const fixed = applyTempoFix(act, { kind: 'continuity', from, grid: before });
  const numbers = (g: GridHint) => g.times.map((_, i) => ((((i - g.downbeat) % g.meter.numerator) + g.meter.numerator) % g.meter.numerator === 0 ? 1 : 2));
  return { name, truth: r.truth.times.length, before: s0, now: score(r.truth, now), fixed: score(r.truth, fixed), rule: ruleBreaks(now.times, numbers(now), now.meter.numerator).length };
});

describe('the owner’s cases on the app’s own network outputs', () => {
  it('prints the figures', () => {
    const f = (x: number) => `${(100 * x).toFixed(1)} %`;
    const line = (s: ReturnType<typeof score>) => `beats ${s.beats}, found ${f(s.f)}, downbeats ${f(s.down)}, jumps ${s.jumps}`;
    console.log(results.map((r) => `${r.name} (${r.truth} true beats)\n  version 4      ${line(r.before)}\n  now            ${line(r.now)}\n  « Corriger » at bar ${r.before.first + 1} of version 4: ${line(r.fixed)}`).join('\n'));
    expect(results.length).toBe(2);
  });

  it('So What: no jump left in the music, automatically or after « Corriger »', () => {
    const r = results.find((x) => x.name === 'so-what.disque')!;
    expect(r.before.jumps).toBeGreaterThanOrEqual(3);
    expect(r.now.jumps).toBe(0);
    expect(r.rule).toBe(0);
    expect(r.now.f).toBeGreaterThanOrEqual(r.before.f - 0.015);
    expect(r.now.down).toBeGreaterThan(r.before.down);
    expect(r.fixed.jumps).toBe(0);
    expect(r.fixed.f).toBeGreaterThan(r.before.f);
    expect(r.fixed.beats).toBeLessThanOrEqual(1.02 * r.truth);
  });

  it('Blues for Bird: « Corriger » at the second bar keeps the count and puts the bars right', () => {
    const r = results.find((x) => x.name === 'blues-bird.disque')!;
    expect(r.fixed.jumps).toBe(0);
    expect(Math.abs(r.fixed.beats - r.truth)).toBeLessThanOrEqual(2);
    expect(r.fixed.down).toBeGreaterThan(0.97);
    expect(r.fixed.f).toBeGreaterThanOrEqual(r.before.f);
  });
});
