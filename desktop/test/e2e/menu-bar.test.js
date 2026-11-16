'use strict';

// The menu bar of the Mac app (C6) and the « saved or modified » state of a
// piece reopened at launch (C5):
//   1. the bar holds the page's commands at their places; an entry greyed out
//      in the app is greyed out in the bar (and the labels of Annuler /
//      Rétablir follow); a click in the bar runs the command in the page;
//      Édition → Annuler undoes the piece outside a text field and the typing
//      inside one; a shortcut is never run twice (one press: one step undone,
//      one save); « Quitter » of the page's menu goes through the close guard;
//   2. saved, relaunched: « not modified », the same file; a change, cmd + S
//      overwrites that file; relaunched without a change: still « not
//      modified »; the file gone: « modified », no file.
// (Here on Linux the shortcut is Ctrl; on a Mac, cmd: `ControlOrMeta`.)
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface, pieceReady, assertClean, menuCommand, makeWavFile } = require('./helpers');

const APP_FIXTURES = path.join(ROOT, '..', 'app', 'tests', 'fixtures');
const MUTE = '.piste-tete >> nth=0 >> button.muet';
const UTF8 = { LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** An entry of the bar, as macOS would show it. */
const barItem = (app, id) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu().getMenuItemById(itemId);
    return item ? { label: item.label, enabled: item.enabled, accelerator: item.accelerator || null } : null;
  }, id);

/** Clicks an entry of the bar (`accelerator`: as if its shortcut had done it). */
const clickBar = (app, id, accelerator = false) =>
  app.evaluate(({ Menu, BrowserWindow }, [itemId, acc]) => {
    const item = Menu.getApplicationMenu().getMenuItemById(itemId);
    item.click({ triggeredByAccelerator: acc }, BrowserWindow.getAllWindows()[0]);
  }, [id, accelerator]);

async function waitBar(app, id, want, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await barItem(app, id);
    if (last && Object.entries(want).every(([k, v]) => last[k] === v)) return last;
    await wait(100);
  }
  assert.fail(`bar entry ${id}: ${JSON.stringify(last)}, wanted ${JSON.stringify(want)}`);
}

const muted = (page) => page.getAttribute(MUTE, 'aria-pressed');

/** Counts the saves the main process finishes (the handler of `fabtice:project-save-finish`, wrapped). */
function countSaves(app) {
  return app.evaluate(({ ipcMain }) => {
    globalThis.__saves = 0;
    const handlers = ipcMain._invokeHandlers;
    const original = handlers.get('fabtice:project-save-finish');
    handlers.set('fabtice:project-save-finish', async (...args) => {
      const out = await original(...args);
      if (out && out.ok) globalThis.__saves++;
      return out;
    });
  });
}
const saves = (app) => app.evaluate(() => globalThis.__saves);

/** The system's save panel answers with this path. */
const panelAnswers = (app, filePath) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, filePath);

async function saved(page) {
  await page.waitForSelector('[data-testid="projet-enregistre"]', { timeout: 120000 });
  await page.waitForFunction(() => !window.__fabtice.history.isModified());
}

