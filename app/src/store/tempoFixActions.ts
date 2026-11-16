// The manual tempo actions of the bar menu, on the store side: applying one
// (`analysis/runner.ts#runTempoFix` computes it), undoing one.
//
// What an action changes:
//   - the grid: from the chosen bar on, the new beats; before it, nothing
//     (beat for beat). It is a correction by hand (origin `corrected`): a new
//     analysis keeps it, « Revenir à l'analyse » in the panel drops it with the
//     other grid corrections;
//   - the analysed chords from the chosen bar on, decoded on the new grid;
//     those before it stay as they were. The analysed beats, the analysed
//     key, modulations and structure stay as they were (they are what
//     « Revenir à l'analyse » goes back to);
//   - `corrections.tempoFixes`: where it starts and the grid just before it.
// What it never changes: what was done by hand. Hand chords, rewritten
// stretches, section letters, loops and named loops are kept in source time
// (seconds in the recording): they stay with the same music, and the chart and
// the ruler place them on the nearest beat or bar line of the new grid.

import { tempoMapFromBeats } from '../grid/beats';
import type { AnalysisResult } from '../model/analysis';
import type { TempoFix } from '../model/corrections';
import { appStore } from './store';

const EPS = 1e-6;

/** Stores the result of a manual tempo action (see above). */
export function applyTempoFix(result: AnalysisResult, fix: TempoFix): void {
  const s = appStore.getState();
  if (!s.project) return;
  let tempoMap;
  try {
    tempoMap = tempoMapFromBeats(result.beats.times, result.beats.downbeat, result.beats.meter, 'corrected');
  } catch {
    appStore.setState({ analysisRun: { status: 'idle' } });
    return;
  }
  const old = s.analysis;
  const analysis: AnalysisResult = old
    ? {
        ...result,
        beats: old.beats,
        key: old.key,
        keyChanges: old.keyChanges,
        tuning: old.tuning,
        structure: old.structure,
        chords: [...old.chords.filter((c) => c.time < fix.time - EPS), ...result.chords.filter((c) => c.time >= fix.time - EPS)],
      }
    : result;
  // A new action at the same bar replaces the one there (its « previous » grid is the one to go back to).
  const before = s.corrections.tempoFixes;
  const same = before.findIndex((f) => Math.abs(f.time - fix.time) < 1e-3);
  const tempoFixes = same >= 0 ? [...before.slice(0, same), { ...fix, previous: before[same]!.previous }, ...before.slice(same + 1)] : [...before, fix];
  appStore.setState({ tempoMap, analysis, corrections: { ...s.corrections, tempoFixes }, analysisRun: { status: 'idle' } });
}

/** The manual tempo action that starts at this bar start (source time), if any. */
export function tempoFixAt(fixes: readonly TempoFix[], time: number): TempoFix | null {
  return fixes.find((f) => Math.abs(f.time - time) < 1e-3) ?? null;
}

/**
 * « Revenir à l'analyse » on the bar of a manual tempo action: the grid goes
 * back to what it was just before it, and the actions made after it (computed
 * on its grid) go too.
 */
export function undoTempoFix(time: number): void {
  const s = appStore.getState();
  const i = s.corrections.tempoFixes.findIndex((f) => Math.abs(f.time - time) < 1e-3);
  if (i < 0) return;
  const fix = s.corrections.tempoFixes[i]!;
  appStore.setState({ tempoMap: fix.previous, corrections: { ...s.corrections, tempoFixes: s.corrections.tempoFixes.slice(0, i) } });
}

/** Undoes the last manual tempo action (« Annuler »). */
export function undoLastTempoFix(): void {
  const fixes = appStore.getState().corrections.tempoFixes;
  const last = fixes[fixes.length - 1];
  if (last) undoTempoFix(last.time);
}
