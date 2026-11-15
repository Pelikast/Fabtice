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
//     way as from the Finder (`onOpenProject`), read by ranges.

const path = require('node:path');
const os = require('node:os');
const { createOpenFiles } = require('./open-files');
const { createRecentProjects } = require('./recent-projects');

/**
 * @param {{ userData: () => string, addRecentDocument?: (p: string) => void, clearRecentDocuments?: () => void }} options
 */
function createProjects(options) {
  let recent = null;
  const recents = () => {
    recent = recent || createRecentProjects({ file: path.join(options.userData(), 'recent-projects.json'), home: os.homedir(), addRecentDocument: options.addRecentDocument });
    return recent;
  };
  const openFiles = createOpenFiles({ onAccepted: (entry, filePath) => void recents().add(filePath) });

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
  };
}

module.exports = { createProjects };
