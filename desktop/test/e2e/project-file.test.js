'use strict';

// Lot 4, `.fabtice` projects inside the Mac app, end to end:
//   1. a WAV of several MB is imported, separated (the stand-in separator of
//      `?debug`: real 16-bit instruments of the piece's length), corrected by
//      hand, given a named loop and metronome settings;
//   2. « Exporter » → « Enregistrer le projet… », with the instruments: the
//      click becomes an Electron download whose save panel is the project's
//      (title, extension filter), and the file lands on disk (the panel itself
//      is stood in for, as in the other export tests: the main process gives
//      the download its place);
//   3. a fresh app (new user-data folder: nothing kept) is handed the file as
//      macOS does on a double-click (`open-file`), the page reads it through the
//      bridge, and everything comes back: tracks, instruments to the sample,
//      corrections, loop, metronome; then it is kept on the device and comes
//      back after a relaunch;
//   4. a damaged copy handed over the same way: a calm sentence, the open piece
//      untouched.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface, pieceReady, assertClean, makeWavFile } = require('./helpers');

// This machine has no graphics chip: the separation's device check says so in a warning, which is not a fault.
const NO_ADAPTER = /No available adapters|WebGPU.*(unavailable|not supported)|Failed to create WebGPU/i;
function clean(page, problems, label) {
  const kept = problems.filter((p) => !NO_ADAPTER.test(p));
  problems.length = 0;
  problems.push(...kept);
  return assertClean(page, problems, label);
}

