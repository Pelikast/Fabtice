'use strict';

// « Exporter » → « Dossier pour Logic Pro… » inside the Mac app, end to end: a
// REAL folder, where the save panel said (the test answers the panel from the
// main process: `dialog.showSaveDialog` is read at call time), written file by
// file by the main process (folder-writer.js): the tracks in Wave 48 kHz 16 bits
// all of one length at the tempo chosen, the MIDI file (its tempo curve read
// back: every beat within a millisecond), Lisez-moi.txt. Then: an existing
// folder of that name is never replaced (« name 2 »), « Afficher dans le
// Finder » shows the folder, a cancelled panel writes nothing.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface, pieceReady, assertClean, menuCommand } = require('./helpers');

/** The app's own MIDI reader of the tests (`midi-file`, a devDependency of app/); null when not installed. */
function midiReader() {
  try {
    return require(path.join(ROOT, '..', 'app', 'node_modules', 'midi-file')).parseMidi;
  } catch {
    return null;
  }
}

/** Seconds at a tick, from the file's own tempo events. */
function secondsAt(midi, tick) {
  const ppq = midi.header.ticksPerBeat;
  let abs = 0;
  const tempos = midi.tracks[0].map((e) => ({ ...e, tick: (abs += e.deltaTime) })).filter((e) => e.type === 'setTempo');
  let t = 0;
  let at = 0;
  let us = 500000;
  for (const e of tempos) {
    if (e.tick > tick) break;
    t += ((e.tick - at) / ppq) * us * 1e-6;
    at = e.tick;
    us = e.microsecondsPerBeat;
  }
  return t + ((tick - at) / ppq) * us * 1e-6;
}

