'use strict';

const path = require('node:path');
const os = require('node:os');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, net, clipboard, session, protocol, dialog, shell, powerMonitor } = require('electron');
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
const { installContextMenu } = require('./context-menu');
const printing = require('./printing');
const { electronFetch, fetchStandardsText } = require('./standards-fetch');
const { projectPathsIn } = require('./open-files');
const { createProjects } = require('./projects');
const { registerFolderIpc } = require('./folder-writer');
const { createCloseGuard } = require('./close-guard');
const { createAudioJournal, sourceFromUrl } = require('./audio-journal');
const { installPowerEvents } = require('./power-events');

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
/** The menu bar (menu.js), kept in step with the page's commands. */
let menuBar = null;
// Project files: macOS hands them over (double-click, « Ouvrir avec », recent documents), the recent list (projects.js).
const projects = createProjects({
  userData: () => app.getPath('userData'),
  addRecentDocument: (p) => app.addRecentDocument(p),
  clearRecentDocuments: () => app.clearRecentDocuments(),
  // « Enregistrer sous… »: the system's save panel, on the window; read at call time (a test stands in for it).
  dialog: { showSaveDialog: (w, o) => (w ? dialog.showSaveDialog(w, o) : dialog.showSaveDialog(o)) },
  window: () => win,
  downloadsDir: () => app.getPath('downloads'),
});
// Closing the window or quitting with changes not saved: the page is asked (close-guard.js).
// FABTICE_NO_CLOSE_GUARD=1 is a test seam (never set for a user): the end-to-end tests close apps holding pieces
// that were never saved, which would wait for an answer nobody gives.
const closeGuard = createCloseGuard();
const closeGuardOn = () => process.env.FABTICE_NO_CLOSE_GUARD !== '1';
/** The window and the app may go: the question was answered « yes » (or could not be asked). */
let leaveConfirmed = false;

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
  // The red button, cmd + W: the page is asked first whether the project has changes that were not saved.
  win.on('close', (event) => {
    if (leaveConfirmed || !closeGuardOn() || !win || win.isDestroyed()) return;
    event.preventDefault();
    askToLeave().then((ok) => {
      if (ok && win && !win.isDestroyed()) {
        leaveConfirmed = true;
        win.close();
      }
    });
  });
  win.on('closed', () => {
    win = null;
    if (menuBar) menuBar.reset();
    if (diagnosticWin && !diagnosticWin.isDestroyed()) diagnosticWin.close();
  });
  win.loadURL(fabticeProtocol.APP_URL + testQuery());
}

