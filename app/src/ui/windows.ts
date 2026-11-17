// Which windows of the app are on screen (not the « Nouveau projet » window: it is the opening screen, and
// the menu knows it as `opening`). One window at a time: the start-up message of the chord charts waits until
// none of these is open, and the commands of the menu are greyed out while one is.

import { abletonDialog } from '../export/ableton/dialog';
import { logicDialog } from '../export/logic/dialog';
import { leaveDialog } from '../project/leave';
import { saveActivity } from '../project/saveFlow';
import { appStore, type AppState } from '../store/store';
import { tapFixDialog } from './barDialogs';
import { partDialog } from './partDialog';

/** A window of the app stands in front of the piece: export, print, save, settings, the render's wait, the alert, the save's own. */
export function otherWindowOpen(s: AppState = appStore.getState()): boolean {
  const save = saveActivity.getState();
  return (
    s.ui.exportAudioOpen ||
    s.ui.printOpen ||
    logicDialog.getState().open ||
    tapFixDialog.getState().at !== null ||
    partDialog.getState().at !== null ||
    abletonDialog.getState().open ||
    s.ui.saveProjectOpen ||
    s.ui.settings.open ||
    s.render.status === 'rendering' ||
    s.render.status === 'error' ||
    leaveDialog.getState().open ||
    (save.phase === 'working' && save.visible) ||
    save.phase === 'error'
  );
}

/** Follows what `otherWindowOpen` reads. Returns the stop function. */
export function subscribeWindows(listener: () => void): () => void {
  const offs = [appStore.subscribe(listener), leaveDialog.subscribe(listener), saveActivity.subscribe(listener), logicDialog.subscribe(listener), abletonDialog.subscribe(listener), tapFixDialog.subscribe(listener), partDialog.subscribe(listener)];
  return () => {
    for (const off of offs) off();
  };
}
