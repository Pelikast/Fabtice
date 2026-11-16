'use strict';

// Lot 4, `.fab` projects inside the Mac app, end to end:
//   1. a WAV of several MB is imported, separated (the stand-in separator of
//      `?debug`: real 16-bit instruments of the piece's length), corrected by
//      hand, given a named loop and metronome settings;
//   2. « Exporter » → « Enregistrer le projet… » (« Enregistrer sous… »), with the
//      instruments: the save panel is the project's own (title, extension filter),
//      stood in for as in the other export tests (the main process gives it an
//      answer), and the file lands on disk, written by the main process;
//   3. a fresh app (new user-data folder: nothing kept) is handed the file as
//      macOS does on a double-click (`open-file`), the page reads it through the
//      bridge, and everything comes back: tracks, instruments to the sample,
//      corrections, loop, metronome; then it is kept on the device and comes
//      back after a relaunch;
//   4. a damaged copy handed over the same way: a calm sentence, the open piece
//      untouched.
//
// And C5, « Enregistrer » (last tests of the file): « Enregistrer sous… » through the system's save panel
// (stood in for), then cmd/Ctrl + S overwrites the same file (written to a temporary file beside it, renamed
// over it; fast: the sounds already in it are copied; the title and the « edited » dot follow), a second file
// becomes the project's; closing the window or cmd + Q with changes not saved asks first (« Annuler » stays,
// « Enregistrer » writes then quits, « Ne pas enregistrer » closes without touching the file); after a
// relaunch the file is remembered, a temporary file left by a dead save is removed, another project handed
// over by the Finder asks about the changes. (A kill in the middle of a write is tested at the writer's own
// level, `test/unit/project-writer.test.js`: a save is too quick here for a kill to land inside it.)
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

      // « Enregistrer sous… »: the system's panel is stood in for (the main process gives it an answer); the file is
      // written by the main process, through a temporary file renamed over the target.
      await app.evaluate(({ dialog }, dir) => {
        globalThis.__panels = [];
        dialog.showSaveDialog = async (_window, options) => {
          globalThis.__panels.push(options);
          return { canceled: false, filePath: `${dir}/${options.defaultPath.split('/').pop()}` };
        };
      }, saveDir);
      await page.click('button:has-text("Exporter")');
      await page.click('.menu-export [data-export="project"]');
      await page.waitForSelector('[data-testid="enregistrer-projet"]');
      await page.click('[data-testid="preparer-projet"]');
      await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'), null, { timeout: 120000 });
      const [panel] = await app.evaluate(() => globalThis.__panels);
      assert.equal(path.basename(panel.defaultPath), 'Blues du dimanche.fab');
      assert.equal(panel.title, 'Enregistrer le projet');
      assert.deepEqual(panel.filters, [{ name: 'Projet Fabtice', extensions: ['fab'] }]);
      const d = { target: path.join(saveDir, 'Blues du dimanche.fab') };
      assert.deepEqual(fs.readdirSync(saveDir), ['Blues du dimanche.fab'], 'the file, and no temporary file');
      saved = d.target;
      const size = fs.statSync(saved).size;
      // The original as imported, plus the instruments of 40 s in FLAC (7.7 MB each in 16 bits, about 60 % of that).
      assert.ok(size > wavBytes + 2 * 2_000_000 && size < wavBytes + 4 * 7_700_000, `realistic size: ${size} bytes`);
      // Saved: it is the first of the recent projects (the page sees its name and folder, never the path).
      await page.waitForTimeout(300);
      const recent = await page.evaluate(() => window.fabtice.recentProjects());
      assert.equal(recent[0] && recent[0].name, 'Blues du dimanche.fab', JSON.stringify(recent));
      // The page opens one by its token only: a path it would make up opens nothing.
      assert.deepEqual(await page.evaluate((p) => window.fabtice.openRecentProject(p), saved), { ok: false });
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
      // The web app's offline worker never runs in the Mac app (its pages come from the disk).
      const sw = await page.evaluate(async () => ({
        // On the app's own scheme the browser refuses service workers outright (InvalidStateError).
        registrations: navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations().then((r) => r.length, () => 0) : 0,
        manifest: document.querySelector('link[rel="manifest"]') !== null,
      }));
      assert.deepEqual(sw, { registrations: 0, manifest: false }, 'no service worker, no web manifest in the Mac app');
      await page.waitForTimeout(2000);
      await clean(page, problems, 'opening');
    } finally {
      await app.close();
    }
  }

  // ... and it is kept: a relaunch brings it back, instruments included; it is in the recent projects.
  {
    const { app, page, problems } = await launchInterface(UTF8, userB);
    try {
      await page.waitForFunction((id) => window.__fabtice && window.__fabtice.store.getState().project?.id === id, before.project, { timeout: 120000 });
      await pieceReady(page);
      assert.deepEqual(await snapshot(page), before, 'kept on the device as it was opened');

      // « Projets récents » in « Nouveau morceau »: the file opened from the Finder, opened again from there.
      await page.evaluate(() => window.__fabtice.actions.openNewPiece());
      await page.waitForSelector('[data-testid="projets-recents"] .lien', { timeout: 10000 });
      assert.equal((await page.textContent('[data-testid="projets-recents"] .lien')).trim(), 'Blues du dimanche');
      await page.screenshot({ path: path.join(base, 'recents.png') });
      if (process.env.FABTICE_E2E_SHOTS) fs.copyFileSync(path.join(base, 'recents.png'), path.join(process.env.FABTICE_E2E_SHOTS, 'projets-recents.png'));
      await page.click('[data-testid="projets-recents"] .lien');
      // The piece restored from the device's copy reads « modified »: the alert about changes not saved comes first.
      await page.waitForSelector('[data-testid="alerte-projet"]', { timeout: 10000 });
      await page.click('[data-testid="alerte-abandonner"]');
      await page.waitForFunction(() => window.__fabtice.store.getState().ui.import.kind === 'busy', null, { timeout: 10000 }).catch(() => {});
      await pieceReady(page);
      assert.deepEqual(await snapshot(page), before, 'opened again from the recent projects');

      // 4. A damaged copy, handed over the same way: a calm sentence, the open piece stays.
      const bytes = fs.readFileSync(saved);
      const damaged = path.join(base, 'Abîmé.fab');
      fs.writeFileSync(damaged, bytes.subarray(0, Math.floor(bytes.length * 0.7)));
      await openAsFinderDoes(app, damaged);
      await page.waitForSelector('.import-erreur', { timeout: 60000 });
      const text = await page.textContent('.import-erreur');
      assert.match(text, /incomplet ou abîmé/);
      assert.equal(await page.evaluate(() => window.__fabtice.store.getState().project.id), before.project, 'the open piece is untouched');
      // Anything else handed over is ignored (only .fab files are read).
      await openAsFinderDoes(app, wav);
      await clean(page, problems, 'damaged file');
    } finally {
      await app.close();
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------- C5: « Enregistrer », « Enregistrer sous… », the alert

const crypto = require('node:crypto');

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** CRC and size of each entry of a ZIP, from its central directory. */
function zipCrcs(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries = {};
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(at + 28);
    entries[buf.toString('utf8', at + 46, at + 46 + n)] = `${buf.readUInt32LE(at + 16)}:${buf.readUInt32LE(at + 24)}`;
    at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

const GUARD_ON = { FABTICE_NO_CLOSE_GUARD: '' };
const ALERT_TEXT = 'Les modifications du projet en cours n’ont pas été sauvegardées, voulez-vous enregistrer ?';
const tempFiles = (dir) => fs.readdirSync(dir).filter((n) => /\.tmp-/.test(n));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The system's save panel, answered by the test: the next path it is asked for. */
function stubPanel(app) {
  return app.evaluate(({ dialog }) => {
    globalThis.__panels = [];
    globalThis.__panelNext = null;
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.__panels.push(options);
      return globalThis.__panelNext ? { canceled: false, filePath: globalThis.__panelNext } : { canceled: true };
    };
  });
}
const panelAnswers = (app, filePath) => app.evaluate((_e, p) => void (globalThis.__panelNext = p), filePath);

/** What the main process was told about the window: the dot in the close button, the file in the title bar. */
function spyWindow(app) {
  return app.evaluate(({ BrowserWindow }) => {
    globalThis.__edited = [];
    globalThis.__represented = [];
    const edited = BrowserWindow.prototype.setDocumentEdited;
    BrowserWindow.prototype.setDocumentEdited = function (v) {
      globalThis.__edited.push(v);
      return edited.call(this, v);
    };
    const represented = BrowserWindow.prototype.setRepresentedFilename;
    BrowserWindow.prototype.setRepresentedFilename = function (v) {
      globalThis.__represented.push(v);
      return represented.call(this, v);
    };
  });
}
const lastEdited = (app) => app.evaluate(() => globalThis.__edited[globalThis.__edited.length - 1]);
const windowTitle = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
const windowOpen = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length > 0).catch(() => false);

async function changeSomething(page, cents) {
  await page.evaluate((c) => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: c } })), cents);
  await page.waitForFunction(() => window.__fabtice.history.isModified());
}

