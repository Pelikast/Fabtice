// The alert about changes not saved (C5) in Chromium, on a piece really imported (so that it is « modified » as
// a new import is) and kept on the device. Desktop (1280 × 800, mouse) and phone (390 × 844, touch):
//   - the piece is modified, « Nouveau projet »: the alert is up, with the exact text and its three buttons, the
//     default (« Enregistrer ») has the focus; nothing else has happened (the dialog of the new project is not open);
//   - « Annuler » (the button, and Escape): the alert goes, nothing opens, the piece stays modified;
//   - « Ne pas enregistrer »: the new-project dialog opens, nothing was written, the piece is the same;
//   - « Enregistrer » (and Enter, the default): the piece never saved asks where (the dialog of « Enregistrer
//     sous… », its panel stood in for by a file of the page's private file system), then goes on; a saved piece
//     is overwritten without any window; a save that fails keeps the user where they are;
//   - not modified: no alert at all.
// Screenshots of the alert in each form go to $FABTICE_ALERT_OUT (default: a temporary folder).
//   npm run build && npm run test:alert

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { menuCommand } from './lib/menu.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_ALERT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-alert-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEXT = 'Les modifications du projet en cours n’ont pas été sauvegardées, voulez-vous enregistrer ?';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-alert-work-'));
const wav = path.join(work, 'Blue Bossa.wav');
{
  const rate = 44100;
  const frames = rate * 6;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 9000 + Math.sin((2 * Math.PI * 330 * i) / rate) * 4000);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
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
  fs.writeFileSync(wav, Buffer.concat([head, data]));
}

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

/** « Enregistrer sous… » is answered by a file of the page's private file system; the writes are counted. */
function filePickers() {
  window.__picks = [];
  window.__writes = 0;
  window.showSaveFilePicker = async (options) => {
    const name = (options && options.suggestedName) || 'Projet.fab';
    window.__picks.push(name);
    const handle = await (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
    const real = handle.createWritable.bind(handle);
    handle.createWritable = async (...a) => {
      window.__writes++;
      const w = await real(...a);
      const close = w.close.bind(w);
      // The disk refuses at the end (full, removed): the swap file is never put over the file.
      w.close = async () => {
        if (window.__failClose) throw new DOMException('The disk is full', 'QuotaExceededError');
        return close();
      };
      return w;
    };
    return handle;
  };
  delete window.showOpenFilePicker;
}

async function open(form) {
  const touch = form === 'phone';
  const context = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
  await context.addInitScript(filePickers);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/No available adapters/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`${url}/?debug`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.project, null, { timeout: 30000 });
  await page.locator('.accueil input[type="file"]').setInputFiles(wav);
  await ready(page);
  return { context, page, errors, touch };
}

const ready = (page) =>
  page.waitForFunction(
    () => {
      const s = window.__fabtice.store.getState();
      return s.project && (s.transport.engine === 'ready' || s.transport.engine === 'playing') && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
    },
    null,
    { timeout: 120000 },
  );

const tap = (page, touch, selector) => (touch ? page.tap(selector) : page.click(selector));
const modified = (page) => page.evaluate(() => window.__fabtice.history.isModified());
const state = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    return { id: s.project?.id ?? null, dialog: s.ui.newPieceOpen, alert: !!document.querySelector('[data-testid="alerte-projet"]'), saveDialog: !!document.querySelector('[data-testid="enregistrer-projet"]'), writes: window.__writes, picks: window.__picks.length };
  });

/** « Nouveau projet »: the menu Fabtice (C6), at the mouse on a computer, at a touch on a phone. */
async function newProject(page) {
  await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
}

async function closeNewProjectDialog(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__fabtice.store.getState().ui.newPieceOpen);
}

async function alertUp(page) {
  await page.waitForSelector('[data-testid="alerte-projet"]', { timeout: 10000 });
  await sleep(300);
}

async function alertGone(page) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="alerte-projet"]'), null, { timeout: 60000 });
}

