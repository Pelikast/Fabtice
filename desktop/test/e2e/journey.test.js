'use strict';

// The journey of the owner, through the interface's own controls, inside the
// app: first launch → paste a link → « Importer » (first-time tool install,
// extraction, decoding) → the piece opens with its waveform → a real click on
// play (real engine: worklet and wasm under the shipped CSP) → loop and key
// change → quit → relaunch with the same user-data folder → the piece comes
// back by itself and plays. Then a refused link and a file import.
//
// yt-dlp is the stub, installed from a local release server (the stub script
// is served as the "release binary"), so the install step is the real one.
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, clock, state, storedDocument } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const APP_FIXTURES = path.join(ROOT, '..', 'app', 'tests', 'fixtures');
const OUT = process.env.FABTICE_E2E_OUT || null;
const ASSET = process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
const TAG = '2099.01.01';
const LINK = 'https://youtu.be/dQw4w9WgXcQ?t=5';

// Serves the stub as the yt-dlp release.
async function releaseServer() {
  const body = fs.readFileSync(STUB);
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const routes = {
    '/api/repos/yt-dlp/yt-dlp/releases/latest': ['application/json', JSON.stringify({ tag_name: TAG })],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/SHA2-256SUMS`]: ['text/plain', `${sha}  ${ASSET}\n`],
    '/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS': ['text/plain', `${sha}  ${ASSET}\n`],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/${ASSET}`]: ['application/octet-stream', body],
  };
  const server = http.createServer((req, res) => {
    const route = routes[req.url];
    if (!route) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': route[0], 'content-length': Buffer.byteLength(route[1]) });
    res.end(route[1]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('first launch: link → import → waveform → play → loop and key → relaunch', async () => {
  const release = await releaseServer();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-journey-'));
  const env = { FABTICE_RELEASE_BASE: release.base, FABTICE_RETRY_DELAYS_MS: '100,200,300', FABTICE_STUB_MODE: 'dash' };
  delete process.env.FABTICE_YTDLP_PATH;
  let saved;
  try {
    // ---- first launch, nothing stored
    let { app, page, problems } = await launch(env, userData);
    try {
      const link = page.locator('.accueil input[type="url"]');
      await link.waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await page.locator('.voile').evaluate((el) => el.classList.contains('ouverte')), true);
      await link.fill(LINK);
      await page.getByRole('button', { name: 'Importer' }).click();
      await pieceReady(page);

      const s = await state(page);
      assert.equal(s.project.title, 'Tonalité d’essai');
      assert.equal(s.project.source.kind, 'link');
      assert.ok(s.project.duration > 3 && s.project.duration < 5, `duration ${s.project.duration}`);
      assert.equal(s.project.sampleRate, 48000);
      assert.equal(await page.locator('.projet-titre').innerText(), 'Tonalité d’essai');
      const seen = await page.evaluate(() => window.__seen);
      assert.ok(seen.includes('Installation de l’outil d’import…'), `first-time install shown: ${seen}`);
      assert.ok(seen.includes('Préparation du son…'), `decoding shown: ${seen}`);
      await page.waitForSelector('.frise[data-peaks="ready"]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const c = document.querySelector('.frise-voie canvas');
        if (!c || !c.width) return false;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let p = 3; p < d.length; p += 4) if (d[p] > 120) return true;
        return false;
      }, null, { timeout: 15000 });
      assert.ok(fs.existsSync(path.join(userData, 'yt-dlp', ASSET)), 'the tool was installed in the user-data folder');
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, 'journey-opened.png') });
      }

      // ---- a real click on play: the real engine runs
      assert.equal(await page.evaluate(() => crossOriginIsolated), true);
      const before = await clock(page);
      await page.locator('button.jouer').click();
      await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'playing', null, { timeout: 20000 });
      await page.waitForFunction((t0) => document.querySelector('[data-testid="temps"]').textContent !== t0, before, { timeout: 15000 });
      const after = await clock(page);
      assert.notEqual(after, before, 'the heard position advances');
      const engine = await page.evaluate(() => window.__fabtice.engine.constructor.name);
      console.log(`engine: ${engine}, clock ${before} -> ${after}`);
      await page.locator('button.jouer').click();
      await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine !== 'playing', null, { timeout: 10000 });
      await assertClean(page, problems, 'first launch');

      // ---- a loop (drag on the track) and a key change (two half-tones up)
      const lane = await page.locator('.frise-voie').first().boundingBox();
      const y = lane.y + lane.height / 2;
      await page.mouse.move(lane.x + lane.width * 0.15, y);
      await page.mouse.down();
      await page.mouse.move(lane.x + lane.width * 0.45, y, { steps: 8 });
      await page.mouse.up();
      await page.getByRole('button', { name: 'Un demi-ton plus haut' }).click();
      await page.getByRole('button', { name: 'Un demi-ton plus haut' }).click();
      const set = await state(page);
      assert.ok(set.loop.region && set.loop.enabled, `loop set: ${JSON.stringify(set.loop)}`);
      assert.equal(set.playback.semitones, 2);
      assert.equal(await page.locator('[data-testid="ton"]').innerText(), '+2');
      saved = { title: set.project.title, loop: set.loop, semitones: 2, id: set.project.id };
      // Autosave: the stored document carries them before we quit.
      for (let i = 0; i < 100; i++) {
        const stored = await storedDocument(page);
        if (stored && stored.playback.semitones === 2 && stored.loop.region) break;
        await page.waitForTimeout(100);
      }
      await assertClean(page, problems, 'before quitting');
    } finally {
      await app.close();
    }

    // ---- relaunch with the same folder: the piece is back by itself
    ({ app, page, problems } = await launch(env, userData));
    try {
      await pieceReady(page);
      const s = await state(page);
      assert.equal(s.project.title, saved.title);
      assert.equal(s.project.id, saved.id);
      assert.deepEqual(s.loop, saved.loop);
      assert.equal(s.playback.semitones, 2);
      assert.equal(await page.locator('.projet-titre').innerText(), saved.title);
      assert.equal(await page.locator('[data-testid="ton"]').innerText(), '+2');
      await page.waitForSelector('.frise[data-peaks="ready"]', { timeout: 30000 });
      const before = await clock(page);
      await page.locator('button.jouer').click();
      await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'playing', null, { timeout: 20000 });
      await page.waitForFunction((t0) => document.querySelector('[data-testid="temps"]').textContent !== t0, before, { timeout: 15000 });
      await page.locator('button.jouer').click();
      await assertClean(page, problems, 'relaunch');
    } finally {
      await app.close();
    }
  } finally {
    release.close();
  }
});

