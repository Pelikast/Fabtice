'use strict';

// The automatic update (C16) inside the app, end to end, with a local server standing for GitHub (the test
// address FABTICE_UPDATE_TEST_ORIGIN, only active with FABTICE_HOLD_WINDOW, i.e. in these tests) and a fake
// installed app (FABTICE_UPDATE_TEST_APP: a folder of fake bundle, so that it runs on Linux too):
//
//   - the bridge: the state, a search, its answer (a newer version, its number and notes);
//   - « Rechercher une mise à jour… » in the menu Fabtice of the bar: the answer in the message window;
//   - the message: the two numbers, the notes, « Mettre à jour Fabtice », « Plus tard »;
//   - a tampered archive refused, with its sentence; the fake app untouched, nothing left beside it;
//   - a good archive that is not a real app (here, a fake): refused when it is checked, the app untouched;
//   - the page of the version, for the manual download (the system's browser stood in for).
//
// What needs macOS (ditto, codesign, the relaunch) is the complete trial on the GitHub Macs
// (test/trial/update-trial.js).
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { launchInterface } = require('./helpers');
const { fakeApp, marker, zipFolder } = require('../update-fixtures');

const OUT = process.env.FABTICE_E2E_OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fakeGitHub(root, { version = '1.0.1' } = {}) {
  const source = path.join(root, 'new');
  const app = fakeApp(path.join(source, 'Fabtice.app'), { version, archs: [process.arch === 'arm64' ? 'arm64' : 'x64'], marker: 'new' });
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'app.asar'), crypto.randomBytes(1_300_000));
  const zip = path.join(root, 'archive.zip');
  zipFolder(source, zip);
  const bytes = fs.readFileSync(zip);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const dl = (name) => ({ name, url: `https://github.com/pelikast/fabtice/releases/download/v${version}/${name}`, sha256: sha, size: bytes.length });
  const file = {
    format: 1,
    version,
    publishedAt: '2026-12-01T10:00:00Z',
    notes: '### Plus simple\n- La mise à jour se fait en un bouton.\n- Les **accords** sont mieux détectés.',
    page: `https://github.com/pelikast/fabtice/releases/tag/v${version}`,
    minimumSystemVersion: '12.0',
    downloads: { arm64: dl('Fabtice-mac-apple-silicon.zip'), x64: dl('Fabtice-mac-intel.zip') },
  };
  const state = { tamper: false, seen: [] };
  const srv = http.createServer((req, res) => {
    state.seen.push(req.url);
    if (req.url === '/github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json') {
      return res.writeHead(302, { location: 'https://objects.githubusercontent.com/version?sig=1' }).end();
    }
    if (req.url === '/objects.githubusercontent.com/version?sig=1') return res.writeHead(200).end(JSON.stringify(file));
    if (req.url.startsWith(`/github.com/pelikast/fabtice/releases/download/v${version}/Fabtice-mac-`)) {
      return res.writeHead(302, { location: 'https://release-assets.githubusercontent.com/zip?sig=2' }).end();
    }
    if (req.url === '/release-assets.githubusercontent.com/zip?sig=2') {
      const out = Buffer.from(bytes);
      if (state.tamper) out[out.length >> 1] ^= 1;
      return res.writeHead(200, { 'content-length': out.length }).end(out);
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, state, close: () => new Promise((r) => (srv.closeAllConnections(), srv.close(r))) };
}

test('the update of the Mac app: search, message, refused archives, manual download', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-update-')));
  const folder = path.join(root, 'Applications d’essai');
  fs.mkdirSync(folder);
  const installed = fakeApp(path.join(folder, 'Fabtice.app'), { version: '1.0.0', archs: ['x64'], marker: 'old' });
  const net = await fakeGitHub(root);
  const userData = path.join(root, 'user-data');
  const { app, page } = await launchInterface({ FABTICE_UPDATE_TEST_ORIGIN: net.origin, FABTICE_UPDATE_TEST_APP: installed }, userData);
  try {
    const current = await app.evaluate(({ app: a }) => a.getVersion());
    // ---------------------------------------------------------------- the bridge
    const first = await page.evaluate(() => window.fabtice.updateStatus());
    assert.equal(first.current, current);
    assert.equal(first.phase, 'idle', 'on a test address, no search at opening');
    const checked = await page.evaluate(() => window.fabtice.checkForUpdate('page'));
    assert.equal(checked.phase, 'available');
    assert.equal(checked.origin, 'page');
    assert.equal(checked.available.version, '1.0.1');
    assert.match(checked.available.notes, /un bouton/);
    assert.equal(checked.blocked, null, 'the fake installed app can be replaced');
    assert.ok(net.state.seen.includes('/objects.githubusercontent.com/version?sig=1'), 'the redirect to the storage host was followed');
    // A path or an address from the page is ignored: the bridge takes none.
    assert.equal((await page.evaluate(() => window.fabtice.checkForUpdate('https://evil.example/'))).origin, 'page');

    // ---------------------------------------------------------------- the menu bar
    await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu().getMenuItemById('checkUpdate');
      if (!item) throw new Error('no « Rechercher une mise à jour… » in the menu bar');
      if (item.label !== 'Rechercher une mise à jour…') throw new Error(item.label);
      item.click();
    });
    await page.waitForSelector('[data-testid="maj-message"][data-etat="available"]', { timeout: 30000 });
    const text = (await page.locator('[data-testid="maj-message"]').innerText()).replace(/\s+/g, ' ');
    assert.match(text, /Une mise à jour est disponible/);
    assert.ok(text.includes(`Fabtice ${current}`) && text.includes('1.0.1'), text);
    assert.match(text, /La mise à jour se fait en un bouton/);
    assert.equal(await page.locator('[data-testid="maj-notes"] strong').innerText(), 'accords');
    assert.equal(await page.locator('[data-testid="maj-mettre"]').innerText(), 'Mettre à jour Fabtice');
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, 'update-message.png') });
    }

    // ---------------------------------------------------------------- a tampered archive
    net.state.tamper = true;
    await page.locator('[data-testid="maj-mettre"]').click();
    await page.waitForSelector('[data-testid="maj-message"] [data-testid="maj-erreur"]', { timeout: 60000 });
    assert.equal(await page.locator('[data-testid="maj-erreur"]').innerText(), 'Le fichier téléchargé est incomplet ou abîmé. Rien n’a été changé.');
    assert.equal(marker(installed), 'old');
    assert.deepEqual(fs.readdirSync(folder), ['Fabtice.app'], 'nothing left beside the app');

    // ---------------------------------------------------------------- an archive that is not a real app
    net.state.tamper = false;
    await page.locator('[data-testid="maj-mettre"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="maj-erreur"]')?.textContent.includes('n’a pas pu être installée'), null, { timeout: 60000 });
    assert.equal(marker(installed), 'old');
    assert.deepEqual(fs.readdirSync(folder), ['Fabtice.app']);
    assert.equal(app.windows().length, 1, 'the app is still there');

    // ---------------------------------------------------------------- the manual download
    await app.evaluate(({ shell }) => {
      globalThis.__opened = [];
      shell.openExternal = async (url) => void globalThis.__opened.push(url);
    });
    await page.evaluate(() => window.fabtice.openUpdatePage());
    assert.deepEqual(await app.evaluate(() => globalThis.__opened), ['https://github.com/pelikast/fabtice/releases/tag/v1.0.1']);

    // ---------------------------------------------------------------- « Plus tard »
    await page.locator('[data-testid="maj-plus-tard"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="maj-message"]'));
    await sleep(300);
  } finally {
    await app.close().catch(() => {});
    await net.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
