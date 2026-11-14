'use strict';

// « Exporter » → « Le son… » inside the Mac app, end to end: the interface makes
// the file (a WAV mix, then a ZIP of tracks, then an mp3 and a flac, with the
// real encoders under the app's strict security policy: no unsafe-eval, no
// network), the click on « Enregistrer … » becomes an Electron download, and a
// real file lands on disk with the right name (accents included), the right
// size and a valid header. The save panel is not shown: like the iReal Pro
// test, the main process gives the download its place (`setSavePath`), after the
// app's own handler (desktop/src/downloads.js) has set the panel's options, which
// the test reads back.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { launchInterface, pieceReady, assertClean } = require('./helpers');

/** The files of a ZIP, from its central directory. */
function readZip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, 'central header');
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const size = buf.readUInt32LE(at + 24);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.push({ name: buf.toString('utf8', at + 46, at + 46 + nameLen), flags: buf.readUInt16LE(at + 8), crc: buf.readUInt32LE(at + 16), data: buf.subarray(dataAt, dataAt + size) });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

/** Checks a 16-bit PCM WAV header against the size of the file; returns its frames. */
function checkWav(buf, label) {
  const channels = buf.readUInt16LE(22);
  assert.ok(channels === 1 || channels === 2, `${label}: one or two channels`);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${label}: RIFF`);
  assert.equal(buf.toString('ascii', 8, 16), 'WAVEfmt ', `${label}: WAVE fmt`);
  assert.equal(buf.readUInt32LE(4) + 8, buf.length, `${label}: the RIFF size is the file's`);
  assert.equal(buf.readUInt16LE(20), 1, `${label}: PCM`);
  assert.equal(buf.readUInt32LE(24), 48000, `${label}: 48 kHz`);
  assert.equal(buf.readUInt16LE(34), 16, `${label}: 16 bits`);
  assert.equal(buf.toString('ascii', 36, 40), 'data', `${label}: data chunk`);
  assert.equal(buf.readUInt32LE(40) + 44, buf.length, `${label}: the data size is the rest of the file`);
  return buf.readUInt32LE(40) / (2 * channels);
}

