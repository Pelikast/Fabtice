'use strict';

// « Nouveau projet » in the Mac app, in order and without scrolling: the link field and the file
// alternative first, one line to open a project with three recent ones (« voir tous » for the rest),
// then « Séparer les instruments » (unticked), the formats line last. The message of the chord charts (C9)
// comes over it, one window at a time. Measured at 1280 × 800 and 960 × 640, the window sizes of the app (content area).
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e
// Screenshots go to $FABTICE_E2E_SHOTS when set.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface } = require('./helpers');

function seedRecents(userData, count) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-recents-'));
  const entries = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, `Projet ${i + 1}.fab`);
    fs.writeFileSync(file, 'x');
    entries.push({ path: file, at: new Date(Date.UTC(2026, 10, 15, 12, 0, 0) - i * 3600_000).toISOString() });
  }
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'recent-projects.json'), JSON.stringify(entries));
  return dir;
}

const resize = (app, width, height) =>
  app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(size.width, size.height);
  }, { width, height });

const measure = (page) =>
  page.evaluate(() => {
    const dlg = document.querySelector('.voile-projet.ouverte .accueil');
    const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrolls: dlg.scrollHeight > dlg.clientHeight + 1,
      link: top('.accueil .champ'),
      project: top('[data-testid="ouvrir-projet"]'),
      recents: top('[data-testid="projets-recents"]'),
      stems: top('.stems-choix'),
      formats: top('.accueil .pied'),
      recentLines: document.querySelectorAll('[data-testid="projets-recents"] li').length,
      dialogBottom: dlg.getBoundingClientRect().bottom,
    };
  });

test('the opening dialog is in order and fits at 1280 × 800 and 960 × 640 with the link field and recent projects', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-opening-'));
  const recentsDir = seedRecents(userData, 4);
  const { app, page } = await launchInterface({}, userData);
  try {
    await page.waitForSelector('.voile.ouverte [data-testid="projets-recents"] li', { timeout: 30000 });
    for (const [w, h] of [[1280, 800], [960, 640]]) {
      await resize(app, w, h);
      await page.waitForTimeout(400);
      const m = await measure(page);
      console.log(`# ${w}x${h}: ${JSON.stringify(m)}`);
      assert.equal(m.recentLines, 3, 'three recent projects shown, most recent first');
      assert.ok(m.link < m.project && m.project < m.recents && m.recents < m.stems && m.stems < m.formats, `order: ${JSON.stringify(m)}`);
      assert.equal(m.scrolls, false, `no scrolling at ${w} × ${h}`);
      assert.ok(m.dialogBottom <= m.vh, 'the dialog is inside the window');
      if (process.env.FABTICE_E2E_SHOTS) await page.screenshot({ path: path.join(process.env.FABTICE_E2E_SHOTS, `accueil-mac-${w}x${h}.png`) });
    }
    const names = await page.$$eval('[data-testid="projets-recents"] li .lien', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(names, ['Projet 1', 'Projet 2', 'Projet 3']);
    await page.click('[data-testid="recents-tous"]');
    assert.equal(await page.locator('[data-testid="projets-recents"] li').count(), 4, '« voir tous » shows the fourth');
    await page.click('[data-testid="recents-tous"]');
    assert.equal(await page.locator('[data-testid="projets-recents"] li').count(), 3);

    // « Séparer les instruments »: unticked; ticked, every instrument is selected.
    assert.equal(await page.locator('[data-testid="separer-case"]').isChecked(), false);
    assert.equal(await page.locator('.stems-choix .stem').count(), 0);
    await page.locator('[data-testid="separer-case"]').check();
    const offered = await page.locator('.stems-choix .stem').count();
    assert.ok(offered >= 4);
    assert.equal(await page.locator('.stems-choix .stem[aria-pressed="true"]').count(), offered);
    await page.locator('[data-testid="separer-case"]').uncheck();
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(recentsDir, { recursive: true, force: true });
  }
});

test('the message of the chord charts comes over the opening screen; « Non merci » with the box ends it for good', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-opening-message-'));
  const recentsDir = seedRecents(userData, 2);
  const { app, page } = await launchInterface({ FABTICE_E2E_QUERY: '?debug&grilles=message' }, userData);
  try {
    await page.waitForSelector('[data-testid="grilles-message"][data-etape="ask"]', { timeout: 30000 });
    await resize(app, 1280, 800);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.voile.ouverte').count(), 2, 'the message over the opening screen');
    assert.equal(await page.locator('.voile-projet').evaluate((el) => el.inert), true, 'the opening screen waits behind it');
    const box = await page.locator('[data-testid="grilles-message"] .accueil').boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 800, 'the message fits the window');
    if (process.env.FABTICE_E2E_SHOTS) await page.screenshot({ path: path.join(process.env.FABTICE_E2E_SHOTS, 'message-grilles-mac.png') });
    await page.getByLabel('Ne plus afficher ce message').check();
    await page.getByRole('button', { name: 'Non merci' }).click();
    await page.waitForSelector('[data-testid="grilles-message"][data-etape="last"]');
    assert.equal((await page.locator('[data-testid="grilles-dernier"]').innerText()).trim(), 'Ce choix reste disponible dans le menu de réglages avancé de l’application.');
    await page.getByRole('button', { name: 'OK' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="grilles-message"]'));
    assert.equal(await page.locator('.voile-projet').evaluate((el) => el.inert), false);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.standards);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-testid="grilles-message"]').count(), 0, 'it does not come back');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(recentsDir, { recursive: true, force: true });
  }
});