test('the menu bar: the page\'s commands, greyed out as in the app, run in the page, never twice', { timeout: 300000 }, async () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-barre-')));
  const userData = path.join(base, 'u');
  const folder = path.join(base, 'Projets');
  fs.mkdirSync(userData);
  fs.mkdirSync(folder);
  const { app, page, problems } = await launchInterface(UTF8, userData);
  try {
    // The structure, at the usual places.
    const top = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((m) => m.label));
    assert.deepEqual(top, ['Fabtice', 'Fichier', 'Édition', 'Présentation', 'Fenêtre', 'Aide']);
    const file = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[1].submenu.items.filter((i) => i.type !== 'separator').map((i) => i.label));
    const expectedFile = ['Nouveau projet', 'Ouvrir…', ...(process.platform === 'darwin' ? ['Ouvrir un projet récent'] : []), 'Enregistrer', 'Enregistrer sous…', 'Exporter', 'Imprimer…'];
    assert.deepEqual(file, expectedFile);
    const edit = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[2].submenu.items.filter((i) => i.type !== 'separator').map((i) => i.label));
    assert.deepEqual(edit, ['Annuler', 'Rétablir', 'Couper', 'Copier', 'Coller', 'Tout sélectionner']);
    assert.equal((await barItem(app, 'settings')).accelerator, 'CommandOrControl+,');
    assert.equal((await barItem(app, 'print')).accelerator, 'CommandOrControl+P');

    // No project (the opening screen): only the ways in.
    await waitBar(app, 'open', { enabled: true });
    assert.equal((await barItem(app, 'save')).enabled, false);
    assert.equal((await barItem(app, 'print')).enabled, false);
    // (The link field has the focus: there, « Annuler » is the typing's.)
    assert.equal((await barItem(app, 'undo')).label, 'Annuler');

    await page.locator('.accueil input[type="file"]').setInputFiles(path.join(APP_FIXTURES, 'tone.wav'));
    await pieceReady(page);
    // A piece: « Enregistrer » can be used, in the app and in the bar.
    await waitBar(app, 'save', { enabled: true });
    await waitBar(app, 'exportAudio', { enabled: true });
    assert.equal((await barItem(app, 'undo')).enabled, false, 'nothing to undo yet');

    // A step: the bar shows « Annuler : piste coupée »; its click undoes it in the page.
    await page.click(MUTE);
    await waitBar(app, 'undo', { enabled: true, label: 'Annuler : piste coupée' });
    await clickBar(app, 'undo');
    await page.waitForFunction(() => document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
    await waitBar(app, 'redo', { enabled: true, label: 'Rétablir : piste coupée' });
    await clickBar(app, 'redo');
    await page.waitForFunction(() => document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });

    // A window of the app in the way: the bar greys out what the app greys out.
    await clickBar(app, 'exportAudio');
    await page.waitForSelector('[data-testid="export-son"]');
    await waitBar(app, 'save', { enabled: false });
    await waitBar(app, 'undo', { enabled: false });
    await page.keyboard.press('Escape');
    await waitBar(app, 'save', { enabled: true });

    // In a text field, Édition → Annuler undoes the typing, not the piece.
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'champ-essai';
      input.style.cssText = 'position:fixed;top:100px;left:300px;z-index:99';
      document.body.append(input);
    });
    await page.click('#champ-essai');
    await page.keyboard.type('Blues');
    await waitBar(app, 'undo', { enabled: true, label: 'Annuler' });
    await clickBar(app, 'undo');
    await page.waitForFunction(() => document.getElementById('champ-essai').value === '', null, { timeout: 5000 });
    assert.equal(await muted(page), 'true', 'the piece was not touched');
    await page.evaluate(() => {
      document.getElementById('champ-essai').remove();
      document.activeElement?.blur();
    });
    await waitBar(app, 'undo', { label: 'Annuler : piste coupée' });

    // One press: one step undone (two steps there).
    await page.click(MUTE);
    await page.waitForFunction(() => window.__fabtice.history.historyStatus().undoLabel === 'Annuler : piste coupée' && document.querySelector('.piste-tete button.muet')?.getAttribute('aria-pressed') === 'false');
    await page.keyboard.press('ControlOrMeta+z');
    await wait(400);
    assert.equal(await muted(page), 'true', 'one step undone: the track is muted again (two would unmute it)');
    assert.equal(await page.evaluate(() => window.__fabtice.history.canUndo()), true, 'the first step is still there');
    // The bar told of the same shortcut right after the page took it: dropped.
    await clickBar(app, 'redo', true);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await wait(400);
    assert.equal(await muted(page), 'false', 'redone once');

    // One press of cmd + S: one save. The first one asks where (the dialog, then the panel).
    await countSaves(app);
    const target = path.join(folder, 'Essai.fab');
    await panelAnswers(app, target);
    await clickBar(app, 'saveAs');
    await page.waitForSelector('[data-testid="enregistrer-projet"]');
    await page.click('[data-testid="preparer-projet"]');
    await saved(page);
    assert.equal(await saves(app), 1);
    await page.click(MUTE);
    await page.waitForFunction(() => window.__fabtice.history.isModified());
    await page.keyboard.press('ControlOrMeta+s');
    await saved(page);
    await wait(1000);
    assert.equal(await saves(app), 2, 'one press, one save');
    assert.deepEqual(fs.readdirSync(folder), ['Essai.fab']);

    // « Imprimer… » and « Réglages… » from the bar reach the page (the print window needs chords: greyed out
    // until the analysis has found some).
    await clickBar(app, 'settings');
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.settings.open);
    await page.evaluate(() => window.__fabtice.actions.closeSettings());
    const print = await barItem(app, 'print');
    const chords = await page.evaluate(() => (window.__fabtice.store.getState().analysis?.chords.length ?? 0) > 0);
    assert.equal(print.enabled, chords, 'Imprimer… follows the chords');

    // The page's menu: « Quitter » is offered in the Mac app, with « Projets récents » and « Ouvrir dans iReal Pro ».
    await page.click('button.marque');
    const entries = await page.locator('#menu-fabtice > .menu-ligne > [role="menuitem"] .menu-texte').allInnerTexts();
    assert.deepEqual(entries, ['Annuler : piste coupée', 'Rétablir', 'Nouveau projet', 'Ouvrir…', 'Projets récents', 'Enregistrer', 'Enregistrer sous…', 'Exporter', 'Imprimer…', 'Réglages…', 'Quitter']);
    await page.click('[data-sous-menu="recent"]');
    await page.locator('[data-recent="Essai"]').waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await assertClean(page, problems, 'menu bar');

    // « Quitter » in the page: the app quits (the close guard is off in these tests).
    await menuCommand(page, 'Quitter');
    const exited = await new Promise((resolve) => {
      const proc = app.process();
      if (proc.exitCode !== null) return resolve(true);
      const timer = setTimeout(() => resolve(false), 30000);
      proc.once('exit', () => (clearTimeout(timer), resolve(true)));
    });
    assert.equal(exited, true, '« Quitter » quits the app');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a piece saved, then reopened at launch: « not modified », the same file; its file gone: « modified »', { timeout: 600000 }, async () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-reprise-')));
  const userData = path.join(base, 'u');
  const folder = path.join(base, 'Projets');
  fs.mkdirSync(userData);
  fs.mkdirSync(folder);
  const wav = path.join(base, 'Blues du dimanche.wav');
  makeWavFile(wav, { seconds: 20 });
  const target = path.join(folder, 'Blues.fab');
  const relaunch = async () => {
    const run = await launchInterface(UTF8, userData);
    await run.page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project, null, { timeout: 120000 });
    await pieceReady(run.page);
    return run;
  };
  const title = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
  const edited = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDocumentEdited());

  // Imported, saved.
  {
    const { app, page, problems } = await launchInterface(UTF8, userData);
    try {
      await page.locator('.accueil input[type="file"]').setInputFiles(wav);
      await pieceReady(page);
      // The piece is kept on the device first (a project file is made from what the device holds), and its analysis
      // has ended (an analysis that ends after the save is a change the file does not have).
      await page.waitForFunction(() => {
        const s = window.__fabtice.store.getState();
        return s.analysis !== null && s.analysisRun.status === 'idle';
      }, null, { timeout: 180000 });
      await page.waitForTimeout(1500);
      await panelAnswers(app, target);
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForSelector('[data-testid="enregistrer-projet"]');
      await page.click('[data-testid="preparer-projet"]');
      await saved(page);
      // The autosave has the state beside the document.
      await wait(1500);
      await assertClean(page, problems, 'saved');
    } finally {
      await app.close().catch(() => {});
    }
  }

  // Relaunched: « not modified », the file known; a change, then cmd + S overwrites that file without a question.
  {
    const { app, page, problems } = await relaunch();
    try {
      await page.waitForFunction(() => window.__fabtice.project.getCurrentFile()?.name === 'Blues.fab' && !window.__fabtice.history.isModified(), null, { timeout: 15000 });
      await wait(300);
      assert.equal(await title(app), 'Blues');
      if (process.platform === 'darwin') assert.equal(await edited(app), false, 'no dot in the close button');
      await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 17 } })));
      await page.waitForFunction(() => window.__fabtice.history.isModified());
      const before = sha(target);
      await page.keyboard.press('ControlOrMeta+s');
      await saved(page);
      assert.equal(await page.evaluate(() => !!document.querySelector('[data-testid="enregistrer-projet"]')), false, 'no dialog: the same file');
      assert.notEqual(sha(target), before, 'the file was overwritten');
      assert.deepEqual(fs.readdirSync(folder), ['Blues.fab']);
      await wait(1500);
      await assertClean(page, problems, 'relaunch 1');
    } finally {
      await app.close().catch(() => {});
    }
  }

  // Relaunched without a change: still « not modified ».
  {
    const { app, page, problems } = await relaunch();
    try {
      await page.waitForFunction(() => window.__fabtice.project.getCurrentFile()?.name === 'Blues.fab' && !window.__fabtice.history.isModified(), null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => window.__fabtice.store.getState().corrections.tuningCents), 17);
      await assertClean(page, problems, 'relaunch 2');
    } finally {
      await app.close().catch(() => {});
    }
  }

  // The file gone: « modified », no file (« Enregistrer » would ask where).
  fs.rmSync(target);
  {
    const { app, page, problems } = await relaunch();
    try {
      await wait(2000);
      const st = await page.evaluate(() => ({ modified: window.__fabtice.history.isModified(), file: window.__fabtice.project.getCurrentFile() }));
      assert.deepEqual(st, { modified: true, file: null });
      await assertClean(page, problems, 'relaunch 3');
    } finally {
      await app.close().catch(() => {});
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});
