'use strict';

// Folder exports (« Dossier pour Logic Pro… », and « Projet Ableton Live… »
// after it): a real folder of files, written by the main process. The page
// never names a path: it asks for a folder (the system's save panel, where the
// user types its name and chooses where it goes), then hands over each file by
// name and by chunks, then finishes or gives up.
//
// What may be written, whatever the page says:
//   - one NEW folder per export, at the path the user chose in the panel. If
//     something already has that name there, the folder is « name 2 »,
//     « name 3 »… beside it: nothing existing is ever replaced or entered;
//   - inside it only, plain files whose names are cleaned (`saveName`: no path,
//     no control character, no reserved sign) and checked to stay inside it;
//     a file is created once (`wx`), then only appended to, chunk by chunk, at
//     the offset the main process knows;
//   - on « abort » (the user cancelled, a failure on either side), the files
//     this export created are removed, then the folder if it is empty.
// The page learns the folder's name and where it is, with the home folder
// shown as « ~ » (never the full path).

const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const { saveName } = require('./downloads');

/** Largest chunk the page may hand over in one call. */
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
/** Files one export may create. */
const MAX_FILES = 200;
/** Largest file (no format of ours goes further). */
const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;
/** « name 2 » … « name 99 », then give up. */
const MAX_SUFFIX = 99;

