// Runs the analysis of the open piece and keeps the store informed.
//
//   - Automatic start: once a piece is open and playable (engine `ready`) and
//     has no analysis yet, it is analysed in the background, once per piece
//     (an import, or a kept piece reopened before its analysis had finished).
//     A failure is not retried by itself; « Analyser de nouveau » does.
//   - On demand: `runAnalysis()` (the grid panel's « Analyser de nouveau »).
//     The user's grid and key, if any, are passed as hints so the chords are
//     decoded on them; nothing done by hand is overwritten
//     (`store/analysisActions.ts#applyAnalysis`).
//   - A new piece cancels the analysis of the previous one.
//
// The status (`AppState.analysisRun`) is what the interface shows; the
// result goes to `AppState.analysis`.

import { pcmToChannels, pcmToMonoInSlices } from '../audio/pcm';
import { getAudio } from '../audio/registry';
import { beatGridOf } from '../grid/beats';
import { barStartTime } from '../grid/tempoMap';
import type { TempoMap } from '../model/tempoMap';
import { applyAnalysis, setAnalysisRun } from '../store/analysisActions';
import { applyTempoFix } from '../store/tempoFixActions';
import type { ManualTempoFix } from './engine/tapGrid';
import type { TempoFixKind } from './engine/tempoFix';
import { appStore, gridInForce, type AppState } from '../store/store';
import type { AnalysisResult } from '../model/analysis';
import type { Seconds } from '../model/project';
import { currentLoadShare } from '../settings/easeLoadShare';
import { chordModelChoice } from './chordModel';
import { autoAnalysisDisabled, getAnalyzer } from './index';
import { knownChartsFor } from './knownCharts';
import { analysisProgressStore, setAnalysisProgress } from './progress';
import { AnalysisError, resultChordModel, type AnalysisProgress, type AnalysisRequest, type GridHint } from './types';

let running: { projectId: string; abort: AbortController } | null = null;

/** The audio the analysis listens to: the original piece (before any separation), shown or set aside. */
function sourceTrack(s: AppState) {
  return [...s.tracks, ...s.separation.aside].find((tr) => tr.audio.origin === 'original') ?? s.tracks[0] ?? null;
}

/** Stops the analysis in progress, if any (its result, if it still comes, is dropped). */
export function cancelAnalysis(): void {
  if (!running) return;
  running.abort.abort();
  running = null;
  const s = appStore.getState();
  if (s.analysisRun.status === 'running') setAnalysisRun({ status: 'idle' });
}

export function isAnalysing(): boolean {
  return running !== null;
}

/**
 * Analyses the open piece. Resolves when done, failed or cancelled (never
 * rejects): the outcome is in the store.
 */
export function runAnalysis(): Promise<void> {
  return launch(null).then(() => undefined);
}

/**
 * A manual tempo action of the bar menu (« Corriger un changement de tempo
 * indésirable »: `continuity`, « Réanalyser le tempo à partir de cette
 * mesure »: `fresh`) from bar `bar` (index of the grid in force). It runs on
 * the networks' outputs kept for this audio (a fraction of a second); when
 * they are gone (the piece was reopened), the networks run once again, with
 * the usual progress. Everything before the bar stays as it is; the result is
 * a correction of the grid by hand (`store/tempoFixActions.ts`).
 */
export function runTempoFix(kind: TempoFixKind, bar: number): Promise<void> {
  const s = appStore.getState();
  if (!s.project || !s.analysis) return Promise.resolve();
  const map = gridInForce(s);
  const from = barStartTime(map, bar);
  if (!(from >= 0 && from < s.project.duration)) return Promise.resolve();
  const grid = gridForFix(map, s.project.duration, from);
  const anchored = grid.times.length > beatGridOf(map, s.project.duration).times.length;
  return launch({ kind, from, grid, bar, previous: map, ...(anchored ? { anchored } : {}) }).then(() => undefined);
}

