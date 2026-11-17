// Screenshots of every screen of the current stage, for the owner to look at, in both forms of the app: a
// computer (1280 × 800, a mouse) and a phone (390 × 844, touch), at twice the pixel density.
//
//   npm run captures -- /some/folder/outside/the/repository
//
// (the script builds the interface first, then serves it from web/ on a local port: nothing real is reached).
// The folder is created if needed; it must NOT be inside the repository (the pictures are not kept there).
// It ends by printing the list of the files written, named `ordinateur-…` or `telephone-…`:
//
//   menu-fabtice, menu-nouveau-projet, menu-projets-recents (Mac app), menu-exporter, menu-exporter-ireal-pro,
//   reglages-<onglet> (the seven tabs; on a phone also reglages-liste-des-onglets),
//   nouveau-projet-* (at launch, from a file, from a link, ticked box, link in the Mac app),
//   grilles-* (the start-up message of the chord charts: question, progression, resultat, dernier-message),
//   impression-* (the print window: une-page, plusieurs-pages),
//   export-audio-* (« Exporter » ▸ « Audio… »: wave, wave-96-khz, flac, mp3, des-pistes, des-pistes-un-seul-fichier),
//   chargement-* (the ember text of the top bar: separation, analyse).
//
// Each screen is reached the way the browser checks reach it (`lib/menu.mjs`, `lib/settings.mjs`; the states of
// `new-project.mjs`, `standards.mjs`, `print.mjs`). Playwright and Chromium are expected preinstalled
// (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeMenu, menuCommand, menuOpenTo, openMenu } from './lib/menu.mjs';
import { SETTINGS_TABS, openSettings, openSettingsTab } from './lib/settings.mjs';
import { meterCaptures } from './captures-meter.mjs';
import { tapFixCaptures } from './captures-tap.mjs';
import { startServer } from './serve.mjs';
import { LOGIN_PAGE, link, shrinkList, tunes } from './standards-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repo = path.resolve(appDir, '..');

// ---------------------------------------------------------------- the folder: given, and outside the repository

const given = process.argv[2];
if (!given) {
  console.error('Il faut dire dans quel dossier ranger les captures, par exemple :\n  npm run captures -- ~/Desktop/captures-fabtice\nCe dossier doit être en dehors du dépôt.');
  process.exit(2);
}
const base = process.env.INIT_CWD || process.cwd();
const out = path.resolve(base, given.replace(/^~(?=$|\/)/, os.homedir()));
/** The real path of the nearest folder that exists (so that a link into the repository does not slip through). */
function realNearest(p) {
  let cur = p;
  const tail = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    cur = path.dirname(cur);
  }
  return path.join(fs.realpathSync(cur), ...tail);
}
const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
if (inside(realNearest(out), fs.realpathSync(repo))) {
  console.error(`Le dossier « ${out} » est dans le dépôt de Fabtice. Choisissez un dossier en dehors, par exemple ~/Desktop/captures-fabtice.`);
  process.exit(2);
}
if (!fs.existsSync(path.join(repo, 'web', 'index.html'))) {
  console.error('L’interface n’est pas construite : lancez d’abord « npm run build » dans le dossier app.');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/')('playwright'));
} catch {
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright est introuvable. Indiquez son dossier avec PLAYWRIGHT_MODULE_DIR=/chemin/vers/node_modules/..');
    process.exit(2);
  }
}
fs.mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- the two forms

const FORMS = [
  { name: 'ordinateur', viewport: { width: 1280, height: 800 }, phone: false },
  { name: 'telephone', viewport: { width: 390, height: 844 }, phone: true },
];
const contextOptions = (form) => ({ viewport: form.viewport, deviceScaleFactor: 2, hasTouch: form.phone, isMobile: form.phone });

const written = [];
const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (text) => {
  problems.push(text);
  console.error(`PROBLÈME  ${text}`);
};

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

/** A touch on a phone, a click on a computer. */
async function press(page, locator) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}

/** A picture of the page as it is, once the fonts are in and a moment has passed for the last animation. */
async function snap(page, form, name) {
  await page.evaluate(() => document.fonts.ready);
  await sleep(350);
  const file = path.join(out, `${form.name}-${name}.png`);
  await page.screenshot({ path: file });
  written.push(file);
}

