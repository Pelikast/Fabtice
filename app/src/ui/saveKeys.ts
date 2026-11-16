// « Enregistrer » and « Enregistrer sous… » from the keyboard (C5).
//
//   - Mac: cmd + S, Maj + cmd + S. Elsewhere: Ctrl + S, Maj + Ctrl + S.
//   - Taken everywhere, a text field included (the chord grid's cell, the title):
//     saving is what the user means there too, and the browser's « save the page »
//     must never open. Always `preventDefault`.
//   - The letter as typed (AZERTY, QWERTZ); the key position only for layouts
//     without Latin letters.
//   - Nothing while a window of the app is in the way (the save panel's own
//     dialog, the alert) or a key is held down.

import { appStore } from '../store/store';
import { leaveDialog } from '../project/leave';
import { saveProject, saveProjectAs } from '../project/saveFlow';
import { isMacPlatform } from './historyKeys';

export type SaveCommand = 'save' | 'saveAs';

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** The save command a key press asks for, or null. */
export function saveCommandFor(e: KeyLike, mac: boolean): SaveCommand | null {
  if (e.altKey) return null;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : '';
  const latin = /^[a-z]$/.test(key);
  if (!(latin ? key === 's' : e.code === 'KeyS')) return null;
  return e.shiftKey ? 'saveAs' : 'save';
}

/** Follows the keyboard on `win`. Returns the stop function. */
export function installSaveKeys(win: Window = window, mac = isMacPlatform()): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const command = saveCommandFor(e, mac);
    if (!command) return;
    // Taken here: the browser's own « save the page » never opens.
    e.preventDefault();
    if (e.repeat) return;
    const s = appStore.getState();
    if (!s.project || s.ui.saveProjectOpen || leaveDialog.getState().open || s.ui.import.kind === 'busy') return;
    void (command === 'save' ? saveProject() : saveProjectAs());
  };
  win.addEventListener('keydown', onKeyDown);
  return () => win.removeEventListener('keydown', onKeyDown);
}
