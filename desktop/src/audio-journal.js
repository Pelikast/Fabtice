'use strict';

// The audio journal of the Mac app: the last 200 things that happened to the
// sound, with their time. The interface hands over its events (the audio
// context opened, put to sleep, closed, reopened, a recovery: see
// app/src/audio/journal.ts); the main process adds its own (the Mac goes to
// sleep and wakes up, the screen is locked, Chromium's audio service stopped:
// see power-events.js). It is kept in the user-data folder so that it is still
// there after a restart of the Mac, which is exactly when it is needed.
// Aide → Diagnostic… shows it, with « Copier le journal audio », and adds it to
// « Copier le diagnostic ».
//
// No personal data: one line of text per event, written by the app itself,
// home folder replaced by « ~ » all the same, at most 300 characters.

const path = require('node:path');

const JOURNAL_SIZE = 200;
const JOURNAL_FILE = 'audio-journal.json';
const TEXT_MAX = 300;
const EVENT_RE = /^[a-z][a-z-]{0,39}$/;
const SOURCES = new Set(['page', 'system', 'diagnostic']);
const SOURCE_LABEL = { page: 'interface', system: 'système', diagnostic: 'diagnostic' };

function cleanText(text) {
  if (typeof text !== 'string') return null;
  const one = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one.length ? one.slice(0, TEXT_MAX) : null;
}

/** « 2026-11-15 14:03:12.345 », local time (what the owner sees on his clock). */
function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * dir: the user-data folder; fsp: node:fs/promises (or a stand-in); redact: replaces the home folder;
 * now: the clock; saveDelayMs: writes are grouped (one file write per second at most).
 */
function createAudioJournal({ dir, fsp = require('node:fs/promises'), redact = (x) => x, now = () => new Date(), saveDelayMs = 1000 } = {}) {
  const entries = [];
  let lastPlay = null;
  let timer = null;
  let loaded = null;
  const file = dir ? path.join(dir, JOURNAL_FILE) : null;

  function push(entry) {
    entries.push(entry);
    if (entries.length > JOURNAL_SIZE) entries.splice(0, entries.length - JOURNAL_SIZE);
    scheduleSave();
  }

  function scheduleSave() {
    if (!file || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, saveDelayMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function save() {
    if (!file) return;
    try {
      await fsp.writeFile(file, JSON.stringify({ version: 1, entries, lastPlay }));
    } catch {
      // best effort: the journal stays in memory
    }
  }

  /**
   * Adds an event. Returns the entry, or null when refused (unknown source, malformed event name, no text).
   * `sticky`: the last playback that started, kept apart instead of added to the list.
   */
  function add(source, event, text, { sticky = false } = {}) {
    if (!SOURCES.has(source) || typeof event !== 'string' || !EVENT_RE.test(event)) return null;
    const clean = cleanText(redact(text));
    if (!clean) return null;
    const entry = { at: now().toISOString(), source, event, text: clean };
    if (sticky) {
      lastPlay = entry;
      scheduleSave();
    } else push(entry);
    return entry;
  }

  /** What a page hands over through the bridge: `{ event, text, sticky }`, validated here. */
  function addFromPage(source, payload) {
    if (!payload || typeof payload !== 'object') return null;
    return add(source, payload.event, payload.text, { sticky: payload.sticky === true });
  }

  /** Reads the journal of the previous runs (once); the entries added meanwhile come after them. */
  function load() {
    if (loaded) return loaded;
    loaded = (async () => {
      if (!file) return;
      try {
        const kept = JSON.parse(await fsp.readFile(file, 'utf8'));
        const old = [];
        for (const e of Array.isArray(kept && kept.entries) ? kept.entries : []) {
          const text = cleanText(e && e.text);
          if (e && typeof e.at === 'string' && SOURCES.has(e.source) && typeof e.event === 'string' && EVENT_RE.test(e.event) && text) old.push({ at: e.at, source: e.source, event: e.event, text });
        }
        entries.unshift(...old);
        if (entries.length > JOURNAL_SIZE) entries.splice(0, entries.length - JOURNAL_SIZE);
        const lp = kept && kept.lastPlay;
        if (!lastPlay && lp && typeof lp.at === 'string' && cleanText(lp.text)) lastPlay = { at: lp.at, source: 'page', event: 'play', text: cleanText(lp.text) };
      } catch {
        // no journal yet, or unreadable: start again
      }
    })();
    return loaded;
  }

  function text() {
    const lines = ['=== Fabtice — journal audio ===', `Copié le ${localTime(now().toISOString())}`];
    lines.push(lastPlay ? `Dernière lecture réussie : ${localTime(lastPlay.at)} — ${lastPlay.text}` : 'Dernière lecture réussie : aucune');
    lines.push(`${entries.length} événement(s), les plus anciens d’abord :`);
    for (const e of entries) lines.push(`${localTime(e.at)}  [${SOURCE_LABEL[e.source]}] ${e.text}`);
    return lines.join('\n');
  }

  /** Writes now (the app quits, the Mac shuts down). */
  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await save();
  }

  /**
   * The two bridge calls (desktop/src/preload.js): `fabtice:audio-journal-add` from the interface or the
   * diagnostic window (the source is told by the sender's address, never by the page), and
   * `fabtice:audio-journal`, the text for the diagnostic window. `handle` is main.js's checked ipcMain.handle.
   */
  function registerIpc(handle, { sourceOf }) {
    handle('fabtice:audio-journal-add', async (event, payload) => {
      const source = sourceOf(event.senderFrame.url);
      if (!source) throw new Error('unexpected sender');
      return addFromPage(source, payload) !== null;
    });
    handle('fabtice:audio-journal', async () => {
      await load();
      return { text: text(), count: entries.length };
    });
  }

  return { add, addFromPage, load, text, flush, registerIpc, entries: () => entries.slice(), lastPlay: () => lastPlay };
}

/** Who wrote an event, told by the sender's address: the interface, the diagnostic window, or nobody we know. */
function sourceFromUrl(rawUrl, { SCHEME, HOST_APP, HOST_DIAGNOSTIC }) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.port || url.username) return null;
  if (url.hostname === HOST_APP) return 'page';
  if (url.hostname === HOST_DIAGNOSTIC) return 'diagnostic';
  return null;
}

module.exports = { createAudioJournal, sourceFromUrl, JOURNAL_SIZE, JOURNAL_FILE, localTime };
