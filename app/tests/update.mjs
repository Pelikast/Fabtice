// Browser checks of the update of Fabtice (C16), in Chromium, on the built interface served from web/:
//
//  1. Mac app (a scripted `window.fabtice` standing for the main process, computer form 1280 × 800):
//     - the message at opening (`?maj=message`, after the search the page asks a few seconds after start): the
//       two numbers, the notes, one button « Mettre à jour Fabtice », « Plus tard »; the opening screen waits
//       behind it; the menu greyed out while it is open;
//     - the update asked: the progress (percentage, amount), « Annuler », the closing, the restart;
//     - each failure and each place where it cannot work, with its sentence, and « Télécharger à la main »;
//     - a computation running: the question first (« Attendre », « Continuer quand même »);
//     - the menu bar's « Rechercher une mise à jour… »: the window at once, then « Fabtice est à jour » or why not;
//     - Réglages → Général: the app's own number (from the bridge), the search and its answer in place, the
//       update from there, « Vérifier à chaque ouverture »;
//  2. Web app (both forms; a real service worker, `?horsligne`): a new version of the site installed and waiting
//     (its sw.js changed on the server) is offered at opening, « Recharger » takes it at once and the page comes
//     back on it; the search of Réglages finds it; offline still works afterwards; a test page with no worker says so.
//
//   npm run build && npm run test:update
// Screenshots in $FABTICE_UPDATE_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { openSettingsTab, closeSettings, press } from './lib/settings.mjs';
import { openMenu, closeMenu } from './lib/menu.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../web');
const out = process.env.FABTICE_UPDATE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-update-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

// ---------------------------------------------------------------- the scripted Mac app

