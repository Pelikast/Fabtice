// « Correction de la courbe en tapant le tempo » (C12): the contract between
// the tap algorithm and the screen that listens to the taps.
//
// The screen (`components/TapFixDialog.tsx`) calls, in this order:
//   1. `tapNow()` at each tap (space bar, touch) while the passage plays;
//   2. `previewTappedFix(bar, taps)` on « Ok, j'ai fini »: the grid from the
//      chosen bar to the last tap, computed from the taps, and the rest of the
//      piece analysed again after it; nothing is stored;
//   3. `showTappedPreview(preview)` so that « Vérifier en écoutant » plays the
//      passage on the candidate grid (ruler, chart and click follow it);
//   4. `discardTappedPreview()` on « Ce n'est pas bon, réessayer » or when the
//      window is closed: the grid in force comes back, untouched;
//      or `commitTappedFix(preview)` on « C'est bon, c'est corrigé »: the
//      whole becomes one manual tempo action (`TappedTempoFix`), one undo step.
//
// Every time is SOURCE time in seconds (a position in the recording), so the
// taps mean the same thing at any playback tempo.
//
// The computation (`analysis/engine/tapGrid.ts`) runs in the analysis worker
// on the network outputs kept for the piece, as the two other manual actions
// do (`analysis/runner.ts#runTappedFix`); when they are gone (the piece was
// reopened), the networks run once again, with the usual progress
// (`AppState.analysisRun`, step by step, `tempoBar` set). The result of the
// rest of the piece is already in the preview: « C'est bon » stores it as it
// was heard, without a second computation.
//
// While a preview is shown, the candidate grid is `AppState.tempoMap` (what
// every view, the click and the chart read) and `AppState.tempoPreview` says
// which grid it stands in for. The undo history, the autosave and « Enregistrer »
// read the grid through `store/store.ts#gridInForce`: they never see the
// candidate. So listening to it records no undo step and marks nothing as
// modified; a piece saved or kept on the device during the preview holds the
// grid in force; if the app is closed during the preview, the piece comes back
// with the grid in force (the taps are lost, the user taps again). An undo, or
// anything else that replaces the grid during the preview, ends it (the grid
// then shown is the one put back).

import { getEngine } from '../audio';
import { MIN_BEAT_GAP } from '../grid/beats';
import { barStartTime, bpmAt } from '../grid/tempoMap';
import type { AnalysisResult } from '../model/analysis';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { applyTempoFix, tempoMapForFix } from '../store/tempoFixActions';
import { appStore, gridInForce } from '../store/store';
import { runTappedFix } from './runner';
import type { ListenedResult } from './types';

/**
 * Why a passage could not be computed from the taps (shown as `tapFix.refused.<code>`):
 *   - `tooFewTaps`: fewer than `MIN_TAPS` taps from the chosen bar on;
 *   - `notABar`: the bar is not in the piece;
 *   - `noAnalysis`: the piece has not been analysed (nothing to correct);
 *   - `irregular`: the taps say too little to place beats (their spread is beyond about a third of
 *     a beat, or most of them do not fall on a beat);
 *   - `failed`: the computation failed or was given up (another analysis started, the piece changed).
 */
export type TapFixRefusal = 'tooFewTaps' | 'notABar' | 'noAnalysis' | 'irregular' | 'failed';

/** What the computation found out about the taps (the screen may say some of it). */
export interface TapsReading {
  /** The user's usual advance (negative) or delay (positive) on the beats, compensated (s). */
  offset: Seconds;
  /** How far the taps wander around it (s, robust spread). */
  spread: Seconds;
  /** Taps left out (doubled or stray), forgotten taps filled, held beats (fermatas) read. */
  dropped: number;
  filled: number;
  held: number;
  /** Beats of the grid per tap: 1, or 2 / 3 when the user tapped every other or every third beat. */
  level: number;
  /** Beats placed from the chosen bar's start to `end`, both included. */
  beats: number;
  /** Share of those beats put on a beat the analysis heard (0…1). */
  snapped: number;
}

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
  /** The candidate grid: `previous` before `from`, the taps' beats up to `end`, the rest of the piece analysed again after. */
  tempoMap: TempoMap;
  /** What was found about the taps. */
  reading: TapsReading;
  /** The analysis on the candidate grid (the chords from `from` on), stored as it is by `commitTappedFix`. */
  result: AnalysisResult;
}

/** Fewest taps a passage can be computed from. */
export const MIN_TAPS = 3;