for (const form of ['desktop', 'phone']) {
  const { context, page, errors, touch } = await open(form);
  const label = `${form}`;
  try {
    const id = (await state(page)).id;
    check(`${label}: a piece just imported reads « modified »`, await modified(page));

    // ---------------------------------------------------------- the alert, its text and its three buttons
    await newProject(page, touch);
    await alertUp(page);
    const shown = await page.evaluate(() => ({
      text: document.querySelector('[data-testid="alerte-texte"]').textContent.trim(),
      buttons: [...document.querySelectorAll('[data-testid="alerte-projet"] button')].map((b) => b.textContent.trim()),
      focus: document.activeElement?.getAttribute('data-testid'),
      role: document.querySelector('[data-testid="alerte-projet"]').getAttribute('role'),
      inside: [...document.querySelectorAll('[data-testid="alerte-projet"] button, [data-testid="alerte-projet"] .accueil')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
      }),
      noScroll: document.documentElement.scrollWidth <= window.innerWidth,
      behind: document.querySelector('.app').hasAttribute('inert'),
    }));
    check(`${label}: « Nouveau projet » with changes not saved: the alert, with the exact text`, shown.text === TEXT, shown.text);
    check(`${label}: its three buttons`, JSON.stringify(shown.buttons) === JSON.stringify(['Enregistrer', 'Ne pas enregistrer', 'Annuler']), JSON.stringify(shown.buttons));
    check(`${label}: « Enregistrer » is the default: it has the focus`, shown.focus === 'alerte-enregistrer', shown.focus);
    check(`${label}: an alert dialog, the page behind it inert, everything inside the window`, shown.role === 'alertdialog' && shown.behind && shown.inside && shown.noScroll);
    check(`${label}: nothing else happened yet (the new-project window is not open)`, !(await state(page)).dialog);
    await page.screenshot({ path: path.join(out, `alerte-${form}.png`) });

    // ---------------------------------------------------------- « Annuler »: the button, then Escape
    await tap(page, touch, '[data-testid="alerte-annuler"]');
    await alertGone(page);
    let st = await state(page);
    check(`${label}: « Annuler »: the alert goes, nothing opens, the piece is the same and still modified`, !st.dialog && st.id === id && (await modified(page)));
    await newProject(page, touch);
    await alertUp(page);
    await page.keyboard.press('Escape');
    await alertGone(page);
    st = await state(page);
    check(`${label}: Escape is « Annuler »`, !st.dialog && st.id === id && (await modified(page)));

    // ---------------------------------------------------------- « Ne pas enregistrer »
    await newProject(page, touch);
    await alertUp(page);
    await tap(page, touch, '[data-testid="alerte-abandonner"]');
    await alertGone(page);
    st = await state(page);
    check(`${label}: « Ne pas enregistrer »: the new-project window opens, nothing was written, no panel`, st.dialog && st.writes === 0 && st.picks === 0 && !st.saveDialog, JSON.stringify(st));
    check(`${label}: … and the piece is still there, untouched`, st.id === id);
    await closeNewProjectDialog(page);

    // ---------------------------------------------------------- « Enregistrer » on a piece never saved: where, then goes on
    await newProject(page, touch);
    await alertUp(page);
    await tap(page, touch, '[data-testid="alerte-enregistrer"]');
    await alertGone(page);
    await page.waitForSelector('[data-testid="enregistrer-projet"]', { timeout: 10000 });
    check(`${label}: « Enregistrer » on a piece never saved: the dialog that asks where`, true);
    await page.screenshot({ path: path.join(out, `alerte-enregistrer-sous-${form}.png`) });
    // Closing that dialog is staying where one is.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="enregistrer-projet"]'));
    await sleep(200);
    st = await state(page);
    check(`${label}: … closed without saving: the user stays (no new-project window), still modified`, !st.dialog && st.id === id && (await modified(page)) && st.picks === 0);
    await newProject(page, touch);
    await alertUp(page);
    await tap(page, touch, '[data-testid="alerte-enregistrer"]');
    await alertGone(page);
    await tap(page, touch, '[data-testid="preparer-projet"]');
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.newPieceOpen, null, { timeout: 120000 });
    st = await state(page);
    check(`${label}: saved to the file chosen, then the new-project window opens`, st.picks === 1 && st.writes === 1 && st.dialog && !st.saveDialog, JSON.stringify(st));
    const savedName = await page.evaluate(() => window.__picks[0]);
    check(`${label}: the file is named after the piece`, savedName === 'Blue Bossa.fab', savedName);
    const bytes = await page.evaluate(async (n) => (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).size, savedName);
    check(`${label}: the file is a project of real size`, bytes > 400_000, `${bytes} bytes`);
    check(`${label}: the piece reads « saved »`, !(await modified(page)));
    await closeNewProjectDialog(page);

    // ---------------------------------------------------------- not modified: no alert
    await newProject(page, touch);
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.newPieceOpen);
    st = await state(page);
    check(`${label}: not modified: no alert, the new-project window opens at once`, !st.alert && st.dialog);
    await closeNewProjectDialog(page);

    // ---------------------------------------------------------- « Enregistrer » on a saved piece: overwritten, no window; Enter is the default
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 17 } })));
    check(`${label}: a change reads « modified »`, await modified(page));
    await newProject(page, touch);
    await alertUp(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.newPieceOpen, null, { timeout: 60000 });
    st = await state(page);
    check(`${label}: Enter is « Enregistrer »: the same file overwritten with no window, then it goes on`, st.writes === 2 && st.picks === 1 && !st.saveDialog && !st.alert, JSON.stringify(st));
    check(`${label}: … and the piece reads « saved »`, !(await modified(page)));
    await closeNewProjectDialog(page);

    // ---------------------------------------------------------- a save that fails keeps the user where they are
    await page.evaluate(() => {
      window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, tuningCents: 23 } }));
      window.__failClose = true;
    });
    await newProject(page, touch);
    await alertUp(page);
    await tap(page, touch, '[data-testid="alerte-enregistrer"]');
    await alertGone(page);
    await page.waitForSelector('[data-testid="enregistrement"]', { timeout: 30000 });
    const message = await page.textContent('[data-testid="enregistrement"] .import-erreur');
    check(`${label}: a save that fails says so calmly, and the old file is untouched`, message.includes('n’a pas pu être enregistré') && message.includes('n’est pas touché'), message);
    st = await state(page);
    check(`${label}: … and the user stays: no new-project window, still modified`, !st.dialog && (await modified(page)));
    await page.screenshot({ path: path.join(out, `alerte-echec-${form}.png`) });
    await tap(page, touch, '[data-testid="enregistrement"] button');
    check(`${label}: no page errors`, errors.filter((e) => !/QuotaExceeded|disk is full|Failed to load resource/.test(e)).length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

console.log(`(screenshots in ${out})`);
srv.close();
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall alert checks passed');
