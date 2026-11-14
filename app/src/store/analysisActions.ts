// Applying an analysis result, and the analysis status shown by the
// interface. The analysis itself is run by `analysis/runner.ts`.

import { tempoMapFromBeats } from '../grid/beats';
import type { AnalysisResult } from '../model/analysis';
import { emptyCorrections } from '../model/corrections';
import { appStore, type AnalysisRun, type AppState } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

export interface ApplyAnalysisOptions {
  /**
   * The user asked to start again from this analysis: the grid, key, tuning
   * and chord corrections are dropped. Section letters are always kept.
   * Without it (the default) nothing done by hand is touched.
   */
  replaceCorrections?: boolean;
}

/**
 * Stores a finished analysis for the open piece.
 *   - The grid: the analysed beats become the grid in force, unless the user
 *     made one (`manual` from the panel, or `corrected`), which stays.
 *   - Key, tuning, chords: the result is kept apart; corrections hide it
 *     where they apply (`store/chartSelectors.ts`).
 */
export function applyAnalysis(result: AnalysisResult, opts: ApplyAnalysisOptions = {}): void {
  const s = get();
  if (!s.project) return;
  const userGrid = s.tempoMap.origin === 'manual' || s.tempoMap.origin === 'corrected';
  let tempoMap = s.tempoMap;
  if (opts.replaceCorrections || !userGrid) {
    try {
      tempoMap = tempoMapFromBeats(result.beats.times, result.beats.downbeat, result.beats.meter, 'analysis');
    } catch {
      // An unusable grid in the result: the grid in force stays.
    }
  }
  const corrections = opts.replaceCorrections ? { ...emptyCorrections(), sections: s.corrections.sections } : s.corrections;
  set({ analysis: result, tempoMap, corrections, analysisRun: { status: 'idle' } });
}

export function setAnalysisRun(analysisRun: AnalysisRun): void {
  set({ analysisRun });
}
