import { describe, expect, it } from 'vitest';
import { parseChord } from '../harmony/parse';
import type { Key } from '../model/harmony';
import { detectKeyChanges, repeatPeriod, signatureOf } from './keys';
import type { HarmonyBar, HarmonyInput, KnownStandard } from './types';

const BAR = 2; // seconds per bar

/** Bars from a chart written « Cmaj7 | Dm7 G7 | … » (two chords in a bar: beats 0 and 2). */
function bars(text: string, opts: { byHand?: boolean; doubtful?: boolean } = {}): HarmonyBar[] {
  return text
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map((cell, i) => {
      const names = cell === '%' ? [] : cell.split(/\s+/);
      const chords = names.map((n, j) => {
        const p = parseChord(n);
        if (!p.ok) throw new Error(`chord ${n}`);
        return { beat: j * 2, chord: p.chord, doubtful: !!opts.doubtful, byHand: !!opts.byHand };
      });
      return { bar: i, start: i * BAR, end: (i + 1) * BAR, beats: 4, meter: { numerator: 4, denominator: 4 }, chords, carried: null };
    })
    .map((b, i, all) => {
      if (b.chords.length) return b;
      // « % »: the chord before goes on.
      for (let k = i - 1; k >= 0; k--) {
        const last = all[k]!.chords[all[k]!.chords.length - 1];
        if (last) return { ...b, carried: last.chord };
      }
      return b;
    });
}

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' | ');
const K = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });

function input(chart: HarmonyBar[], key: Key | null, extra: Partial<HarmonyInput> = {}): HarmonyInput {
  return { bars: chart, duration: chart.length * BAR, key, keyConfidence: 0.8, known: [], evidence: null, mode: 'auto', ...extra };
}

/** Bar index of each change found, and its key. */
const found = (inp: HarmonyInput) => detectKeyChanges(inp).map((c) => ({ bar: Math.round(c.time / BAR), tonic: c.key.tonic, mode: c.key.mode }));

// A tune in C: two A sections (8 bars each), a bridge, an A.
const A_C = 'Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 G7 | Cmaj7';
const BRIDGE_E = 'F#m7 | B7 | Emaj7 | C#m7 | F#m7 | B7 | Emaj7 | G7';
const BRIDGE_C_IIV = 'Gm7 C7 | Fmaj7 | Bbm7 Eb7 | Abmaj7 | Am7 D7 | Gmaj7 | Dm7 | G7';

