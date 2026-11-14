import { describe, expect, it } from 'vitest';
import { chord, chordText } from '../harmony/chord';
import { displayContext } from '../harmony/display';
import { noteText } from '../harmony/pitch';
import { parseChord } from '../harmony/parse';
import { CLOSED, EXTENSION_CHOICES, QUALITY_CHOICES, noteChoices, patchChord, reduceEditor, startsChordSymbol } from './editor';
import { CHORD_QUALITIES } from '../model/harmony';

describe('editor state', () => {
  it('opens on a chord and closes', () => {
    const open = reduceEditor(CLOSED, { type: 'open', stop: { bar: 3, index: 0 }, by: 'mouse' });
    expect(open.target).toEqual({ bar: 3, index: 0 });
    expect(open.focus).toBe('panel');
    expect(reduceEditor(open, { type: 'close' })).toEqual(CLOSED);
  });

  it('opened from the keyboard, it puts the cursor in the text field; from a finger it does not', () => {
    expect(reduceEditor(CLOSED, { type: 'open', stop: { bar: 0, index: 0 }, by: 'keyboard' }).focus).toBe('field');
    expect(reduceEditor(CLOSED, { type: 'open', stop: { bar: 0, index: 0 }, by: 'touch' }).focus).toBe('panel');
  });

  it('typing a letter opens it with that letter already in the field', () => {
    const s = reduceEditor(CLOSED, { type: 'open', stop: { bar: 2, index: 1 }, by: 'keyboard', seed: 'B' });
    expect(s.seed).toBe('B');
    expect(s.focus).toBe('field');
  });

  it('a click on a section letter opens it on the section field', () => {
    expect(reduceEditor(CLOSED, { type: 'open', stop: { bar: 8, index: 0 }, by: 'mouse', focus: 'section' }).focus).toBe('section');
  });

  it('moving to another chord keeps the options panel as it was; a fresh opening starts closed', () => {
    let s = reduceEditor(CLOSED, { type: 'open', stop: { bar: 1, index: 0 }, by: 'mouse' });
    s = reduceEditor(s, { type: 'more', open: true });
    expect(reduceEditor(s, { type: 'open', stop: { bar: 2, index: 0 }, by: 'mouse' }).more).toBe(true);
    expect(reduceEditor(reduceEditor(s, { type: 'close' }), { type: 'open', stop: { bar: 2, index: 0 }, by: 'mouse' }).more).toBe(false);
  });

  it('selects the other chord of the bar', () => {
    const s = reduceEditor(reduceEditor(CLOSED, { type: 'open', stop: { bar: 14, index: 0 }, by: 'mouse' }), { type: 'select', index: 1 });
    expect(s.target).toEqual({ bar: 14, index: 1 });
    expect(reduceEditor(CLOSED, { type: 'select', index: 1 })).toBe(CLOSED);
  });

  it('keeps its target valid when the bar changes: merged to one chord, emptied, split', () => {
    const on1 = reduceEditor(CLOSED, { type: 'open', stop: { bar: 6, index: 1 }, by: 'mouse' });
    expect(reduceEditor(on1, { type: 'fit', count: 1 }).target).toEqual({ bar: 6, index: 0 });
    expect(reduceEditor(on1, { type: 'fit', count: 0 }).target).toEqual({ bar: 6, index: -1 });
    expect(reduceEditor(on1, { type: 'fit', count: 2 })).toBe(on1);
    const empty = reduceEditor(CLOSED, { type: 'open', stop: { bar: 6, index: -1 }, by: 'mouse' });
    expect(reduceEditor(empty, { type: 'fit', count: 2 }).target).toEqual({ bar: 6, index: 0 });
  });

  it('typing starts with a root letter or « N »', () => {
    for (const k of ['A', 'b', 'G', 'n']) expect(startsChordSymbol(k)).toBe(true);
    for (const k of ['H', '7', ' ', 'Enter', 'ArrowLeft', '#', 'm']) expect(startsChordSymbol(k)).toBe(false);
  });
});

