'use strict';

// « Annuler » / « Rétablir » from the keyboard in the Mac app (C11): the
// application menu has Édition › Annuler and Rétablir (roles that act on text
// only), with the same shortcuts. The interface takes the shortcut itself
// outside a text field, so it reaches the piece with the menu in place; in a
// text field it is left to the field. (Here on Linux the shortcut is Ctrl; on
// a Mac, cmd.)
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface, pieceReady, assertClean } = require('./helpers');

const APP_FIXTURES = path.join(ROOT, '..', 'app', 'tests', 'fixtures');
const MUTE = '.piste-tete >> nth=0 >> button.muet';

test('Ctrl + Z and Ctrl + Maj + Z undo and redo a change of the piece, with the Edit menu in place', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-undo-'));
  const { app, page, problems } = await launchInterface({}, userData);
  try {
    await page.locator('.accueil input[type="file"]').setInputFiles(path.join(APP_FIXTURES, 'tone.wav'));
    await pieceReady(page);
    const roles = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.flatMap((m) => m.submenu?.items ?? []).map((i) => i.role).filter(Boolean));
    assert.ok(roles.includes('undo') && roles.includes('redo'), 'the Edit menu has its undo and redo entries');

    await page.click(MUTE);
    assert.equal(await page.getAttribute(MUTE, 'aria-pressed'), 'true');
    const label = await page.evaluate(() => window.__fabtice.history.undoLabel());
    assert.equal(label, 'Annuler : piste coupée');
    await page.keyboard.press('Control+z');
    await page.waitForFunction((sel) => document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'false', MUTE, { timeout: 5000 });
    await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    const st = await page.evaluate(() => window.__fabtice.history.historyStatus());
    assert.deepEqual([st.canUndo, st.canRedo, st.modified], [false, true, true], 'one step, undone; a new piece is modified (never saved to a file)');
    await assertClean(page, problems, 'undo');
  } finally {
    await app.close();
  }
});
