// « Correction de la courbe en tapant le tempo » (C12): the contract between
// the tap algorithm and the screen that listens to the taps.
//
// The screen (`components/TapFixDialog.tsx`) calls, in this order:
//   1. `tapNow()` at each tap (space bar, touch) while the passage plays;
//   2. `previewTappedFix(bar, taps)` on « Ok, j'ai fini »: the grid from the
//      chosen bar to the last tap, computed from the taps; nothing is stored;
//   3. `showTappedPreview(preview)` so that « Vérifier en écoutant » plays the
//      passage on the candidate grid (ruler, chart and click follow it);
//   4. `discardTappedPreview()` on « Ce n'est pas bon, réessayer » or when the
//      window is closed: the grid in force comes back, untouched;
//      or `commitTappedFix(preview)` on « C'est bon, c'est corrigé »: the
//      rest of the piece after the last tap is analysed again and the whole
//      becomes one manual tempo action (`TappedTempoFix`), one undo step.
//
// Every time is SOURCE time in seconds (a position in the recording), so the
// taps mean the same thing at any playback tempo.

import { getEngine } from '../audio';
import { MIN_BEAT_GAP, beatGridOf, tempoMapFromBeats } from '../grid/beats';
import { withMetersOf } from '../grid/meters';
import { barStartTime } from '../grid/tempoMap';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { applyTempoFix } from '../store/tempoFixActions';
import { appStore } from '../store/store';

/** Why a passage could not be computed from the taps (shown as `tapFix.refused.<code>`). */
export type TapFixRefusal = 'tooFewTaps' | 'notABar' | 'noAnalysis' | 'failed';

export interface TappedPreview {
  /** Bar index (grid in force when the taps were made) where the passage starts. */
  bar: number;
  /** Source time of that bar's start. */
  from: Seconds;
  /** Source time of the last beat placed from the taps. */
  end: Seconds;
  /** The taps as heard (see `TappedTempoFix.taps`). */
  taps: Seconds[];
  /** The grid in force before. */
  previous: TempoMap;
  /** The candidate grid: `previous` before `from`, the taps' beats up to `end`, a provisional continuation after. */
  tempoMap: TempoMap;
}

/** Fewest taps a passage can be computed from. */
export const MIN_TAPS = 3;

/** The source position heard right now: what a tap means. */
export function tapNow(): Seconds {
  return getEngine().getPosition();
}

let shown: TappedPreview | null = null;

/** Computes the candidate grid of the passage from the taps. Stores nothing. */
export async function previewTappedFix(bar: number, taps: readonly Seconds[]): Promise<TappedPreview | { refused: TapFixRefusal }> {
  const s = appStore.getState();
  if (!s.project) return { refused: 'failed' };
  const from = barStartTime(s.tempoMap, bar);
  const grid = beatGridOf(s.tempoMap, s.project.duration);
  const heard = [...taps].sort((a, b) => a - b).filter((t) => t > from + MIN_BEAT_GAP);
  if (heard.length < MIN_TAPS) return { refused: 'tooFewTaps' };
  // Placeholder: a beat on each tap. The real computation replaces this body.
  const end = heard[heard.length - 1]!;
  const times = [...grid.times.filter((t) => t < from - 1e-3), from];
  for (const t of heard) if (t - times[times.length - 1]! >= MIN_BEAT_GAP) times.push(t);
  const step = times[times.length - 1]! - times[times.length - 2]!;
  for (let t = end + step; t < s.project.duration; t += step) times.push(t);
  try {
    const tempoMap = withMetersOf(tempoMapFromBeats(times, grid.downbeat, grid.meter, 'corrected'), s.tempoMap);
    return { bar, from, end, taps: [...taps], previous: s.tempoMap, tempoMap };
  } catch {
    return { refused: 'failed' };
  }
}

/** Puts the candidate grid in force for listening; not an undo step, not saved as a correction. */
export function showTappedPreview(preview: TappedPreview): void {
  shown = preview;
  appStore.setState({ tempoMap: preview.tempoMap });
}

/** Gives the grid in force back, as it was before `showTappedPreview`. */
export function discardTappedPreview(): void {
  if (!shown) return;
  appStore.setState({ tempoMap: shown.previous });
  shown = null;
}

/** Keeps the correction: the rest of the piece is analysed again after `end`; one undo step. */
export async function commitTappedFix(preview: TappedPreview): Promise<void> {
  discardTappedPreview();
  const s = appStore.getState();
  if (!s.analysis) return;
  // Placeholder: the candidate grid as it is. The real computation analyses the rest again.
  const grid = beatGridOf(preview.tempoMap, s.project?.duration ?? 0);
  applyTempoFix({ ...s.analysis, beats: { ...s.analysis.beats, times: grid.times, downbeat: grid.downbeat } }, { kind: 'tapped', time: preview.from, previous: preview.previous, taps: preview.taps, end: preview.end });
}
