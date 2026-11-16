// `.fab` projects in Chromium (lot 4, then the owner's decisions of 15
// November), with realistic sizes and persistent profiles (a throw-away context
// keeps its database in memory and hides the faults of large values, see
// PASSATION):
//   1. profile A: a WAV of a minute imported (the real audio engine), separated
//      with two tools (the stand-in separator of `?debug`: real 16-bit
//      instruments of the piece's length), the mix set in each, corrected by
//      hand, a named loop, metronome settings, transposition, « Appliquer »
//      (the stand-in renderer) ; menu Fabtice → « Enregistrer sous… »: the
//      REAL libFLAC encoder in its workers. « Enregistrer sous… » ends in the browser's save panel: the check
//      stands in for it with a handle on a file of the page's private file system (what Chromium gives), which is
//      then copied out through a download and checked; then a change, and cmd/Ctrl + S (« Enregistrer »): the
//      SAME file is overwritten, fast (no encoder worker is started, the sounds already encoded are copied),
//      the title shows « modified » then « saved »; the file read back holds the change; a reload (the piece
//      still reads « saved », the autosave keeps that state; the file handle is not kept: « Enregistrer » asks
//      where; a change after the reload reads « modified »), then « Ouvrir un projet » with a handle: the file
//      opened becomes the project's file; a browser with no file handles (Safari, Firefox) gets the link of
//      old, whose click reads « saved »;
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
import { openSettingsTab } from './lib/settings.mjs';
import { startServer } from './serve.mjs';
import { menuCommand } from './lib/menu.mjs';

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
const freeTmp = () => {
  try {
    const st = fs.statfsSync(os.tmpdir());
    return `${((st.bavail * st.bsize) / 1e9).toFixed(2)} GB`;
  } catch {
    return 'unknown';
  }
};
if (fs.statfsSync) {
  const st = fs.statfsSync(os.tmpdir());
  if (st.bavail * st.bsize < 2e9) console.log(`WARN  only ${freeTmp()} free in ${os.tmpdir()}: Chromium's renderer crashes when it is full (its shared memory is there)`);
}
const cleanups = [];

/**
 * What the pages are given before anything runs: the encoder workers are counted (a save that encodes starts some);
 * « Enregistrer sous… » is answered by a file of the page's private file system (`savePicker`), « Ouvrir un projet »
 * by one that exists already (`openPicker`); without them the page meets a browser with no file handles.
 */
function filePickers({ savePicker, openPicker }) {
  window.__picks = [];
  window.__workers = 0;
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(...args) {
      super(...args);
      window.__workers++;
    }
  };
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
  if (savePicker) {
    window.showSaveFilePicker = async (options) => {
      const name = (options && options.suggestedName) || 'Projet.fab';
      window.__picks.push(name);
      return (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
    };
  }
  if (openPicker) {
    window.__openName = null;
    window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__openName)];
  }
}

async function browserWith(viewport = { width: 1280, height: 800 }, pickers = { savePicker: true, openPicker: false }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-project-profile-'));
  profiles.push(profile);
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], viewport, acceptDownloads: true });
  await context.addInitScript(filePickers, pickers);
  const page = context.pages()[0] ?? (await context.newPage());
  // A renderer crash is a failure of its own, said as such (a user relaunching would get it).
  // Playwright starts Chromium with --disable-dev-shm-usage: its shared memory lives in the temporary folder, and a
  // full disk there kills the renderer whatever the page does (measured on 15 November). Say so with the figure.
  page.on('crash', () => check('the page never crashes', false, `renderer crashed at ${new Date().toISOString()}; ${freeTmp()} free in ${os.tmpdir()} (a full temporary folder crashes Chromium's renderer)`));
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

let copies = 0;
/** A file of the page's private file system, copied out through a download. */
async function copyOut(page, name) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(async (n) => {
      const file = await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = n;
      document.body.append(a);
      a.click();
      a.remove();
    }, name),
  ]);
  const target = path.join(work, `copie-${++copies}-${name}`);
  await download.saveAs(target);
  return target;
}

/** Menu Fabtice → « Enregistrer sous… »: the dialog, then the panel (stood in for), then the file. */
async function saveProjectAs(page, { shot }) {
  await menuCommand(page, 'Enregistrer sous…');
  await page.waitForSelector('[data-testid="enregistrer-projet"]');
  const contents = (await page.locator('[data-testid="contenu-projet"]').textContent().catch(() => '')) ?? '';
  const label = await page.textContent('[data-testid="preparer-projet"]');
  if (shot) await page.screenshot({ path: path.join(out, shot) });
  const t0 = Date.now();
  await page.click('[data-testid="preparer-projet"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'), null, { timeout: 300000 });
  const prepareMs = Date.now() - t0;
  const name = await page.evaluate(() => window.__picks[window.__picks.length - 1]);
  return { name, contents, label, prepareMs, target: await copyOut(page, name) };
}

