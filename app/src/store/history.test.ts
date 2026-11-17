// « Annuler » / « Rétablir » (C11) and the « modified » state (C5): every
// undoable family undone and redone, gestures grouped, limits, what is never
// recorded, the analysis / separation / render cases, the mix given back by
// track id, the labels, and the save point.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { runTempoFix } from '../analysis/runner';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { clearAudio, getAudio } from '../audio/registry';
import { constantTempoMap } from '../grid/tempoMap';
import { MockSeparator } from '../separation/mock';
import { replaceSeparator } from '../separation';
import { setDevice } from '../separation/device';
import { startSeparation } from '../separation/runner';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { applyAnalysis } from './analysisActions';
import { toProjectDocument } from './document';
import { setExportPrefs } from './exportActions';
import { doubleTheTempo, halveTheTempo, moveDownbeat, placeDownbeatAtPlayhead, resetGridToAnalysis, setBeatsPerBar } from './gridActions';
import { removeChord, setBarChords, setKey, setSection, setTuningCorrection } from './harmonyActions';
import * as history from './history';
import { deleteLoop, renameLoop, saveCurrentLoop } from './markerActions';
import { cycleBeatLevel, setAcceleration, setCountInBars, setMeter, setMetronomeVolume, toggleAcceleration } from './metronomeActions';
import { showInstruments, showWholePiece } from './separationActions';
import { appStore, initialState, type AppState } from './store';

const SR = ENGINE_SAMPLE_RATE;
const DURATION = 36;
const map120 = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const get = () => appStore.getState();

let now = 0;
let engine: MockEngine;
let stop: () => void = () => {};

/** The undoable part, as plain data. */
function part(s: AppState = get()) {
  const mix = (trs: AppState['tracks']) => trs.map((tr) => ({ id: tr.id, mute: tr.mute, solo: tr.solo, volume: tr.volume }));
  return structuredClone({
    corrections: s.corrections,
    tempoMap: s.tempoMap,
    loop: s.loop,
    markers: s.markers,
    playback: s.playback,
    metronome: s.metronome,
    analysis: s.analysis,
    mix: mix(s.tracks),
    aside: mix(s.separation.aside),
  });
}

/** Runs `change`, then checks that undo gives back the state before and redo the state after. */
async function undoesAndRedoes(change: () => unknown, what?: string): Promise<void> {
  const before = part();
  await change();
  const after = part();
  expect(after).not.toEqual(before);
  expect(history.canUndo()).toBe(true);
  if (what) expect(history.undoLabel()).toBe(`Annuler : ${what}`);
  expect(history.undo()).toBe(true);
  expect(part()).toEqual(before);
  if (what) expect(history.redoLabel()).toBe(`Rétablir : ${what}`);
  expect(history.redo()).toBe(true);
  expect(part()).toEqual(after);
  now += 10_000; // the next change is never coalesced with this one
}

async function openPiece(source: 'file' | 'demo' = 'file', tracks = 2) {
  await actions.openProject({
    title: 'Essai',
    source: source === 'file' ? { kind: 'file', fileName: 'essai.mp3' } : { kind: 'demo' },
    tracks: Array.from({ length: tracks }, (_, i) => ({ role: i === 0 ? ('basse' as const) : ('piano' as const), audio: { channels: [new Float32Array(SR * DURATION)], sampleRate: SR } })),
    tempoMap: map120,
  });
}

beforeEach(async () => {
  appStore.setState(initialState(), true);
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  clearAudio();
  engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
  replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
  now = 1_000_000;
  stop = history.startHistory(appStore, { now: () => now, afterRestore: (s, before) => s.loop !== before.loop && actions.enterLoop() });
  await openPiece();
});

afterEach(() => stop());

