'use strict';

// Shared by the end-to-end tests: launch the app (source or packaged), find
// its windows by address, open the diagnostic window from the menu.

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
async function launchApp(env) {
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
    await app.evaluate(() => globalThis.__fabticeOpenFirstWindow());
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

module.exports = { ROOT, launchApp, windowByUrl, openDiagnostic };
