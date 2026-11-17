// « Changer la signature rythmique » (C13) in Chromium, in both forms: a computer (1280 × 800, a mouse: a right
// click on the ruler) and a phone (390 × 844, touch: a long press on the ruler). The bar menu, the window (its
// texts to the letter, its starting values, the figures, the two scopes, the bounds, what is invalid, removing a
// change, Escape, undo and redo, the focus), the grid that follows, and the signature written on the ruler of
// « Pistes » (read from `data-signatures` on the timeline: what the ruler drew, not its pixels).
//   npm run build && npm run test:meter
// Screenshots go to $FABTICE_METER_OUT (default: a temporary folder). Uses the demo piece (110 BPM, 4/4) and
// the silent engine.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { menuEntry } from './lib/menu.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_METER_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-meter-'));
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

const DLG = '[data-testid="signature"]';
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const meters = (page) => page.evaluate(() => window.__fabtice.store.getState().tempoMap.meters.map((m) => `${m.bar}:${m.meter.numerator}/${m.meter.denominator}`).join(' '));
const signatures = async (page) => (await sleep(120), page.evaluate(() => document.querySelector('.frise')?.dataset.signatures ?? ''));
const text = (page, sel) => page.locator(sel).first().innerText().then((s) => s.trim());
const undoLabel = (page) => page.evaluate(() => window.__fabtice.history.undoLabel());
const wait = async (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });

