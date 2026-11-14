'use strict';

// « Grille pour iReal Pro » inside the Mac app, end to end. The app forbids
// navigation and new windows, so the file has to leave as a real download; and
// « Ouvrir dans iReal Pro » goes through the one bridge method that hands an
// irealb:// link to the system. Nothing is launched for real: the main process's
// `shell.openExternal` is replaced by a recorder, and the download is given a
// place to land (Electron would ask the user with a save dialog).
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface, pieceReady, assertClean } = require('./helpers');

// A reader of the link written here from the format (app/src/export/IREAL-FORMAT.md), not the app's own code.
function unhussle(text) {
  let rest = text;
  let out = '';
  const rev = (s) => [...s].reverse().join('');
  while (rest.length > 50) {
    const seg = rest.slice(0, 50);
    rest = rest.slice(50);
    if (rest.length < 2) {
      out += seg;
      continue;
    }
    out += rev(seg.slice(45, 50)) + seg.slice(5, 10) + rev(seg.slice(26, 40)) + seg.slice(24, 26) + rev(seg.slice(10, 24)) + seg.slice(40, 45) + rev(seg.slice(0, 5));
  }
  return out + rest;
}

function readLink(link) {
  const fields = decodeURIComponent(link.replace(/^irealb:\/\//, '')).split('=');
  assert.equal(fields.length, 10, 'ten fields');
  const music = unhussle(fields[6].replace(/^1r34LbKcu7/, '')).replaceAll('XyQ', '   ').replaceAll('LZ', ' |').replaceAll('Kcl', '| x');
  const bars = [];
  const chord = /^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\/[A-G][b#]?)?/;
  let cells = [];
  let section = null;
  let s = music;
  while (s.length) {
    let m;
    if ((m = /^T\d\d/.exec(s)) || (m = /^<[^>]*>/.exec(s))) s = s.slice(m[0].length);
    else if ((m = /^\*([A-Za-z])/.exec(s))) {
      section = m[1];
      s = s.slice(2);
    } else if ('[{'.includes(s[0]) || s[0] === ',') s = s.slice(1);
    else if ('|]}Z'.includes(s[0])) {
      bars.push({ cells, section });
      cells = [];
      section = null;
      s = s.slice(1);
    } else if (s[0] === ' ') {
      cells.push('');
      s = s.slice(1);
    } else if ('npx'.includes(s[0])) {
      cells.push(s[0]);
      s = s.slice(1);
    } else if ((m = chord.exec(s))) {
      cells.push(m[0]);
      s = s.slice(m[0].length);
    } else assert.fail(`unexpected « ${s.slice(0, 8)} » in the chart string`);
  }
  return { title: fields[0], key: fields[4], bpm: Number(fields[8]), bars };
}

test('the file downloads inside the app and decodes to the chart; « Ouvrir dans iReal Pro » reaches the system once, with that link only', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-ireal-'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-ireal-dl-'));
  // `?demo`: the synthetic piece, analysed, with chords and sections.
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);

    // Main process: record what is asked of the system, and let downloads land in `saveDir`.
    await app.evaluate(({ shell, session }, dir) => {
      globalThis.__opened = [];
      globalThis.__openFails = false;
      globalThis.__downloads = [];
      globalThis.__navigated = 0;
      shell.openExternal = async (url) => {
        if (globalThis.__openFails) throw new Error('no application for this scheme');
        globalThis.__opened.push(url);
      };
      session.defaultSession.on('will-download', (_event, item) => {
        const target = `${dir}/${item.getFilename()}`;
        item.setSavePath(target);
        item.once('done', (_e, state) => globalThis.__downloads.push({ name: item.getFilename(), state, target, mime: item.getMimeType() }));
      });
    }, saveDir);

    // The menu: the file entry and, in the app only, « Ouvrir dans iReal Pro ».
    await page.click('button:has-text("Exporter")');
    await page.waitForSelector('.menu-export a[data-export="ireal"]', { timeout: 10000 });
    const items = await page.$$eval('.menu-export [role="menuitem"]', (els) => els.map((e) => `${e.dataset.export}:${e.tagName}:${e.getAttribute('download') || ''}`));
    assert.deepEqual(items, ['ireal:A:Blues du dimanche.html', 'ireal-open:BUTTON:', 'print:BUTTON:', 'audio:BUTTON:']);

    // The download: no navigation, no new window, and the file lands.
    const url0 = page.url();
    await page.click('.menu-export a[data-export="ireal"]');
    for (let i = 0; i < 100 && (await app.evaluate(() => globalThis.__downloads.length)) === 0; i++) await page.waitForTimeout(100);
    const downloads = await app.evaluate(() => globalThis.__downloads);
    assert.equal(downloads.length, 1, 'one download');
    assert.equal(downloads[0].state, 'completed');
    assert.equal(downloads[0].name, 'Blues du dimanche.html');
    assert.equal(downloads[0].mime, 'text/html');
    assert.equal(page.url(), url0, 'the page did not navigate');
    assert.equal(app.windows().length, 1, 'no new window');

    const html = fs.readFileSync(downloads[0].target, 'utf8');
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /ouvrez ce fichier avec iReal Pro/);
    const links = [...html.matchAll(/href="(irealb:\/\/[^"]*)"/g)].map((m) => m[1]);
    assert.equal(links.length, 1, 'one link in the page');
    const song = readLink(links[0]);
    assert.equal(song.title, 'Blues du dimanche');
    assert.equal(song.key, 'Ab');
    assert.equal(song.bpm, 110);
    assert.equal(song.bars.length, 25);
    assert.deepEqual(song.bars.slice(0, 4).map((b) => b.cells.find((c) => c !== '')), ['Ab^7', 'F-7', 'Bb-7', 'Eb7']);
    assert.deepEqual(song.bars.map((b) => b.section).filter(Boolean), ['A', 'B', 'A']);
    assert.ok(song.bars.some((b) => b.cells.filter((c) => c !== '' && c !== 'x' && c !== 'p').length === 2), 'a bar with two chords');

    // The link as the chart view shows it, after a transposition: the file follows the transport.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__fabtice.actions.stepSemitones(1);
    });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Exporter")');
    await page.click('.menu-export a[data-export="ireal"]');
    for (let i = 0; i < 100 && (await app.evaluate(() => globalThis.__downloads.length)) < 2; i++) await page.waitForTimeout(100);
    const second = (await app.evaluate(() => globalThis.__downloads))[1];
    assert.equal(second.state, 'completed');
    const html2 = fs.readFileSync(second.target, 'utf8');
    const song2 = readLink(/href="(irealb:\/\/[^"]*)"/.exec(html2)[1]);
    assert.equal(song2.key, 'Db');
    assert.equal(song2.bars[0].cells.find((c) => c !== ''), 'Db^7');

    // « Ouvrir dans iReal Pro »: the system gets that link and nothing else.
    await page.evaluate(() => window.__fabtice.actions.resetTransposition());
    await page.waitForTimeout(300);
    await page.click('button:has-text("Exporter")');
    await page.click('.menu-export [data-export="ireal-open"]');
    for (let i = 0; i < 50 && (await app.evaluate(() => globalThis.__opened.length)) === 0; i++) await page.waitForTimeout(100);
    assert.deepEqual(await app.evaluate(() => globalThis.__opened), [links[0]], 'openExternal got the chart link, once');
    assert.equal(await page.locator('.menu-export').count(), 0, 'the menu closed');

    // The bridge refuses everything else, and never reaches the system for it.
    const refused = await page.evaluate(async () => {
      const bad = ['https://example.org/', 'file:///Applications/Calculator.app', 'irealbook://a=b=c=C=n=d', 'IREALB://a', 'irealb://a b', 'irealb://a%zz', `irealb://${'a'.repeat(200000)}`, '', 42, null];
      const out = [];
      for (const link of bad) out.push(await window.fabtice.openInIRealPro(link));
      return out;
    });
    assert.ok(refused.every((r) => r.ok === false && r.reason === 'invalid'), JSON.stringify(refused));
    assert.equal((await app.evaluate(() => globalThis.__opened.length)), 1, 'the system was not asked again');
    assert.deepEqual(await page.evaluate(() => window.fabtice.openInIRealPro(`irealb://${'a'.repeat(199991)}`)), { ok: true });
    assert.equal((await app.evaluate(() => globalThis.__opened.length)), 2, 'a link of exactly the bound passes');

    // iReal Pro missing: the system refuses, the interface says so and keeps the menu open on the file entry.
    await app.evaluate(() => {
      globalThis.__openFails = true;
    });
    await page.click('button:has-text("Exporter")');
    await page.click('.menu-export [data-export="ireal-open"]');
    await page.locator('.menu-export .option-erreur').waitFor({ timeout: 10000 });
    assert.match(await page.locator('.menu-export .option-erreur').innerText(), /iReal Pro n’a pas pu être ouvert/);
    assert.equal(await page.locator('.menu-export a[data-export="ireal"]').count(), 1, 'the file entry is still offered');
    assert.equal((await app.evaluate(() => globalThis.__opened.length)), 2);

    // The protections that were there stay.
    const guarded = await page.evaluate(async () => {
      const w = window.open('https://example.org/');
      return { opened: w !== null };
    });
    assert.equal(guarded.opened, false, 'window.open still denied');
    assert.equal(app.windows().length, 1);
    await assertClean(page, problems, 'iReal Pro export');
  } finally {
    await app.close();
  }
});
