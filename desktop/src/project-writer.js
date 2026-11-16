'use strict';

// « Enregistrer » and « Enregistrer sous… » in the Mac app (C5): the main process
// owns the file of the open project and writes it safely. The page never names a
// path: it asks, by the project's id, to write « the project's file » or « a file
// the user will choose in the system's save panel », and hands the bytes over by
// chunks; the file it may READ BACK (to copy the sounds already encoded in it) is
// that same file.
//
// Safe writing, always the same way:
//   1. a temporary file is made next to the target, `<name>.fab.tmp-<16 hex>`
//      (the same folder, so that the final step is a rename within one volume);
//   2. the chunks are appended to it as they come;
//   3. at the end it is flushed to the disk (`fsync`), closed, then renamed over
//      the target (atomic: the target is the old file or the new one, never a mix),
//      and the folder is flushed too;
//   4. on any failure, or if the page abandons the save, the temporary file is
//      removed and the target is not touched. A temporary file left by a crash is
//      removed at the next start (`cleanStale`).
//
// Which file may be written (nothing else, whatever the page says):
//   - the file of the open project, known here because it was opened (from the
//     Finder, the recent list, the page's file picker: `adopt`), or saved with
//     « Enregistrer sous… », or remembered from a former launch (`recall`);
//   - a path the user chose in the system's save panel (`dialog`), always with the
//     extension `.fab`.

const path = require('node:path');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');

const EXTENSION = '.fab';
/** Largest chunk the page may hand over in one call. */
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
/** Largest range of the current file the page may read in one call. */
const MAX_READ_BYTES = 16 * 1024 * 1024;
/** A `.fab` file stays under 4 GB (no ZIP64). */
const MAX_FILE_BYTES = 0xffffffff;
/** Files remembered by project id (one line each in the user-data folder). */
const MAX_REMEMBERED = 100;
/** A temporary file this old, in a folder we know, belongs to a save that died. */
const STALE_MS = 60_000;
const TEMP_PATTERN = /\.fab\.tmp-[0-9a-f]{16}$/;

/** A calm failure the page can turn into a sentence. */
class WriterError extends Error {
  /** @param {'no-file'|'cancelled'|'invalid'|'failed'|'unknown-session'|'too-large'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'WriterError';
    this.code = code;
  }
}

/** The path with `.fab` at its end (the save panel normally adds it; this makes sure). */
function withExtension(filePath) {
  return path.extname(filePath).toLowerCase() === EXTENSION ? filePath : `${filePath}${EXTENSION}`;
}

/**
 * @param {{
 *   file: string,
 *   fsp?: typeof fsp,
 *   now?: () => number,
 *   randomHex?: () => string,
 *   onSaved?: (filePath: string) => void,
 * }} options `file`: where the project -> path memory is kept (user-data folder).
 */
function createProjectWriter(options) {
  const files = options.fsp || fsp;
  const now = options.now || Date.now;
  const randomHex = options.randomHex || (() => crypto.randomBytes(8).toString('hex'));

  /** @type {{ projectId: string, path: string } | null} */
  let current = null;
  /** @type {Map<string, string> | null} projectId -> path, most recent last. */
  let remembered = null;
  /** @type {{ id: string, projectId: string, target: string, temp: string, handle: import('node:fs/promises').FileHandle, written: number } | null} */
  let session = null;

  // ------------------------------------------------------------ the project -> file memory

  async function load() {
    if (remembered) return remembered;
    remembered = new Map();
    try {
      const raw = JSON.parse(await files.readFile(options.file, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id, p] of Object.entries(raw)) if (typeof p === 'string' && path.isAbsolute(p)) remembered.set(id, p);
      }
    } catch {
      // nothing remembered yet, or unreadable: start empty
    }
    return remembered;
  }

  async function persist() {
    try {
      await files.mkdir(path.dirname(options.file), { recursive: true });
      await files.writeFile(options.file, JSON.stringify(Object.fromEntries(remembered)));
    } catch {
      // the memory is a convenience
    }
  }

  async function remember(projectId, filePath) {
    const map = await load();
    map.delete(projectId);
    map.set(projectId, filePath);
    while (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value);
    await persist();
  }

  // ------------------------------------------------------------ what a path may be