/** The CRC and size of each entry of a ZIP, from its central directory. */
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

/** The alert about changes not saved is up: its text and its three buttons; answers with `choice`. */
async function answerAlert(page, choice) {
  await page.waitForSelector('[data-testid="alerte-projet"]', { timeout: 10000 });
  const text = (await page.textContent('[data-testid="alerte-texte"]')).trim();
  await page.click(`[data-testid="alerte-${choice}"]`);
  await page.waitForFunction(() => !document.querySelector('[data-testid="alerte-projet"]'), null, { timeout: 60000 });
  return text;
}

let saved;
let before;
let otherBefore;
try {
  // ------------------------------------------------------------ 1. a worked-on piece, saved
  {
    const { context, page, errors } = await browserWith({ width: 1280, height: 800 }, { savePicker: true, openPicker: true });
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
    // « Enregistrer sous… »: the dialog, then the panel (here, a file of the page's private file system).
    const first = await saveProjectAs(page, { shot: 'enregistrer-projet.png' });
    const size = fs.statSync(first.target).size;
    check('the file is named after the piece', first.name === 'Lover Man.fab', first.name);
    check('the button leads to the save panel', first.label.includes('Choisir où enregistrer'), first.label);
    check('the dialog says what goes in: both separations, the render', first.contents.includes('HTDemucs') && first.contents.includes('BS-RoFormer') && first.contents.includes('rendu'), first.contents);
    // 60 s of a 44.1 kHz stereo WAV (10.6 MB) as imported, then seven stereo instruments and two rendered tracks
    // of 60 s at 48 kHz: 11.5 MB each in 16 bits, about 60 % of that in FLAC.
    const blocks = 9 * 11_520_000;
    check('realistic size, the tracks in FLAC: less than in 16 bits', size > wavBytes + 0.3 * blocks && size < wavBytes + blocks, `${(size / 1e6).toFixed(1)} MB (16-bit blocks would be ${(blocks / 1e6).toFixed(0)} MB), prepared in ${(first.prepareMs / 1000).toFixed(1)} s with the real libFLAC`);
    const head = fs.readFileSync(first.target).subarray(0, 59).toString('latin1');
    check('it starts with the Fabtice signature', head.slice(30) === 'mimetypeapplication/x-fabtice');
    const names = zipNames(fs.readFileSync(first.target));
    check('every separation in its folder, the render apart, all in FLAC', names.filter((n) => n.startsWith('separations/HTDemucs')).length >= 3 && names.filter((n) => n.startsWith('separations/BS-RoFormer')).length >= 2 && names.some((n) => n.startsWith('rendu/')) && names.filter((n) => /^(separations|rendu)\//.test(n)).every((n) => n.endsWith('.flac')), names.join(', '));
    check('« saved »: the title is the piece\'s, with no mark; nothing is modified', (await page.title()) === 'Lover Man — Fabtice' && !(await page.evaluate(() => window.__fabtice.history.isModified())), await page.title());
    check('the first save does encode (the real encoder\'s workers started)', (await page.evaluate(() => window.__workers)) > 0);
    await page.waitForSelector('[data-testid="projet-enregistre"]', { timeout: 5000 });
    await page.screenshot({ path: path.join(out, 'projet-enregistre.png') });

    // A change: « modified » (a mark in the title); then cmd/Ctrl + S overwrites THE SAME file, fast, without encoding.
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 22 } })));
    await page.waitForFunction(() => document.title.startsWith('• '), null, { timeout: 5000 });
    check('a change: the title shows the mark', (await page.title()) === '• Lover Man — Fabtice', await page.title());
    const workersBefore = await page.evaluate(() => window.__workers);
    const sizeBeforeSecond = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('Lover Man.fab')).getFile()).size);
    const t1 = Date.now();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !document.title.startsWith('• ') && document.querySelector('[data-testid="projet-enregistre"]'), null, { timeout: 120000 });
    const secondMs = Date.now() - t1;
    const info = await page.evaluate(() => ({ workers: window.__workers, picks: window.__picks.length, modified: window.__fabtice.history.isModified() }));
    check('« Enregistrer » did not start the encoder again', info.workers === workersBefore, `${info.workers} vs ${workersBefore}`);
    check('« Enregistrer » did not ask where: the same file', info.picks === 1, String(info.picks));
    check('« Enregistrer » is measurably faster than the first save', secondMs < Math.max(4000, first.prepareMs / 2), `${(secondMs / 1000).toFixed(1)} s against ${(first.prepareMs / 1000).toFixed(1)} s`);
    check('saved: the mark is gone, nothing is modified', !info.modified && (await page.title()) === 'Lover Man — Fabtice');
    before = await snapshot(page);
    const second = { name: 'Lover Man.fab', target: await copyOut(page, 'Lover Man.fab') };
    check('the same file was overwritten (it holds the change)', before.doc.corrections.tuningCents === 22 && fs.statSync(second.target).size > 0 && sizeBeforeSecond > 0, `${sizeBeforeSecond} -> ${fs.statSync(second.target).size} bytes`);
    const crcA = zipCrcs(fs.readFileSync(first.target));
    const crcB = zipCrcs(fs.readFileSync(second.target));
    const sound = (n) => n.endsWith('.flac') || n.startsWith('audio/');
    check('every sound is byte for byte the first file\'s (copied, not encoded again)', Object.keys(crcA).filter(sound).length >= 10 && Object.keys(crcA).filter(sound).every((n) => crcA[n] === crcB[n]), Object.keys(crcA).filter(sound).filter((n) => crcA[n] !== crcB[n]).join(', '));
    check('only the document differs', crcA['projet.json'] !== crcB['projet.json'] && crcA['fabtice.json'] !== undefined);
    saved = second;

    // A reload: restored from the autosave, modified; the file handle is not kept, « Enregistrer » asks where.
    await sleep(1500);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
    await ready(page);
    // The autosave kept « saved » beside the document: the piece is still the one in its file.
    await page.waitForFunction(() => !window.__fabtice.history.isModified(), null, { timeout: 10000 }).catch(() => {});
    check('after a reload the piece still reads « saved » (identical to its file), no mark in the title', !(await page.evaluate(() => window.__fabtice.history.isModified())) && (await page.title()) === 'Lover Man — Fabtice', await page.title());
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 23 } })));
    check('a change after the reload: « modified »', await page.evaluate(() => window.__fabtice.history.isModified()));
    await page.keyboard.press('Control+s');
    await page.waitForSelector('[data-testid="enregistrer-projet"]', { timeout: 10000 });
    check('after a reload « Enregistrer » asks where (the dialog of « Enregistrer sous… »)', true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'));
    check('cmd/Ctrl + S never opens the browser\'s « save the page »: no download, no page change', (await page.evaluate(() => window.__fabtice.store.getState().project.id)) === before.doc.project.id);
    // « Ouvrir un projet » with a handle (Chromium): the piece reads « modified » (restored), the alert asks, and the file
    // opened becomes the project's file: a change then cmd/Ctrl + S overwrites it, no panel.
    await page.evaluate(() => {
      window.__openName = 'Lover Man.fab';
      window.__fabtice.actions.openNewPiece();
    });
    await page.click('[data-testid="ouvrir-projet"]');
    await answerAlert(page, 'abandonner');
    // The piece plays once its instruments are in; the other separation and the render follow, and only then does it
    // read « not modified » and know its file.
    await page.waitForFunction(() => window.__fabtice.project.getCurrentFile() !== null && !window.__fabtice.history.isModified(), null, { timeout: 120000 });
    check('a project opened from its file reads « not modified », titled by its name', !(await page.evaluate(() => window.__fabtice.history.isModified())) && (await page.title()) === 'Lover Man — Fabtice', await page.title());
    check('it knows its file', (await page.evaluate(() => window.__fabtice.project.getCurrentFile()?.name)) === 'Lover Man.fab');
    const crcBefore = zipCrcs(fs.readFileSync(saved.target));
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 31 } })));
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !document.title.startsWith('• ') && document.querySelector('[data-testid="projet-enregistre"]'), null, { timeout: 120000 });
    check('« Enregistrer » on a file opened with a handle: no panel, the same file', (await page.evaluate(() => window.__picks.length)) === 0);
    const crcAfter = zipCrcs(fs.readFileSync(await copyOut(page, 'Lover Man.fab')));
    check('it holds the new document and the same sounds', crcAfter['projet.json'] !== crcBefore['projet.json'] && Object.keys(crcBefore).filter((n) => n.endsWith('.flac')).every((n) => crcBefore[n] === crcAfter[n]));
    check('no page errors (saving)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 1b. no file handles (Safari, Firefox): the link of old
  {
    const { context, page, errors } = await browserWith({ width: 1280, height: 800 }, { savePicker: false, openPicker: false });
    await page.locator('.accueil input[type="file"]').setInputFiles(wav);
    await ready(page);
    await menuCommand(page, 'Enregistrer sous…');
    await page.waitForSelector('[data-testid="enregistrer-projet"]');
    check('without file handles the button says « Préparer le fichier »', (await page.textContent('[data-testid="preparer-projet"]')).includes('Préparer le fichier'));
    await page.click('[data-testid="preparer-projet"]');
    await page.waitForSelector('[data-testid="fichier-projet"]', { timeout: 300000 });
    check('still « modified » until the link is used', await page.evaluate(() => window.__fabtice.history.isModified()));
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-projet"]')]);
    check('the link downloads the project', download.suggestedFilename() === 'Lover Man.fab', download.suggestedFilename());
    check('the click reads « saved »', !(await page.evaluate(() => window.__fabtice.history.isModified())));
    await page.click('[data-testid="enregistrer-projet"] .fermer');
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 9 } })));
    await page.keyboard.press('Control+s');
    await page.waitForSelector('[data-testid="enregistrer-projet"]');
    check('without a file, cmd/Ctrl + S is « Enregistrer sous… »: its dialog', true);
    check('no page errors (download fallback)', errors.length === 0, errors.join(' | '));
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
    // Several reloads in a row (a relaunch, again and again): the piece, its two separations and its render come
    // back each time, the audio output given back on the way out (`pagehide`) and opened again. FABTICE_RELOADS changes the count.
    const reloads = Math.max(1, Number(process.env.FABTICE_RELOADS) || 3);
    const reloadMs = [];
    for (let k = 0; k < reloads; k++) {
      if (k > 0) await sleep(1500);
      const t = Date.now();
      await page.reload();
      await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
      await ready(page);
      reloadMs.push(Date.now() - t);
    }
    console.log(`  (${reloads} reloads: ${reloadMs.join(', ')} ms)`);
    const kept = await snapshot(page);
    check('kept on the device: after a reload it comes back by itself, both separations included', kept.doc.separation.result.modelId === 'htdemucs-6s' && kept.doc.separation.others[0]?.result.modelId === 'bs-roformer-sw');

    // ------------------------------------------------------------ 4. a damaged copy, an audio file as a project
    // An ASCII name: in a bare Linux container (no UTF-8 locale) Chromium's picker drops a file whose name has accents.
    const cut = path.join(work, 'Abime.fab');
    fs.writeFileSync(cut, fs.readFileSync(saved.target).subarray(0, Math.floor(fs.statSync(saved.target).size * 0.55)));
    await page.evaluate(() => window.__fabtice.actions.openNewPiece());
    const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    await c2.setFiles(cut);
    // The piece reads « modified » (restored from the autosave, then another separation heard): the alert comes first.
    const alertText = await answerAlert(page, 'abandonner');
    check('opening another project with changes not saved: the alert, with its exact text', alertText === 'Les modifications du projet en cours n’ont pas été sauvegardées, voulez-vous enregistrer ?', alertText);
    await page.waitForSelector('.import-erreur');
    const damaged = await page.textContent('.import-erreur');
    check('a damaged file: a calm sentence', damaged.includes('incomplet ou abîmé') && damaged.includes('reste tel quel'), damaged);
    check('a damaged file: the open piece is untouched', (await page.evaluate(() => window.__fabtice.store.getState().project.id)) === before.doc.project.id);
    await page.click('button:has-text("Réessayer")');
    const [c3] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid="ouvrir-projet"]')]);
    await c3.setFiles(wav);
    await answerAlert(page, 'abandonner');
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
    // Still modified (the failed attempts changed nothing): the alert, « Annuler » first (nothing opens), then the drop again.
    await answerAlert(page, 'annuler');
    check('« Annuler »: the open piece stays, nothing was opened', (await page.evaluate(() => window.__fabtice.store.getState().separation.result?.modelId)) === 'htdemucs-6s');
    await page.evaluate(async () => {
      const blob = await (await fetch('./essai-depot.fab')).arrayBuffer();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'Lover Man.fab'));
      for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await answerAlert(page, 'abandonner');
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
    await openSettingsTab(page, 'advanced');
    await page.waitForSelector('[data-testid="place-appareil"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="place-appareil"]').textContent.includes('Mesure en cours'));
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="reglages"]');
      const r = el.getBoundingClientRect();
      return { inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, text: document.querySelector('[data-testid="reglages-panneau"]').textContent };
    });
    check(`settings (${tag}): the Avancé tab shows the room on this device, inside the window`, panel.inside && panel.text.includes('Place sur cet appareil'), panel.inside ? '' : 'outside the window');
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
