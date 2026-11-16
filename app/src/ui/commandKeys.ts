// The keyboard shortcuts of the commands (C6, C11, C5), through the command
// table (`ui/commands.ts`): a command greyed out in the menus does nothing
// from the keyboard either.
//
//   - Mac: cmd + Z, Maj + cmd + Z (« Annuler », « Rétablir »), cmd + O
//     (« Ouvrir… »), cmd + S, Maj + cmd + S (« Enregistrer », « Enregistrer
//     sous… »), cmd + P (« Imprimer… »), cmd + , (« Réglages… »). Elsewhere
//     Ctrl, and Ctrl + Y for « Rétablir » too.
//   - The letter as typed (AZERTY, QWERTZ); the key position only for layouts
//     without Latin letters.
//   - Undo and redo in a text field are left to the browser: it undoes the
//     typing, as everywhere. Every other shortcut is taken everywhere, a text
//     field included, and always `preventDefault`: the browser's own « save
//     the page », « open a file », « print » never open.
//   - Taken here, the key never reaches the Mac menu bar too (on macOS the page
//     hears the key first; elsewhere the bar only shows its shortcuts, see
//     `desktop/src/menu.js`). `ui/menuBar.ts` drops a bar command that follows
//     the same key at once, should a system deliver both.
//   - A key held down repeats undo and redo only.

import { runCommand, type CommandId } from './commands';
import { historyCommandFor, isMacPlatform, isTextField } from './historyKeys';
import { saveCommandFor } from './saveKeys';

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** Letters (and the comma) of the other shortcuts, by command. */
const OTHERS: readonly { letter: string; code: string; id: CommandId }[] = [
  { letter: 'o', code: 'KeyO', id: 'open' },
  { letter: 'p', code: 'KeyP', id: 'print' },
  { letter: ',', code: 'Comma', id: 'settings' },
];

/** The command a key press asks for, or null. */
export function shortcutCommandFor(e: KeyLike, mac: boolean): CommandId | null {
  const history = historyCommandFor(e, mac);
  if (history) return history;
  const save = saveCommandFor(e, mac);
  if (save) return save;
  if (e.altKey || e.shiftKey) return null;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : '';
  const latin = /^[a-z]$/.test(key);
  for (const o of OTHERS) {
    // Without Latin letters, the key position (a letter of another alphabet only, never another sign).
    const other = !latin && /^\p{L}$/u.test(key) && e.code === o.code;
    if (o.letter === ',' ? key === ',' || other : latin ? key === o.letter : other || (key === '' && e.code === o.code)) return o.id;
  }
  return null;
}

/** The last command the keyboard ran, and when (`ui/menuBar.ts` drops the same command from the bar right after). */
let lastKey: { id: CommandId; at: number } | null = null;

export function lastKeyCommand(): { id: CommandId; at: number } | null {
  return lastKey;
}

/** Follows the keyboard on `win`. Returns the stop function. */
export function installCommandKeys(win: Window = window, mac = isMacPlatform()): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const id = shortcutCommandFor(e, mac);
    if (!id) return;
    const history = id === 'undo' || id === 'redo';
    // The browser undoes the typing.
    if (history && isTextField(e.target)) return;
    e.preventDefault();
    if (e.repeat && !history) return;
    lastKey = { id, at: Date.now() };
    void runCommand(id);
  };
  win.addEventListener('keydown', onKeyDown);
  return () => win.removeEventListener('keydown', onKeyDown);
}
