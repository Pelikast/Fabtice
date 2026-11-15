'use strict';

// « Nouveau morceau » in the Mac app, in order and without scrolling: the link field and the file
// alternative first, one line to open a project with three recent ones (« voir tous » for the rest),
// then the instruments, the standards offer (only while neither accepted nor declined), the formats
// line last. Measured at 1280 × 800 and 960 × 640, the window sizes of the app (content area).
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
    const dlg = document.querySelector('.voile.ouverte .accueil');
    const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrolls: dlg.scrollHeight > dlg.clientHeight + 1,
      link: top('.accueil .champ'),
      project: top('[data-testid="ouvrir-projet"]'),
      recents: top('[data-testid="projets-recents"]'),
      stems: top('.stems-choix'),
      offer: top('[data-testid="standards-offre"]'),
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
    await page.waitForSelector('[data-testid="standards-offre"]', { timeout: 30000 });
    for (const [w, h] of [[1280, 800], [960, 640]]) {
      await resize(app, w, h);
      await page.waitForTimeout(400);
      const m = await measure(page);
      console.log(`# ${w}x${h}: ${JSON.stringify(m)}`);
      assert.equal(m.recentLines, 3, 'three recent projects shown, most recent first');
      assert.ok(m.link < m.project && m.project < m.recents && m.recents < m.stems && m.stems < m.offer && m.offer < m.formats, `order: ${JSON.stringify(m)}`);
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

    // « Ne plus proposer »: the offer goes away.
    await page.getByRole('button', { name: 'Ne plus proposer' }).click();
    assert.equal(await page.locator('[data-testid="standards-offre"]').count(), 0);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(recentsDir, { recursive: true, force: true });
  }
});
