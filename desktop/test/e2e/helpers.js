'use strict';

// Shared by the end-to-end tests: launch the app (source or packaged), find
// its windows by address, open the diagnostic window from the menu.

const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');

// Launches the app and returns it with its first window opening.
//
// The app is started with its first window held (FABTICE_HOLD_WINDOW): when
// Playwright attaches to a packaged app (no loader holding back "ready") while
// a window is mid-load, its launch can wait forever for that page to settle.
// Measured on Linux with the packaged app: 5 launch timeouts in 15 full runs
// before this, none after. So the test attaches first, then asks for the window.
// FABTICE_STARTUP_TRACE makes the app print its start-up steps on stderr, which
// Playwright copies into the error of a failed launch.
async function launchApp(env, { initScript } = {}) {
  const clean = { ...process.env, FABTICE_HOLD_WINDOW: '1', FABTICE_STARTUP_TRACE: '1', ...env };
  delete clean.ELECTRON_RUN_AS_NODE;
  const extraArgs = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const options = process.env.FABTICE_E2E_APP
    ? { executablePath: process.env.FABTICE_E2E_APP, args: extraArgs, env: clean }
    : { executablePath: require('electron'), args: [ROOT, ...extraArgs], env: clean };
  const app = await electron.launch({ ...options, timeout: 60000 });
  const stderr = [];
  app.process().stderr.on('data', (d) => stderr.push(String(d)));
  try {
    const deadline = Date.now() + 30000;
    for (;;) {
      const held = await app.evaluate(() => typeof globalThis.__fabticeOpenFirstWindow === 'function');
      if (held) break;
      if (Date.now() > deadline) throw new Error('the app never reached the point where it holds its first window');
      await new Promise((r) => setTimeout(r, 100));
    }
    if (initScript) await app.context().addInitScript(initScript);
    await app.evaluate(() => globalThis.__fabticeOpenFirstWindow());
    // Let the first window exist before the test does anything else with the
    // main process (creating a second window while it is still opening made
    // app.evaluate calls fail with "Resulting promise was garbage collected").
    await app.firstWindow({ timeout: 30000 });
  } catch (error) {
    const trace = stderr.join('').split('\n').filter((l) => l.startsWith('[fabtice]')).join('\n');
    await app.close().catch(() => {});
    throw new Error(`${error.message}\napp start-up trace:\n${trace || '(none)'}`);
  }
  return app;
}

async function windowByUrl(app, prefix, timeout = 60000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const page = app.windows().find((w) => w.url().startsWith(prefix));
    if (page) return page;
    if (Date.now() > deadline) throw new Error(`no window at ${prefix}; have ${app.windows().map((w) => w.url()).join(', ')}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Opens "Aide > Diagnostic…" through the real application menu.
async function openDiagnostic(app) {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().getMenuItemById('diagnostic');
    if (!item) throw new Error('menu item "diagnostic" missing');
    item.click();
  });
  const page = await windowByUrl(app, 'fabtice://diagnostic/');
  page.on('console', (msg) => console.log(`[diagnostic ${msg.type()}] ${msg.text()}`));
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 });
  return page;
}


const FIXTURES = path.join(ROOT, 'test', 'fixtures');

// ---------------------------------------------------------------- the interface

// Runs in the page before anything else: policy violations and the texts the
// import dialog goes through (`__seen`: the sentence of the step, `__seenFull`:
// the step line with its figure, each only when it changes).
function pageProbe() {
  window.__csp = [];
  window.__seen = [];
  window.__seenFull = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  new MutationObserver(() => {
    const el = document.querySelector('.import-etat .phase span');
    const text = el && el.textContent;
    if (text && window.__seen[window.__seen.length - 1] !== text) window.__seen.push(text);
    const line = document.querySelector('.import-etat .phase');
    const full = line && line.textContent;
    if (full && window.__seenFull[window.__seenFull.length - 1] !== full) window.__seenFull.push(full);
  }).observe(document, { childList: true, subtree: true, characterData: true });
}

// Launches the app on the interface (`?debug`: the store is reachable as
// `window.__fabtice`) and returns it with its first page and the console problems.
async function launchInterface(env, userData) {
  const problems = [];
  const app = await launchApp(
    { FABTICE_USER_DATA: userData, FABTICE_E2E_QUERY: '?debug', FABTICE_STUB_FIXTURES: FIXTURES, ...env },
    { initScript: pageProbe },
  );
  app.context().on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${msg.type()}] ${msg.text()}`);
  });
  const page = await windowByUrl(app, 'fabtice://app/');
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.waitForSelector('.voile', { state: 'attached', timeout: 60000 });
  return { app, page, problems };
}

const state = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    return { project: s.project, engine: s.transport.engine, loop: s.loop, playback: s.playback, importKind: s.ui.import.kind, dialog: s.ui.newPieceOpen };
  });

async function pieceReady(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && (s.transport.engine === 'ready' || s.transport.engine === 'playing') && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
  }, null, { timeout });
}

async function assertClean(page, problems, label) {
  const csp = await page.evaluate(() => window.__csp);
  assert.deepEqual(csp, [], `${label}: CSP violations`);
  assert.deepEqual(problems, [], `${label}: console errors or warnings`);
}

const clock = (page) => page.locator('[data-testid="temps"]').innerText();

// What the device holds, read straight from IndexedDB (null when nothing).
// `audioBytes` is the size of the stored audio file(s), 0 when none.
const storedDocument = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('project')) return resolve(null);
          const get = db.transaction('project').objectStore('project').get('current');
          get.onsuccess = () => {
            db.close();
            resolve(get.result && get.result.document ? get.result.document : null);
          };
          get.onerror = () => resolve(null);
        };
      }),
  );

const storedAudioBytes = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice');
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('audio')) return resolve(0);
          const all = db.transaction('audio').objectStore('audio').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result.reduce((n, a) => n + (a.bytes ? a.bytes.byteLength : 0), 0));
          };
          all.onerror = () => resolve(0);
        };
      }),
  );

// A WAV of real size, made here (no binary fixture): `seconds` of a slowly
// changing chord in 16-bit stereo, so that it is neither silent nor trivially
// compressible. 44.1 kHz stereo is about 176 kB per second.
function makeWavFile(file, { seconds = 35, rate = 44100 } = {}) {
  const fs = require('node:fs');
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 4);
  let seed = 12345;
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff - 0.5) * 0.02;
    const env = 0.5 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t);
    const l = env * (0.4 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 277.18 * t)) + noise;
    const r = env * (0.4 * Math.sin(2 * Math.PI * 329.63 * t) + 0.3 * Math.sin(2 * Math.PI * 440 * t)) + noise;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return { bytes: head.length + data.length, seconds };
}

module.exports = {
  ROOT,
  FIXTURES,
  launchApp,
  windowByUrl,
  openDiagnostic,
  pageProbe,
  launchInterface,
  state,
  pieceReady,
  assertClean,
  clock,
  storedDocument,
  storedAudioBytes,
  makeWavFile,
};