test('a live stream is refused in French, the app stays usable, a file imports', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-refuse-'));
  const { app, page, problems } = await launch({ FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'live' }, userData);
  try {
    const link = page.locator('.accueil input[type="url"]');
    await link.waitFor({ state: 'visible', timeout: 30000 });

    await link.fill('https://www.youtube.com/live/dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Importer' }).click();
    const error = page.locator('.import-erreur');
    await error.waitFor({ state: 'visible', timeout: 30000 });
    const message = await error.innerText();
    assert.match(message, /Ce lien ne peut pas être importé/);
    assert.match(message, /directs/);
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, 'journey-refused.png') });
    }

    // Not a YouTube link: the bridge sentence is recognised by the interface.
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await link.fill('https://example.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Importer' }).click();
    await error.waitFor({ state: 'visible', timeout: 30000 });
    assert.match(await error.innerText(), /Ce lien n’est pas reconnu/);

    // Still usable: back to the dialog, then a file through the file input.
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await page.locator('.accueil input[type="file"]').setInputFiles(path.join(APP_FIXTURES, 'tone.wav'));
    await pieceReady(page);
    const s = await state(page);
    assert.equal(s.project.title, 'tone');
    assert.equal(s.project.source.kind, 'file');
    assert.equal(s.project.sampleRate, 48000);
    await page.waitForSelector('.frise[data-peaks="ready"]', { timeout: 30000 });

    await page.locator('button.jouer').click();
    await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'playing', null, { timeout: 20000 });
    await page.locator('button.jouer').click();
    await assertClean(page, problems, 'refusal and file');
  } finally {
    await app.close();
  }
});
