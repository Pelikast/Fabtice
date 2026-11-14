'use strict';

const path = require('node:path');
const os = require('node:os');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, net, clipboard, session, protocol, dialog, shell } = require('electron');
const { YtDlpManager } = require('./ytdlp-manager');
const { extractAudio } = require('./extract');
const { parseVideoId } = require('./video-id');
const { collectSystemInfo, jsRuntime } = require('./system-info');
const fabticeProtocol = require('./protocol');
const { buildMenu } = require('./menu');
const messages = require('./messages');
const { formatImportReport } = require('./report');
const { validateIRealLink } = require('./ireal-link');
const { installDownloads } = require('./downloads');

// The interface is built by app/ (npm run build:desktop) into desktop/ui/.
const UI_DIR = path.join(__dirname, '..', 'ui');
const DIAGNOSTIC_DIR = path.join(__dirname, 'renderer');

// Must happen before the app is ready.
fabticeProtocol.registerScheme(protocol);
const HOME = os.homedir();

let win = null;
let diagnosticWin = null;
let manager = null;
let systemInfo = null;
let updateCheck = null;
let extraction = null;

// Diagnostics are pasted into conversations: replace the home folder by "~".
function redact(value) {
  if (typeof value === 'string') return HOME && HOME.length > 1 ? value.split(HOME).join('~') : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v);
    return out;
  }
  return value;
}

// The report of the last import started from the interface, kept in memory and in the
// user-data folder (so that it survives a restart before the owner sends it).
let lastImport = null;
const LAST_IMPORT_FILE = 'last-import-report.json';

function rememberImport(entry) {
  lastImport = entry;
  fsp.writeFile(path.join(app.getPath('userData'), LAST_IMPORT_FILE), JSON.stringify(entry)).catch(() => {});
}

// The measurement report of the last real separation, as text, handed over by the interface
// (`app/src/separation/report.ts`: no personal data in it) and kept like the import report, so
// that it reaches the diagnostic report even after a restart.
let lastSeparation = null;
const LAST_SEPARATION_FILE = 'last-separation-report.json';
const SEPARATION_REPORT_MAX = 20000;

function rememberSeparation(text) {
  lastSeparation = { at: new Date().toISOString(), text };
  fsp.writeFile(path.join(app.getPath('userData'), LAST_SEPARATION_FILE), JSON.stringify(lastSeparation)).catch(() => {});
}

async function readLastSeparation() {
  try {
    const entry = JSON.parse(await fsp.readFile(path.join(app.getPath('userData'), LAST_SEPARATION_FILE), 'utf8'));
    return entry && typeof entry.at === 'string' && typeof entry.text === 'string' ? entry : null;
  } catch {
    return null;
  }
}

async function readLastImport() {
  try {
    const entry = JSON.parse(await fsp.readFile(path.join(app.getPath('userData'), LAST_IMPORT_FILE), 'utf8'));
    return entry && typeof entry === 'object' && typeof entry.at === 'string' ? entry : null;
  } catch {
    return null;
  }
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    // Top frame of one of our two pages only (custom scheme, exact origin).
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null || !fabticeProtocol.isTrustedUrl(frame.url)) throw new Error('unexpected IPC sender');
    return fn(event, ...args);
  });
}

// Progress events go to every open window; each page only listens if it asked.
function send(channel, payload) {
  for (const w of [win, diagnosticWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

async function removeStaleTempDirs() {
  try {
    const tmp = os.tmpdir();
    for (const name of await fsp.readdir(tmp)) {
      if (!name.startsWith('fabtice-')) continue;
      const full = path.join(tmp, name);
      const st = await fsp.stat(full).catch(() => null);
      if (st && st.isDirectory() && Date.now() - st.mtimeMs > 3600_000) await fsp.rm(full, { recursive: true, force: true });
    }
  } catch {
    // best effort
  }
}

// Test seam: FABTICE_E2E_QUERY (for example "?debug") is added to the interface
// address, only together with FABTICE_HOLD_WINDOW and only as plain parameters.
function testQuery() {
  const q = process.env.FABTICE_E2E_QUERY;
  return process.env.FABTICE_HOLD_WINDOW === '1' && q && /^\?[a-z0-9&=_-]+$/i.test(q) ? q : '';
}

const WEB_PREFERENCES = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
};

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Fabtice',
    backgroundColor: '#f4ecdf',
    show: false,
    webPreferences: WEB_PREFERENCES,
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
    if (diagnosticWin && !diagnosticWin.isDestroyed()) diagnosticWin.close();
  });
  win.loadURL(fabticeProtocol.APP_URL + testQuery());
}

