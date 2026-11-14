import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChordSymbol } from '../harmony/ChordSymbol';
import { CHORD_EXTENSIONS, CHORD_QUALITIES, type ChordSymbol as Chord, type Instrument, type Key } from '../model/harmony';
import { displayContext } from '../harmony/display';
import { chordMarkup } from './chordMarkup';

const keys: (Key | null)[] = [null, { tonic: 8, mode: 'major' }, { tonic: 2, mode: 'minor' }, { tonic: 6, mode: 'major' }];

describe('the ruler writes chords with the markup of <ChordSymbol>', () => {
  it('is identical for every quality, extension, bass, key, transposition, instrument and minor sign', () => {
    let n = 0;
    for (const key of keys) {
      for (const [semitones, instrument, minor] of [[0, 'ut', 'm'], [5, 'sib', '–'], [-3, 'mib', 'm']] as [number, Instrument, 'm' | '–'][]) {
        const ctx = displayContext(key, semitones, instrument, minor);
        for (const quality of CHORD_QUALITIES) {
          for (const root of [0, 1, 3, 6, 8, 10]) {
            const variants: Chord[] = [
              { root, quality, extensions: [], bass: null },
              { root, quality, extensions: ['b9', '#11'], bass: (root + 4) % 12 },
            ];
            for (const chord of variants) {
              for (const doubtful of [false, true]) {
                const expected = renderToStaticMarkup(createElement(ChordSymbol, { chord, ctx, doubtful }));
                expect(chordMarkup(chord, ctx, doubtful)).toBe(expected);
                n++;
              }
            }
          }
        }
        for (const e of CHORD_EXTENSIONS) {
          const chord: Chord = { root: 7, quality: '7', extensions: [e], bass: null };
          expect(chordMarkup(chord, ctx, false)).toBe(renderToStaticMarkup(createElement(ChordSymbol, { chord, ctx })));
        }
        expect(chordMarkup(null, ctx, false)).toBe(renderToStaticMarkup(createElement(ChordSymbol, { chord: null, ctx })));
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('uses the chart conventions: triangle, raised extensions, tight accidentals, « m » or « – »', () => {
    const ctx = displayContext({ tonic: 8, mode: 'major' }, 0, 'ut', '–');
    const html = chordMarkup({ root: 8, quality: 'maj7', extensions: [], bass: null }, ctx, false);
    expect(html).toContain('class="tri"');
    expect(html).toContain('<span class="alt">♭</span>');
    const minor = chordMarkup({ root: 5, quality: 'min7', extensions: ['9'], bass: null }, ctx, false);
    expect(minor).toContain('–7');
    expect(minor).toContain('<span class="ext">9</span>');
  });
});
