import { useEffect } from 'react';
import { escape, togglePlay } from '../store/actions';
import { appStore } from '../store/store';
import { installCommandKeys } from './commandKeys';
import { installHistoryGestures } from './historyKeys';

/** Elements where Space must keep its own meaning (typing, ticking, choosing). */
function keepsSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !['range', 'button'].includes(target.type);
  return false;
}

/** What puts a window in front of the piece, whatever it is: an open dialog or alert, a menu. Panels and notices are not modal: `windowOpen` asks where the key is pressed for them. */
const WINDOWS = '[role="dialog"][aria-modal="true"], [role="alertdialog"], [role="menu"]';

/** A control that does something on Space: a button, a box, a switch. */
const ACTIVATED_BY_SPACE = 'button, summary, input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

/** Windows that are in the page but not on screen (the opening window while it is closed keeps its place). */
function shown(el: Element): boolean {
  return !el.closest('[aria-hidden="true"], [hidden]');
}

/**
 * « A window is open »: the one notion every Space shortcut asks. True when a dialog, an alert or a menu is on
 * screen (the windows of the app, its menus, the bar menu, the sheet of the menu on a phone), or when `target`
 * is a button or a box in a panel or a notice (the small panels of the tool bars, the storage notice), which
 * are not modal. Read from the page, so a window added tomorrow is counted without being listed here.
 */
export function windowOpen(target: EventTarget | null = null): boolean {
  if (typeof document === 'undefined') return false;
  for (const el of document.querySelectorAll(WINDOWS)) if (shown(el)) return true;
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"], .avis-stockage') !== null && target.closest(ACTIVATED_BY_SPACE) !== null;
}

/**
 * Space toggles playback (also when a toolbar button has the focus: the button is not
 * pressed) unless a window is open (`windowOpen`): then it does what the focused control normally
 * does (presses the button, ticks the box) and never starts the playback behind the window.
 * Escape closes the open panel, then the dialog. The shortcuts of the
 * commands (cmd + Z, S, O, P, « , »; Ctrl elsewhere) are `ui/commandKeys.ts`.
 */
export function useGlobalKeys(): void {
  // The shortcuts of the commands (`ui/commandKeys.ts`), and the gestures that make one undo step each.
  useEffect(() => installCommandKeys(), []);
  useEffect(() => installHistoryGestures(), []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escape();
        return;
      }
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.altKey || e.ctrlKey || e.metaKey || keepsSpace(e.target) || windowOpen(e.target)) return;
      const s = appStore.getState();
      if (s.ui.newPieceOpen || !s.project) return;
      e.preventDefault();
      if (!e.repeat) togglePlay();
    };
    // A focused button would also "click" on keyup: swallow that.
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === ' ') && !keepsSpace(e.target) && !windowOpen(e.target) && e.target instanceof HTMLButtonElement) {
        const s = appStore.getState();
        if (!s.ui.newPieceOpen && s.project) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
