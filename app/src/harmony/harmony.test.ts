import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChordSymbol, Key } from '../model/harmony';
import { setLanguage } from '../i18n';
import { ChordSymbol as ChordSymbolView } from './ChordSymbol';
import {
  allKeys,
  chord,
  chordText,
  displayChordText,
  displayContext,
  keyLabel,
  keyNameFr,
  noteText,
  parseChord,
  parseHarte,
  spellInKey,
  keyTonicName,
  transposeChord,
  type ParsedChord,
} from './index';

setLanguage('fr');

const major = (tonic: number): Key => ({ tonic, mode: 'major' });
const minor = (tonic: number): Key => ({ tonic, mode: 'minor' });
const spell = (p: number, key: Key) => noteText(spellInKey(p, keyTonicName(key)));
const text = (c: ChordSymbol | null, key: Key | null = null, m: 'm' | '–' = 'm') => chordText(c, { key, minor: m });
const parsed = (r: ParsedChord) => (r.ok ? r.chord : 'not understood');

describe('key names and tonic spelling', () => {
  it('spells major keys as their signature does', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => keyLabel(major(t)))).toEqual(
      ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'],
    );
  });
  it('spells minor keys with the usual signature, minor notation from the setting', () => {
    expect([0, 1, 3, 6, 8, 10].map((t) => keyLabel(minor(t)))).toEqual(['Cm', 'C♯m', 'E♭m', 'F♯m', 'G♯m', 'B♭m']);
    expect(keyLabel(minor(5), '–')).toBe('F–');
  });
  it('names keys in French', () => {
    expect(keyNameFr(major(8))).toBe('La♭ majeur');
    expect(keyNameFr(minor(6))).toBe('Fa♯ mineur');
    expect(keyNameFr(major(0))).toBe('Do majeur');
    expect(allKeys()).toHaveLength(24);
  });
});

describe('spelling by scale degree', () => {
  it('flat keys spell flats, sharp keys sharps', () => {
    expect(spell(10, major(5))).toBe('B♭'); // IV of F
    expect(spell(6, major(2))).toBe('F♯'); // III of D
    expect(spell(1, major(8))).toBe('D♭'); // IV of A♭
    expect(spell(8, major(4))).toBe('G♯'); // III of E
  });
  it('chromatic degrees: ♭2, ♭3, ♯4, ♭6, ♭7 relative to the tonic', () => {
    // In C: D♭7 (tritone substitute), E♭, F♯m7♭5, A♭7, B♭7
    expect([1, 3, 6, 8, 10].map((p) => spell(p, major(0)))).toEqual(['D♭', 'E♭', 'F♯', 'A♭', 'B♭']);
    // In G: A♭, B♭, C♯, E♭, F
    expect([8, 10, 1, 3, 5].map((p) => spell(p, major(7)))).toEqual(['A♭', 'B♭', 'C♯', 'E♭', 'F']);
  });
  it('minor keys: V7 and the leading tone are raised', () => {
    expect(text(chord(4, '7'), minor(9))).toBe('E7');
    expect(text(chord(8, 'dim7'), minor(9))).toBe('G♯°7');
    expect(text(chord(10, '7'), minor(9))).toBe('B♭7');
  });
  it('a passing diminished seventh is spelled as a raised degree', () => {
    expect(text(chord(1, 'dim7'), major(0))).toBe('C♯°7');
    expect(text(chord(3, 'dim7'), major(0))).toBe('D♯°7');
    expect(text(chord(8, 'dim7'), major(0))).toBe('G♯°7');
    expect(text(chord(1, '7'), major(0))).toBe('D♭7');
  });
  it('never a double accidental, and no C♭, F♭, E♯ or B♯', () => {
    // In B major the passing C°7 would be B♯°7: written C°7 (demo-swing.json, bar 2).
    expect(text(chord(0, 'dim7'), major(11))).toBe('C°7');
    // In G♭ major the IV is written B, not C♭; ♭VI is D, not E𝄫.
    expect(spell(11, major(6))).toBe('B');
    expect(spell(2, major(6))).toBe('D');
    // In F♯ minor the ♯4 is B♯ -> C.
    expect(spell(0, minor(6))).toBe('C');
    for (const key of allKeys()) {
      for (let p = 0; p < 12; p++) {
        const s = spell(p, key);
        expect(s, `${p} in ${keyLabel(key)}`).toMatch(/^[A-G][♭♯]?$/);
        expect(['C♭', 'F♭', 'E♯', 'B♯']).not.toContain(s);
      }
    }
  });
});

