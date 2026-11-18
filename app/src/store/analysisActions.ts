// Applying an analysis result, and the analysis status shown by the
// interface. The analysis itself is run by `analysis/runner.ts`.

import { tempoMapFromBeats } from '../grid/beats';
import { withMetersOf } from '../grid/meters';
import type { AnalysisResult } from '../model/analysis';
import { emptyCorrections } from '../model/corrections';
import { transact } from './history';
import { appStore, type AnalysisRun, type AppState } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

export interface ApplyAnalysisOptions {
  /**
   * The user asked to start again from this analysis: the grid, key, tuning
   * and chord corrections are dropped. Section letters, the structure and the
   * modulations corrected by hand are always kept (stage 5: each has its own
   * « Revenir à l'analyse »).
   * Without it (the default) nothing done by hand is touched.
   */
  replaceCorrections?: boolean;
  /**
   * The request asked for the user's grid to be kept: the result's beats are
   * that grid, not analysed ones. The analysed beats of the earlier result are
   * kept instead, so « Revenir à l'analyse » still goes back to them.
   */
  keptGrid?: boolean;
  /**
   * « Analyser de nouveau » with « Garder mes corrections » unticked (1.0.1): everything done
   * by hand is dropped, sections, structure and modulations included, as one undoable step.
   */
  fresh?: boolean;
}

/**
 * Stores a finished analysis for the open piece.
 *   - The grid: the analysed beats become the grid in force, unless the user
 *     made one (`manual` from the panel, or `corrected`), which stays. Hand
 *     signatures (C13) make the grid `corrected` or `manual`, so they stay
 *     with it; should a grid in force still carry signature changes, they are
 *     placed on the analysed grid by time (`grid/meters.ts#withMetersOf`).
 *     `replaceCorrections` drops them with the other grid corrections.
 *   - Key, tuning, chords: the result is kept apart; corrections hide it
 *     where they apply (`store/chartSelectors.ts`).
 */
export function applyAnalysis(result: AnalysisResult, opts: ApplyAnalysisOptions = {}): void {
  const s = get();
  if (!s.project) return;
  const userGrid = s.tempoMap.origin === 'manual' || s.tempoMap.origin === 'corrected';
  let tempoMap = s.tempoMap;
  const replace = opts.replaceCorrections || opts.fresh;
  if (replace || !userGrid) {
    try {
      const analysed = tempoMapFromBeats(result.beats.times, result.beats.downbeat, result.beats.meter, 'analysis');
      tempoMap = replace ? analysed : withMetersOf(analysed, s.tempoMap);
    } catch {
      // An unusable grid in the result: the grid in force stays.
    }
  }
  const corrections = opts.fresh
    ? emptyCorrections()
    : opts.replaceCorrections
    ? { ...emptyCorrections(), sections: s.corrections.sections, structure: s.corrections.structure, keyChanges: s.corrections.keyChanges }
    : s.corrections;
  const analysis = opts.keptGrid && s.analysis ? { ...result, beats: s.analysis.beats } : result;
  const patch = { analysis, tempoMap, corrections, analysisRun: { status: 'idle' } as const };
  if (opts.fresh) transact('history.what.fresh', () => set(patch));
  else set(patch);
}

export function setAnalysisRun(analysisRun: AnalysisRun): void {
  set({ analysisRun });
}
