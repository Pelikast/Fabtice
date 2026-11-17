// Modulations by hand (document version 6): add, move, change, delete a key
// change, or give them back to the analysis. The main key (first passage) is
// `harmonyActions.ts#setKey`. Keys are given as stored (concert pitch,
// original key: `harmonyActions.ts#untransposeKeyForStorage` for a key chosen
// as displayed); times in source seconds.
//
// The first edit copies the modulations in force (the analysed ones) into
// `corrections.keyChanges`; from then on that list is the user's and a new
// analysis (or a refresh of the detected modulations, `structure/refresh.ts`)
// does not change it (`store/keySelectors.ts`). A key changes on a bar line:
// a time given to `addKeyChange` or `moveKeyChange` goes to the nearest bar
// line of the grid in force (C10: a change of key in the middle of a bar,
// never). Each command returns false, and changes nothing, when it cannot apply.

import { sameKey } from '../harmony/key';
import type { Key, KeyChange } from '../model/harmony';
import type { Seconds } from '../model/project';
import { sectionBar } from '../chart/layout';
import { barStartTime } from '../grid/tempoMap';
import { keyAt, keyChangesInForce } from './keySelectors';
import { appStore, gridInForce } from './store';

/** Two key changes closer than this are the same one (the times come from bar lines of the grid). */
export const KEY_CHANGE_SAME: Seconds = 1e-3;

const at = (list: readonly KeyChange[], time: Seconds) => list.findIndex((c) => Math.abs(c.time - time) < KEY_CHANGE_SAME);
const sorted = (list: KeyChange[]) => list.sort((a, b) => a.time - b.time);
const plain = (k: Key): Key => ({ tonic: k.tonic, mode: k.mode });

/** Applies `fn` to the modulations in force; null from `fn` refuses. */
function edit(fn: (list: KeyChange[]) => KeyChange[] | null): boolean {
  const s = appStore.getState();
  if (!s.project) return false;
  const next = fn(keyChangesInForce(s));
  if (!next) return false;
  appStore.setState({ corrections: { ...s.corrections, keyChanges: next } });
  return true;
}

/** The bar line nearest to `time` on the grid in force. */
export function keyChangeLine(time: Seconds): Seconds {
  const map = gridInForce(appStore.getState());
  return barStartTime(map, sectionBar(map, time));
}

/** A time a modulation may be at: after 0, inside the piece. */
function placeable(time: Seconds): boolean {
  const s = appStore.getState();
  return Number.isFinite(time) && time > KEY_CHANGE_SAME && (!s.project || time < s.project.duration);
}

/**
 * A modulation to `key` from the bar line nearest `near` on. At the time of an existing one, it
 * changes its key. Refused when the key is already the one in force there
 * (no modulation) or the time is not inside the piece.
 */
export function addKeyChange(near: Seconds, key: Key): boolean {
  if (!placeable(near)) return false;
  const time = keyChangeLine(near);
  if (!placeable(time)) return false;
  return edit((list) => {
    const i = at(list, time);
    if (i >= 0) return list.map((c, k) => (k === i ? { time: c.time, key: plain(key) } : c));
    const before = keyAt({ analysis: appStore.getState().analysis, corrections: { ...appStore.getState().corrections, keyChanges: list } }, time);
    if (before && sameKey(before, key)) return null;
    return sorted([...list, { time, key: plain(key) }]);
  });
}

/** Changes the key of the modulation at `time`. */
export function setKeyChangeKey(time: Seconds, key: Key): boolean {
  return edit((list) => {
    const i = at(list, time);
    return i < 0 ? null : list.map((c, k) => (k === i ? { time: c.time, key: plain(key) } : c));
  });
}

/** Moves the modulation at `from` to the bar line nearest `toTime` (refused onto another one, or outside the piece). */
export function moveKeyChange(from: Seconds, toTime: Seconds): boolean {
  if (!placeable(toTime)) return false;
  const to = keyChangeLine(toTime);
  if (!placeable(to)) return false;
  return edit((list) => {
    const i = at(list, from);
    if (i < 0) return null;
    const j = at(list, to);
    if (j >= 0 && j !== i) return null;
    return sorted(list.map((c, k) => (k === i ? { time: to, key: c.key } : c)));
  });
}

/** Deletes the modulation at `time` (an analysed one too: it stays deleted after a new analysis). */
export function removeKeyChange(time: Seconds): boolean {
  return edit((list) => {
    const i = at(list, time);
    return i < 0 ? null : list.filter((_, k) => k !== i);
  });
}

/** « Revenir à l'analyse » for the modulations: the analysed ones show again. */
export function resetKeyChanges(): void {
  const s = appStore.getState();
  if (!s.project || s.corrections.keyChanges === null) return;
  appStore.setState({ corrections: { ...s.corrections, keyChanges: null } });
}