/**
 * The grid in force as the analysis takes it for a manual tempo action from the bar starting at
 * `from`: its beats, and the bar's start among them. After a bar with an odd number of eighths
 * (7/8, 7/16) the bars start between two beats of the grid; the bar's start is then added as a
 * beat, so that the action can start there (the store splices the map at it:
 * `store/tempoFixActions.ts#tempoMapForFix`).
 */
export function gridForFix(map: TempoMap, duration: Seconds, from: Seconds): GridHint {
  const grid = beatGridOf(map, duration);
  if (grid.times.some((t) => Math.abs(t - from) < 1e-3)) return grid;
  const at = grid.times.findIndex((t) => t > from);
  const i = at < 0 ? grid.times.length : at;
  const times = [...grid.times.slice(0, i), from, ...grid.times.slice(i)];
  return { times, downbeat: grid.downbeat >= i ? grid.downbeat + 1 : grid.downbeat, meter: grid.meter };
}

/**
 * The tapped correction (C12, `analysis/tapFix.ts`): the grid from bar `bar` computed from the
 * taps and the rest of the piece analysed again, decoded with its chords, like the two other
 * actions; but the result is given back instead of stored (the screen lets the user listen to it
 * first). Null when there is nothing to compute on, or the computation failed or was given up.
 */
export async function runTappedFix(bar: number, taps: readonly Seconds[]): Promise<{ result: AnalysisResult; from: Seconds; previous: TempoMap } | null> {
  const s = appStore.getState();
  if (!s.project || !s.analysis) return null;
  const map = gridInForce(s);
  const from = barStartTime(map, bar);
  if (!(from >= 0 && from < s.project.duration)) return null;
  const result = await launch({ kind: 'tapped', from, grid: gridForFix(map, s.project.duration, from), taps: [...taps], bar, previous: map, preview: true });
  return result ? { result, from, previous: map } : null;
}

type TempoFixRun = ManualTempoFix & {
  bar: number;
  previous: TempoMap;
  /** Give the result back instead of storing it (the tapped correction, before « C'est bon »). */
  preview?: boolean;
};

