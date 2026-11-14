import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { replaceEngine } from '../audio';
import { MockEngine } from '../audio/MockEngine';
import { getAudio } from '../audio/registry';
import { constantTempoMap } from '../grid/tempoMap';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { steppedTempoRatio, targetBpm } from './derived';
import { PROJECT_DOCUMENT_VERSION } from '../model/document';
import { fromProjectDocument, toProjectDocument } from './document';
import { appStore, initialState } from './store';

const map110 = constantTempoMap({ bpm: 110, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });

describe('tempo stepping', () => {
  it('moves by 5 BPM from the rounded current tempo', () => {
    expect(steppedTempoRatio(1, -1, 110) * 110).toBeCloseTo(105);
    expect(steppedTempoRatio(60 / 110, 1, 110) * 110).toBeCloseTo(65);
  });
  it('stops on the original tempo when crossing it', () => {
    expect(steppedTempoRatio(113 / 118.4, 1, 118.4)).toBe(1);
    expect(steppedTempoRatio(110 / 118.4, 1, 118.4) * 118.4).toBeCloseTo(115);
    expect(steppedTempoRatio(120 / 118.4, -1, 118.4)).toBe(1);
    expect(steppedTempoRatio(1, 1, 118.4) * 118.4).toBeCloseTo(123);
  });
  it('steps by 5 % while the tempo is unknown, clamped', () => {
    expect(steppedTempoRatio(1, -1, null)).toBeCloseTo(0.95);
    expect(steppedTempoRatio(0.97, 1, null)).toBeCloseTo(1);
    expect(steppedTempoRatio(0.25, -1, null)).toBe(0.25);
    expect(steppedTempoRatio(2, 1, null)).toBe(2);
  });
});

describe('store and engine wiring', () => {
  const { clock, advance } = fakeClock();
  let engine: MockEngine;

  beforeEach(async () => {
    appStore.setState(initialState(), true);
    engine = new MockEngine(clock);
    replaceEngine(engine);
    connectEngine(appStore, engine);
    await actions.openProject({
      title: 'Essai',
      source: { kind: 'demo' },
      tracks: [
        { role: 'basse', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * 20)], sampleRate: ENGINE_SAMPLE_RATE } },
        { role: 'piano', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * 10)], sampleRate: ENGINE_SAMPLE_RATE } },
      ],
      tempoMap: map110,
      loop: { start: 2, end: 30 },
    });
  });

  it('opens a project: tracks, duration, registry, engine', () => {
    const s = appStore.getState();
    expect(s.project?.duration).toBe(20);
    expect(s.tracks.map((tr) => tr.name)).toEqual(['Basse', 'Piano']);
    expect(getAudio(s.tracks[0]!.audio.id)?.channels[0]?.length).toBe(ENGINE_SAMPLE_RATE * 20);
    expect(s.loop).toEqual({ region: { start: 2, end: 20 }, enabled: true });
    expect(s.ui.newPieceOpen).toBe(false);
    expect(s.transport.engine).toBe('ready');
    expect(engine.snapshot().loop).toEqual({ start: 2, end: 20 });
    expect(engine.snapshot().clicks).toBe(Math.ceil((20 * 110) / 60));
  });

  it('plays, pauses and reflects the engine state', () => {
    actions.togglePlay();
    expect(appStore.getState().transport.engine).toBe('playing');
    advance(1000);
    actions.togglePlay();
    expect(appStore.getState().transport.engine).toBe('ready');
    expect(engine.getPosition()).toBeCloseTo(1);
  });

  it('brings the playhead into a loop that was just selected or switched on', () => {
    actions.seek(15);
    actions.setLoopRegion({ start: 4, end: 8 });
    actions.enterLoop();
    expect(engine.getPosition()).toBe(4);

    // Inside the loop: nothing moves.
    actions.seek(6);
    actions.enterLoop();
    expect(engine.getPosition()).toBe(6);

    // Before the loop: it jumps to the start too.
    actions.seek(1);
    actions.enterLoop();
    expect(engine.getPosition()).toBe(4);

    // Loop off: the playhead is left alone; switching it back on brings it in.
    actions.toggleLoop();
    actions.seek(12);
    actions.enterLoop();
    expect(engine.getPosition()).toBe(12);
    actions.toggleLoop();
    expect(engine.getPosition()).toBe(4);
  });

  it('forwards key, tempo, metronome, loop and mix to the engine', () => {
    actions.stepSemitones(1);
    actions.stepSemitones(1);
    actions.setCents(-73);
    actions.stepTempo(-1);
    actions.toggleMetronome();
    actions.toggleLoop();
    const bass = appStore.getState().tracks[0]!;
    actions.toggleMute(bass.id);
    actions.setTrackVolume(bass.id, 0.4);
    const snap = engine.snapshot();
    expect(snap.semitones).toBe(2);
    expect(snap.cents).toBe(-50);
    expect(snap.tempoRatio * 110).toBeCloseTo(105);
    expect(targetBpm(appStore.getState())).toBeCloseTo(105);
    expect(snap.metronome).toBe(true);
    expect(snap.loop).toBeNull();
    expect(snap.tracks[0]!.mix).toEqual({ mute: true, solo: false, volume: 0.4 });
    actions.resetTransposition();
    actions.resetTempo();
    expect(engine.snapshot()).toMatchObject({ semitones: 0, cents: 0, tempoRatio: 1 });
  });

  it('clamps the key to an octave', () => {
    for (let i = 0; i < 20; i++) actions.stepSemitones(-1);
    expect(appStore.getState().playback.semitones).toBe(-12);
  });

  it('goes back to the loop start, or to 0 without a loop', () => {
    actions.seek(10);
    actions.backToStart();
    expect(engine.getPosition()).toBe(2);
    actions.toggleLoop();
    actions.backToStart();
    expect(engine.getPosition()).toBe(0);
  });

  it('sets the first downbeat at the playhead and rebuilds the clicks', () => {
    actions.seek(1.5);
    actions.setDownbeatAtPlayhead();
    const s = appStore.getState();
    expect(s.tempoMap.segments[0]).toMatchObject({ time: 1.5, bpm: 110 });
    expect(s.tempoMap.origin).toBe('manual');
  });

  it('leaves Auto when zooming by hand, keeps it for auto fits', () => {
    actions.applyAutoFit(12, 60);
    expect(appStore.getState().view).toMatchObject({ pxPerSecond: 12, trackHeight: 60 });
    actions.setZoom(5000);
    expect(appStore.getState().view).toMatchObject({ pxPerSecond: 400, auto: false });
  });

  it('closes panels before the dialog on Escape, never the dialog without a project', () => {
    actions.openNewPiece();
    actions.openPanel('settings');
    actions.escape();
    expect(appStore.getState().ui).toMatchObject({ panel: 'none', newPieceOpen: true });
    actions.escape();
    expect(appStore.getState().ui.newPieceOpen).toBe(false);
    appStore.setState({ project: null });
    actions.openNewPiece();
    actions.escape();
    expect(appStore.getState().ui.newPieceOpen).toBe(true);
  });

  it('round-trips the project document', () => {
    actions.stepSemitones(1);
    const doc = toProjectDocument(appStore.getState(), new Date(0))!;
    expect(doc.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(doc.savedAt).toBe('1970-01-01T00:00:00.000Z');
    const json = JSON.parse(JSON.stringify(doc));
    const restored = fromProjectDocument(json, initialState());
    expect(restored.playback?.semitones).toBe(1);
    expect(restored.tracks?.length).toBe(2);
  });
});