describe('changing a chord', () => {
  it('a new root keeps the quality, the extensions and the bass', () => {
    expect(patchChord(chord(5, '7', ['b9'], 0), { root: 7 })).toEqual(chord(7, '7', ['b9'], 0));
  });

  it('a bass equal to the new root disappears', () => {
    expect(patchChord(chord(5, '7', [], 7), { root: 7 }).bass).toBeNull();
  });

  it('a new quality keeps the root', () => {
    expect(patchChord(chord(10, 'min7'), { quality: 'hdim7' })).toEqual(chord(10, 'hdim7'));
  });

  it('an extension switches on and off, in chart order', () => {
    let c = chord(7, '7');
    c = patchChord(c, { toggle: '13' });
    c = patchChord(c, { toggle: 'b9' });
    expect(c.extensions).toEqual(['b9', '13']);
    expect(patchChord(c, { toggle: '13' }).extensions).toEqual(['b9']);
  });

  it('a bass note, then none', () => {
    const c = patchChord(chord(0, 'maj'), { bass: 4 });
    expect(c.bass).toBe(4);
    expect(patchChord(c, { bass: null }).bass).toBeNull();
  });

  it('from « N.C. » or a bar with no chord of its own, a major triad on the fallback root', () => {
    expect(patchChord(null, { root: 2 })).toEqual(chord(2, 'maj'));
    expect(patchChord(undefined, { quality: 'min7' }, 9)).toEqual(chord(9, 'min7'));
  });
});

describe('what the editor offers', () => {
  it('every quality of the model, once', () => {
    expect([...QUALITY_CHOICES].sort()).toEqual([...CHORD_QUALITIES].sort());
  });

  it('every extension of the model', () => {
    expect(EXTENSION_CHOICES).toHaveLength(11);
  });

  it('the twelve notes are spelled for the displayed key', () => {
    const ab = noteChoices(displayContext({ tonic: 8, mode: 'major' }, 0, 'ut', 'm')).map((n) => noteText(n.note));
    expect(ab).toEqual(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']);
    // Transposed up a tone: B♭ major, and a B♭ instrument another tone on: C major.
    const bb = noteChoices(displayContext({ tonic: 8, mode: 'major' }, 2, 'ut', 'm')).map((n) => noteText(n.note));
    expect(bb[10]).toBe('B♭');
    expect(bb[3]).toBe('E♭');
    const sharp = noteChoices(displayContext({ tonic: 7, mode: 'major' }, 0, 'ut', 'm')).map((n) => noteText(n.note));
    expect(sharp[6]).toBe('F♯');
  });
});

describe('typed symbols read by the harmony module', () => {
  const read = (s: string) => {
    const p = parseChord(s);
    return p.ok ? (p.chord ? chordText(p.chord) : 'N.C.') : null;
  };

  it('the ones a player types', () => {
    expect(read('Bbm7')).toBe('B♭m7');
    expect(read('F7b9')).toBe('F7(♭9)');
    expect(read('C-7')).toBe('Cm7');
    expect(read('Ebmaj7')).toBe('E♭△');
    expect(read('F#m7b5')).toBe('F♯m7♭5');
    expect(read('Ab7#11')).toBe('A♭7(♯11)');
    expect(read('Dm7/G')).toBe('Dm7/G');
    expect(read('Gsus')).toBe('Gsus4');
    expect(read('C△7')).not.toBeNull();
    expect(read('C7alt')).toBe('C7(alt)');
    expect(read('nc')).toBe('N.C.');
    expect(read('N.C.')).toBe('N.C.');
  });

  it('nonsense is not a chord', () => {
    expect(read('')).toBeNull();
    expect(read('Hm')).toBeNull();
    expect(read('C7x')).toBeNull();
    expect(read('12')).toBeNull();
  });
});
