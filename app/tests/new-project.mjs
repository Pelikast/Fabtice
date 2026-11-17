// Browser checks of the « Nouveau projet » window (C9) and of the loading text (C1), in Chromium, on the built
// interface served from web/, in the two forms of the app: a computer (1280 × 800, a mouse) and a phone
// (390 × 844, touch).
//   npm run build && npm run test:new-project
//
// What it covers:
//  - the opening screen at launch (a file, a `.fab` project, in the Mac app the link too), called « Nouveau
//    projet », with « Séparer les instruments » unticked, no « Aller plus loin », no chart offer, no « Alléger »
//    (it comes with stage 6);
//  - « Séparer les instruments »: ticked, every instrument selected; a click unselects one; none left is
//    unticked; the choice is forgotten when the window opens again;
//  - the window opened from the menu « Nouveau projet ▸ »: from a file, only the file; from a link, only the
//    link (the Mac app, a scripted `window.fabtice`) or, on the web, the sentence that sends to the Mac app;
//  - a file imported without and with the separation asked for;
//  - the loading text (C1): the ember of the « t », a little larger, a reflection every 2.5 s while an analysis or
//    a separation runs; no reflection with reduced motion; a stopped or failed state back to the plain look.
// Screenshots go to $FABTICE_NEWPROJECT_OUT (default: a temporary folder).
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { menuCommand } from './lib/menu.mjs';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.FABTICE_NEWPROJECT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-newproject-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (text) => console.log(`NOTE  ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const EMBER = 'rgb(196, 80, 42)';

/** A scripted Mac app: just enough of `window.fabtice` for the page to take itself for the Mac app. */
function installBridge() {
  const none = () => () => {};
  window.fabtice = {
    systemInfo: async () => null,
    ytdlpStatus: async () => ({ source: 'managed', path: '/x/yt-dlp', installed: true, attempts: [] }),
    ytdlpCheck: async () => ({ skipped: true, reason: 'test', attempts: [] }),
    ytdlpInstall: async () => ({ ok: true, meta: {}, attempts: [] }),
    extract: async () => ({ ok: false, code: 'link-failed' }),
    copyText: async () => true,
    onYtdlpProgress: none,
    onExtractProgress: none,
  };
}

async function open(viewport, query, { bridge = false, reducedMotion = 'no-preference' } = {}) {
  const phone = viewport.width < 760;
  const context = await browser.newContext({ viewport, hasTouch: phone, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  if (bridge) await page.addInitScript(installBridge);
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { page, context, errors };
}

/** A touch on a phone, a click on a computer. */
async function press(page, locator) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const stems = (page) => page.evaluate(() => window.__fabtice.store.getState().ui.importStems);
const pressedChips = (page) => page.locator('.stems-choix .stem[aria-pressed="true"]').count();
const chips = (page) => page.locator('.stems-choix .stem').count();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const dialogText = async (page) => (await page.locator('.voile-projet.ouverte .accueil').innerText()).replace(/\s+/g, ' ');
const BOX = '[data-testid="separer-case"]';
const waitOpen = (page) => page.waitForFunction(() => document.querySelector('.voile-projet')?.classList.contains('ouverte'));

/** Targets of the window of at least 40 px, nothing past the screen (the phone's rule of DESIGN.md). */
async function fits(page, tag, width) {
  const small = await page.evaluate(
    (w) => [...document.querySelectorAll('.voile-projet.ouverte .accueil button, .voile-projet.ouverte .accueil label, .voile-projet.ouverte .accueil input[type="url"]')].filter((e) => e.getBoundingClientRect().height < 40 || e.getBoundingClientRect().right > w + 1).map((e) => `${e.tagName}.${e.className} ${e.textContent.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}`),
    width,
  );
  check(`${tag}: touch targets of at least 40 px, nothing past the screen`, small.length === 0, small.join(' | '));
  check(`${tag}: no horizontal overflow`, await noOverflow(page));
}

async function screens(viewport, tag) {
  const phone = viewport.width < 760;

  // ------------------------------------------------------------ the opening screen at launch (the web app)
  {
    const { page, context, errors } = await open(viewport, '?debug&moteur=factice');
    await waitOpen(page);
    await sleep(300);
    check(`${tag}: the window is called « Nouveau projet »`, (await page.locator('.voile-projet.ouverte h2').innerText()) === 'Nouveau projet');
    const text = await dialogText(page);
    check(`${tag}: the whole opening screen: a file, a project to open`, (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 1 && (await page.locator('[data-testid="ouvrir-projet"]').count()) === 1 && text.includes('mp3, wav, aiff, m4a ou flac'));
    check(`${tag}: no link field and no sentence for the Mac app on the web launch screen`, (await page.locator('.champ').count()) === 0 && (await page.locator('[data-testid="lien-app-mac"]').count()) === 0);
    check(`${tag}: « Aller plus loin », « Grilles gardées » and the chart offer are gone`, !/Aller plus loin|Grilles gardées|grilles des standards|Télécharger les grilles/.test(text), text);
    check(`${tag}: no « Alléger le travail pour l’appareil » yet (stage 6)`, !text.includes('Alléger'));
    check(`${tag}: « Séparer les instruments » is unticked, no instrument is listed`, (await page.locator(BOX).count()) === 1 && !(await page.locator(BOX).isChecked()) && (await chips(page)) === 0 && (await stems(page)).length === 0);
    const button = await page.evaluate(() => getComputedStyle(document.querySelector('.voile-projet.ouverte .plein')).backgroundColor);
    check(`${tag}: the main button is in ink, never in ember`, button === 'rgb(43, 31, 23)', button);
    // Every part of the window stays inside it: a part taking a whole-screen style by mistake would veil the window itself.
    const astray = await page.evaluate(() => {
      const panel = document.querySelector('.voile-projet.ouverte .accueil');
      const box = panel.getBoundingClientRect();
      return [...panel.querySelectorAll('*')]
        .filter((e) => {
          const c = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          if (c.display === 'none' || e.matches('input[type="file"]') || r.width === 0 || r.height === 0) return false;
          return c.position === 'fixed' || r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
        })
        .map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
    });
    check(`${tag}: every part of the window lies inside it, none over the whole screen`, astray.length === 0, astray.join(' | '));
    await shot(page, `1-lancement-${tag}`);

    // Ticked: every instrument selected; a click unselects; none left is unticked.
    await press(page, page.locator(BOX));
    const offered = await chips(page);
    check(`${tag}: ticked, the instruments to separate are listed, every one selected`, offered >= 4 && (await pressedChips(page)) === offered && (await stems(page)).length === offered, `${offered} instruments`);
    check(`${tag}: the estimate is shown`, (await page.locator('[data-testid="estimation-import"]').count()) === 1);
    await press(page, page.locator('.stems-choix .stem[data-stem="drums"]'));
    check(`${tag}: a click unselects an instrument`, (await pressedChips(page)) === offered - 1 && !(await stems(page)).includes('drums'));
    await press(page, page.locator('.stems-choix .stem[data-stem="drums"]'));
    check(`${tag}: another click selects it again`, (await pressedChips(page)) === offered);
    await shot(page, `2-case-cochee-${tag}`);
    if (phone) await fits(page, `${tag} (box ticked)`, viewport.width);
    await press(page, page.locator(BOX));
    check(`${tag}: unticked, nothing is selected and the list is gone`, (await stems(page)).length === 0 && (await chips(page)) === 0);
    await press(page, page.locator(BOX));
    for (const stem of await page.locator('.stems-choix .stem').evaluateAll((els) => els.map((e) => e.dataset.stem))) await press(page, page.locator(`.stems-choix .stem[data-stem="${stem}"]`));
    check(`${tag}: every instrument unselected by hand is the same as unticked`, (await stems(page)).length === 0 && !(await page.locator(BOX).isChecked()));
    if (phone) await fits(page, tag, viewport.width);
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ a file imported, without and with the separation
  {
    const { page, context, errors } = await open(viewport, '?debug&moteur=factice&separation=instant');
    await waitOpen(page);
    await page.locator('.accueil input[type="file"]').setInputFiles(path.join(here, 'fixtures', 'tone.wav'));
    await page.waitForFunction(() => window.__fabtice.store.getState().project && !window.__fabtice.store.getState().ui.newPieceOpen, null, { timeout: 30000 });
    await sleep(2500);
    const plain = await page.evaluate(() => ({ result: window.__fabtice.store.getState().separation.result, run: window.__fabtice.store.getState().separationRun.status, tracks: window.__fabtice.store.getState().tracks.length }));
    check(`${tag}: a file imported with « Séparer les instruments » unticked is not separated`, plain.result === null && plain.run === 'idle' && plain.tracks === 1, JSON.stringify(plain));
    // Again, from the menu, with the box ticked: the instruments are separated by themselves.
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    await page.locator('[data-testid="alerte-abandonner"]').click({ timeout: 1500 }).catch(() => {});
    await waitOpen(page);
    check(`${tag}: the window opens unticked again`, !(await page.locator(BOX).isChecked()) && (await stems(page)).length === 0);
    await press(page, page.locator(BOX));
    await page.locator('.accueil input[type="file"]').setInputFiles(path.join(here, 'fixtures', 'tone.wav'));
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 30000 });
    const names = await page.evaluate(() => window.__fabtice.store.getState().tracks.map((t) => t.name));
    check(`${tag}: with it ticked (every instrument), the separation starts by itself once the piece can play`, names.length >= 4 && names.includes('Voix') && names.includes('Batterie'), names.join(','));
    check(`${tag}: no page errors (import)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ opened from the menu « Nouveau projet ▸ »
  {
    const { page, context, errors } = await open(viewport, '?demo&moteur=factice');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await sleep(500);
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    await waitOpen(page);
    await sleep(300);
    const text = await dialogText(page);
    check(`${tag}: from a file: only the file (its button focused), no project to open, no link`, (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 1 && (await page.locator('[data-testid="ouvrir-projet"]').count()) === 0 && (await page.locator('.champ').count()) === 0 && (await page.evaluate(() => document.activeElement?.textContent?.includes('fichier audio'))) && text.includes('Séparer les instruments'));
    await press(page, page.locator(BOX));
    check(`${tag}: from a file, ticked: every instrument selected`, (await pressedChips(page)) === (await chips(page)) && (await chips(page)) >= 4);
    await shot(page, `3-menu-fichier-case-cochee-${tag}`);
    if (phone) await fits(page, `${tag} (menu, file)`, viewport.width);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.voile-projet')?.classList.contains('ouverte'));
    check(`${tag}: closed without importing, the instruments are forgotten`, (await stems(page)).length === 0);
    await menuCommand(page, 'Nouveau projet', 'À partir d’un lien YouTube');
    await waitOpen(page);
    await sleep(300);
    const sentence = await page.locator('[data-testid="lien-app-mac"]').innerText();
    check(`${tag}: from a link, on the web: only the sentence that sends to the Mac app`, sentence.includes('app Mac') && (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 0 && (await page.locator(BOX).count()) === 0 && (await page.locator('.champ').count()) === 0);
    await shot(page, `4-menu-lien-web-${tag}`);
    check(`${tag}: no page errors (menu)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the same in the Mac app: the link, a file, a project
  {
    const { page, context, errors } = await open(viewport, '?debug&moteur=factice', { bridge: true });
    await waitOpen(page);
    await sleep(300);
    check(`${tag}: Mac app, at launch: the link and the file, and a project to open`, (await page.locator('.champ input[type="url"]').count()) === 1 && (await page.getByRole('button', { name: 'choisir un fichier audio' }).count()) === 1 && (await page.locator('[data-testid="ouvrir-projet"]').count()) === 1 && (await page.locator(BOX).count()) === 1);
    await shot(page, `5-lancement-app-mac-${tag}`);
    await page.evaluate(() => window.__fabtice.actions.openNewPiece('link'));
    await sleep(300);
    const link = await dialogText(page);
    check(`${tag}: Mac app, from a link: only the link and the choice of instruments`, (await page.locator('.champ input[type="url"]').count()) === 1 && (await page.getByRole('button', { name: /fichier audio/ }).count()) === 0 && (await page.locator('[data-testid="ouvrir-projet"]').count()) === 0 && link.includes('Séparer les instruments') && !link.includes('mp3, wav'));
    await shot(page, `6-menu-lien-app-mac-${tag}`);
    if (phone) await fits(page, `${tag} (Mac app, link)`, viewport.width);
    await page.evaluate(() => window.__fabtice.actions.openNewPiece('file'));
    await sleep(300);
    check(`${tag}: Mac app, from a file: only the file`, (await page.locator('.champ').count()) === 0 && (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 1);
    check(`${tag}: no page errors (Mac app)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

/** The loading text of the top bar, as the page computes it. */
const looks = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, fill: cs.webkitTextFillColor, size: parseFloat(cs.fontSize), animation: cs.animationName, duration: cs.animationDuration, iterations: cs.animationIterationCount, clip: cs.backgroundClip || cs.webkitBackgroundClip, text: el.textContent };
  }, selector);

async function loading(viewport, tag) {
  // ------------------------------------------------------------ a separation runs
  {
    const { page, context, errors } = await open(viewport, '?demo&moteur=factice&separation=lente');
    await page.waitForSelector('[data-testid="separation-etat"]', { timeout: 20000 });
    await sleep(400);
    const l = await looks(page, '[data-testid="separation-etat"]');
    note(`${tag} separation: ${JSON.stringify(l)}`);
    check(`${tag}: the separation text takes the ember of the « t »`, l.color === EMBER && /^Séparation · \d+ %$/.test(l.text), `${l.color} ${l.text}`);
    check(`${tag}: it is a little larger than the other top bar texts (one or two pixels)`, l.size >= (viewport.width < 760 ? 13.5 : 14.5) && l.size <= (viewport.width < 760 ? 14.5 : 15.5), `${l.size}px`);
    check(`${tag}: a reflection crosses it every 2.5 s, cut out of the text`, l.animation === 'reflet' && l.duration === '2.5s' && l.iterations === 'infinite' && l.clip.includes('text') && l.fill === 'rgba(0, 0, 0, 0)', JSON.stringify(l));
    // The reflection moves: the gradient is at two places a moment apart.
    const p1 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="separation-etat"]')).backgroundPositionX);
    await sleep(700);
    const p2 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="separation-etat"]')).backgroundPositionX);
    check(`${tag}: the reflection is moving`, p1 !== p2, `${p1} → ${p2}`);
    await page.locator('[data-testid="separation-etat"]').scrollIntoViewIfNeeded();
    await shot(page, `7-chargement-separation-${tag}`);
    check(`${tag}: no page errors (separation running)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  // ------------------------------------------------------------ an analysis runs, then stops
  {
    const { page, context } = await open(viewport, '?demo&moteur=factice');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await page.evaluate(() => {
      const s = window.__fabtice.store;
      s.setState({ analysisRun: { status: 'running', projectId: s.getState().project.id, step: 'tempo' } });
    });
    await page.waitForSelector('[data-testid="analyse-etat"]');
    const l = await looks(page, '[data-testid="analyse-etat"]');
    note(`${tag} analysis: ${JSON.stringify(l)}`);
    check(`${tag}: the analysis text is in ember, larger, with its reflection`, l.color === EMBER && l.animation === 'reflet' && l.duration === '2.5s' && l.size >= 13.5, JSON.stringify(l));
    await shot(page, `8-chargement-analyse-${tag}`);
    // An error takes back the plain look: no ember, no reflection.
    await page.evaluate(() => window.__fabtice.store.setState({ analysisRun: { status: 'error', projectId: window.__fabtice.store.getState().project.id, code: 'failed' } }));
    await sleep(200);
    const e = await looks(page, '[data-testid="analyse-etat"]');
    check(`${tag}: an error is back to the plain look (no ember, no reflection)`, e && e.color !== EMBER && e.animation === 'none' && e.fill !== 'rgba(0, 0, 0, 0)', JSON.stringify(e));
    await context.close();
  }
  // ------------------------------------------------------------ reduced motion: colour and size stay, no reflection
  {
    const { page, context } = await open(viewport, '?demo&moteur=factice&separation=lente', { reducedMotion: 'reduce' });
    await page.waitForSelector('[data-testid="separation-etat"]', { timeout: 20000 });
    await sleep(300);
    const l = await looks(page, '[data-testid="separation-etat"]');
    check(`${tag}: reduced motion: the ember and the size stay, the reflection does not`, l.color === EMBER && l.size >= 13.5 && l.animation === 'none' && l.fill === EMBER, JSON.stringify(l));
    await context.close();
  }
}

try {
  await screens(DESKTOP, 'bureau');
  await screens(PHONE, 'telephone');
  await loading(DESKTOP, 'bureau');
  await loading(PHONE, 'telephone');
} finally {
  await browser.close();
  srv.close();
}

note(`screenshots in ${out}`);
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
