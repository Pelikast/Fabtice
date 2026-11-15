// End to end on the real beat network: its outputs on the demo piece and on
// altered versions of it (a passage where the band is almost gone, a wind line
// at another rate, an old-record colouring), recorded by
// `fixtures/network-cases/run_network.mjs`. On three of them the network
// itself loses or adds beats in the passage, the way the owner saw on an old
// record; before the repair every bar after it was shifted.

import { describe, expect, it } from 'vitest';
import { DEMO_SWING } from '../demoSwing';
import { downProbAt, postMinimal, type BeatActivations } from './beats';
import recorded from './fixtures/network-cases/network-cases.json';
import { gridFromActivations } from './pipeline';
import { before, score, type Case, type Outcome } from './repair.cases';

const truth = { beats: DEMO_SWING.beats.map((b) => b[0]), numbers: DEMO_SWING.beats.map((b) => b[1]), m: 4 };

interface Recorded {
  passage: [number, number] | null;
  beat: number[];
  down: number[];
}

function activations(r: Recorded): BeatActivations {
  return { beat: Float32Array.from(r.beat), down: Float32Array.from(r.down), frames: r.beat.length, fps: recorded.fps };
}

const results = Object.entries(recorded.cases as unknown as Record<string, Recorded>).map(([name, r]) => {
  const act = activations(r);
  const c: Case = {
    name,
    base: 'demo',
    failure: r.passage ? 'network' : 'clean',
    truth,
    detected: postMinimal(act).beats,
    downAt: (t) => downProbAt(act, t),
    evidence: 'sharp',
    jitter: 0,
    passage: r.passage,
  };
  const g = gridFromActivations(act);
  const now: Outcome = { beats: g.grid.beats, numbers: g.grid.numbers, m: g.grid.beatsPerBar, repaired: g.repairs.length };
  const old = before(c);
  const whole = { ...c, passage: null };
  return { name, c, repairs: g.repairs, was: score(c, old), is: score(c, now), wasWhole: score(whole, old), isWhole: score(whole, now), old, now };
});

describe('the repair on the real beat network', () => {
  it('prints the figures', () => {
    const f = (x: number | null) => (x === null ? '-' : `${(100 * x).toFixed(1)} %`);
    const lines = results.map(
      (r) =>
        `${r.name.padEnd(18)} beats ${f(r.wasWhole.recall)} → ${f(r.isWhole.recall)}, downbeats ${f(r.wasWhole.downbeats)} → ${f(r.isWhole.downbeats)}` +
        (r.c.passage ? `, after the passage ${f(r.was.downbeats)} → ${f(r.is.downbeats)}, beats counted ${r.was.countError} → ${r.is.countError}` : '') +
        `, repaired ${JSON.stringify(r.repairs.map((p) => [Number(p.start.toFixed(2)), Number(p.end.toFixed(2)), p.found, p.placed]))}`,
    );
    console.log(lines.join('\n'));
    expect(results.length).toBe(7);
  });

  it('changes nothing where the network did not fail', () => {
    for (const r of results.filter((x) => x.was.countError === 0 || x.was.countError === null)) {
      expect(r.now.beats, r.name).toEqual(r.old.beats);
      expect(r.now.numbers, r.name).toEqual(r.old.numbers);
    }
  });

  it('puts the bars back in place where the network lost or added beats, and finds the beats again', () => {
    const failed = results.filter((x) => x.was.countError !== null && x.was.countError !== 0);
    expect(failed.map((x) => x.name).sort()).toEqual(['gap-14.3-19.7', 'silence-14.3-19.7', 'wind-8.8-14.3']);
    for (const r of failed) {
      expect(r.was.downbeats, r.name).toBe(0);
      expect(r.is.countError, r.name).toBe(0);
      expect(r.is.downbeats, r.name).toBe(1);
      expect(r.isWhole.recall, r.name).toBeGreaterThanOrEqual(r.wasWhole.recall);
      expect(r.repairs.length, r.name).toBe(1);
    }
  });
});
