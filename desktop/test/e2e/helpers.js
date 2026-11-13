'use strict';

// Shared by the end-to-end tests: launch the app (source or packaged), find
// its windows by address, open the diagnostic window from the menu.

const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');

async function launchApp(env) {
  const clean = { ...process.env, ...env };
  delete clean.ELECTRON_RUN_AS_NODE;
  const extraArgs = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const options = process.env.FABTICE_E2E_APP
    ? { executablePath: process.env.FABTICE_E2E_APP, args: extraArgs, env: clean }
    : { executablePath: require('electron'), args: [ROOT, ...extraArgs], env: clean };
  return electron.launch({ ...options, timeout: 60000 });
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
