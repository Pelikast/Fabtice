// The per-device settings of the tabbed « Réglages » (C7): what is kept on the device, the one-time return of
// the sub-grid to « Noires » (C3), « Rétablir les réglages d'origine », « Analyser dès l'import » and
// « S'appuyer sur les grilles connues des standards ».

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { setKnownChartsProvider } from '../analysis/knownCharts';
import { chordModelChoice, chordModelSetting, resetChordModelChoice, setChordModelChoice } from '../analysis/chordModel';
import { runAnalysis, startAutoAnalysis } from '../analysis/runner';
import { replaceEngine } from '../audio';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { defaultAppSettings, DEFAULT_SUBDIVISION, type AppSettings } from '../model/project';
import { fakeClock } from '../test/fakeClock';
import * as actions from './actions';
import { persistPreferences, resetPreferences, SUBDIVISION_VERSION } from './preferences';
import * as settings from './settingsActions';
import { appStore, createAppStore, initialState } from './store';

const KEY = 'fabtice.preferences.v1';
const memory: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(memory)) delete memory[k];
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory[k] ?? null,
      setItem: (k: string, v: string) => void (memory[k] = v),
      removeItem: (k: string) => void delete memory[k],
    },
  };
  resetChordModelChoice();
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  resetChordModelChoice();
});

const saved = () => JSON.parse(memory[KEY] ?? '{}') as Record<string, unknown>;

describe('defaults', () => {
  it('« Noires », launch on the last project, analysis at once, known charts on', () => {
    const s = initialState();
    expect(s.view.subdivision).toBe(1);
    expect(DEFAULT_SUBDIVISION).toBe(1);
    expect(s.view.triplets).toBe(false);
    expect(s.settings).toEqual(defaultAppSettings());
    expect(s.settings).toMatchObject({ atLaunch: 'lastProject', analyseOnImport: true, useKnownCharts: true, minorNotation: 'm' });
  });
});

describe('preferences kept on the device', () => {
  it('keeps and restores the new settings', () => {
    const store = createAppStore();
    persistPreferences(store);
    store.setState((s) => ({ settings: { ...s.settings, atLaunch: 'newProject', analyseOnImport: false, useKnownCharts: false } }));
    expect(saved()).toMatchObject({ atLaunch: 'newProject', analyseOnImport: false, useKnownCharts: false });
    const again = createAppStore();
    persistPreferences(again);
    expect(again.getState().settings).toMatchObject({ atLaunch: 'newProject', analyseOnImport: false, useKnownCharts: false });
  });

  it('ignores values it does not know', () => {
    memory[KEY] = JSON.stringify({ atLaunch: 'elsewhere', analyseOnImport: 'oui', useKnownCharts: 1, subdivision: 3, subdivisionVersion: SUBDIVISION_VERSION });
    const store = createAppStore();
    persistPreferences(store);
    expect(store.getState().settings).toMatchObject({ atLaunch: 'lastProject', analyseOnImport: true, useKnownCharts: true });
    expect(store.getState().view.subdivision).toBe(1);
  });

  it('survives a damaged record and missing storage', () => {
    memory[KEY] = '[1, 2';
    const store = createAppStore();
    expect(() => persistPreferences(store)).not.toThrow();
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistPreferences(createAppStore())).not.toThrow();
  });
});

describe('the sub-grid goes back to « Noires » once (C3)', () => {
  it('a sub-grid saved before the marker returns to the default, whatever it was, and the marker is written at once', () => {
    memory[KEY] = JSON.stringify({ subdivision: 4, triplets: true, snap: false });
    const store = createAppStore();
    persistPreferences(store);
    expect(store.getState().view).toMatchObject({ subdivision: 1, triplets: true, snap: false });
    expect(saved()).toMatchObject({ subdivision: 1, subdivisionVersion: SUBDIVISION_VERSION, triplets: true });
  });

  it('afterwards the choice is kept, « Blanches » included', () => {
    memory[KEY] = JSON.stringify({ subdivision: 4 });
    const first = createAppStore();
    persistPreferences(first);
    first.setState((s) => ({ view: { ...s.view, subdivision: 0.5 } }));
    expect(saved()).toMatchObject({ subdivision: 0.5, subdivisionVersion: SUBDIVISION_VERSION });
    const second = createAppStore();
    persistPreferences(second);
    expect(second.getState().view.subdivision).toBe(0.5);
    second.setState((s) => ({ view: { ...s.view, subdivision: 8 } }));
    const third = createAppStore();
    persistPreferences(third);
    expect(third.getState().view.subdivision).toBe(8);
  });

  it('a first launch has the marker too', () => {
    persistPreferences(createAppStore());
    expect(saved()).toMatchObject({ subdivision: 1, subdivisionVersion: SUBDIVISION_VERSION });
  });
});

