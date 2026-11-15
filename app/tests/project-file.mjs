// `.fab` projects in Chromium (lot 4, then the owner's decisions of 15
// November), with realistic sizes and persistent profiles (a throw-away context
// keeps its database in memory and hides the faults of large values, see
// PASSATION):
//   1. profile A: a WAV of a minute imported (the real audio engine), separated
//      with two tools (the stand-in separator of `?debug`: real 16-bit
//      instruments of the piece's length), the mix set in each, corrected by
//      hand, a named loop, metronome settings, transposition, « Appliquer »
//      (the stand-in renderer) ; « Exporter » → « Enregistrer le projet… »: the
//      REAL libFLAC encoder in its workers; the file is downloaded and checked;
//   2. profile B, nothing kept: « Ouvrir un projet Fabtice » → the file →
//      everything comes back (current instruments to the sample, the render
//      heard as it is), without analysing again; the other separation is on the
//      device and « Écouter » switches to it, sample-exact, without computing;
//      then a reload: kept on the device, it comes back by itself;
//   3. a damaged copy and an audio file chosen as a project: calm sentences, the
//      open piece untouched; the project dropped on the window;
//   4. the device's own store (16-bit blocks) against FLAC, measured: six
//      stereo instruments of four minutes written and read back
//      (`FABTICE_PROJECT_LONG=1`: twelve minutes too);
//   5. screenshots: the opening dialog (1280 × 800 and 390 × 844), the save
//      dialog, the kept separations, the settings.
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
    const { savedAt: _s, ...doc } = JSON.parse(JSON.stringify({ project: s.project, tracks: s.tracks, tempoMap: s.tempoMap, loop: s.loop, playback: s.playback, analysis: s.analysis, corrections: s.corrections, separation: s.separation, exportPrefs: s.exportPrefs, metronome: s.metronome, markers: s.markers, instrument: s.view.instrument, keptRender: s.keptRender }));
    return { doc, applied: f.lot3.render.selectApplyState(s), instruments: Object.fromEntries(all.filter((t) => t.audio.origin === 'separated').map((t) => [t.audio.id, probe(t.audio.id)])) };
  });

async function saveProject(page, { shot }) {
  await page.click('button.menu:has-text("Exporter")');
  await page.click('.menu-export [data-export="project"]');
  await page.waitForSelector('[data-testid="enregistrer-projet"]');
  const contents = (await page.locator('[data-testid="contenu-projet"]').textContent().catch(() => '')) ?? '';
  if (shot) await page.screenshot({ path: path.join(out, shot) });
  const t0 = Date.now();
  await page.click('[data-testid="preparer-projet"]');
  await page.waitForSelector('[data-testid="fichier-projet"]', { timeout: 300000 });
  const prepareMs = Date.now() - t0;
  const announced = await page.textContent('[data-testid="enregistrer-projet"] .export-resume');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-projet"]')]);
  const target = path.join(work, download.suggestedFilename());
  await download.saveAs(target);
  await page.click('[data-testid="enregistrer-projet"] .fermer');
  return { target, name: download.suggestedFilename(), announced, contents, prepareMs };
}