describe('every undoable family is undone and redone', () => {
  it('chords, sections, key, tuning', async () => {
    await undoesAndRedoes(() => setBarChords(2, [{ beatInBar: 0, chord: { root: 2, quality: 'min7', extensions: [], bass: null } as never }]), 'accords');
    await undoesAndRedoes(() => removeChord(2, 0), 'accords');
    await undoesAndRedoes(() => setSection(4, 'B'), 'sections');
    await undoesAndRedoes(() => setKey({ tonic: 3, mode: 'major' }), 'tonalité');
    await undoesAndRedoes(() => setTuningCorrection(-12), 'accordage');
  });

  it('grid corrections: first beat, meter, tempo typed by hand, and on analysed beats × 2, ÷ 2, back to the analysis', async () => {
    await undoesAndRedoes(() => moveDownbeat(1), 'correction de la grille');
    await undoesAndRedoes(() => setBeatsPerBar(3), 'correction de la grille');
    await undoesAndRedoes(() => setMeter({ numerator: 6, denominator: 8 }), 'correction de la grille');
    await undoesAndRedoes(() => actions.setManualGrid({ bpm: 100 }), 'correction de la grille');
    applyAnalysis(demoSwingResult(DURATION));
    await undoesAndRedoes(() => doubleTheTempo(), 'correction de la grille');
    doubleTheTempo();
    await undoesAndRedoes(() => halveTheTempo(), 'correction de la grille');
    actions.seek(3.3);
    await undoesAndRedoes(() => placeDownbeatAtPlayhead(), 'correction de la grille');
    await undoesAndRedoes(() => resetGridToAnalysis(), 'correction de la grille');
  });

  it('a manual tempo action is one step for the grid, the tempo fixes and the analysed chords together', async () => {
    applyAnalysis(demoSwingResult(DURATION));
    const before = part();
    await runTempoFix('continuity', 4);
    const after = part();
    expect(after.tempoMap).not.toEqual(before.tempoMap);
    expect(after.corrections.tempoFixes).toHaveLength(1);
    expect(history.undoLabel()).toBe('Annuler : correction du tempo');
    history.undo();
    expect(part()).toEqual(before);
    expect(get().analysis).toEqual(before.analysis);
    history.redo();
    expect(part()).toEqual(after);
    expect(history.canUndo()).toBe(true);
  });

  it('loop and markers', async () => {
    await undoesAndRedoes(() => actions.setLoopRegion({ start: 4, end: 8 }), 'boucle');
    await undoesAndRedoes(() => actions.toggleLoop(), 'boucle');
    await undoesAndRedoes(() => saveCurrentLoop(), 'repères');
    const id = get().markers.loops[0]!.id;
    await undoesAndRedoes(() => renameLoop(id, 'Pont'), 'repères');
    await undoesAndRedoes(() => deleteLoop(id), 'repères');
  });

  it('mix: volume, mute, solo per track', async () => {
    const [a, b] = get().tracks.map((tr) => tr.id);
    await undoesAndRedoes(() => actions.setTrackVolume(a!, 0.4), 'volume de la piste');
    await undoesAndRedoes(() => actions.toggleMute(b!), 'piste coupée');
    await undoesAndRedoes(() => actions.toggleSolo(a!), 'piste seule');
  });

  it('playback: semitones, cents, tempo ratio, metronome on/off', async () => {
    await undoesAndRedoes(() => actions.stepSemitones(1), 'transposition');
    await undoesAndRedoes(() => actions.setCents(-14), 'réglage fin');
    await undoesAndRedoes(() => actions.setTempoRatio(0.8), 'tempo de lecture');
    await undoesAndRedoes(() => actions.toggleMetronome(), 'métronome');
  });

  it('metronome settings', async () => {
    await undoesAndRedoes(() => setMetronomeVolume(0.3), 'réglages du métronome');
    await undoesAndRedoes(() => setCountInBars(2), 'réglages du métronome');
    await undoesAndRedoes(() => cycleBeatLevel({ numerator: 4, denominator: 4 }, 1), 'réglages du métronome');
    await undoesAndRedoes(() => toggleAcceleration(), 'réglages du métronome');
    await undoesAndRedoes(() => setAcceleration({ targetPercent: 120 }), 'réglages du métronome');
  });

  it('the sound follows what is put back (mix, loop, transposition, tempo, metronome)', () => {
    const a = get().tracks[0]!.id;
    actions.setTrackVolume(a, 0.25);
    actions.setLoopRegion({ start: 2, end: 6 });
    actions.stepSemitones(-1);
    actions.setTempoRatio(0.7);
    setMetronomeVolume(0.2);
    actions.togglePlay();
    for (let i = 0; i < 5; i++) history.undo();
    const e = engine.snapshot();
    expect(e.tracks.find((tr) => tr.id === a)!.mix.volume).toBe(1);
    expect(e.loop).toBeNull();
    expect(e.semitones).toBe(0);
    expect(e.tempoRatio).toBe(1);
    expect(e.metronomeVolume).toBe(get().metronome.volume);
    expect(e.state).toBe('playing');
    // Redone while playing: the loop is heard again and the playhead goes into it.
    actions.seek(20);
    for (let i = 0; i < 5; i++) history.redo();
    expect(engine.snapshot().loop).toEqual({ start: 2, end: 6 });
    expect(engine.getPosition()).toBeCloseTo(2);
    expect(engine.snapshot().tracks.find((tr) => tr.id === a)!.mix.volume).toBe(0.25);
  });
});

