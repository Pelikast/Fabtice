// What the chord editor, the key menu and the section control do to the store:
// typed chords read as displayed and stored at concert pitch, merge, key by
// hand, sections, and that every one of them reaches the saved document.

import { beforeEach, describe, expect, it } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { replaceEngine } from '../audio';
import { MockEngine } from '../audio/MockEngine';
import { hasBarEdit, SECTION_LABEL_MAX } from '../chart/edits';
import { chordGoingOn } from '../chart/layout';
import { chord } from '../harmony/chord';
import { displayChordText } from '../harmony/display';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { keyInForce, selectBarChords, selectChartBars } from './chartSelectors';
import { documentChanged } from './document';
import * as harmony from './harmonyActions';
import { appStore, initialState } from './store';

const DURATION = 36;
const get = () => appStore.getState();
const { clock } = fakeClock();
const written = (bar: number) => {
  const { chords, ctx, repeat } = selectBarChords(get(), bar);
  return repeat ? '%' : chords.map((c) => displayChordText(c.chord, ctx)).join(' ');
};
const stored = (bar: number) => selectBarChords(get(), bar).chords.map((c) => c.chord);

beforeEach(async () => {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * DURATION)], sampleRate: ENGINE_SAMPLE_RATE } }],
  });
  applyAnalysis(demoSwingResult(DURATION));
});

describe('typing a chord', () => {
  it('reads what the player types, as displayed, and stores it at concert pitch in the original key', () => {
    // Displayed key is the original one + 2 (transport) + 2 (B♭ instrument): 4 semitones.
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    harmony.setInstrument('sib');
    expect(harmony.writeChordText(2, 0, 'Bbm7')).toBe(true);
    expect(stored(2)).toEqual([chord(6, 'min7')]); // B♭ (10) − 4 = F♯ (6)
    expect(written(2)).toBe('B♭m7');
    expect(harmony.writeChordText(2, 0, 'F7b9/A')).toBe(true);
    expect(stored(2)).toEqual([chord(1, '7', ['b9'], 5)]); // F (5) − 4 = C♯ (1), A (9) − 4 = F (5)
    expect(written(2)).toBe('F7(♭9)/A');
  });

  it('every spelling of the examples', () => {
    for (const text of ['Bbm7', 'F7b9', 'C-7', 'Ebmaj7']) expect(harmony.writeChordText(3, 0, text)).toBe(true);
    // The piece is in B major: the typed E♭ is the chart's D♯ (spelled by degree).
    expect(written(3)).toBe('D♯△');
    expect(harmony.writeChordText(3, 0, 'C-7')).toBe(true);
    expect(written(3)).toBe('Cm7');
    actions.setMinorNotation('–');
    expect(written(3)).toBe('C–7');
  });

  it('« N.C. » is a chord of its own: no chord', () => {
    expect(harmony.writeChordText(3, 0, 'nc')).toBe(true);
    expect(stored(3)).toEqual([null]);
    expect(written(3)).toBe('N.C.');
  });

  it('something that is not a chord changes nothing', () => {
    const before = get().corrections;
    expect(harmony.writeChordText(3, 0, 'Hm7')).toBe(false);
    expect(harmony.writeChordText(3, 0, '')).toBe(false);
    expect(get().corrections).toBe(before);
  });

  it('typing on a bar where the chord goes on makes it a written chord', () => {
    expect(selectChartBars(get())[7]!.repeat).toBe(true);
    expect(harmony.writeChordText(7, -1, 'Gm7')).toBe(true);
    const bar = selectChartBars(get())[7]!;
    expect(bar.repeat).toBe(false);
    expect(bar.chords).toHaveLength(1);
    expect(bar.chords[0]!.origin).toBe('manual');
    expect(written(7)).toBe(displayChordText(chord(7, 'min7'), selectBarChords(get(), 7).ctx));
  });

  it('a chord given as displayed goes through the same way', () => {
    actions.stepSemitones(-1);
    harmony.replaceDisplayedChord(4, 0, chord(0, 'maj7'));
    expect(stored(4)).toEqual([chord(1, 'maj7')]); // C displayed one semitone down = C♯ stored
  });
});