test('the sound exported in the app lands on disk: a WAV mix, a ZIP of tracks, an mp3 and a flac', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-audio-'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-audio-dl-'));
  // The demo piece, already separated in six instruments, on the real engine. A UTF-8 locale: in a bare Linux
  // container Chromium turns a non-ASCII download name into « download » (every Mac has a UTF-8 locale).
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo&separation=faite', LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 30000 });

    await app.evaluate(({ session }, dir) => {
      globalThis.__downloads = [];
      session.defaultSession.on('will-download', (_event, item) => {
        const options = item.getSaveDialogOptions();
        const target = `${dir}/${item.getFilename()}`;
        item.setSavePath(target);
        item.once('done', (_e, state) => globalThis.__downloads.push({ name: item.getFilename(), state, target, total: item.getTotalBytes(), options }));
      });
    }, saveDir);

    const frames = await page.evaluate(() => {
      const s = window.__fabtice.store.getState();
      return { total: Math.round(s.project.duration * 48000), tracks: s.tracks.map((t) => t.name) };
    });

    /** « Exporter » → « Le son… », the format, « Exporter », then the click on the link: returns the finished download. */
    async function exportFile({ what, format }) {
      const before = (await app.evaluate(() => globalThis.__downloads.length));
      await page.click('button:has-text("Exporter")');
      await page.click('.menu-export [data-export="audio"]');
      await page.waitForSelector('[data-testid="export-son"]');
      await page.click(`.choix-export .choix:has-text("${what === 'mix' ? 'Le mélange' : 'Les pistes'}")`);
      await page.click(`.formats-export button[data-format="${format}"]`);
      await page.click('[data-testid="exporter-son"]');
      await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 120000 });
      const url0 = page.url();
      await page.click('[data-testid="fichier-son"]');
      for (let i = 0; i < 200 && (await app.evaluate(() => globalThis.__downloads.length)) === before; i++) await page.waitForTimeout(100);
      const all = await app.evaluate(() => globalThis.__downloads);
      assert.equal(all.length, before + 1, 'one more download');
      assert.equal(page.url(), url0, 'the page did not navigate');
      assert.equal(app.windows().length, 1, 'no new window');
      const d = all[all.length - 1];
      assert.equal(d.state, 'completed');
      // The panel options the app set before the test took over.
      assert.equal(d.options.title, 'Enregistrer le fichier');
      assert.equal(path.basename(d.options.defaultPath), d.name, 'the panel proposes the file name');
      await page.click('[data-testid="export-son"] .fermer');
      return d;
    }

    // 1. The mix as a WAV: one file, named after the piece, with its accents.
    const wav = await exportFile({ what: 'mix', format: 'wav' });
    assert.equal(wav.name, 'Blues du dimanche – mélange.wav');
    assert.ok(fs.existsSync(wav.target), 'the file is on disk');
    const wavBytes = fs.readFileSync(wav.target);
    assert.equal(wavBytes.length, wav.total, 'the size on disk is the size of the download');
    const wavFrames = checkWav(wavBytes, 'mix');
    assert.ok(Math.abs(wavFrames - frames.total) <= 1, `the whole piece: ${wavFrames} frames vs ${frames.total}`);
    assert.equal(wavBytes.length, 44 + wavFrames * wavBytes.readUInt16LE(22) * 2, 'the size is a header and the samples');
    assert.ok(wavBytes.subarray(44).some((b) => b !== 0), 'not silence');

    // 2. The tracks as a ZIP of WAV files.
    const zip = await exportFile({ what: 'tracks', format: 'wav' });
    assert.equal(zip.name, 'Blues du dimanche – pistes.zip');
    const zipBytes = fs.readFileSync(zip.target);
    assert.equal(zipBytes.length, zip.total);
    assert.equal(zipBytes.readUInt32LE(0), 0x04034b50, 'a ZIP starts with a local header');
    const entries = readZip(zipBytes);
    assert.equal(entries.length, frames.tracks.length, 'one file per track');
    assert.deepEqual(entries.map((e) => e.name), frames.tracks.map((n) => `Blues du dimanche – ${n}.wav`), 'names in UTF-8, in the track order');
    for (const e of entries) {
      assert.ok(e.flags & 0x800, `${e.name}: UTF-8 flag`);
      assert.equal(zlib.crc32(e.data), e.crc, `${e.name}: CRC-32`);
      assert.ok(Math.abs(checkWav(e.data, e.name) - frames.total) <= 1, `${e.name}: the whole piece`);
    }
    const onDisk = fs.readdirSync(saveDir).sort();
    assert.deepEqual(onDisk, [wav.name, zip.name].sort(), 'nothing else was written');

    // 3. The encoders under the app's policy: the wasm files load from fabtice://app, no eval, no network.
    const flac = await exportFile({ what: 'mix', format: 'flac' });
    const flacBytes = fs.readFileSync(flac.target);
    assert.equal(flac.name, 'Blues du dimanche – mélange.flac');
    assert.equal(flacBytes.toString('ascii', 0, 4), 'fLaC');
    assert.equal(flacBytes.length, flac.total);
    const mp3 = await exportFile({ what: 'mix', format: 'mp3' });
    const mp3Bytes = fs.readFileSync(mp3.target);
    assert.equal(mp3.name, 'Blues du dimanche – mélange.mp3');
    assert.equal(mp3Bytes.toString('ascii', 0, 3), 'ID3');
    assert.equal(mp3Bytes.length, mp3.total);
    const tagSize = (mp3Bytes[6] << 21) | (mp3Bytes[7] << 14) | (mp3Bytes[8] << 7) | mp3Bytes[9];
    assert.equal(mp3Bytes.readUInt16BE(10 + tagSize) >>> 5, 0x7ff, 'a frame sync follows the tag');
    const sideInfo = mp3Bytes[10 + tagSize + 3] >> 6 === 3 ? 17 : 32; // mono, or stereo
    assert.equal(mp3Bytes.toString('ascii', 10 + tagSize + 4 + sideInfo, 10 + tagSize + 8 + sideInfo), 'Info', 'the Info frame');
    const csp = await page.evaluate(() => window.__csp);
    assert.deepEqual(csp, [], 'no policy violation while encoding');
    await assertClean(page, problems, 'audio export');
  } finally {
    await app.close();
  }
});