describe('detectKeyChanges: real modulations', () => {
  it('a bridge in E for eight bars, in a tune in C, played three times: there and back each time', () => {
    const chorus = [A_C, A_C, BRIDGE_E, A_C].join(' | ');
    const chart = bars([chorus, chorus, chorus].join(' | '));
    const out = found(input(chart, K(0)));
    expect(out).toEqual([
      { bar: 16, tonic: 4, mode: 'major' }, { bar: 24, tonic: 0, mode: 'major' },
      { bar: 48, tonic: 4, mode: 'major' }, { bar: 56, tonic: 0, mode: 'major' },
      { bar: 80, tonic: 4, mode: 'major' }, { bar: 88, tonic: 0, mode: 'major' },
    ]);
  });

  it('the last chorus a half step up', () => {
    const inF = 'Fmaj7 | Dm7 | Gm7 | C7 | Am7 | D7 | Gm7 C7 | Fmaj7';
    const inGb = 'F#maj7 | D#m7 | G#m7 | C#7 | A#m7 | D#7 | G#m7 C#7 | F#maj7';
    const chart = bars([rep(inF, 8), rep(inGb, 4)].join(' | '));
    const out = detectKeyChanges(input(chart, K(5)));
    expect(out).toHaveLength(1);
    expect(out[0]!.time).toBe(64 * BAR);
    expect(out[0]!.key).toMatchObject({ tonic: 6, mode: 'major' });
    expect(out[0]!.key.confidence).toBeGreaterThan(0.5);
    expect(out[0]!.key.confidence).toBeLessThan(1);
    // The relative key first among the alternatives.
    expect(out[0]!.key.alternatives[0]).toMatchObject({ tonic: 3, mode: 'minor' });
  });

  it('So What: eight bars of E♭ minor seventh after sixteen of D minor seventh is a change of signature (E♭ minor)', () => {
    const chorus = [rep('Dm7', 16), rep('Ebm7', 8), rep('Dm7', 8)].join(' | ');
    const out = found(input(bars([chorus, chorus].join(' | ')), K(2, 'minor')));
    expect(out).toEqual([
      { bar: 16, tonic: 3, mode: 'minor' }, { bar: 24, tonic: 2, mode: 'minor' },
      { bar: 48, tonic: 3, mode: 'minor' }, { bar: 56, tonic: 2, mode: 'minor' },
    ]);
  });

  it('every change on a bar line strictly after the first bar, ascending', () => {
    const chorus = [A_C, A_C, BRIDGE_E, A_C].join(' | ');
    const chart = bars([chorus, chorus].join(' | '));
    const out = detectKeyChanges(input(chart, K(0)));
    expect(out.length).toBeGreaterThan(0);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!.time).toBeGreaterThan(0);
      expect(chart.some((b) => b.start === out[i]!.time)).toBe(true);
      if (i) expect(out[i]!.time).toBeGreaterThan(out[i - 1]!.time);
    }
  });

  it('a phrase line wins over a bar or two off: the change lands on bar 16, not where the II-V before it starts', () => {
    // The bridge's II-V of E starts on the last bar of the A section.
    const lastA = 'Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 G7 | F#m7 B7';
    const chorus = [A_C, lastA, BRIDGE_E, A_C].join(' | ');
    const out = found(input(bars([chorus, chorus].join(' | ')), K(0)));
    expect(out[0]).toEqual({ bar: 16, tonic: 4, mode: 'major' });
  });

  it('without a main key, the first phrases give it', () => {
    const chart = bars([A_C, A_C, BRIDGE_E, A_C, A_C, A_C, BRIDGE_E, A_C].join(' | '));
    expect(found(input(chart, null)).map((c) => c.bar)).toEqual([16, 24, 48, 56]);
  });
});

describe('detectKeyChanges: no modulation', () => {
  it('a bridge of II-Vs through passing keys (no eight bars in one signature)', () => {
    const chorus = [A_C, A_C, BRIDGE_C_IIV, A_C].join(' | ');
    expect(found(input(bars([chorus, chorus, chorus].join(' | ')), K(0)))).toEqual([]);
  });

  it('the blues: I7 IV7 V7 are one key', () => {
    const blues = 'F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7';
    expect(found(input(bars(rep(blues, 8)), K(5)))).toEqual([]);
  });

  it('back and forth between a major key and its relative minor', () => {
    const inC = 'Cmaj7 | Fmaj7 | Dm7 | G7 | Cmaj7 | Fmaj7 | Dm7 | G7';
    const inAm = 'Am7 | Dm7 | Bm7b5 | E7 | Am7 | Dm7 | Bm7b5 | E7';
    expect(found(input(bars(rep(`${inC} | ${inAm}`, 6)), K(0)))).toEqual([]);
  });

  it('a four-bar major passage in a minor tune', () => {
    const inDm = 'Dm7 | Em7b5 A7 | Dm7 | Gm7 | Dm7 | Em7b5 A7 | Dm7 | Dm7';
    const four = 'Gmaj7 | Cmaj7 | Am7 D7 | Gmaj7';
    const chorus = [inDm, inDm, four, 'Em7b5 | A7 | Dm7 | Dm7', inDm].join(' | ');
    expect(found(input(bars(rep(chorus, 4)), K(2, 'minor')))).toEqual([]);
  });

  it('secondary dominants and tritone substitutions in one key', () => {
    const a = 'Cmaj7 | A7 | Dm7 | Db7 | Cmaj7 | E7 | Am7 | D7 | Dm7 | G7 | Em7 Eb7 | Dm7 Db7';
    expect(found(input(bars(rep(a, 8)), K(0)))).toEqual([]);
  });

  it('a misread run of four bars (F read as F minor) in a tune in F', () => {
    const a = 'F | F | C7 | C7 | C7 | C7 | F | F';
    const misread = 'F | F | C7 | C7 | Fm | Fm | Fm | Fm';
    const chart = bars([a, a, a, misread, a, a, a, a].join(' | '));
    expect(found(input(chart, K(5)))).toEqual([]);
  });

  it('too short, no chords, only N.C.: nothing', () => {
    expect(found(input(bars(rep('Cmaj7', 10)), K(0)))).toEqual([]);
    expect(found(input([], K(0)))).toEqual([]);
    expect(found(input(bars(rep('N.C.', 40)), K(0)))).toEqual([]);
  });

  it('a stretch whose chords are all doubtful counts for less', () => {
    const chart = [...bars(rep(A_C, 2)), ...bars(BRIDGE_E, { doubtful: true }), ...bars(rep(A_C, 3))].map((b, i) => ({ ...b, bar: i, start: i * BAR, end: (i + 1) * BAR }));
    const hand = [...bars(rep(A_C, 2)), ...bars(BRIDGE_E, { byHand: true }), ...bars(rep(A_C, 3))].map((b, i) => ({ ...b, bar: i, start: i * BAR, end: (i + 1) * BAR }));
    const doubtful = detectKeyChanges(input(chart, K(0)));
    const byHand = detectKeyChanges(input(hand, K(0)));
    expect(byHand.map((c) => c.time / BAR)).toEqual([16, 24]);
    if (doubtful.length) expect(doubtful[0]!.key.confidence).toBeLessThan(byHand[0]!.key.confidence);
  });
});

