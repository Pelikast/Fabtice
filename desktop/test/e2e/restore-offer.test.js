'use strict';

// A launch that was cut short during a restore must not reopen the kept piece
// by itself (it could cut the next launch short too), and must not forget it:
// the dialog offers « Rouvrir » and a discreet « Oublier ce morceau ». The
// marker the page leaves in localStorage while it reopens a piece stands for
// the cut-short launch here.
//
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, state, storedDocument } = require('./helpers');

const APP_FIXTURES = path.join(ROOT, '..', 'app', 'tests', 'fixtures');
const env = { FABTICE_YTDLP_PATH: path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js') };

test('a launch cut short during a restore: the piece is offered, kept, and opens on « Rouvrir »', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-offer-'));
  let id;
  {
    const { app, page } = await launch(env, userData);
    try {
      await page.locator('.accueil input[type="file"]').setInputFiles(path.join(APP_FIXTURES, 'tone.wav'));
      await pieceReady(page);
      id = (await state(page)).project.id;
      for (let i = 0; i < 50 && !(await storedDocument(page)); i++) await page.waitForTimeout(100);
      // What a restore cut short leaves behind.
      await page.evaluate((pid) => localStorage.setItem('fabtice.restoring', pid), id);
    } finally {
      await app.close();
    }
  }
  {
    const { app, page, problems } = await launch(env, userData);
    try {
      await page.locator('.reprise').waitFor({ timeout: 30000 });
      assert.equal((await state(page)).project, null, 'no automatic reopening');
      assert.match(await page.locator('.accueil-avis').innerText(), /La dernière ouverture de « tone » s’est interrompue/);
      assert.equal(await page.locator('.reprise .plein').innerText(), 'Rouvrir « tone »');
      assert.equal(await page.locator('.reprise .lien').innerText(), 'Oublier ce morceau');
      assert.equal((await storedDocument(page)).project.id, id, 'the piece is kept');
      await page.locator('.reprise .plein').click();
      await pieceReady(page);
      assert.equal((await state(page)).project.id, id);
      assert.equal(await page.locator('.reprise').count(), 0);
      await assertClean(page, problems, 'offer then reopen');
    } finally {
      await app.close();
    }
  }
  {
    // The marker is gone after the successful reopening: the next launch opens it by itself.
    const { app, page } = await launch(env, userData);
    try {
      await pieceReady(page, 15000);
      assert.equal((await state(page)).project.id, id);
    } finally {
      await app.close();
    }
  }
});
