import { describe, expect, it } from 'vitest';
import decisions from './fixtures/decisions.json';
import { DECISION, decide } from './decide';
import { groupScores, meanScores, type Group, type GroupScores } from './model';

const ZERO: GroupScores = {
  trumpet: 0, trombone: 0, saxophone: 0, clarinet: 0, flute: 0, brass: 0, woodwind: 0,
  piano: 0, guitar: 0, vibraphone: 0, violin: 0, organ: 0, voice: 0,
};
const scores = (s: Partial<Record<Group, number>>): GroupScores => ({ ...ZERO, ...s });

describe('decide', () => {
  it('names a wind that clearly leads', () => {
    const g = decide(scores({ trumpet: 0.8, saxophone: 0.1, brass: 0.6 }));
    expect(g?.instrument).toBe('trumpet');
    expect(g?.confidence).toBeCloseTo(1 - 0.1 / 0.8, 6);
  });

  it('says « Vents » when two winds are close', () => {
    expect(decide(scores({ saxophone: 0.5, clarinet: 0.4 }))).toEqual({ instrument: 'winds', confidence: expect.any(Number) });
  });

  it('says « Vents » for a weak wind top, however clear', () => {
    expect(decide(scores({ flute: 0.2 }))?.instrument).toBe('winds');
  });

  it('names a non-wind lead only when it is clear', () => {
    expect(decide(scores({ vibraphone: 0.7, piano: 0.1 }))?.instrument).toBe('vibraphone');
    expect(decide(scores({ piano: 0.5, guitar: 0.3 }))).toBeNull();
    expect(decide(scores({ piano: 0.9, guitar: 0.05 }))).toBeNull(); // never named here
    expect(decide(scores({ voice: 0.9 }))).toBeNull();
  });

  it('says « Vents » for an unsure non-wind top when the wind families are heard', () => {
    expect(decide(scores({ violin: 0.4, flute: 0.35 }))?.instrument).toBe('winds');
    expect(decide(scores({ piano: 0.4, guitar: 0.3, brass: 0.3 }))?.instrument).toBe('winds');
  });

  it('answers null for silence', () => {
    expect(decide(ZERO)).toBeNull();
    expect(decide(scores({ piano: 0.01, brass: 0.02 }))).toBeNull();
  });

  it('gives the answer of the bench (analyse.py) on its excerpts', () => {
    const rows = decisions as { scores: Record<Group | 'harmonica' | 'whistling' | 'music', number>; answer: string | null; confidence: number }[];
    expect(rows.length).toBeGreaterThan(100);
    let named = 0;
    for (const r of rows) {
      const got = decide(r.scores as GroupScores, DECISION);
      expect(got?.instrument ?? null).toBe(r.answer);
      if (got) expect(got.confidence).toBeCloseTo(r.confidence, 3);
      if (got && got.instrument !== 'winds') named++;
    }
    expect(named).toBeGreaterThan(10);
  });
});

describe('group scores', () => {
  it('takes the best class of each group, and the mean over windows', () => {
    const raw = new Float32Array(527);
    raw[187] = 0.9; // Trumpet
    raw[185] = 0.2; // Brass instrument
    raw[186] = 0.4; // French horn
    raw[191] = 0.3; // Violin
    const g = groupScores(raw);
    expect(g.trumpet).toBeCloseTo(0.9, 6);
    expect(g.brass).toBeCloseTo(0.4, 6);
    expect(g.violin).toBeCloseTo(0.3, 6);
    expect(g.piano).toBe(0);
    const m = meanScores([g, groupScores(new Float32Array(527))])!;
    expect(m.trumpet).toBeCloseTo(0.45, 6);
    expect(meanScores([])).toBeNull();
  });
});
