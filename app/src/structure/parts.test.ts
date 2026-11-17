import { describe, expect, it } from 'vitest';
import type { StemId } from '../model/separation';
import { analyseForm } from './form';
import { jazzParts, leadFromStems, leadStretches, gridStrength, popParts, windsInstrument, windsStretches, type PartsInput } from './parts';
import { AABA, chartBars, repeat } from './testCharts';
import type { InstrumentGuess, StructureEvidence } from './types';

/** Levels per bar of each track from a plan: [bars, { stem: level }] stretches. */
function levels(plan: [number, Partial<Record<StemId, number>>][]): Partial<Record<StemId, Float32Array>> {
  const n = plan.reduce((a, [k]) => a + k, 0);
  const out: Partial<Record<StemId, Float32Array>> = {};
  const stems: StemId[] = ['vocals', 'other', 'piano', 'guitar', 'bass', 'drums'];
  for (const s of stems) out[s] = new Float32Array(n);
  let i = 0;
  for (const [k, lv] of plan) {
    for (let j = 0; j < k; j++, i++) for (const s of stems) out[s]![i] = (lv[s] ?? 0.002) * (1 + 0.05 * Math.sin(i * 7.1 + s.length));
  }
  return out;
}

const band = { piano: 0.08, bass: 0.1, drums: 0.12 };
const evidence = (stems: Partial<Record<StemId, Float32Array>>, winds: (InstrumentGuess | null)[] | null = null): StructureEvidence => ({
  stems,
  timbre: { bands: 8, data: new Float32Array(0) },
  winds,
});

function parts(chart: string, ev: StructureEvidence | null, chordsFirst = 0) {
  const bars = chartBars(chart);
  const layout = analyseForm(bars, { known: [], key: null, keyChanges: [] }).chorus;
  const input: PartsInput = { n: bars.length, layout, evidence: ev, chordsFirst, chordsEnd: bars.length };
  return { input, parts: jazzParts(input) };
}

const show = (ps: { type: string; number: number | null; instrument: string | null; first: number; end: number }[]) =>
  ps.map((p) => `${p.type}${p.number ?? ''}(${p.instrument ?? '-'})${p.first}-${p.end}`);

describe('structure parts: who leads', () => {
  it('finds the voice, a piano solo above its comping, a bass solo when the band steps back, a drum solo', () => {
    const st = levels([
      [8, { ...band, vocals: 0.22 }],
      [8, { ...band, piano: 0.24 }],
      [8, { piano: 0.05, bass: 0.18, drums: 0.05 }],
      [8, { drums: 0.3 }],
      [8, { ...band }],
    ]);
    const reading = leadFromStems(st, 40)!;
    const s = leadStretches(reading, gridStrength(null, 40), 0, 40);
    expect(s.map((x) => `${x.lead}:${x.first}-${x.end}`)).toEqual(['vocals:0-8', 'piano:8-16', 'bass:16-24', 'drums:24-32', 'none:32-40']);
  });

  it('does not take a drum fill for a drum solo', () => {
    const plan: [number, Partial<Record<StemId, number>>][] = [];
    for (let k = 0; k < 4; k++) plan.push([7, { ...band, other: 0.2 }], [1, { ...band, other: 0.2, drums: 0.25 }]);
    const reading = leadFromStems(levels(plan), 32)!;
    const s = leadStretches(reading, gridStrength(null, 32), 0, 32);
    expect(s.map((x) => x.lead)).toEqual(['other']);
  });
});

