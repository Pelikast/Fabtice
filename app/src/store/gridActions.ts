// Hand corrections of the grid (« Tempo et mesures » panel): tempo × 2 and
// ÷ 2, first downbeat moved by a beat or placed at the playhead, beats per
// bar, back to the analysed grid. Beat times never move: chords and sections
// (stored in time) stay with the music. The lot 1 entry (tempo typed or
// tapped) stays in `actions.ts#setManualGrid` and makes a constant grid.

import { getEngine } from '../audio';
import { tempoMapFromBeats } from '../grid/beats';
import { canDoubleTempo, canHalveTempo, doubleTempo, downbeatNear, halveTempo, isBeatGrid, shiftDownbeat, withNumerator } from '../grid/corrections';
import { withManualGrid } from '../grid/tempoMap';
import type { TempoMap } from '../model/tempoMap';
import { appStore, type AppState } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

function correct(fn: (map: TempoMap) => TempoMap): void {
  if (!get().project) return;
  set((s) => ({ tempoMap: fn(s.tempoMap) }));
}

/** The analysis found half the real tempo: twice as many beats. */
export function doubleTheTempo(): void {
  const s = get();
  if (canDoubleTempo(s.tempoMap, s.project?.duration)) correct(doubleTempo);
}

/** The analysis found twice the real tempo: every other beat. */
export function halveTheTempo(): void {
  const s = get();
  if (canHalveTempo(s.tempoMap, s.project?.duration)) correct(halveTempo);
}

/** Moves the first downbeat (and every bar line) by one beat: +1 later, −1 earlier. */
export function moveDownbeat(beats: 1 | -1): void {
  correct((m) => shiftDownbeat(m, beats));
}

/** Beats per bar. Keeps analysed beats (variable tempo); on a lot 1 grid, same as the panel's buttons. */
export function setBeatsPerBar(numerator: number): void {
  correct((m) => (isBeatGrid(m) ? withNumerator(m, numerator) : withManualGrid(m, { numerator })));
}

/**
 * « Premier temps ici »: on analysed beats, the beat nearest the playhead
 * becomes the first downbeat (the beats stay); on a lot 1 grid, the first
 * downbeat goes exactly where the playhead is heard.
 */
export function placeDownbeatAtPlayhead(): void {
  const t = getEngine().getPosition();
  correct((m) => (isBeatGrid(m) ? downbeatNear(m, t) : withManualGrid(m, { firstDownbeat: t })));
}

/** Back to the analysed grid, dropping the grid corrections (the user asked). */
export function resetGridToAnalysis(): void {
  const { analysis } = get();
  if (!analysis) return;
  try {
    set({ tempoMap: tempoMapFromBeats(analysis.beats.times, analysis.beats.downbeat, analysis.beats.meter, 'analysis') });
  } catch {
    // unusable analysed grid: keep the one in force
  }
}

/** Whether the panel offers × 2 and ÷ 2 for the grid in force. */
export function gridCorrectionsAvailable(s: Pick<AppState, 'tempoMap' | 'project'>): { double: boolean; halve: boolean } {
  return { double: canDoubleTempo(s.tempoMap, s.project?.duration), halve: canHalveTempo(s.tempoMap, s.project?.duration) };
}
