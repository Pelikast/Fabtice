// Browser checks of the chord charts of standards (C9), in Chromium, on the built interface served from web/
// (the web app: only pages that allow cross-origin reads can be downloaded).
//   npm run build && npm run test:standards
//
// A fake internet stands in for the real sites: a local server answers `/<host><path>`, and the
// browser's requests to the allowed hosts are routed to it (so that nothing real is fetched, and no
// real playlist is needed: the tunes are invented, see standards-fixtures.mjs). The remote list of
// collections is served the same way (`?outils=distant`), with small sizes.
//
// What it covers, on a computer (1280 × 800, a mouse) and on a phone (390 × 844, touch):
//  - the message at start-up (`?grilles=message`, which test addresses need): its exact words, its window
//    over the opening screen, « Oui (recommandé) » with the progress (a percentage that advances steadily,
//    the collection, « n sur N »), the sentence that ends it, and nothing at the next launch;
//  - « Non merci » (it comes back at the next launch), « Non merci » with « Ne plus afficher ce message »
//    (the last word, « OK », never again), Escape, the window left while the download goes on;
//  - a web page with nothing it can download: no message;
//  - « Réglages → Avancé »: the section in place (list, source and licence, one collection at a time,
//    « Tout télécharger », « Vérifier les mises à jour de grilles »: nothing new, a collection that
//    changed), the file import, removal after a question;
//  - storage that is not available, and the library found again after a reload (a PERSISTENT profile: a
//    throw-away context keeps IndexedDB in memory and cannot show that).
// Screenshots go to $FABTICE_STANDARDS_OUT (default: a temporary folder), deviceScaleFactor 1.
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSettingsTab } from './lib/settings.mjs';
import { startServer } from './serve.mjs';
import { link, LOGIN_PAGE, playlistFile, shrinkList, tunes } from './standards-fixtures.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = JSON.parse(fs.readFileSync(path.join(here, '../src/standards/collections.json'), 'utf8'));
const REMOTE_LIST = 'https://raw.githubusercontent.com/Pelikast/Fabtice/main/app/src/standards/collections.json';

