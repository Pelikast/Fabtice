// What « Correction de la courbe en tapant le tempo » (C12) does to the audio
// engine while its window is open: the passage plays from a few bars before
// the chosen bar with the click forced on (and cut at that bar when tapping),
// the loop is put aside, and everything goes back to the user's own settings
// when the window closes. The engine is told directly: the store keeps the
// user's settings untouched, so nothing here is a modification of the piece
// (no undo step, no « unsaved changes »).
//
// While the window is open, `audio/connect.ts` still follows the store: when
// the candidate grid is shown (`showTappedPreview`) it replaces the click
// track by the candidate grid's, which is what « Vérifier en écoutant » wants.

import { getEngine } from '../audio';
import { metronomeClickTrack } from '../grid/metronome';
import { tapFixClicks, tapFixStart, tapFixVerify, type TapFixStart, type TapFixVerify } from '../grid/tapFixPlan';
import { untracked } from '../store/history';
import { appStore } from '../store/store';
import { discardTappedPreview, showTappedPreview, type TappedPreview } from '../analysis/tapFix';

const get = () => appStore.getState();

/** Gives the engine the user's own click, metronome switch and loop again: what `audio/connect.ts` keeps in step with the store. */
export function restoreEngineSettings(): void {
  const engine = getEngine();
  const s = get();
  engine.setMetronome(s.playback.metronome);
  engine.setClickTrack(metronomeClickTrack(s.tempoMap, 0, s.project?.duration ?? 0, s.metronome.patterns));
  engine.setLoop(s.loop.enabled ? s.loop.region : null);
}

/**
 * The candidate grid in force for listening, and the grid in force given back: neither is a change the user made, so
 * neither is an undo step nor makes the project « modified » (`store/history.ts#untracked`).
 */
export function showPreview(preview: TappedPreview): void {
  untracked(() => showTappedPreview(preview));
}

export function discardPreview(): void {
  untracked(() => discardTappedPreview());
}

/** Stops whatever plays, and leaves the position where it was heard. */
export function stopPlaying(): void {
  getEngine().pause();
}

/**
 * Starts the passage for tapping: from `countInBars` bars before `bar`, the metronome on whatever the user's
 * switch says, clicking the existing grid up to `bar` and not from it; the loop put aside. Call it inside the
 * user's gesture (the audio output may have to start).
 */
export function startTapping(bar: number, countInBars: number): TapFixStart {
  const engine = getEngine();
  const s = get();
  engine.pause();
  const plan = tapFixStart(s.tempoMap, bar, countInBars, s.metronome.patterns);
  engine.setLoop(null);
  engine.setMetronome(true);
  engine.setClickTrack(tapFixClicks(s.tempoMap, plan.barTime, s.metronome.patterns));
  engine.seek(plan.start);
  void engine.play(plan.countIn ? { countIn: plan.countIn } : undefined);
  return plan;
}

/**
 * « Vérifier en écoutant »: the same passage on the candidate grid (shown by `showTappedPreview`), click on the
 * whole of it. The caller stops it at `stop`. Inside a user gesture.
 */
export function startVerifying(preview: TappedPreview, countInBars: number): TapFixVerify {
  const engine = getEngine();
  const s = get();
  engine.pause();
  const plan = tapFixVerify(preview.tempoMap, preview.bar, preview.end, countInBars, s.metronome.patterns, s.project?.duration ?? 0);
  engine.setLoop(null);
  engine.setMetronome(true);
  engine.setClickTrack(metronomeClickTrack(preview.tempoMap, 0, s.project?.duration ?? 0, s.metronome.patterns));
  engine.seek(plan.start);
  void engine.play(plan.countIn ? { countIn: plan.countIn } : undefined);
  return plan;
}