class FolderError extends Error {
  /** @param {'cancelled'|'invalid'|'exists'|'failed'|'unknown-session'|'too-large'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'FolderError';
    this.code = code;
  }
}

/** The path for the page: the home folder as « ~ ». */
function shownPath(p, home = os.homedir()) {
  if (home && (p === home || p.startsWith(home + path.sep))) return `~${p.slice(home.length)}`;
  return p;
}

/**
 * @param {{
 *   fsp?: typeof fsp,
 *   home?: string,
 *   randomHex?: () => string,
 * }} [options]
 */
function createFolderWriter(options = {}) {
  const files = options.fsp || fsp;
  const home = options.home === undefined ? os.homedir() : options.home;
  const newId = options.randomHex || (() => crypto.randomBytes(12).toString('hex'));
  /** @type {Map<string, { dir: string, files: Map<string, number>, done: boolean }>} */
  const sessions = new Map();
  /** The folder of the last export finished (« Afficher dans le Finder »). */
  const finished = new Map();

  /**
   * Creates the folder. `pickPath(defaultName)` shows the system's panel and resolves the path the user chose,
   * or null when cancelled. Resolves `{ session, name, where }`.
   */
  async function begin({ suggestedName, pickPath }) {
    const wanted = saveName(typeof suggestedName === 'string' ? suggestedName : '');
    const picked = await pickPath(wanted);
    if (!picked) throw new FolderError('cancelled');
    if (typeof picked !== 'string' || !path.isAbsolute(picked)) throw new FolderError('invalid');
    const parent = path.dirname(picked);
    const base = saveName(path.basename(picked));
    let parentReal;
    try {
      parentReal = await files.realpath(parent);
      if (!(await files.stat(parentReal)).isDirectory()) throw new Error('not a folder');
    } catch (e) {
      throw new FolderError('failed', e && e.message);
    }
    for (let k = 1; k <= MAX_SUFFIX; k++) {
      const dir = path.join(parentReal, k === 1 ? base : `${base} ${k}`);
      try {
        // Not recursive: fails when anything is already there (a folder, a file, a link).
        await files.mkdir(dir);
      } catch (e) {
        if (e && e.code === 'EEXIST') continue;
        throw new FolderError('failed', e && e.message);
      }
      const id = newId();
      sessions.set(id, { dir, files: new Map(), done: false });
      return { session: id, name: path.basename(dir), where: shownPath(parentReal, home) };
    }
    throw new FolderError('exists');
  }

  function sessionOf(id) {
    const s = typeof id === 'string' ? sessions.get(id) : undefined;
    if (!s || s.done) throw new FolderError('unknown-session');
    return s;
  }

  /** The cleaned name, checked to stay inside the folder (a plain file directly in it). */
  function target(s, name) {
    if (typeof name !== 'string' || name.length === 0 || name.length > 255) throw new FolderError('invalid');
    const clean = saveName(name);
    if (clean !== name.trim() || clean === '.' || clean === '..') throw new FolderError('invalid', 'unsafe name');
    const full = path.join(s.dir, clean);
    if (path.dirname(full) !== s.dir) throw new FolderError('invalid', 'outside the folder');
    return { clean, full };
  }

  /**
   * Writes `bytes` at `offset` of file `name`: offset 0 creates it (never over an existing file), a later chunk
   * must come exactly where the last one ended.
   */
  async function write(id, name, offset, bytes) {
    const s = sessionOf(id);
    const { clean, full } = target(s, name);
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_CHUNK_BYTES) throw new FolderError('invalid', 'invalid chunk');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new FolderError('invalid', 'invalid offset');
    const known = s.files.get(clean);
    if (offset === 0 && known !== undefined) throw new FolderError('invalid', 'file written twice');
    if (offset > 0 && known !== offset) throw new FolderError('invalid', 'chunk out of order');
    if (offset === 0 && s.files.size >= MAX_FILES) throw new FolderError('too-large', 'too many files');
    if (offset + bytes.length > MAX_FILE_BYTES) throw new FolderError('too-large');
    let handle;
    try {
      handle = await files.open(full, offset === 0 ? 'wx' : 'r+', 0o644);
      if (offset === 0) s.files.set(clean, 0);
      let at = 0;
      while (at < bytes.length) {
        const { bytesWritten } = await handle.write(bytes, at, bytes.length - at, offset + at);
        if (bytesWritten === 0) throw new Error('no bytes written');
        at += bytesWritten;
      }
      s.files.set(clean, offset + bytes.length);
    } catch (e) {
      throw new FolderError('failed', e && e.message);
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
    return { size: offset + bytes.length };
  }

  /** The export is complete: the folder stays, its name and place are answered. */
  async function finish(id) {
    const s = sessionOf(id);
    s.done = true;
    sessions.delete(id);
    finished.set(id, s.dir);
    return { name: path.basename(s.dir), where: shownPath(path.dirname(s.dir), home), files: s.files.size };
  }

  /** Gives up: the files of this export go, then its folder if nothing else is in it. */
  async function abort(id) {
    const s = typeof id === 'string' ? sessions.get(id) : undefined;
    if (!s) return true;
    s.done = true;
    sessions.delete(id);
    for (const name of s.files.keys()) await files.rm(path.join(s.dir, name), { force: true }).catch(() => {});
    await files.rmdir(s.dir).catch(() => {});
    return true;
  }

  /** The folder of a finished export, for « Afficher dans le Finder »; null otherwise. */
  function folderOf(id) {
    return (typeof id === 'string' && finished.get(id)) || null;
  }

  return { begin, write, finish, abort, folderOf };
}

/**
 * The IPC of the folder exports. `dialog` and `shell` are read at call time, so that a test can stand in for the
 * system's panel and for the Finder.
 * @param {(channel: string, fn: Function) => void} handle main.js's checked `ipcMain.handle`
 * @param {{ dialog: any, shell: any, window: () => any, downloadsDir: () => string, writer?: ReturnType<typeof createFolderWriter> }} options
 */
function registerFolderIpc(handle, options) {
  const writer = options.writer || createFolderWriter();
  let lastParent = null;
  /** A failure as data the page can read (never an exception through IPC: the message may hold a path). */
  const answer = async (fn) => {
    try {
      return { ok: true, ...(await fn()) };
    } catch (e) {
      return { ok: false, reason: e instanceof FolderError ? e.code : 'failed' };
    }
  };
  const pickPath = async (name) => {
    const result = await options.dialog.showSaveDialog(options.window(), {
      title: 'Enregistrer le dossier',
      buttonLabel: 'Enregistrer',
      nameFieldLabel: 'Nom du dossier :',
      defaultPath: path.join(lastParent || options.downloadsDir(), name || 'Fabtice'),
      properties: ['createDirectory'],
    });
    if (result.canceled || !result.filePath) return null;
    lastParent = path.dirname(result.filePath);
    return result.filePath;
  };
  handle('fabtice:folder-begin', async (_e, request) => {
    const r = request && typeof request === 'object' ? request : {};
    return answer(() => writer.begin({ suggestedName: String(r.suggestedName || ''), pickPath }));
  });
  handle('fabtice:folder-write', async (_e, session, name, offset, bytes) => answer(() => writer.write(session, name, offset, bytes)));
  handle('fabtice:folder-finish', async (_e, session) => answer(() => writer.finish(session)));
  handle('fabtice:folder-abort', async (_e, session) => writer.abort(session));
  handle('fabtice:folder-reveal', async (_e, session) => {
    const dir = writer.folderOf(session);
    if (!dir) return false;
    options.shell.showItemInFolder(dir);
    return true;
  });
  return writer;
}

module.exports = { createFolderWriter, registerFolderIpc, FolderError, shownPath, MAX_CHUNK_BYTES, MAX_FILES };