/** `window.fabtice` with the update's methods; `window.__maj` drives it from the test. */
function installBridge() {
  const none = () => () => {};
  const listeners = new Set();
  const base = { current: '1.0.7', phase: 'idle', origin: null, seq: 0, available: null, blocked: null, progress: null, error: null, room: null };
  const maj = {
    state: base,
    calls: [],
    answer: null,
    emit(patch) {
      maj.state = { ...maj.state, ...patch };
      for (const l of listeners) l(maj.state);
    },
  };
  window.__maj = maj;
  window.fabtice = {
    systemInfo: async () => null,
    ytdlpStatus: async () => ({ source: 'managed', path: '/x/yt-dlp', installed: true, attempts: [] }),
    ytdlpCheck: async () => ({ skipped: true, reason: 'test', attempts: [] }),
    ytdlpInstall: async () => ({ ok: true, meta: {}, attempts: [] }),
    extract: async () => ({ ok: false, code: 'link-failed' }),
    copyText: async () => true,
    onYtdlpProgress: none,
    onExtractProgress: none,
    updateStatus: async () => maj.state,
    checkForUpdate: async (origin) => {
      maj.calls.push(`check:${origin}`);
      maj.emit({ phase: 'checking', origin: origin === 'launch' ? 'launch' : 'page' });
      const answer = maj.answer ?? { phase: 'up-to-date' };
      maj.emit({ error: null, blocked: null, ...answer, seq: maj.state.seq + 1 });
      return maj.state;
    },
    startUpdate: async () => {
      maj.calls.push('start');
      return { ok: true };
    },
    cancelUpdate: async () => {
      maj.calls.push('cancel');
      return true;
    },
    openUpdatePage: async () => {
      maj.calls.push('page');
      return true;
    },
    onUpdateState: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

const AVAILABLE = {
  phase: 'available',
  available: {
    version: '1.0.8',
    publishedAt: '2026-12-01T10:00:00Z',
    size: 121_400_000,
    notes: [
      '### Plus simple',
      '- La mise à jour de l’app se fait en **un bouton**.',
      '- Les accords des standards sont mieux reconnus.',
      '',
      '### Corrigé',
      ...Array.from({ length: 14 }, (_, i) => `- Une petite correction numéro ${i + 1}, décrite en une ligne.`),
    ].join('\n'),
  },
};

async function openDesktop(query = '?debug&maj=message', { answer = AVAILABLE } = {}) {
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addInitScript(installBridge);
  await context.addInitScript((a) => {
    // The answer the scripted main process gives to a search.
    const wait = setInterval(() => {
      if (window.__maj) {
        window.__maj.answer = a;
        clearInterval(wait);
      }
    }, 1);
  }, answer);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabticeUpdate, null, { timeout: 15000 });
  return { context, page, errors };
}

const MSG = '[data-testid="maj-message"]';
const text = (page, sel) => page.locator(sel).innerText().then((s) => s.replace(/\s+/g, ' ').trim());
const calls = (page) => page.evaluate(() => window.__maj.calls.slice());
const emit = (page, patch) => page.evaluate((p) => window.__maj.emit(p), patch);

async function desktopChecks() {
  const tag = 'Mac app';
  const { context, page, errors } = await openDesktop();
  // ---------------------------------------------------------------- at opening
  const started = Date.now();
  await page.waitForSelector(`${MSG}[data-etat="available"]`, { timeout: 15000 });
  check(`${tag}: the search is asked a few seconds after opening, as « launch »`, (await calls(page))[0] === 'check:launch' && Date.now() - started > 2000, `${Date.now() - started} ms`);
  check(`${tag}: the title`, (await text(page, '#maj-titre')) === 'Une mise à jour est disponible');
  check(`${tag}: the two numbers (this app's own, from the bridge)`, (await text(page, '[data-testid="maj-versions"]')) === 'Vous avez Fabtice 1.0.7. La version 1.0.8 est prête à être installée.');
  check(`${tag}: the notes, with their titles, lists and bold`, (await page.locator('[data-testid="maj-notes"] h4').count()) === 2 && (await page.locator('[data-testid="maj-notes"] li').count()) === 16 && (await text(page, '[data-testid="maj-notes"] strong')) === 'un bouton');
  const notes = await page.locator('[data-testid="maj-notes"]').evaluate((el) => ({ scroll: el.scrollHeight > el.clientHeight, h: el.clientHeight }));
  check(`${tag}: long notes scroll inside a short box`, notes.scroll && notes.h <= 222, JSON.stringify(notes));
  const buttons = await page.locator(`${MSG} .message-actions button`).allInnerTexts();
  check(`${tag}: one button that updates, and « Plus tard »`, JSON.stringify(buttons) === JSON.stringify(['Mettre à jour Fabtice', 'Plus tard']), JSON.stringify(buttons));
  const look = await page.evaluate(() => {
    const main = document.querySelector('[data-testid="maj-mettre"]');
    const box = document.querySelector('.message-maj').getBoundingClientRect();
    return { bg: getComputedStyle(main).backgroundColor, focus: document.activeElement === main, inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight };
  });
  check(`${tag}: the main button in ink, focused; the window fits the screen`, look.bg === 'rgb(43, 31, 23)' && look.focus && look.inside, JSON.stringify(look));
  check(`${tag}: the opening screen waits behind, out of reach`, await page.evaluate(() => document.querySelector('.voile-projet')?.inert === true));
  await page.screenshot({ path: path.join(out, 'mac-message.png') });
  await openMenu(page).catch(() => {});
  const greyed = await page.evaluate(() => [...document.querySelectorAll('.menu-fabtice [role="menuitem"]')].filter((e) => e.getAttribute('aria-disabled') !== 'true').length);
  check(`${tag}: the menu cannot be reached behind the message`, !(await page.locator('#menu-fabtice').isVisible().catch(() => false)) || greyed === 0, String(greyed));
  await closeMenu(page).catch(() => {});

  // ---------------------------------------------------------------- the update asked
  await page.locator('[data-testid="maj-mettre"]').click();
  check(`${tag}: « Mettre à jour Fabtice » asks the main process`, (await calls(page)).includes('start'));
  await emit(page, { phase: 'downloading', progress: { fraction: 0.27, received: 36_400_000, total: 121_400_000 } });
  await page.waitForSelector(`${MSG}[data-etat="progress"]`);
  check(`${tag}: the progress: a percentage and the amount`, (await text(page, '[data-testid="maj-pourcent"]')) === '27 %' && (await text(page, '[data-testid="maj-quantite"]')) === '36,4 Mo sur 121,4 Mo');
  await page.keyboard.press('Escape');
  check(`${tag}: Échap does not leave a download behind the user's back`, await page.locator(MSG).isVisible());
  await page.screenshot({ path: path.join(out, 'mac-progres.png') });
  await page.locator('[data-testid="maj-annuler"]').click();
  check(`${tag}: « Annuler » asks the main process`, (await calls(page)).includes('cancel'));
  await emit(page, { phase: 'preparing', progress: { fraction: 0.95, received: 121_400_000, total: 121_400_000 } });
  check(`${tag}: then the check of the new version`, (await text(page, `${MSG} .maj-progres .phase`)).startsWith('Vérification de la nouvelle version'));
  await emit(page, { phase: 'closing', progress: null });
  check(`${tag}: the closing`, (await text(page, '[data-testid="maj-fermeture"]')) === 'Fabtice va se fermer pour se mettre à jour…');
  await emit(page, { phase: 'restarting' });
  check(`${tag}: the restart`, (await text(page, '[data-testid="maj-redemarre"]')) === 'Fabtice redémarre dans la nouvelle version…');

  // ---------------------------------------------------------------- each failure
  const failures = {
    damaged: 'Le fichier téléchargé est incomplet ou abîmé. Rien n’a été changé.',
    download: 'Le téléchargement s’est interrompu. Rien n’a été changé. Réessayez plus tard.',
    'disk-space': 'Il n’y a pas assez de place sur le disque : il faut environ 364,2 Mo de libre. Rien n’a été changé.',
    install: 'La nouvelle version n’a pas pu être installée. Rien n’a été changé : Fabtice 1.0.7 reste en place.',
    refused: 'Mise à jour annulée : rien n’a été changé.',
  };
  for (const [code, sentence] of Object.entries(failures)) {
    await emit(page, { phase: 'available', error: { code, during: 'update' }, room: code === 'disk-space' ? { needed: 364_200_000, free: 1 } : null });
    await page.waitForSelector('[data-testid="maj-erreur"]');
    const said = await text(page, '[data-testid="maj-erreur"]');
    const manual = await page.locator('[data-testid="maj-manuel"]').count();
    check(`${tag}: failure « ${code} » said`, said === sentence, said);
    check(`${tag}: failure « ${code} »: try again${['damaged', 'download', 'install'].includes(code) ? ', or the manual download' : ''}`, (await page.locator('[data-testid="maj-mettre"]').count()) === 1 && manual === (['damaged', 'download', 'install'].includes(code) ? 1 : 0));
    if (code === 'damaged') await page.screenshot({ path: path.join(out, 'mac-erreur.png') });
  }
  const blocks = {
    translocated: 'Fabtice ne peut pas se mettre à jour tout seul d’ici : macOS le fait tourner depuis un emplacement protégé. Déplacez l’app dans le dossier Applications, ou téléchargez la nouvelle version.',
    'read-only': 'Fabtice ne peut pas se mettre à jour tout seul d’ici : il est ouvert depuis l’image disque. Glissez l’app dans le dossier Applications, ou téléchargez la nouvelle version.',
    'not-writable': 'Fabtice ne peut pas se mettre à jour tout seul d’ici : son dossier ne peut pas être modifié avec votre compte. Téléchargez la nouvelle version, ou demandez à la personne qui s’occupe de ce Mac.',
    'not-packaged': 'Cette copie de Fabtice ne peut pas se mettre à jour toute seule. Téléchargez la nouvelle version.',
  };
  for (const [code, sentence] of Object.entries(blocks)) {
    await emit(page, { phase: 'available', error: null, blocked: { code } });
    await page.waitForSelector('[data-testid="maj-bloque"]');
    check(`${tag}: place « ${code} » said`, (await text(page, '[data-testid="maj-bloque"]')) === sentence);
    const bs = await page.locator(`${MSG} .message-actions button`).allInnerTexts();
    check(`${tag}: place « ${code} »: the manual download instead of the update`, JSON.stringify(bs) === JSON.stringify(['Télécharger à la main', 'Plus tard']), JSON.stringify(bs));
    if (code === 'translocated') await page.screenshot({ path: path.join(out, 'mac-emplacement.png') });
  }
  await page.locator('[data-testid="maj-manuel"]').click();
  check(`${tag}: « Télécharger à la main » asks the main process for the page`, (await calls(page)).includes('page'));

  // ---------------------------------------------------------------- a computation running
  await emit(page, { phase: 'available', error: null, blocked: null });
  await page.evaluate(() => window.__fabtice.store.setState({ separationRun: { status: 'running', projectId: 'x', step: 'compute' } }));
  const before = (await calls(page)).filter((c) => c === 'start').length;
  await page.locator('[data-testid="maj-mettre"]').click();
  await page.waitForSelector('[data-testid="maj-occupe"]');
  check(`${tag}: a separation running: the question first`, (await text(page, '[data-testid="maj-occupe"]')) === 'Une séparation des instruments est en cours : elle s’arrêtera et sera à refaire.');
  await page.screenshot({ path: path.join(out, 'mac-occupe.png') });
  await page.locator('[data-testid="maj-attendre"]').click();
  check(`${tag}: « Attendre »: nothing started`, (await calls(page)).filter((c) => c === 'start').length === before && (await page.locator('[data-testid="maj-occupe"]').count()) === 0);
  await page.locator('[data-testid="maj-mettre"]').click();
  await page.locator('[data-testid="maj-quand-meme"]').click();
  check(`${tag}: « Continuer quand même »: started`, (await calls(page)).filter((c) => c === 'start').length === before + 1);
  await page.evaluate(() => window.__fabtice.store.setState({ separationRun: { status: 'idle' } }));

  // ---------------------------------------------------------------- « Plus tard »
  await page.locator('[data-testid="maj-plus-tard"]').click();
  await page.waitForSelector(MSG, { state: 'detached' });
  check(`${tag}: « Plus tard » closes it; the opening screen is back within reach`, await page.evaluate(() => document.querySelector('.voile-projet')?.inert !== true));
  await emit(page, { ...AVAILABLE, origin: 'launch', seq: 50 });
  await sleep(300);
  check(`${tag}: and it does not come back for that version`, (await page.locator(MSG).count()) === 0);

  // ---------------------------------------------------------------- the menu bar's search
  await emit(page, { phase: 'checking', origin: 'menu' });
  await page.waitForSelector(`${MSG}[data-etat="checking"]`, { timeout: 5000 });
  check(`${tag}: the menu bar: the window at once, « Recherche d’une mise à jour… »`, (await text(page, '#maj-titre')) === 'Recherche d’une mise à jour…');
  await emit(page, { phase: 'up-to-date', origin: 'menu', seq: 51, available: null });
  await page.waitForSelector(`${MSG}[data-etat="up-to-date"]`);
  check(`${tag}: the menu bar: « Fabtice est à jour »`, (await text(page, '#maj-titre')) === 'Fabtice est à jour' && (await text(page, '[data-testid="maj-texte"]')) === 'Fabtice 1.0.7 est la dernière version.');
  await page.screenshot({ path: path.join(out, 'mac-a-jour.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector(MSG, { state: 'detached' });
  for (const [code, sentence] of [
    ['network', 'Pas de connexion à Internet : la recherche n’a pas pu se faire. Réessayez plus tard.'],
    ['unreadable', 'Les informations sur la nouvelle version sont illisibles. Réessayez plus tard, ou téléchargez-la à la main.'],
    ['server', 'GitHub, où sont publiées les nouvelles versions, ne répond pas pour l’instant. Réessayez plus tard.'],
  ]) {
    const seq = await page.evaluate(() => window.__maj.state.seq + 1);
    await emit(page, { phase: 'failed', origin: 'menu', seq, error: { code, during: 'check' } });
    await page.waitForSelector(`${MSG}[data-etat="check-failed"]`);
    check(`${tag}: the menu bar: « ${code} » said`, (await text(page, '#maj-titre')) === 'Recherche impossible' && (await text(page, '[data-testid="maj-erreur"]')) === sentence);
    if (code === 'network') await page.screenshot({ path: path.join(out, 'mac-hors-ligne.png') });
    await page.locator('[data-testid="maj-ok"]').click();
    await page.waitForSelector(MSG, { state: 'detached' });
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();

  // ---------------------------------------------------------------- Réglages → Général
  {
    const { context, page, errors } = await openDesktop('?debug', { answer: { phase: 'up-to-date' } });
    await page.locator('.voile-projet.ouverte').waitFor({ timeout: 10000 }).catch(() => {});
    await page.keyboard.press('Escape');
    const body = await openSettingsTab(page, 'general');
    check(`${tag}, Réglages: no search at opening on a test address`, (await calls(page)).length === 0);
    check(`${tag}, Réglages: the app's own number`, (await text(page, '[data-testid="maj-version"]')) === 'Fabtice 1.0.7');
    check(`${tag}, Réglages: nothing said before a search`, (await page.locator('[data-testid="maj-resultat"]').count()) === 0);
    await body.locator('[data-testid="maj-rechercher"]').click();
    await page.waitForSelector('[data-testid="maj-resultat"][data-etat="up-to-date"]');
    check(`${tag}, Réglages: « Fabtice est à jour. » in place`, (await text(page, '[data-testid="maj-resultat"]')) === 'Fabtice est à jour.' && (await calls(page))[0] === 'check:page');
    check(`${tag}, Réglages: no window for a search from here`, (await page.locator(MSG).count()) === 0);
    await page.evaluate((a) => (window.__maj.answer = a), AVAILABLE);
    await body.locator('[data-testid="maj-rechercher"]').click();
    await page.waitForSelector('[data-testid="maj-resultat"][data-etat="available"]');
    check(`${tag}, Réglages: the version available, its notes and its button`, (await text(page, '[data-testid="maj-disponible"]')) === 'La version 1.0.8 est disponible.' && (await page.locator('[data-testid="maj-resultat"] [data-testid="maj-mettre"]').count()) === 1);
    check(`${tag}, Réglages: no window either for a newer version found from here`, (await page.locator(MSG).count()) === 0);
    await page.locator('[data-testid="reglages-panneau"]').evaluate((el) => el.querySelector('[data-testid="maj-section"]').scrollIntoView());
    await page.screenshot({ path: path.join(out, 'mac-reglages.png') });
    await page.locator('[data-testid="maj-resultat"] [data-testid="maj-mettre"]').click();
    await emit(page, { phase: 'downloading', progress: { fraction: 0.5, received: 60_700_000, total: 121_400_000 } });
    await page.waitForSelector('[data-testid="maj-section"] [data-testid="maj-progres"]');
    check(`${tag}, Réglages: the progress in place, the search waits`, (await text(page, '[data-testid="maj-section"] [data-testid="maj-pourcent"]')) === '50 %' && (await body.locator('[data-testid="maj-rechercher"]').isDisabled()));
    await page.screenshot({ path: path.join(out, 'mac-reglages-progres.png') });
    await emit(page, { phase: 'available', progress: null, error: { code: 'damaged', during: 'update' } });
    check(`${tag}, Réglages: a failure said in place`, (await text(page, '[data-testid="maj-section"] [data-testid="maj-erreur"]')) === 'Le fichier téléchargé est incomplet ou abîmé. Rien n’a été changé.');
    const box = body.locator('[data-testid="maj-ouverture"]');
    check(`${tag}, Réglages: « Vérifier à chaque ouverture » ticked by default`, await box.isChecked());
    await box.click();
    check(`${tag}, Réglages: unticked, kept`, (await page.evaluate(() => window.__fabtice.store.getState().settings.checkUpdatesAtLaunch)) === false);
    await closeSettings(page);
    // The menu bar's search while Réglages is open: the answer goes to the section, on « Général ».
    await openSettingsTab(page, 'display');
    const seq = await page.evaluate(() => window.__maj.state.seq + 1);
    await emit(page, { phase: 'up-to-date', origin: 'menu', seq, error: null, available: null });
    await page.waitForSelector('[data-testid="reglages-panneau"][data-onglet="general"]', { timeout: 5000 });
    check(`${tag}, Réglages open: the menu bar's answer in the section`, (await page.locator(MSG).count()) === 0 && (await text(page, '[data-testid="maj-resultat"]')) === 'Fabtice est à jour.');
    check(`${tag}, Réglages: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  // Unticked: no search at opening, even on the real address of the message.
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    await context.addInitScript(installBridge);
    const page = await context.newPage();
    await page.goto(`${url}/?debug`);
    await page.waitForFunction(() => window.__fabtice);
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, checkUpdatesAtLaunch: false } })));
    await sleep(500);
    await page.goto(`${url}/?debug&maj=message`);
    await page.waitForFunction(() => window.__fabtice);
    await sleep(5500);
    check(`${tag}: « Vérifier à chaque ouverture » unticked: no search at opening`, (await calls(page)).length === 0, JSON.stringify(await calls(page)));
    await context.close();
  }
}

// ---------------------------------------------------------------- the web app

const swPath = path.join(web, 'sw.js');
const swBefore = fs.readFileSync(swPath, 'utf8');

async function webChecks(form) {
  const tag = `web, ${form.name}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-update-profile-'));
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport: form.viewport, hasTouch: form.phone });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const address = `${url}/?horsligne&debug&maj=message`;
  try {
    await page.goto(address);
    await page.waitForFunction(() => window.__fabtice && navigator.serviceWorker?.controller, null, { timeout: 30000 });
    await sleep(500);
    check(`${tag}: first visit, the worker installs and nothing is offered`, (await page.locator(MSG).count()) === 0);
    // Réglages: the number of this build, the search finds nothing new.
    await page.keyboard.press('Escape').catch(() => {});
    if (await page.locator('.voile-projet.ouverte').count()) await page.evaluate(() => window.__fabtice.actions.closeNewPiece?.());
    let body = await openSettingsTab(page, 'general');
    check(`${tag}, Réglages: the number`, (await text(page, '[data-testid="maj-version"]')) === `Fabtice ${JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version}`);
    await press(page, '[data-testid="maj-rechercher"]');
    await page.waitForSelector('[data-testid="maj-resultat"][data-etat="up-to-date"]', { timeout: 30000 });
    check(`${tag}, Réglages: nothing new: « Fabtice est à jour. »`, (await text(page, '[data-testid="maj-resultat"]')) === 'Fabtice est à jour.');
    // A new version of the site is published: its worker differs (another build).
    fs.writeFileSync(swPath, swBefore.replace(/const BUILD = "[^"]*";/, 'const BUILD = "essai-nouvelle";').replace(/const VERSION = "([^"]*)";/, 'const VERSION = "$1-essai";'));
    await press(page, '[data-testid="maj-rechercher"]');
    await page.waitForSelector('[data-testid="maj-resultat"][data-etat="ready"]', { timeout: 30000 });
    check(`${tag}, Réglages: the search finds the new version`, (await text(page, '[data-testid="maj-resultat"] p')) === 'Une nouvelle version est prête.' && (await page.locator('[data-testid="maj-resultat"] [data-testid="maj-recharger"]').count()) === 1);
    await page.screenshot({ path: path.join(out, `${form.name}-web-reglages.png`) });
    await closeSettings(page);
    // The next opening offers it.
    await page.reload();
    await page.waitForSelector(`${MSG}[data-etat="web-ready"]`, { timeout: 30000 });
    check(`${tag}: at opening, « Une nouvelle version de Fabtice est prête »`, (await text(page, '#maj-titre')) === 'Une nouvelle version de Fabtice est prête');
    const bs = await page.locator(`${MSG} .message-actions button`).allInnerTexts();
    check(`${tag}: « Recharger » and « Plus tard »`, JSON.stringify(bs) === JSON.stringify(['Recharger', 'Plus tard']), JSON.stringify(bs));
    const geo = await page.evaluate(() => {
      const r = document.querySelector('.message-maj').getBoundingClientRect();
      const b = [...document.querySelectorAll('[data-testid="maj-message"] .message-actions button')].map((e) => Math.round(e.getBoundingClientRect().height));
      return { left: r.left, right: r.right, bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight, b };
    });
    if (form.phone) check(`${tag}: a sheet at the bottom, full width, buttons of 44 px at least`, geo.left === 0 && geo.right === geo.w && geo.bottom === geo.h && geo.b.every((h) => h >= 44), JSON.stringify(geo));
    else check(`${tag}: a window inside the screen`, geo.left > 0 && geo.right < geo.w, JSON.stringify(geo));
    await page.screenshot({ path: path.join(out, `${form.name}-web-message.png`) });
    await page.evaluate(() => (window.__avantRechargement = true));
    await press(page, '[data-testid="maj-recharger"]');
    await page.waitForFunction(() => !window.__avantRechargement && window.__fabtice, null, { timeout: 30000 });
    await sleep(1500);
    const active = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const c = new MessageChannel();
          c.port1.onmessage = (e) => resolve(e.data.build);
          navigator.serviceWorker.controller.postMessage({ type: 'fabtice-build' }, [c.port2]);
          setTimeout(() => resolve(null), 3000);
        }),
    );
    check(`${tag}: « Recharger »: the page comes back on the new version`, active === 'essai-nouvelle', String(active));
    check(`${tag}: and the message does not come back`, (await page.locator(MSG).count()) === 0);
    // Offline still works on the version taken over.
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 30000 });
    check(`${tag}: offline, the app still opens on it`, (await page.title()) === 'Fabtice' && (await page.evaluate(() => crossOriginIsolated)));
    await context.setOffline(false);
    check(`${tag}: no page errors`, errors.filter((e) => !/Failed to fetch|net::ERR/.test(e)).length === 0, errors.join(' | '));
  } finally {
    fs.writeFileSync(swPath, swBefore);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  // A test page without a worker: the search says why.
  {
    const ctx = await browser.newContext({ viewport: form.viewport, hasTouch: form.phone });
    const p = await ctx.newPage();
    await p.goto(`${url}/?debug`);
    await p.waitForFunction(() => window.__fabtice);
    await openSettingsTab(p, 'general');
    await press(p, '[data-testid="maj-rechercher"]');
    await p.waitForSelector('[data-testid="maj-resultat"][data-etat="unsupported"]');
    check(`${tag}: a page with no worker says so`, (await text(p, '[data-testid="maj-resultat"]')) === 'Cette page n’est pas gardée pour le mode hors ligne : elle s’ouvre toujours dans sa dernière version.');
    if (form.phone) {
      await p.locator('[data-testid="maj-section"]').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(out, `${form.name}-web-reglages-sans.png`) });
    }
    await ctx.close();
  }
}

try {
  await desktopChecks();
  await webChecks({ name: 'ordinateur', viewport: DESKTOP, phone: false });
  await webChecks({ name: 'telephone', viewport: PHONE, phone: true });
} finally {
  fs.writeFileSync(swPath, swBefore);
  await browser.close();
  srv.close();
}

console.log(`(screenshots in ${out})`);
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall update checks passed');
