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

import { getAudio } from '../audio/registry';
import { beatGridOf } from '../grid/beats';
import { applyAnalysis, setAnalysisRun } from '../store/analysisActions';
import { appStore, type AppState } from '../store/store';
import { autoAnalysisDisabled, getAnalyzer } from './index';
import { AnalysisError, type AnalysisProgress, type AnalysisRequest } from './types';

let running: { projectId: string; abort: AbortController } | null = null;

/** The audio the analysis listens to: the original piece (before any separation). */
function sourceTrack(s: AppState) {
  return s.tracks.find((tr) => tr.audio.origin === 'original') ?? s.tracks[0] ?? null;
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
export async function runAnalysis(): Promise<void> {
  const store = appStore;
  const s = store.getState();
  const project = s.project;
  const track = sourceTrack(s);
  const audio = track ? getAudio(track.audio.id) : undefined;
  if (!project || !track || !audio) return;
  cancelAnalysis();
  const abort = new AbortController();
  const mine = { projectId: project.id, abort };
  running = mine;
  const stillMine = () => running === mine && store.getState().project?.id === project.id;

  setAnalysisRun({ status: 'running', projectId: project.id, step: 'prepare', fraction: 0, download: null });
  let last: AnalysisProgress | null = null;
  const onProgress = (p: AnalysisProgress) => {
    if (!stillMine()) return;
    // Only meaningful changes reach the store (the interface redraws on them).
    if (last && last.step === p.step && Math.abs(p.fraction - last.fraction) < 0.005 && (p.download?.loaded ?? 0) - (last.download?.loaded ?? 0) < 256 * 1024) return;
    last = p;
    setAnalysisRun({ status: 'running', projectId: project.id, step: p.step, fraction: Math.min(1, Math.max(0, p.fraction)), download: p.download ?? null });
  };

  const userGrid = s.tempoMap.origin === 'manual' || s.tempoMap.origin === 'corrected';
  const request: AnalysisRequest = {
    channels: audio.channels,
    sampleRate: audio.sampleRate,
    audioId: track.audio.id,
    grid: userGrid ? beatGridOf(s.tempoMap, project.duration) : null,
    key: s.corrections.key,
    onProgress,
    signal: abort.signal,
  };
  try {
    const result = await getAnalyzer().analyse(request);
    if (stillMine()) applyAnalysis(result);
  } catch (e) {
    if (!stillMine()) return;
    const code = e instanceof AnalysisError ? e.code : 'failed';
    setAnalysisRun(code === 'cancelled' ? { status: 'idle' } : { status: 'error', projectId: project.id, code });
  } finally {
    if (running === mine) running = null;
  }
}

/**
 * Starts the automatic analysis: each newly opened piece without an analysis
 * is analysed once it can play. Returns the unsubscribe function.
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
    if (!enabled || !id || s.analysis || triedFor === id) return;
    if (s.transport.engine !== 'ready' && s.transport.engine !== 'playing') return;
    if (s.analysisRun.status !== 'idle') return;
    triedFor = id;
    void runAnalysis();
  };
  check(store.getState());
  return store.subscribe(check);
}
