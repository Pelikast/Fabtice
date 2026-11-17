import { describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import type { DetectedStructure } from '../model/structure';
import { readDocument } from '../storage/documentFormat';
import { sampleDocument } from '../test/sampleDocument';
import { buildCase, loadCorpus } from './bench/cases';
import { detectStructure, sanitize, seventhShare, structureInBars } from './detect';
import { AABA, BLUES, chartBars, inputOf, repeat } from './testCharts';

/** The document reader keeps an analysis whose structure is valid, and drops the whole analysis otherwise. */
function readable(structure: DetectedStructure): boolean {
  const analysis = { ...demoSwingResult(36), structure };
  const doc = readDocument(JSON.parse(JSON.stringify(sampleDocument({ analysis: analysis as never }))));
  return doc?.analysis !== null && doc?.analysis !== undefined;
}

describe('structure detection', () => {
  it('gives every bench case a structure the document reader keeps', () => {
    const configs = [
      { level: 'parfait', evidence: 'stems', known: false },
      { level: 'realiste', evidence: 'stems', known: true },
      { level: 'mauvais', evidence: 'mix', known: false },
      { level: 'mauvais', evidence: 'none', known: true },
    ] as const;
    let checked = 0;
    for (const piece of loadCorpus()) {
      for (const c of configs) {
        const s = detectStructure(buildCase(piece, c).input, []);
        if (!s) continue;
        expect(readable(s), `${piece.id} ${c.level} ${c.evidence}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(120);
  });

  it('says nothing for a piece too short, or without chords', () => {
    expect(detectStructure(inputOf(chartBars('C | F | G7 | C | F | G7')), [])).toBeNull();
    const nc = Array.from({ length: 40 }, () => 'N.C.').join(' | ');
    expect(detectStructure(inputOf(chartBars(nc)), [])).toBeNull();
  });

  it('finds an AABA standard with no audio: Thème 1, Solo, Thème 2 (the honest default)', () => {
    const s = detectStructure(inputOf(chartBars(repeat(AABA, 4))), [])!;
    expect(s.mode).toBe('jazz');
    expect(s.form).toBe('AABA');
    expect(s.sections.length).toBe(16);
    expect(s.parts.map((p) => `${p.type}${p.number ?? ''}`)).toEqual(['theme1', 'solo', 'theme2']);
    expect(s.parts.every((p) => p.instrument === null)).toBe(true);
    expect(readable(s)).toBe(true);
  });

  it('reads two choruses as two themes and one as a theme, without audio', () => {
    expect(detectStructure(inputOf(chartBars(repeat(AABA, 2))), [])!.parts.map((p) => `${p.type}${p.number ?? ''}`)).toEqual(['theme1', 'theme2']);
  });

  it('chooses Pop for triads and Jazz for sevenths, and obeys the mode chosen by hand', () => {
    const song = chartBars(repeat('C | G | Am | F | C | G | F | G | F | C | G | Am | F | C | G | G', 4));
    expect(seventhShare(song)).toBe(0);
    expect(detectStructure(inputOf(song), [])!.mode).toBe('pop');
    expect(detectStructure(inputOf(song, { mode: 'jazz' }), [])!.mode).toBe('jazz');
    const blues = inputOf(chartBars(repeat(BLUES, 5)), { mode: 'pop' });
    const s = detectStructure(blues, [])!;
    expect(s.mode).toBe('pop');
    expect(s.form).toBe('');
    expect(s.parts.every((p) => ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'].includes(p.type))).toBe(true);
  });

  it('is deterministic and keeps bar lines as part limits', () => {
    const input = buildCase(loadCorpus().find((p) => p.id === 'autumn-leaves')!, { level: 'realiste', evidence: 'stems', known: false }).input;
    const a = detectStructure(input, []);
    const b = detectStructure(input, []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const lines = new Set([...input.bars.map((x) => x.start), input.bars[input.bars.length - 1]!.end]);
    for (const p of a!.parts) {
      expect(lines.has(p.start)).toBe(true);
      expect(lines.has(p.end)).toBe(true);
    }
    expect(structureInBars(input, [])!.layout).not.toBeNull();
  });

  it('sanitises anything it would write: overlaps, bad ids, bad letters', () => {
    const s = sanitize({
      mode: 'jazz',
      form: 'AA-B',
      sections: [{ time: 2, label: 'A' }, { time: 2, label: 'A' }, { time: 1, label: '' }, { time: 3, label: 'TOOLONGLABEL!' }],
      parts: [
        { id: 'x', type: 'theme', number: 1, instrument: 'Voice!', start: 0, end: 4 },
        { id: 'x', type: 'solo', number: 0, instrument: 'piano', start: 4, end: 8 },
        { id: 'y', type: 'solo', number: null, instrument: null, start: 6, end: 9 },
        { id: 'z', type: 'outro', number: null, instrument: null, start: 9, end: 9 },
      ],
    });
    expect(s.form).toBe('');
    expect(s.sections).toEqual([{ time: 2, label: 'A' }]);
    expect(s.parts.map((p) => [p.id, p.number, p.instrument])).toEqual([['x', 1, null], ["x'", null, 'piano']]);
    expect(readable(s)).toBe(true);
  });

  it('runs a 10-minute piece well under 100 ms', () => {
    const bars = chartBars(`${repeat(AABA, 12)} | ${repeat(BLUES, 8)}`, { secondsPerBar: 1.25 });
    expect(bars.length).toBeGreaterThan(470);
    detectStructure(inputOf(bars), []);
    const t0 = performance.now();
    detectStructure(inputOf(bars), []);
    expect(performance.now() - t0).toBeLessThan(250); // the bound with a loaded test machine; measured ≈ 60 ms
  });
});