describe('detectKeyChanges: the known chart', () => {
  const chart = (text: string, key: Key): KnownStandard => {
    const list = bars(text);
    return {
      titleScore: 0.95,
      chart: {
        index: 0, title: 't', rawTitle: 't', composer: '', composerRaw: '', style: 'Medium Swing', feel: null, key, keyText: '',
        bpm: null, meter: { numerator: 4, denominator: 4 }, meters: [{ numerator: 4, denominator: 4 }], writtenBars: list.length, warnings: [],
        bars: list.map((b, i) => ({
          source: i, meter: b.meter, alternates: [], section: i % 8 === 0 ? 'A' : null, comments: [], pass: 1, ending: null, simile: null,
          chords: b.chords.map((c) => ({ beat: c.beat, duration: 2, chord: c.chord, text: '', approximate: false })),
        })),
      },
    };
  };

  it('helps a weak bridge through (its own bridge is in the other key)', () => {
    // The bridge played with half its chords misread as C chords.
    const weak = 'F#m7 | B7 | Emaj7 | Am7 | F#m7 | G7 | Emaj7 | G7';
    const chorus = [A_C, A_C, weak, A_C].join(' | ');
    const without = found(input(bars(rep(chorus, 3)), K(0)));
    const withChart = found(input(bars(rep(chorus, 3)), K(0), { known: [chart([A_C, A_C, BRIDGE_E, A_C].join(' | '), K(0))] }));
    expect(withChart.length).toBeGreaterThanOrEqual(without.length);
    expect(withChart.map((c) => c.bar)).toEqual([16, 24, 48, 56, 80, 88]);
  });

  it('never prevents a change it does not write (the last chorus a step up)', () => {
    const inF = 'Fmaj7 | Dm7 | Gm7 | C7 | Am7 | D7 | Gm7 C7 | Fmaj7';
    const inG = 'Gmaj7 | Em7 | Am7 | D7 | Bm7 | E7 | Am7 D7 | Gmaj7';
    const known = chart(rep(inF, 4), K(5));
    const out = found(input(bars([rep(inF, 8), rep(inG, 4)].join(' | ')), K(5), { known: [known] }));
    expect(out).toEqual([{ bar: 64, tonic: 7, mode: 'major' }]);
  });
});

describe('helpers', () => {
  it('signatureOf: a major key and its relative minor share one', () => {
    expect(signatureOf(K(0))).toBe(signatureOf(K(9, 'minor')));
    expect(signatureOf(K(3, 'minor'))).toBe(6);
  });

  it('repeatPeriod finds the chorus', () => {
    const chorus = [A_C, A_C, BRIDGE_E, A_C].join(' | ');
    const chart = bars(rep(chorus, 3));
    const heard = chart.map((b) => b.chords.filter((c) => c.chord).map((c) => ({ chord: c.chord!, index: 0, weight: 1 })));
    // AABA: the A repeats every 8 bars too, but the whole chorus repeats better.
    expect([8, 32]).toContain(repeatPeriod(heard));
  });
});