let saved;
let before;
let otherBefore;
try {
  // ------------------------------------------------------------ 1. a worked-on piece, saved
  {
    const { context, page, errors } = await browserWith();
    await page.locator('.accueil input[type="file"]').setInputFiles(wav);
    await ready(page);
    // Two separations, two tools, each with its own mix.
    await page.evaluate(async () => {
      const sep = window.__fabtice.lot3.separation;
      const store = window.__fabtice.store;
      sep.setSeparationModel('htdemucs-6s');
      await sep.startSeparation({ stems: ['vocals', 'bass', 'piano'] });
      store.setState((s) => ({ tracks: s.tracks.map((tr, i) => (i === 0 ? { ...tr, mute: true } : tr)) }));
      sep.setSeparationModel('bs-roformer-sw');
      await sep.startSeparation({ stems: ['bass', 'drums'] });
    });
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.others.length === 1, null, { timeout: 60000 });
    await sleep(1500);
    otherBefore = await page.evaluate(async () => {
      const f = window.__fabtice;
      const o = f.store.getState().separation.others[0];
      const out = {};
      const inMemory = [];
      for (const tr of o.tracks) {
        const a = await f.lot3.storage().loadTrackAudio(tr.audio.id);
        const buf = new Float32Array(32);
        f.lot3.pcm.readPcm(a, 0, Math.floor(a.frames * 0.41), buf);
        out[tr.audio.id] = { frames: a.frames, l: Array.from(buf) };
        inMemory.push(!!f.lot3.registry.getAudio(tr.audio.id));
      }
      return { tool: o.result.modelId, mute: o.tracks.map((tr) => tr.mute), samples: out, inMemory };
    });
    check('the first separation is kept aside, on the device and out of memory', otherBefore.tool === 'htdemucs-6s' && otherBefore.inMemory.every((x) => !x) && otherBefore.mute[0] === true, JSON.stringify(otherBefore.mute));
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
    await page.evaluate(() => window.__fabtice.lot3.render.applyRender());
    await page.waitForFunction(() => window.__fabtice.store.getState().keptRender !== null, null, { timeout: 60000 });
    await sleep(1500);
    before = await snapshot(page);
    check('the render applied is kept with the piece', before.doc.keptRender !== null && before.applied === 'applied', before.applied);
    check('the piece is separated in several instruments', Object.keys(before.instruments).length >= 3, Object.keys(before.instruments).length);
    saved = await saveProject(page, { shot: 'enregistrer-projet.png' });
    const size = fs.statSync(saved.target).size;
    check('the file is named after the piece', saved.name === 'Lover Man.fab', saved.name);
    check('the dialog says what goes in: both separations, the render', saved.contents.includes('HTDemucs') && saved.contents.includes('BS-RoFormer') && saved.contents.includes('rendu'), saved.contents);
    // 60 s of a 44.1 kHz stereo WAV (10.6 MB) as imported, then seven stereo instruments and two rendered tracks
    // of 60 s at 48 kHz: 11.5 MB each in 16 bits, about 60 % of that in FLAC.
    const blocks = 9 * 11_520_000;
    check('realistic size, the tracks in FLAC: less than in 16 bits', size > wavBytes + 0.3 * blocks && size < wavBytes + blocks, `${(size / 1e6).toFixed(1)} MB (16-bit blocks would be ${(blocks / 1e6).toFixed(0)} MB), prepared in ${(saved.prepareMs / 1000).toFixed(1)} s with the real libFLAC; dialog said « ${saved.announced} »`);
    const head = fs.readFileSync(saved.target).subarray(0, 59).toString('latin1');
    check('it starts with the Fabtice signature', head.slice(30) === 'mimetypeapplication/x-fabtice');
    const names = zipNames(fs.readFileSync(saved.target));
    check('every separation in its folder, the render apart, all in FLAC', names.filter((n) => n.startsWith('separations/HTDemucs')).length >= 3 && names.filter((n) => n.startsWith('separations/BS-RoFormer')).length >= 2 && names.some((n) => n.startsWith('rendu/')) && names.filter((n) => /^(separations|rendu)\//.test(n)).every((n) => n.endsWith('.flac')), names.join(', '));
    check('no page errors (saving)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 2. another browser, nothing kept: « Ouvrir un projet »
  {
    const { context, page, errors } = await browserWith();
    await page.waitForSelector('.voile.ouverte [data-testid="ouvrir-projet"]');
    await page.screenshot({ path: path.join(out, 'accueil-ouvrir-projet-1280.png') });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    check('the picker asks for a .fab file', !chooser.isMultiple());
    const t0 = Date.now();
    await chooser.setFiles(saved.target);
    await ready(page);
    const openMs = Date.now() - t0;
    // The piece plays as soon as its current tracks are in place; the other separation and the render follow.
    await page.waitForFunction(() => window.__fabtice.lot3.render.selectApplyState(window.__fabtice.store.getState()) === 'applied', null, { timeout: 60000 }).catch(() => {});
    await sleep(1500);
    const after = await snapshot(page);
    check('everything comes back: document, corrections, loop, markers, metronome, view, both separations, the render', JSON.stringify(after.doc) === JSON.stringify(before.doc), diff(before.doc, after.doc));
    check('the instruments come back to the sample (FLAC, lossless)', JSON.stringify(after.instruments) === JSON.stringify(before.instruments));
    check('the render kept is heard as it is (same key and tempo)', after.applied === 'applied', after.applied);
    // The other separation: on the device, chosen in the panel, without computing.
    await page.evaluate(() => window.__fabtice.actions.togglePanel('separation'));
    await page.waitForSelector('[data-testid="separations-gardees"]');
    await page.locator('[data-testid="separations-gardees"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'separations-gardees.png') });
    const t1 = Date.now();
    await page.click('[data-testid="ecouter-separation"]');
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result?.modelId === 'htdemucs-6s', null, { timeout: 30000 });
    const switchMs = Date.now() - t1;
    const switched = await page.evaluate(() => {
      const f = window.__fabtice;
      const s = f.store.getState();
      const out = {};
      for (const tr of s.tracks) {
        const a = f.lot3.registry.getAudio(tr.audio.id);
        const buf = new Float32Array(32);
        f.lot3.pcm.readPcm(a, 0, Math.floor(a.frames * 0.41), buf);
        out[tr.audio.id] = { frames: a.frames, l: Array.from(buf) };
      }
      return { mute: s.tracks.map((tr) => tr.mute), samples: out, running: s.separationRun.status };
    });
    check('« Écouter » switches to the other separation at once, to the sample, its mix with it', switched.running === 'idle' && switched.mute[0] === true && JSON.stringify(switched.samples) === JSON.stringify(otherBefore.samples), `${switchMs} ms; ${JSON.stringify(switched.mute)} ${JSON.stringify(Object.keys(switched.samples))} vs ${JSON.stringify(Object.keys(otherBefore.samples))} ${JSON.stringify(Object.values(switched.samples)[0]?.l.slice(0, 3))} vs ${JSON.stringify(Object.values(otherBefore.samples)[0]?.l.slice(0, 3))}`);
    await page.keyboard.press('Escape');
    check('not analysed again', (await page.evaluate(() => window.__fabtice.store.getState().analysisRun.status)) === 'idle');
    console.log(`  (opened in ${(openMs / 1000).toFixed(1)} s)`);
    await sleep(2500);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
    await ready(page);
    const kept = await snapshot(page);
    check('kept on the device: after a reload it comes back by itself, both separations included', kept.doc.separation.result.modelId === 'htdemucs-6s' && kept.doc.separation.others[0]?.result.modelId === 'bs-roformer-sw');

    // ------------------------------------------------------------ 4. a damaged copy, an audio file as a project
    // An ASCII name: in a bare Linux container (no UTF-8 locale) Chromium's picker drops a file whose name has accents.
    const cut = path.join(work, 'Abime.fab');
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
    const servedCopy = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../web/essai-depot.fab');
    fs.copyFileSync(saved.target, servedCopy);
    cleanups.push(() => fs.rmSync(servedCopy, { force: true }));
    await page.evaluate(async (name) => {
      // Read as bytes: this headless Chromium fails to read a large body as a Blob (measured; the app never does).
      const blob = await (await fetch('./essai-depot.fab')).arrayBuffer();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], name));
      for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, saved.name);
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result?.modelId === 'bs-roformer-sw', null, { timeout: 120000 });
    await ready(page);
    await sleep(1000);
    const dropped = await snapshot(page);
    check('dropped on the window: the project as saved, corrections and markers included', JSON.stringify(dropped.doc) === JSON.stringify(before.doc), diff(before.doc, dropped.doc));
    check('no page errors (opening)', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 4. the device's own store: 16-bit blocks, measured
  for (const minutes of process.env.FABTICE_PROJECT_LONG === '1' ? [4, 12] : [4]) {
    const { context, page } = await browserWith();
    const m = await page.evaluate(async (minutes) => {
      const { pcm, storage } = window.__fabtice.lot3;
      const sr = 48000;
      const n = sr * 60 * minutes;
      const store = storage();
      let writeMs = 0;
      let bytes = 0;
      for (let k = 0; k < 6; k++) {
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          l[i] = 0.3 * Math.sin((2 * Math.PI * 110 * (k + 1) * i) / sr);
          r[i] = 0.25 * Math.sin((2 * Math.PI * 165 * (k + 1) * i) / sr);
        }
        const p = pcm.pcmFromChannels([l, r], sr);
        bytes += p.bytes;
        const t0 = performance.now();
        await store.saveTrackAudio(`mesure-${k}`, p);
        writeMs += performance.now() - t0;
      }
      const t1 = performance.now();
      for (let k = 0; k < 6; k++) await store.loadTrackAudio(`mesure-${k}`);
      const readMs = performance.now() - t1;
      await store.deleteTrackAudio([0, 1, 2, 3, 4, 5].map((k) => `mesure-${k}`));
      return { bytes, writeMs, readMs };
    }, minutes);
    console.log(`  (device store, ${minutes} min × 6 stereo instruments in 16-bit blocks: ${Math.round(m.bytes / 1e6)} MB, written in ${(m.writeMs / 1000).toFixed(1)} s, read back in ${(m.readMs / 1000).toFixed(1)} s)`);
    check(`device store (${minutes} min): read back within seconds`, m.readMs < 30000, `${(m.readMs / 1000).toFixed(1)} s`);
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
  // ------------------------------------------------------------ 6. the settings, advanced unfolded, with the room on this device
  for (const [tag, viewport] of [['1280', { width: 1280, height: 800 }], ['390', { width: 390, height: 844 }]]) {
    const { context, page, errors } = await browserWith(viewport);
    await page.goto(`${url}/?demo`);
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project, null, { timeout: 30000 });
    await page.click(viewport.width < 760 ? '.menu-plus' : 'button.menu:has-text("Réglages")');
    await page.click('[data-testid="reglages-avances"]');
    await page.waitForSelector('[data-testid="place-appareil"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="place-appareil"]').textContent.includes('Mesure en cours'));
    const panel = await page.evaluate(() => {
      const el = document.querySelector('.reglages-app');
      const r = el.getBoundingClientRect();
      return { inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, text: el.textContent };
    });
    check(`settings (${tag}): basic first, advanced unfolded with the tool's cost and licence and the room on this device, inside the window`, panel.inside && panel.text.indexOf('Suivre la tête de lecture') < panel.text.indexOf('Réglages avancés') && panel.text.includes('Licence des poids') && panel.text.includes('Place sur cet appareil'), panel.inside ? '' : 'outside the window');
    await page.locator('[data-testid="place-appareil"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `reglages-${tag}.png`) });
    check(`no page errors (settings ${tag})`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(`(screenshots in ${out})`);
} finally {
  srv.close();
  fs.rmSync(work, { recursive: true, force: true });
  for (const p of profiles) fs.rmSync(p, { recursive: true, force: true });
  for (const c of cleanups) c();
}

/** The names of a ZIP's entries, from its central directory. */
function zipNames(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(at + 28);
    names.push(buf.toString('utf8', at + 46, at + 46 + n));
    at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return names;
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