describe('chord text', () => {
  const ab = major(8);
  it('writes the jazz way: triangle for major 7, m or – for minor', () => {
    expect(text(chord(8, 'maj7'), ab)).toBe('A♭△');
    expect(text(chord(5, 'min7'), ab)).toBe('Fm7');
    expect(text(chord(5, 'min7'), ab, '–')).toBe('F–7');
    expect(text(chord(0, 'minmaj7'), ab, '–')).toBe('C–△');
    expect(text(chord(7, 'hdim7'), ab)).toBe('Gm7♭5');
    expect(text(chord(11, 'dim7'), major(0))).toBe('B°7');
    expect(text(chord(3, '7', ['13']), ab)).toBe('E♭7(13)');
    expect(text(chord(5, '7', ['b9']), ab)).toBe('F7(♭9)');
    expect(text(chord(0, '7', [], 4), major(5))).toBe('C7/E');
    expect(text(chord(8, 'maj6'), ab)).toBe('A♭6');
    expect(text(chord(1, 'min6'), ab)).toBe('D♭m6');
    expect(text(chord(2, '7sus4'), major(7))).toBe('D7sus4');
    expect(text(chord(7, 'aug7'), major(0))).toBe('G+7');
    expect(text(null)).toBe('N.C.');
  });
  it('a bass equal to the root is dropped', () => {
    expect(chord(0, 'maj', [], 12).bass).toBeNull();
  });
});

describe('transposition and instruments', () => {
  const ab = major(8);
  const ctx = (semitones: number, instrument: 'ut' | 'sib' | 'mib', key: Key | null = ab) => displayContext(key, semitones, instrument, 'm');
  it('follows the transport in the transposed key', () => {
    // A♭ + 5 = D♭: E♭7 -> A♭7, Fm7 -> B♭m7
    expect(displayChordText(chord(3, '7'), ctx(5, 'ut'))).toBe('A♭7');
    expect(displayChordText(chord(5, 'min7'), ctx(5, 'ut'))).toBe('B♭m7');
    // A♭ − 1 = G: D♭△ -> C△, Gm7♭5 (vii) -> F♯m7♭5, sharps now; A7 (♭II7) -> A♭7
    expect(displayChordText(chord(1, 'maj7'), ctx(-1, 'ut'))).toBe('C△');
    expect(displayChordText(chord(7, 'hdim7'), ctx(-1, 'ut'))).toBe('F♯m7♭5');
    expect(displayChordText(chord(9, '7'), ctx(-1, 'ut'))).toBe('A♭7');
  });
  it('a B♭ instrument reads a major second higher, an E♭ instrument a major sixth higher', () => {
    expect(ctx(0, 'sib').key).toEqual(major(10)); // A♭ concert -> B♭
    expect(ctx(0, 'mib').key).toEqual(major(5)); // A♭ concert -> F
    expect(displayChordText(chord(8, 'maj7'), ctx(0, 'sib'))).toBe('B♭△');
    expect(displayChordText(chord(8, 'maj7'), ctx(0, 'mib'))).toBe('F△');
    // Concert C -> E♭ instrument in A, B♭ instrument in D
    expect(keyLabel(ctx(0, 'mib', major(0)).key!)).toBe('A');
    expect(keyLabel(ctx(0, 'sib', major(0)).key!)).toBe('D');
    // Transposition and instrument add up
    expect(displayChordText(chord(8, 'maj7'), ctx(2, 'sib'))).toBe('C△');
  });
  it('without a key, the spelling still follows the shift', () => {
    expect(displayChordText(chord(10, '7'), ctx(0, 'ut', null))).toBe('B♭7');
    expect(displayChordText(chord(10, '7'), ctx(2, 'ut', null))).toBe('C7');
    expect(displayChordText(chord(6, '7'), ctx(1, 'ut', null))).toBe('G7');
  });
  it('transposes root and bass, never the stored chord', () => {
    const c = chord(0, '7', ['9'], 4);
    const up = transposeChord(c, 14);
    expect(up).toEqual({ root: 2, quality: '7', extensions: ['9'], bass: 6 });
    expect(c.root).toBe(0);
  });
});

