// « Changer la signature rythmique » (C13) on the store side: the commands
// the bar menu's window calls (stage 4 builds the window), and what it reads.
// The arithmetic and its rules are in `grid/meters.ts`.
//
// Each command is one undo step, « Annuler : signature rythmique », and makes
// the grid a correction by hand (`corrected` on analysed beats, `manual`
// otherwise), like the other corrections of `store/gridActions.ts`: a new
// analysis keeps it. The beat times never move: chords, sections and loops
// (kept in seconds) stay with the music.

import { canSetMeterAt, meterAtTime, meterChangeAt, meterChangeList, withMeterForBar, withMeterFrom, withoutMeterChange, type MeterChangeView } from '../grid/meters';
import { meterAtBar } from '../grid/tempoMap';
import type { Seconds } from '../model/project';
import type { Meter, MeterChange, TempoMap } from '../model/tempoMap';
import { transact } from './history';
import { appStore, type AppState } from './store';

export type { MeterChangeView };

/** Applies a grid change as one undo step; false when there is no piece or nothing changes. */
function apply(fn: (map: TempoMap) => TempoMap): boolean {
  const s = appStore.getState();
  if (!s.project) return false;
  const next = fn(s.tempoMap);
  if (next === s.tempoMap) return false;
  transact('history.what.meter', () => appStore.setState({ tempoMap: next }));
  return true;
}

/**
 * « Changement permanent à partir de cette mesure »: `meter` (1…64 over 4, 8,
 * 16 or 32) from bar `bar` (index: 0 = « mesure 1 ») until the next change
 * already there, or the end. False when refused (a pick-up bar, an illegal
 * signature) or when it changes nothing (the signature is already that one).
 */
export function setMeterFrom(bar: number, meter: Meter): boolean {
  return apply((m) => withMeterFrom(m, bar, meter));
}

/** « Changement uniquement pour cette mesure »: `meter` for bar `bar` only, then the signature the next bar had. */
export function setMeterForBar(bar: number, meter: Meter): boolean {
  return apply((m) => withMeterForBar(m, bar, meter));
}

/** Removes the change at bar `bar`: the signature before it goes on. False when there is none there. */
export function removeMeterChange(bar: number): boolean {
  return apply((m) => withoutMeterChange(m, bar));
}

/** Whether bar `bar` can be given a signature (« mesure 1 » or later; not a pick-up bar). */
export function canChangeMeterAt(bar: number): boolean {
  return canSetMeterAt(bar);
}

/** The signature in force at bar `bar` (the window's starting values). */
export function selectMeterAtBar(s: Pick<AppState, 'tempoMap'>, bar: number): Meter {
  return meterAtBar(s.tempoMap, bar);
}

/** The signature in force at a source time (the playhead's). */
export function selectMeterAtTime(s: Pick<AppState, 'tempoMap'>, time: Seconds): Meter {
  return meterAtTime(s.tempoMap, time);
}

/** The change that starts at bar `bar`, or null (the window offers to remove it). */
export function selectMeterChangeAt(s: Pick<AppState, 'tempoMap'>, bar: number): MeterChange | null {
  const c = meterChangeAt(s.tempoMap, bar);
  return c && c.bar > 0 ? c : null;
}

/** Every signature of the piece, the first one included, as shown (stable per grid: safe in `useApp`). */
export function selectMeterChanges(s: Pick<AppState, 'tempoMap'>): MeterChangeView[] {
  return meterChangeList(s.tempoMap);
}