/** Longest a tap event may have waited before it was handled (beyond, its time stamp is not trusted). */
const MAX_EVENT_DELAY = 0.25;

/**
 * The source position heard right now: what a tap means. The engine's position is the sound
 * leaving the app; the device's output latency is taken off (in source seconds: times the
 * playback speed). `at` is the event's time stamp (`event.timeStamp`, the clock of
 * `performance.now()`), when the screen has it: the time the event waited before being handled
 * is taken off too.
 */
export function tapNow(at?: number): Seconds {
  const engine = getEngine();
  const position = engine.getPosition();
  const rate = appStore.getState().playback.tempoRatio;
  let late = engine.getOutputLatency?.() ?? 0;
  if (at !== undefined && Number.isFinite(at) && typeof performance !== 'undefined') late += Math.min(MAX_EVENT_DELAY, Math.max(0, (performance.now() - at) / 1000));
  return Math.max(0, position - late * (rate > 0 ? rate : 1));
}

/** Computes the candidate grid of the passage from the taps, and the rest of the piece after it. Stores nothing. */
export async function previewTappedFix(bar: number, taps: readonly Seconds[]): Promise<TappedPreview | { refused: TapFixRefusal }> {
  const s = appStore.getState();
  if (!s.project) return { refused: 'failed' };
  if (!s.analysis) return { refused: 'noAnalysis' };
  const map = gridInForce(s);
  if (!Number.isInteger(bar)) return { refused: 'notABar' };
  const from = barStartTime(map, bar);
  const duration = s.project.duration;
  if (!(from >= 0 && from < duration)) return { refused: 'notABar' };
  const beat = 60 / bpmAt(map, from);
  const heard = taps.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  // Taps from about the bar's start on make the passage; those of the two bars before (along the count-in) say the user's usual advance.
  const passage = heard.filter((t) => t >= from - 0.5 * beat && t <= duration);
  if (passage.length < MIN_TAPS || passage[passage.length - 1]! - from < 2 * MIN_BEAT_GAP) return { refused: 'tooFewTaps' };
  const barBeats = Math.max(2, map.meters[0]!.meter.numerator);
  const kept = heard.filter((t) => t >= from - 2 * barBeats * beat && t <= duration);
  const project = s.project.id;
  const run = await runTappedFix(bar, kept);
  const now = appStore.getState();
  if (!run || now.project?.id !== project || gridInForce(now) !== map) return { refused: 'failed' };
  const { tapped: info, ...result } = run.result as ListenedResult;
  if (!info) return { refused: 'failed' };
  if (info.irregular) return { refused: 'irregular' };
  let tempoMap: TempoMap;
  try {
    tempoMap = tempoMapForFix(now, result.beats, from);
  } catch {
    return { refused: 'failed' };
  }
  return {
    bar,
    from,
    end: info.end,
    taps: kept,
    previous: map,
    tempoMap,
    reading: { offset: info.offset, spread: info.jitter, dropped: info.dropped, filled: info.filled, held: info.held, level: info.level, beats: info.beats, snapped: info.snapped },
    result,
  };
}

/** Puts the candidate grid in force for listening; not an undo step, not saved, not a correction (see the header). */
export function showTappedPreview(preview: TappedPreview): void {
  const s = appStore.getState();
  // A preview computed on another grid (the grid changed meanwhile) is not shown.
  if (!s.project || gridInForce(s) !== preview.previous) return;
  appStore.setState({ tempoMap: preview.tempoMap, tempoPreview: { shown: preview.tempoMap, inForce: preview.previous } });
}

/** Gives the grid in force back, as it was before `showTappedPreview`. */
export function discardTappedPreview(): void {
  const s = appStore.getState();
  const p = s.tempoPreview;
  if (!p) return;
  // Still shown: the grid in force comes back; replaced meanwhile (an undo): nothing else to give back.
  appStore.setState(s.tempoMap === p.shown ? { tempoMap: p.inForce, tempoPreview: null } : { tempoPreview: null });
}

/** Keeps the correction as computed (the rest of the piece analysed again after `end`); one undo step. */
export async function commitTappedFix(preview: TappedPreview): Promise<void> {
  discardTappedPreview();
  const s = appStore.getState();
  if (!s.project || !s.analysis || s.tempoMap !== preview.previous) return;
  applyTempoFix(preview.result, { kind: 'tapped', time: preview.from, previous: preview.previous, taps: [...preview.taps], end: preview.end });
}
