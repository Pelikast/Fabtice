'use strict';

// Files the interface hands over (« Exporter le son », « Grille pour iReal Pro »):
// the page makes a link with a `download` name, the click becomes an Electron
// download, and Electron asks where to save it with the system's save panel.
// What this file adds, so that the panel is what a user expects on a Mac:
//   - the name is cleaned (no path, no control character, no reserved sign) and
//     kept otherwise as it is, accents and « – » included;
//   - the panel is titled in French and starts in the Downloads folder, or in
//     the folder the last file went to during this session.
// Nothing is saved without the user's say-so: a download with no save path set
// shows the panel. A test (or anything else) that sets the save path itself,
// as the end-to-end tests do from the main process, skips it.

const path = require('node:path');

const FALLBACK_NAME = 'Fabtice';
const MAX_NAME = 180;

/**
 * A file name every system accepts, from whatever the page asked for.
 * @param {unknown} name
 * @returns {string}
 */
function saveName(name) {
  const base = String(name == null ? '' : name).split(/[\\/]/).pop() || '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (!cleaned) return FALLBACK_NAME;
  if (cleaned.length <= MAX_NAME) return cleaned;
  // Too long: shorten the stem, keep the extension.
  const ext = path.extname(cleaned).slice(0, 12);
  return cleaned.slice(0, MAX_NAME - ext.length).trim() + ext;
}

/**
 * The options of the save panel for a download.
 * @param {string} filename name given by the page
 * @param {string} folder where the panel starts
 */
function saveDialogOptions(filename, folder) {
  return {
    title: 'Enregistrer le fichier',
    buttonLabel: 'Enregistrer',
    defaultPath: path.join(folder, saveName(filename)),
  };
}

/**
 * @param {import('electron').Session} electronSession
 * @param {{ downloadsDir: () => string }} options
 */
function installDownloads(electronSession, { downloadsDir }) {
  let lastFolder = null;
  electronSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions(saveDialogOptions(item.getFilename(), lastFolder || downloadsDir()));
    item.once('done', (_e, state) => {
      if (state !== 'completed') return;
      const saved = item.getSavePath();
      if (saved) lastFolder = path.dirname(saved);
    });
  });
}

module.exports = { saveName, saveDialogOptions, installDownloads, FALLBACK_NAME, MAX_NAME };
