// Browser checks of the offer to download the chord charts of standards, in Chromium, on the built
// interface served from web/ (the web app: only pages that allow cross-origin reads can be downloaded).
//   npm run build && npm run test:standards
//
// A fake internet stands in for the real sites: a local server answers `/<host><path>`, and the
// browser's requests to the allowed hosts are routed to it (so that nothing real is fetched, and no
// real playlist is needed: the tunes are invented, see standards-fixtures.mjs). The remote list of
// collections is served the same way (`?outils=distant`), with small sizes.
//
// What it covers: the offer at opening (sentence, recommended collections ticked, source host of each,
// the ones the web cannot download said plainly), the download with progress and an honest result
// (kept count, a login page named as « introuvable », the file import as the alternative), the file
// import, the library found again after a reload (a PERSISTENT profile: a throw-away context keeps
// IndexedDB in memory and cannot show that), « Plus tard » and « Ne plus proposer », the settings
// window, cancelling, storage that is not available, a phone width, and the title lookup from the page.
// Screenshots go to $FABTICE_STANDARDS_OUT (default: a temporary folder), deviceScaleFactor 1.
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { forumPage, link, LOGIN_PAGE, officialPage, playlistFile, shrinkList, tunes } from './standards-fixtures.mjs';

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
const mirrorOf = (id) => list.collections.find((c) => c.id === id).pages.find((p) => p.role === 'mirror')?.url;
const pathOf = (url) => {
  const u = new URL(url);
  return `/${u.hostname}${u.pathname}`;
};
const NAMES = { 'jazz-1460': 'Jazz 1460', 'latin-50': 'Latin 50', 'blues-50': 'Blues 50', 'brazilian-220': 'Brazilian 220', 'pop-400': 'Pop 400', 'country-50': 'Country 50' };
const playlistOf = (id, count = 20) => link([...tunes(count, `${NAMES[id]} Tune`), ...(id === 'jazz-1460' ? [{ title: 'Autumn Leaves', composer: 'Kosma Joseph' }] : [])], NAMES[id]);

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

async function openPage(context, query = '?debug&moteur=factice&outils=distant') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { page, errors };
}
async function persistentContext(viewport = { width: 1280, height: 800 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-standards-profile-'));
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport, deviceScaleFactor: 1 });
  await routeInternet(context);
  return { context, profile };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const waitOffer = (page) => page.waitForSelector('[data-testid="standards-offre"]', { timeout: 15000 });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** Texts of the rows of a list, whitespace squeezed. */
const rowTexts = (page, sel) => page.locator(`${sel} .recueil`).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
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