/** A page of the built interface; `bridge` makes it take itself for the Mac app (a scripted `window.fabtice`). */
async function openPage(context, query, { bridge = false } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`erreur dans la page (${query}) : ${e.message}`));
  if (bridge) await page.addInitScript(installBridge);
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  if (query.includes('demo')) {
    await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 20000 });
    await page.evaluate(() => window.__fabtice.ready);
  }
  return page;
}

/** A scripted Mac app: just enough of `window.fabtice` for the page to take itself for the Mac app, with recent projects. */
function installBridge() {
  const none = () => () => {};
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  window.fabtice = {
    systemInfo: async () => null,
    ytdlpStatus: async () => ({ source: 'managed', path: '/x/yt-dlp', installed: true, attempts: [] }),
    ytdlpCheck: async () => ({ skipped: true, reason: 'test', attempts: [] }),
    ytdlpInstall: async () => ({ ok: true, meta: {}, attempts: [] }),
    extract: async () => ({ ok: false, code: 'link-failed' }),
    copyText: async () => true,
    onYtdlpProgress: none,
    onExtractProgress: none,
    recentProjects: async () => [
      { token: 'a', name: 'Autumn Leaves.fab', folder: '/Users/musicien/Musique', at: day(0) },
      { token: 'b', name: 'Blue Bossa.fab', folder: '/Users/musicien/Musique', at: day(2) },
      { token: 'c', name: 'Solar (répétition).fab', folder: '/Users/musicien/Documents/Jazz', at: day(9) },
    ],
    openRecentProject: async () => ({ ok: true }),
    clearRecentProjects: async () => true,
  };
}

// ---------------------------------------------------------------- 1. the menu under the logo

async function menus(form) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice');
  await sleep(500);
  await openMenu(page);
  await snap(page, form, 'menu-fabtice');
  await closeMenu(page);
  for (const [name, path_] of [
    ['menu-nouveau-projet', ['Nouveau projet']],
    ['menu-exporter', ['Exporter']],
    ['menu-exporter-ireal-pro', ['Exporter', 'iReal Pro']],
  ]) {
    await menuOpenTo(page, ...path_);
    await snap(page, form, name);
    await closeMenu(page);
  }
  await context.close();

  // « Projets récents » exists in the Mac app only.
  const mac = await browser.newContext(contextOptions(form));
  const macPage = await openPage(mac, '?demo&moteur=factice', { bridge: true });
  await sleep(500);
  await menuOpenTo(macPage, 'Projets récents');
  await snap(macPage, form, 'menu-projets-recents');
  await mac.close();
}

// ---------------------------------------------------------------- 2. « Réglages », the seven tabs

const TAB_FILES = { general: 'general', instruments: 'instruments', tempo: 'tempo-et-analyse', chords: 'detection-des-accords', metronome: 'metronome', display: 'affichage', advanced: 'avance' };

async function settings(form) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice');
  await sleep(500);
  if (form.phone) {
    await openSettings(page);
    await snap(page, form, 'reglages-liste-des-onglets');
  }
  for (const tab of SETTINGS_TABS) {
    await openSettingsTab(page, tab);
    await sleep(300);
    await snap(page, form, `reglages-${TAB_FILES[tab]}`);
  }
  await context.close();
}

// ---------------------------------------------------------------- 3. the window « Nouveau projet »

const BOX = '[data-testid="separer-case"]';
const waitOpen = (page) => page.waitForFunction(() => document.querySelector('.voile-projet')?.classList.contains('ouverte'));

async function newProject(form) {
  // At launch, then with the box « Séparer les instruments » ticked.
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?debug&moteur=factice');
    await waitOpen(page);
    await sleep(300);
    await snap(page, form, 'nouveau-projet-au-lancement');
    await press(page, page.locator(BOX));
    await sleep(200);
    await snap(page, form, 'nouveau-projet-separer-les-instruments-coche');
    await context.close();
  }
  // From the menu, with a piece open: from a file, from a link (the web wording).
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?demo&moteur=factice');
    await sleep(500);
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    await waitOpen(page);
    await sleep(300);
    await snap(page, form, 'nouveau-projet-depuis-un-fichier');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.voile-projet')?.classList.contains('ouverte'));
    await menuCommand(page, 'Nouveau projet', 'À partir d’un lien YouTube');
    await waitOpen(page);
    await sleep(300);
    await snap(page, form, 'nouveau-projet-depuis-un-lien-version-web');
    await context.close();
  }
  // The link, in the Mac app.
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?debug&moteur=factice', { bridge: true });
    await waitOpen(page);
    await sleep(300);
    await page.evaluate(() => window.__fabtice.actions.openNewPiece('link'));
    await sleep(300);
    await snap(page, form, 'nouveau-projet-depuis-un-lien-app-mac');
    await context.close();
  }
}

