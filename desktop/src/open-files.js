'use strict';

// Project files (`.fab`, lot 4) opened from macOS: a double-click in the
// Finder, « Ouvrir avec », or a file dropped on the app's icon. macOS tells the
// app with `open-file` (before the window exists when it starts the app for
// it); the path stays here, and the page reads the file by ranges through the
// bridge (`readProjectFile`), never the whole file at once, never any other
// file: only a path macOS handed over, with the right extension, that is a
// regular file, by an unguessable token.
//
// The page asks for what is waiting when it starts (`takePending`), and is told
// of later ones as they come (`onOpen`).

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const EXTENSION = '.fab';
/** A `.fab` file stays under 4 GB (no ZIP64). */
const MAX_FILE_BYTES = 0xffffffff;
/** Largest range the page may read in one call. */
const MAX_READ_BYTES = 16 * 1024 * 1024;

/**
 * @param {{ fsp?: typeof fsp }} [deps]
 */
function createOpenFiles(deps = {}) {
  const files = deps.fsp || fsp;
  /** token -> { path, name, size } */
  const known = new Map();
  /** Entries not yet handed to the page. */
  let pending = [];
  /** @type {((entry: { token: string, name: string, size: number }) => void) | null} */
  let listener = null;

  /** A path macOS handed over: kept if it is a `.fab` regular file of a sane size. Resolves the entry or null. */
  async function accept(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== EXTENSION) return null;
    let st;
    try {
      st = await files.stat(filePath);
    } catch {
      return null;
    }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    const token = crypto.randomBytes(16).toString('hex');
    const entry = { token, name: path.basename(filePath), size: st.size };
    known.set(token, { path: filePath, name: entry.name, size: st.size });
    if (listener) listener(entry);
    else pending.push(entry);
    return entry;
  }

  /** What arrived before the page was listening; handed over once. */
  function takePending() {
    const out = pending;
    pending = [];
    return out;
  }

  /** The page is ready for more (its window loaded). Later files go straight to `fn`. */
  function onOpen(fn) {
    listener = fn;
  }

  /**
   * Bytes `offset` to `offset + length` of the file behind `token`.
   * @returns {Promise<Uint8Array>}
   */
  async function read(token, offset, length) {
    const entry = typeof token === 'string' ? known.get(token) : undefined;
    if (!entry) throw new Error('unknown file');
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > MAX_READ_BYTES) throw new Error('invalid range');
    const end = Math.min(entry.size, offset + length);
    if (offset > entry.size) throw new Error('invalid range');
    const out = new Uint8Array(end - offset);
    if (out.length === 0) return out;
    const handle = await files.open(entry.path, 'r');
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

  /** The page is done with it. */
  function release(token) {
    known.delete(token);
  }

  return { accept, takePending, onOpen, read, release };
}

/** `.fab` paths in a command line (a second launch, or a launch that names files). */
function projectPathsIn(argv) {
  return (Array.isArray(argv) ? argv : []).filter((a) => typeof a === 'string' && path.isAbsolute(a) && path.extname(a).toLowerCase() === EXTENSION);
}

module.exports = { createOpenFiles, projectPathsIn, EXTENSION, MAX_READ_BYTES, MAX_FILE_BYTES };
