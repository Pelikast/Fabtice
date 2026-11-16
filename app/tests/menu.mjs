// The menu Fabtice in Chromium (C6, C8): the logo opens it; every command is
// reached at the mouse, from the keyboard and at a touch; submenus; entries
// greyed out without a project or without chords; « Annuler » with the step's
// label; Escape and a press outside close it; the old menus of the top bar are
// gone; the shortcuts cmd/Ctrl + O, P and « , ». Computer (1280 × 800, mouse)
// and phone (390 × 844, touch). Uses the silent engine.
//   npm run build && npm run test:menu

import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';
import { closeMenu, menuCommand, menuEntry, openMenu } from './lib/menu.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function open(query, options) {
  const context = await browser.newContext(options);
  // « Ouvrir… » in Chromium asks for a file with a handle: counted here, and answered « cancelled ».
  await context.addInitScript(() => {
    window.__picks = 0;
    window.showOpenFilePicker = async () => {
      window.__picks++;
      throw new DOMException('cancelled', 'AbortError');
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  if (query.includes('demo')) {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
    await page.evaluate(() => window.__fabtice.ready);
  } else await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { context, page, errors };
}
const ui = (page) => page.evaluate(() => window.__fabtice.store.getState().ui);
const menuOpen = (page) => page.evaluate(() => document.querySelector('button.marque')?.getAttribute('aria-expanded') === 'true');
/** Labels of the entries of the list shown (computer: the top menu; phone: the sheet's list). */
const labels = (page, sel) => page.locator(`${sel} > .menu-ligne > [role="menuitem"] .menu-texte, ${sel} > .menu-filet`).evaluateAll((els) => els.map((e) => (e.classList.contains('menu-filet') ? '-' : e.textContent.trim())));
const MUTE = '.piste-tete >> nth=0 >> button.muet';
const focused = (page) => page.evaluate(() => document.activeElement?.querySelector('.menu-texte')?.textContent ?? document.activeElement?.className ?? '');

/** Closes whatever dialog a command opened (Escape), and waits for the app to be free again. */
async function dismiss(page) {
  await page.keyboard.press('Escape');
  await sleep(150);
}

try {
  // ------------------------------------------------------------ computer, mouse and keyboard
  {
    const { context, page, errors } = await open('?demo&moteur=factice', { viewport: { width: 1280, height: 800 }, acceptDownloads: true });

    // The top bar: the logo is the menu's button; the old menus are gone.
    const top = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('.haut button')].map((b) => b.textContent.trim()),
      logo: document.querySelector('.haut button.marque')?.getAttribute('aria-haspopup'),
    }));
    check('top bar: logo (menu button), then the two views only', top.logo === 'menu' && top.buttons.join('|') === 'Fabtice|Pistes|Grille d’accords', top.buttons.join('|'));
    check('no « Nouveau projet », « Exporter », « Réglages », « ⋯ » in the top bar', (await page.locator('.haut .menu-plus, .haut button:has-text("Exporter"), .haut button:has-text("Réglages"), .haut button:has-text("Nouveau projet")').count()) === 0);

    // Opened at the mouse: the entries in their order, the shortcuts on the right (Ctrl here, not a Mac).
    await openMenu(page);
    const root = await labels(page, '#menu-fabtice');
    check('web: the entries of C6 in order (no « Projets récents », no « Quitter »)', root.join('|') === 'Annuler|Rétablir|-|Nouveau projet|Ouvrir…|-|Enregistrer|Enregistrer sous…|Exporter|Imprimer…|-|Réglages…', root.join('|'));
    const shortcuts = await page.locator('#menu-fabtice > .menu-ligne > [role="menuitem"] .menu-raccourci').allInnerTexts();
    check('shortcuts shown: Ctrl + Z, Maj + Ctrl + Z, Ctrl + O, Ctrl + S, Maj + Ctrl + S, Ctrl + P, Ctrl + ,', shortcuts.join('|') === 'Ctrl + Z|Maj + Ctrl + Z|Ctrl + O|Ctrl + S|Maj + Ctrl + S|Ctrl + P|Ctrl + ,', shortcuts.join('|'));
    const roles = await page.evaluate(() => ({
      menu: document.querySelector('#menu-fabtice')?.getAttribute('role'),
      items: document.querySelectorAll('#menu-fabtice > .menu-ligne > [role="menuitem"]').length,
      sub: document.querySelector('[data-sous-menu="export"]')?.getAttribute('aria-haspopup'),
      expanded: document.querySelector('button.marque')?.getAttribute('aria-expanded'),
    }));
    check('ARIA: menu, menuitems, aria-haspopup on submenus, aria-expanded on the logo', roles.menu === 'menu' && roles.items === 9 && roles.sub === 'menu' && roles.expanded === 'true', JSON.stringify(roles));
    const box = await page.locator('#menu-fabtice').boundingBox();
    check('the menu sits under the logo, inside the window', box && box.x >= 0 && box.y > 40 && box.y + box.height < 800, JSON.stringify(box));
    // Entries greyed out: nothing to undo; the demonstration is never saved.
    const greyed = await page.locator('#menu-fabtice [aria-disabled="true"] .menu-texte').allInnerTexts();
    check('greyed out: Annuler, Rétablir (nothing yet), Enregistrer, Enregistrer sous… (demonstration)', greyed.join('|') === 'Annuler|Rétablir|Enregistrer|Enregistrer sous…', greyed.join('|'));
    // A greyed entry does nothing and the menu stays.
    await page.click('#menu-fabtice [data-commande="save"]', { force: true });
    check('a click on a greyed entry does nothing (the menu stays open)', (await menuOpen(page)) && !(await ui(page)).saveProjectOpen);
    // A press outside closes it.
    await page.mouse.click(700, 500);
    check('a press outside closes it', !(await menuOpen(page)));

    // Submenus at the mouse: hover opens them, the third level too.
    await openMenu(page);
    await page.hover('[data-sous-menu="export"]');
    await page.locator('.sous-menu').first().waitFor({ timeout: 3000 });
    check('hover on « Exporter »: its submenu (Audio…, iReal Pro, PDF…)', (await labels(page, '.sous-menu')).slice(0, 3).join('|') === 'Audio…|iReal Pro|PDF…', (await labels(page, '.sous-menu')).join('|'));
    await page.hover('[data-sous-menu="ireal"]');
    await page.locator('[data-commande="irealFile"]').waitFor({ timeout: 3000 });
    check('« iReal Pro ▸ »: « Fichier iReal Pro… » only on the web', (await page.locator('[data-commande="irealOpen"]').count()) === 0);
    const subBox = await page.locator('.sous-menu .sous-menu').boundingBox();
    check('submenus open to the right, inside the window', subBox && subBox.x > box.x + box.width && subBox.x + subBox.width <= 1280, JSON.stringify(subBox));
    // Leaving towards another entry closes the submenu (after a short grace for the way to it).
    await page.hover('[data-commande="print"]');
    await sleep(400);
    check('the mouse on another entry: the submenu closes', (await page.locator('.sous-menu').count()) === 0);
    await page.keyboard.press('Escape');
    check('Escape closes the menu, the focus back on the logo', !(await menuOpen(page)) && (await page.evaluate(() => document.activeElement?.classList.contains('marque'))));
    check('… and leaves the piece alone (no dialog opened, nothing closed)', !(await ui(page)).newPieceOpen);

    // « Fichier iReal Pro… »: a download named after the piece.
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), menuCommand(page, 'Exporter', 'iReal Pro', 'Fichier iReal Pro…')]);
    check('Exporter ▸ iReal Pro ▸ Fichier iReal Pro…: the file', download.suggestedFilename() === 'Blues du dimanche.html', download.suggestedFilename());
    check('the menu closed after the command', !(await menuOpen(page)));
    // « Audio… », « PDF… », « Imprimer… ».
    await menuCommand(page, 'Exporter', 'Audio…');
    check('Exporter ▸ Audio…: the sound export window', (await ui(page)).exportAudioOpen);
    await dismiss(page);
    await menuCommand(page, 'Exporter', 'PDF…');
    check('Exporter ▸ PDF…: the print window (it writes the PDF)', (await ui(page)).printOpen);
    await dismiss(page);
    await menuCommand(page, 'Imprimer…');
    check('Imprimer…: the print window, from « Pistes »', (await ui(page)).printOpen && (await page.evaluate(() => window.__fabtice.store.getState().view.mode)) === 'pistes');
    await dismiss(page);
    // « Réglages… »: the window (made elsewhere) is asked for.
    await menuCommand(page, 'Réglages…');
    check('Réglages…: the settings window is open (store)', (await ui(page)).settings.open);
    await page.evaluate(() => window.__fabtice.actions.closeSettings());
    // « Nouveau projet ▸ »: the window, knowing where one starts from.
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    let u = await ui(page);
    check('Nouveau projet ▸ À partir d’un fichier audio: the window, from « file », its button focused', u.newPieceOpen && u.newPieceFrom === 'file' && (await page.evaluate(() => document.activeElement?.textContent?.includes('fichier audio'))));
    await dismiss(page);
    await menuCommand(page, 'Nouveau projet', 'À partir d’un lien YouTube');
    u = await ui(page);
    check('Nouveau projet ▸ À partir d’un lien YouTube (web): the window says the link is for the Mac app', u.newPieceOpen && u.newPieceFrom === 'link' && (await page.locator('[data-testid="lien-app-mac"]').isVisible()));
    await dismiss(page);
    // « Ouvrir… »: the system's picker.
    await menuCommand(page, 'Ouvrir…');
    await sleep(100);
    check('Ouvrir…: the picker of a project file', (await page.evaluate(() => window.__picks)) === 1);

    // « Annuler » with the step's label, at the mouse.
    await page.click(MUTE);
    const undoEntry = await menuEntry(page, 'Annuler*');
    check('after muting a track: « Annuler : piste coupée », enabled', undoEntry.enabled && undoEntry.label === 'Annuler : piste coupée', JSON.stringify(undoEntry));
    await menuCommand(page, 'Annuler : piste coupée');
    check('… chosen: the track plays again', (await page.getAttribute(MUTE, 'aria-pressed')) === 'false');
    const redoEntry = await menuEntry(page, 'Rétablir*');
    check('« Rétablir : piste coupée » then', redoEntry.enabled && redoEntry.label === 'Rétablir : piste coupée', JSON.stringify(redoEntry));
    await menuCommand(page, 'Rétablir : piste coupée');
    check('… chosen: muted again', (await page.getAttribute(MUTE, 'aria-pressed')) === 'true');

    // The keyboard: Enter on the logo opens it on its first entry; arrows, Right / Left, the first letter, Enter, Escape.
    // The mouse out of the way (an entry under it would take the focus, as the mouse does).
    await page.mouse.move(900, 600);
    await page.focus('button.marque');
    await page.keyboard.press('Enter');
    check('keyboard: Enter on the logo opens the menu on « Annuler : … »', (await menuOpen(page)) && (await focused(page)).startsWith('Annuler'), await focused(page));
    await page.keyboard.press('ArrowUp');
    check('ArrowUp from the first entry goes round to the last (« Réglages… »)', (await focused(page)) === 'Réglages…', await focused(page));
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    check('ArrowDown: next entries, lines skipped (« Nouveau projet »)', (await focused(page)) === 'Nouveau projet', await focused(page));
    await page.keyboard.press('e');
    check('a letter: the next entry that starts with it (« Enregistrer »)', (await focused(page)) === 'Enregistrer', await focused(page));
    await page.keyboard.press('e');
    await page.keyboard.press('e');
    check('the same letter again: the following ones (« Exporter »)', (await focused(page)) === 'Exporter', await focused(page));
    await page.keyboard.press('ArrowRight');
    check('ArrowRight opens the submenu on its first entry (« Audio… »)', (await focused(page)) === 'Audio…' && (await page.getAttribute('[data-sous-menu="export"]', 'aria-expanded')) === 'true', await focused(page));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    check('… and the next level (« Fichier iReal Pro… »)', (await focused(page)) === 'Fichier iReal Pro…', await focused(page));
    await page.keyboard.press('ArrowLeft');
    check('ArrowLeft closes it, back on « iReal Pro »', (await focused(page)) === 'iReal Pro' && (await page.locator('.sous-menu .sous-menu').count()) === 0, await focused(page));
    await page.keyboard.press('Escape');
    check('Escape in a submenu closes that level only (back on « Exporter »)', (await focused(page)) === 'Exporter' && (await menuOpen(page)), await focused(page));
    await page.keyboard.press('i');
    await page.keyboard.press('Enter');
    check('the letter « i » then Enter: « Imprimer… » runs', (await ui(page)).printOpen && !(await menuOpen(page)));
    await dismiss(page);

    // Shortcuts: Ctrl + P from « Pistes », Ctrl + , ; Ctrl + O; the browser's own never opens.
    await page.locator('.milieu').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+p');
    check('Ctrl + P: the print window, from « Pistes »', (await ui(page)).printOpen);
    await dismiss(page);
    await page.keyboard.press('Control+,');
    check('Ctrl + ,: the settings window', (await ui(page)).settings.open);
    await page.evaluate(() => window.__fabtice.actions.closeSettings());
    await page.keyboard.press('Control+o');
    await sleep(100);
    check('Ctrl + O: the picker of a project file', (await page.evaluate(() => window.__picks)) === 2);

    // Without chords: iReal Pro, PDF and printing are greyed out (the shortcut too).
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ analysis: null, corrections: { ...s.corrections, chords: [] } })));
    const noChords = await page.evaluate(() => window.__fabtice.store.getState().analysis === null);
    await page.keyboard.press('Control+p');
    check('… and Ctrl + P does nothing', !(await ui(page)).printOpen);
    const exp = await menuEntry(page, 'Exporter', 'PDF…');
    const ireal = await menuEntry(page, 'Exporter', 'iReal Pro');
    const print = await menuEntry(page, 'Imprimer…');
    check('without chords: PDF…, iReal Pro, Imprimer… greyed out; Audio… still there', noChords && !exp.enabled && !ireal.enabled && !print.enabled && (await menuEntry(page, 'Exporter', 'Audio…')).enabled, JSON.stringify({ exp, ireal, print }));
    check('no page errors (computer)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ no project
  {
    const { context, page, errors } = await open('?debug&moteur=factice', { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.newPieceOpen, null, { timeout: 15000 });
    // The opening screen stands over the app; behind it, the menu holds what can be done without a project.
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } })));
    await openMenu(page);
    const enabled = await page.locator('#menu-fabtice > .menu-ligne > [role="menuitem"]:not([aria-disabled]) .menu-texte').allInnerTexts();
    check('no project: only Nouveau projet, Ouvrir…, Réglages… can be chosen', enabled.join('|') === 'Nouveau projet|Ouvrir…|Réglages…', enabled.join('|'));
    await closeMenu(page);
    await page.keyboard.press('Control+s');
    check('no project: Ctrl + S does nothing', !(await ui(page)).saveProjectOpen);
    check('no page errors (no project)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ phone, touch
  {
    const { context, page, errors } = await open('?demo&moteur=factice', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    check('phone: no « ⋯ » any more, the logo is the menu', (await page.locator('.menu-plus').count()) === 0 && (await page.locator('button.marque').isVisible()));
    const logo = await page.locator('button.marque').boundingBox();
    check('phone: the logo is a target of at least 40 px', logo.height >= 40, JSON.stringify(logo));
    await openMenu(page);
    await sleep(400);
    const sheet = await page.locator('.feuille-menu').boundingBox();
    check('phone: a sheet over the whole screen', sheet.x === 0 && sheet.y === 0 && sheet.width === 390 && sheet.height === 844, JSON.stringify(sheet));
    const root = await labels(page, '.feuille-menu-liste');
    check('phone: the same entries', root.join('|') === 'Annuler|Rétablir|-|Nouveau projet|Ouvrir…|-|Enregistrer|Enregistrer sous…|Exporter|Imprimer…|-|Réglages…', root.join('|'));
    check('phone: no shortcuts shown', (await page.locator('.feuille-menu .menu-raccourci').count()) === 0);
    const heights = await page.locator('.feuille-menu [role="menuitem"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    check('phone: every entry is at least 40 px high', heights.every((h) => h >= 40), heights.join(','));
    // A submenu: its own list, with « Retour ».
    await page.tap('.feuille-menu [data-sous-menu="export"]');
    check('phone: « Exporter » shows its list, titled, with « Retour »', (await page.locator('.feuille-menu-titre').innerText()) === 'Exporter' && (await labels(page, '.feuille-menu-liste')).join('|') === 'Audio…|iReal Pro|PDF…' && (await page.locator('.feuille-menu-retour').isVisible()));
    await page.tap('.feuille-menu-retour');
    check('phone: « Retour » goes back to the whole menu', (await labels(page, '.feuille-menu-liste'))[0] === 'Annuler');
    await page.tap('.feuille-menu .fermer');
    check('phone: the close button closes the sheet', !(await menuOpen(page)) && (await page.locator('.feuille-menu').count()) === 0);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), menuCommand(page, 'Exporter', 'iReal Pro', 'Fichier iReal Pro…')]);
    check('phone: Exporter ▸ iReal Pro ▸ Fichier iReal Pro… at a touch', download.suggestedFilename() === 'Blues du dimanche.html');
    await menuCommand(page, 'Exporter', 'Audio…');
    check('phone: Exporter ▸ Audio…', (await ui(page)).exportAudioOpen);
    await dismiss(page);
    await menuCommand(page, 'Imprimer…');
    check('phone: Imprimer…', (await ui(page)).printOpen);
    await dismiss(page);
    await menuCommand(page, 'Réglages…');
    check('phone: Réglages…', (await ui(page)).settings.open);
    await page.evaluate(() => window.__fabtice.actions.closeSettings());
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    check('phone: Nouveau projet ▸ À partir d’un fichier audio', (await ui(page)).newPieceOpen && (await ui(page)).newPieceFrom === 'file');
    await dismiss(page);
    await menuCommand(page, 'Ouvrir…');
    await sleep(100);
    check('phone: Ouvrir…', (await page.evaluate(() => window.__picks)) === 1);
    // « Annuler » with its label, at a touch.
    await page.tap(MUTE);
    await openMenu(page);
    const first = (await labels(page, '.feuille-menu-liste'))[0];
    check('phone: « Annuler : piste coupée » first', first === 'Annuler : piste coupée', first);
    await closeMenu(page);
    check('phone: Escape closes the sheet', !(await menuOpen(page)));
    await menuCommand(page, 'Annuler : piste coupée');
    check('phone: chosen, the track plays again', (await page.getAttribute(MUTE, 'aria-pressed')) === 'false');
    // A greyed entry does nothing.
    await openMenu(page);
    await page.tap('.feuille-menu [data-commande="save"]', { force: true });
    check('phone: a greyed entry does nothing', await menuOpen(page));
    await closeMenu(page);
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} catch (e) {
  failed++;
  console.log(`FAIL  unexpected: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