async function saved(page) {
  await page.waitForSelector('[data-testid="projet-enregistre"]', { timeout: 120000 });
  await page.waitForFunction(() => !window.__fabtice.history.isModified());
}

async function alertAnswer(page, choice) {
  await page.waitForSelector('[data-testid="alerte-projet"]', { timeout: 15000 });
  const text = (await page.textContent('[data-testid="alerte-texte"]')).trim();
  await page.click(`[data-testid="alerte-${choice}"]`);
  return text;
}

/** Closes an app whatever its state: the question « may the window go? » is switched off first, so that it cannot wait for an answer. */
async function closeWithoutAsking(app) {
  await app.evaluate(() => {
    process.env.FABTICE_NO_CLOSE_GUARD = '1';
  }).catch(() => {});
  await app.close().catch(() => {});
}

const exited = (app) =>
  new Promise((resolve) => {
    const proc = app.process();
    if (proc.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), 30000);
    proc.once('exit', () => (clearTimeout(timer), resolve(true)));
  });

test('« Enregistrer » and « Enregistrer sous… » in the app: the project\'s file, written safely and fast; the alert on closing and quitting', { timeout: 900000 }, async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-enregistrer-'));
  const userA = path.join(base, 'a');
  const folder = path.join(base, 'Mes projets');
  fs.mkdirSync(userA);
  fs.mkdirSync(folder);
  const wav = path.join(base, 'Blues du dimanche.wav');
  makeWavFile(wav, { seconds: 30 });
  const first = path.join(folder, 'Mon blues.fab');
  const second = path.join(folder, 'Copie.fab');
  let projectId;

  // ---- 1. A piece imported and separated; « Enregistrer sous… » through the system's panel (stood in for).
  {
    const { app, page, problems } = await launchInterface({ ...UTF8, ...GUARD_ON }, userA);
    try {
      await stubPanel(app);
      await spyWindow(app);
      await page.locator('.accueil input[type="file"]').setInputFiles(wav);
      await pieceReady(page);
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
      await page.evaluate(() => window.__fabtice.lot3.separation.startSeparation({ stems: ['vocals', 'bass'] }));
      await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      projectId = await page.evaluate(() => window.__fabtice.store.getState().project.id);
      // Title: the piece's, while it was never saved; a new piece is « modified » (the dot in the close button).
      assert.equal(await windowTitle(app), 'Blues du dimanche');
      assert.equal(await page.evaluate(() => window.__fabtice.history.isModified()), true);
      await page.waitForTimeout(300);
      assert.equal(await lastEdited(app), true, 'the Mac app is told: edited');

      // Ctrl/cmd + S on a piece never saved: where? (the dialog of « Enregistrer sous… », then the panel)
      await page.keyboard.press('Control+s');
      await page.waitForSelector('[data-testid="enregistrer-projet"]');
      // The panel is closed without a choice: nothing is written, the dialog stays.
      await page.click('[data-testid="preparer-projet"]');
      await page.waitForFunction(() => !!document.querySelector('[data-testid="preparer-projet"]'), null, { timeout: 15000 });
      assert.equal(fs.readdirSync(folder).length, 0, 'panel closed: nothing written');
      const t0 = Date.now();
      await panelAnswers(app, path.join(folder, 'Mon blues'));
      await page.click('[data-testid="preparer-projet"]');
      await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'), null, { timeout: 120000 });
      const firstMs = Date.now() - t0;
      await saved(page);
      assert.deepEqual(fs.readdirSync(folder), ['Mon blues.fab'], 'the .fab extension is added, no temporary file left');
      const panel = (await app.evaluate(() => globalThis.__panels)).pop();
      assert.equal(panel.title, 'Enregistrer le projet');
      assert.deepEqual(panel.filters, [{ name: 'Projet Fabtice', extensions: ['fab'] }]);
      assert.equal(path.basename(panel.defaultPath), 'Blues du dimanche.fab', 'the name proposed comes from the title');
      assert.equal(fs.readFileSync(first).subarray(30, 59).toString('latin1'), 'mimetypeapplication/x-fabtice');
      // The title bar: the file's name, the file's icon, no dot.
      await page.waitForTimeout(300);
      assert.equal(await windowTitle(app), 'Mon blues');
      assert.equal(await lastEdited(app), false, 'saved: the dot goes');
      assert.equal((await app.evaluate(() => globalThis.__represented)).pop(), first);
      const recent = await page.evaluate(() => window.fabtice.recentProjects());
      assert.equal(recent[0] && recent[0].name, 'Mon blues.fab');

      // A change, then cmd/Ctrl + S: THE SAME file is overwritten, safely and fast.
      const before = { sha: sha(first), mtime: fs.statSync(first).mtimeMs, crcs: zipCrcs(fs.readFileSync(first)) };
      await changeSomething(page, 14);
      await page.waitForTimeout(300);
      assert.equal(await lastEdited(app), true);
      await wait(20);
      const t1 = Date.now();
      await page.keyboard.press('Control+s');
      await saved(page);
      const secondMs = Date.now() - t1;
      assert.deepEqual(fs.readdirSync(folder), ['Mon blues.fab'], 'no temporary file left, no other file');
      assert.notEqual(sha(first), before.sha, 'the content changed');
      assert.ok(fs.statSync(first).mtimeMs > before.mtime, 'the file was written again');
      const after = zipCrcs(fs.readFileSync(first));
      const sounds = Object.keys(before.crcs).filter((n) => n.endsWith('.flac') || n.startsWith('audio/'));
      assert.ok(sounds.length >= 3, `sounds in the file: ${sounds.join(', ')}`);
      assert.deepEqual(sounds.map((n) => after[n]), sounds.map((n) => before.crcs[n]), 'every sound is the first save\'s, copied');
      assert.notEqual(after['projet.json'], before.crcs['projet.json']);
      assert.ok(secondMs < Math.max(firstMs, 2500), `fast: ${secondMs} ms against ${firstMs} ms`);
      assert.equal(await lastEdited(app), false);
      assert.equal(await windowTitle(app), 'Mon blues');
      assert.equal(await page.evaluate(() => window.__fabtice.project.getCurrentFile().name), 'Mon blues.fab');

      // « Enregistrer sous… » to a second path: a new file, which becomes the project's; the first is left as it was.
      const firstSha = sha(first);
      await panelAnswers(app, path.join(folder, 'Copie'));
      await page.keyboard.press('Control+Shift+s');
      await page.waitForSelector('[data-testid="enregistrer-projet"]');
      await page.click('[data-testid="preparer-projet"]');
      await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'), null, { timeout: 120000 });
      await saved(page).catch(() => {});
      assert.deepEqual(fs.readdirSync(folder).sort(), ['Copie.fab', 'Mon blues.fab']);
      assert.equal(sha(first), firstSha, 'the first file is untouched');
      assert.equal(await page.evaluate(() => window.__fabtice.project.getCurrentFile().name), 'Copie.fab');
      await page.waitForTimeout(300);
      assert.equal(await windowTitle(app), 'Copie');
      assert.equal((await page.evaluate(() => window.fabtice.recentProjects()))[0].name, 'Copie.fab', 'first in the recent projects');
      // The next « Enregistrer » is the new file's.
      const copySha = sha(second);
      await changeSomething(page, 21);
      await page.keyboard.press('Control+s');
      await saved(page);
      assert.notEqual(sha(second), copySha);
      assert.equal(sha(first), firstSha, 'still untouched');

      await clean(page, problems, 'saving');

      // Closing the window with changes not saved: the alert; « Annuler » keeps the window and the file.
      await changeSomething(page, 33);
      const keep = sha(second);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      assert.equal(await alertAnswer(page, 'annuler'), ALERT_TEXT);
      await page.waitForFunction(() => !document.querySelector('[data-testid="alerte-projet"]'));
      assert.equal(await windowOpen(app), true, '« Annuler »: the window stays');
      assert.equal(sha(second), keep, 'nothing written');
      assert.equal(await page.evaluate(() => window.__fabtice.history.isModified()), true);

      // cmd + Q: the same question; « Enregistrer » writes the file, then the app quits.
      await app.evaluate(({ app: electronApp }) => electronApp.quit());
      assert.equal(await alertAnswer(page, 'enregistrer'), ALERT_TEXT);
      assert.equal(await exited(app), true, 'saved, then the app quits');
      assert.notEqual(sha(second), keep, 'the file holds the last change');
      assert.deepEqual(tempFiles(folder), []);
    } finally {
      await closeWithoutAsking(app);
    }
  }

  // ---- 2. A relaunch: the piece comes back from the device's own copy; its file is remembered; stale temporary files go;
  //         another project handed over by the Finder asks about the changes; « Ne pas enregistrer » writes nothing.
  {
    const stale = path.join(folder, 'Copie.fab.tmp-0123456789abcdef');
    fs.writeFileSync(stale, 'half a file');
    const longAgo = new Date(Date.now() - 3600_000);
    fs.utimesSync(stale, longAgo, longAgo);
    const { app, page, problems } = await launchInterface({ ...UTF8, ...GUARD_ON }, userA);
    try {
      await page.waitForFunction((id) => window.__fabtice && window.__fabtice.store.getState().project?.id === id, projectId, { timeout: 120000 });
      await pieceReady(page);
      await spyWindow(app);
      await stubPanel(app);
      // Restored from the device's copy: modified (the last work is not in a file), and the file is found again.
      assert.equal(await page.evaluate(() => window.__fabtice.history.isModified()), true);
      await page.waitForFunction(() => window.__fabtice.project.getCurrentFile()?.name === 'Copie.fab', null, { timeout: 15000 });
      for (let i = 0; i < 50 && fs.existsSync(stale); i++) await wait(100);
      assert.equal(fs.existsSync(stale), false, 'the temporary file a dead save left is removed');
      // « Enregistrer » overwrites it with no question.
      const before = sha(second);
      await page.keyboard.press('Control+s');
      await saved(page);
      assert.notEqual(sha(second), before);
      assert.equal(await page.evaluate(() => !!document.querySelector('[data-testid="enregistrer-projet"]')), false, 'no dialog: it knew the file');
      assert.equal(await windowTitle(app), 'Copie');

      // Another project handed over by the Finder while this one has changes: the alert first.
      await changeSomething(page, 41);
      const firstBefore = sha(first);
      await openAsFinderDoes(app, first);
      assert.equal(await alertAnswer(page, 'annuler'), ALERT_TEXT);
      await page.waitForFunction(() => !document.querySelector('[data-testid="alerte-projet"]'));
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__fabtice.project.getCurrentFile().name), 'Copie.fab', '« Annuler »: the project stays');
      await openAsFinderDoes(app, first);
      await alertAnswer(page, 'abandonner');
      await page.waitForFunction(() => window.__fabtice.project.getCurrentFile()?.name === 'Mon blues.fab' && !window.__fabtice.history.isModified(), null, { timeout: 120000 });
      assert.equal(sha(first), firstBefore, '« Ne pas enregistrer »: nothing written to either file');
      assert.equal(await windowTitle(app), 'Mon blues');

      await clean(page, problems, 'relaunch');

      // Closing with changes, « Ne pas enregistrer »: the window closes, the file is not touched.
      await changeSomething(page, 55);
      const lastSha = sha(first);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      assert.equal(await alertAnswer(page, 'abandonner'), ALERT_TEXT);
      assert.equal(await exited(app), true, '« Ne pas enregistrer »: the app quits');
      assert.equal(sha(first), lastSha, 'the file was not touched');
      assert.deepEqual(tempFiles(folder), []);
    } finally {
      await closeWithoutAsking(app);
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});