const out = process.env.FABTICE_STANDARDS_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-standards-'));
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-standards-files-'));

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (text) => console.log(`NOTE  ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the fake internet

const list = shrinkList(bundled);
const LISTED = list.collections.length;
const mirrorOf = (id) => list.collections.find((c) => c.id === id).pages.find((p) => p.role === 'mirror')?.url;
const pathOf = (url) => {
  const u = new URL(url);
  return `/${u.hostname}${u.pathname}`;
};
const NAMES = { 'jazz-1460': 'Jazz 1460', 'latin-50': 'Latin 50', 'blues-50': 'Blues 50', 'brazilian-220': 'Brazilian 220', 'pop-400': 'Pop 400', 'country-50': 'Country 50' };
const playlistOf = (id, count = 20) => link([...tunes(count, `${NAMES[id]} Tune`), ...(id === 'jazz-1460' ? [{ title: 'Autumn Leaves', composer: 'Kosma Joseph' }] : [])], NAMES[id]);
// The collections a web page can read: those with a copy on GitHub (a login page for one of them, so that one fails).
const WEB_IDS = list.collections.filter((c) => c.pages.some((p) => p.role === 'mirror')).map((c) => c.id);
const WEB_COUNT = WEB_IDS.length;

/** What each path answers; `delay` in ms. Replaced per scenario. */
let pages = {};
const seen = [];
function resetPages() {
  pages = {
    [pathOf(REMOTE_LIST)]: { body: JSON.stringify(list), type: 'application/json' },
    [pathOf(mirrorOf('jazz-1460'))]: { body: playlistOf('jazz-1460'), type: 'text/plain' },
    [pathOf(mirrorOf('latin-50'))]: { body: LOGIN_PAGE, type: 'text/html' }, // a login page: not it
    [pathOf(mirrorOf('blues-50'))]: { body: playlistOf('blues-50'), type: 'text/plain' },
    [pathOf(mirrorOf('pop-400'))]: { body: playlistOf('pop-400'), type: 'text/plain' },
    [pathOf(mirrorOf('country-50'))]: { body: playlistOf('country-50'), type: 'text/plain' },
  };
}
resetPages();
const fake = http.createServer((req, res) => {
  const entry = pages[req.url.split('?')[0]];
  if (!entry) return res.writeHead(404).end('not found');
  setTimeout(() => res.writeHead(200, { 'content-type': entry.type }).end(entry.body), entry.delay ?? 0);
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const fakeUrl = `http://127.0.0.1:${fake.address().port}`;

/** Routes the browser's requests to the allowed hosts to the fake server; irealpro hosts are not readable from a page. */
async function routeInternet(context) {
  await context.route(/^https:\/\/(raw\.githubusercontent\.com|(?:www\.|forums\.)?irealpro\.com|(?:www\.)?irealb\.com)\//, async (route) => {
    const u = new URL(route.request().url());
    seen.push(`${u.hostname}${u.pathname}`);
    if (u.hostname !== 'raw.githubusercontent.com') return route.abort('failed'); // no CORS header there, like the real sites
    const res = await fetch(`${fakeUrl}/${u.hostname}${u.pathname}`).catch(() => null);
    if (!res) return route.abort('failed');
    await route.fulfill({ status: res.status, body: await res.text(), headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain', 'access-control-allow-origin': '*' } });
  });
}

// ---------------------------------------------------------------- helpers

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const MESSAGE = '?debug&moteur=factice&outils=distant&grilles=message';

async function openPage(context, query = MESSAGE) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { page, errors };
}
const PHONE = { width: 390, height: 844 };
async function persistentContext(viewport = { width: 1280, height: 800 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-standards-profile-'));
  const phone = viewport.width < 760;
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport, deviceScaleFactor: 1, hasTouch: phone, isMobile: false });
  await routeInternet(context);
  return { context, profile, phone };
}
/** A touch on a phone, a click on a computer. */
async function press(page, locator) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const MSG = '[data-testid="grilles-message"]';
const waitMessage = (page, step) => page.waitForSelector(`${MSG}${step ? `[data-etape="${step}"]` : ''}`, { timeout: 15000 });
const noMessage = async (page, wait = 1500) => {
  await sleep(wait);
  return (await page.locator(MSG).count()) === 0;
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const records = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice-standards');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('collections')) return resolve([]);
          const all = db.transaction('collections').objectStore('collections').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result.map((r) => ({ id: r.id, tunes: r.tunes, source: r.source })));
          };
        };
      }),
  );

const QUESTION = 'Voulez-vous importer automatiquement les grilles des standards de iReal Pro ? Cela permet d’améliorer la détection des accords.';

