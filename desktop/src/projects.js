'use strict';

// Project files in the main process (lot 4 and the owner's decisions of
// 15 November), kept apart from main.js: the files macOS hands over
// (`open-files.js`), the recent projects (`recent-projects.js`) and their IPC.
//
//   - a project opened from the Finder, from the recent list, or chosen in the
//     page's file picker, and a project saved (the download's save panel), goes
//     first in the recent list and in macOS's own (« Ouvrir un projet récent »,
//     the Dock);
//   - the page lists the recent projects (`recentProjects`) and opens one by
//     its token (`openRecentProject`): the file then comes to the page the same
//     way as from the Finder (`onOpenProject`), read by ranges;
//   - the file of the open project (C5): « Enregistrer » overwrites it, « Enregistrer
//     sous… » makes another one, both written safely (`project-writer.js`).

const path = require('node:path');
const os = require('node:os');
const { createOpenFiles } = require('./open-files');
const { createRecentProjects } = require('./recent-projects');
const { createProjectWriter, WriterError } = require('./project-writer');
const { saveDialogOptions } = require('./downloads');

/**
 * @param {{
 *   userData: () => string,
 *   addRecentDocument?: (p: string) => void,
 *   clearRecentDocuments?: () => void,
 *   dialog?: { showSaveDialog: (win: any, options: any) => Promise<{ canceled: boolean, filePath?: string }> },
 *   window?: () => any,
 *   downloadsDir?: () => string,
 * }} options
 */
function createProjects(options) {
  let recent = null;
  const recents = () => {
    recent = recent || createRecentProjects({ file: path.join(options.userData(), 'recent-projects.json'), home: os.homedir(), addRecentDocument: options.addRecentDocument });
    return recent;
  };
  const openFiles = createOpenFiles({ onAccepted: (entry, filePath) => void recents().add(filePath) });
  let lastFolder = null;
  const writer = createProjectWriter({
    file: path.join(options.userData(), 'project-files.json'),
    onSaved: (filePath) => {
      lastFolder = path.dirname(filePath);
      void recents().add(filePath);
    },
  });
  // `dialog.showSaveDialog` is read at call time, so that a test can stand in for the system's panel.
  const pickPath = async (suggestedName, projectId) => {
    const folder = lastFolder || (writer.pathFor(projectId) && path.dirname(writer.pathFor(projectId))) || (options.downloadsDir ? options.downloadsDir() : os.homedir());
    const win = options.window ? options.window() : null;
    const result = await options.dialog.showSaveDialog(win, saveDialogOptions(suggestedName || 'Projet.fab', folder));
    return result.canceled || !result.filePath ? null : result.filePath;
  };
  /** A failure of the writer as data the page can read (never an exception through IPC: the message may hold a path). */
  const answer = async (fn) => {
    try {
      return { ok: true, ...(await fn()) };
    } catch (e) {
      return { ok: false, reason: e instanceof WriterError ? e.code : 'failed' };
    }
  };

  /**
   * IPC handlers, registered with main.js's checked `handle`.
   * @param {(channel: string, fn: (event: any, ...args: any[]) => any) => void} handle
   */
  function registerIpc(handle) {
    // The page asks once for the files that came before it (and from then on is told of the next ones).
    handle('fabtice:pending-projects', async (event) => {
      const contents = event.sender;
      openFiles.onOpen((entry) => {
        if (!contents.isDestroyed()) contents.send('fabtice:open-project', entry);
      });
      return openFiles.takePending();
    });
    handle('fabtice:read-project', async (_e, token, offset, length) => openFiles.read(token, offset, length));
    handle('fabtice:release-project', async (_e, token) => {
      openFiles.release(token);
      return true;
    });
    handle('fabtice:recent-projects', async () => recents().list());
    handle('fabtice:open-recent-project', async (_e, token) => {
      const filePath = recents().pathFor(token);
      if (!filePath) return { ok: false };
      return { ok: (await openFiles.accept(filePath)) !== null };
    });
    // A project the page opened from its own file picker (its path given by the preload, `webUtils`).
    handle('fabtice:remember-project', async (_e, filePath) => {
      if (!(await openFiles.isProjectFile(filePath))) return false;
      await recents().add(filePath);
      return true;
    });
    // The file of the open project (C5). The page names the project by its id, never a path.
    handle('fabtice:project-file-info', async (_e, projectId) => writer.info(projectId));
    handle('fabtice:project-file-read', async (_e, projectId, offset, length) => writer.read(projectId, offset, length));
    // The page finished opening the project of a token (Finder, recent list): that file is now its file.
    handle('fabtice:project-file-adopt', async (_e, projectId, token) => {
      const filePath = openFiles.pathOf(token);
      return filePath ? writer.adopt(projectId, filePath) : null;
    });
    // ... or chosen in the page's file picker (its path given by the preload, `webUtils`).
    handle('fabtice:project-file-adopt-chosen', async (_e, projectId, filePath) => writer.adopt(projectId, filePath));
    handle('fabtice:project-file-recall', async (_e, projectId) => writer.recall(projectId));
    handle('fabtice:project-file-forget', async () => {
      writer.forget();
      return true;
    });
    handle('fabtice:project-save-begin', async (_e, request) => {
      const r = request && typeof request === 'object' ? request : {};
      return answer(() =>
        writer.begin({ projectId: r.projectId, target: r.target, suggestedName: r.suggestedName, pickPath: (name) => pickPath(name, r.projectId) }),
      );
    });
    handle('fabtice:project-save-write', async (_e, session, bytes) => answer(async () => void (await writer.write(session, bytes))));
    handle('fabtice:project-save-finish', async (_e, session) => answer(() => writer.finish(session)));
    handle('fabtice:project-save-abort', async (_e, session) => writer.abort(session));
    handle('fabtice:clear-recent-projects', async () => {
      await recents().clear();
      if (options.clearRecentDocuments) options.clearRecentDocuments();
      return true;
    });
  }

  return {
    /** A path macOS handed over (`open-file`, a second launch). */
    open: (filePath) => openFiles.accept(filePath),
    /** A download finished: a `.fab` saved by the user goes in the recent list. */
    saved: (filePath) => {
      if (typeof filePath === 'string' && path.extname(filePath).toLowerCase() === '.fab') void recents().add(filePath);
    },
    registerIpc,
    /** The path of the open project's file (the window's proxy icon), or null. */
    pathFor: (projectId) => writer.pathFor(projectId),
    /** At start-up: removes the temporary files a save that died left next to the projects we know. */
    cleanStale: async () => writer.cleanStale(await writer.knownFolders()),
  };
}

module.exports = { createProjects };
