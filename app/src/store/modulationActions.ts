// The modulation window's commands (C10): add, or change the key and the bar of one, as ONE undo step
// (« Annuler : tonalité »). The single commands are `keyActions.ts`; this only groups them.

import { sameKey } from '../harmony/key';
import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import { transact } from './history';
import { addKeyChange, KEY_CHANGE_SAME, moveKeyChange, setKeyChangeKey } from './keyActions';
import { keyChangesInForce } from './keySelectors';
import { appStore } from './store';

/**
 * Writes the modulation of the window. `from` is the time of the modulation being edited (null: a new one),
 * `to` the bar line it is to be at, `key` its key as stored. Nothing is changed (and no step recorded) when
 * the result is the one in force. False when a command refused.
 */
export function saveModulation(from: Seconds | null, to: Seconds, key: Key): boolean {
  if (from === null) return transact('history.what.key', () => addKeyChange(to, key));
  const current = keyChangesInForce(appStore.getState()).find((c) => Math.abs(c.time - from) < KEY_CHANGE_SAME);
  if (!current) return false;
  const moves = Math.abs(from - to) >= KEY_CHANGE_SAME;
  const recolours = !sameKey(current.key, key);
  if (!moves && !recolours) return true;
  return transact('history.what.key', () => {
    if (moves && !moveKeyChange(from, to)) return false;
    return !recolours || setKeyChangeKey(to, key);
  });
}