/** The four paths of the message, in one form of the app (`tag`: « bureau » or « telephone »). */
async function messagePaths(viewport, tag) {
  const phone = viewport.width < 760;
  // ------------------------------------------------------------ « Oui (recommandé) »
  {
    resetPages();
    for (const id of WEB_IDS) pages[pathOf(mirrorOf(id))].delay = 700;
    seen.length = 0;
    const { context } = await persistentContext(viewport);
    const { page, errors } = await openPage(context);
    await waitMessage(page, 'ask');
    const box = page.locator(MSG);
    check(`${tag}: the question, in its exact words`, (await text(box.locator('[data-testid="grilles-texte"]'))) === QUESTION);
    check(`${tag}: two buttons, « Oui (recommandé) » and « Non merci », and the box « Ne plus afficher ce message » unticked`, (await box.getByRole('button', { name: 'Oui (recommandé)' }).count()) === 1 && (await box.getByRole('button', { name: 'Non merci' }).count()) === 1 && (await box.getByLabel('Ne plus afficher ce message').count()) === 1 && !(await box.getByLabel('Ne plus afficher ce message').isChecked()));
    const colours = await page.evaluate(() => {
      const css = (sel) => getComputedStyle(document.querySelector(sel));
      return { yes: css('[data-testid="grilles-oui"]').backgroundColor, ember: getComputedStyle(document.documentElement).getPropertyValue('--braise').trim() };
    });
    check(`${tag}: the main button is in ink, never in ember`, colours.yes === 'rgb(43, 31, 23)', colours.yes);
    check(`${tag}: it is over the opening screen, which waits behind it (out of reach)`, (await page.locator('.voile.ouverte').count()) === 2 && (await page.locator('.voile-projet').evaluate((el) => el.inert)) && (await page.locator('.app').evaluate((el) => el.inert)));
    check(`${tag}: the focus is in the window, on « Oui (recommandé) »`, (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'grilles-oui');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    check(`${tag}: Tab stays inside the window`, await page.evaluate(() => !!document.activeElement?.closest('[data-testid="grilles-message"]')));
    check(`${tag}: no horizontal overflow`, await noOverflow(page));
    if (phone) {
      const geometry = await page.evaluate(() => [...document.querySelectorAll('[data-testid="grilles-message"] button, [data-testid="grilles-message"] label')].map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().right)]));
      note(`${tag} geometry: ${JSON.stringify(geometry)}`);
      check(`${tag}: targets of at least 40 px, nothing past the screen`, geometry.every(([, h, , right]) => h >= 40 && right <= viewport.width), JSON.stringify(geometry));
      const yes = geometry.find(([n]) => n === 'Oui (recommandé)');
      const no = geometry.find(([n]) => n === 'Non merci');
      check(`${tag}: buttons stacked, the main one first`, yes[2] < no[2]);
    }
    await shot(page, `1-message-${tag}`);

    await press(page, page.locator('[data-testid="grilles-oui"]'));
    await waitMessage(page, 'running');
    const lineSeen = await page.evaluate(() => document.querySelector('[data-testid="standards-courant"]')?.textContent ?? '');
    check(`${tag}: the collection being read and « n sur N »`, new RegExp(`\\d sur ${WEB_COUNT}$`).test(lineSeen), lineSeen);
    check(`${tag}: it can be cancelled, or left while it goes on`, (await page.locator('[data-testid="grilles-annuler"]').count()) === 1 && (await page.locator('[data-testid="grilles-arriere-plan"]').count()) === 1);
    // The percentage advances steadily: sampled while it runs, never backwards, in more than a few steps.
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const s = await page.locator('[data-testid="standards-pourcent"]').innerText({ timeout: 500 }).catch(() => null);
      if (s === null) break;
      samples.push(Number.parseInt(s, 10));
      if (i === 4) await shot(page, `2-progression-${tag}`);
      await sleep(150);
    }
    const distinct = [...new Set(samples.filter((n) => !Number.isNaN(n)))];
    note(`${tag} percentages: ${distinct.join(' ')}`);
    check(`${tag}: the percentage never goes back and takes more steps than there are collections`, samples.every((n, i) => i === 0 || Number.isNaN(n) || Number.isNaN(samples[i - 1]) || n >= samples[i - 1]) && distinct.length > WEB_COUNT, distinct.join(','));
    await waitMessage(page, 'done');
    const result = await text(page.locator('[data-testid="grilles-bilan"]'));
    note(`${tag} result: ${result}`);
    // Jazz 21 + Blues 20 + Pop 20 + Country 20; Latin: a login page. The others: not readable from a web page.
    check(`${tag}: one simple sentence: how many collections out of how many, how many charts, what to do with the others`, result === `4 recueils sur ${LISTED} téléchargés : 81 grilles gardées sur cet appareil. Les autres se retentent dans Réglages → Avancé ; se téléchargent dans l’app Mac ou s’importent par fichier.`, result);
    check(`${tag}: no page of an irealpro.com site was requested from the web app`, !seen.some((s) => /irealpro|irealb/.test(s)), seen.join(', '));
    await shot(page, `3-bilan-${tag}`);
    await press(page, page.getByRole('button', { name: 'Terminer' }));
    check(`${tag}: « Terminer » closes the message and the opening screen is usable`, (await noMessage(page, 300)) && !(await page.locator('.voile-projet').evaluate((el) => el.inert)));
    const kept = await records(page);
    check(`${tag}: the collections are kept in their own IndexedDB database`, kept.length === 4 && kept.some((r) => r.id === 'jazz-1460' && r.tunes === 21), JSON.stringify(kept));
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();

    // The next launch: something is kept, no message; the charts are found again.
    const { page: again } = await openPage(context);
    check(`${tag}: at the next launch there is no message`, await noMessage(again));
    const found = await again.evaluate(async () => {
      const found = await window.__fabtice.standards.findStandard('Kosma - Autumn Leaves (1960) [Remastered]');
      return found[0] ? { title: found[0].chart.title, id: found[0].collectionId } : null;
    });
    check(`${tag}: the charts are found again by a noisy video title`, found?.title === 'Autumn Leaves' && found.id === 'jazz-1460', JSON.stringify(found));
    await context.close();
  }

  // ------------------------------------------------------------ « Non merci »
  {
    resetPages();
    const { context } = await persistentContext(viewport);
    const { page } = await openPage(context);
    await waitMessage(page, 'ask');
    await press(page, page.getByRole('button', { name: 'Non merci' }));
    check(`${tag}: « Non merci » closes the message`, await noMessage(page, 300));
    check(`${tag}: the opening screen is there, nothing was downloaded`, (await page.locator('.voile-projet.ouverte').count()) === 1 && (await records(page)).length === 0);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await waitMessage(page, 'ask');
    check(`${tag}: … and it comes back at the next launch`, true);
    // Escape is « Non merci » too.
    await page.keyboard.press('Escape');
    check(`${tag}: Escape on the question is « Non merci »`, await noMessage(page, 300));
    await context.close();
  }

  // ------------------------------------------------------------ « Non merci » with the box
  {
    resetPages();
    const { context } = await persistentContext(viewport);
    const { page } = await openPage(context);
    await waitMessage(page, 'ask');
    await press(page, page.getByLabel('Ne plus afficher ce message'));
    await press(page, page.getByRole('button', { name: 'Non merci' }));
    await waitMessage(page, 'last');
    const last = await text(page.locator('[data-testid="grilles-dernier"]'));
    check(`${tag}: the last word, in its exact words, and a single button « OK »`, last === 'Ce choix reste disponible dans le menu de réglages avancé de l’application.' && (await page.locator(`${MSG} button`).count()) === 1 && (await page.locator(`${MSG} button`).innerText()) === 'OK', last);
    await shot(page, `4-dernier-${tag}`);
    await press(page, page.getByRole('button', { name: 'OK' }));
    check(`${tag}: « OK » closes it`, await noMessage(page, 300));
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    check(`${tag}: … and it never comes back`, await noMessage(page, 2000));
    check(`${tag}: the choice is remembered on the device`, (await page.evaluate(() => localStorage.getItem('fabtice.standards.offer.v1'))) === 'declined');
    await context.close();
  }
}