/** Brings the window forward (it may be hidden behind others, or minimised) and asks its page whether it may go. */
function askToLeave() {
  if (closeGuard.isAsking()) return Promise.resolve(false);
  const w = win;
  if (!w || w.isDestroyed()) return Promise.resolve(true);
  if (w.isMinimized()) w.restore();
  w.show();
  const contents = w.webContents;
  return closeGuard.ask({
    send: (channel, payload) => contents.send(channel, payload),
    // A page that crashes or is destroyed cannot answer: the window then closes.
    onGone: (listener) => {
      contents.once('destroyed', listener);
      contents.once('render-process-gone', listener);
      return () => {
        contents.removeListener('destroyed', listener);
        contents.removeListener('render-process-gone', listener);
      };
    },
  });
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

  // « Imprimer »: `window.print()` is no use in Electron (the page just stops answering), so the
  // interface, whose print dialog holds the sheets and nothing else when printed, asks for the printing here.
  // `print` and `printToPDF` are read at call time, like `dialog.showSaveDialog` (a test stands in for the system's panels).
  handle('fabtice:print-chart', async (event, options) => {
    const request = printing.parsePrintRequest(options);
    if (!request.ok) return { ok: false, reason: 'failed' };
    return printing.printPage(event.sender, request, app.getLocale());
  });

  // The printers the system lists, for the choice in the print dialog (a failure just means no choice there).
  handle('fabtice:list-printers', async (event) => printing.listPrinters(event.sender));

  handle('fabtice:save-chart-pdf', async (event, options) => {
    const request = printing.parsePrintRequest(options);
    if (!request.ok) return { ok: false, reason: 'failed' };
    return printing.savePagePdf({
      dialog,
      window: BrowserWindow.fromWebContents(event.sender),
      contents: event.sender,
      request,
      folder: app.getPath('downloads'),
      locale: app.getLocale(),
    });
  });

  // Chart collections of standards (app/src/standards/library.ts): the page cannot read another site, so
  // the main process does the GET, on a fixed list of hosts, with a size cap (standards-fetch.js).
  handle('fabtice:standards-fetch', async (event, url) => {
    if (!event.senderFrame.url.startsWith(`${fabticeProtocol.SCHEME}://${fabticeProtocol.HOST_APP}/`)) throw new Error('unexpected sender');
    return fetchStandardsText(url, { fetchImpl: electronFetch(net) });
  });

  // Lot 4: `.fab` project files: the Finder, the recent list, the page's picker (projects.js).
  projects.registerIpc(handle);

  // C15.4 « Dossier pour Logic Pro… »: a real folder, written here file by file (folder-writer.js).
  // `dialog.showSaveDialog` and `shell.showItemInFolder` are read at call time (a test stands in for them).
  registerFolderIpc(handle, {
    dialog,
    shell,
    window: () => win,
    downloadsDir: () => app.getPath('downloads'),
  });

  // C5: the page says which project is open and whether it has changes not saved: the dot in the close button,
  // the proxy icon of the file in the title bar. The title itself is the page's (`document.title`).
  handle('fabtice:project-state', async (event, state) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w !== win) return false;
    const s = state && typeof state === 'object' ? state : {};
    w.setDocumentEdited(s.modified === true);
    w.setRepresentedFilename((typeof s.projectId === 'string' && projects.pathFor(s.projectId)) || '');
    return true;
  });
  // C6: the page reports its commands (labels, greyed out or not); the menu bar follows (menu.js).
  handle('fabtice:menu-state', async (event, state) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w !== win || !menuBar) return false;
    return menuBar.update(state);
  });
  // « Quitter » in the page's menu Fabtice: as cmd + Q (the page is asked first, `before-quit`).
  handle('fabtice:quit', async (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w !== win) return false;
    setImmediate(() => app.quit());
    return true;
  });
  // The page answers the question « may this window go? » (close-guard.js).
  handle('fabtice:close-ack', async (_e, id) => closeGuard.ack(String(id)));
  handle('fabtice:close-answer', async (_e, id, ok) => closeGuard.answer(String(id), ok === true));

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
  // macOS starts the app for a project, or hands one to the running app: listened to before `ready`.
  const openProject = (filePath) => {
    void projects.open(filePath).then((entry) => {
      if (entry && win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
  };
  app.on('will-finish-launching', () => {
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      openProject(filePath);
    });
  });
  for (const p of projectPathsIn(process.argv.slice(1))) openProject(p);

  app.on('second-instance', (_event, argv) => {
    for (const p of projectPathsIn(argv)) openProject(p);
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
    // Electron shows no right-click menu by itself: the editing entries, in French, in every window.
    installContextMenu(contents);
  });

  trace('single-instance lock obtained, waiting for ready');
  app.whenReady().then(() => {
    trace('ready');
    fabticeProtocol.installHandler(protocol, {
      [fabticeProtocol.HOST_APP]: UI_DIR,
      [fabticeProtocol.HOST_DIAGNOSTIC]: DIAGNOSTIC_DIR,
    });
    menuBar = buildMenu({ openDiagnostic, window: () => win });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Files the interface exports (audio, iReal Pro chart): a clean name and a French save panel.
    installDownloads(session.defaultSession, { downloadsDir: () => app.getPath('downloads'), onSaved: projects.saved });

    manager = new YtDlpManager({
      userDataDir: app.getPath('userData'),
      fetchImpl: (url, opts) => net.fetch(url, opts),
    });
    systemInfo = collectSystemInfo();
    updateCheck = manager.checkForUpdate().catch((e) => ({ error: e.message }));
    removeStaleTempDirs();
    // A save that died (power cut, kill) may have left its temporary file next to a project.
    void projects.cleanStale().catch(() => {});
    registerIpc();
    // The audio journal (Aide → Diagnostic…) and the Mac's sleeps and wakes, forwarded to the pages, which
    // then give the audio output back to the system: see audio-journal.js and power-events.js.
    const audioJournal = createAudioJournal({ dir: app.getPath('userData'), redact });
    void audioJournal.load();
    audioJournal.registerIpc(handle, { sourceOf: (url) => sourceFromUrl(url, fabticeProtocol) });
    installPowerEvents({ powerMonitor, app, journal: audioJournal, send: (payload) => send('fabtice:power', payload) });
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

  // cmd + Q, « Quitter »: the page is asked first (the red button goes through the window's `close` event).
  app.on('before-quit', (event) => {
    if (!leaveConfirmed && closeGuardOn() && win && !win.isDestroyed()) {
      event.preventDefault();
      void askToLeave().then((ok) => {
        if (!ok) return;
        leaveConfirmed = true;
        app.quit();
      });
      return;
    }
    if (extraction) extraction.abort();
  });

  app.on('window-all-closed', () => app.quit());
}
