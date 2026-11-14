'use strict';

// A piece of REAL size must come back by itself at the next launch.
//
// Why this file exists: a stored piece once never came back. The browser keeps
// large values (above a few tens of kB) apart from the small ones and hands
// them over a little later; reading the result when the transaction completed
// threw inside an event handler and the restore waited for ever. Every other
// test used fixtures of a few kB, which never take that path. Here the pieces
// are a few MB, made on the fly (no binary fixture).
//
//   - a file imported through the interface: quit, relaunch with the same
//     user-data folder, the piece is back within a few seconds, with its
//     settings, and plays;
//   - the same for a piece imported from a link (the stub yt-dlp hands back a
//     file of real size, FABTICE_STUB_FILE).
//
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, clock, state, storedDocument, storedAudioBytes, makeWavFile } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const LINK = 'https://youtu.be/dQw4w9WgXcQ';
/** The piece must be back this fast (the old fault never answered). */
const BACK_WITHIN_MS = 15000;

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function waitForStored(page, predicate, what) {
  for (let i = 0; i < 150; i++) {
    const doc = await storedDocument(page);
    if (doc && predicate(doc)) return doc;
    await page.waitForTimeout(100);
  }
  throw new Error(`autosave never carried ${what}`);
}

async function playsThenPauses(page) {
  const before = await clock(page);
  await page.locator('button.jouer').click();
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'playing', null, { timeout: 20000 });
  await page.waitForFunction((t0) => document.querySelector('[data-testid="temps"]').textContent !== t0, before, { timeout: 15000 });
  await page.locator('button.jouer').click();
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine !== 'playing', null, { timeout: 10000 });
}

/** Imports with `importIt`, tunes, quits, relaunches: what must hold for a piece of `minBytes` or more. */
async function roundTrip({ env, importIt, expectedSource, minBytes }) {
  const userData = tmp('fabtice-e2e-size-');
  let saved;
  let { app, page, problems } = await launch(env, userData);
  try {
    await page.locator('.voile.ouverte').waitFor({ timeout: 30000 });
    await importIt(page);
    await pieceReady(page);
    const s = await state(page);
    assert.equal(s.project.source.kind, expectedSource);
    assert.ok(s.project.duration > 30, `duration ${s.project.duration}`);
    // A key change and a loop, to see that the settings travel with the piece.
    await page.getByRole('button', { name: 'Un demi-ton plus haut' }).click();
    await page.getByRole('button', { name: 'Un demi-ton plus haut' }).click();
    await page.getByRole('button', { name: 'Un demi-ton plus haut' }).click();
    const lane = await page.locator('.frise-voie').first().boundingBox();
    await page.mouse.move(lane.x + lane.width * 0.2, lane.y + lane.height / 2);
    await page.mouse.down();
    await page.mouse.move(lane.x + lane.width * 0.5, lane.y + lane.height / 2, { steps: 6 });
    await page.mouse.up();
    const doc = await waitForStored(page, (d) => d.playback.semitones === 3 && d.loop.region !== null, 'the key and the loop');
    const stored = await storedAudioBytes(page);
    assert.ok(stored >= minBytes, `the original file is stored whole: ${stored} bytes, expected at least ${minBytes}`);
    saved = { id: doc.project.id, title: doc.project.title, loop: doc.loop };
    await assertClean(page, problems, 'first launch');
  } finally {
    await app.close();
  }

  const launched = Date.now();
  ({ app, page, problems } = await launch(env, userData));
  try {
    // Back by itself, within a few seconds, without touching anything.
    await pieceReady(page, BACK_WITHIN_MS);
    const took = Date.now() - launched;
    const s = await state(page);
    assert.equal(s.project.id, saved.id);
    assert.equal(s.project.title, saved.title);
    assert.equal(s.playback.semitones, 3);
    assert.deepEqual(s.loop, saved.loop);
    assert.equal(await page.locator('.projet-titre').innerText(), saved.title);
    assert.equal(await page.locator('[data-testid="ton"]').innerText(), '+3');
    await page.waitForSelector('.frise[data-peaks="ready"]', { timeout: 30000 });
    await playsThenPauses(page);
    await assertClean(page, problems, 'relaunch');
    console.log(`${expectedSource}: ${(minBytes / 1e6).toFixed(1)} MB or more stored, back ${(took / 1000).toFixed(1)} s after the launch`);
  } finally {
    await app.close();
  }
}

test('a file of several MB comes back at the next launch, with its settings, and plays', async () => {
  const dir = tmp('fabtice-e2e-wav-');
  const file = path.join(dir, 'Grande prise.wav');
  const { bytes } = makeWavFile(file, { seconds: 35 });
  assert.ok(bytes > 5_000_000, `the test file is ${bytes} bytes`);
  await roundTrip({
    env: { FABTICE_YTDLP_PATH: STUB },
    importIt: (page) => page.locator('.accueil input[type="file"]').setInputFiles(file),
    expectedSource: 'file',
    minBytes: bytes,
  });
});

test('a piece imported from a link, of several MB, comes back at the next launch', async () => {
  const dir = tmp('fabtice-e2e-link-');
  const file = path.join(dir, 'audio.wav');
  const { bytes } = makeWavFile(file, { seconds: 35 });
  await roundTrip({
    env: { FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_FILE: file, FABTICE_STUB_MODE: 'dash' },
    importIt: async (page) => {
      await page.locator('.accueil input[type="url"]').fill(LINK);
      await page.getByRole('button', { name: 'Importer' }).click();
    },
    expectedSource: 'link',
    minBytes: bytes,
  });
});
