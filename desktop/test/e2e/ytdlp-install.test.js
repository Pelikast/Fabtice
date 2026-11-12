'use strict';

// The yt-dlp install flow in the real window, against a local release server
// (FABTICE_RELEASE_BASE) that can be down, flaky or healthy:
//   down  → friendly French message, "Réessayer", nothing left on disk;
//   flaky → retried automatically, installed and verified;
//   down again on the next launch → only a quiet note about updates.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.FABTICE_E2E_OUT || null;
const ASSET = process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
const TAG = '2099.02.02';
const BINARY = Buffer.from('#!/bin/sh\necho 2099.02.02-fake\n'.padEnd(64 * 1024, '#'));
const SHA = crypto.createHash('sha256').update(BINARY).digest('hex');

function startServer() {
  const server = { mode: 'down', hits: {} };
  const routes = {
    [`/api/repos/yt-dlp/yt-dlp/releases/latest`]: () => ['application/json', JSON.stringify({ tag_name: TAG })],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/SHA2-256SUMS`]: () => ['text/plain', `${SHA}  ${ASSET}\n`],
    [`/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS`]: () => ['text/plain', `${SHA}  ${ASSET}\n`],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/${ASSET}`]: () => ['application/octet-stream', BINARY],
  };
  server.http = http.createServer((req, res) => {
    const hit = (server.hits[req.url] = (server.hits[req.url] || 0) + 1);
    const route = routes[req.url];
    if (server.mode === 'down') {
      req.socket.destroy();
      return;
    }
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const [type, body] = route();
    if (server.mode === 'flaky' && hit === 1) {
      res.writeHead(503).end('busy');
      return;
    }
    if (server.mode === 'flaky' && hit === 2 && req.url.endsWith(ASSET)) {
      // Headers announce the whole file, then the connection drops halfway.
      res.writeHead(200, { 'content-type': type, 'content-length': body.length });
      res.write(body.subarray(0, body.length / 2), () => req.socket.destroy());
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
  return new Promise((resolve) => server.http.listen(0, '127.0.0.1', () => {
    server.base = `http://127.0.0.1:${server.http.address().port}`;
    resolve(server);
  }));
}

async function launch(server, userData) {
  const env = {
    ...process.env,
    FABTICE_USER_DATA: userData,
    FABTICE_RELEASE_BASE: server.base,
    FABTICE_RETRY_DELAYS_MS: '100,200,300',
  };
  delete env.FABTICE_YTDLP_PATH;
  delete env.ELECTRON_RUN_AS_NODE;
  const extraArgs = process.platform === 'linux' ? ['--no-sandbox'] : [];
  const options = process.env.FABTICE_E2E_APP
    ? { executablePath: process.env.FABTICE_E2E_APP, args: extraArgs, env }
    : { executablePath: require('electron'), args: [ROOT, ...extraArgs], env };
  const app = await electron.launch({ ...options, timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 });
  return { app, page };
}

function keep(name, text) {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), text);
}

test('install: down, then retry on a flaky server, then quiet update note', async () => {
  const server = await startServer();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-install-'));
  const binDir = path.join(userData, 'yt-dlp');
  const files = () => (fs.existsSync(binDir) ? fs.readdirSync(binDir).sort() : []);
  try {
    // 1. Server down: every attempt fails, the user sees a plain message.
    let { app, page } = await launch(server, userData);
    try {
      await page.click('#ytdlp-install');
      await page.waitForSelector('body[data-install="failed"]', { timeout: 60000 });
      const status = await page.textContent('#ytdlp-status');
      assert.match(status, /Le téléchargement de yt-dlp a échoué\. C’est en général passager/);
      assert.doesNotMatch(status, /net::|ERR_|HTTP/);
      assert.equal(await page.textContent('#ytdlp-install'), 'Réessayer');
      assert.equal(await page.isVisible('#ytdlp-update'), false);
      assert.deepEqual(files().filter((f) => f !== 'installed.json'), []);
      let diag = await page.textContent('#diag-text');
      keep('diagnostic-install-down.txt', diag);
      assert.match(diag, /Installation yt-dlp : dernier échec — /);
      assert.match(diag, /sommes 127\.0\.0\.1:\d+ essai 4\/4 · ÉCHEC/);

      // 2. "Réessayer" against a flaky server: 503, then a dropped download, then success.
      server.mode = 'flaky';
      await page.click('#ytdlp-install');
      await page.waitForSelector('body[data-install="ok"]', { timeout: 60000 });
      await page.waitForFunction(() => /2099\.02\.02-fake/.test(document.getElementById('ytdlp-status').textContent), null, { timeout: 30000 });
      assert.deepEqual(files(), ['installed.json', ASSET]);
      diag = await page.textContent('#diag-text');
      keep('diagnostic-install-flaky.txt', diag);
      assert.match(diag, /binaire 127\.0\.0\.1:\d+ essai 1\/4 · ÉCHEC .*HTTP 503/);
      assert.match(diag, /binaire 127\.0\.0\.1:\d+ essai 2\/4 · ÉCHEC/);
      assert.match(diag, /binaire 127\.0\.0\.1:\d+ essai 3\/4 · OK/);
      assert.match(diag, new RegExp(`yt-dlp SHA-256 : ${SHA}`));
    } finally {
      await app.close();
    }

    // 3. Next launch with the server down: yt-dlp still usable, quiet note only.
    server.mode = 'down';
    ({ app, page } = await launch(server, userData));
    try {
      await page.waitForFunction(() => !document.getElementById('ytdlp-update').hidden, null, { timeout: 30000 });
      assert.match(await page.textContent('#ytdlp-status'), /2099\.02\.02-fake/);
      assert.match(await page.textContent('#ytdlp-update'), /non vérifiées pour l’instant/);
      assert.equal(await page.evaluate(() => document.getElementById('ytdlp-update').classList.contains('error')), false);
      assert.equal(await page.isVisible('#ytdlp-install'), false);
      keep('diagnostic-update-down.txt', await page.textContent('#diag-text'));
    } finally {
      await app.close();
    }
  } finally {
    server.http.close();
  }
});
