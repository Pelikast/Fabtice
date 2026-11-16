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
// The keys are read here; `ui/commandKeys.ts` follows them with the other
// shortcuts, through the command table (`ui/commands.ts`).

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
