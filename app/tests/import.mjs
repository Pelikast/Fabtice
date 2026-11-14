// Browser checks of the import and of the local storage, in Chromium, on the
// built interface served from web/ with the isolation headers.
//   npm run build && npm run test:import
// The silent clock-based engine is used (`?moteur=factice`) except where the
// real engine is part of what is measured (the 5-minute piece, one smoke check).
// What it covers: the five formats by file picker and by drag-and-drop (track,
// duration, 48 kHz, waveform), reloading with the project and its settings,
// autosave and flush on page hide, damaged and empty files, storage that fails
// (blocked, full), link import against a scripted `window.fabtice` (first
// install, progress, refusal, needsYtdlp, tool update), and the cost of a
// 5-minute stereo piece (decode time, memory, reopening at launch).
// Screenshots go to $FABTICE_IMPORT_OUT (default: a temporary folder).
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set
// PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const fixture = (name) => path.join(here, 'fixtures', name);
const M4A = path.join(repo, 'desktop/test/fixtures/tone-dash.m4a');
const SWING = path.join(repo, 'web/spikes/analyse/demo/demo-swing.mp3');

const out = process.env.FABTICE_IMPORT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-import-'));
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-import-files-'));

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (text) => console.log(`NOTE  ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });

// ---------------------------------------------------------------- helpers

/** A new page in a new browser context (so with its own, empty, storage). */
async function open({ init, initArg, viewport = { width: 1280, height: 800 }, query = '?debug&moteur=factice', context: existing } = {}) {
  const context = existing ?? (await browser.newContext({ viewport }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => console.log('PAGE CRASHED'));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Texts shown by the progress view, in order, whatever the speed.
  await page.addInitScript(() => {
    window.__seen = [];
    const record = () => {
      const el = document.querySelector('.import-etat .phase span');
      const text = el && el.textContent;
      if (text && window.__seen[window.__seen.length - 1] !== text) window.__seen.push(text);
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, characterData: true });
  });
  if (init) await page.addInitScript(init, initArg);
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { page, context, errors };
}

const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const text = (page, sel) => page.locator(sel).first().innerText();
const dialogOpen = (page) => page.locator('.voile').evaluate((el) => el.classList.contains('ouverte'));

/** Waits for a piece other than `previousId` to be open and playable. */
async function pieceOpen(page, previousId = null, timeout = 60000) {
  await page.waitForFunction(
    (prev) => {
      const s = window.__fabtice.store.getState();
      return s.project && s.project.id !== prev && s.transport.engine === 'ready' && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
    },
    previousId,
    { timeout },
  );
  return (await state(page)).project.id;
}

/** Waits until the waveform of the first track is drawn: peaks computed and pixels on the canvas. */
async function waveformDrawn(page) {
  await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const c = document.querySelector('.frise-voie canvas');
      if (!c || !c.width) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let p = 3; p < d.length; p += 4) if (d[p] > 120) return true;
      return false;
    },
    null,
    { timeout: 10000 },
  );
  return true;
}

/** Reads the stored document straight from IndexedDB, as another tab would. */
const storedDocument = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('project')) return resolve(null);
          const get = db.transaction('project').objectStore('project').get('current');
          get.onsuccess = () => {
            db.close();
            resolve(get.result ? get.result.document : null);
          };
          get.onerror = () => resolve(null);
        };
      }),
  );

const storedAudioCount = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice');
        open.onsuccess = () => {
          const db = open.result;
          const count = db.transaction('audio').objectStore('audio').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );

async function pickFile(page, file) {
  await page.locator('.accueil input[type="file"]').setInputFiles(file);
}

async function dropFile(page, file, mimeType) {
  const b64 = fs.readFileSync(file).toString('base64');
  await page.evaluate(
    ([data, name, type]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      for (const kind of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    [b64, path.basename(file), mimeType],
  );
}

async function openDialog(page) {
  await page.click('button:has-text("Nouveau projet")');
  await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
  await sleep(260);
}

/** A 16-bit PCM WAV or AIFF of a tone, written to disk in pieces (long files). */
function writeTone(file, { kind, seconds, rate = 44100, channels = 2 }) {
  const frames = Math.round(seconds * rate);
  const dataBytes = frames * channels * 2;
  const header =
    kind === 'wav'
      ? (() => {
          const b = Buffer.alloc(44);
          b.write('RIFF', 0);
          b.writeUInt32LE(36 + dataBytes, 4);
          b.write('WAVEfmt ', 8);
          b.writeUInt32LE(16, 16);
          b.writeUInt16LE(1, 20);
          b.writeUInt16LE(channels, 22);
          b.writeUInt32LE(rate, 24);
          b.writeUInt32LE(rate * channels * 2, 28);
          b.writeUInt16LE(channels * 2, 32);
          b.writeUInt16LE(16, 34);
          b.write('data', 36);
          b.writeUInt32LE(dataBytes, 40);
          return b;
        })()
      : (() => {
          const b = Buffer.alloc(54);
          b.write('FORM', 0);
          b.writeUInt32BE(46 + dataBytes, 4);
          b.write('AIFFCOMM', 8);
          b.writeUInt32BE(18, 16);
          b.writeUInt16BE(channels, 20);
          b.writeUInt32BE(frames, 22);
          b.writeUInt16BE(16, 26);
          const exponent = Math.floor(Math.log2(rate));
          b.writeUInt16BE(16383 + exponent, 28);
          b.writeBigUInt64BE(BigInt(rate) << BigInt(63 - exponent), 30);
          b.write('SSND', 38);
          b.writeUInt32BE(8 + dataBytes, 42);
          return b;
        })();
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, header);
  const chunkFrames = 44100;
  const little = kind === 'wav';
  for (let start = 0; start < frames; start += chunkFrames) {
    const n = Math.min(chunkFrames, frames - start);
    const buf = Buffer.alloc(n * channels * 2);
    for (let i = 0; i < n; i++) {
      const t = (start + i) / rate;
      // Slow melody: a new note every 1.5 s over a steady fifth.
      const note = 220 * 2 ** (Math.floor(t / 1.5) % 7 / 12);
      const v = 0.3 * Math.sin(2 * Math.PI * note * t) + 0.15 * Math.sin(2 * Math.PI * note * 1.5 * t);
      for (let c = 0; c < channels; c++) {
        const s = Math.round((c === 0 ? v : v * 0.8) * 32767);
        if (little) buf.writeInt16LE(s, (i * channels + c) * 2);
        else buf.writeInt16BE(s, (i * channels + c) * 2);
      }
    }
    fs.writeSync(fd, buf);
  }
  fs.closeSync(fd);
  return frames / rate;
}

// ---------------------------------------------------------------- scripted Mac app bridge

/** Installed in the page before it loads: a `window.fabtice` driven by the test. */
function installBridge(cfg) {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };
  const gates = { install: deferred(), extract: deferred() };
  const log = [];
  const yt = new Set();
  const ex = new Set();
  let installed = cfg.installed;
  let extractions = 0;
  const audio = Uint8Array.from(atob(cfg.audio), (c) => c.charCodeAt(0));
  window.__gates = gates;
  window.__bridgeLog = log;
  window.__emit = { yt: (p) => yt.forEach((l) => l(p)), ex: (p) => ex.forEach((l) => l(p)) };
  window.fabtice = {
    systemInfo: async () => null,
    ytdlpStatus: async () => {
      log.push('status');
      return { source: 'managed', path: installed ? '/x/yt-dlp' : null, installed, attempts: [] };
    },
    ytdlpCheck: async () => {
      log.push('check');
      return cfg.check || { skipped: true, reason: 'test', attempts: [] };
    },
    ytdlpInstall: async () => {
      log.push('install');
      if (cfg.gateInstall) await gates.install.promise;
      installed = true;
      return { ok: true, meta: {}, attempts: [] };
    },
    extract: async (link) => {
      log.push(`extract ${link}`);
      extractions++;
      if (cfg.gateExtract) await gates.extract.promise;
      const answer = cfg.extractions[Math.min(extractions - 1, cfg.extractions.length - 1)];
      return answer.ok ? { ok: true, audio: audio.slice(), meta: answer.meta, report: {} } : answer;
    },
    copyText: async () => true,
    onYtdlpProgress: (cb) => (yt.add(cb), () => yt.delete(cb)),
    onExtractProgress: (cb) => (ex.add(cb), () => ex.delete(cb)),
  };
}

const META = {
  id: 'abc',
  title: 'Autumn Leaves (essai)',
  channel: 'Un guitariste',
  duration: 4,
  liveStatus: 'not_live',
  isLive: false,
  formatId: '140',
  ext: 'm4a',
  acodec: 'mp4a.40.2',
  container: 'm4a_dash',
  abr: 16,
  asr: 44100,
  audioChannels: 2,
  filesize: 34000,
  protocol: 'https',
};
const M4A_B64 = fs.readFileSync(M4A).toString('base64');
const LINK = 'https://www.youtube.com/watch?v=essai';
const bridgeConfig = (extra) => ({ installed: true, audio: M4A_B64, extractions: [{ ok: true, meta: META }], ...extra });

try {
  // ------------------------------------------------------------ the five formats, by picker and by drag-and-drop
  {
    const { page, errors } = await open();
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    check('launch with nothing kept: the new-piece dialog is open', await dialogOpen(page));
    await page.evaluate(() => {
      window.__persistCalls = 0;
      const real = navigator.storage.persist.bind(navigator.storage);
      navigator.storage.persist = () => (window.__persistCalls++, real());
    });

    const formats = [
      { name: 'wav', file: fixture('tone.wav'), mime: 'audio/wav', seconds: 1.5, tolerance: 0.02, channels: 1 },
      { name: 'aiff', file: fixture('tone.aiff'), mime: 'audio/aiff', seconds: 1.0, tolerance: 0.02, channels: 1 },
      { name: 'flac', file: fixture('tone.flac'), mime: 'audio/flac', seconds: 1.5, tolerance: 0.02, channels: 2 },
      { name: 'mp3', file: fixture('tone.mp3'), mime: 'audio/mpeg', seconds: 1.5, tolerance: 0.12, channels: 1 },
      { name: 'm4a', file: M4A, mime: 'audio/mp4', seconds: 4.02, tolerance: 0.12, channels: 2 },
    ];
    let previous = null;
    for (const way of ['picker', 'drop']) {
      for (const f of formats) {
        const label = `${f.name} by ${way}`;
        if (previous) await openDialog(page);
        if (way === 'picker') await pickFile(page, f.file);
        else await dropFile(page, f.file, f.mime);
        previous = await pieceOpen(page, previous).catch(async (e) => {
          console.log(`  (${label}: ${e.message.split('\n')[0]}; ui: ${JSON.stringify((await state(page)).ui.import)})`);
          return null;
        });
        const s = await state(page);
        const tr = s.tracks[0];
        const base = path.basename(f.file, path.extname(f.file));
        check(`${label}: opened as one « morceau » track titled from the file name`, previous !== null && s.tracks.length === 1 && tr.role === 'morceau' && s.project.title === base, `${s.project?.title}`);
        check(`${label}: duration ${f.seconds} s`, near(s.project.duration, f.seconds, f.tolerance), `${s.project.duration.toFixed(3)} s`);
        check(`${label}: 48 kHz, ${f.channels} channel(s)`, tr.audio.sampleRate === 48000 && tr.audio.channels === f.channels && tr.audio.frames === Math.round(s.project.duration * 48000), `${tr.audio.sampleRate} Hz, ${tr.audio.channels} ch, ${tr.audio.frames} frames`);
        check(`${label}: source line « … · fichier audio »`, (await text(page, '.projet-source')).endsWith('· fichier audio'), await text(page, '.projet-source'));
        check(`${label}: waveform drawn`, await waveformDrawn(page));
        check(`${label}: dialog closed, track header shown`, !(await dialogOpen(page)) && (await page.locator('.piste-tete').count()) === 1);
        if (f.name === 'aiff' && way === 'picker') await page.screenshot({ path: path.join(out, 'import-aiff.png') });
      }
    }
    check('persistent storage asked once, at the first piece saved', (await page.evaluate(() => window.__persistCalls)) === 1, `${await page.evaluate(() => window.__persistCalls)} call(s)`);
    check('no page errors (formats)', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  // ------------------------------------------------------------ reload: the project comes back with its settings
  {
    const { page, context, errors } = await open();
    await pickFile(page, SWING);
    const id = await pieceOpen(page);
    await waveformDrawn(page);
    const trackId = (await state(page)).tracks[0].id;
    await page.evaluate((tid) => {
      const a = window.__fabtice.actions;
      a.setLoopRegion({ start: 4, end: 12 });
      a.stepSemitones(1);
      a.stepSemitones(1);
      a.stepSemitones(1);
      a.setCents(-20);
      a.setManualGrid({ bpm: 96, firstDownbeat: 0.5, numerator: 3 });
      a.setTempoRatio(0.8);
      a.setSubdivision(4);
      a.toggleTriplets();
      a.setTrackVolume(tid, 0.6);
    }, trackId);
    const before = await state(page);

    // The save is debounced: nothing yet, then the whole document.
    await sleep(150);
    const early = await storedDocument(page);
    check('autosave is debounced: the first save (the piece itself) has not seen the settings yet', early && early.playback.semitones === 0, `semitones ${early?.playback.semitones}`);
    await sleep(1200);
    const saved = await storedDocument(page);
    check('autosave: settings reach the device shortly after (loop, key, cents, tempo, grid, view, mix)',
      saved && saved.playback.semitones === 3 && saved.playback.cents === -20 && near(saved.playback.tempoRatio, 0.8, 1e-9) &&
        saved.loop.region.start === 4 && saved.loop.region.end === 12 && saved.tempoMap.segments[0].bpm === 96 && saved.tempoMap.meters[0].meter.numerator === 3 &&
        saved.view.subdivision === 4 && saved.view.triplets === true && near(saved.tracks[0].volume, 0.6, 1e-9),
      JSON.stringify(saved && saved.playback));
    check('stored: one project, its original file once', saved.project.id === id && (await storedAudioCount(page)) === 1);

    // Flush on page hide: change, hide at once, read before the debounce could have run.
    await page.evaluate(() => window.__fabtice.actions.setCents(-33));
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await sleep(120);
    check('flush on page hide: saved without waiting for the delay', (await storedDocument(page)).playback.cents === -33);

    // Reload: the piece is reopened.
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null);
    const after = await state(page);
    check('restore: same project and track ids', after.project.id === id && after.tracks[0].id === trackId && after.tracks[0].audio.id === before.tracks[0].audio.id);
    check('restore: title, source and duration', after.project.title === 'demo-swing' && after.project.source.fileName === 'demo-swing.mp3' && near(after.project.duration, 37.69, 0.1), `${after.project.duration}`);
    check('restore: loop, key and cents, tempo ratio', JSON.stringify(after.loop) === JSON.stringify(before.loop) && after.playback.semitones === 3 && after.playback.cents === -33 && near(after.playback.tempoRatio, 0.8, 1e-9));
    check('restore: manual tempo, bar length, grid origin', after.tempoMap.segments[0].bpm === 96 && after.tempoMap.meters[0].meter.numerator === 3 && after.tempoMap.origin === 'manual');
    check('restore: view settings and mix', after.view.subdivision === 4 && after.view.triplets === true && near(after.tracks[0].volume, 0.6, 1e-9));
    check('restore: dialog closed, playable, waveform drawn again', !(await dialogOpen(page)) && (await waveformDrawn(page)) && (await text(page, '.projet-titre')) === 'demo-swing');
    check('restore: the loop shows in the transport', (await text(page, '.ou')).includes('boucle'), await text(page, '.ou'));
    check('restore: engine got the settings back', await page.evaluate(() => {
      const snap = window.__fabtice.engine.snapshot();
      return snap.semitones === 3 && snap.cents === -33 && snap.loop && snap.loop.start === 4 && snap.state === 'ready';
    }));
    await page.screenshot({ path: path.join(out, 'import-restored.png') });

    // The restored piece is autosaved again.
    await page.evaluate(() => window.__fabtice.actions.stepSemitones(1));
    await sleep(1300);
    check('restore: autosave carries on after a reopening', (await storedDocument(page)).playback.semitones === 4);

    // A second import replaces the kept piece, only once it is open.
    await openDialog(page);
    await pickFile(page, fixture('tone.flac'));
    const second = await pieceOpen(page, id);
    await sleep(300);
    const replaced = await storedDocument(page);
    check('a new import replaces the kept project and its audio', replaced.project.id === second && replaced.project.title === 'tone' && (await storedAudioCount(page)) === 1);

    // Real reload, no wait: whatever was saved on hide must come back.
    await page.evaluate(() => window.__fabtice.actions.setCents(-7));
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null);
    check('reload straight after a change: the change is kept', (await state(page)).playback.cents === -7, `cents ${(await state(page)).playback.cents}`);

    // Damaged file after a good one: the message, and the kept piece is untouched.
    await openDialog(page);
    const damaged = path.join(work, 'abime.mp3');
    fs.writeFileSync(damaged, Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919 + 13) & 255)));
    await pickFile(page, damaged);
    await page.waitForSelector('.import-erreur');
    const message = await text(page, '.import-erreur');
    check('damaged file: plain French message, no jargon', message.includes('n’a pas pu être lu') && message.includes('abîmé') && !/decod|codec|EncodingError|buffer/i.test(message), message.replace(/\n/g, ' / '));
    await page.screenshot({ path: path.join(out, 'import-erreur-abime.png') });
    check('damaged file: the open piece is unchanged', (await state(page)).project.id === second);
    await page.click('button:has-text("Réessayer")');
    check('« Réessayer » returns to the choices', await page.locator('.accueil input[type="file"]').count() === 1);

    // Empty WAV (header, no samples).
    const empty = path.join(work, 'vide.wav');
    writeTone(empty, { kind: 'wav', seconds: 0, channels: 1 });
    await pickFile(page, empty);
    await page.waitForSelector('.import-erreur');
    check('empty audio: « aucun son »', (await text(page, '.import-erreur')).includes('ne contient aucun son'), await text(page, '.import-erreur'));
    await page.click('button:has-text("Réessayer")');

    // Not an audio file at all.
    await pickFile(page, { name: 'partition.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.waitForSelector('.import-erreur');
    check('unsupported file: the accepted formats are listed', (await text(page, '.import-erreur')).includes('mp3, wav, aiff, m4a, flac'));
    await page.click('button:has-text("Réessayer")');
    await page.keyboard.press('Escape');

    // After errors, the kept piece is still the one that comes back.
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null);
    check('after refused files, the kept piece is still reopened', (await state(page)).project.id === second);
    check('no page errors (reload)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ pieces of real size come back (the browser keeps big values apart)
  // A stored piece once never came back: the browser hands large values over
  // after the transaction that read them completes, and fixtures of a few kB
  // never took that path. Sizes here: a few hundred kB, a few MB, tens of MB.
  for (const seconds of [3, 35, 180]) {
    const big = path.join(work, `taille-reelle-${seconds}.wav`);
    writeTone(big, { kind: 'wav', seconds });
    const size = fs.statSync(big).size;
    // A persistent profile: a throw-away context keeps its database in memory,
    // where large values are never set apart, and could not show the fault.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-import-profile-'));
    const persistent = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } });
    const { page, context, errors } = await open({ context: persistent });
    await pickFile(page, big);
    const id = await pieceOpen(page, null, 120000);
    await sleep(1200);
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('fabtice');
          open.onsuccess = () => {
            const all = open.result.transaction('audio').objectStore('audio').getAll();
            all.onsuccess = () => resolve(all.result.map((a) => a.bytes.byteLength));
          };
        }),
    );
    check(`real size ${(size / 1e6).toFixed(1)} MB: the whole file is stored`, stored.length === 1 && stored[0] === size, JSON.stringify(stored));
    const t0 = Date.now();
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null, 20000).catch(() => {});
    const back = await state(page);
    check(`real size ${(size / 1e6).toFixed(1)} MB: comes back by itself after a reload, within a few seconds`, back.project?.id === id && Date.now() - t0 < 20000, `${back.project?.id === id ? 'back' : 'NOT back'} after ${((Date.now() - t0) / 1000).toFixed(1)} s, dialog ${(await dialogOpen(page)) ? 'open' : 'closed'}`);
    check(`real size ${(size / 1e6).toFixed(1)} MB: dialog closed, no page errors`, !(await dialogOpen(page)) && errors.length === 0, errors.join(' | '));
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }

  // ------------------------------------------------------------ the kept piece cannot be reopened: it stays kept, and is offered
  {
    const { page, context, errors } = await open();
    await pickFile(page, fixture('tone.wav'));
    const id = await pieceOpen(page);
    await sleep(400);
    // The audio of the kept piece goes missing (storage cleaned by the browser).
    const clearAudio = () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const open = indexedDB.open('fabtice');
            open.onsuccess = () => {
              const tx = open.result.transaction('audio', 'readwrite');
              tx.objectStore('audio').clear();
              tx.oncomplete = () => {
                open.result.close();
                resolve();
              };
            };
          }),
      );
    await clearAudio();
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte') && document.querySelector('.accueil-avis'));
    const notice = await text(page, '.accueil-avis');
    check('unreadable kept piece: the dialog opens with one calm sentence', notice.includes('« tone » n’a pas pu être rouvert') && notice.includes('toujours gardé sur cet appareil') && (await state(page)).project === null, notice);
    check('unreadable kept piece: « Rouvrir « tone » » and a discreet « Oublier ce morceau » are offered', (await text(page, '.reprise .plein')) === 'Rouvrir « tone »' && (await text(page, '.reprise .lien')) === 'Oublier ce morceau');
    check('unreadable kept piece: it is NOT forgotten', (await storedDocument(page))?.project.id === id);
    await page.screenshot({ path: path.join(out, 'reprise-proposee.png') });
    await page.click('.reprise .plein');
    await page.waitForFunction(() => document.querySelector('.reprise') && !document.querySelector('.import-etat'));
    check('« Rouvrir » on a piece that is really gone: offered again, still kept', (await page.locator('.reprise .plein').count()) === 1 && (await storedDocument(page))?.project.id === id);
    check('no page errors (unreadable kept piece)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // A launch cut short during a restore: no automatic attempt, the offer; « Rouvrir » then works.
    const { page, context, errors } = await open();
    await pickFile(page, fixture('tone.wav'));
    const id = await pieceOpen(page);
    await sleep(400);
    await page.evaluate((pid) => localStorage.setItem('fabtice.restoring', pid), id);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await page.waitForFunction(() => document.querySelector('.reprise'));
    const notice = await text(page, '.accueil-avis');
    check('launch cut short: no automatic reopening, the dialog offers the piece', (await state(page)).project === null && (await dialogOpen(page)) && notice.includes('La dernière ouverture de « tone » s’est interrompue'), notice);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await page.waitForFunction(() => document.querySelector('.reprise'));
    check('launch cut short: quitting without choosing does not trigger an attempt at the next launch', (await state(page)).project === null);
    await page.click('.reprise .plein');
    await pieceOpen(page, null);
    check('launch cut short: « Rouvrir » opens it, the offer and the dialog are gone', (await state(page)).project.id === id && !(await dialogOpen(page)) && (await page.locator('.reprise').count()) === 0);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null);
    check('launch cut short: the next launch opens it by itself again', (await state(page)).project.id === id);
    check('no page errors (cut short)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // « Oublier ce morceau » asks twice; a new import replaces a kept piece and removes the offer.
    const { page, context, errors } = await open();
    await pickFile(page, fixture('tone.wav'));
    const id = await pieceOpen(page);
    await sleep(400);
    await page.evaluate((pid) => localStorage.setItem('fabtice.restoring', pid), id);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await page.waitForFunction(() => document.querySelector('.reprise'));
    await page.click('.reprise .lien');
    const ask = await text(page, '.reprise-confirme');
    check('forgetting asks for confirmation, in plain words', ask.includes('Oublier ce morceau ? Il sera effacé de cet appareil.') && (await storedDocument(page))?.project.id === id, ask.replace(/\n/g, ' / '));
    await page.click('.reprise-confirme .plein');
    check('« Non, le garder » goes back to the offer, nothing deleted', (await page.locator('.reprise .plein').count()) === 1 && (await storedDocument(page))?.project.id === id);
    await page.click('.reprise .lien');
    await page.click('.reprise-confirme .bouton-cadre');
    await page.waitForFunction(() => !document.querySelector('.reprise'));
    check('« Oui, l’oublier » deletes the piece and its audio', (await storedDocument(page)) === null && (await storedAudioCount(page)) === 0 && (await page.evaluate(() => localStorage.getItem('fabtice.restoring'))) === null);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await sleep(500);
    check('after forgetting, the next launch is a clean start', (await dialogOpen(page)) && (await page.locator('.reprise').count()) === 0 && (await page.locator('.accueil-avis').count()) === 0);
    await context.close();

    // A new import replaces the kept piece.
    const second = await open();
    await pickFile(second.page, fixture('tone.wav'));
    const keptId = await pieceOpen(second.page);
    await sleep(400);
    await second.page.evaluate((pid) => localStorage.setItem('fabtice.restoring', pid), keptId);
    await second.page.reload();
    await second.page.waitForFunction(() => window.__fabtice);
    await second.page.waitForFunction(() => document.querySelector('.reprise'));
    await pickFile(second.page, M4A);
    const newId = await pieceOpen(second.page, null);
    await sleep(900);
    check('a new import replaces the kept piece and removes the offer', newId !== keptId && (await storedDocument(second.page))?.project.id === newId && (await second.page.locator('.reprise').count()) === 0 && (await state(second.page)).ui.reopenOffer === null);
    check('no page errors (forget, replace)', errors.length === 0 && second.errors.length === 0, [...errors, ...second.errors].join(' | '));
    await second.context.close();
  }

  // ------------------------------------------------------------ storage that fails
  for (const [label, init, expected] of [
    [
      'blocked',
      () => {
        const refusing = {
          open() {
            throw new DOMException('denied', 'SecurityError');
          },
        };
        Object.defineProperty(window, 'indexedDB', { get: () => refusing, configurable: true });
      },
      'ne permet pas à Fabtice d’enregistrer',
    ],
    [
      'full',
      () => {
        IDBObjectStore.prototype.put = function () {
          throw new DOMException('full', 'QuotaExceededError');
        };
      },
      'plus assez de place',
    ],
  ]) {
    const { page, context, errors } = await open({ init });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    check(`storage ${label}: the app starts normally`, await dialogOpen(page));
    await pickFile(page, fixture('tone.wav'));
    await pieceOpen(page);
    await waveformDrawn(page);
    await page.waitForSelector('.avis-stockage');
    const notice = await text(page, '.avis-stockage');
    check(`storage ${label}: the piece opens and a calm notice says it will not be kept`, notice.includes('ne sera pas gardé') && notice.includes(expected), notice.replace(/\n/g, ' / '));
    await sleep(300);
    await page.screenshot({ path: path.join(out, `import-stockage-${label}.png`) });
    await page.click('.jouer');
    check(`storage ${label}: playback still works`, (await page.getAttribute('.jouer', 'aria-pressed')) === 'true');
    await page.click('.jouer');
    await page.evaluate(() => window.__fabtice.actions.stepSemitones(1));
    await sleep(1000);
    check(`storage ${label}: later changes do not raise more notices`, (await page.locator('.avis-stockage').count()) === 1 && (await state(page)).playback.semitones === 1);
    await page.click('.avis-stockage button');
    check(`storage ${label}: « Compris » dismisses the notice`, (await page.locator('.avis-stockage').count()) === 0);
    check(`storage ${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    check(`storage ${label}: after a reload, nothing was kept (new-piece dialog, no error)`, (await state(page)).project === null && (await page.locator('.accueil-avis').count()) === 0);
    await context.close();
  }

  // ------------------------------------------------------------ with the real audio engine
  {
    const { page, context, errors } = await open({ query: '?debug' });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    await pickFile(page, fixture('tone.flac'));
    const id = await pieceOpen(page);
    const s = await state(page);
    const engine = await page.evaluate(() => ({ state: window.__fabtice.engine.getState(), duration: window.__fabtice.engine.getDuration(), rate: window.__fabtice.engine.sampleRate }));
    check('real engine: the imported piece is loaded and ready', engine.state === 'ready' && near(engine.duration, s.project.duration, 0.01) && engine.rate === 48000, JSON.stringify(engine));
    await sleep(1200);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null);
    const again = await page.evaluate(() => ({ state: window.__fabtice.engine.getState(), duration: window.__fabtice.engine.getDuration() }));
    check('real engine: the kept piece is reopened into the engine', (await state(page)).project.id === id && again.state === 'ready' && near(again.duration, 1.5, 0.01), JSON.stringify(again));
    check('no page errors (real engine)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ phone: the notice and the dialog fit
  {
    const { page, context } = await open({
      viewport: { width: 390, height: 844 },
      init: () => {
        IDBObjectStore.prototype.put = function () {
          throw new DOMException('full', 'QuotaExceededError');
        };
      },
    });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    await pickFile(page, fixture('tone.wav'));
    await pieceOpen(page);
    await page.waitForSelector('.avis-stockage');
    await sleep(300);
    const geometry = await page.evaluate(() => {
      const n = document.querySelector('.avis-stockage').getBoundingClientRect();
      const t = document.querySelector('.bas')?.getBoundingClientRect();
      return { left: n.left, right: n.right, bottom: n.bottom, transportTop: t ? t.top : null, scrollW: document.documentElement.scrollWidth };
    });
    check('phone: the storage notice fits the width, above the transport, no horizontal scroll', geometry.left >= 0 && geometry.right <= 390 && geometry.scrollW <= 390 && (geometry.transportTop === null || geometry.bottom <= geometry.transportTop + 1), JSON.stringify(geometry));
    await page.screenshot({ path: path.join(out, 'import-telephone-stockage.png') });
    await context.close();
  }

  // ------------------------------------------------------------ link import, against a scripted Mac app
  {
    // First time: tool download with its explanation, then extraction.
    const { page, context, errors } = await open({ init: installBridge, initArg: bridgeConfig({ installed: false, gateInstall: true, gateExtract: true }) });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    check('Mac app: link field, no update offer when the tool is current', (await page.locator('.champ input[type="url"]').count()) === 1 && (await page.locator('.mise-a-jour').count()) === 0);
    await page.fill('.champ input', `  ${LINK}  `);
    await page.click('.champ .plein');
    await page.waitForSelector('.import-etat');
    await page.waitForFunction(() => document.querySelector('.import-etat .phase')?.textContent.includes('Installation'));
    const installText = await text(page, '.import-etat');
    check('first time: the tool download is explained in one plain sentence', installText.includes('télécharge un petit outil gratuit (yt-dlp)') && installText.includes('qu’une fois'), installText.replace(/\n/g, ' / '));
    check('first time: the tool is named only in that sentence', (installText.match(/yt-dlp/g) ?? []).length === 1);
    check('first time: no « Annuler » that would lie while the tool downloads', (await page.locator('.import-etat button').count()) === 0);
    await page.evaluate(() => window.__emit.yt({ phase: 'download', received: 500, total: 1000 }));
    await page.waitForFunction(() => document.querySelector('.import-etat .phase')?.textContent.includes('50 %'));
    check('first time: download progress shown', (await text(page, '.import-etat .phase')).includes('50 %'));
    await page.screenshot({ path: path.join(out, 'import-lien-installation.png') });
    await page.evaluate(() => window.__gates.install.resolve());
    await page.waitForFunction(() => document.querySelector('.import-etat .phase')?.textContent.includes('Lecture des informations'));
    check('then the video details are read', true);
    await page.evaluate((meta) => window.__emit.ex({ phase: 'download', percent: 42, meta }), META);
    await page.waitForFunction(() => document.querySelector('.import-etat .phase')?.textContent.includes('42 %'));
    const downloading = await text(page, '.import-etat');
    check('extraction: title, percentage, and honesty about cancelling', downloading.includes('Autumn Leaves (essai)') && downloading.includes('Téléchargement du son') && downloading.includes('ne peut pas être interrompue') && (await page.locator('.import-etat button').count()) === 0, downloading.replace(/\n/g, ' / '));
    await page.screenshot({ path: path.join(out, 'import-lien-telechargement.png') });
    // A second import must not start while the first one runs.
    await dropFile(page, fixture('tone.wav'), 'audio/wav');
    await sleep(300);
    check('a second import does not start while one runs', (await state(page)).project === null && (await page.evaluate(() => window.__bridgeLog.filter((l) => l.startsWith('extract')).length)) === 1);
    await page.keyboard.press('Escape');
    check('Escape does not close the dialog during the extraction', await dialogOpen(page));
    await page.evaluate(() => window.__gates.extract.resolve());
    const id = await pieceOpen(page);
    const s = await state(page);
    check('link: piece opened with the video title, source line « importé d’un lien »', s.project.title === 'Autumn Leaves (essai)' && s.project.source.kind === 'link' && s.project.source.channel === 'Un guitariste' && (await text(page, '.projet-source')).endsWith('· importé d’un lien'), await text(page, '.projet-source'));
    check('link: 48 kHz stereo, about 4 s, waveform drawn', s.tracks[0].audio.sampleRate === 48000 && s.tracks[0].audio.channels === 2 && near(s.project.duration, 4.02, 0.1) && (await waveformDrawn(page)));
    const log = await page.evaluate(() => window.__bridgeLog);
    check('link: launch check, then status, install, one extraction of the trimmed link', JSON.stringify(log) === JSON.stringify(['check', 'status', 'install', `extract ${LINK}`]), JSON.stringify(log));
    await sleep(500);
    check('link: kept on the device like a file (the m4a bytes)', (await storedAudioCount(page)) === 1 && (await storedDocument(page)).project.id === id);
    check('no page errors (link, first time)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // Refusal: the app's own sentence.
    const refusal = { ok: false, refused: true, error: 'Les directs ne peuvent pas être importés pour l’instant.', meta: META };
    const { page, context, errors } = await open({ init: installBridge, initArg: bridgeConfig({ extractions: [refusal] }) });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    await page.fill('.champ input', LINK);
    await page.click('.champ .plein');
    await page.waitForSelector('.import-erreur');
    const message = await text(page, '.import-erreur');
    check('refusal: generic sentence, then the app’s reason', message.includes('Ce lien ne peut pas être importé.') && message.includes('Les directs ne peuvent pas être importés pour l’instant.'), message.replace(/\n/g, ' / '));
    await page.screenshot({ path: path.join(out, 'import-lien-refus.png') });
    await page.click('button:has-text("Réessayer")');
    check('refusal: back to the choices, nothing opened', (await page.locator('.champ input').count()) === 1 && (await state(page)).project === null);
    check('no page errors (refusal)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    // Technical failure: nothing technical shown.
    const failure = { ok: false, error: 'yt-dlp a échoué pendant le téléchargement : ERROR: HTTP Error 403' };
    const { page, context } = await open({ init: installBridge, initArg: bridgeConfig({ extractions: [failure] }) });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    await page.fill('.champ input', LINK);
    await page.click('.champ .plein');
    await page.waitForSelector('.import-erreur');
    const message = await text(page, '.import-erreur');
    check('failure: calm message with advice, no technical text', message.includes('Vérifiez votre connexion') && !/yt-dlp|403|ERROR/.test(message), message.replace(/\n/g, ' / '));
    await context.close();
  }
  {
    // The extraction answers « install the tool first »: install, retry once.
    const needs = { ok: false, needsYtdlp: true, error: 'yt-dlp n’est pas encore installé.' };
    const { page, context } = await open({ init: installBridge, initArg: bridgeConfig({ extractions: [needs, { ok: true, meta: META }] }) });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    await page.fill('.champ input', LINK);
    await page.click('.champ .plein');
    await pieceOpen(page);
    const log = await page.evaluate(() => window.__bridgeLog);
    check('needsYtdlp: install, then the extraction is retried once', JSON.stringify(log) === JSON.stringify(['check', 'status', `extract ${LINK}`, 'install', `extract ${LINK}`]), JSON.stringify(log));
    await context.close();
  }
  {
    // A newer tool exists: a discreet offer, never a blocking prompt.
    const check1 = { skipped: false, latest: { tag: '2099.01.01', sha256: 'x', url: 'u', sumsUrl: 's' }, installed: true, updateAvailable: true, attempts: [] };
    const { page, context, errors } = await open({ init: installBridge, initArg: bridgeConfig({ check: check1, gateInstall: true }) });
    await page.waitForSelector('.mise-a-jour');
    const offer = await text(page, '.mise-a-jour');
    check('update: a one-line offer in the dialog, the link field still usable', offer.includes('Une version plus récente de l’outil d’import est disponible.') && offer.includes('Mettre à jour') && (await page.locator('.champ .plein').isEnabled()), offer);
    await page.screenshot({ path: path.join(out, 'import-lien-mise-a-jour.png') });
    await page.click('.mise-a-jour button');
    await page.waitForFunction(() => document.querySelector('.import-etat .phase')?.textContent.includes('Mise à jour'));
    check('update: progress shown, no « Annuler »', (await page.locator('.import-etat button').count()) === 0);
    await page.evaluate(() => window.__gates.install.resolve());
    await page.waitForSelector('.champ input');
    check('update: done, back to the choices without the offer', (await page.locator('.mise-a-jour').count()) === 0 && (await state(page)).ui.toolUpdate === false);
    check('no page errors (update)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the cost of a 5-minute stereo piece
  {
    const wav5 = path.join(work, 'cinq-minutes.wav');
    const aiff5 = path.join(work, 'cinq-minutes.aiff');
    const seconds = writeTone(wav5, { kind: 'wav', seconds: 300 });
    writeTone(aiff5, { kind: 'aiff', seconds: 300 });
    note(`generated 5-minute stereo files: wav ${(fs.statSync(wav5).size / 1e6).toFixed(1)} MB, aiff ${(fs.statSync(aiff5).size / 1e6).toFixed(1)} MB`);
    const { page, context, errors } = await open({
      query: '?debug',
      init: () => {
        // Times the browser's own decoding.
        const real = OfflineAudioContext.prototype.decodeAudioData;
        window.__decodeMs = [];
        OfflineAudioContext.prototype.decodeAudioData = function (...args) {
          const t0 = performance.now();
          const p = real.apply(this, args);
          Promise.resolve(p).then(() => window.__decodeMs.push(performance.now() - t0), () => {});
          return p;
        };
      },
    });
    await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
    const memory = async () =>
      page.evaluate(async () => {
        const jsHeap = performance.memory ? performance.memory.usedJSHeapSize : null;
        let total = null;
        try {
          total = (await performance.measureUserAgentSpecificMemory()).bytes;
        } catch {
          // not available here
        }
        return { jsHeap, total };
      });
    /** Resident memory of every Chromium process of this run, in bytes. */
    const rss = () => {
      try {
        const lines = execSync('ps -eo rss=,comm=', { encoding: 'utf8' }).split('\n').filter((l) => /\s(chrome|chromium|headless_shell|chrome-headless-shell)\S*$/.test(l));
        return lines.reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[0]) * 1024, 0);
      } catch {
        return null;
      }
    };
    const mb = (n) => (n === null ? 'n/a' : `${(n / 1048576).toFixed(0)} MB`);
    const baseline = await memory();
    const rssBefore = rss();

    for (const [label, file] of [['wav', wav5], ['aiff', aiff5]]) {
      if (label === 'aiff') await openDialog(page);
      const before = (await state(page)).project?.id ?? null;
      const t0 = Date.now();
      await pickFile(page, file);
      await page.waitForFunction(() => window.__seen.some((x) => x.includes('Préparation du son') || x.includes('Lecture du fichier')) || window.__fabtice.store.getState().ui.import.kind === 'busy', null, { timeout: 5000 }).catch(() => {});
      const id = await pieceOpen(page, before, 120000);
      const total = Date.now() - t0;
      const s = await state(page);
      const decodeMs = await page.evaluate(() => window.__decodeMs.at(-1) ?? null);
      check(`5 min stereo ${label}: opened, 300 s, 48 kHz stereo`, near(s.project.duration, seconds, 0.05) && s.tracks[0].audio.channels === 2 && s.tracks[0].audio.sampleRate === 48000, `${s.project.duration.toFixed(2)} s`);
      const afterOpen = await memory();
      const rssAfter = rss();
      const peaksStart = Date.now();
      await waveformDrawn(page);
      note(`5 min stereo ${label}: import to playable ${(total / 1000).toFixed(2)} s (browser decode ${decodeMs === null ? 'not used: own reader and resampler' : `${(decodeMs / 1000).toFixed(2)} s`}); waveform ready ${((Date.now() - peaksStart) / 1000).toFixed(2)} s later; memory after: JS heap ${mb(afterOpen.jsHeap)}, page total ${mb(afterOpen.total)} (before: ${mb(baseline.jsHeap)} / ${mb(baseline.total)}); decoded audio alone = ${((s.tracks[0].audio.frames * 2 * 4) / 1048576).toFixed(0)} MB; all Chromium processes, resident: ${mb(rssBefore)} before, ${mb(rssAfter)} after`);
      await sleep(1500);
      check(`5 min stereo ${label}: kept on the device`, (await storedDocument(page))?.project.id === id && (await storedAudioCount(page)) === 1);
      if (label === 'wav') {
        const estimate = await page.evaluate(async () => (await navigator.storage.estimate()).usage);
        note(`storage used on the device after the 5 min wav: ${(estimate / 1e6).toFixed(1)} MB`);
      }
    }

    // Reopening at launch: the decode runs again, « Ouverture de « … »… » is shown.
    await page.evaluate(() => (window.__seen.length = 0));
    const t0 = Date.now();
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await pieceOpen(page, null, 120000);
    const reopen = Date.now() - t0;
    const seen = await page.evaluate(() => window.__seen);
    note(`reopening the 5 min piece at launch: ${(reopen / 1000).toFixed(2)} s from reload to playable; progress texts seen: ${JSON.stringify(seen)}`);
    check('launch with a kept piece: « Ouverture de « … »… » is shown while it opens', seen.some((x) => x.startsWith('Ouverture de « cinq-minutes »')) || reopen < 400, JSON.stringify(seen));
    check('no page errors (5 minutes)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  srv.close();
  fs.rmSync(work, { recursive: true, force: true });
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