// The phase 0 prototype page, kept to copy technical details on a machine
// where something fails. Same bridge, its own window.
function openDiagnostic() {
  if (diagnosticWin && !diagnosticWin.isDestroyed()) {
    if (diagnosticWin.isMinimized()) diagnosticWin.restore();
    diagnosticWin.focus();
    return diagnosticWin;
  }
  diagnosticWin = new BrowserWindow({
    width: 940,
    height: 860,
    minWidth: 640,
    minHeight: 560,
    title: 'Fabtice — Diagnostic',
    backgroundColor: '#f4ece0',
    show: false,
    webPreferences: WEB_PREFERENCES,
  });
  diagnosticWin.once('ready-to-show', () => diagnosticWin.show());
  diagnosticWin.on('closed', () => { diagnosticWin = null; });
  diagnosticWin.loadURL(fabticeProtocol.DIAGNOSTIC_URL);
  return diagnosticWin;
}

function registerIpc() {
  handle('fabtice:system', async () => redact(systemInfo ? await systemInfo : null));

  // Each yt-dlp answer carries the log of network attempts for the diagnostics.
  handle('fabtice:ytdlp-status', async () => redact({ ...(await manager.status()), attempts: manager.attemptLog() }));

  handle('fabtice:ytdlp-check', async (_e, force) => {
    if (force || !updateCheck) updateCheck = manager.checkForUpdate().catch((e) => ({ error: e.message }));
    return redact({ ...(await updateCheck), attempts: manager.attemptLog() });
  });

  handle('fabtice:ytdlp-install', async () => {
    try {
      const meta = await manager.install((p) => send('fabtice:ytdlp-progress', p));
      updateCheck = null;
      return redact({ ok: true, meta, attempts: manager.attemptLog() });
    } catch (e) {
      return redact({ ok: false, error: e.message, attempts: manager.attemptLog() });
    }
  });

  handle('fabtice:extract', async (event, text) => {
    // Only imports made from the interface are kept for « Copier le rapport du dernier import ».
    const fromInterface = event.senderFrame.url.startsWith(`${fabticeProtocol.SCHEME}://${fabticeProtocol.HOST_APP}/`);
    if (extraction) return { ok: false, error: messages.BUSY };
    const videoId = parseVideoId(text);
    if (!videoId) {
      return { ok: false, error: messages.LINK_NOT_RECOGNISED };
    }
    const ytdlpPath = await manager.executable();
    if (!ytdlpPath) return { ok: false, needsYtdlp: true, error: 'yt-dlp n’est pas encore installé.' };
    const controller = new AbortController();
    extraction = controller;
    try {
      const result = await extractAudio({
        ytdlpPath,
        videoId,
        jsRuntime: jsRuntime(),
        cacheDir: path.join(app.getPath('userData'), 'yt-dlp-cache'),
        signal: controller.signal,
        onProgress: (p) => send('fabtice:extract-progress', p),
      });
      const { audio, ...rest } = result;
      const safe = redact(rest);
      if (fromInterface) rememberImport({ at: new Date().toISOString(), ok: safe.ok, error: safe.error, refused: safe.refused, report: safe.report });
      return { ...safe, audio: audio ? new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength) : null };
    } catch (e) {
      if (fromInterface) rememberImport({ at: new Date().toISOString(), ok: false, error: redact(`Erreur interne : ${e.message}`), report: null });
      return { ok: false, error: `Erreur interne : ${e.message}` };
    } finally {
      extraction = null;
    }
  });

  // The diagnostic window's « Copier le rapport du dernier import »: timings and detail of the last
  // import made from the interface (home folder already replaced by « ~ »), as text.
  handle('fabtice:last-import-report', async () => {
    const entry = lastImport || (await readLastImport());
    if (!entry) return { available: false, text: 'Aucun import n’a encore été fait depuis l’interface.' };
    return { available: true, at: entry.at, text: formatImportReport(entry) };
  });

  // The interface hands over the report of each real separation; the diagnostic window shows it.
  handle('fabtice:separation-report', async (event, text) => {
    if (!event.senderFrame.url.startsWith(`${fabticeProtocol.SCHEME}://${fabticeProtocol.HOST_APP}/`)) throw new Error('unexpected sender');
    if (typeof text !== 'string' || text.length === 0 || text.length > SEPARATION_REPORT_MAX) throw new Error('invalid report');
    rememberSeparation(redact(text));
    return true;
  });

  handle('fabtice:last-separation-report', async () => {
    const entry = lastSeparation || (await readLastSeparation());
    if (!entry) return { available: false, text: 'Aucune séparation n’a encore été faite dans cette app.' };
    return { available: true, at: entry.at, text: entry.text };
  });

  // « Ouvrir dans iReal Pro »: an irealb:// link (and nothing else, see ireal-link.js) goes to the system, which
  // starts iReal Pro if it is installed. `shell.openExternal` is read at call time so a test can stand in for it.
  handle('fabtice:open-ireal', async (_e, link) => {
    const checked = validateIRealLink(link);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    try {
      await shell.openExternal(checked.url);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  });

  handle('fabtice:copy', async (_e, text) => {
    if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('invalid text');
    clipboard.writeText(text);
    return true;
  });
}