async function open(form) {
  const phone = form === 'phone';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/?demo&analyse=aucune&moteur=factice`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 15000 });
  await sleep(200);
  // A phone starts with the view moved to the loop: back to the first bars.
  await page.mouse.move(phone ? 250 : 700, phone ? 400 : 400);
  await page.mouse.wheel(-8000, 0);
  await sleep(500);
  const cdp = phone ? await context.newCDPSession(page) : null;
  return { page, context, errors, phone, cdp };
}

/** A touch where the page has a touch screen, a click elsewhere. */
async function press(h, locator) {
  if (h.phone) await locator.tap();
  else await locator.click();
}

/** Where, in the page, the « Mesures » row of the ruler shows bar `bar` (index): inside the bar, a little after its line. */
async function barPoint(page, bar) {
  await sleep(250); // the ruler follows the store a frame later
  return page.evaluate((b) => {
    const f = document.querySelector('.frise');
    const r = document.querySelector('.frise-regle').getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const s = window.__fabtice.store.getState();
    const t = window.__fabtice.lot4.tempoMap.barStartTime(s.tempoMap, b) + 0.5 * (window.__fabtice.lot4.tempoMap.barStartTime(s.tempoMap, b + 1) - window.__fabtice.lot4.tempoMap.barStartTime(s.tempoMap, b));
    return { x: fr.left + (t - Number(f.dataset.t0)) * Number(f.dataset.pps), y: r.bottom - 13, left: fr.left, right: fr.right };
  }, bar);
}

/** The bar menu at `bar`: a right click (computer) or a long press (phone) on the ruler. */
async function openBarMenu(h, bar) {
  const p = await barPoint(h.page, bar);
  if (p.x < p.left + 2 || p.x > p.right - 2) throw new Error(`bar ${bar} is not in view (x = ${p.x}, view ${JSON.stringify(await h.page.evaluate(() => ({ ...document.querySelector('.frise').dataset, map: window.__fabtice.store.getState().tempoMap, b2: window.__fabtice.lot4.tempoMap.barStartTime(window.__fabtice.store.getState().tempoMap, 2), b3: window.__fabtice.lot4.tempoMap.barStartTime(window.__fabtice.store.getState().tempoMap, 3), w: document.querySelector('.frise').getBoundingClientRect().width })))})`);
  if (h.phone) {
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await sleep(900);
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await h.page.mouse.click(p.x, p.y, { button: 'right' });
  }
  await h.page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 5000 });
}

/** The bar menu, then « Changer la signature rythmique »: the window is open. */
async function openWindow(h, bar) {
  await openBarMenu(h, bar);
  await press(h, h.page.locator('[data-testid="menu-tempo"] [data-action="meter"]'));
  await h.page.waitForSelector(DLG, { timeout: 5000 });
  await sleep(300); // the window's entrance
}

async function fill(h, top, bottom) {
  const input = h.page.locator('[data-testid="signature-haut"]');
  await input.fill(String(top));
  if (bottom !== undefined) await h.page.selectOption('[data-testid="signature-bas"]', String(bottom));
}
const confirmButton = (h) => h.page.locator('[data-testid="signature-valider"]');
const dialogOpen = async (page) => (await page.locator(DLG).count()) === 1;
const insideDialog = (page) => page.evaluate((s) => document.querySelector(s)?.contains(document.activeElement) ?? false, DLG);

/** The window's box, and whether everything in it stays inside the box and the page. */
async function layout(h) {
  return h.page.evaluate((s) => {
    const box = document.querySelector(`${s} .fenetre-signature`).getBoundingClientRect();
    const el = document.querySelector(`${s} .fenetre-signature`);
    const inner = [...el.querySelectorAll('h2, p, input, select, label, button, .signature-trait')].map((e) => e.getBoundingClientRect());
    return {
      box: [box.left, box.top, box.right, box.bottom],
      overflowX: el.scrollWidth - el.clientWidth,
      innerOut: inner.filter((r) => r.width > 0 && (r.left < box.left - 0.5 || r.right > box.right + 0.5)).length,
      vw: innerWidth,
      vh: innerHeight,
    };
  }, DLG);
}

async function suite(form) {
  const h = await open(form);
  const { page } = h;
  const P = h.phone;
  const tag = P ? 'phone' : 'computer';
  const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });

  // ------------------------------------------------------------ the starting point: one signature, nothing written
  check(`${tag}: one signature, nothing written on the ruler`, (await meters(page)) === '0:4/4' && (await signatures(page)) === '', `${await meters(page)} | ${await signatures(page)}`);
  const hasData = await page.evaluate(() => 'signatures' in document.querySelector('.frise').dataset);
  check(`${tag}: no signature mark at all in the ruler's data`, !hasData);
  await shot('ruler-single');

  // ------------------------------------------------------------ the menu, the window
  await openBarMenu(h, 2);
  const entries = await page.locator('[data-testid="menu-tempo"] [role="menuitem"]').evaluateAll((els) => els.map((e) => [e.dataset.action, e.disabled]));
  check(`${tag}: the bar menu has « Changer la signature rythmique », enabled`, entries.some(([a, d]) => a === 'meter' && !d), JSON.stringify(entries));
  check(`${tag}: its label is exact`, (await text(page, '[data-action="meter"] span')) === 'Changer la signature rythmique');
  await press(h, page.locator('[data-action="meter"]'));
  await page.waitForSelector(DLG);
  await sleep(300);
  check(`${tag}: the menu closes, the window opens`, (await page.locator('[data-testid="menu-tempo"]').count()) === 0 && (await dialogOpen(page)));
  check(`${tag}: it is a modal dialog named by its title`, await page.evaluate((s) => {
    const d = document.querySelector(s);
    return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && document.getElementById(d.getAttribute('aria-labelledby')).textContent === 'Changer la signature rythmique';
  }, DLG));
  check(`${tag}: title, with the bar number`, (await text(page, `${DLG} h2`)) === 'Changer la signature rythmique' && (await page.locator('[data-testid="signature-mesure"]').textContent()) === 'Mesure 3');
  check(`${tag}: starting values are the signature in force (4 over 4)`, (await page.inputValue('[data-testid="signature-haut"]')) === '4' && (await page.inputValue('[data-testid="signature-bas"]')) === '4');
  const options = await page.locator('[data-testid="signature-bas"] option').allInnerTexts();
  check(`${tag}: below, 4, 8, 16 or 32`, options.join() === '4,8,16,32', options.join());
  check(`${tag}: the figures are one over the other, a line between`, await page.evaluate(() => {
    const a = document.querySelector('[data-testid="signature-haut"]').getBoundingClientRect();
    const l = document.querySelector('.signature-trait').getBoundingClientRect();
    const b = document.querySelector('[data-testid="signature-bas"]').getBoundingClientRect();
    return a.bottom <= l.top && l.bottom <= b.top && Math.abs(a.left - b.left) < 1 && l.width >= a.width;
  }));
  const radios = await page.locator('.signature-choix').allInnerTexts();
  check(`${tag}: the two scopes, to the letter`, radios.map((s) => s.trim()).join(' | ') === 'Changement permanent à partir de cette mesure | Changement uniquement pour cette mesure', radios.join(' | '));
  check(`${tag}: « permanent » is the default`, await page.locator('[data-testid="signature-portee-from"]').isChecked());
  const buttons = await page.locator(`${DLG} .import-actions button`).allInnerTexts();
  check(`${tag}: the buttons`, buttons.join(' | ') === 'Annuler | Changer la signature', buttons.join(' | '));
  check(`${tag}: no hint about the quarter note while the bottom figure is the first signature's`, (await page.locator('[data-testid="signature-noire"]').count()) === 0);
  check(`${tag}: no « remove » offered where nothing changes`, (await page.locator('[data-testid="signature-retirer"]').count()) === 0);
  check(`${tag}: the confirm button is enabled and the line is calm`, (await confirmButton(h).isEnabled()) && (await text(page, '[data-testid="signature-erreur"]')) === '');
  check(`${tag}: the focus is in the top box, its figure selected`, await page.evaluate(() => document.activeElement?.dataset.testid === 'signature-haut' && document.getSelection && document.activeElement.selectionStart === 0 && document.activeElement.selectionEnd === 1));
  let lay = await layout(h);
  const margin = P ? 0 : 20;
  check(`${tag}: nothing overflows the window`, lay.overflowX <= 0 && lay.innerOut === 0, JSON.stringify(lay));
  check(`${tag}: the window is inside the screen${P ? '' : ' with a 20 px margin'}`, lay.box[0] >= margin && lay.box[1] >= margin * (P ? 0 : 1) && lay.box[2] <= lay.vw - margin && lay.box[3] <= lay.vh - (P ? 0 : margin), JSON.stringify(lay.box));
  if (P) {
    // (a radio is pressed through its label, the whole line)
    const sizes = await page.evaluate((s) => [...document.querySelectorAll(`${s} input[type="text"], ${s} select, ${s} button, ${s} label`)].map((e) => [e.dataset.testid || e.className || e.tagName, e.getBoundingClientRect().height, e.getBoundingClientRect().width]), DLG);
    const small = sizes.filter(([, hgt, w]) => w > 0 && hgt < 40);
    check('phone: every touch target is at least 40 px high', sizes.length >= 6 && small.length === 0, JSON.stringify(small));
  }
  check(`${tag}: nothing else on the page changed look (only the usual veil behind)`, await page.evaluate(() => {
    const veils = document.querySelectorAll('.voile.ouverte');
    return veils.length === 1 && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.frise')).opacity === '1';
  }));
  await shot('window-default');

  // ------------------------------------------------------------ what is invalid
  const store0 = await meters(page);
  for (const bad of ['', '0', '65', '100', 'abc', '-3', '3.5']) {
    await page.locator('[data-testid="signature-haut"]').fill(bad);
    const calm = await text(page, '[data-testid="signature-erreur"]');
    const disabled = await confirmButton(h).isDisabled();
    await page.locator('[data-testid="signature-haut"]').press('Enter');
    check(`${tag}: « ${bad} » is refused with a calm line, the button is off, Enter does nothing`, disabled && calm === 'Un nombre de 1 à 64.' && (await dialogOpen(page)) && (await meters(page)) === store0, `${calm}`);
  }
  await shot('window-invalid');
  for (const good of ['1', '64', ' 7 ']) {
    await page.locator('[data-testid="signature-haut"]').fill(good);
    check(`${tag}: « ${good.trim()} » is accepted`, (await confirmButton(h).isEnabled()) && (await text(page, '[data-testid="signature-erreur"]')) === '');
  }
  const set = await page.locator('[data-testid="signature-bas"]').evaluate((el) => el.options.length);
  check(`${tag}: only four choices below`, set === 4);

  // ------------------------------------------------------------ 7/8, permanent, from bar 3
  await fill(h, 7, 8);
  check(`${tag}: a 7/8 shows the hint about the quarter note`, (await text(page, '[data-testid="signature-noire"]')) === 'La noire garde sa durée : une mesure en 7/8 dure trois noires et demie.', await text(page, '[data-testid="signature-noire"]').catch(() => '-'));
  await page.selectOption('[data-testid="signature-bas"]', '4');
  check(`${tag}: no hint when the bottom figure is back to the first signature's`, (await page.locator('[data-testid="signature-noire"]').count()) === 0);
  await page.selectOption('[data-testid="signature-bas"]', '8');
  await page.locator('[data-testid="signature-haut"]').fill('6');
  check(`${tag}: 6/8 lasts three quarter notes, in the owner's words`, (await text(page, '[data-testid="signature-noire"]')) === 'La noire garde sa durée : une mesure en 6/8 dure trois noires.');
  await page.locator('[data-testid="signature-haut"]').fill('7');
  lay = await layout(h);
  check(`${tag}: nothing overflows with the hint`, lay.overflowX <= 0 && lay.innerOut === 0 && lay.box[3] <= lay.vh, JSON.stringify(lay));
  await shot('window-7-8');
  const before = await page.evaluate(() => ({ b2: window.__fabtice.lot4.tempoMap.barStartTime(window.__fabtice.store.getState().tempoMap, 2), b3: window.__fabtice.lot4.tempoMap.barStartTime(window.__fabtice.store.getState().tempoMap, 3) }));
  await page.locator('[data-testid="signature-haut"]').press('Enter');
  await sleep(300);
  check(`${tag}: Enter confirms and closes`, !(await dialogOpen(page)));
  check(`${tag}: the tempo map has the change at bar 3`, (await meters(page)) === '0:4/4 2:7/8', await meters(page));
  const after = await page.evaluate(() => {
    const tm = window.__fabtice.lot4.tempoMap;
    const m = window.__fabtice.store.getState().tempoMap;
    return { b2: tm.barStartTime(m, 2), b3: tm.barStartTime(m, 3), bpm: m.segments[0].bpm };
  });
  const beatS = 60 / after.bpm;
  check(`${tag}: bar lines before the change did not move; the 7/8 bar lasts 3.5 quarter notes (the quarter stays the quarter)`, near(after.b2, before.b2, 1e-6) && near(after.b3 - after.b2, 3.5 * beatS, 1e-3), `${(after.b3 - after.b2).toFixed(4)} vs ${(3.5 * beatS).toFixed(4)}`);
  check(`${tag}: undo reads « Annuler : signature rythmique »`, (await undoLabel(page)) === 'Annuler : signature rythmique' || (await undoLabel(page)) === 'signature rythmique', String(await undoLabel(page)));
  const menu = await menuEntry(page, 'Annuler*');
  check(`${tag}: the menu says « Annuler : signature rythmique »`, menu.label === 'Annuler : signature rythmique' && menu.enabled, menu.label);
  check(`${tag}: the focus left the window`, !(await insideDialog(page)));

  // The ruler writes the signature at the bar, and bar 1.
  await wait(page, () => (document.querySelector('.frise').dataset.signatures ?? '') !== '');
  check(`${tag}: the ruler writes 4/4 at bar 1 and 7/8 at bar 3`, (await signatures(page)) === '1:4/4 3:7/8', await signatures(page));
  await shot('ruler-7-8');

  // The window opened again at that bar and after it: the signature in force; the bar carries a change: remove it.
  if (P) {
    await page.mouse.wheel(150, 0);
    await sleep(400);
  }
  await openWindow(h, 3);
  check(`${tag}: later in the change, the boxes start at 7 over 8`, (await page.inputValue('[data-testid="signature-haut"]')) === '7' && (await page.inputValue('[data-testid="signature-bas"]')) === '8');
  check(`${tag}: no remove link on a bar that carries no change`, (await page.locator('[data-testid="signature-retirer"]').count()) === 0);
  check(`${tag}: and the hint is there, the bottom figure being another than the first signature's`, (await page.locator('[data-testid="signature-noire"]').count()) === 1);
  await page.keyboard.press('Escape');
  await sleep(200);
  check(`${tag}: Escape closes`, !(await dialogOpen(page)));
  if (P) {
    await page.mouse.wheel(-8000, 0);
    await sleep(400);
  }

  await openWindow(h, 2);
  check(`${tag}: on the bar of the change, 7 over 8`, (await page.inputValue('[data-testid="signature-haut"]')) === '7');
  check(`${tag}: a remove link is offered, with the owner's text`, (await text(page, '[data-testid="signature-retirer"]')) === 'Retirer ce changement de signature');
  lay = await layout(h);
  check(`${tag}: nothing overflows with the remove link`, lay.overflowX <= 0 && lay.innerOut === 0 && lay.box[3] <= lay.vh, JSON.stringify(lay));
  await shot('window-remove');
  await press(h, page.locator('[data-testid="signature-retirer"]'));
  await sleep(300);
  check(`${tag}: removing the change brings the old signature back`, !(await dialogOpen(page)) && (await meters(page)) === '0:4/4' && (await signatures(page)) === '', `${await meters(page)} | ${await signatures(page)}`);
  check(`${tag}: removing is one undo step with the same label`, (await undoLabel(page)) === 'Annuler : signature rythmique' || (await undoLabel(page)) === 'signature rythmique');

  // Undo twice (the removal, the change), redo twice.
  await page.evaluate(() => window.__fabtice.history.undo());
  check(`${tag}: undo brings the 7/8 back`, (await meters(page)) === '0:4/4 2:7/8');
  await page.evaluate(() => window.__fabtice.history.undo());
  check(`${tag}: undo again, the grid is as it was and the ruler writes nothing`, (await meters(page)) === '0:4/4' && (await signatures(page)) === '', `${await meters(page)} | ${await signatures(page)}`);
  await page.evaluate(() => window.__fabtice.history.redo());
  await page.evaluate(() => window.__fabtice.history.redo());
  check(`${tag}: redo twice: the removal again`, (await meters(page)) === '0:4/4');
  await page.evaluate(() => window.__fabtice.history.undo());
  await page.evaluate(() => window.__fabtice.history.undo());
  check(`${tag}: back to one signature`, (await meters(page)) === '0:4/4');

  // ------------------------------------------------------------ « uniquement pour cette mesure »
  await openWindow(h, 1);
  await fill(h, 5);
  await press(h, page.locator('.signature-choix', { hasText: 'Changement uniquement pour cette mesure' }));
  check(`${tag}: the second scope is chosen`, await page.locator('[data-testid="signature-portee-bar"]').isChecked());
  await shot('window-single-bar');
  await press(h, confirmButton(h));
  await sleep(300);
  check(`${tag}: one change for bar 2 and the return at the next bar`, (await meters(page)) === '0:4/4 1:5/4 2:4/4', await meters(page));
  await wait(page, () => (document.querySelector('.frise').dataset.signatures ?? '') !== '');
  check(`${tag}: the ruler writes the change and the return`, (await signatures(page)) === '1:4/4 2:5/4 3:4/4', await signatures(page));
  await shot('ruler-single-bar');
  await page.evaluate(() => window.__fabtice.history.undo());
  await wait(page, () => (document.querySelector('.frise').dataset.signatures ?? '') === '');
  check(`${tag}: ONE undo step takes both back`, (await meters(page)) === '0:4/4' && (await signatures(page)) === '');

  // ------------------------------------------------------------ the bounds
  for (const [top, bottom] of [[1, 4], [64, 32], [3, 16], [12, 8]]) {
    await openWindow(h, 2);
    await fill(h, top, bottom);
    await page.keyboard.press('Enter');
    await sleep(250);
    check(`${tag}: ${top}/${bottom} is accepted`, (await meters(page)) === `0:4/4 2:${top}/${bottom}`, await meters(page));
    await page.evaluate(() => window.__fabtice.history.undo());
  }
  check(`${tag}: all undone`, (await meters(page)) === '0:4/4');

  // ------------------------------------------------------------ the first bar's bottom figure renumbers the map
  await openWindow(h, 0);
  await fill(h, 6, 8);
  await press(h, confirmButton(h));
  await sleep(250);
  const first = await page.evaluate(() => window.__fabtice.store.getState().tempoMap.meters[0].meter);
  check(`${tag}: a new signature at bar 1 is the first one (6/8), and nothing is written on a single-signature ruler`, first.numerator === 6 && first.denominator === 8 && (await signatures(page)) === '', `${JSON.stringify(first)} | ${await signatures(page)}`);
  await page.evaluate(() => window.__fabtice.history.undo());

  // ------------------------------------------------------------ cancel, Escape: nothing changes, no undo step
  const label0 = await undoLabel(page);
  await openWindow(h, 2);
  await fill(h, 9, 16);
  await press(h, page.locator('[data-testid="signature-annuler"]'));
  await sleep(250);
  check(`${tag}: « Annuler » changes nothing`, !(await dialogOpen(page)) && (await meters(page)) === '0:4/4' && (await undoLabel(page)) === label0);
  await openWindow(h, 2);
  await fill(h, 9, 16);
  await page.keyboard.press('Escape');
  await sleep(250);
  check(`${tag}: Escape changes nothing`, !(await dialogOpen(page)) && (await meters(page)) === '0:4/4' && (await undoLabel(page)) === label0);
  await openWindow(h, 2);
  await press(h, page.locator(`${DLG} .fermer`));
  await sleep(250);
  check(`${tag}: the close button closes`, !(await dialogOpen(page)));
  // The bar itself, same signature: nothing to do, no undo step.
  await openWindow(h, 2);
  await press(h, confirmButton(h));
  await sleep(250);
  check(`${tag}: confirming the signature already in force makes no undo step`, !(await dialogOpen(page)) && (await undoLabel(page)) === label0 && (await meters(page)) === '0:4/4');

  // ------------------------------------------------------------ the keyboard: Space is the window's own
  await openWindow(h, 2);
  await page.locator('[data-testid="signature-haut"]').press(' ');
  await page.locator('[data-testid="signature-bas"]').focus();
  await page.keyboard.press(' ');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await sleep(200);
  check(`${tag}: Space in the window's boxes does not start playback`, (await state(page)).transport.engine !== 'playing');
  await openWindow(h, 2);
  await page.locator('[data-testid="signature-annuler"]').focus();
  await page.keyboard.press(' ');
  await sleep(250);
  check(`${tag}: Space on « Annuler » presses the button, and playback does not start`, !(await dialogOpen(page)) && (await state(page)).transport.engine !== 'playing');
  await openWindow(h, 2);
  await page.locator('[data-testid="signature-portee-bar"]').focus();
  await page.keyboard.press(' ');
  check(`${tag}: Space on a radio chooses it`, await page.locator('[data-testid="signature-portee-bar"]').isChecked() && (await state(page)).transport.engine !== 'playing');
  // Tab stays in the window.
  const tabbed = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    tabbed.push(await insideDialog(page));
  }
  check(`${tag}: Tab goes round inside the window`, tabbed.every(Boolean));
  await page.keyboard.press('Escape');
  await sleep(200);

  // ------------------------------------------------------------ the ruler at several zooms: legible, nothing in the way
  await page.evaluate(() => window.__fabtice.actions.setSubdivision?.(1));
  await openWindow(h, 2);
  await fill(h, 7, 8);
  await page.keyboard.press('Enter');
  await sleep(300);
  const width = await page.evaluate(() => {
    const f = document.querySelector('.frise');
    return { pps: Number(f.dataset.pps), w: f.getBoundingClientRect().width };
  });
  for (const factor of [0.25, 1, 4]) {
    await page.evaluate((px) => window.__fabtice.actions.setZoom(px), width.pps * factor);
    await sleep(250);
    const sig = await signatures(page);
    const barPx = await page.evaluate(() => {
      const f = document.querySelector('.frise');
      const m = window.__fabtice.store.getState().tempoMap;
      const tm = window.__fabtice.lot4.tempoMap;
      return (tm.barStartTime(m, 3) - tm.barStartTime(m, 2)) * Number(f.dataset.pps);
    });
    const written = sig.includes('3:7/8');
    const inView = await page.evaluate(() => {
      const f = document.querySelector('.frise');
      const m = window.__fabtice.store.getState().tempoMap;
      const t = window.__fabtice.lot4.tempoMap.barStartTime(m, 2);
      const t0 = Number(f.dataset.t0);
      return t >= t0 && t <= t0 + f.getBoundingClientRect().width / Number(f.dataset.pps) - 0.3;
    });
    if (!inView) {
      console.log(`NOTE  zoom x${factor}: the 7/8 bar is out of view, nothing to check`);
      continue;
    }
    check(`zoom x${factor} (${barPx.toFixed(0)} px per bar): the signature is written when it fits and left out when it does not`, written ? barPx >= 20 : barPx <= 32, `${sig} @ ${barPx.toFixed(1)} px`);
    if (factor === 1 || factor === 4) await shot(`ruler-zoom-${factor}`);
  }
  await page.evaluate(() => window.__fabtice.actions.setZoom(0.01));
  await sleep(250);
  const tiny = await page.evaluate(() => {
    const f = document.querySelector('.frise');
    const m = window.__fabtice.store.getState().tempoMap;
    const tm = window.__fabtice.lot4.tempoMap;
    return (tm.barStartTime(m, 3) - tm.barStartTime(m, 2)) * Number(f.dataset.pps);
  });
  check(`${tag}: the most zoomed-out ruler (a bar of ${tiny.toFixed(1)} px) writes nothing, rather than overlap`, tiny >= 20 || (await signatures(page)) === '', await signatures(page));
  await shot('ruler-zoomed-out');

  // ------------------------------------------------------------ the chord chart writes the same signature
  // (the demo with its chords: a second page, the same command)
  const chart = await h.context.newPage();
  chart.on('pageerror', (e) => h.errors.push(e.message));
  await chart.goto(`${url}/?demo&moteur=factice&vue=grille`);
  await chart.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await chart.evaluate(() => window.__fabtice.ready);
  await chart.waitForSelector('.vue-grille .case .ch');
  check(`${tag}: the chord chart of a single-signature piece writes no signature`, (await chart.locator('.case .signature').count()) === 0);
  await chart.evaluate(() => window.__fabtice.lot2.meter.setMeterFrom(2, { numerator: 7, denominator: 8 }));
  await sleep(400);
  check(`${tag}: the chord chart writes 7/8 at the bar, where the ruler does`, (await chart.locator('.case[data-mesure="2"] .signature[data-signature="7/8"]').count()) === 1, String(await chart.locator('.case .signature').count()));
  await chart.close();

  check(`${tag}: no console error`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

try {
  await suite('computer');
  await suite('phone');
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