try {
  // ------------------------------------------------------------ 1. the message on a computer, then on a phone
  await messagePaths({ width: 1280, height: 800 }, 'bureau');
  await messagePaths(PHONE, 'telephone');

  // ------------------------------------------------------------ 2. the window left while the download goes on
  {
    resetPages();
    for (const id of WEB_IDS) pages[pathOf(mirrorOf(id))].delay = 1500;
    const { context } = await persistentContext();
    const { page } = await openPage(context);
    await waitMessage(page, 'ask');
    await page.locator('[data-testid="grilles-oui"]').click();
    await waitMessage(page, 'running');
    await page.locator('[data-testid="grilles-arriere-plan"]').click();
    check('in the background: the window is closed and the opening screen is usable', (await noMessage(page, 200)) && !(await page.locator('.voile-projet').evaluate((el) => el.inert)));
    for (let i = 0; i < 80 && (await records(page)).length < 4; i++) await sleep(500);
    check('… and the download goes on to its end', (await records(page)).length === 4, JSON.stringify(await records(page)));
    check('… without the message coming back', await noMessage(page, 600));
    await context.close();
  }

  // ------------------------------------------------------------ 3. cancelling
  {
    resetPages();
    pages[pathOf(mirrorOf('jazz-1460'))].delay = 3000;
    const { context } = await persistentContext();
    const { page } = await openPage(context);
    await waitMessage(page, 'ask');
    await page.locator('[data-testid="grilles-oui"]').click();
    await waitMessage(page, 'running');
    await page.locator('[data-testid="grilles-annuler"]').click();
    await waitMessage(page, 'done');
    const cancelled = await text(page.locator('[data-testid="grilles-bilan"]'));
    check('cancelling says so and keeps nothing', cancelled === 'Téléchargement annulé.' && (await records(page)).length === 0, cancelled);
    await context.close();
  }

  // ------------------------------------------------------------ 4. a web page with nothing it can download: no message
  {
    resetPages();
    const noMirror = { ...list, collections: list.collections.map((c) => ({ ...c, pages: c.pages.filter((p) => p.role !== 'mirror') })).filter((c) => c.pages.length > 0) };
    pages[pathOf(REMOTE_LIST)] = { body: JSON.stringify(noMirror), type: 'application/json' };
    const { context } = await persistentContext();
    const { page } = await openPage(context);
    check('web: with no collection it can read, there is no message', await noMessage(page, 2500));
    check('… and the opening screen is the one of a file', (await page.locator('.voile-projet.ouverte').count()) === 1);
    await context.close();
  }

  // ------------------------------------------------------------ 5. the section of « Réglages → Avancé »
  for (const viewport of [{ width: 1280, height: 800 }, PHONE]) {
    const tag = viewport.width < 760 ? 'telephone' : 'bureau';
    resetPages();
    const { context } = await persistentContext(viewport);
    const { page, errors } = await openPage(context, '?demo&moteur=factice&outils=distant');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await openSettingsTab(page, 'advanced');
    await sleep(600);
    const section = page.locator('[data-testid="standards-section"]');
    check(`${tag}: Réglages → Avancé holds the section in place (no window of its own)`, (await section.count()) === 1 && (await page.locator('[data-testid="standards-fenetre"]').count()) === 0);
    check(`${tag}: it says that nothing is on the device`, (await text(page.locator('[data-testid="standards-etat"]'))) === 'Aucune grille sur cet appareil.');
    const rows = await page.locator('[data-testid="standards-recueils"] .recueil').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    check(`${tag}: one row per collection of the list (${LISTED}), with its name`, rows.length === LISTED && rows[0].startsWith('Jazz 1460'), `${rows.length} rows`);
    check(`${tag}: each row has its style, its number of charts, its source and the known licence`, rows[0].includes('Jazz') && rows[0].includes('20 grilles') && rows[0].includes('Source : irealpro.com') && rows[0].includes('Licence : aucune licence publiée'), rows[0]);
    check(`${tag}: the collections a web page cannot read are said plainly`, rows.some((r) => r.startsWith('Brésil 220') && r.includes('à importer par fichier, ou à télécharger dans l’app Mac')));
    check(`${tag}: « Vérifier les mises à jour de grilles », « Tout télécharger » and the file import are there`, (await page.locator('[data-testid="standards-verifier"]').count()) === 1 && (await page.locator('[data-testid="standards-tout"]').count()) === 1 && (await page.locator('[data-testid="standards-importer"]').count()) === 1);
    await shot(page, `5-reglages-avance-${tag}`);
    if (viewport.width < 760) {
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid="standards-section"] button')].filter((e) => e.getBoundingClientRect().height < 40).map((e) => e.textContent));
      check(`${tag}: touch targets of at least 40 px`, small.length === 0, small.join(' | '));
      check(`${tag}: no horizontal overflow`, await noOverflow(page));
    }

    // One collection from its row.
    await press(page, page.locator('[data-id="blues-50"] [data-testid="standards-telecharger"]'));
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    check(`${tag}: one collection downloaded from its row`, (await text(page.locator('[data-testid="standards-resultat"]'))).includes('« Blues 50 » est gardé sur cet appareil.'));
    await press(page, page.locator('[data-testid="standards-resultat-ok"]'));
    // « Tout télécharger »: the others that this page can read.
    await press(page, page.locator('[data-testid="standards-tout"]'));
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    const all = await text(page.locator('[data-testid="standards-resultat"]'));
    check(`${tag}: « Tout télécharger » says what was kept, what failed and what needs the Mac app or a file`, all.startsWith(`4 recueils sur ${LISTED} téléchargés`) && all.includes('se retentent dans Réglages → Avancé'), all);
    await press(page, page.locator('[data-testid="standards-resultat-ok"]'));
    check(`${tag}: the list shows what is kept, with the date`, (await page.locator('[data-garde="oui"]').count()) === 4 && (await text(page.locator('[data-id="jazz-1460"]'))).includes('21 grilles') && /gardé le/.test(await text(page.locator('[data-id="jazz-1460"]'))));

    // « Vérifier les mises à jour de grilles »: nothing new, then a collection that changed.
    await press(page, page.locator('[data-testid="standards-verifier"]'));
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    check(`${tag}: « Vérifier »: nothing new, « Tout est à jour. »`, (await text(page.locator('[data-testid="standards-resultat"]'))) === 'Tout est à jour. Terminer');
    await shot(page, `6-a-jour-${tag}`);
    await press(page, page.locator('[data-testid="standards-resultat-ok"]'));
    pages[pathOf(mirrorOf('jazz-1460'))] = { body: link([...tunes(25, 'Jazz 1460 Tune')], 'Jazz 1460'), type: 'text/plain' };
    await press(page, page.locator('[data-testid="standards-verifier"]'));
    await page.waitForFunction(() => /mis à jour/.test(document.querySelector('[data-testid="standards-resultat"]')?.textContent ?? ''), null, { timeout: 20000 });
    check(`${tag}: « Vérifier »: a collection that changed is replaced, and said`, (await text(page.locator('[data-testid="standards-resultat"]'))).startsWith('1 recueil mis à jour.') && (await records(page)).find((r) => r.id === 'jazz-1460')?.tunes === 25);
    await press(page, page.locator('[data-testid="standards-resultat-ok"]'));

    // The file import (the way in for what a web page cannot read).
    const file = path.join(work, 'Brazilian 220.html');
    fs.writeFileSync(file, playlistFile(tunes(20, 'Brazilian Tune'), 'Brazilian 220'));
    await page.locator('[data-testid="standards-fichier"]').setInputFiles(file);
    await page.waitForSelector('[data-testid="standards-import-note"]', { timeout: 10000 });
    check(`${tag}: the file import says how many charts it added`, (await text(page.locator('[data-testid="standards-import-note"]'))).includes('20 grilles ajoutées depuis le fichier.'));
    check(`${tag}: the file is kept under the collection it is`, (await records(page)).some((r) => r.id === 'brazilian-220' && r.tunes === 20 && r.source === 'file:Brazilian 220.html'));
    const bad = path.join(work, 'login.html');
    fs.writeFileSync(bad, LOGIN_PAGE);
    await page.locator('[data-testid="standards-fichier"]').setInputFiles(bad);
    await page.waitForFunction(() => document.querySelector('[data-testid="standards-import-note"]')?.textContent?.includes('aucune grille'), null, { timeout: 10000 });
    check(`${tag}: a page that holds no chart is refused plainly`, true);

    // Removal, after a question; « Vérifier » does not bring it back.
    await press(page, page.locator('[data-id="blues-50"] [data-testid="standards-retirer"]'));
    check(`${tag}: removing asks first`, (await page.locator('[data-id="blues-50"] [role="group"]').count()) === 1 && (await records(page)).some((r) => r.id === 'blues-50'));
    await shot(page, `7-retirer-${tag}`);
    await press(page, page.locator('[data-id="blues-50"] [data-testid="standards-retirer-oui"]'));
    await page.waitForFunction(() => document.querySelector('[data-id="blues-50"]')?.getAttribute('data-garde') === 'non');
    check(`${tag}: the collection is removed`, !(await records(page)).some((r) => r.id === 'blues-50'));
    await press(page, page.locator('[data-testid="standards-verifier"]'));
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    check(`${tag}: « Vérifier » does not bring back what was removed on purpose`, !(await records(page)).some((r) => r.id === 'blues-50'));
    check(`${tag}: no page errors (settings)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 6. storage that is not available
  {
    resetPages();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await routeInternet(context);
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    const { page } = await openPage(context);
    await waitMessage(page, 'ask');
    await page.locator('[data-testid="grilles-oui"]').click();
    await waitMessage(page, 'done');
    const t = await text(page.locator(MSG));
    check('without storage the download still works, and says the charts will not outlast the page', t.includes('4 recueils sur') && t.includes('jusqu’à la fermeture de la page'), t.slice(0, 160));
    await context.close();
  }
} finally {
  await browser.close();
  srv.close();
  fake.close();
}

note(`screenshots in ${out}`);
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
