// « Annuler » / « Rétablir » from the keyboard (C11), and the pointer gestures
// that make one undo step each.
//
//   - Mac: cmd + Z, Maj + cmd + Z. Elsewhere: Ctrl + Z, Ctrl + Maj + Z, Ctrl + Y.
//   - In a text field (input, textarea, contenteditable) the shortcut is left
//     alone: the browser undoes the typing, as everywhere.
//   - While a pointer is held down (a slider dragged, a loop edge pulled, a
//     selection of bars), every change is one step: the gesture ends once the
//     pointer is released (after the release's own handlers and click).

import { appStore } from '../store/store';
import { beginGesture, endGesture, redo, undo } from '../store/history';

export type HistoryCommand = 'undo' | 'redo';

/** Whether the page runs on a Mac (cmd rather than Ctrl). */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } | null | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent || '');
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** The history command a key press asks for, or null. */
export function historyCommandFor(e: KeyLike, mac: boolean): HistoryCommand | null {
  if (e.altKey) return null;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : '';
  // The letter as typed (AZERTY puts Z elsewhere); the key position only for layouts without Latin letters.
  const latin = /^[a-z]$/.test(key);
  const is = (letter: 'z' | 'y', code: string) => (latin ? key === letter : e.code === code);
  if (is('z', 'KeyZ')) return e.shiftKey ? 'redo' : 'undo';
  if (!mac && !e.shiftKey && is('y', 'KeyY')) return 'redo';
  return null;
}

const NOT_TEXT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** Where the browser's own undo applies: the typing in a text field. */
export function isTextField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return false;
}

/** Follows the keyboard and the pointer on `win`. Returns the stop function. */
export function installHistoryKeys(win: Window = window, mac = isMacPlatform()): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const command = historyCommandFor(e, mac);
    if (!command || isTextField(e.target)) return;
    const s = appStore.getState();
    if (!s.project || s.ui.newPieceOpen) return;
    // Taken here, so that nothing else (the Mac app's Edit menu) acts on it too.
    e.preventDefault();
    if (command === 'undo') undo();
    else redo();
  };

  let pressed = false;
  let ending: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (ending !== null) clearTimeout(ending);
    ending = null;
    if (pressed) {
      pressed = false;
      endGesture();
    }
  };
  const onDown = (e: PointerEvent) => {
    // Only the first pointer starts a gesture (a pinch is one gesture).
    if (pressed && ending === null) return;
    finish();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pressed = true;
    beginGesture();
  };
  // After the release's own handlers (and the click that follows it): the last change belongs to the gesture.
  const onUp = () => {
    if (pressed && ending === null) ending = setTimeout(finish, 0);
  };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('pointerdown', onDown, true);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onUp, true);
  win.addEventListener('blur', finish);
  return () => {
    finish();
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('pointerdown', onDown, true);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('pointercancel', onUp, true);
    win.removeEventListener('blur', finish);
  };
}
