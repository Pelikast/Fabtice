// Lot 4: document version 4 (metronome, markers) and its migration, the
// autosave list, the metronome and markers actions, what reaches the engine.

import { beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { clearAudio } from '../audio/registry';
import { constantTempoMap } from '../grid/tempoMap';
import { emptyCorrections } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION } from '../model/document';
import { emptyMarkers } from '../model/markers';
import { defaultMetronome } from '../model/metronome';
import { readDocument } from '../storage/documentFormat';
import { StorageError } from '../storage/ProjectStorage';
import { fakeClock } from '../test/fakeClock';
import { sampleDocument } from '../test/sampleDocument';
import * as actions from './actions';
import { documentChanged, fromProjectDocument, toProjectDocument } from './document';
import { setSection } from './harmonyActions';
import { addSection, deleteLoop, moveLoop, recallLoop, recallSection, renameLoop, saveCurrentLoop } from './markerActions';
import { cycleBeatLevel, resetPattern, setAcceleration, setCountInBars, setGrouping, setMeter, setMetronomeVolume, toggleAcceleration } from './metronomeActions';
import { appStore, initialState } from './store';

const SR = ENGINE_SAMPLE_RATE;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

let engine: MockEngine;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  appStore.setState(initialState(), true);
  clearAudio();
  clock = fakeClock();
  engine = new MockEngine(clock.clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
});

async function openPiece(seconds = 20) {
  await actions.openProject({
    title: 'Blues',
    source: { kind: 'file', fileName: 'blues.mp3' },
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(SR * seconds)], sampleRate: SR } }],
    tempoMap: constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }),
  });
}

