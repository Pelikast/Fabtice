// « Projet Ableton Live… » (C15.5) in Chromium, on the demo piece (moving
// tempo, chords, sections), in both forms (computer 1280 × 800 at the mouse,
// phone 390 × 844 at a touch):
//   - the entry is in « Exporter », after « Dossier pour Logic Pro… »; its
//     window says « à l'essai » first, what the folder holds, that volume,
//     mute and solo do not apply; no text is cut in its buttons; Escape closes;
//   - the web hands a .zip whose entries are inside one folder « … Project »:
//     the tracks in Samples/Imported (Wave 48 kHz 16 bits, all of one length,
//     the tempo chosen included), the two sets, the MIDI file, Lisez-moi.txt;
//   - each set unpacked and read by Python's XML parser (check_structure.py):
//     its structure, its clips naming files that are in the archive with their
//     length, every beat of the grid within a millisecond on Live's timeline;
//     the MIDI file read back by an independent reader (`midi-file`);
//   - the percentage goes up while the tracks render, « Annuler » stops and
//     leaves no file; the end says which set to open and what to do when Live
//     says files are missing.
//   npm run build && npm run test:export-ableton
// Screenshots go to $FABTICE_CAPTURES (default /tmp/fabtice-captures-D); the
// folder of the computer run, unpacked, to $FABTICE_ESSAIS (default /tmp/fabtice-essais-D).

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { startServer } from './serve.mjs';
import { menuCommand, menuEntry, menuOpenTo, closeMenu } from './lib/menu.mjs';
import { midiClock, readZip, wavInfo } from './lib/sequencer.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');
const { parseMidi } = createRequire(import.meta.url)('midi-file');

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, '../src/export/ableton/check_structure.py');
const out = process.env.FABTICE_CAPTURES || '/tmp/fabtice-captures-D';
const essais = process.env.FABTICE_ESSAIS || '/tmp/fabtice-essais-D';
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const python = ['python3', 'python'].find((p) => spawnSync(p, ['-I', '-c', 'import xml.etree.ElementTree'], { encoding: 'utf8' }).status === 0) ?? null;

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'], env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });

async function open(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/?demo&moteur=factice&rendu=lent`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.waitForFunction(() => window.__fabtice.lot3, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

const press = async (page, locator, touch) => (touch ? locator.tap() : locator.click());

/** Every button and link of the window shows its whole text (none cut, none overflowing). */
async function nothingCut(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="export-ableton"] button, [data-testid="export-ableton"] a')]
      .filter((b) => b.offsetParent !== null && b.textContent.trim())
      .filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)
      .map((b) => b.textContent.trim()),
  );
}

/** The whole window, even when it scrolls: its box taller than the screen is captured by parts. */
async function shootWindow(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const box = page.locator('.export-ableton');
  const scroll = await box.evaluate((el) => ({ h: el.scrollHeight, c: el.clientHeight }));
  if (scroll.h > scroll.c + 1) {
    await box.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.screenshot({ path: path.join(out, `${name}-bas.png`) });
    await box.evaluate((el) => el.scrollTo(0, 0));
  } else {
    fs.rmSync(path.join(out, `${name}-bas.png`), { force: true });
  }
  return scroll;
}

async function run(form) {
  const touch = form === 'telephone';
  const viewport = touch ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const { context, page, errors } = await open(viewport, touch);
  const tag = `${form}`;

  // ------------------------------------------------------------ the entry
  await menuOpenTo(page, 'Exporter');
  const sub = touch ? '.feuille-menu-liste' : '.menu-fabtice';
  const labels = (await page.locator(`${sub} [role="menuitem"] .menu-texte`).allTextContents()).map((s) => s.trim());
  const at = labels.indexOf('Projet Ableton Live…');
  check(`${tag}: « Projet Ableton Live… » is in « Exporter », after « Dossier pour Logic Pro… »`, at > 0 && labels[at - 1] === 'Dossier pour Logic Pro…', labels.join(' | '));
  await page.screenshot({ path: path.join(out, `${tag}-menu-exporter.png`) });
  await closeMenu(page);
  const entry = await menuEntry(page, 'Exporter', 'Projet Ableton Live…');
  check(`${tag}: the entry can be chosen with a piece open`, entry.enabled === true);
  await closeMenu(page);

  // A key and a tempo of its own: +2 semitones, tempo 90 %.
  await page.evaluate(() => {
    const a = window.__fabtice.actions;
    a.stepSemitones(1);
    a.stepSemitones(1);
    a.setTempoRatio(0.9);
  });
  await menuCommand(page, 'Exporter', 'Projet Ableton Live…');
  const dialog = page.locator('[data-testid="export-ableton"]');
  await dialog.waitFor({ timeout: 5000 });
  const text = await dialog.innerText();
  check(`${tag}: the window says « à l'essai » first, and that the MIDI file and the tracks work in any case`, /^Projet Ableton Live\s+À l’essai/i.test(text.trim()) && /Personne n’a encore pu ouvrir/.test(text) && /marchent dans tous les cas/.test(text), text.slice(0, 200));
  check(`${tag}: it says what the folder holds, that volume, mute and solo do not apply, the key chosen`, /Blues du dimanche\.als/.test(text) && /\(Live 10\)\.als/.test(text) && /Wave \(48 kHz, 16 bits\)/.test(text) && /fichier MIDI/.test(text) && /volume, le muet et le solo ne s’appliquent pas/.test(text) && /\+2 demi-tons/.test(text));
  check(`${tag}: on the web, the folder comes as a .zip`, /archive \.zip/.test(text));
  const go = page.locator('[data-testid="creer-dossier-ableton"]');
  const goBox = await go.boundingBox();
  check(`${tag}: the main button is in ink`, (await go.evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(43, 31, 23)');
  const winBox = await page.locator('.export-ableton').boundingBox();
  if (touch) {
    check(`${tag}: a sheet at the bottom, full width, buttons stacked full width at least 44 px`, Math.abs(winBox.x) < 1 && Math.abs(winBox.width - 390) < 1 && Math.abs(winBox.y + winBox.height - 844) < 2 && goBox.width > 340 && goBox.height >= 44, JSON.stringify({ winBox, goBox }));
  } else {
    check(`${tag}: everything fits on the screen`, winBox.height < 800 && winBox.y >= 0, JSON.stringify(winBox));
  }
  check(`${tag}: no text cut in the window's buttons`, (await nothingCut(page)).length === 0, (await nothingCut(page)).join(' | '));
  await shootWindow(page, `${tag}-ableton-fenetre`);
  check(`${tag}: the window is in the way of the commands`, (await page.locator('.app[inert]').count()) === 1);

  // ------------------------------------------------------------ cancel in the middle
  await press(page, go, touch);
  await page.locator('[data-testid="pourcentage-ableton"]').waitFor({ timeout: 10000 });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const p = await page.locator('[data-testid="pourcentage-ableton"]').textContent().catch(() => null);
    if (p) seen.push(parseInt(p, 10));
    await sleep(250);
  }
  await page.screenshot({ path: path.join(out, `${tag}-ableton-attente.png`) });
  const rising = seen.every((v, i) => i === 0 || v >= seen[i - 1]) && seen.at(-1) > seen[0];
  check(`${tag}: the percentage goes up while the tracks are made`, rising, seen.join(' '));
  check(`${tag}: no text cut during the wait`, (await nothingCut(page)).length === 0);
  await press(page, page.getByRole('button', { name: 'Annuler' }), touch);
  await page.waitForFunction(() => document.querySelector('[data-testid="export-ableton"]')?.dataset.phase === 'choose', null, { timeout: 10000 });
  check(`${tag}: « Annuler » goes back to the window, no file`, (await page.locator('[data-testid="fichier-ableton"]').count()) === 0);

  // ------------------------------------------------------------ the whole folder (faster renderer now)
  await page.evaluate(() => {
    const r = window.__fabtice.lot3.renderer;
    r.replaceRenderer(new r.MockRenderer());
  });
  await press(page, go, touch);
  const link = page.locator('[data-testid="fichier-ableton"]');
  await link.waitFor({ timeout: 120000 });
  const end = await dialog.innerText();
  check(`${tag}: the end says which set to open in which Live, and what to do when files are missing`, /Live 11 ou 12 : ouvrez « Blues du dimanche\.als »/.test(end) && /Live 10 : ouvrez « Blues du dimanche \(Live 10\)\.als »/.test(end) && (await page.locator('[data-testid="gestes-ableton"] li').count()) === 3 && /À l’essai/i.test(end));
  check(`${tag}: no text cut at the end`, (await nothingCut(page)).length === 0, (await nothingCut(page)).join(' | '));
  await shootWindow(page, `${tag}-ableton-fin`);
  const [download] = await Promise.all([page.waitForEvent('download'), press(page, link, touch)]);
  const zipName = download.suggestedFilename();
  const buf = fs.readFileSync(await download.path());
  const files = readZip(buf);
  const session = await page.evaluate(() => {
    const f = window.__fabtice;
    const seq = f.lot3.sequencer;
    const s = seq.buildSession(f.store.getState(), { tempoRange: { min: 20, max: 999 } });
    const q = seq.quartersMap(s);
    return { frames: s.frames, beats: s.beats.map((b) => [b.time, b.quarters, q(b.quarters)]), startError: s.startError, meters: s.meters, chords: s.chords.length };
  });
  const folder = zipName.replace(/\.zip$/, '');
  check(`${tag}: the archive is the folder « Titre (changes) Project »`, folder === 'Blues du dimanche (+2 demi-tons, tempo 90 %) Project', zipName);
  check(`${tag}: every entry is inside the one folder`, files.every((f) => f.name.startsWith(`${folder}/`)), files.map((f) => f.name).join(', '));
  const names = files.map((f) => f.name.slice(folder.length + 1));
  const trackCount = await page.evaluate(() => window.__fabtice.store.getState().tracks.length);
  const wavs = files.filter((f) => f.name.endsWith('.wav'));
  check(
    `${tag}: the tracks in Samples/Imported, numbered, then the two sets, the MIDI file, Lisez-moi.txt`,
    wavs.length === trackCount && names.slice(0, trackCount).every((n, i) => n.startsWith(`Samples/Imported/${String(i + 1).padStart(2, '0')} `)) && names.slice(trackCount).join(',') === 'Blues du dimanche.als,Blues du dimanche (Live 10).als,Blues du dimanche.mid,Lisez-moi.txt',
    names.join(', '),
  );
  const infos = wavs.map((f) => wavInfo(f.data));
  check(`${tag}: Wave 48 kHz 16 bits, all exactly the length of the piece at 90 %`, infos.every((w) => w.riff && w.declared && w.rate === 48000 && w.bits === 16 && w.frames === session.frames), `${infos.map((w) => w.frames).join(', ')} vs ${session.frames}`);

  // The two sets: unpacked, read by Python's XML parser.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-als-'));
  for (const [setName, minor] of [['Blues du dimanche.als', '11.0_433'], ['Blues du dimanche (Live 10).als', '10.0_377']]) {
    const entry = files.find((f) => f.name === `${folder}/${setName}`);
    const xml = gunzipSync(entry.data).toString('utf8');
    check(`${tag}: « ${setName} » is gzip around Live's XML (${minor})`, entry.data[0] === 0x1f && entry.data[1] === 0x8b && xml.includes(`MinorVersion="${minor}"`));
    if (!python) {
      console.log(`SKIP  ${tag}: python3 missing, « ${setName} » not parsed`);
      continue;
    }
    const file = path.join(tmp, `${minor}.als`);
    fs.writeFileSync(file, entry.data);
    const r = spawnSync(python, ['-I', checker, file], { encoding: 'utf8' });
    const read = r.status === 0 ? JSON.parse(r.stdout) : null;
    check(`${tag}: « ${setName} » read by an XML parser: structure, ids, envelopes, clips`, read && read.errors.length === 0 && read.minorVersion === minor, read ? read.errors.join(' / ') : r.stderr.slice(-300));
    if (!read) continue;
    const present = new Set(names);
    check(
      `${tag}: « ${setName} »: each clip names a file of the folder, with its length, size and checksum`,
      read.tracks.length === trackCount && read.tracks.every((t, i) => present.has(t.relativePath) && t.frames === session.frames && t.rate === 48000 && t.size === wavs[i].data.length && t.crc > 0 && t.path === ''),
      read.tracks.map((t) => `${t.relativePath} ${t.frames} ${t.size}`).join(', '),
    );
    const steps = [{ q: 0, bpm: read.tempo[0][1] }];
    for (let i = 1; i < read.tempo.length; i += 2) steps.push({ q: read.tempo[i + 1][0], bpm: read.tempo[i + 1][1] });
    const seconds = (q) => {
      let t = 0;
      for (let i = 0; i < steps.length; i++) {
        const endQ = i + 1 < steps.length ? steps[i + 1].q : Infinity;
        t += ((Math.min(q, endQ) - steps[i].q) * 60) / steps[i].bpm;
        if (q <= endQ) break;
      }
      return t;
    };
    let worst = 0;
    for (const [i, [time, , liveQ]] of session.beats.entries()) {
      if (i === 0 && session.startError !== 0) continue;
      worst = Math.max(worst, Math.abs(seconds(liveQ) - time));
    }
    check(`${tag}: « ${setName} »: every beat of the grid within a millisecond on Live's tempo curve`, session.beats.length > 50 && worst < 0.001, `${session.beats.length} beats, worst ${(worst * 1000).toFixed(4)} ms`);
    check(`${tag}: « ${setName} »: the chords and sections as locators, the keys too`, read.locators.length >= session.chords / 2 && read.locators.some(([, n]) => n.includes('[A]')) && read.locators.some(([, n]) => n.startsWith('Tonalité ')), read.locators.slice(0, 4).map((l) => l[1]).join(' | '));
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const midi = parseMidi(files.find((f) => f.name.endsWith('.mid')).data);
  const clock = midiClock(midi);
  let worstMidi = 0;
  for (const [i, [time, quarters]] of session.beats.entries()) {
    if (i === 0 && session.startError !== 0) continue;
    worstMidi = Math.max(worstMidi, Math.abs(clock.seconds(quarters * clock.ppq) - time));
  }
  check(`${tag}: the MIDI file (fallback) read back independently: every beat within a millisecond`, worstMidi < 0.001, `worst ${(worstMidi * 1000).toFixed(4)} ms`);
  const readme = files.find((f) => f.name.endsWith('Lisez-moi.txt')).data.toString('utf8');
  check(`${tag}: Lisez-moi.txt in French, UTF-8: à l'essai, which set, missing files, the fallback`, readme.charCodeAt(0) === 0xfeff && /À L’ESSAI/.test(readme) && /fichiers manquants/.test(readme) && /Si rien ne marche/.test(readme) && /Warp/.test(readme));
  fs.writeFileSync(path.join(out, `${tag}-${zipName}`), buf);
  if (!touch) {
    // The folder, unpacked, for a look (and for the independent readers).
    fs.rmSync(essais, { recursive: true, force: true });
    for (const f of files) {
      const p = path.join(essais, f.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.data);
    }
  }
  await press(page, page.getByRole('button', { name: 'Fermer' }).last(), touch);
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-ableton"]'), null, { timeout: 5000 });

  // ------------------------------------------------------------ Escape closes the window
  if (!touch) {
    await menuCommand(page, 'Exporter', 'Projet Ableton Live…');
    await dialog.waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="export-ableton"]'), null, { timeout: 5000 });
    check(`${tag}: Escape closes the window`, true);
  }
  check(`${tag}: no error on the page`, errors.length === 0, errors.slice(0, 3).join(' / '));
  await context.close();
}

try {
  await run('ordinateur');
  await run('telephone');
} catch (e) {
  failed++;
  console.log(`FAIL  ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
console.log(`screenshots: ${out}; folder: ${essais}`);
process.exit(failed ? 1 : 0);