describe('reading typed symbols', () => {
  it.each([
    ['Bb-7', chord(10, 'min7')],
    ['B♭m7', chord(10, 'min7')],
    ['Ebmaj7', chord(3, 'maj7')],
    ['E♭△', chord(3, 'maj7')],
    ['C^7', chord(0, 'maj7')],
    ['CMaj7', chord(0, 'maj7')],
    ['Dø', chord(2, 'hdim7')],
    ['Dm7b5', chord(2, 'hdim7')],
    ['C°7', chord(0, 'dim7')],
    ['Cdim', chord(0, 'dim')],
    ['F7(b9)', chord(5, '7', ['b9'])],
    ['F7b9#11', chord(5, '7', ['b9', '#11'])],
    ['G13', chord(7, '7', ['13'])],
    ['G7alt', chord(7, '7', ['alt'])],
    ['C6/9', chord(0, 'maj6', ['9'])],
    ['Cm(maj7)', chord(0, 'minmaj7')],
    ['C–△', chord(0, 'minmaj7')],
    ['D7sus', chord(2, '7sus4')],
    ['Csus2', chord(0, 'sus2')],
    ['C+7', chord(0, 'aug7')],
    ['C', chord(0, 'maj')],
    ['f#m', chord(6, 'min')],
    ['C7/E', chord(0, '7', [], 4)],
    ['Ab/C', chord(8, 'maj', [], 0)],
    ['C(add9)', chord(0, 'maj', ['9'])],
  ])('%s', (input, expected) => {
    expect(parsed(parseChord(input))).toEqual(expected);
  });
  it('N.C. and nonsense', () => {
    expect(parsed(parseChord('N.C.'))).toBeNull();
    expect(parsed(parseChord('nc'))).toBeNull();
    expect(parsed(parseChord(''))).toBe('not understood');
    expect(parsed(parseChord('H7'))).toBe('not understood');
    expect(parsed(parseChord('C7zz'))).toBe('not understood');
    expect(parsed(parseChord('C/Q'))).toBe('not understood');
  });
  it('round trip: what is written is read back', () => {
    const samples = [chord(8, 'maj7'), chord(5, 'min7', ['9']), chord(7, '7', ['b9', '#11']), chord(2, 'hdim7'), chord(1, 'dim7'), chord(0, '7', [], 4), chord(9, 'min6'), chord(3, '7sus4')];
    for (const c of samples) for (const m of ['m', '–'] as const) expect(parsed(parseChord(text(c, major(8), m)))).toEqual(c);
  });
});

describe('reading Harte labels (analysis models, demo-swing.json)', () => {
  it.each([
    ['B:maj7(9)', chord(11, 'maj7', ['9'])],
    ['C:dim7', chord(0, 'dim7')],
    ['C#:min7(9)', chord(1, 'min7', ['9'])],
    ['F#:7', chord(6, '7')],
    ['A:7(9,13)', chord(9, '7', ['9', '13'])],
    ['B:7(#9)', chord(11, '7', ['#9'])],
    ['Bb:hdim7', chord(10, 'hdim7')],
    ['C:maj/5', chord(0, 'maj', [], 7)],
    ['C:7/b7', chord(0, '7', [], 10)],
    ['G:9', chord(7, '7', ['9'])],
    ['D:min(*b3)', chord(2, 'min')],
    ['C', chord(0, 'maj')],
  ])('%s', (label, expected) => {
    expect(parsed(parseHarte(label))).toEqual(expected);
  });
  it('N is N.C., X and nonsense are not understood', () => {
    expect(parsed(parseHarte('N'))).toBeNull();
    expect(parsed(parseHarte('X'))).toBe('not understood');
    expect(parsed(parseHarte('C:blues'))).toBe('not understood');
  });
});

describe('<ChordSymbol> markup', () => {
  const render = (c: ChordSymbol | null, opts: { semitones?: number; minor?: 'm' | '–'; doubtful?: boolean } = {}) =>
    renderToStaticMarkup(
      createElement(ChordSymbolView, {
        chord: c,
        ctx: displayContext(major(8), opts.semitones ?? 0, 'ut', opts.minor ?? 'm'),
        doubtful: opts.doubtful,
      }),
    );
  it('matches the mockup: root, tight accidental, triangle', () => {
    expect(render(chord(8, 'maj7'))).toBe(
      '<span class="ch">A<span class="alt">♭</span><svg class="tri" viewBox="0 0 10 9" role="img" aria-label="majeur 7"><path d="M5 0.9 9.2 8.2H0.8z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"></path></svg></span>',
    );
  });
  it('quality at 74 % and raised extension with accidentals in the music font', () => {
    expect(render(chord(3, '7', ['13']))).toBe('<span class="ch">E<span class="alt">♭</span><span class="q">7</span><span class="ext">13</span></span>');
    expect(render(chord(5, '7', ['b9']))).toBe('<span class="ch">F<span class="q">7</span><span class="ext"><span class="alt">♭</span>9</span></span>');
    expect(render(chord(0, 'min7'), { minor: '–' })).toBe('<span class="ch">C<span class="q">–7</span></span>');
    expect(render(chord(7, 'hdim7'))).toBe('<span class="ch">G<span class="q">m7<span class="alt">♭</span>5</span></span>');
  });
  it('bass, N.C., doubt', () => {
    expect(render(chord(0, '7', [], 4))).toContain('<span class="ch-basse">/E</span>');
    expect(render(null)).toBe('<span class="ch sans-accord"><span class="q">N.C.</span></span>');
    const doubt = render(chord(1, 'min6'), { doubtful: true });
    expect(doubt).toContain('class="ch douteux"');
    expect(doubt).toContain('title="Accord incertain : D♭m6"');
  });
  it('follows the transposition', () => {
    expect(render(chord(8, 'maj7'), { semitones: 5 })).toContain('D<span class="alt">♭</span><svg');
  });
});
