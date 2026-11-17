// The structure column of « Grille d'accords » (C14, stage 5) in Chromium, in both forms of the interface: a
// computer (1280 × 800, a mouse) and a phone (390 × 844, touch).
//   npm run build && npm run test:structure
//
// Uses the demo piece with its made-up detected structure (`?structure=demo`: Intro, Thème 1, Solo (Guitare),
// Solo (Trompette), Thème 2, Outro, form AABC, no hand letters) and the silent engine. Checked, in each form:
//   - the texts, to the letter (« Forme globale : AABC », « Mode », « Affichage complet », « Grille complète
//     simplifiée », « Sections : », the names of the parts and their letters);
//   - computer: the column takes about 20 % of the width and the chart about 80 %; phone: no column, a bar under
//     the title (« Forme globale : AABC · Affichage complet ») that opens a sheet with the same list;
//   - a click on a part shows only its bars (their numbers kept), puts the playhead at its start (heard at once
//     when playing) and marks it as the one being played; « Affichage complet » and « Grille complète
//     simplifiée » (its quiet note) give the whole chart;
//   - « Boucle »: the loop on the whole part, brass on the chart, played from its start;
//   - the mode (Jazz, Pop, Auto) and the names the detection gives in each;
//   - the window of a part: the fields, the limits as bar numbers, what is invalid, change, delete, add, reset,
//     the hand mark; each one undone and redone; « Revenir aux lettres de l'analyse »;
//   - nothing structure at all (the column keeps its texts and offers to add a part);
//   - no horizontal scroll, the touch targets of 40 px at least, no console error.
// Screenshots go to $FABTICE_STRUCTURE_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_STRUCTURE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-structure-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const PARTS = ['Intro', 'Thème 1', 'Solo (Guitare)', 'Solo (Trompette)', 'Thème 2', 'Outro'];
const LETTERS = ['', 'AABC', 'AA', 'AA', 'BC', ''];
const POP_PARTS = ['Intro', 'Couplet 1', 'Refrain 1', 'Couplet 2', 'Refrain 2', 'Solo (Guitare)', 'Outro'];

async function open(form, query = '?demo&structure=demo&moteur=factice&vue=grille') {
  const phone = form === 'phone';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.vue-grille .case .ch', { timeout: 10000 });
  await sleep(300);
  return { page, context, errors, phone };
}

/** A touch where the page has a touch screen, a click elsewhere. */
async function press(h, locator) {
  if (h.phone) await locator.tap();
  else await locator.click();
}

const $ = (page, sel) => page.locator(sel);
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const display = (page) => page.evaluate(() => document.querySelector('.vue-structure').dataset.affichage);
const cellBars = (page) => page.$$eval('.grille .case', (els) => els.map((e) => Number(e.dataset.mesure)));
const position = (page) => page.evaluate(() => window.__fabtice.engine.getPosition());
const undoLabel = (page) => page.evaluate(() => window.__fabtice.history.undoLabel());
const names = (page) => texts(page, '[data-testid="structure-partie"] .structure-nom-texte');
const row = (page, name) => page.locator('[data-testid="structure-partie"]', { has: page.locator('.structure-nom-texte', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) });
/** Source time of the start of bar `bar` (index) on the grid in force: the demo piece's tempo moves, so bars are not a fixed length. */
const bt = (page, bar) => page.evaluate((b) => window.__fabtice.lot4.tempoMap.barStartTime(window.__fabtice.store.getState().tempoMap, b), bar);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1);

/** On a phone the list lives in a sheet: open it (a touch on the bar), and close it again. */
async function openList(h) {
  if (!h.phone) return;
  if ((await $(h.page, '[data-testid="structure-feuille"]').count()) === 1) return;
  await press(h, $(h.page, '[data-testid="structure-barre"]'));
  await h.page.waitForSelector('[data-testid="structure-feuille"]');
  await sleep(300);
}
async function closeList(h) {
  if (h.phone && (await $(h.page, '[data-testid="structure-feuille"]').count()) === 1) {
    await press(h, $(h.page, '[data-testid="structure-fermer"]'));
    await sleep(200);
  }
}

