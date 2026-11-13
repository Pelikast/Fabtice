'use strict';

// Drives the diagnostic window (Aide > Diagnostic…) with the stub yt-dlp: link → two yt-dlp calls →
// bytes to the renderer → decodeAudioData → playback → diagnostics copy.
//
// Linux: xvfb-run -a npm run test:e2e
// Packaged app: FABTICE_E2E_APP=/path/Fabtice.app/Contents/MacOS/Fabtice npm run test:e2e
// FABTICE_E2E_OUT=<dir> keeps the diagnostics text and screenshots.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchApp, openDiagnostic } = require('./helpers');

const ROOT = path.join(__dirname, '..', '..');
const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const OUT = process.env.FABTICE_E2E_OUT || null;

async function launch(mode) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-'));
  const log = path.join(userData, 'stub-calls.jsonl');
  const app = await launchApp({
    FABTICE_YTDLP_PATH: STUB,
    FABTICE_STUB_MODE: mode,
    FABTICE_STUB_LOG: log,
    FABTICE_USER_DATA: userData,
  });
  const page = await openDiagnostic(app);
  return { app, page, log };
}

async function importLink(page, link) {
  await page.fill('#link', link);
  await page.click('#import-button');
  await page.waitForFunction(() => ['ok', 'error', 'failed', 'refused'].includes(document.body.dataset.decode), null, { timeout: 60000 });
  return page.evaluate(() => document.body.dataset.decode);
}

function keep(name, text) {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), text);
}

test('DASH m4a: import, decode, play, copy diagnostics', async () => {
  const { app, page, log } = await launch('dash');
  try {
    assert.match(await page.textContent('#ytdlp-status'), /2099\.01\.01-stub/);
    const outcome = await importLink(page, 'https://youtu.be/dQw4w9WgXcQ?list=PL0123456789&t=5');
    const diag = await page.textContent('#diag-text');
    keep('diagnostic-dash.txt', diag);
    console.log(diag);
    if (OUT) await page.screenshot({ path: path.join(OUT, 'dash.png') });
    assert.equal(outcome, 'ok', diag);

    assert.equal(await page.textContent('#track-title'), 'Tonalité d’essai');
    assert.match(await page.textContent('#track-meta'), /Fabtice test · 0:04/);
    assert.match(diag, /Décodage \(decodeAudioData\) : OK/);
    assert.match(diag, /MP4 fragmenté \(DASH\)/);
    assert.match(diag, /Conclusion ffmpeg : Chromium décode le m4a DASH non remuxé/);
    assert.match(diag, /JS runtimes: node-\d+/);
    assert.match(diag, /stub challenge solved/);
    assert.match(diag, /Moteur JS pour yt-dlp : .* répond v\d+/);
    assert.match(diag, /--- WebGPU ---\nnavigator\.gpu : /);
    assert.doesNotMatch(diag, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'));

    // Both yt-dlp calls got argument arrays, the canonical URL and the runtime env.
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const extraction = calls.filter((c) => !c.args.includes('--version'));
    assert.equal(extraction.length, 2);
    assert.equal(extraction[0].args.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    for (const c of extraction) {
      assert.equal(c.electronRunAsNode, '1');
      assert.match(c.args[c.args.indexOf('--js-runtimes') + 1], /^node:/);
    }

    // Playback: the button toggles; the position moves if an audio device exists.
    await page.click('#play');
    assert.equal(await page.evaluate(() => document.body.dataset.playing), 'true');
    await page.waitForTimeout(1200);
    const position = Number(await page.inputValue('#position'));
    console.log(`position after 1.2 s of playback: ${position}`);
    await page.click('#play');
    assert.equal(await page.evaluate(() => document.body.dataset.playing), 'false');
    await page.fill('#position', '2');
    await page.dispatchEvent('#position', 'change');
    await page.waitForFunction(() => document.getElementById('time').textContent === '0:02 / 0:04', null, { timeout: 5000 });

    await page.click('#copy-diag');
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.match(copied, /^=== Fabtice — diagnostic ===/);
    assert.match(await page.textContent('#copy-status'), /copié/);
  } finally {
    await app.close();
  }
});

test('WebM/Opus fallback decodes too', async () => {
  const { app, page } = await launch('webm');
  try {
    const outcome = await importLink(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const diag = await page.textContent('#diag-text');
    keep('diagnostic-webm.txt', diag);
    assert.equal(outcome, 'ok', diag);
    assert.match(diag, /Conteneur détecté : WebM/);
  } finally {
    await app.close();
  }
});

test('live streams are refused, bad links rejected', async () => {
  const { app, page } = await launch('live');
  try {
    assert.equal(await importLink(page, 'https://www.youtube.com/live/dQw4w9WgXcQ'), 'refused');
    assert.match(await page.textContent('#import-status'), /directs/);
    assert.equal(await importLink(page, 'https://example.com/watch?v=dQw4w9WgXcQ'), 'failed');
    assert.match(await page.textContent('#import-status'), /Lien non reconnu/);
  } finally {
    await app.close();
  }
});
