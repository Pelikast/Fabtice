// Lot 4, `.fabtice` projects in Chromium, with realistic sizes and persistent
// profiles (a throw-away context keeps its database in memory and hides the
// faults of large values, see PASSATION):
//   1. profile A: a WAV of several MB imported (the real audio engine), separated
//      (the stand-in separator of `?debug`: real 16-bit instruments of the
//      piece's length), corrected by hand (key, a chord, tuning), a named loop,
//      metronome settings, transposition; « Exporter » → « Enregistrer le
//      projet… » with the instruments: the file is downloaded and checked;
//   2. profile B, nothing kept: « Ouvrir un projet Fabtice » in the opening
//      dialog → the file → everything comes back (instruments to the sample),
//      without analysing again; then a reload: kept on the device, it comes back
//      by itself, instruments included;
//   3. the same project saved without the instruments, dropped on the window:
//      the whole piece, with the corrections;
//   4. a damaged copy and an audio file chosen as a project: calm sentences, the
//      open piece untouched;
//   5. screenshots: the opening dialog (1280 × 800 and 390 × 844), the save
//      dialog.
//   npm run build && npm run test:project-file
// Screenshots in $FABTICE_PROJECT_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_PROJECT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-project-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeWav(file, seconds) {
  const rate = 44100;
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 4);
  let seed = 7;
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff - 0.5) * 0.02;
    const env = 0.5 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t);
    data.writeInt16LE(Math.round((env * 0.4 * Math.sin(2 * Math.PI * 220 * t) + noise) * 32767), i * 4);
    data.writeInt16LE(Math.round((env * 0.4 * Math.sin(2 * Math.PI * 330 * t) + noise) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return head.length + data.length;
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-project-work-'));
const wav = path.join(work, 'Lover Man.wav');
const wavBytes = writeWav(wav, 60);
const { srv, url } = await startServer(0);
const profiles = [];
const cleanups = [];

async function browserWith(viewport = { width: 1280, height: 800 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-project-profile-'));
  profiles.push(profile);
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], viewport, acceptDownloads: true });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/No available adapters/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`${url}/?debug`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3 && window.__fabtice.lot4, null, { timeout: 30000 });
  return { context, page, errors };
}

const ready = (page, timeout = 120000) =>
  page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && (s.transport.engine === 'ready' || s.transport.engine === 'playing') && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
  }, null, { timeout });

/** The document as the store makes it (minus the save date) and samples of each instrument. */
const snapshot = (page) =>
  page.evaluate(() => {
    const f = window.__fabtice;
    const s = f.store.getState();
    const probe = (id) => {
      const a = f.lot3.registry.getAudio(id);
      if (!a) return null;
      const outL = new Float32Array(32);
      f.lot3.pcm.readPcm(a, 0, Math.floor(a.frames * 0.37), outL);
      const outR = new Float32Array(32);
      f.lot3.pcm.readPcm(a, a.mono ? 0 : 1, a.frames - 40, outR);
      return { frames: a.frames, mono: a.mono, l: Array.from(outL), r: Array.from(outR) };
    };
    const all = [...s.tracks, ...s.separation.aside];
    const { savedAt: _s, ...doc } = JSON.parse(JSON.stringify({ project: s.project, tracks: s.tracks, tempoMap: s.tempoMap, loop: s.loop, playback: s.playback, analysis: s.analysis, corrections: s.corrections, separation: s.separation, exportPrefs: s.exportPrefs, metronome: s.metronome, markers: s.markers, instrument: s.view.instrument }));
    return { doc, instruments: Object.fromEntries(all.filter((t) => t.audio.origin === 'separated').map((t) => [t.audio.id, probe(t.audio.id)])) };
  });

