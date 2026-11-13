'use strict';

// The real interface (desktop/ui/, built by app/ with npm run build:desktop)
// served by the fabtice:// protocol, with the bridge reachable from the page.
// The interface's own link import is not exercised here: the bridge is called
// directly, the way the interface will call it.
//
// Linux: (cd ../app && npm ci && npm run build:desktop) && xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchApp, windowByUrl, openDiagnostic } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const OUT = process.env.FABTICE_E2E_OUT || null;

async function launchUi(env) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-ui-'));
  const app = await launchApp({ FABTICE_USER_DATA: userData, ...env });
  const page = await windowByUrl(app, 'fabtice://app/');
  page.on('console', (msg) => console.log(`[interface ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => console.log(`[interface pageerror] ${e.message}`));
  await page.waitForSelector('.accueil', { timeout: 60000 });
  return { app, page, userData };
}

test('the app starts on the real interface, isolated, with the link field', async () => {
  const { app, page } = await launchUi({ FABTICE_YTDLP_PATH: STUB });
  try {
    assert.match(page.url(), /^fabtice:\/\/app\//);
    assert.equal(await page.title(), 'Fabtice');

    const env = await page.evaluate(async () => {
      let sab = false;
      try { sab = new SharedArrayBuffer(8).byteLength === 8; } catch { /* unavailable */ }
      const ctx = new AudioContext({ sampleRate: 48000 });
      const worklet = typeof ctx.audioWorklet?.addModule === 'function';
      let wasm = false;
      try {
        wasm = (await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))).instance instanceof WebAssembly.Instance;
      } catch { /* blocked */ }
      await ctx.close();
      return {
        isolated: crossOriginIsolated,
        secure: isSecureContext,
        sab,
        worklet,
        wasm,
        origin: location.origin,
        bridge: typeof window.fabtice,
      };
    });
    assert.deepEqual(env, { isolated: true, secure: true, sab: true, worklet: true, wasm: true, origin: 'fabtice://app', bridge: 'object' });

    // Header check through the page itself.
    const headers = await page.evaluate(async () => {
      const r = await fetch('./index.html');
      return { status: r.status, coop: r.headers.get('cross-origin-opener-policy'), coep: r.headers.get('cross-origin-embedder-policy'), csp: r.headers.get('content-security-policy') };
    });
    assert.equal(headers.status, 200);
    assert.equal(headers.coop, 'same-origin');
    assert.equal(headers.coep, 'require-corp');
    assert.match(headers.csp, /default-src 'none'/);

    // The new-piece dialog offers the link field only because the bridge is there.
    const link = page.locator('.accueil input[type="url"]');
    await link.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await link.count(), 1);
    // Paste goes through the Edit menu roles: check the field takes focus and text.
    await link.fill('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(await link.inputValue(), 'https://youtu.be/dQw4w9WgXcQ');
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, 'interface.png') });
    }

    // Navigation and new windows stay blocked.
    await page.evaluate(() => { window.open('https://example.com/'); });
    await page.evaluate(() => { location.href = 'https://example.com/'; }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(app.windows().length, 1);
    assert.match(page.url(), /^fabtice:\/\/app\//);
  } finally {
    await app.close();
  }
});

test('the bridge called from the interface page returns audio bytes (stub yt-dlp)', async () => {
  const { app, page } = await launchUi({ FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'dash' });
  try {
    const result = await page.evaluate(async () => {
      const events = [];
      const off = window.fabtice.onExtractProgress((p) => events.push(p.phase));
      const status = await window.fabtice.ytdlpStatus();
      const r = await window.fabtice.extract('https://youtu.be/dQw4w9WgXcQ?list=PL0123456789&t=5');
      off();
      return {
        status: { installed: status.installed, version: status.version },
        ok: r.ok,
        isBytes: r.audio instanceof Uint8Array,
        size: r.audio ? r.audio.byteLength : 0,
        title: r.meta && r.meta.title,
        duration: r.meta && r.meta.duration,
        events: [...new Set(events)],
        error: r.error,
      };
    });
    assert.deepEqual(result.status, { installed: true, version: '2099.01.01-stub' });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.isBytes, true);
    assert.ok(result.size > 1000, `audio size ${result.size}`);
    assert.equal(result.title, 'Tonalité d’essai');
    assert.ok(result.duration > 3 && result.duration < 5);
    assert.ok(result.events.includes('download'), JSON.stringify(result.events));

    // The audio decodes in the page's 48 kHz context.
    const decoded = await page.evaluate(async () => {
      const r = await window.fabtice.extract('https://youtu.be/dQw4w9WgXcQ');
      const ctx = new AudioContext({ sampleRate: 48000 });
      const buf = await ctx.decodeAudioData(r.audio.buffer.slice(r.audio.byteOffset, r.audio.byteOffset + r.audio.byteLength));
      await ctx.close();
      return { duration: buf.duration, rate: buf.sampleRate };
    });
    assert.equal(decoded.rate, 48000);
    assert.ok(decoded.duration > 3 && decoded.duration < 5);

    // Bad link and live stream are answered, not thrown.
    const bad = await page.evaluate(() => window.fabtice.extract('https://example.com/watch?v=dQw4w9WgXcQ'));
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Lien non reconnu/);
  } finally {
    await app.close();
  }
});

test('yt-dlp install, then extraction refused until installed (page-driven)', async () => {
  const ASSET = process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
  const TAG = '2099.03.03';
  const BINARY = Buffer.from('#!/bin/sh\necho 2099.03.03-fake\n'.padEnd(64 * 1024, '#'));
  const SHA = crypto.createHash('sha256').update(BINARY).digest('hex');
  const routes = {
    '/api/repos/yt-dlp/yt-dlp/releases/latest': ['application/json', JSON.stringify({ tag_name: TAG })],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/SHA2-256SUMS`]: ['text/plain', `${SHA}  ${ASSET}\n`],
    [`/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS`]: ['text/plain', `${SHA}  ${ASSET}\n`],
    [`/yt-dlp/yt-dlp/releases/download/${TAG}/${ASSET}`]: ['application/octet-stream', BINARY],
  };
  const server = http.createServer((req, res) => {
    const r = routes[req.url];
    if (!r) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': r[0], 'content-length': Buffer.byteLength(r[1]) });
    res.end(r[1]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = { FABTICE_RELEASE_BASE: `http://127.0.0.1:${server.address().port}`, FABTICE_RETRY_DELAYS_MS: '100,200,300' };
  delete process.env.FABTICE_YTDLP_PATH;
  const { app, page } = await launchUi(env);
  try {
    const before = await page.evaluate(async () => ({ status: (await window.fabtice.ytdlpStatus()).installed, r: await window.fabtice.extract('https://youtu.be/dQw4w9WgXcQ') }));
    assert.equal(before.status, false);
    assert.equal(before.r.ok, false);
    assert.equal(before.r.needsYtdlp, true);

    const installed = await page.evaluate(async () => {
      const phases = [];
      const off = window.fabtice.onYtdlpProgress((p) => phases.push(p.phase));
      const r = await window.fabtice.ytdlpInstall();
      off();
      return { ok: r.ok, version: r.ok ? r.meta.version : null, phases: [...new Set(phases)], status: await window.fabtice.ytdlpStatus() };
    });
    assert.equal(installed.ok, true);
    assert.equal(installed.version, '2099.03.03-fake');
    assert.ok(installed.phases.includes('done'), JSON.stringify(installed.phases));
    assert.equal(installed.status.installed, true);

    // A page that is not ours could not call it: the diagnostic window shares the bridge and works too.
    const diag = await openDiagnostic(app);
    assert.match(await diag.textContent('#ytdlp-status'), /2099\.03\.03-fake/);
  } finally {
    await app.close();
    server.close();
  }
});

test('the diagnostic window opens from the menu and works with the stub', async () => {
  const { app, page } = await launchUi({ FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'dash' });
  try {
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label));
    assert.ok(['Fabtice', 'Édition', 'Présentation', 'Fenêtre', 'Aide'].every((l) => menu.includes(l)), menu.join(','));
    const diag = await openDiagnostic(app);
    assert.equal(app.windows().length, 2);
    assert.match(diag.url(), /^fabtice:\/\/diagnostic\//);
    // A second click focuses the same window instead of opening another.
    await openDiagnostic(app);
    assert.equal(app.windows().length, 2);

    assert.match(await diag.textContent('#ytdlp-status'), /2099\.01\.01-stub/);
    await diag.fill('#link', 'https://youtu.be/dQw4w9WgXcQ');
    await diag.click('#import-button');
    await diag.waitForFunction(() => ['ok', 'error', 'failed', 'refused'].includes(document.body.dataset.decode), null, { timeout: 60000 });
    assert.equal(await diag.evaluate(() => document.body.dataset.decode), 'ok', await diag.textContent('#diag-text'));
    await diag.click('#copy-diag');
    assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /^=== Fabtice — diagnostic ===/);
    assert.match(page.url(), /^fabtice:\/\/app\//);
  } finally {
    await app.close();
  }
});
