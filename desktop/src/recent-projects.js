'use strict';

// « Projets récents » (owner's decision of 15 November): the main process
// remembers the last `.fab` files opened or saved, most recent first, a short
// list kept in the user-data folder. Files that no longer exist are dropped
// when the list is read. Each one is also handed to macOS
// (`app.addRecentDocument`), which shows it in « Fichier > Ouvrir un projet
// récent » and in the Dock; choosing it there comes back as `open-file`.
//
// The page sees names and folders (the home folder written « ~ »), and opens
// one by a token valid for this listing only: it never names a path itself.

const path = require('node:path');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');

const MAX_RECENT = 8;
const EXTENSION = '.fab';

/**
 * @param {{ file: string, home?: string, fsp?: typeof fsp, addRecentDocument?: (p: string) => void, max?: number }} options
 */
function createRecentProjects(options) {
  const files = options.fsp || fsp;
  const max = options.max || MAX_RECENT;
  const home = options.home || '';
  /** token -> path, for the last listing. */
  let tokens = new Map();
  let cache = null;

  async function load() {
    if (cache) return cache;
    try {
      const raw = JSON.parse(await files.readFile(options.file, 'utf8'));
      cache = Array.isArray(raw) ? raw.filter((e) => e && typeof e.path === 'string' && typeof e.at === 'string') : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  async function save(list) {
    cache = list;
    try {
      await files.mkdir(path.dirname(options.file), { recursive: true });
      await files.writeFile(options.file, JSON.stringify(list));
    } catch {
      // not kept: the list is a convenience
    }
  }

  const usable = (p) => typeof p === 'string' && path.isAbsolute(p) && path.extname(p).toLowerCase() === EXTENSION;

  /** A project was opened or saved: it goes first. */
  async function add(filePath, now = new Date()) {
    if (!usable(filePath)) return;
    const list = (await load()).filter((e) => e.path !== filePath);
    list.unshift({ path: filePath, at: now.toISOString() });
    await save(list.slice(0, max));
    try {
      if (options.addRecentDocument) options.addRecentDocument(filePath);
    } catch {
      // the system's list is a convenience too
    }
  }

  /** The list as the page shows it; files gone are dropped. */
  async function list() {
    const kept = [];
    for (const e of await load()) {
      try {
        const st = await files.stat(e.path);
        if (st.isFile()) kept.push(e);
      } catch {
        // gone: dropped
      }
    }
    if (kept.length !== (cache || []).length) await save(kept);
    tokens = new Map();
    return kept.map((e) => {
      const token = crypto.randomBytes(12).toString('hex');
      tokens.set(token, e.path);
      const folder = path.dirname(e.path);
      return {
        token,
        name: path.basename(e.path),
        folder: home && (folder === home || folder.startsWith(home + path.sep)) ? `~${folder.slice(home.length)}` : folder,
        at: e.at,
      };
    });
  }

  /** The path behind a token of the last listing, or null. */
  function pathFor(token) {
    return typeof token === 'string' ? tokens.get(token) || null : null;
  }

  async function clear() {
    await save([]);
    tokens = new Map();
  }

  return { add, list, pathFor, clear };
}

module.exports = { createRecentProjects, MAX_RECENT };
