// Leaving the open project with changes not saved (C5): « Les modifications du
// projet en cours n'ont pas été sauvegardées, voulez-vous enregistrer ? » with
// « Enregistrer », « Ne pas enregistrer » and « Annuler ».
//
// One function, `confirmLeaveProject()`, resolves true when the caller may go on
// (and replace or close the open project) and false when it must stay:
//   - not modified (or nothing open): true at once, no alert;
//   - « Enregistrer »: the project is saved (`saveProject`: overwrites its file,
//     or asks where for a project never saved); if that is cancelled or fails,
//     false: the user stays with their project;
//   - « Ne pas enregistrer »: true; nothing is written to the `.fab` (the local
//     autosave keeps the last work on the device, as it always does);
//   - « Annuler »: false.
//
// The three triggers call it before they replace anything: a new project
// (`requestNewProject`, and an import that replaces the open piece), another
// project opened (picker, recent list, Finder, drag and drop), and — Mac app,
// `project/windowState.ts` — closing the window or quitting. On the web the tab
// cannot be asked (the autosave covers it).

import { createStore } from 'zustand/vanilla';
import { isModified } from '../store/history';
import { closePanel, openNewPiece } from '../store/actions';
import { appStore, type NewPieceFrom } from '../store/store';
import { saveProject } from './saveFlow';

export interface LeaveDialogState {
  /** The alert is on screen. */
  open: boolean;
  /** « Enregistrer » was chosen and the save is under way: the alert gives way to the save's own window. */
  saving: boolean;
}

export const leaveDialog = createStore<LeaveDialogState>()(() => ({ open: false, saving: false }));

let pending: { promise: Promise<boolean>; resolve: (go: boolean) => void } | null = null;
/** The id of the project the user already agreed to leave unsaved, while the « Nouveau projet » window stays open. */
let agreedFor: string | null = null;

appStore.subscribe((s) => {
  if (!s.ui.newPieceOpen) agreedFor = null;
});

/**
 * May the caller go on and replace (or close) the open project? Shows the alert when it has changes not saved.
 * A second call while the alert is up gets the same answer.
 */
export function confirmLeaveProject(): Promise<boolean> {
  if (pending) return pending.promise;
  const s = appStore.getState();
  if (!isModified()) return Promise.resolve(true);
  // « Nouveau projet » asked already, and the window it opened is still open (« Ouvrir un projet » in it, an import).
  if (s.ui.newPieceOpen && agreedFor !== null && agreedFor === s.project?.id) return Promise.resolve(true);
  let resolve!: (go: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  pending = { promise, resolve };
  leaveDialog.setState({ open: true, saving: false });
  return promise;
}

function settle(go: boolean): void {
  const p = pending;
  pending = null;
  leaveDialog.setState({ open: false, saving: false });
  p?.resolve(go);
}

/** The three buttons of the alert. */
export async function answerLeave(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
  if (!pending) return;
  if (choice === 'discard') return settle(true);
  if (choice === 'cancel') return settle(false);
  if (leaveDialog.getState().saving) return;
  leaveDialog.setState({ saving: true });
  let outcome: Awaited<ReturnType<typeof saveProject>>;
  try {
    outcome = await saveProject();
  } catch {
    outcome = 'failed';
  }
  settle(outcome === 'saved');
}

/**
 * « Nouveau projet »: asks about the changes first, then opens the window that makes one (a link, an audio file,
 * or an existing project). Nothing happens when the user stays. `from`: the entry of « Nouveau projet ▸ » chosen
 * (`ui.newPieceFrom`).
 */
export async function requestNewProject(from: NewPieceFrom = null): Promise<void> {
  const s = appStore.getState();
  if (s.ui.import.kind === 'busy') return;
  // A panel left open makes way for the alert.
  closePanel();
  if (!(await confirmLeaveProject())) return;
  // What the user just agreed to stands for the window that opens: « Ouvrir » in it does not ask again.
  agreedFor = appStore.getState().project?.id ?? null;
  openNewPiece(from);
}