describe('« Rétablir les réglages d\'origine »', () => {
  it('puts every preference of the device back to its default, chord model included, and keeps it so', () => {
    const store = createAppStore();
    persistPreferences(store);
    store.setState((s) => ({
      settings: { ...s.settings, minorNotation: '–', atLaunch: 'newProject', analyseOnImport: false, useKnownCharts: false, advanced: { separationModel: 'scnet', formants: true } },
      view: { ...s.view, follow: false, subdivision: 8, triplets: true, snap: false, pxPerSecond: 77, instrument: 'sib' },
    }));
    setChordModelChoice('fine');
    resetPreferences(store);
    const s = store.getState();
    expect(s.settings).toEqual(defaultAppSettings());
    expect(s.view).toMatchObject({ follow: true, subdivision: 1, triplets: false, snap: true });
    // What is not a preference of the device stays: the zoom, the instrument the chart is written for.
    expect(s.view).toMatchObject({ pxPerSecond: 77, instrument: 'sib' });
    // Back to « Automatique » (nothing stored), which is the standard model where no memory is known.
    expect(chordModelSetting()).toBe('auto');
    expect(chordModelChoice()).toBe('crema');
    expect(saved()).toMatchObject({ minorNotation: 'm', follow: true, subdivision: 1, triplets: false, snap: true, separationModel: 'auto', formants: false, atLaunch: 'lastProject', analyseOnImport: true, useKnownCharts: true });
    expect('fabtice.chordModel.v1' in memory).toBe(false);
  });

  it('leaves the open piece and its own settings alone', async () => {
    const engine = new MockEngine(fakeClock().clock);
    replaceEngine(engine);
    appStore.setState(initialState(), true);
    connectEngine(appStore, engine);
    await actions.openProject({
      title: 'Essai',
      source: { kind: 'file', fileName: 'essai.mp3' },
      tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * 4)], sampleRate: ENGINE_SAMPLE_RATE } }],
    });
    actions.stepSemitones(1);
    actions.setManualGrid({ bpm: 90 });
    const before = appStore.getState();
    settings.setAnalyseOnImport(false);
    settings.resetDeviceSettings();
    const after = appStore.getState();
    expect(after.settings.analyseOnImport).toBe(true);
    expect(after.project).toBe(before.project);
    expect(after.tracks).toBe(before.tracks);
    expect(after.tempoMap).toBe(before.tempoMap);
    expect(after.playback).toEqual(before.playback);
  });
});

describe('the actions of the small settings', () => {
  it('each changes its own setting only', () => {
    appStore.setState(initialState(), true);
    settings.setAtLaunch('newProject');
    settings.setAnalyseOnImport(false);
    settings.setUseKnownCharts(false);
    expect(appStore.getState().settings).toEqual({ ...defaultAppSettings(), atLaunch: 'newProject', analyseOnImport: false, useKnownCharts: false });
  });
});

describe('the analysis follows « Analyser dès l\'import » and « S\'appuyer sur les grilles connues »', () => {
  async function openPiece(over: Partial<AppSettings> = {}) {
    appStore.setState({ ...initialState(), settings: { ...defaultAppSettings(), ...over } }, true);
    const engine = new MockEngine(fakeClock().clock);
    replaceEngine(engine);
    connectEngine(appStore, engine);
    await actions.openProject({
      title: 'Autumn Leaves',
      source: { kind: 'file', fileName: 'x.mp3' },
      tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(ENGINE_SAMPLE_RATE * 10)], sampleRate: ENGINE_SAMPLE_RATE } }],
    });
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('on (the default): a new piece is analysed by itself', async () => {
    replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
    const stop = startAutoAnalysis(true);
    await openPiece();
    await wait(80);
    stop();
    expect(appStore.getState().analysis).not.toBeNull();
  });

  it('off: a new piece waits; « Analyser ce morceau » (runAnalysis) still works; switching on again analyses the open piece', async () => {
    replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
    const stop = startAutoAnalysis(true);
    await openPiece({ analyseOnImport: false });
    await wait(80);
    expect(appStore.getState().analysis).toBeNull();
    expect(appStore.getState().analysisRun.status).toBe('idle');
    await runAnalysis();
    expect(appStore.getState().analysis).not.toBeNull();

    // another piece, still waiting, then the setting is switched on
    await openPiece({ analyseOnImport: false });
    await wait(40);
    expect(appStore.getState().analysis).toBeNull();
    settings.setAnalyseOnImport(true);
    await wait(80);
    stop();
    expect(appStore.getState().analysis).not.toBeNull();
  });

  it('the known charts are looked up only when the setting is on', async () => {
    const provider = vi.fn(() => null);
    setKnownChartsProvider(provider);
    replaceAnalyzer(new MockAnalyzer({ durationMs: 0, downloadMs: 0 }));
    await openPiece();
    settings.setUseKnownCharts(false);
    await runAnalysis();
    expect(provider).not.toHaveBeenCalled();
    settings.setUseKnownCharts(true);
    await runAnalysis();
    expect(provider).toHaveBeenCalledWith('Autumn Leaves');
    setKnownChartsProvider(null);
  });
});