async function launch(fix: TempoFixRun | null): Promise<AnalysisResult | null> {
  const store = appStore;
  const s = store.getState();
  const project = s.project;
  const track = sourceTrack(s);
  const audio = track ? getAudio(track.audio.id) : undefined;
  if (!project || !track || !audio) return null;
  cancelAnalysis();
  const abort = new AbortController();
  const mine = { projectId: project.id, abort };
  running = mine;
  const stillMine = () => running === mine && store.getState().project?.id === project.id;

  setAnalysisProgress({ fraction: 0, download: null, chordWindow: null, fallback: null });
  const tempoBar = fix ? fix.bar : undefined;
  setAnalysisRun({ status: 'running', projectId: project.id, step: 'prepare', tempoBar });
  let step: AnalysisProgress['step'] = 'prepare';
  const onProgress = (p: AnalysisProgress) => {
    if (!stillMine()) return;
    // The app store hears of step changes only; the fine progress has its own store.
    if (p.step !== step) {
      step = p.step;
      setAnalysisRun({ status: 'running', projectId: project.id, step, tempoBar });
    }
    const prev = analysisProgressStore.getState();
    const fraction = Math.min(1, Math.max(Math.max(0, p.fraction), prev.fraction));
    const windowChanged = (p.chordWindow?.done ?? -1) !== (prev.chordWindow?.done ?? -1) || Math.abs((p.chordWindow?.fraction ?? 0) - (prev.chordWindow?.fraction ?? 0)) >= 0.005;
    if (fraction - prev.fraction >= 0.002 || (p.download?.loaded ?? 0) !== (prev.download?.loaded ?? 0) || windowChanged) {
      setAnalysisProgress({ fraction, download: p.download ?? null, chordWindow: p.chordWindow ?? null });
    }
  };

  const userGrid = s.tempoMap.origin === 'manual' || s.tempoMap.origin === 'corrected';
  // CREMA listens in mono ((l + r) / 2, its own mix): one transient Float32 copy, made from the
  // registry's 16-bit samples a slice at a time, let go once the analyser has it. The fine chord
  // model (Réglages avancés) listens in stereo: both channels then.
  const chordModel = chordModelChoice();
  const channels = chordModel === 'fine' ? pcmToChannels(audio) : [await pcmToMonoInSlices(audio)];
  if (!stillMine()) {
    if (running === mine) running = null;
    return null;
  }
  // « S'appuyer sur les grilles connues des standards » (Réglages → Détection des accords): off, the title is not looked up.
  const knownCharts = s.settings.useKnownCharts ? await knownChartsFor(project.title) : null;
  if (!stillMine()) {
    if (running === mine) running = null;
    return null;
  }
  const request: AnalysisRequest = {
    channels,
    chordModel,
    sampleRate: audio.sampleRate,
    audioId: track.audio.id,
    grid: fix ? fix.grid : userGrid ? beatGridOf(s.tempoMap, project.duration) : null,
    // A tempo action keeps the key in force, so that the chords from its bar are read in the same key.
    key: fix ? (s.corrections.key ?? (s.analysis?.key ? { tonic: s.analysis.key.tonic, mode: s.analysis.key.mode } : null)) : s.corrections.key,
    knownCharts,
    // « Alléger le travail pour l'appareil »: read now, for the whole analysis (a change applies to the next one).
    loadShare: currentLoadShare(),
    onProgress,
    signal: abort.signal,
    tempoFix: fix ? (fix.kind === 'tapped' ? { kind: 'tapped', from: fix.from, grid: fix.grid, taps: fix.taps } : { kind: fix.kind, from: fix.from, grid: fix.grid, ...(fix.anchored ? { anchored: true } : {}) }) : null,
  };
  try {
    const result = await getAnalyzer().analyse(request);
    if (!stillMine()) return null;
    setAnalysisProgress({ chordWindow: null, fallback: resultChordModel(result).fallback ?? null });
    if (fix?.preview) setAnalysisRun({ status: 'idle' });
    else if (fix && fix.kind !== 'tapped') applyTempoFix(result, { time: fix.from, kind: fix.kind, previous: fix.previous });
    else if (!fix) applyAnalysis(result, { keptGrid: userGrid });
    return result;
  } catch (e) {
    if (!stillMine()) return null;
    const code = e instanceof AnalysisError ? e.code : 'failed';
    // The tapped correction says its failure in its own window.
    setAnalysisRun(code === 'cancelled' || fix?.preview ? { status: 'idle' } : { status: 'error', projectId: project.id, code });
    return null;
  } finally {
    if (running === mine) running = null;
  }
}

/**
 * Starts the automatic analysis: each newly opened piece without an analysis
 * is analysed once it can play, unless « Analyser dès l'import » is off (and
 * if it is switched on later, the open piece is then analysed). Returns the
 * unsubscribe function.
 */
export function startAutoAnalysis(enabled = !autoAnalysisDisabled()): () => void {
  const store = appStore;
  let triedFor: string | null = null;
  let previousProject: string | null = store.getState().project?.id ?? null;
  const check = (s: AppState) => {
    const id = s.project?.id ?? null;
    if (id !== previousProject) {
      previousProject = id;
      if (running && running.projectId !== id) cancelAnalysis();
    }
    // « Analyser dès l'import » (Réglages → Tempo et analyse): off, the piece waits for « Analyser ce morceau ».
    if (!enabled || !s.settings.analyseOnImport || !id || s.analysis || triedFor === id) return;
    if (s.transport.engine !== 'ready' && s.transport.engine !== 'playing') return;
    if (s.analysisRun.status !== 'idle') return;
    triedFor = id;
    void runAnalysis();
  };
  check(store.getState());
  return store.subscribe(check);
}