describe('document version 4', () => {
  /** What lots 1, 2 and 3 wrote. */
  const lot3 = () => {
    const { metronome: _m, markers: _k, ...v3 } = sampleDocument({ corrections: { ...emptyCorrections(), sections: [{ time: 4, label: 'A' }, { time: 12, label: 'B' }] } });
    return { ...v3, version: 3 };
  };
  const lot2 = () => {
    const { separation: _s, exportPrefs: _e, ...rest } = lot3();
    return { ...rest, version: 2 };
  };
  const lot1 = () => {
    const { analysis: _a, corrections: _c, ...rest } = lot2();
    const { instrument: _i, ...view } = rest.view;
    return { ...rest, view, version: 1 };
  };

  it.each([
    ['lot 3', lot3],
    ['lot 2', lot2],
    ['lot 1', lot1],
  ])('a %s piece reopens unchanged, with the metronome as it was and no named loop', (_name, make) => {
    const stored = make();
    const doc = readDocument(json(stored))!;
    expect(doc.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(doc.metronome).toEqual(defaultMetronome());
    expect(doc.markers).toEqual(emptyMarkers());
    // everything that was there is there, as it was
    expect(doc.project).toEqual(stored.project);
    expect(doc.tracks).toEqual(stored.tracks);
    expect(doc.tempoMap).toEqual(stored.tempoMap);
    expect(doc.loop).toEqual(stored.loop);
    expect(doc.playback).toEqual(stored.playback);
    if ('corrections' in stored) expect(doc.corrections).toEqual(stored.corrections);
    // and the store opens it with the same settings
    const st = fromProjectDocument(doc, initialState());
    expect(st.metronome).toEqual(defaultMetronome());
    expect(st.playback).toEqual(stored.playback);
  });

  it('round trip: what the store saves is read back exactly', async () => {
    await openPiece();
    setMetronomeVolume(0.35);
    setCountInBars(2);
    setGrouping({ numerator: 7, denominator: 8 }, [3, 2, 2]);
    toggleAcceleration();
    actions.setLoopRegion({ start: 2, end: 4.5 });
    saveCurrentLoop('Pont');
    const doc = toProjectDocument(appStore.getState())!;
    const back = readDocument(json(doc))!;
    expect(back.metronome).toEqual(doc.metronome);
    expect(back.markers).toEqual(doc.markers);
    expect(back.markers.loops[0]!.name).toBe('Pont');
  });

  it('an unreadable metronome goes back to its defaults, field by field; a pattern that does not fit is dropped', () => {
    const doc = sampleDocument();
    const read = readDocument(
      json({
        ...doc,
        metronome: { volume: 'fort', countInBars: 3, patterns: { '7/8': { grouping: [2, 2, 3], levels: ['accent'] }, '5/4': { grouping: [2, 3], levels: ['accent', 'soft', 'normal', 'soft', 'soft'] } }, acceleration: { enabled: true, startPercent: 'x' } },
      }),
    )!;
    expect(read.metronome.volume).toBe(defaultMetronome().volume);
    expect(read.metronome.countInBars).toBe(0);
    expect(Object.keys(read.metronome.patterns)).toEqual(['5/4']);
    expect(read.metronome.acceleration.enabled).toBe(true);
    expect(read.metronome.acceleration.startPercent).toBe(defaultMetronome().acceleration.startPercent);
  });

  it.each([
    ['not a list', { loops: 'x' }],
    ['a loop without a name', { loops: [{ id: 'a', name: '', region: { start: 1, end: 2 } }] }],
    ['an empty region', { loops: [{ id: 'a', name: 'A', region: { start: 2, end: 2 } }] }],
    ['the same id twice', { loops: [{ id: 'a', name: 'A', region: { start: 1, end: 2 } }, { id: 'a', name: 'B', region: { start: 3, end: 4 } }] }],
  ])('named loops are made by hand: a damaged list is « corrupt » (%s)', (_name, markers) => {
    let code = '';
    try {
      readDocument(json({ ...sampleDocument(), markers }));
    } catch (e) {
      code = (e as StorageError).code;
    }
    expect(code).toBe('corrupt');
  });

  it('the autosave hears the metronome and the markers', () => {
    const a = appStore.getState();
    expect(documentChanged(a, { ...a, metronome: { ...a.metronome } })).toBe(true);
    expect(documentChanged(a, { ...a, markers: { ...a.markers } })).toBe(true);
    expect(documentChanged(a, { ...a })).toBe(false);
  });
});

describe('metronome actions and the engine', () => {
  it('volume, patterns and acceleration reach the engine', async () => {
    await openPiece();
    setMetronomeVolume(0.25);
    expect(engine.snapshot().metronomeVolume).toBe(0.25);
    setAcceleration({ startPercent: 80, stepPercent: 10, everyRepeats: 3, targetPercent: 100 });
    expect(engine.snapshot().acceleration).toBeNull(); // not enabled yet
    toggleAcceleration();
    expect(engine.snapshot().acceleration).toEqual({ factors: [0.8, 0.9, 1], every: 3 });
    const before = engine.snapshot().clicks;
    cycleBeatLevel({ numerator: 4, denominator: 4 }, 1); // normal -> soft
    cycleBeatLevel({ numerator: 4, denominator: 4 }, 1); // soft -> silent: one click less per bar
    expect(engine.snapshot().clicks).toBe(before - before / 4);
    resetPattern({ numerator: 4, denominator: 4 });
    expect(engine.snapshot().clicks).toBe(before);
  });

  it('a meter set from the panel corrects the grid (beat times stay)', async () => {
    await openPiece();
    setMeter({ numerator: 6, denominator: 8 });
    const map = appStore.getState().tempoMap;
    expect(map.meters[0]!.meter).toEqual({ numerator: 6, denominator: 8 });
    expect(map.segments[0]!.bpm).toBe(360);
    setMeter({ numerator: 1, denominator: 8 }); // not offered: nothing changes
    expect(appStore.getState().tempoMap).toBe(map);
  });

  it('Play with a count-in hands the engine one bar of beats before the playhead', async () => {
    await openPiece();
    setCountInBars(1);
    actions.seek(4);
    actions.play();
    await Promise.resolve();
    expect(engine.snapshot().lastCountIn).toEqual([2, 1.5, 1, 0.5]);
    // the position waits during the count-in
    clock.advance(1500);
    expect(engine.getPosition()).toBe(4);
    expect(engine.getMetronomeStatus().countInLeft).toBe(1);
    clock.advance(1000);
    expect(engine.getPosition()).toBeCloseTo(4.5, 6);
  });

  it('a new piece keeps the click’s volume and the count-in, not the rest', async () => {
    await openPiece();
    setMetronomeVolume(0.2);
    setCountInBars(1);
    toggleAcceleration();
    await openPiece();
    const m = appStore.getState().metronome;
    expect(m.volume).toBe(0.2);
    expect(m.countInBars).toBe(1);
    expect(m.acceleration.enabled).toBe(false);
  });
});

describe('markers actions', () => {
  it('keep, recall, rename, reorder, delete named loops', async () => {
    await openPiece();
    expect(saveCurrentLoop()).toBeNull(); // no loop yet
    actions.setLoopRegion({ start: 2, end: 4 });
    const a = saveCurrentLoop()!;
    expect(saveCurrentLoop()).toBe(a); // the same region is not kept twice
    actions.setLoopRegion({ start: 6.25, end: 7.1 });
    const b = saveCurrentLoop()!;
    expect(appStore.getState().markers.loops.map((l) => l.name)).toEqual(['Boucle 1', 'Boucle 2']);
    actions.seek(15);
    recallLoop(a);
    expect(appStore.getState().loop).toEqual({ region: { start: 2, end: 4 }, enabled: true });
    expect(engine.getPosition()).toBe(2); // brought into the loop
    renameLoop(a, '  Pont   du   milieu ');
    renameLoop(b, '   ');
    expect(appStore.getState().markers.loops.map((l) => l.name)).toEqual(['Pont du milieu', 'Boucle 2']);
    moveLoop(b, -1);
    moveLoop(b, -1); // already first
    expect(appStore.getState().markers.loops.map((l) => l.id)).toEqual([b, a]);
    deleteLoop(b);
    expect(appStore.getState().markers.loops.map((l) => l.id)).toEqual([a]);
  });

  it('sections are the chart letters: added at the loop start, looped to the next one', async () => {
    await openPiece();
    setSection(0, 'A');
    actions.setLoopRegion({ start: 8.2, end: 9 }); // inside bar 5 (2 s bars)
    const bar = addSection();
    expect(bar).toBe(4);
    const s = appStore.getState();
    expect(s.corrections.sections.map((x) => x.label)).toEqual(['A', 'B']);
    recallSection(0);
    expect(appStore.getState().loop.region).toEqual({ start: 0, end: 8 });
    recallSection(4);
    expect(appStore.getState().loop.region).toEqual({ start: 8, end: 20 }); // to the end of the piece
  });
});
