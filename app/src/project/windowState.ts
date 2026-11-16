// What the window says about the open project (C5), and the Mac app's closing.
//
//   - the title: the Mac app shows the file's name (or the piece's title while
//     it was never saved), with the system's own marks (the dot in the close
//     button when there are changes not saved, the file's icon in the title bar:
//     `reportProjectState`). The web shows « Nom — Fabtice » in the tab, with a
//     discreet « • » in front while there are changes not saved;
//   - Mac app, a piece restored from the local autosave: the file it was last
//     saved to is found again (the main process remembers it);
//   - Mac app, closing the window or quitting (the red button, cmd + Q): the main
//     process asks, the alert about changes not saved answers (`leave.ts`). A web
//     page cannot be asked: the autosave covers the tab being closed.

import { t } from '../i18n';
import { getDesktopBridge, type DesktopBridge } from '../platform/desktopBridge';
import { appStore } from '../store/store';
import { isModified, subscribeHistory } from '../store/history';
import { displayName, getCurrentFile, recallDesktopFile, subscribeCurrentFile } from './currentFile';
import { confirmLeaveProject } from './leave';

/** The title of the window or the tab. */
export function windowTitle(input: { projectTitle: string | null; fileName: string | null; modified: boolean; desktop: boolean }): string {
  const name = input.fileName ? displayName(input.fileName) : input.projectTitle;
  if (!name) return t('window.title');
  // The Mac app has its own marks for « modified ».
  if (input.desktop) return name;
  return t(input.modified ? 'window.titleModified' : 'window.titleWith', { name });
}

/** Follows the project, its file and its « modified » state. Returns the stop function. */
export function installProjectWindow(bridge: DesktopBridge | null = getDesktopBridge(), doc: Document = document): () => void {
  let lastTitle = '';
  let lastReport = '';
  const refresh = () => {
    const s = appStore.getState();
    const file = getCurrentFile();
    const modified = s.project !== null && isModified();
    const title = windowTitle({ projectTitle: s.project?.title ?? null, fileName: file?.name ?? null, modified, desktop: bridge !== null });
    if (title !== lastTitle) {
      lastTitle = title;
      doc.title = title;
    }
    if (bridge?.reportProjectState) {
      const state = { projectId: s.project?.id ?? null, modified };
      const key = `${state.projectId}|${modified}|${file?.name ?? ''}`;
      if (key !== lastReport) {
        lastReport = key;
        void bridge.reportProjectState(state).catch(() => {});
      }
    }
  };

  let projectId: string | null = null;
  const offStore = appStore.subscribe((s) => {
    const id = s.project?.id ?? null;
    if (id !== projectId) {
      projectId = id;
      // A piece restored from the autosave: its file of a former launch, if the Mac app remembers one.
      if (id !== null && s.project?.source.kind !== 'demo') void recallDesktopFile(id);
    }
    refresh();
  });
  const offFile = subscribeCurrentFile(refresh);
  const offHistory = subscribeHistory(refresh);
  refresh();

  // Mac app: « may this window go? »
  const offClose = bridge?.onConfirmClose?.(({ id }) => {
    void bridge.ackClose?.(id).catch(() => {});
    void confirmLeaveProject()
      .catch(() => false)
      .then((go) => bridge.answerClose?.(id, go))
      .catch(() => {});
  });

  return () => {
    offStore();
    offFile();
    offHistory();
    offClose?.();
  };
}
