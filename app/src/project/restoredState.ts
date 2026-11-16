// A piece reopened at launch from the local autosave (C5): « modified » or not.
//
// The history starts a restored piece as « modified » (nothing says its file
// still matches). The record kept beside the autosave (`storage/savedState.ts`)
// says whether the stored document is the one last saved to its `.fab` file:
//   - Mac app: when it is, and the main process still finds that file on the
//     disk, the piece reads « not modified » and « Enregistrer » overwrites
//     that file without asking. A file gone or unreadable: « modified », no file;
//   - web: the file handle is not kept across a reload (the browser would ask
//     for permission again): only the « saved » state comes back, and
//     « Enregistrer » asks where to write.
// Nothing changes if the user (or an analysis) changed the piece meanwhile.

import { getDesktopBridge } from '../platform/desktopBridge';
import type { SavedStateStore } from '../storage/savedState';
import { documentChanged } from '../store/document';
import { canUndo, markSaved } from '../store/history';
import { appStore } from '../store/store';
import { recallDesktopFile } from './currentFile';

/**
 * To call once a piece kept on the device is open again (`whole`: false when its separated instruments could not
 * be read back, which is a change). Resolves true when the piece now reads « not modified ».
 */
export async function restoreSavedState(projectId: string, record: SavedStateStore, whole = true): Promise<boolean> {
  const saved = record.read();
  if (!whole || !saved || saved.projectId !== projectId || saved.modified) return false;
  const before = appStore.getState();
  if (before.project?.id !== projectId) return false;
  if (getDesktopBridge() && !(await recallDesktopFile(projectId))) return false;
  const now = appStore.getState();
  if (now.project?.id !== projectId || documentChanged(now, before) || canUndo()) return false;
  markSaved();
  return true;
}