describe('structure parts: the wind instruments', () => {
  const g = (instrument: string, confidence: number): InstrumentGuess => ({ instrument, confidence });
  it('names a wind only when most readings say it confidently; else « Vents »', () => {
    expect(windsInstrument([g('trumpet', 0.9), g('trumpet', 0.8), g('trumpet', 0.7), null], 0, 4)).toBe('trumpet');
    expect(windsInstrument([g('trumpet', 0.9), g('trombone', 0.8), g('winds', 0.3), g('trumpet', 0.4)], 0, 4)).toBe('winds');
    expect(windsInstrument(null, 0, 4)).toBe('winds');
    expect(windsInstrument([null, null], 0, 2)).toBe('winds');
  });

  it('splits two wind soloists in a row, and lists the stretches to ask the recogniser about, one per chorus', () => {
    const chart = repeat(AABA, 4);
    const st = levels([[32, { ...band, other: 0.22 }], [32, { ...band, other: 0.2 }], [32, { ...band, other: 0.2 }], [32, { ...band, other: 0.22 }]]);
    const winds = Array.from({ length: 128 }, (_, i) => g(i < 32 || i >= 96 ? 'saxophone' : i < 64 ? 'trumpet' : 'trombone', 0.8));
    const { parts: ps, input } = parts(chart, evidence(st, winds));
    expect(show(ps)).toEqual(['theme1(saxophone)0-32', 'solo(trumpet)32-64', 'solo(trombone)64-96', 'theme2(saxophone)96-128']);
    expect(windsStretches({ ...input, evidence: evidence(st) }).map((s) => `${s.first}-${s.end}`)).toEqual(['0-32', '32-64', '64-96', '96-128']);
  });
});

describe('structure parts: jazz', () => {
  it('keeps one long solo by one instrument whole, numbers solos when an instrument comes back', () => {
    const chart = repeat(AABA, 5);
    const st = levels([[32, { ...band, other: 0.22 }], [64, { ...band, other: 0.2 }], [32, { ...band, piano: 0.24 }], [32, { ...band, other: 0.22 }]]);
    const { parts: ps } = parts(chart, evidence(st));
    expect(show(ps)).toEqual(['theme1(winds)0-32', 'solo(winds)32-96', 'solo(piano)96-128', 'theme2(winds)128-160']);
  });

  it('without separation: never an instrument name, « Solo 1, Solo 2 » where the timbre changes', () => {
    const chart = repeat(AABA, 4);
    const n = 128;
    const data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) for (let b = 0; b < 8; b++) {
      const shape = i < 32 || i >= 96 ? [1, 2, 3, 4, 3, 2, 1, 0] : i < 64 ? [4, 3, 2, 1, 0, 0, 0, 0] : [0, 0, 1, 2, 4, 4, 3, 2];
      data[i * 8 + b] = shape[b]! + 0.05 * Math.sin(i * 3.3 + b);
    }
    const { parts: ps } = parts(chart, { stems: null, timbre: { bands: 8, data }, winds: null });
    expect(show(ps)).toEqual(['theme1(-)0-32', 'solo1(-)32-64', 'solo2(-)64-96', 'theme2(-)96-128']);
  });

  it('with an intro and an outro, and a pick-up bar of no chord before the intro', () => {
    const chart = `N.C. | Dm7 | G7 | Em7 A7 | Dm7 G7 | ${repeat(AABA, 3)} | Cmaj7 | Cmaj7`;
    const { parts: ps } = parts(chart, null, 1);
    expect(show(ps)).toEqual(['intro(-)1-5', 'theme1(-)5-37', 'solo(-)37-69', 'theme2(-)69-101', 'outro(-)101-103']);
  });
});

describe('structure parts: pop', () => {
  it('names verses, choruses, a bridge and an instrumental solo', () => {
    const verse = 'A | E | F#m | D | A | E | D | E';
    const chorus = 'D | A | E | F#m | D | A | E | E';
    const bridge = 'Bm | E | C#m | F#m | Bm | E | A | A';
    const bars = chartBars(['A | E | A | E', verse, chorus, verse, chorus, bridge, verse, chorus, chorus, 'A | A | A | A'].join(' | '));
    const v = { ...band, vocals: 0.22 };
    const st = levels([[4, band], [8, v], [8, v], [8, v], [8, v], [8, v], [8, { ...band, guitar: 0.25 }], [16, v], [4, band]]);
    const layout = analyseForm(bars, { known: [], key: null, keyChanges: [] }).phrases;
    const ps = popParts({ n: bars.length, layout, evidence: evidence(st), chordsFirst: 0, chordsEnd: bars.length });
    expect(ps.map((p) => `${p.type}${p.number ?? ''}(${p.instrument ?? '-'})`)).toEqual([
      'intro(-)', 'verse1(voice)', 'chorus1(voice)', 'verse2(voice)', 'chorus2(voice)', 'bridge(voice)', 'solo(guitar)', 'chorus3(voice)', 'outro(-)',
    ]);
  });
});