async function suite(form) {
  const h = await open(form);
  const { page } = h;
  const P = h.phone;
  const tag = P ? 'phone' : 'computer';
  const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
  const ALL = (await cellBars(page)).length;

  // ------------------------------------------------------------ the layout, the texts
  if (!P) {
    const col = await $(page, '[data-testid="structure-colonne"]').boundingBox();
    const sheet = await $(page, '[data-testid="grille-feuille"]').boundingBox();
    check('computer: the column is about 20 % of the width', near(col.width / 1280, 0.2, 0.02), `${(col.width / 1280).toFixed(3)}`);
    check('computer: the chart takes about 80 %, on the right of the column', near(sheet.width / 1280, 0.8, 0.02) && near(sheet.x, col.width, 2), `${(sheet.width / 1280).toFixed(3)} at ${sheet.x}`);
    check('computer: the column fills the height under the top bar', col.height > 400, `${col.height}`);
    check('computer: the chart has four bars per line', (await page.$$eval('.grille .ligne:first-child .case', (e) => e.length)) === 4);
  } else {
    check('phone: no column', (await $(page, '[data-testid="structure-colonne"]').count()) === 0);
    const bar = await $(page, '[data-testid="structure-barre"]').boundingBox();
    check('phone: the bar spans the width of the screen', near(bar.width, 390, 2) && bar.height >= 40, `${bar.width} x ${bar.height}`);
    check('phone: the bar says the form and the display', (await $(page, '[data-testid="structure-barre"]').innerText()).replace(/\s+/g, ' ').trim() === 'Forme globale : AABC · Affichage complet');
    const title = await $(page, '.feuille-tete').boundingBox();
    check('phone: the bar is under the chart header', bar.y >= title.y + title.height - 1);
    await shot('bar');
    await openList(h);
    const sheet = await $(page, '[data-testid="structure-feuille"]').boundingBox();
    check('phone: the sheet is posted at the bottom of the screen, full width', near(sheet.x, 0, 1) && near(sheet.width, 390, 1) && near(sheet.y + sheet.height, 844, 2), JSON.stringify(sheet));
  }
  check(`${tag}: « Forme globale : AABC » is a heading`, (await $(page, '[data-testid="structure-forme"]').evaluate((e) => e.tagName + ':' + e.textContent.trim())) === 'H2:Forme globale : AABC');
  check(`${tag}: « Mode : » then Jazz and Pop, Jazz chosen by the analysis, Auto on`, (await texts(page, '[data-testid="structure-mode"] > *')).join('|') === 'Mode :|JazzPop|Auto' && (await $(page, '[data-testid="structure-mode-jazz"]').getAttribute('aria-pressed')) === 'true' && (await $(page, '[data-testid="structure-mode-pop"]').getAttribute('aria-pressed')) === 'false' && (await $(page, '[data-testid="structure-mode-auto"]').getAttribute('aria-pressed')) === 'true');
  check(`${tag}: the two displays, « Affichage complet » current`, (await texts(page, '[data-testid="structure-affichages"] button')).join('|') === 'Affichage complet|Grille complète simplifiée' && (await $(page, '[data-testid="structure-affichage-complet"]').getAttribute('aria-current')) === 'true');
  check(`${tag}: « Sections : » then the parts in order`, (await $(page, '.structure-titre').textContent()) === 'Sections :' && (await names(page)).join('|') === PARTS.join('|'), (await names(page)).join('|'));
  check(`${tag}: the letters of each part, quietly`, (await texts(page, '[data-testid="structure-partie"]')).map((t, i) => (LETTERS[i] ? t.includes(`· ${LETTERS[i]}`) : !t.includes('·'))).every(Boolean), (await texts(page, '[data-testid="structure-partie"]')).join(' / '));
  check(`${tag}: a « Boucle » and a pencil on every part`, (await $(page, '[data-testid="structure-boucle"]').count()) === 6 && (await $(page, '[data-testid="structure-modifier"]').count()) === 6 && (await texts(page, '[data-testid="structure-boucle"]')).every((x) => x === 'Boucle'));
  check(`${tag}: nothing corrected by hand: no reset, no mark`, (await $(page, '[data-testid="structure-revenir"]').count()) === 0 && (await $(page, '[data-testid="structure-lettres-revenir"]').count()) === 0 && (await $(page, '.structure-main').count()) === 0);
  check(`${tag}: « Ajouter une partie » is at the bottom`, (await $(page, '[data-testid="structure-ajouter"]').innerText()) === 'Ajouter une partie');
  check(`${tag}: the detected letters are on the chart (no hand letter)`, (await texts(page, '.grille .section')).join('') === 'AABCAAAABC', (await texts(page, '.grille .section')).join(','));
  check(`${tag}: the whole chart is shown (${ALL} bars), « complet » by default`, ALL >= 24 && (await display(page)) === 'full');
  if (P) {
    const sizes = await page.$$eval('[data-testid="structure-feuille"] button', (els) => els.map((e) => ({ t: e.textContent.trim().slice(0, 18), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })));
    const small = sizes.filter((s) => s.h < 40 || s.w < 40);
    check('phone: every target of the sheet is 40 px or more', small.length === 0, JSON.stringify(small));
    check('phone: the sheet does not scroll sideways', await $(page, '[data-testid="structure-feuille"]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
  } else {
    check('computer: the column does not scroll sideways', await $(page, '[data-testid="structure-colonne"]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
  }
  await shot('list');

  // ------------------------------------------------------------ a click on a part
  await press(h, row(page, 'Thème 1').locator('.structure-nom'));
  await sleep(300);
  await closeList(h);
  check(`${tag}: a click on « Thème 1 » shows only its bars, their numbers kept`, (await cellBars(page)).join(',') === '2,3,4,5,6,7,8,9' && (await texts(page, '.grille .numero')).join(',') === '3,4,5,6,7,8,9,10', (await cellBars(page)).join(','));
  check(`${tag}: …and puts the playhead at its start`, near(await position(page), await bt(page, 2), 0.05), `${await position(page)} vs ${await bt(page, 2)}`);
  check(`${tag}: …the display says which part and which bars`, (await $(page, '[data-testid="structure-note"]').textContent()) === 'Thème 1 · mesures 3–10');
  check(`${tag}: …the sheet starts at the top`, (await $(page, '[data-testid="grille-feuille"]').evaluate((e) => e.scrollTop)) === 0);
  if (P) check('phone: the bar now says « Forme globale : AABC · Thème 1 »', (await $(page, '[data-testid="structure-barre"]').innerText()).replace(/\s+/g, ' ').trim() === 'Forme globale : AABC · Thème 1');
  else check('computer: the part is ringed in ink in the list', (await $(page, '[data-testid="structure-partie"] .structure-nom[aria-current="true"]').innerText()).startsWith('Thème 1'));
  await shot('part-shown');

  // The bars of a part are the same chart: a chord can still be edited, the double bar of the part's first bar is gone.
  check(`${tag}: the first bar of the part has no double bar`, !(await page.$eval('.grille .case[data-mesure="2"]', (e) => e.classList.contains('double'))));
  check(`${tag}: the part's letters are on its bars`, (await texts(page, '.grille .section')).join('') === 'AABC');

  // Playing: a click on another part goes to its start and plays it; the part heard is marked in the list.
  await page.evaluate(() => window.__fabtice.engine.play());
  await sleep(300);
  await openList(h);
  await press(h, row(page, 'Solo (Trompette)').locator('.structure-nom'));
  await sleep(500);
  const trumpet = await bt(page, 14);
  check(`${tag}: while playing, a click on a part goes to its start and it keeps playing`, (await position(page)) >= trumpet && (await position(page)) < trumpet + 1.5 && (await state(page)).transport.engine === 'playing', `${await position(page)} from ${trumpet}`);
  await openList(h);
  const playing = await page.$$eval('[data-testid="structure-partie"][data-jouee]', (els) => els.map((e) => e.querySelector('.structure-nom-texte').textContent));
  check(`${tag}: the part being played is marked, and only it`, playing.join('|') === 'Solo (Trompette)', playing.join('|'));
  const ember = await page.$eval('[data-testid="structure-partie"][data-jouee]', (e) => getComputedStyle(e, '::before').backgroundColor);
  check(`${tag}: …in ink, not in ember`, ember === 'rgb(43, 31, 23)', ember);
  await page.evaluate(() => window.__fabtice.engine.pause());
  await closeList(h);

  // ------------------------------------------------------------ the two other displays
  await openList(h);
  await press(h, $(page, '[data-testid="structure-affichage-simplifie"]'));
  await sleep(300);
  await closeList(h);
  check(`${tag}: « Grille complète simplifiée » is selectable and shows the whole chart with its quiet note`, (await display(page)) === 'simplified' && (await cellBars(page)).length === ALL && (await $(page, '[data-testid="structure-note"]').textContent()) === 'La grille simplifiée arrive avec la structure du morceau.');
  await shot('simplified');
  await openList(h);
  await press(h, $(page, '[data-testid="structure-affichage-complet"]'));
  await sleep(300);
  await closeList(h);
  check(`${tag}: « Affichage complet » gives the whole chart back, no note`, (await display(page)) === 'full' && (await cellBars(page)).length === ALL && (await $(page, '[data-testid="structure-note"]').count()) === 0);
  check(`${tag}: the display is not saved and not undoable`, (await undoLabel(page)) === null);

  // ------------------------------------------------------------ « Boucle »
  await openList(h);
  await press(h, row(page, 'Solo (Guitare)').locator('[data-testid="structure-boucle"]'));
  await sleep(300);
  let s = await state(page);
  check(`${tag}: « Boucle » puts the loop on the whole part`, s.loop.enabled && near(s.loop.region.start, await bt(page, 10), 0.01) && near(s.loop.region.end, await bt(page, 14), 0.01), JSON.stringify(s.loop));
  check(`${tag}: …the playhead is brought to its start`, near(await position(page), await bt(page, 10), 0.05), `${await position(page)}`);
  if (P) await openList(h);
  check(`${tag}: …the button of that part is brass, the others not`, (await page.$$eval('[data-testid="structure-boucle"]', (els) => els.map((e) => e.getAttribute('aria-pressed')))).join(',') === 'false,false,true,false,false,false');
  const brass = await row(page, 'Solo (Guitare)').locator('[data-testid="structure-boucle"]').evaluate((e) => getComputedStyle(e).borderTopColor);
  check(`${tag}: …brass (never ember)`, brass === 'rgb(184, 135, 58)', brass);
  await closeList(h);
  const looped = await page.$$eval('.grille .case.dans-boucle', (els) => els.map((e) => Number(e.dataset.mesure)));
  check(`${tag}: …the loop shows on the chart as a brass veil over its four bars`, looped.join(',') === '10,11,12,13', looped.join(','));
  await shot('loop');
  // Playing: it is heard at once.
  await page.evaluate(() => window.__fabtice.engine.play());
  await openList(h);
  await press(h, row(page, 'Thème 2').locator('[data-testid="structure-boucle"]'));
  await sleep(400);
  s = await state(page);
  check(`${tag}: while playing, « Boucle » plays the part from its start`, s.transport.engine === 'playing' && near(s.loop.region.start, await bt(page, 18), 0.01) && (await position(page)) >= (await bt(page, 18)) - 0.1 && (await position(page)) < (await bt(page, 18)) + 1.5, `${await position(page)} from ${await bt(page, 18)}`);
  await page.evaluate(() => window.__fabtice.engine.pause());
  await closeList(h);

  // ------------------------------------------------------------ the mode
  await openList(h);
  await press(h, $(page, '[data-testid="structure-mode-pop"]'));
  await sleep(200);
  check(`${tag}: Pop chosen by hand: Pop pressed, Auto off`, (await $(page, '[data-testid="structure-mode-pop"]').getAttribute('aria-pressed')) === 'true' && (await $(page, '[data-testid="structure-mode-jazz"]').getAttribute('aria-pressed')) === 'false' && (await $(page, '[data-testid="structure-mode-auto"]').getAttribute('aria-pressed')) === 'false');
  check(`${tag}: …one undo step, « Annuler : structure »`, (await undoLabel(page)) === 'Annuler : structure');
  // The detection runs again in the new mode and names the parts in it (stood in for by the test handle).
  await page.evaluate(() => window.__fabtice.structure.setDetected(window.__fabtice.structure.demo('pop')));
  await sleep(200);
  check(`${tag}: in Pop the parts are Couplet, Refrain…`, (await names(page)).join('|') === POP_PARTS.join('|'), (await names(page)).join('|'));
  check(`${tag}: …and the form follows`, (await $(page, '[data-testid="structure-forme"]').textContent()) === 'Forme globale : AB');
  await shot('pop');
  await press(h, $(page, '[data-testid="structure-mode-auto"]'));
  await sleep(200);
  check(`${tag}: « Auto » gives the choice back to the analysis (Pop, as it found)`, (await $(page, '[data-testid="structure-mode-auto"]').getAttribute('aria-pressed')) === 'true' && (await $(page, '[data-testid="structure-mode-pop"]').getAttribute('aria-pressed')) === 'true');
  await page.evaluate(() => window.__fabtice.structure.setDetected(window.__fabtice.structure.demo('jazz')));
  await sleep(200);
  check(`${tag}: …and Jazz again with the Jazz detection`, (await names(page)).join('|') === PARTS.join('|') && (await $(page, '[data-testid="structure-mode-jazz"]').getAttribute('aria-pressed')) === 'true');
  await closeList(h);

  // ------------------------------------------------------------ the window of a part
  await openList(h);
  await press(h, row(page, 'Solo (Trompette)').locator('[data-testid="structure-modifier"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(350);
  check(`${tag}: the pencil opens « Modifier la partie », the sheet closed behind it`, (await $(page, '#partie-titre').textContent()) === 'Modifier la partie' && (await $(page, '[data-testid="structure-feuille"]').count()) === 0);
  check(`${tag}: …the fields start from the part`, (await $(page, '[data-testid="partie-type-solo"]').getAttribute('aria-pressed')) === 'true' && (await $(page, '[data-testid="partie-numero"]').inputValue()) === '' && (await $(page, '[data-testid="partie-instrument"]').inputValue()) === 'trumpet' && (await $(page, '[data-testid="partie-de"]').inputValue()) === '15' && (await $(page, '[data-testid="partie-a"]').inputValue()) === '18');
  check(`${tag}: …the kinds of the mode first (Jazz), the others after`, (await texts(page, '.partie-puces .puce')).join('|') === 'Intro|Thème|Solo|Pont|Spécial|Outro|Couplet|Refrain');
  check(`${tag}: …the instruments in French`, (await texts(page, '[data-testid="partie-instrument"] option')).join('|') === 'Aucun|Voix|Guitare|Piano|Basse|Batterie|Vents|Trompette|Saxophone|Trombone|Clarinette|Flûte|Violon|Vibraphone|Orgue');
  check(`${tag}: …« Supprimer cette partie », « Annuler » and « Valider »`, (await $(page, '[data-testid="partie-supprimer"]').innerText()) === 'Supprimer cette partie' && (await $(page, '[data-testid="partie-annuler"]').innerText()) === 'Annuler' && (await $(page, '[data-testid="partie-valider"]').innerText()) === 'Valider');
  if (P) {
    const box = await $(page, '.fenetre-partie').boundingBox();
    check('phone: the window is a sheet at the bottom of the screen', near(box.x, 0, 1) && near(box.width, 390, 1) && near(box.y + box.height, 844, 2), JSON.stringify(box));
    const sizes = await page.$$eval('.fenetre-partie button, .fenetre-partie select, .fenetre-partie input', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    check('phone: every field and button of the window is 40 px or more', Math.min(...sizes) >= 40, `${Math.min(...sizes)}`);
  }
  await shot('window');
  // Invalid limits: the button waits, the sentence says what is possible.
  await $(page, '[data-testid="partie-a"]').fill('30');
  check(`${tag}: a last bar out of the chart: calm sentence, « Valider » waits`, (await $(page, '[data-testid="partie-erreur"]').textContent()) === `Des mesures de 1 à ${ALL}, la première avant la dernière.` && (await $(page, '[data-testid="partie-valider"]').isDisabled()));
  await shot('window-invalid');
  await $(page, '[data-testid="partie-de"]').fill('20');
  await $(page, '[data-testid="partie-a"]').fill('19');
  check(`${tag}: reversed bars are refused too`, await $(page, '[data-testid="partie-valider"]').isDisabled());
  // Change: kind, number, instrument and limits.
  await $(page, '[data-testid="partie-de"]').fill('15');
  await $(page, '[data-testid="partie-a"]').fill('19');
  await $(page, '[data-testid="partie-numero"]').selectOption('2');
  await $(page, '[data-testid="partie-instrument"]').selectOption('saxophone');
  await press(h, $(page, '[data-testid="partie-valider"]'));
  await sleep(300);
  check(`${tag}: Valider closes the window`, (await $(page, '[data-testid="partie-dialogue"]').count()) === 0);
  check(`${tag}: …the part is now « Solo 2 (Saxophone) », bars 15 to 19`, (await names(page)).join('|') === ['Intro', 'Thème 1', 'Solo (Guitare)', 'Solo 2 (Saxophone)', 'Thème 2', 'Outro'].join('|') || (await openList(h), (await names(page)).includes('Solo 2 (Saxophone)')), (await names(page)).join('|'));
  await openList(h);
  const edited = (await state(page)).corrections.structure;
  const bars14 = await bt(page, 14);
  const bars19 = await bt(page, 19);
  check(`${tag}: …kept in the hand layer, limits from the bar numbers (bars 15 to 19)`, edited.parts.length >= 1 && edited.parts.some((p) => p.instrument === 'saxophone' && p.number === 2 && near(p.start, bars14, 0.01) && near(p.end, bars19, 0.01)), JSON.stringify(edited.parts));
  check(`${tag}: …marked as corrected by hand, and « Revenir à la structure de l’analyse » appears`, (await row(page, 'Solo 2 (Saxophone)').locator('.structure-main').textContent()) === 'Corrigée à la main' && (await $(page, '[data-testid="structure-revenir"]').innerText()) === 'Revenir à la structure de l’analyse');
  check(`${tag}: …the part after it still starts where it did (nothing slid)`, (await row(page, 'Thème 2').count()) === 1);
  await shot('edited');
  // Undo and redo.
  check(`${tag}: « Annuler : structure »`, (await undoLabel(page)) === 'Annuler : structure');
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);
  check(`${tag}: undo gives « Solo (Trompette) » back, no hand mark`, (await names(page)).join('|') === PARTS.join('|') && (await $(page, '.structure-main').count()) === 0 && (await $(page, '[data-testid="structure-revenir"]').count()) === 0, (await names(page)).join('|'));
  await page.evaluate(() => window.__fabtice.history.redo());
  await sleep(200);
  check(`${tag}: redo does it again`, (await names(page)).includes('Solo 2 (Saxophone)'));
  // Reset to the analysis.
  await press(h, $(page, '[data-testid="structure-revenir"]'));
  await sleep(200);
  check(`${tag}: « Revenir à la structure de l’analyse » gives the detected parts back and disappears`, (await names(page)).join('|') === PARTS.join('|') && (await $(page, '[data-testid="structure-revenir"]').count()) === 0);
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(150);
  check(`${tag}: …and it is undone`, (await names(page)).includes('Solo 2 (Saxophone)'));
  await press(h, $(page, '[data-testid="structure-revenir"]'));
  await sleep(150);
  await closeList(h);

  // Delete.
  await openList(h);
  await press(h, row(page, 'Thème 2').locator('[data-testid="structure-modifier"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(300);
  await press(h, $(page, '[data-testid="partie-supprimer"]'));
  await sleep(300);
  await openList(h);
  check(`${tag}: « Supprimer cette partie » removes it, the others stay`, (await names(page)).join('|') === ['Intro', 'Thème 1', 'Solo (Guitare)', 'Solo (Trompette)', 'Outro'].join('|'), (await names(page)).join('|'));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);
  check(`${tag}: …undone, it is back`, (await names(page)).join('|') === PARTS.join('|'));
  await page.evaluate(() => window.__fabtice.history.redo());
  await sleep(200);
  check(`${tag}: …redone, it is gone again`, !(await names(page)).includes('Thème 2'));
  // The part shown that is deleted: the chart is whole again.
  await press(h, row(page, 'Solo (Guitare)').locator('.structure-nom'));
  await sleep(200);
  await closeList(h);
  check(`${tag}: a part shown is deleted: the whole chart comes back`, (await cellBars(page)).join(',') === '10,11,12,13');
  await openList(h);
  await press(h, row(page, 'Solo (Guitare)').locator('[data-testid="structure-modifier"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(300);
  await press(h, $(page, '[data-testid="partie-supprimer"]'));
  await sleep(300);
  check(`${tag}: …deleted while shown: the whole chart is back`, (await cellBars(page)).length === ALL && (await display(page)) === 'full');
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);
  // Undone: the part is back, and so is its display (the display only waited for it).
  await page.evaluate(() => window.__fabtice.structure.display.showFullChart());

  // Add: from the playhead (no loop).
  const at18 = await bt(page, 18);
  await page.evaluate((t) => {
    const f = window.__fabtice;
    f.store.setState({ loop: { region: null, enabled: false } });
    f.actions.seek(t + 0.1); // inside bar 18
  }, at18);
  await openList(h);
  await press(h, $(page, '[data-testid="structure-ajouter"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(350);
  check(`${tag}: « Ajouter une partie » opens the window, no « Supprimer »`, (await $(page, '#partie-titre').textContent()) === 'Ajouter une partie' && (await $(page, '[data-testid="partie-supprimer"]').count()) === 0 && (await $(page, '[data-testid="partie-valider"]').innerText()) === 'Ajouter');
  check(`${tag}: …it starts at the bar of the playhead, to the end of the free stretch`, (await $(page, '[data-testid="partie-de"]').inputValue()) === '19' && (await $(page, '[data-testid="partie-a"]').inputValue()) === '22', `${await $(page, '[data-testid="partie-de"]').inputValue()}–${await $(page, '[data-testid="partie-a"]').inputValue()}`);
  await shot('window-add');
  await press(h, $(page, '[data-testid="partie-type-bridge"]'));
  await press(h, $(page, '[data-testid="partie-valider"]'));
  await sleep(300);
  await openList(h);
  check(`${tag}: the new part is in the list, in its place, marked by hand`, (await names(page)).join('|') === ['Intro', 'Thème 1', 'Solo (Guitare)', 'Solo (Trompette)', 'Pont', 'Outro'].join('|') && (await row(page, 'Pont').locator('.structure-main').count()) === 1, (await names(page)).join('|'));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);
  check(`${tag}: …undone, it leaves`, !(await names(page)).includes('Pont'));
  // Add from a loop.
  await closeList(h);
  await page.evaluate(([a, b]) => window.__fabtice.store.setState({ loop: { region: { start: a, end: b }, enabled: true } }), [at18, await bt(page, 22)]);
  await openList(h);
  await press(h, $(page, '[data-testid="structure-ajouter"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(300);
  check(`${tag}: from a loop, it starts at the loop's bars`, (await $(page, '[data-testid="partie-de"]').inputValue()) === '19' && (await $(page, '[data-testid="partie-a"]').inputValue()) === '22');
  await press(h, $(page, '[data-testid="partie-annuler"]'));
  await sleep(250);
  check(`${tag}: « Annuler » changes nothing`, (await $(page, '[data-testid="partie-dialogue"]').count()) === 0 && !(await (await openList(h), names(page))).includes('Pont'));
  // Escape closes the window too.
  await press(h, $(page, '[data-testid="structure-ajouter"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await page.keyboard.press('Escape');
  await sleep(250);
  check(`${tag}: Escape closes the window`, (await $(page, '[data-testid="partie-dialogue"]').count()) === 0);
  await closeList(h);

  // ------------------------------------------------------------ the letters
  await page.evaluate(() => window.__fabtice.lot2.harmony.setSection(0, 'Z'));
  await sleep(300);
  await openList(h);
  check(`${tag}: letters by hand: « Revenir aux lettres de l’analyse » appears`, (await $(page, '[data-testid="structure-lettres-revenir"]').innerText()) === 'Revenir aux lettres de l’analyse');
  check(`${tag}: …the part letters count the hand letters`, (await texts(page, '[data-testid="structure-partie"]'))[0].includes('· Z'), (await texts(page, '[data-testid="structure-partie"]'))[0]);
  await press(h, $(page, '[data-testid="structure-lettres-revenir"]'));
  await sleep(300);
  check(`${tag}: …a click gives the detected letters back, and the button leaves`, (await $(page, '[data-testid="structure-lettres-revenir"]').count()) === 0 && (await texts(page, '.grille .section')).join('') === 'AABCAAAABC', (await texts(page, '.grille .section')).join(','));
  await closeList(h);

  // ------------------------------------------------------------ no structure at all
  await page.evaluate(() => {
    const f = window.__fabtice;
    f.structure.actions.resetStructure();
    f.structure.setDetected(null);
  });
  await sleep(300);
  await openList(h);
  check(`${tag}: no structure: « Forme globale : — », the mode, the displays, « Sections : » and a quiet sentence`, (await $(page, '[data-testid="structure-forme"]').textContent()) === 'Forme globale : —' && (await $(page, '[data-testid="structure-mode"]').count()) === 1 && (await $(page, '[data-testid="structure-affichages"] button').count()) === 2 && (await $(page, '.structure-titre').textContent()) === 'Sections :' && (await $(page, '[data-testid="structure-vide"]').textContent()) === 'Aucune section pour l’instant.');
  check(`${tag}: …« Ajouter une partie » is there, no reset`, (await $(page, '[data-testid="structure-ajouter"]').count()) === 1 && (await $(page, '[data-testid="structure-revenir"]').count()) === 0);
  await shot('empty');
  await press(h, $(page, '[data-testid="structure-ajouter"]'));
  await page.waitForSelector('[data-testid="partie-dialogue"]');
  await sleep(300);
  await press(h, $(page, '[data-testid="partie-valider"]'));
  await sleep(300);
  await openList(h);
  check(`${tag}: …a part can be added to an empty list`, (await names(page)).length === 1, (await names(page)).join('|'));
  await closeList(h);

  check(`${tag}: the page never scrolls sideways`, await noOverflow(page));
  check(`${tag}: no console error`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

/** The sheet of the chart still does what it did: following the playhead, selecting a loop, the chord editor, in the narrower chart. */
async function chartStillWorks(form) {
  const h = await open(form);
  const { page } = h;
  const tag = h.phone ? 'phone' : 'computer';
  // Select two bars with the pointer: the loop is set.
  const a = await $(page, '.grille .case[data-mesure="1"]').boundingBox();
  const b = await $(page, '.grille .case[data-mesure="2"]').boundingBox();
  if (!h.phone) {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 10);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 10, { steps: 6 });
    await page.mouse.up();
    await sleep(200);
    const loop = (await state(page)).loop;
    check(`${tag}: selecting bars with the mouse still sets the loop`, loop.enabled && loop.region !== null && near(loop.region.start, await bt(page, 1), 0.3) && near(loop.region.end, await bt(page, 3), 0.3), JSON.stringify(loop));
    // The editor of a chord opens inside the chart's own scroller.
    await $(page, '.grille .case[data-mesure="3"] .accord-case').first().click();
    await page.waitForSelector('[data-testid="editeur"]');
    const ed = await $(page, '[data-testid="editeur"]').boundingBox();
    const sc = await $(page, '[data-testid="grille-feuille"]').boundingBox();
    check(`${tag}: the chord editor opens inside the chart's area, not over the column`, ed.x >= sc.x - 1 && ed.x + ed.width <= sc.x + sc.width + 1, `${ed.x}..${ed.x + ed.width} in ${sc.x}..${sc.x + sc.width}`);
    const cell = await $(page, '.grille .case[data-mesure="3"]').boundingBox();
    const gapX = Math.max(cell.x - (ed.x + ed.width), ed.x - (cell.x + cell.width));
    const gapY = Math.max(cell.y - (ed.y + ed.height), ed.y - (cell.y + cell.height));
    check(`${tag}: …and right next to its bar (placed from the offsets inside the chart's scroller)`, Math.max(gapX, gapY) >= 0 && Math.max(gapX, gapY) < 20, `gap ${gapX}, ${gapY}`);
    await page.keyboard.press('Escape');
  }
  // Following the playback in the chart's own scroller: play from the last bars, the sheet follows.
  await page.evaluate(() => {
    document.querySelector('.vue-grille').scrollTop = 0;
    window.__fabtice.engine.seek(40);
    window.__fabtice.engine.play();
  });
  await sleep(1800);
  const view = await page.evaluate(() => {
    const sc = document.querySelector('.vue-grille').getBoundingClientRect();
    const cell = document.querySelector('.grille .case.jouee')?.getBoundingClientRect();
    return { top: sc.top, bottom: sc.bottom, cellTop: cell?.top ?? null, cellBottom: cell?.bottom ?? null, scrolled: document.querySelector('.vue-grille').scrollTop };
  });
  check(`${tag}: the sheet follows the playhead in its own scroller`, view.scrolled > 0 && view.cellTop !== null && view.cellTop >= view.top - 1 && view.cellBottom <= view.bottom + 1, JSON.stringify(view));
  await page.evaluate(() => window.__fabtice.engine.pause());
  check(`${tag}: no console error`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

try {
  await suite('computer');
  await suite('phone');
  await chartStillWorks('computer');
  await chartStillWorks('phone');
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