// Test seams (never set for a user):
//  - FABTICE_USER_DATA: throw-away user-data folder;
//  - FABTICE_STARTUP_TRACE=1: one line per start-up step on stderr, so a launch
//    that stalls shows how far it got in the test output;
//  - FABTICE_HOLD_WINDOW=1: do not open the first window until the test calls
//    globalThis.__fabticeOpenFirstWindow(). A debugger that attaches while a
//    window is loading can stall (Playwright waits for the page to settle and
//    never gets there), so the test attaches first and only then asks for it.
const TRACE = process.env.FABTICE_STARTUP_TRACE === '1';
function trace(message) {
  if (TRACE) process.stderr.write(`[fabtice] ${message}\n`);
}
process.on('unhandledRejection', (e) => trace(`unhandled rejection: ${e && e.stack ? e.stack : e}`));
process.on('uncaughtException', (e) => trace(`uncaught exception: ${e && e.stack ? e.stack : e}`));

if (process.env.FABTICE_USER_DATA) app.setPath('userData', process.env.FABTICE_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  trace('another instance holds the lock: quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  trace('single-instance lock obtained, waiting for ready');
  app.whenReady().then(() => {
    trace('ready');
    fabticeProtocol.installHandler(protocol, {
      [fabticeProtocol.HOST_APP]: UI_DIR,
      [fabticeProtocol.HOST_DIAGNOSTIC]: DIAGNOSTIC_DIR,
    });
    buildMenu({ openDiagnostic });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Files the interface exports (audio, iReal Pro chart): a clean name and a French save panel.
    installDownloads(session.defaultSession, { downloadsDir: () => app.getPath('downloads') });

    manager = new YtDlpManager({
      userDataDir: app.getPath('userData'),
      fetchImpl: (url, opts) => net.fetch(url, opts),
    });
    systemInfo = collectSystemInfo();
    updateCheck = manager.checkForUpdate().catch((e) => ({ error: e.message }));
    removeStaleTempDirs();
    registerIpc();
    trace('protocol, menu and IPC set up');
    const openFirstWindow = () => {
      if (fs.existsSync(path.join(UI_DIR, 'index.html'))) {
        createWindow();
      } else {
        // Build mistake: say so plainly and fall back on the diagnostic page.
        dialog.showErrorBox('Fabtice', 'L’interface est introuvable dans cette version de l’app. La fenêtre de diagnostic s’ouvre à la place.');
        openDiagnostic();
      }
      trace('first window created');
    };
    if (process.env.FABTICE_HOLD_WINDOW === '1') {
      globalThis.__fabticeOpenFirstWindow = openFirstWindow;
      trace('first window held for the test');
    } else {
      openFirstWindow();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && fs.existsSync(path.join(UI_DIR, 'index.html'))) createWindow();
    });
  }).catch((e) => {
    // A failure here would otherwise leave a running app with no window.
    trace(`start-up failed: ${e && e.stack ? e.stack : e}`);
    dialog.showErrorBox('Fabtice', `Fabtice n’a pas pu démarrer.\n\n${e && e.message ? e.message : e}`);
    app.exit(1);
  });

  app.on('before-quit', () => {
    if (extraction) extraction.abort();
  });

  app.on('window-all-closed', () => app.quit());
}
