'use strict';

// The right-click menu, end to end. Electron shows none by itself; the app gives
// every window one (desktop/src/context-menu.js). The native menu cannot be
// driven here, so `Menu.prototype.popup` is replaced in the main process: it
// records what would be shown and keeps the menu, and the test then presses an
// entry the way a click would (the entry's own handler). What is checked is the
// real chain: a right click in the page, the `context-menu` event, the entries
// for that place, and « Coller » really filling the link field.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface, openDiagnostic, assertClean } = require('./helpers');

const LINK = 'https://youtu.be/dQw4w9WgXcQ';

/** Replaces `popup` so that it records the menu; the menus shown so far are read with `shown`. */
async function recordMenus(app) {
  await app.evaluate(({ Menu }) => {
    globalThis.__menus = [];
    Menu.prototype.popup = function popup() {
      globalThis.__lastMenu = this;
      globalThis.__menus.push(this.items.map((i) => (i.type === 'separator' ? '-' : `${i.label}${i.enabled ? '' : ' (off)'}`)));
    };
  });
}
const shown = (app) => app.evaluate(() => globalThis.__menus);
const press = (app, label) =>
  app.evaluate((_electron, wanted) => {
    const item = globalThis.__lastMenu.items.find((i) => i.label === wanted);
    if (!item) throw new Error(`no entry « ${wanted} »`);
    item.click();
  }, label);

async function waitForMenus(app, count) {
  for (let i = 0; i < 100; i++) {
    if ((await shown(app)).length >= count) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no menu shown (${count} expected, ${(await shown(app)).length} seen)`);
}

test('a right click in the link field offers Couper, Copier, Coller, Tout sélectionner, and « Coller » pastes the link; on selected text only Copier; nowhere else, nothing', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-menu-'));
  const { app, page, problems } = await launchInterface({}, userData);
  try {
    await recordMenus(app);
    const field = page.locator('.accueil input[type="url"]');
    await field.waitFor({ state: 'visible', timeout: 30000 });

    // 1. Empty field, a link on the clipboard: Coller is the one to use; the app does not ask for the keyboard.
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), LINK);
    await field.click({ button: 'right' });
    await waitForMenus(app, 1);
    const first = (await shown(app))[0];
    assert.deepEqual(first.slice(0, 4), ['Couper (off)', 'Copier (off)', 'Coller', '-'], 'empty field: Couper and Copier are off, Coller is the one to use');
    assert.ok(first[4].startsWith('Tout sélectionner'));
    await press(app, 'Coller');
    await page.waitForFunction((link) => document.querySelector('.accueil input[type="url"]').value === link, LINK, { timeout: 5000 });
    assert.equal(await field.inputValue(), LINK, 'the link is in the field');

    // 2. With the link in it, nothing selected: Couper and Copier are off until something is selected.
    await field.click({ button: 'right' });
    await waitForMenus(app, 2);
    let menu = (await shown(app))[1];
    assert.deepEqual(menu.map((l) => l.replace(' (off)', '')), ['Couper', 'Copier', 'Coller', '-', 'Tout sélectionner']);
    await press(app, 'Tout sélectionner');
    await field.click({ button: 'right' });
    await waitForMenus(app, 3);
    menu = (await shown(app))[2];
    assert.deepEqual(menu, ['Couper', 'Copier', 'Coller', '-', 'Tout sélectionner'], 'with a selection: Couper and Copier are active too');
    await press(app, 'Couper');
    await page.waitForFunction(() => document.querySelector('.accueil input[type="url"]').value === '', null, { timeout: 5000 });
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), LINK, 'Couper put the link on the clipboard');

    // 3. Selected text that is not a field: Copier alone.
    await page.evaluate(() => {
      const heading = document.querySelector('.accueil h2');
      const range = document.createRange();
      range.selectNodeContents(heading);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.locator('.accueil h2').click({ button: 'right' });
    await waitForMenus(app, 4);
    assert.deepEqual((await shown(app))[3], ['Copier'], 'on selected text: Copier alone');

    // 4. Anywhere else: no menu.
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.locator('.accueil h2').click({ button: 'right' });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await shown(app)).length, 4, 'no menu on plain text without a selection');

    // The interface's window made no noise (the diagnostic window's WebGPU probe does, so it is checked before).
    await assertClean(page, problems, 'context menu');

    // 5. The diagnostic window has it too.
    const diagnostic = await openDiagnostic(app);
    await diagnostic.locator('#link').click({ button: 'right' });
    await waitForMenus(app, 5);
    assert.deepEqual((await shown(app))[4].map((l) => l.replace(' (off)', '')), ['Couper', 'Copier', 'Coller', '-', 'Tout sélectionner'], 'the diagnostic window: the same menu');
    await press(app, 'Coller');
    await diagnostic.waitForFunction((link) => document.querySelector('#link').value === link, LINK, { timeout: 5000 });
  } finally {
    await app.close();
  }
});