// ---------------------------------------------------------------- 4. the start-up message of the chord charts

// A fake internet, as `standards.mjs` makes: a local server answers `/<host><path>`, the requests of the page to the
// allowed hosts are routed to it. The tunes are invented; nothing real is fetched.
const bundled = JSON.parse(fs.readFileSync(path.join(appDir, 'src/standards/collections.json'), 'utf8'));
const list = shrinkList(bundled);
const REMOTE_LIST = 'https://raw.githubusercontent.com/Pelikast/Fabtice/main/app/src/standards/collections.json';
const pathOf = (u) => {
  const x = new URL(u);
  return `/${x.hostname}${x.pathname}`;
};
const mirrorOf = (id) => list.collections.find((c) => c.id === id)?.pages.find((p) => p.role === 'mirror')?.url;
const NAMES = { 'jazz-1460': 'Jazz 1460', 'latin-50': 'Latin 50', 'blues-50': 'Blues 50', 'pop-400': 'Pop 400', 'country-50': 'Country 50' };
const fakePages = {
  [pathOf(REMOTE_LIST)]: { body: JSON.stringify(list), type: 'application/json' },
  [pathOf(mirrorOf('latin-50'))]: { body: LOGIN_PAGE, type: 'text/html' },
};
for (const id of ['jazz-1460', 'blues-50', 'pop-400', 'country-50']) {
  fakePages[pathOf(mirrorOf(id))] = { body: link(tunes(20, `${NAMES[id]} Tune`), NAMES[id]), type: 'text/plain', delay: 1800 };
}
const fake = http.createServer((req, res) => {
  const entry = fakePages[req.url.split('?')[0]];
  if (!entry) return res.writeHead(404).end('not found');
  setTimeout(() => res.writeHead(200, { 'content-type': entry.type }).end(entry.body), entry.delay ?? 0);
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const fakeUrl = `http://127.0.0.1:${fake.address().port}`;

async function routeInternet(context) {
  await context.route(/^https:\/\/(raw\.githubusercontent\.com|(?:www\.|forums\.)?irealpro\.com|(?:www\.)?irealb\.com)\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'raw.githubusercontent.com') return route.abort('failed');
    const res = await fetch(`${fakeUrl}/${u.hostname}${u.pathname}`).catch(() => null);
    if (!res) return route.abort('failed');
    await route.fulfill({ status: res.status, body: await res.text(), headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain', 'access-control-allow-origin': '*' } });
  });
}

const MSG = '[data-testid="grilles-message"]';
const waitMessage = (page, step) => page.waitForSelector(`${MSG}[data-etape="${step}"]`, { timeout: 20000 });

/** The message needs its own profile (IndexedDB and the stored answer): a persistent context, as in `standards.mjs`. */
async function chartMessage(form) {
  const launch = async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-captures-profile-'));
    const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], ...contextOptions(form) });
    await routeInternet(context);
    return { context, profile };
  };
  const query = '?debug&moteur=factice&outils=distant&grilles=message';
  {
    const { context, profile } = await launch();
    const page = await openPage(context, query);
    await waitMessage(page, 'ask');
    await snap(page, form, 'grilles-question');
    await press(page, page.locator('[data-testid="grilles-oui"]'));
    await waitMessage(page, 'running');
    await sleep(2500);
    await snap(page, form, 'grilles-progression');
    await waitMessage(page, 'done');
    await snap(page, form, 'grilles-resultat');
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  {
    const { context, profile } = await launch();
    const page = await openPage(context, query);
    await waitMessage(page, 'ask');
    await press(page, page.getByLabel('Ne plus afficher ce message'));
    await press(page, page.getByRole('button', { name: 'Non merci' }));
    await waitMessage(page, 'last');
    await snap(page, form, 'grilles-dernier-message');
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 5. the print window

/** The demo piece lasts `bars` bars (it has chords in the first 25; the rest is repeat signs): as `print.mjs` does. */
const setBars = (page, bars) =>
  page.evaluate((n) => {
    const s = window.__fabtice.store;
    s.setState({ project: { ...s.getState().project, duration: n * 4 * (60 / 110) - 0.2 } });
  }, bars);

async function printWindow(form) {
  for (const [name, bars] of [
    ['impression-une-page', 25],
    ['impression-plusieurs-pages', 104],
  ]) {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?demo&moteur=factice&vue=grille');
    await sleep(500);
    await setBars(page, bars);
    await menuCommand(page, 'Imprimer…');
    await page.waitForSelector('[data-testid="impression"]');
    await page.waitForSelector('.pp-papier');
    await sleep(500);
    await snap(page, form, name);
    await context.close();
  }
}

// ---------------------------------------------------------------- 5 bis. « Exporter » ▸ « Audio… »

async function audioWindow(form) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice&separation=faite');
  await sleep(500);
  await menuCommand(page, 'Exporter', 'Audio…');
  await page.waitForSelector('[data-testid="export-son"]');
  await sleep(400);
  await snap(page, form, 'export-audio-wave');
  await page.selectOption('[data-testid="export-frequence"]', '96000');
  await press(page, page.locator('.exp-duo [data-bits="24"]'));
  await sleep(200);
  await snap(page, form, 'export-audio-wave-96-khz');
  await press(page, page.locator('.exp-formats [data-format="flac"]'));
  await sleep(200);
  await snap(page, form, 'export-audio-flac');
  await press(page, page.locator('.exp-formats [data-format="mp3"]'));
  await sleep(200);
  await snap(page, form, 'export-audio-mp3');
  await press(page, page.locator('[data-testid="export-son"] [data-choix="tracks"]'));
  await sleep(200);
  if (form.phone) await page.locator('.exp-pistes').scrollIntoViewIfNeeded();
  await snap(page, form, 'export-audio-des-pistes');
  await press(page, page.locator('[data-testid="export-separes"]'));
  await sleep(200);
  await snap(page, form, 'export-audio-des-pistes-un-seul-fichier');
  await context.close();
}

// ---------------------------------------------------------------- 6. loading in progress (the ember text of the top bar)

async function loading(form) {
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?demo&moteur=factice&separation=lente');
    await page.waitForSelector('[data-testid="separation-etat"]', { timeout: 20000 });
    await page.locator('[data-testid="separation-etat"]').scrollIntoViewIfNeeded();
    await sleep(400);
    await snap(page, form, 'chargement-separation');
    await context.close();
  }
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?demo&moteur=factice');
    await page.evaluate(() => {
      const s = window.__fabtice.store;
      s.setState({ analysisRun: { status: 'running', projectId: s.getState().project.id, step: 'tempo' } });
    });
    await page.waitForSelector('[data-testid="analyse-etat"]');
    await page.locator('[data-testid="analyse-etat"]').scrollIntoViewIfNeeded();
    await snap(page, form, 'chargement-analyse');
    await context.close();
  }
}

// ---------------------------------------------------------------- run

try {
  for (const form of FORMS) {
    for (const [label, run] of [
      ['menu', menus],
      ['réglages', settings],
      ['nouveau projet', newProject],
      ['grilles', chartMessage],
      ['impression', printWindow],
      ['export audio', audioWindow],
      ['chargement', loading],
      // Stage 4: the tap correction of the tempo, the time signature window and what follows from it.
      ['correction en tapant', (form) => tapFixCaptures(form, { browser, contextOptions, openPage, snap, press, sleep })],
      ['signature rythmique', (form) => meterCaptures(form, { browser, openPage, snap, contextOptions, press })],
    ]) {
      try {
        console.log(`${form.name} : ${label}…`);
        await run(form);
      } catch (e) {
        fail(`${form.name} / ${label} : ${e.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
  srv.close();
  fake.close();
}

console.log(`\n${written.length} captures écrites dans ${out} :`);
for (const f of written) console.log(`  ${f}`);
if (problems.length) {
  console.log(`\n${problems.length} problème(s) :`);
  for (const p of problems) console.log(`  - ${p}`);
}
process.exit(problems.length ? 1 : 0);
