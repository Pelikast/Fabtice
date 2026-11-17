'use strict';

// The message that offers the chord charts of standards (C9) and the section of Réglages → Avancé, inside the Mac app, end to end: the main process
// does the download (a page cannot read another site) from a fixed list of hosts. A local fake server
// stands in for the real hosts through the test seam FABTICE_STANDARDS_TEST_ORIGIN (only active with
// FABTICE_HOLD_WINDOW, i.e. in these tests): the app asks for `https://<allowed host><path>` and the
// server receives `/<host><path>`. The tunes are invented (app/tests/standards-fixtures.mjs).
//
// What it covers: the bridge call (allowed host, a refused host, plain http, a redirect to an allowed
// host followed, a redirect to another host refused, no cookie and a generic user agent), then the whole
// message in the interface (« Oui (recommandé) » downloads every collection of the list): official page, a forum thread with an attached file, a login page that is not
// a playlist, a refused redirect that falls through to the next page, the result, the library found
// again after a reload.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchInterface } = require('./helpers');

const APP = path.join(__dirname, '..', '..', '..', 'app');

async function fakeInternet(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const entry = routes[req.url];
    if (!entry) return res.writeHead(404).end('not found');
    res.writeHead(entry.status ?? 200, entry.headers ?? { 'content-type': 'text/html; charset=utf-8' }).end(entry.body ?? '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))) };
}

test('the Mac app downloads the chart collections itself: bridge rules, then the whole offer', async () => {
  const fx = await import(pathToFileURL(path.join(APP, 'tests', 'standards-fixtures.mjs')).href);
  const bundled = JSON.parse(fs.readFileSync(path.join(APP, 'src', 'standards', 'collections.json'), 'utf8'));
  const list = fx.shrinkList(bundled);
  const OFFICIAL = '/www.irealpro.com/main-playlists/';
  const jazz = { name: 'Jazz 1460', songs: [...fx.tunes(20, 'Jazz Tune'), { title: 'Autumn Leaves', composer: 'Kosma Joseph' }] };
  const latin = { name: 'Latin 50', songs: fx.tunes(20, 'Latin Tune') };
  const blues = { name: 'Blues 50', songs: fx.tunes(20, 'Blues Tune') };
  const html = { 'content-type': 'text/html; charset=utf-8' };
  const net = await fakeInternet({
    // The remote list of collections, read through the bridge.
    '/raw.githubusercontent.com/Pelikast/Fabtice/main/app/src/standards/collections.json': { body: JSON.stringify(list), headers: { 'content-type': 'application/json' } },
    // The official page moved: a redirect to another allowed host, followed by hand.
    [OFFICIAL]: { status: 302, headers: { location: 'https://irealpro.com/main-playlists/' } },
    '/irealpro.com/main-playlists/': { body: fx.officialPage([jazz, latin, blues]) },
    // Brazilian 220 is not on the official page: its forum thread points to an attached file.
    '/forums.irealpro.com/threads/4414/': { body: fx.forumPage(['/attachments/brazilian-220-html.77/']) },
    '/forums.irealpro.com/attachments/brazilian-220-html.77/': { body: fx.playlistFile(fx.tunes(20, 'Brazilian Tune'), 'Brazilian 220') },
    // Dixieland: a login page, not a playlist.
    '/forums.irealpro.com/threads/10591/': { body: fx.LOGIN_PAGE },
    // Bridge rules.
    '/www.irealpro.com/to-elsewhere': { status: 302, headers: { location: 'https://evil.example/steal' } },
    '/www.irealpro.com/to-http': { status: 302, headers: { location: 'http://irealpro.com/plain' } },
    '/www.irealpro.com/plain': { body: 'plain text' },
    '/www.irealpro.com/missing-header': { status: 302 },
    '/raw.githubusercontent.com/o/r/file.txt': { body: 'hello', headers: { 'content-type': 'text/plain' } },
  });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-standards-'));
  const { app, page, problems } = await launchInterface(
    { FABTICE_STANDARDS_TEST_ORIGIN: net.origin, FABTICE_E2E_QUERY: '?debug&outils=distant&grilles=message' },
    userData,
  );
  try {
    // ---------------------------------------------------------------- the bridge call
    const call = (url) => page.evaluate((u) => window.fabtice.standardsFetchText(u), url);
    assert.equal(await page.evaluate(() => typeof window.fabtice.standardsFetchText), 'function');

    const ok = await call('https://raw.githubusercontent.com/o/r/file.txt');
    assert.deepEqual({ ok: ok.ok, text: ok.text, url: ok.url, bytes: ok.bytes }, { ok: true, text: 'hello', url: 'https://raw.githubusercontent.com/o/r/file.txt', bytes: 5 });
    const headers = net.seen.find((s) => s.url === '/raw.githubusercontent.com/o/r/file.txt').headers;
    assert.equal(headers['user-agent'], 'Fabtice');
    assert.equal(headers.cookie, undefined, 'no cookie');
    assert.equal(headers.authorization, undefined, 'no credentials');

    assert.deepEqual(await call('https://evil.example/anything'), { ok: false, error: 'host-not-allowed' });
    assert.deepEqual(await call('https://irealpro.com.evil.example/'), { ok: false, error: 'host-not-allowed' });
    assert.deepEqual(await call('http://www.irealpro.com/plain'), { ok: false, error: 'invalid-url' });
    assert.deepEqual(await call('file:///etc/passwd'), { ok: false, error: 'invalid-url' });
    assert.deepEqual(await call('https://www.irealpro.com:8443/plain'), { ok: false, error: 'invalid-url' });
    assert.deepEqual(await call('https://user:pw@www.irealpro.com/plain'), { ok: false, error: 'invalid-url' });
    assert.deepEqual(await page.evaluate(() => window.fabtice.standardsFetchText(42)), { ok: false, error: 'invalid-url' });
    const moved = await call('https://www.irealpro.com/main-playlists/');
    assert.equal(moved.ok, true, 'a redirect to another allowed host is followed');
    assert.equal(moved.url, 'https://irealpro.com/main-playlists/');
    assert.deepEqual(await call('https://www.irealpro.com/to-elsewhere'), { ok: false, error: 'host-not-allowed', status: 302 });
    assert.deepEqual(await call('https://www.irealpro.com/to-http'), { ok: false, error: 'redirect', status: 302 });
    assert.deepEqual(await call('https://www.irealpro.com/missing-header'), { ok: false, error: 'redirect', status: 302 });
    assert.deepEqual(await call('https://www.irealpro.com/nothing-here'), { ok: false, error: 'http', status: 404 });
    assert.ok(!net.seen.some((s) => /evil|steal/.test(s.url)), 'nothing was requested from a host outside the list');

    // ---------------------------------------------------------------- the message in the interface
    await page.waitForSelector('[data-testid="grilles-message"][data-etape="ask"]', { timeout: 30000 });
    assert.equal(
      (await page.locator('[data-testid="grilles-texte"]').innerText()).replace(/\s+/g, ' '),
      'Voulez-vous importer automatiquement les grilles des standards de iReal Pro ? Cela permet d’améliorer la détection des accords.',
    );
    assert.equal(await page.locator('[data-testid="grilles-ne-plus"]').isChecked(), false);
    await page.locator('[data-testid="grilles-oui"]').click();
    await page.waitForSelector('[data-testid="grilles-message"][data-etape="done"]', { timeout: 60000 });
    const result = (await page.locator('[data-testid="grilles-bilan"]').innerText()).replace(/\s+/g, ' ');
    // Jazz 21 + Latin 20 + Blues 20 (official page) + Brazilian 20 (attached file) = 81 in 4 collections of the 15 of the list;
    // Dixieland: a login page, and the others are on no page of the fake internet: they can be tried again in the settings.
    assert.equal(result, '4 recueils sur 15 téléchargés : 81 grilles gardées sur cet appareil. Les autres peuvent être réessayés dans Réglages → Avancé.', result);

    // The shared official page was fetched once for the three collections it holds.
    const officialHits = net.seen.filter((s) => s.url === OFFICIAL).length;
    assert.equal(officialHits, 1 + 1, 'one direct call above, then one for the whole download');
    // Brazilian: official page (no such list) → forum thread → the attached file.
    assert.ok(net.seen.some((s) => s.url === '/forums.irealpro.com/attachments/brazilian-220-html.77/'));

    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="grilles-message"]'));

    // ---------------------------------------------------------------- the section of Réglages → Avancé, in the Mac app
    await page.evaluate(() => window.__fabtice.actions.openSettings('advanced'));
    await page.waitForSelector('[data-testid="standards-section"]');
    const rows = await page.locator('[data-testid="standards-recueils"] .recueil').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    assert.equal(rows.length, 15);
    assert.ok(rows[0].startsWith('Jazz 1460') && rows[0].includes('21 grilles') && rows[0].includes('Source : irealpro.com'), rows[0]);
    assert.ok(rows.every((r) => !r.includes('à importer par fichier')), 'in the Mac app every collection can be downloaded directly');
    assert.equal(await page.locator('[data-garde="oui"]').count(), 4);
    // « Vérifier les mises à jour de grilles »: nothing changed on the fake internet, nothing new.
    await page.locator('[data-testid="standards-verifier"]').click();
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 60000 });
    assert.ok((await page.locator('[data-testid="standards-resultat"]').innerText()).includes('Tout est à jour.'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="reglages"]'));

    // ---------------------------------------------------------------- kept on the device, found again
    await page.reload();
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.standards);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-testid="grilles-message"]').count(), 0, 'the message does not come back');
    const found = await page.evaluate(async () => {
      const found = await window.__fabtice.standards.findStandard('Bill Evans - Autumn Leaves (1959) [Remastered]');
      const st = await window.__fabtice.standards.standardsStatus();
      return { title: found[0]?.chart.title, id: found[0]?.collectionId, total: st.total, ids: st.collections.map((c) => c.id), persistent: st.persistent };
    });
    assert.deepEqual(found, { title: 'Autumn Leaves', id: 'jazz-1460', total: 81, ids: ['blues-50', 'brazilian-220', 'jazz-1460', 'latin-50'], persistent: true });
    const csp = await page.evaluate(() => window.__csp);
    assert.deepEqual(csp, [], 'no CSP violation');
    assert.deepEqual(problems.filter((p) => /standards|collections|fabtice-standards/i.test(p)), [], 'no console problem about the collections');
  } finally {
    await app.close().catch(() => {});
    await net.close();
  }
});