  /** The size of a `.fab` regular file of a sane size, or null. */
  async function projectSize(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== EXTENSION) return null;
    try {
      const st = await files.stat(filePath);
      return st.isFile() && st.size <= MAX_FILE_BYTES ? st.size : null;
    } catch {
      return null;
    }
  }

  const validId = (projectId) => typeof projectId === 'string' && projectId.length > 0 && projectId.length <= 200;

  function currentFor(projectId) {
    return current && current.projectId === projectId ? current : null;
  }

  // ------------------------------------------------------------ the file of the open project

  /**
   * The project now has this file (opened, or saved): it is the one « Enregistrer » overwrites. Resolves its
   * name, or null when the path is not a `.fab` file that exists.
   */
  async function adopt(projectId, filePath) {
    if (!validId(projectId) || (await projectSize(filePath)) === null) return null;
    current = { projectId, path: filePath };
    await remember(projectId, filePath);
    return { name: path.basename(filePath) };
  }

  /** The page restored a piece from its own autosave: its file of a former launch, if it is still there. */
  async function recall(projectId) {
    if (!validId(projectId)) return null;
    // Already has a file (just opened or saved): that one stands.
    if (current && current.projectId === projectId && (await projectSize(current.path)) !== null) return { name: path.basename(current.path) };
    const known = (await load()).get(projectId);
    if (!known || (await projectSize(known)) === null) return null;
    current = { projectId, path: known };
    return { name: path.basename(known) };
  }

  /** The open project has no file any more (a new project replaced it). */
  function forget() {
    current = null;
  }

  /** The path of the file of `projectId` (window title, « Reveal »), or null. */
  function pathFor(projectId) {
    const c = currentFor(projectId);
    return c ? c.path : null;
  }

  /** Name and size of the file of `projectId`, as it is on the disk now, or null. */
  async function info(projectId) {
    const c = validId(projectId) ? currentFor(projectId) : null;
    if (!c) return null;
    const size = await projectSize(c.path);
    return size === null ? null : { name: path.basename(c.path), size };
  }

  /** Bytes `offset` to `offset + length` of the file of `projectId` (the page copies the sounds already in it). */
  async function read(projectId, offset, length) {
    const c = validId(projectId) ? currentFor(projectId) : null;
    if (!c) throw new WriterError('no-file');
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > MAX_READ_BYTES) throw new WriterError('invalid', 'invalid range');
    const size = await projectSize(c.path);
    if (size === null) throw new WriterError('no-file');
    const end = Math.min(size, offset + length);
    if (offset > size) throw new WriterError('invalid', 'invalid range');
    const out = new Uint8Array(end - offset);
    if (out.length === 0) return out;
    const handle = await files.open(c.path, 'r');
    try {
      let at = 0;
      while (at < out.length) {
        const { bytesRead } = await handle.read(out, at, out.length - at, offset + at);
        if (bytesRead === 0) break;
        at += bytesRead;
      }
      return at === out.length ? out : out.subarray(0, at);
    } finally {
      await handle.close();
    }
  }

  // ------------------------------------------------------------ writing

  async function discard(s) {
    if (!s) return;
    if (session === s) session = null;
    try {
      await s.handle.close();
    } catch {
      // already closed
    }
    await files.rm(s.temp, { force: true }).catch(() => {});
  }

  /** Empties the temporary file of the save in progress: the page starts it again (an entry it copied did not read back). */
  async function restart(sessionId) {
    const s = session;
    if (!s || s.id !== sessionId) throw new WriterError('unknown-session');
    try {
      await s.handle.truncate(0);
      s.written = 0;
    } catch (e) {
      await discard(s);
      throw new WriterError('failed', e && e.message);
    }
  }

  /**
   * Starts a save. `target` is `'current'` (the file of the project) or `'choose'` (the system's save panel,
   * through `pickPath(defaultName)`, which resolves a path or null when the user cancelled).
   * Resolves `{ session, name }`; rejects with a `WriterError` (`no-file`, `cancelled`, `failed`).
   */
  async function begin({ projectId, target, suggestedName, pickPath }) {
    if (!validId(projectId)) throw new WriterError('invalid');
    await discard(session);
    let targetPath;
    if (target === 'current') {
      const c = currentFor(projectId);
      if (!c || (await projectSize(c.path)) === null) throw new WriterError('no-file');
      targetPath = c.path;
    } else if (target === 'choose') {
      const picked = await pickPath(typeof suggestedName === 'string' ? suggestedName : '');
      if (!picked) throw new WriterError('cancelled');
      if (typeof picked !== 'string' || !path.isAbsolute(picked)) throw new WriterError('invalid');
      targetPath = withExtension(picked);
    } else {
      throw new WriterError('invalid');
    }
    // A link is followed: the new file replaces what the link points to, the link stays.
    try {
      targetPath = await files.realpath(targetPath);
    } catch {
      // not there yet: a new file
    }
    const temp = `${targetPath}.tmp-${randomHex()}`;
    let handle;
    try {
      handle = await files.open(temp, 'wx', 0o644);
      // The file keeps its permissions when it is replaced.
      try {
        const st = await files.stat(targetPath);
        await handle.chmod(st.mode & 0o7777);
      } catch {
        // a new file: the default
      }
    } catch (e) {
      throw new WriterError('failed', e && e.message);
    }
    session = { id: crypto.randomBytes(12).toString('hex'), projectId, target: targetPath, temp, handle, written: 0 };
    return { session: session.id, name: path.basename(targetPath) };
  }

  /** Appends a chunk to the temporary file. A failure removes it and ends the save. */
  async function write(sessionId, bytes) {
    const s = session;
    if (!s || s.id !== sessionId) throw new WriterError('unknown-session');
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_CHUNK_BYTES) {
      await discard(s);
      throw new WriterError('invalid', 'invalid chunk');
    }
    if (s.written + bytes.length > MAX_FILE_BYTES) {
      await discard(s);
      throw new WriterError('too-large');
    }
    try {
      let at = 0;
      while (at < bytes.length) {
        const { bytesWritten } = await s.handle.write(bytes, at, bytes.length - at, s.written + at);
        if (bytesWritten === 0) throw new Error('no bytes written');
        at += bytesWritten;
      }
      s.written += bytes.length;
    } catch (e) {
      await discard(s);
      throw new WriterError('failed', e && e.message);
    }
  }

  /** Flushes, closes and renames the temporary file over the target; the project's file is now the target. */
  async function finish(sessionId) {
    const s = session;
    if (!s || s.id !== sessionId) throw new WriterError('unknown-session');
    try {
      await s.handle.sync();
      await s.handle.close();
      await files.rename(s.temp, s.target);
    } catch (e) {
      await discard(s);
      throw new WriterError('failed', e && e.message);
    }
    session = null;
    // The rename is only durable once the folder entry is: best effort (not every system lets a folder be synced).
    try {
      const dir = await files.open(path.dirname(s.target), 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch {
      // fine
    }
    current = { projectId: s.projectId, path: s.target };
    await remember(s.projectId, s.target);
    if (options.onSaved) options.onSaved(s.target);
    await cleanStale([path.dirname(s.target)]);
    return { name: path.basename(s.target), size: s.written };
  }

  /** The page gives up (the user cancelled, an error on its side): the temporary file goes, the target stays. */
  async function abort(sessionId) {
    const s = session;
    if (s && s.id === sessionId) await discard(s);
    return true;
  }

  /**
   * Removes the temporary files a save that died left in `dirs` (older than a minute, never the one being written).
   * @param {string[]} dirs
   */
  async function cleanStale(dirs) {
    for (const dir of new Set(dirs)) {
      let names;
      try {
        names = await files.readdir(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!TEMP_PATTERN.test(name)) continue;
        const full = path.join(dir, name);
        // By name (16 random hex digits): the folder may be reached through a link, the session keeps its real path.
        if (session && path.basename(session.temp) === name) continue;
        try {
          const st = await files.stat(full);
          if (st.isFile() && now() - st.mtimeMs > STALE_MS) await files.rm(full, { force: true });
        } catch {
          // gone already
        }
      }
    }
  }

  /** Folders of the files this app knows (recent list, memory): where a dead save may have left a temporary file. */
  async function knownFolders(extra = []) {
    return [...extra, ...[...(await load()).values()].map((p) => path.dirname(p))];
  }

  return { adopt, recall, forget, pathFor, info, read, begin, write, restart, finish, abort, cleanStale, knownFolders };
}

module.exports = { createProjectWriter, WriterError, withExtension, EXTENSION, MAX_CHUNK_BYTES, MAX_READ_BYTES, TEMP_PATTERN };