test('the folder for Logic Pro is a real folder where the panel said, never over an existing one', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-logic-'));
  // The real path: on macOS the temporary folder is reached through a link (/var -> /private/var).
  const saveDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-logic-out-')));
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo&separation=faite', LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result && window.__fabtice.lot3, null, { timeout: 30000 });

    // The system's panels, answered here: the folder goes in `saveDir` under the name proposed (or cancelled).
    await app.evaluate(({ dialog, shell }, dir) => {
      globalThis.__panels = [];
      globalThis.__shown = [];
      globalThis.__cancelPanel = false;
      dialog.showSaveDialog = async (_win, options) => {
        globalThis.__panels.push(options);
        if (globalThis.__cancelPanel) return { canceled: true };
        return { canceled: false, filePath: `${dir}/${options.defaultPath.split('/').pop()}` };
      };
      shell.showItemInFolder = (p) => globalThis.__shown.push(p);
    }, saveDir);

    await page.evaluate(() => {
      const a = window.__fabtice.actions;
      a.stepSemitones(-1);
      a.setTempoRatio(0.8);
    });
    const session = await page.evaluate(() => {
      const f = window.__fabtice;
      const s = f.lot3.sequencer.buildSession(f.store.getState());
      return { frames: s.frames, beats: s.beats.map((b) => [b.time, b.quarters]), startError: s.startError, tracks: s.tracks.map((t) => `${t.fileStem}.wav`), title: s.title };
    });

    /** Menu → the window → « Créer le dossier »; resolves with the end text. */
    async function exportFolder() {
      await menuCommand(page, 'Exporter', 'Dossier pour Logic Pro…');
      await page.waitForSelector('[data-testid="export-logic"]');
      const intro = await page.locator('[data-testid="export-logic"]').innerText();
      assert.match(intro, /Vous choisirez ensuite où enregistrer le dossier/, 'the Mac app says it will ask where');
      await page.click('[data-testid="creer-dossier-logic"]');
    }

    // 1. A cancelled panel: back to the window, nothing written.
    await app.evaluate(() => (globalThis.__cancelPanel = true));
    await exportFolder();
    await page.waitForFunction(() => document.querySelector('[data-testid="export-logic"]')?.dataset.phase === 'choose', null, { timeout: 10000 });
    assert.deepEqual(fs.readdirSync(saveDir), [], 'nothing written when the panel is cancelled');
    await page.click('[data-testid="export-logic"] .fermer');
    await app.evaluate(() => (globalThis.__cancelPanel = false));

    // 2. The folder.
    await exportFolder();
    await page.waitForSelector('[data-testid="fin-logic"]', { timeout: 180000 });
    const panel = (await app.evaluate(() => globalThis.__panels)).at(-1);
    assert.equal(panel.title, 'Enregistrer le dossier');
    const folderName = path.basename(panel.defaultPath);
    const planned = await page.evaluate(() => window.__fabtice.lot3.sequencer.planLogicFolder(window.__fabtice.store.getState()).folderName);
    assert.equal(folderName, planned, 'the panel proposes the folder of the plan');
    assert.match(folderName, /^Blues du dimanche – Logic Pro \(.*tempo 80 %\)$/, 'named after the piece and the changes');
    const end = await page.locator('[data-testid="fin-logic"]').innerText();
    assert.ok(end.includes(`« ${folderName} »`), `the end names the folder: ${end}`);
    const dir = path.join(saveDir, folderName);
    const names = fs.readdirSync(dir).sort();
    assert.deepEqual(names, [...session.tracks, `${session.title}.mid`, 'Lisez-moi.txt'].sort(), 'the tracks, the MIDI file, the read-me');
    for (const name of session.tracks) {
      const buf = fs.readFileSync(path.join(dir, name));
      const channels = buf.readUInt16LE(22);
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${name}: RIFF`);
      assert.equal(buf.readUInt32LE(24), 48000, `${name}: 48 kHz`);
      assert.equal(buf.readUInt16LE(34), 16, `${name}: 16 bits`);
      assert.equal(buf.readUInt32LE(40) + 44, buf.length, `${name}: the data is the rest of the file`);
      assert.equal(buf.readUInt32LE(40) / (2 * channels), session.frames, `${name}: exactly the length of the piece at 80 %`);
    }
    const midiBytes = fs.readFileSync(path.join(dir, `${session.title}.mid`));
    assert.equal(midiBytes.toString('ascii', 0, 4), 'MThd');
    const parseMidi = midiReader();
    if (parseMidi) {
      const midi = parseMidi(midiBytes);
      let worst = 0;
      session.beats.forEach(([time, quarters], i) => {
        if (i === 0 && session.startError !== 0) return;
        worst = Math.max(worst, Math.abs(secondsAt(midi, quarters * midi.header.ticksPerBeat) - time));
      });
      assert.ok(worst < 0.001, `every beat within a millisecond (worst ${worst * 1000} ms)`);
      assert.ok(midi.tracks[0].some((e) => e.type === 'marker'), 'markers');
    }
    const readme = fs.readFileSync(path.join(dir, 'Lisez-moi.txt'), 'utf8');
    assert.match(readme, /Fichier > Ouvrir/);

    // 3. « Afficher dans le Finder ».
    await page.click('[data-testid="afficher-dossier-logic"]');
    for (let i = 0; i < 50 && (await app.evaluate(() => globalThis.__shown.length)) === 0; i++) await page.waitForTimeout(100);
    assert.deepEqual(await app.evaluate(() => globalThis.__shown), [dir], 'the Finder shows the folder');
    await page.click('[data-testid="export-logic"] .fermer');

    // 4. Same name again: « name 2 » beside it, the first one untouched.
    const before = fs.statSync(path.join(dir, session.tracks[0])).mtimeMs;
    await exportFolder();
    await page.waitForSelector('[data-testid="fin-logic"]', { timeout: 180000 });
    assert.deepEqual(fs.readdirSync(saveDir).sort(), [folderName, `${folderName} 2`].sort(), 'a second folder, never over the first');
    assert.equal(fs.statSync(path.join(dir, session.tracks[0])).mtimeMs, before, 'the first folder untouched');
    assert.ok((await page.locator('[data-testid="fin-logic"]').innerText()).includes(`« ${folderName} 2 »`), 'the end gives the real name');
    await page.click('[data-testid="export-logic"] .fermer');
    await assertClean(page, problems, 'folder for Logic Pro');
  } finally {
    await app.close();
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
});