try {
  // ------------------------------------------------------------ 1. the offer, the download, the result
  {
    resetPages();
    seen.length = 0;
    const { context } = await persistentContext();
    const { page, errors } = await openPage(context);
    await waitOffer(page);
    const offer = page.locator('[data-testid="standards-offre"]');
    const sentence = (await offer.innerText()).replace(/\s+/g, ' ');
    check('the offer shows the sentence in French', sentence.includes('Télécharger les grilles des standards de jazz ? Cela améliore la détection des accords des standards.'));
    const rows = await rowTexts(page, '[data-testid="standards-offre"]');
    note(`rows: ${JSON.stringify(rows)}`);
    check('five recommended collections, each with its name, count and source host', rows.length === 5 && rows[0].startsWith('Jazz 1460') && rows[0].includes('20 grilles') && rows[0].includes('GitHub'), `${rows.length} rows`);
    check('web: the collections that cannot be downloaded directly are said plainly', rows.some((r) => r.startsWith('Brésil 220') && r.includes('à importer depuis un fichier')) && rows.some((r) => r.startsWith('Dixieland') && r.includes('à importer depuis un fichier')));
    const ticked = await offer.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => [e.checked, e.disabled]));
    check('the downloadable recommended ones are ticked, the others disabled', JSON.stringify(ticked) === JSON.stringify([[true, false], [false, true], [true, false], [true, false], [false, true]]), JSON.stringify(ticked));
    check('the web note explains why', (await offer.innerText()).includes('Dans la version web'));
    check('« Plus tard » and « Ne plus proposer » are offered', (await offer.getByRole('button', { name: 'Plus tard' }).count()) === 1 && (await offer.getByRole('button', { name: 'Ne plus proposer' }).count()) === 1);
    const state0 = await page.evaluate(() => ({ open: window.__fabtice.store.getState().ui.newPieceOpen }));
    check('the opening dialog is open and the import choices are still there', state0.open && (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 1);
    await shot(page, '1-offre-bureau');
    check('no horizontal overflow (desktop)', await noOverflow(page));

    // The download
    await page.locator('[data-testid="standards-telecharger"]').click();
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    const result = (await page.locator('[data-testid="standards-resultat"]').innerText()).replace(/\s+/g, ' ');
    note(`result: ${result}`);
    check('honest result: tunes kept (jazz 21 + blues 20)', result.includes('41 grilles gardées sur cet appareil.'), result.slice(0, 80));
    check('a login page is named plainly as not found', result.includes('Latin 50 : introuvable pour l’instant.'));
    check('the collections the web cannot download are named, with the file import', result.includes('Brésil 220 : à importer depuis un fichier.') && result.includes('Importer un fichier…') && result.includes('exportée depuis iReal Pro'));
    check('no page of an irealpro.com site was requested from the web app', !seen.some((s) => /irealpro|irealb/.test(s)), seen.join(', '));
    check('only the ticked collections were requested', seen.filter((s) => s.startsWith('raw.githubusercontent.com') && !/collections\.json|models\.json/.test(s)).length === 3, seen.join(', '));
    const kept = await records(page);
    check('the library is kept in its own IndexedDB database', kept.length === 2 && kept.some((r) => r.id === 'jazz-1460' && r.tunes === 21) && kept.some((r) => r.id === 'blues-50' && r.tunes === 20), JSON.stringify(kept));
    await shot(page, '2-resultat-bureau');

    // The file import: the Brazilian playlist exported from iReal Pro
    const file = path.join(work, 'Brazilian 220.html');
    fs.writeFileSync(file, playlistFile(tunes(20, 'Brazilian Tune'), 'Brazilian 220'));
    await page.locator('[data-testid="standards-fichier"]').setInputFiles(file);
    await page.waitForSelector('.standards-note', { timeout: 10000 });
    check('the file import says how many grids it added', (await page.locator('.standards-note').innerText()).includes('20 grilles ajoutées depuis le fichier.'));
    const afterImport = await records(page);
    check('the file is kept under the collection it is', afterImport.some((r) => r.id === 'brazilian-220' && r.tunes === 20 && r.source === 'file:Brazilian 220.html'), JSON.stringify(afterImport));
    const bad = path.join(work, 'login.html');
    fs.writeFileSync(bad, LOGIN_PAGE);
    await page.locator('[data-testid="standards-fichier"]').setInputFiles(bad);
    await page.waitForFunction(() => document.querySelector('.standards-note')?.textContent?.includes('aucune grille'), null, { timeout: 10000 });
    check('a page that holds no chart is refused plainly', true);
    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="standards-offre"]'));
    check('once something is kept, the offer goes away', true);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await page.close();

    // Reload: the library is found again, the offer does not come back
    const { page: again, errors: errors2 } = await openPage(context);
    await sleep(1200);
    check('after a reload the offer does not come back', (await again.locator('[data-testid="standards-offre"]').count()) === 0);
    const found = await again.evaluate(async () => {
      const list = await window.__fabtice.standards.findStandard('Kosma - Autumn Leaves (1960) [Remastered]');
      const st = await window.__fabtice.standards.standardsStatus();
      return { top: list[0] ? { title: list[0].chart.title, id: list[0].collectionId, bars: list[0].chart.bars.length, score: list[0].score } : null, total: st.total, persistent: st.persistent, ids: st.collections.map((c) => c.id) };
    });
    check('the charts are found again after the reload, by a noisy video title', found.top?.title === 'Autumn Leaves' && found.top.id === 'jazz-1460' && found.top.bars > 0, JSON.stringify(found));
    check('three collections, 61 tunes, persistent', found.total === 61 && found.persistent && found.ids.length === 3, JSON.stringify(found));

    check('no page errors after the reload', errors2.length === 0, errors2.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 2. settings window, on a project
  {
    resetPages();
    const { context } = await persistentContext();
    const { page, errors } = await openPage(context, '?demo&moteur=factice&outils=distant');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await page.locator('button:has-text("Réglages"):visible').first().click();
    await sleep(300);
    const advanced = page.locator('[data-testid="reglages-avances"]');
    check('« Réglages avancés » is there', (await advanced.count()) === 1);
    await advanced.click();
    await sleep(500);
    await shot(page, '3a-reglages-avances');
    check('the settings say that nothing is on the device', (await page.locator('[data-testid="standards-etat"]').innerText()).includes('Aucune grille sur cet appareil'));
    await page.locator('[data-testid="standards-gerer"]').click();
    await page.waitForSelector('[data-testid="standards-fenetre"]');
    await shot(page, '3-fenetre-reglages');
    await page.locator('[data-testid="standards-fenetre"] [data-testid="standards-telecharger"]').click();
    await page.waitForSelector('[data-testid="standards-fenetre"] [data-testid="standards-resultat"]', { timeout: 20000 });
    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.waitForSelector('[data-testid="standards-gardees"]');
    const keptRows = await rowTexts(page, '[data-testid="standards-gardees"]');
    check('the window lists what is kept, with counts', keptRows.length === 2 && keptRows.some((r) => r.startsWith('Jazz 1460') && r.includes('21 grilles')), JSON.stringify(keptRows));
    await shot(page, '4-fenetre-gardees');
    await page.getByRole('button', { name: 'Retirer toutes les grilles' }).click();
    await page.getByRole('button', { name: 'Oui, les retirer' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="standards-gardees"]'));
    check('everything can be removed, after a confirmation', (await records(page)).length === 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="standards-fenetre"]'));
    check('Escape closes the window', true);
    check('no page errors (settings)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ 3. « Plus tard » and « Ne plus proposer »
  {
    const { context } = await persistentContext();
    const { page } = await openPage(context);
    await waitOffer(page);
    await page.getByRole('button', { name: 'Plus tard' }).click();
    check('« Plus tard » hides the offer for this visit', (await page.locator('[data-testid="standards-offre"]').count()) === 0);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await waitOffer(page);
    check('… and it comes back at the next visit', true);
    await page.getByRole('button', { name: 'Ne plus proposer' }).click();
    check('« Ne plus proposer » hides it', (await page.locator('[data-testid="standards-offre"]').count()) === 0);
    await page.reload();
    await page.waitForFunction(() => window.__fabtice);
    await sleep(1500);
    check('… and it stays hidden after a reload (remembered on the device)', (await page.locator('[data-testid="standards-offre"]').count()) === 0);
    check('the import choices are untouched', (await page.getByRole('button', { name: 'Choisir un fichier audio' }).count()) === 1);
    await context.close();
  }

  // ------------------------------------------------------------ 4. cancelling a slow download
  {
    resetPages();
    pages[pathOf(mirrorOf('jazz-1460'))].delay = 4000;
    const { context } = await persistentContext();
    const { page } = await openPage(context);
    await waitOffer(page);
    await page.locator('[data-testid="standards-telecharger"]').click();
    await page.waitForSelector('[data-testid="standards-encours"]');
    const running = (await page.locator('[data-testid="standards-encours"]').innerText()).replace(/\s+/g, ' ');
    check('while downloading: the title of the step, a percentage and each collection with its state', running.includes('Téléchargement des grilles…') && /\d+ %/.test(running) && running.includes('téléchargement depuis GitHub…') && running.includes('en attente'), running);
    await shot(page, '5-telechargement');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 10000 });
    const cancelled = (await page.locator('[data-testid="standards-resultat"]').innerText()).replace(/\s+/g, ' ');
    check('cancelling says so and keeps nothing', cancelled.includes('Téléchargement annulé.') && (await records(page)).length === 0, cancelled.slice(0, 80));
    await context.close();
  }

  // ------------------------------------------------------------ 5. storage that is not available
  {
    resetPages();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await routeInternet(context);
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    const { page } = await openPage(context);
    await waitOffer(page);
    await page.locator('[data-testid="standards-telecharger"]').click();
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    const text = (await page.locator('[data-testid="standards-resultat"]').innerText()).replace(/\s+/g, ' ');
    check('without storage the download still works, and says the charts will not outlast the page', text.includes('41 grilles gardées') && text.includes('jusqu’à la fermeture de la page'), text.slice(0, 120));
    await context.close();
  }

  // ------------------------------------------------------------ 6. a phone
  {
    resetPages();
    const { context } = await persistentContext({ width: 390, height: 844 });
    const { page, errors } = await openPage(context);
    await waitOffer(page);
    await page.locator('[data-testid="standards-offre"]').scrollIntoViewIfNeeded();
    await shot(page, '6-offre-telephone');
    check('phone: no horizontal overflow', await noOverflow(page));
    const tooWide = await page.locator('.standards, .standards *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    check('phone: nothing of the offer goes past the screen', tooWide === 0, `${tooWide} element(s)`);
    const buttons = await page.locator('.standards button, .standards .recueil label').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 36).map((e) => e.textContent));
    check('phone: targets are at least 36 px high', buttons.length === 0, buttons.join(' | '));
    await page.locator('[data-testid="standards-telecharger"]').click();
    await page.waitForSelector('[data-testid="standards-resultat"]', { timeout: 20000 });
    await page.locator('[data-testid="standards-resultat"]').scrollIntoViewIfNeeded();
    await shot(page, '7-resultat-telephone');
    check('phone: result without horizontal overflow', await noOverflow(page));
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
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