async function saveProject(page, { withInstruments, shot }) {
  await page.click('button.menu:has-text("Exporter")');
  await page.click('.menu-export [data-export="project"]');
  await page.waitForSelector('[data-testid="enregistrer-projet"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="taille-projet"]')?.textContent.includes('calcul'));
  const box = page.locator('[data-testid="avec-instruments"]');
  if ((await box.count()) && (await box.isChecked()) !== withInstruments) await box.click();
  const announced = await page.textContent('[data-testid="taille-projet"]');
  if (shot) await page.screenshot({ path: path.join(out, shot) });
  await page.click('[data-testid="preparer-projet"]');
  await page.waitForSelector('[data-testid="fichier-projet"]', { timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-projet"]')]);
  const target = path.join(work, `${withInstruments ? 'avec' : 'sans'}-${download.suggestedFilename()}`);
  await download.saveAs(target);
  await page.click('[data-testid="enregistrer-projet"] .fermer');
  return { target, name: download.suggestedFilename(), announced };
}

let saved;
let savedWhole;
let before;
try {
  // ------------------------------------------------------------ 1. a worked-on piece, saved
  {
    const { context, page, errors } = await browserWith();
    await page.locator('.accueil input[type="file"]').setInputFiles(wav);
    await ready(page);
    await page.evaluate(() => window.__fabtice.lot3.separation.startSeparation({ stems: ['vocals', 'bass', 'piano'] }));
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 60000 });
    await page.evaluate(() => {
      const { store, lot4 } = window.__fabtice;
      store.setState((s) => ({
        loop: { region: { start: 3.125, end: 9.75 }, enabled: true },
        corrections: { ...s.corrections, key: { tonic: 5, mode: 'minor' }, tuningCents: 18 },
        playback: { ...s.playback, semitones: -3, cents: 9, tempoRatio: 0.85 },
        view: { ...s.view, instrument: 'mib' },
      }));
      lot4.markers.saveCurrentLoop('Solo de sax');
      lot4.metronome.setMetronomeVolume(0.35);
      lot4.metronome.setCountInBars(2);
    });
    await sleep(1500);
    before = await snapshot(page);
    check('the piece is separated in several instruments', Object.keys(before.instruments).length >= 3, Object.keys(before.instruments).length);
    saved = await saveProject(page, { withInstruments: true, shot: 'enregistrer-projet.png' });
    const size = fs.statSync(saved.target).size;
    check('the file is named after the piece', saved.name === 'Lover Man.fabtice', saved.name);
    // 60 s of a 44.1 kHz stereo WAV (10.6 MB), plus three or four stereo instruments of 60 s at 48 kHz (11.5 MB each).
    check('realistic size: the original as imported plus the instruments', size > wavBytes + 3 * 11_000_000, `${(size / 1e6).toFixed(1)} MB, dialog said « ${saved.announced} »`);
    check('the size announced is the size of the file', saved.announced.includes(`${Math.round(size / 1e6)} Mo`), saved.announced);
    const head = fs.readFileSync(saved.target).subarray(0, 59).toString('latin1');
    check('it starts with the Fabtice signature', head.slice(30) === 'mimetypeapplication/x-fabtice');
    savedWhole = await saveProject(page, { withInstruments: false });
    check('without the instruments, the file is much lighter', fs.statSync(savedWhole.target).size < wavBytes + 1_000_000, `${(fs.statSync(savedWhole.target).size / 1e6).toFixed(1)} MB`);
    check('no page errors (saving)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 2. another browser, nothing kept: « Ouvrir un projet »
  {
    const { context, page, errors } = await browserWith();
    await page.waitForSelector('.voile.ouverte [data-testid="ouvrir-projet"]');
    await page.screenshot({ path: path.join(out, 'accueil-ouvrir-projet-1280.png') });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    check('the picker asks for a .fabtice file', !chooser.isMultiple());
    const t0 = Date.now();
    await chooser.setFiles(saved.target);
    await ready(page);
    const openMs = Date.now() - t0;
    const after = await snapshot(page);
    check('everything comes back: document, corrections, loop, markers, metronome, view', JSON.stringify(after.doc) === JSON.stringify(before.doc), diff(before.doc, after.doc));
    check('the instruments come back to the sample', JSON.stringify(after.instruments) === JSON.stringify(before.instruments));
    check('not analysed again', (await page.evaluate(() => window.__fabtice.store.getState().analysisRun.status)) === 'idle');
    console.log(`  (opened in ${(openMs / 1000).toFixed(1)} s)`);
    await sleep(2500);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
    await ready(page);
    const kept = await snapshot(page);
    check('kept on the device: after a reload it comes back by itself, instruments included', JSON.stringify(kept) === JSON.stringify(before));

    // ------------------------------------------------------------ 4. a damaged copy, an audio file as a project
    // An ASCII name: in a bare Linux container (no UTF-8 locale) Chromium's picker drops a file whose name has accents.
    const cut = path.join(work, 'Abime.fabtice');
    fs.writeFileSync(cut, fs.readFileSync(saved.target).subarray(0, Math.floor(fs.statSync(saved.target).size * 0.55)));
    await page.evaluate(() => window.__fabtice.actions.openNewPiece());
    const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    await c2.setFiles(cut);
    await page.waitForSelector('.import-erreur');
    const damaged = await page.textContent('.import-erreur');
    check('a damaged file: a calm sentence', damaged.includes('incomplet ou abîmé') && damaged.includes('reste tel quel'), damaged);
    check('a damaged file: the open piece is untouched', (await page.evaluate(() => window.__fabtice.store.getState().project.id)) === before.doc.project.id);
    await page.click('button:has-text("Réessayer")');
    const [c3] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    await c3.setFiles(wav);
    await page.waitForSelector('.import-erreur');
    const notProject = await page.textContent('.import-erreur');
    check('an audio file chosen as a project: says so, and where to go', notProject.includes('n’est pas un projet Fabtice'), notProject);
    await page.click('button:has-text("Réessayer")');
    await page.keyboard.press('Escape');

    // ------------------------------------------------------------ 3. dropped on the window, without the instruments
    // The file reaches the page through the test server (served for this step only), then is dropped as a File.
    const servedCopy = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../web/essai-depot.fabtice');
    fs.copyFileSync(savedWhole.target, servedCopy);
    cleanups.push(() => fs.rmSync(servedCopy, { force: true }));
    await page.evaluate(async (name) => {
      // Read as bytes: this headless Chromium fails to read a large body as a Blob (measured; the app never does).
      const blob = await (await fetch('./essai-depot.fabtice')).arrayBuffer();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], name));
      for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, savedWhole.name);
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result === null, null, { timeout: 60000 });
    await ready(page);
    const dropped = await snapshot(page);
    check('dropped on the window: the whole piece, with the corrections and markers', dropped.doc.tracks.length === 1 && dropped.doc.tracks[0].role === 'morceau' && JSON.stringify(dropped.doc.corrections) === JSON.stringify(before.doc.corrections) && dropped.doc.markers.loops[0]?.name === 'Solo de sax');
    check('no page errors (opening)', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 5. the opening dialog on a phone
  {
    const { context, page } = await browserWith({ width: 390, height: 844 });
    await page.waitForSelector('.voile.ouverte [data-testid="ouvrir-projet"]');
    const fits = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="ouvrir-projet"]').getBoundingClientRect();
      return b.right <= window.innerWidth && b.left >= 0 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    check('phone: « ouvrir un projet » fits, no horizontal scroll', fits);
    await page.screenshot({ path: path.join(out, 'accueil-ouvrir-projet-390.png') });
    await context.close();
  }
  console.log(`(screenshots in ${out})`);
} finally {
  srv.close();
  fs.rmSync(work, { recursive: true, force: true });
  for (const p of profiles) fs.rmSync(p, { recursive: true, force: true });
  for (const c of cleanups) c();
}

function diff(a, b) {
  const keys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return keys.length ? `differs: ${keys.join(', ')}` : '';
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall project file checks passed');