const UTF8 = { LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' };

/** What is compared before and after: the document as the store makes it, and a few samples of each instrument. */
function snapshot(page) {
  return page.evaluate(() => {
    const f = window.__fabtice;
    const s = f.store.getState();
    const probe = (id) => {
      const a = f.lot3.registry.getAudio(id);
      if (!a) return null;
      const out = new Float32Array(16);
      f.lot3.pcm.readPcm(a, a.mono ? 0 : 1, Math.floor(a.frames / 2), out);
      return { frames: a.frames, mono: a.mono, samples: Array.from(out) };
    };
    const all = [...s.tracks, ...s.separation.aside];
    return {
      project: s.project.id,
      title: s.project.title,
      tracks: s.tracks.map((t) => ({ id: t.id, name: t.name, mute: t.mute, solo: t.solo, volume: t.volume, audio: t.audio.id })),
      aside: s.separation.aside.map((t) => t.id),
      separated: s.separation.result && s.separation.result.id,
      corrections: s.corrections,
      loop: s.loop,
      markers: s.markers,
      metronome: s.metronome,
      playback: s.playback,
      instruments: Object.fromEntries(all.filter((t) => t.audio.origin === 'separated').map((t) => [t.audio.id, probe(t.audio.id)])),
    };
  });
}

/** macOS hands the file over, as on a double-click in the Finder. */
function openAsFinderDoes(app, file) {
  return app.evaluate(({ app: electronApp }, p) => {
    electronApp.emit('open-file', { preventDefault() {} }, p);
  }, file);
}

test('a project saved in the app opens in a fresh app from the Finder, everything restored', { timeout: 600000 }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-projet-'));
  const userA = path.join(base, 'a');
  const userB = path.join(base, 'b');
  const saveDir = path.join(base, 'dl');
  for (const d of [userA, userB, saveDir]) fs.mkdirSync(d);
  const wav = path.join(base, 'Blues du dimanche.wav');
  const { bytes: wavBytes } = makeWavFile(wav, { seconds: 40 });
  let saved;
  let before;

  // 1 and 2: import, separate, work on it, save.
  {
    const { app, page, problems } = await launchInterface(UTF8, userA);
    try {
      await page.locator('.accueil input[type="file"]').setInputFiles(wav);
      await pieceReady(page);
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
      await page.evaluate(() => window.__fabtice.lot3.separation.startSeparation({ stems: ['vocals', 'bass'] }));
      await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 60000 });
      await page.evaluate(() => {
        const { store, lot4 } = window.__fabtice;
        store.setState((s) => ({
          loop: { region: { start: 2.25, end: 7.5 }, enabled: true },
          corrections: { ...s.corrections, key: { tonic: 10, mode: 'minor' } },
          playback: { ...s.playback, semitones: 3, cents: -7 },
        }));
        lot4.markers.saveCurrentLoop('Pont');
        lot4.metronome.setMetronomeVolume(0.3);
        lot4.metronome.setCountInBars(1);
      });
      // Let the autosave and the instruments' writing settle (they are what the next steps read).
      await page.waitForTimeout(1500);
      before = await snapshot(page);
      assert.ok(Object.keys(before.instruments).length >= 2, 'separated in several instruments');

      await app.evaluate(({ session }, dir) => {
        globalThis.__downloads = [];
        session.defaultSession.on('will-download', (_event, item) => {
          const options = item.getSaveDialogOptions();
          const target = `${dir}/${item.getFilename()}`;
          item.setSavePath(target);
          item.once('done', (_e, state) => globalThis.__downloads.push({ name: item.getFilename(), state, target, total: item.getTotalBytes(), options }));
        });
      }, saveDir);
      await page.click('button:has-text("Exporter")');
      await page.click('.menu-export [data-export="project"]');
      await page.waitForSelector('[data-testid="enregistrer-projet"]');
      await page.waitForSelector('[data-testid="avec-instruments"]');
      assert.equal(await page.isChecked('[data-testid="avec-instruments"]'), true, 'with the instruments by default');
      await page.click('[data-testid="preparer-projet"]');
      await page.waitForSelector('[data-testid="fichier-projet"]', { timeout: 120000 });
      await page.click('[data-testid="fichier-projet"]');
      for (let i = 0; i < 300 && (await app.evaluate(() => globalThis.__downloads.length)) === 0; i++) await page.waitForTimeout(100);
      const [d] = await app.evaluate(() => globalThis.__downloads);
      assert.equal(d.state, 'completed');
      assert.equal(d.name, 'Blues du dimanche.fabtice');
      assert.equal(d.options.title, 'Enregistrer le projet');
      assert.deepEqual(d.options.filters, [{ name: 'Projet Fabtice', extensions: ['fabtice'] }]);
      saved = d.target;
      const size = fs.statSync(saved).size;
      assert.equal(size, d.total);
      // The original as imported, plus two stereo instruments of 40 s at 48 kHz in 16 bits (7.7 MB each).
      assert.ok(size > wavBytes + 2 * 7_000_000, `realistic size: ${size} bytes`);
      const head = fs.readFileSync(saved).subarray(0, 59);
      assert.equal(head.toString('latin1', 30), 'mimetypeapplication/x-fabtice');
      await clean(page, problems, 'saving');
    } finally {
      await app.close();
    }
  }

  // 3. A fresh app, handed the file by macOS.
  {
    const { app, page, problems } = await launchInterface(UTF8, userB);
    try {
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().ui.newPieceOpen, null, { timeout: 30000 });
      await openAsFinderDoes(app, saved);
      await page.waitForFunction((id) => window.__fabtice.store.getState().project?.id === id, before.project, { timeout: 120000 });
      await pieceReady(page);
      const after = await snapshot(page);
      assert.deepEqual(after, before, 'everything restored, the instruments to the sample');
      assert.equal(await page.evaluate(() => window.__fabtice.store.getState().analysisRun.status), 'idle', 'not analysed again');
      await page.waitForTimeout(2000);
      await clean(page, problems, 'opening');
    } finally {
      await app.close();
    }
  }

  // ... and it is kept: a relaunch brings it back, instruments included.
  {
    const { app, page, problems } = await launchInterface(UTF8, userB);
    try {
      await page.waitForFunction((id) => window.__fabtice && window.__fabtice.store.getState().project?.id === id, before.project, { timeout: 120000 });
      await pieceReady(page);
      assert.deepEqual(await snapshot(page), before, 'kept on the device as it was opened');

      // 4. A damaged copy, handed over the same way: a calm sentence, the open piece stays.
      const bytes = fs.readFileSync(saved);
      const damaged = path.join(base, 'Abîmé.fabtice');
      fs.writeFileSync(damaged, bytes.subarray(0, Math.floor(bytes.length * 0.7)));
      await openAsFinderDoes(app, damaged);
      await page.waitForSelector('.import-erreur', { timeout: 60000 });
      const text = await page.textContent('.import-erreur');
      assert.match(text, /incomplet ou abîmé/);
      assert.equal(await page.evaluate(() => window.__fabtice.store.getState().project.id), before.project, 'the open piece is untouched');
      // Anything else handed over is ignored (only .fabtice files are read).
      await openAsFinderDoes(app, wav);
      await clean(page, problems, 'damaged file');
    } finally {
      await app.close();
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});