describe('the history', () => {
  it('a new change clears what could be redone', () => {
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    history.undo();
    expect(history.canRedo()).toBe(true);
    actions.toggleMetronome();
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBe(false);
    expect(get().playback.semitones).toBe(1);
  });

  it('an explicit gesture is one step, with its label', () => {
    const a = get().tracks[0]!.id;
    history.beginGesture();
    for (const v of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      actions.setTrackVolume(a, v);
      now += 2000; // a slow drag: far apart, still one gesture
    }
    history.endGesture();
    actions.setTrackVolume(a, 0.1);
    expect(history.undo()).toBe(true);
    expect(get().tracks[0]!.volume).toBeCloseTo(0.4);
    expect(history.undo()).toBe(true);
    expect(get().tracks[0]!.volume).toBe(1);
    expect(history.canUndo()).toBe(false);

    history.transact('history.what.loop', () => {
      actions.setLoopRegion({ start: 1, end: 3 });
      actions.setCents(20);
    });
    expect(history.undoLabel()).toBe('Annuler : boucle');
    history.undo();
    expect(get().playback.cents).toBe(0);
    expect(get().loop.region).toBeNull();
  });

  it('rapid changes of one continuous field are coalesced (fake time); two fields are not merged', () => {
    const [a, b] = get().tracks.map((tr) => tr.id);
    actions.setTrackVolume(a!, 0.9);
    now += 100;
    actions.setTrackVolume(a!, 0.8);
    now += 300;
    actions.setTrackVolume(a!, 0.7);
    now += history.COALESCE_MS + 1;
    actions.setTrackVolume(a!, 0.6); // too late: a new step
    now += 50;
    actions.setTrackVolume(b!, 0.5); // another track: another step
    now += 50;
    actions.setCents(10); // another field
    now += 50;
    actions.setCents(11);
    history.undo();
    expect(get().playback.cents).toBe(0);
    history.undo();
    expect(get().tracks[1]!.volume).toBe(1);
    history.undo();
    expect(get().tracks[0]!.volume).toBeCloseTo(0.7);
    history.undo();
    expect(get().tracks[0]!.volume).toBe(1);
    expect(history.canUndo()).toBe(false);
  });

  it('discrete changes are never coalesced, however fast', () => {
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    setSection(2, 'A');
    setSection(4, 'B');
    history.undo();
    history.undo();
    expect(get().corrections.sections).toEqual([]);
    history.undo();
    expect(get().playback.semitones).toBe(1);
  });

  it('a slider brought back where it started leaves no step', () => {
    const a = get().tracks[0]!.id;
    history.beginGesture();
    actions.setTrackVolume(a, 0.5);
    actions.setTrackVolume(a, 1);
    history.endGesture();
    expect(history.canUndo()).toBe(false);
  });

  it('keeps the last 100 steps', () => {
    for (let i = 1; i <= 120; i++) setSection(i % 2 ? 2 : 4, `S${i}`);
    let n = 0;
    while (history.undo()) n++;
    expect(n).toBe(history.HISTORY_LIMIT);
    // Back to the state after the 20th change.
    expect(get().corrections.sections.map((x) => x.label)).toEqual(['S19', 'S20']);
  });

  it('is cleared when the project changes (new, closed)', async () => {
    actions.stepSemitones(1);
    expect(history.canUndo()).toBe(true);
    await openPiece();
    expect(history.canUndo()).toBe(false);
    actions.stepSemitones(1);
    actions.closeProject();
    expect(history.historyStatus()).toEqual({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, modified: false });
  });

  it('is cleared when a kept or saved project is opened again, even the same one', async () => {
    const doc = toProjectDocument(get())!;
    const audio = new Map(get().tracks.map((tr) => [tr.audio.id, getAudio(tr.audio.id)!]));
    history.markSaved();
    actions.stepSemitones(1);
    await actions.restoreProject(doc, audio);
    expect(get().project!.id).toBe(doc.project.id);
    expect(history.canUndo()).toBe(false);
    // Reopened: modified until the opener says it matches its file (`markSaved`).
    expect(history.isModified()).toBe(true);
    history.markSaved();
    expect(history.isModified()).toBe(false);
  });

  it('never records the view, the settings, the export choices, the interface, the transport', () => {
    actions.setZoom(80);
    actions.setTrackHeight(90);
    actions.setSubdivision(4);
    actions.toggleTriplets();
    actions.toggleSnap();
    actions.setFollow(false);
    actions.setViewMode('grille');
    actions.setMinorNotation('–');
    setExportPrefs({ format: 'flac' });
    actions.openPanel('metronome');
    actions.togglePlay();
    actions.seek(4);
    actions.togglePlay();
    expect(history.canUndo()).toBe(false);
  });

  it('a full analysis is not a step and clears the history (its grid replaces the one in force)', () => {
    actions.stepSemitones(1);
    moveDownbeat(1);
    applyAnalysis(demoSwingResult(DURATION));
    expect(history.canUndo()).toBe(false);
    expect(history.isModified()).toBe(true);
    // Steps after it work as usual.
    const grid = get().tempoMap;
    setBeatsPerBar(3);
    history.undo();
    expect(get().tempoMap).toBe(grid);
  });

  it('stage 5: the derived fields of the analysis (modulations, structure) are no step, never clear the history, are not given back by an undo', () => {
    applyAnalysis(demoSwingResult(DURATION));
    history.markSaved();
    setKey({ tonic: 3, mode: 'major' });
    actions.stepSemitones(1);
    const label = history.undoLabel();
    expect(label).not.toBeNull();
    const a = get().analysis!;
    const derived = { ...a, keyChanges: [{ time: 8, key: { tonic: 7, mode: 'major' as const, confidence: 0.6, alternatives: [] } }], structure: { mode: 'jazz' as const, form: 'A', sections: [], parts: [] } };
    appStore.setState({ analysis: derived });
    // Not cleared, no new step: the last step is still the transposition.
    expect(history.canUndo()).toBe(true);
    expect(history.undoLabel()).toBe(label);
    history.undo();
    expect(get().playback.semitones).toBe(0);
    // The undo left the derived fields as they are (the next refresh recomputes them).
    expect(get().analysis).toBe(derived);
    history.undo();
    expect(get().corrections.key).toBeNull();
    expect(get().analysis).toBe(derived);
    // Back at the save point but for the derived fields: modified, as they differ from those saved.
    expect(history.isModified()).toBe(true);
    appStore.setState({ analysis: { ...derived, keyChanges: a.keyChanges, structure: a.structure } });
    expect(history.isModified()).toBe(false);
    history.redo();
    expect(get().corrections.key).toEqual({ tonic: 3, mode: 'major' });
  });

  it('a separation is not a step; the mix goes back by track id, wherever the track is', async () => {
    const whole = get().tracks[0]!.id;
    actions.setTrackVolume(whole, 0.3);
    now += 10_000;
    await startSeparation();
    expect(get().separation.showing).toBe('instruments');
    const inst = get().tracks[0]!.id;
    actions.setTrackVolume(inst, 0.6);
    now += 10_000;
    await showWholePiece();
    await showInstruments();
    // Two steps only: the swaps are not.
    expect(history.undo()).toBe(true);
    expect(get().tracks[0]!.volume).toBe(1);
    expect(history.undo()).toBe(true);
    // The whole piece is aside: its volume came back there; the instruments were left as they are.
    expect(get().separation.aside.find((tr) => tr.id === whole)!.volume).toBe(1);
    expect(get().tracks.map((tr) => tr.id)).toContain(inst);
    expect(history.canUndo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(get().separation.aside.find((tr) => tr.id === whole)!.volume).toBe(0.3);
  });

  it('a track that is gone is skipped, a new one left alone', () => {
    const [a, b] = get().tracks.map((tr) => tr.id);
    actions.setTrackVolume(a!, 0.2);
    now += 10_000;
    actions.setTrackVolume(b!, 0.3);
    // Tracks replaced from outside the history (as a separation does): `a` is gone, `c` is new.
    appStore.setState((s) => ({ tracks: [s.tracks[1]!, { ...s.tracks[1]!, id: 'c', volume: 0.7 }], separation: { ...s.separation } }));
    expect(history.undo()).toBe(true);
    expect(get().tracks.map((tr) => [tr.id, tr.volume])).toEqual([[b, 1], ['c', 0.7]]);
    expect(history.undo()).toBe(true);
    expect(get().tracks.map((tr) => [tr.id, tr.volume])).toEqual([[b, 1], ['c', 0.7]]);
  });

  it('an applied render is not a step, and counts as a modification', () => {
    history.markSaved();
    appStore.setState({ keptRender: { target: {} as never, renderedAt: '2026-11-16T10:00:00Z', tracks: [] } });
    expect(history.canUndo()).toBe(false);
    expect(history.isModified()).toBe(true);
  });

  it('nothing to undo without a running history', () => {
    stop();
    actions.stepSemitones(1);
    expect(history.undo()).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(history.transact(null, () => 7)).toBe(7);
  });
});

describe('labels', () => {
  it('names the step from what changed', () => {
    expect(history.labelFor(['mix.volume.x'])).toBe('history.what.volume');
    expect(history.labelFor(['corrections.chords', 'corrections.handSpans'])).toBe('history.what.chords');
    expect(history.labelFor(['analysis', 'tempoMap', 'corrections.tempoFixes'])).toBe('history.what.tempoFix');
    expect(history.labelFor(['tempoMap', 'corrections.tempoFixes'])).toBe('history.what.grid');
    // A field a later version adds to a slice still gets a name.
    expect(history.labelFor(['corrections.keyChanges'])).toBe('history.what.key');
    expect(history.labelFor(['corrections.somethingNew'])).toBe('history.what.corrections');
    expect(history.labelFor(['whatever'])).toBe('history.what.change');
    expect(history.undoLabel()).toBeNull();
    expect(history.redoLabel()).toBeNull();
  });
});

describe('modified since the last save (C5)', () => {
  it('a new piece starts modified; the demo does not', async () => {
    expect(history.isModified()).toBe(true);
    await openPiece('demo');
    expect(history.isModified()).toBe(false);
  });

  it('follows the changes, the save point and undo back to it', () => {
    const a = get().tracks[0]!.id;
    history.markSaved();
    expect(history.isModified()).toBe(false);
    actions.setTrackVolume(a, 0.5);
    expect(history.isModified()).toBe(true);
    history.undo();
    expect(history.isModified()).toBe(false);
    history.redo();
    expect(history.isModified()).toBe(true);
    history.markSaved();
    expect(history.isModified()).toBe(false);
    history.undo();
    expect(history.isModified()).toBe(true);
    history.redo();
    expect(history.isModified()).toBe(false);
  });

  it('view, zoom, playhead, export choices do not count; an analysis does, and undoing does not take it back', () => {
    history.markSaved();
    actions.setZoom(70);
    actions.setViewMode('grille');
    actions.seek(10);
    setExportPrefs({ format: 'mp3' });
    actions.openPanel('grid');
    expect(history.isModified()).toBe(false);
    actions.stepSemitones(1);
    applyAnalysis(demoSwingResult(DURATION));
    expect(history.isModified()).toBe(true);
    history.markSaved();
    moveDownbeat(1);
    history.undo();
    expect(history.isModified()).toBe(false);
  });

  it('a separation counts, even when the mix is undone back to the save point', async () => {
    history.markSaved();
    actions.setTrackVolume(get().tracks[0]!.id, 0.5);
    await startSeparation();
    history.undo();
    expect(history.isModified()).toBe(true);
  });

  it('resetHistory starts a project with the given state', () => {
    actions.stepSemitones(1);
    history.resetHistory({ modified: false });
    expect(history.canUndo()).toBe(false);
    expect(history.isModified()).toBe(false);
    history.markModified();
    expect(history.isModified()).toBe(true);
  });

  it('subscribers hear the status change (the Mac menu bar greys its entries out)', () => {
    const seen: history.HistoryStatus[] = [];
    const off = history.subscribeHistory((st) => seen.push(st));
    actions.stepSemitones(1);
    history.undo();
    off();
    expect(seen.map((st) => [st.canUndo, st.canRedo])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});
