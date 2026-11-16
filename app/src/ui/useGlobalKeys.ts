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

/**
 * Space toggles playback (also when a button has the focus: the button is not
 * pressed), Escape closes the open panel, then the dialog. The shortcuts of the
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
      if (e.altKey || e.ctrlKey || e.metaKey || keepsSpace(e.target)) return;
      const s = appStore.getState();
      if (s.ui.newPieceOpen || !s.project) return;
      e.preventDefault();
      if (!e.repeat) togglePlay();
    };
    // A focused button would also "click" on keyup: swallow that.
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === ' ') && !keepsSpace(e.target) && e.target instanceof HTMLButtonElement) {
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