describe('two chords in a bar, or one', () => {
  it('splits, then merges back keeping the chord asked for', () => {
    harmony.splitBar(3);
    harmony.replaceChord(3, 1, chord(11, '7'));
    expect(selectBarChords(get(), 3).chords.map((c) => c.beatInBar)).toEqual([0, 2]);
    harmony.mergeBar(3, 1);
    expect(selectBarChords(get(), 3).chords).toHaveLength(1);
    expect(selectBarChords(get(), 3).chords[0]!.beatInBar).toBe(0);
    expect(stored(3)).toEqual([chord(11, '7')]);
  });

  it('merging keeps the first chord by default and is harmless on one chord', () => {
    harmony.splitBar(3);
    harmony.replaceChord(3, 1, chord(11, '7'));
    const first = stored(3)[0];
    harmony.mergeBar(3);
    expect(stored(3)).toEqual([first]);
    harmony.mergeBar(3);
    expect(stored(3)).toEqual([first]);
  });

  it('what chord goes on at a bar', () => {
    const bars = selectChartBars(get());
    expect(chordGoingOn(bars, 0)).toBeUndefined();
    expect(chordGoingOn(bars, 8)).toEqual(bars[7]!.repeat ? chordGoingOn(bars, 7) : bars[7]!.chords.at(-1)!.chord);
  });
});

describe('back to the analysis', () => {
  it('tells which bars were written by hand', () => {
    const { tempoMap, corrections } = get();
    expect(hasBarEdit(corrections, tempoMap, 2)).toBe(false);
    harmony.writeChordText(2, 0, 'Dm7');
    expect(hasBarEdit(get().corrections, tempoMap, 2)).toBe(true);
    expect(hasBarEdit(get().corrections, tempoMap, 1)).toBe(false);
    expect(hasBarEdit(get().corrections, tempoMap, 3)).toBe(false);
    harmony.resetBar(2);
    expect(hasBarEdit(get().corrections, tempoMap, 2)).toBe(false);
  });

  it('confirming a doubtful chord makes it a hand chord, no longer doubtful', () => {
    const doubtful = selectChartBars(get()).find((b) => b.chords.some((c) => c.doubtful))!;
    harmony.confirmBar(doubtful.bar);
    expect(selectBarChords(get(), doubtful.bar).chords.every((c) => !c.doubtful && c.origin === 'manual')).toBe(true);
  });
});

describe('the key by hand', () => {
  it('is chosen as displayed and stored in the original key', () => {
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    const original = keyInForce(get()).key!;
    // The sheet reads « original + 2 »; the player corrects it to F major (displayed).
    harmony.setDisplayedKey({ tonic: 5, mode: 'major' });
    expect(get().corrections.key).toEqual({ tonic: (5 - 2 + 12) % 12, mode: 'major' });
    expect(original.tonic).not.toBe(get().corrections.key!.tonic);
    expect(selectBarChords(get(), 0).ctx.key).toEqual({ tonic: 5, mode: 'major' });
  });

  it('goes back to the analysed key with null, and choosing it again is no correction', () => {
    harmony.setDisplayedKey({ tonic: 5, mode: 'minor' });
    expect(get().corrections.key).not.toBeNull();
    harmony.setDisplayedKey(null);
    expect(get().corrections.key).toBeNull();
    harmony.setDisplayedKey({ ...get().analysis!.key! });
    expect(get().corrections.key).toBeNull();
  });
});

describe('sections', () => {
  it('place, rename, remove; one letter per bar; short', () => {
    harmony.setSection(4, 'A');
    harmony.setSection(4, 'Intro');
    expect(get().corrections.sections.map((s) => s.label)).toEqual(['Intro']);
    harmony.setSection(4, '  ');
    expect(get().corrections.sections).toEqual([]);
    harmony.setSection(4, 'x'.repeat(40));
    expect(get().corrections.sections[0]!.label).toHaveLength(SECTION_LABEL_MAX);
    harmony.setSection(4, null);
    expect(get().corrections.sections).toEqual([]);
  });

  it('a section on a bar gives a double bar before it, but not on the first bar of the chart', () => {
    harmony.setSection(0, 'A');
    harmony.setSection(12, 'Solo');
    const bars = selectChartBars(get());
    expect(bars[0]!.doubleBar).toBe(false);
    expect(bars[12]!.doubleBar).toBe(true);
    expect(bars[12]!.section).toBe('Solo');
  });
});

describe('every edit is part of the saved document (autosave)', () => {
  it('chords, key, sections', () => {
    const marks: unknown[] = [];
    const check = (before: ReturnType<typeof get>) => marks.push(documentChanged(before, get()));
    let before = get();
    harmony.writeChordText(2, 0, 'Dm7');
    check(before);
    before = get();
    harmony.setDisplayedKey({ tonic: 5, mode: 'minor' });
    check(before);
    before = get();
    harmony.setSection(4, 'B');
    check(before);
    expect(marks.every(Boolean)).toBe(true);
  });
});
