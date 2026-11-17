'use strict';

// « Exporter » → « Projet Ableton Live… » inside the Mac app, end to end: a
// REAL folder « … Project », where the save panel said (answered from the main
// process), written file by file by the main process (folder-writer.js), with
// its sub-folders: Samples/Imported/ (the tracks in Wave 48 kHz 16 bits, all
// of one length at the tempo chosen), the two sets, the MIDI file, Lisez-moi.txt.
// Each set unpacked: its clips name the files of the folder by their relative
// path AND by their full path (the Mac app knows where the folder is), with
// their size and Live's checksum; Python's XML parser reads it when python3 is
// there (app/src/export/ableton/check_structure.py). Then: « Annuler » during
// the tracks removes everything written, sub-folders included; the same name
// again gives « name 2 », and its sets name the files of « name 2 ».
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { ROOT, launchInterface, pieceReady, assertClean, menuCommand } = require('./helpers');

const CHECKER = path.join(ROOT, '..', 'app', 'src', 'export', 'ableton', 'check_structure.py');

/** Live's checksum of a file: CRC-16/UMTS of its first 16 384 bytes (written again here, independently). */
function liveCrc(buf) {
  let crc = 0;
  for (const byte of buf.subarray(0, 16384)) {
    crc ^= byte << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const python = ['python3', 'python'].find((p) => spawnSync(p, ['-I', '-c', 'import xml.etree.ElementTree'], { encoding: 'utf8' }).status === 0) || null;

test('the Ableton Live project is a real folder with its sub-folders, its sets naming the files where they are', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-ableton-'));
  const saveDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-ableton-out-')));
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo&separation=faite', LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result && window.__fabtice.lot3, null, { timeout: 30000 });

    await app.evaluate(({ dialog, shell }, dir) => {
      globalThis.__panels = [];
      globalThis.__shown = [];
      dialog.showSaveDialog = async (_win, options) => {
        globalThis.__panels.push(options);
        return { canceled: false, filePath: `${dir}/${options.defaultPath.split('/').pop()}` };
      };
      shell.showItemInFolder = (p) => globalThis.__shown.push(p);
    }, saveDir);

    await page.evaluate(() => window.__fabtice.actions.setTempoRatio(0.8));
    const plan = await page.evaluate(() => {
      const f = window.__fabtice;
      const p = f.lot3.sequencer.planAbletonFolder(f.store.getState());
      return { folderName: p.folderName, set: p.setName, set10: p.set10Name, midi: p.midiName, tracks: p.tracks.map((t) => t.name), frames: p.session.frames };
    });
    assert.match(plan.folderName, /^Blues du dimanche \(tempo 80 %\) Project$/);

    async function exportFolder() {
      await menuCommand(page, 'Exporter', 'Projet Ableton Live…');
      await page.waitForSelector('[data-testid="export-ableton"]');
      const intro = await page.locator('[data-testid="export-ableton"]').innerText();
      assert.match(intro, /À l’essai/i, 'the window says « à l’essai »');
      assert.match(intro, /Vous choisirez ensuite où enregistrer le dossier/, 'the Mac app says it will ask where');
      await page.click('[data-testid="creer-dossier-ableton"]');
    }

    // 1. « Annuler » while the tracks are made: nothing left, sub-folders included.
    await exportFolder();
    await page.waitForSelector('[data-testid="pourcentage-ableton"]', { timeout: 30000 });
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="export-ableton"]')?.dataset.phase === 'choose', null, { timeout: 30000 });
    assert.deepEqual(fs.readdirSync(saveDir), [], 'nothing left after « Annuler »');
    await page.click('[data-testid="export-ableton"] .fermer');

    // 2. The folder.
    await exportFolder();
    await page.waitForSelector('[data-testid="fin-ableton"]', { timeout: 240000 });
    const dir = path.join(saveDir, plan.folderName);
    const checkFolder = (folder) => {
      const top = fs.readdirSync(folder).sort();
      assert.deepEqual(top, ['Lisez-moi.txt', 'Samples', plan.midi, plan.set, plan.set10].sort(), 'the sets, the MIDI file, the read-me, Samples/');
      assert.deepEqual(
        fs.readdirSync(path.join(folder, 'Samples', 'Imported')).sort(),
        plan.tracks.map((t) => t.split('/').pop()).sort(),
        'the tracks in Samples/Imported',
      );
      const facts = {};
      for (const rel of plan.tracks) {
        const buf = fs.readFileSync(path.join(folder, ...rel.split('/')));
        assert.equal(buf.readUInt32LE(24), 48000, `${rel}: 48 kHz`);
        assert.equal(buf.readUInt16LE(34), 16, `${rel}: 16 bits`);
        assert.equal(buf.readUInt32LE(40) / (2 * buf.readUInt16LE(22)), plan.frames, `${rel}: the length of the piece at 80 %`);
        facts[rel] = { size: buf.length, crc: liveCrc(buf) };
      }
      const xml11 = zlib.gunzipSync(fs.readFileSync(path.join(folder, plan.set))).toString('utf8');
      const xml10 = zlib.gunzipSync(fs.readFileSync(path.join(folder, plan.set10))).toString('utf8');
      assert.match(xml11, /MinorVersion="11\.0_433"/);
      assert.match(xml10, /MinorVersion="10\.0_377"/);
      for (const rel of plan.tracks) {
        const full = path.join(folder, ...rel.split('/'));
        assert.ok(xml11.includes(`<RelativePath Value="${rel}" />`), `${rel}: by its relative path`);
        assert.ok(xml11.includes(`<Path Value="${full}" />`), `${rel}: by its full path (${full})`);
        assert.ok(xml11.includes(`<OriginalFileSize Value="${facts[rel].size}" />`), `${rel}: its size`);
        assert.ok(xml11.includes(`<OriginalCrc Value="${facts[rel].crc}" />`), `${rel}: Live's checksum`);
        assert.ok(xml10.includes(`<Crc Value="${facts[rel].crc}" />`), `${rel}: Live 10's checksum`);
      }
      for (const set of [plan.set, plan.set10]) {
        if (!python) continue;
        const tmp = path.join(os.tmpdir(), `fabtice-e2e-${process.pid}.als`);
        fs.writeFileSync(tmp, fs.readFileSync(path.join(folder, set)));
        const r = spawnSync(python, ['-I', CHECKER, tmp], { encoding: 'utf8' });
        fs.rmSync(tmp, { force: true });
        assert.equal(r.status, 0, r.stderr);
        assert.deepEqual(JSON.parse(r.stdout).errors, [], `${set}: read back by Python's XML parser`);
      }
      assert.equal(fs.readFileSync(path.join(folder, plan.midi)).toString('ascii', 0, 4), 'MThd');
      assert.match(fs.readFileSync(path.join(folder, 'Lisez-moi.txt'), 'utf8'), /À L’ESSAI/);
    };
    checkFolder(dir);
    const end = await page.locator('[data-testid="export-ableton"]').innerText();
    assert.ok(end.includes(`« ${plan.folderName} »`), 'the end names the folder');
    assert.match(end, /Live 11 ou 12 : ouvrez « Blues du dimanche\.als »/);

    // 3. « Afficher dans le Finder ».
    await page.click('[data-testid="afficher-dossier-ableton"]');
    for (let i = 0; i < 50 && (await app.evaluate(() => globalThis.__shown.length)) === 0; i++) await page.waitForTimeout(100);
    assert.deepEqual(await app.evaluate(() => globalThis.__shown), [dir], 'the Finder shows the folder');
    await page.click('[data-testid="export-ableton"] .fermer');

    // 4. Same name again: « name 2 », whose sets name ITS files.
    await exportFolder();
    await page.waitForSelector('[data-testid="fin-ableton"]', { timeout: 240000 });
    assert.deepEqual(fs.readdirSync(saveDir).sort(), [plan.folderName, `${plan.folderName} 2`].sort(), 'a second folder, never over the first');
    checkFolder(path.join(saveDir, `${plan.folderName} 2`));
    assert.ok((await page.locator('[data-testid="export-ableton"]').innerText()).includes(`« ${plan.folderName} 2 »`), 'the end gives the real name');
    await page.click('[data-testid="export-ableton"] .fermer');
    await assertClean(page, problems, 'Ableton Live project');
  } finally {
    await app.close();
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
});
