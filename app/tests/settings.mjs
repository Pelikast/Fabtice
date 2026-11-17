// « Réglages » (C7) in the built interface, in Chromium, in the two forms of the interface:
// 1280 × 800 with the mouse and the keyboard, 390 × 844 by touch.
//   npm run build && npm run test:settings
//
// What it checks: the seven tabs (exact labels, roles, mouse, keyboard, touch), the window that stays whole in
// the viewport and never overflows sideways, every setting that was moved acting as it did before (through the
// store handle `window.__fabtice`, and on screen for a few), the settings kept after a reload, the one-time
// return of the sub-grid to « Noires », « Rétablir les réglages d'origine », the greyed « Pour ce morceau »
// sections without a piece, the small panels that stay where they are and their « Tous les réglages… » link.
// Screenshots of every tab in both forms go to $FABTICE_SETTINGS_OUT (default: a temporary folder), never into
// the repository. Playwright and Chromium are expected preinstalled (PLAYWRIGHT_MODULE_DIR to load elsewhere).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeMenu, menuCommand, menuEntry } from './lib/menu.mjs';
import { closeSettings, openSettings, openSettingsTab, press, SETTINGS_LABELS, SETTINGS_TABS } from './lib/settings.mjs';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_SETTINGS_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-settings-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

/** A page on `query` in a fresh context; `seed` is the localStorage given to the very first load only. */
async function open(query, options, seed = null) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // The settings probe the graphics chip for the separation tool: Chromium here has none (not a fault).
    if (m.type() === 'error' && !/No available adapters/i.test(m.text())) errors.push(m.text());
  });
  if (seed) {
    await page.addInitScript((entries) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  await page.goto(`${url}/${query}`);
  // `?debug` opens no piece: the engine has nothing to get ready for.
  if (query.startsWith('?debug')) await page.waitForFunction(() => window.__fabtice, null, { timeout: 20000 });
  else await ready(page);
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}
const ready = (page) => page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 20000 });
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fabtice.preferences.v1') ?? '{}'));
const DEMO = '?demo&moteur=factice';

/** What is wrong with the window right now: not whole in the viewport, or wider than the page. */
const overflow = (page) =>
  page.evaluate(() => {
    const win = document.querySelector('[data-testid="reglages"]');
    const body = document.querySelector('[data-testid="reglages-panneau"]') ?? win;
    const r = win.getBoundingClientRect();
    const wide = [...body.querySelectorAll('*')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5);
    });
    return {
      inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5,
      page: document.documentElement.scrollWidth <= Math.max(innerWidth, window.__baseWidth ?? 0),
      body: body.scrollWidth <= body.clientWidth + 1,
      wide: wide.slice(0, 3).map((el) => `${el.tagName}.${el.className}`),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });

const tabLabels = (page) => page.locator('[data-testid="reglages"] [role="tab"]').allInnerTexts();

try {
  // ============================================================ computer: 1280 × 800, mouse and keyboard
  {
    const { context, page, errors } = await open(DEMO, DESKTOP);

    await openSettings(page);
    const box = page.locator('[data-testid="reglages"]');
    check('computer: « Réglages » opens a window titled « Réglages »', (await box.getAttribute('role')) === 'dialog' && (await page.locator('#reglages-titre').innerText()) === 'Réglages');
    check('computer: modal, the page behind it inert', (await box.getAttribute('aria-modal')) === 'true' && (await page.locator('.app').evaluate((el) => el.hasAttribute('inert'))));
    check('computer: the seven tabs, in order, with their exact names', JSON.stringify(await tabLabels(page)) === JSON.stringify(SETTINGS_TABS.map((t) => SETTINGS_LABELS[t])), (await tabLabels(page)).join(' | '));
    check('computer: roles tablist / tab / tabpanel', (await page.locator('[data-testid="reglages"] [role="tablist"]').count()) === 1 && (await page.locator('[data-testid="reglages"] [role="tab"]').count()) === 7 && (await page.locator('[data-testid="reglages"] [role="tabpanel"]').count()) === 1);
    check('computer: it opens on « Général » and the focus is on the tab', (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').innerText()) === 'Général' && (await page.evaluate(() => document.activeElement?.getAttribute('data-tab'))) === 'general');
    const sizes = [];
    for (const tab of SETTINGS_TABS) {
      await openSettingsTab(page, tab);
      await sleep(350);
      const o = await overflow(page);
      sizes.push(`${o.w}x${o.h}`);
      check(`computer: tab « ${SETTINGS_LABELS[tab]} » is selected, whole in the window, nothing overflows`, (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').getAttribute('data-tab')) === tab && o.inside && o.page && o.body && o.wide.length === 0, JSON.stringify(o));
      await page.screenshot({ path: path.join(out, `ordi-${tab}.png`) });
    }
    check('computer: the window has the same size from one tab to the next, 760 to 820 px wide', new Set(sizes).size === 1 && Number(sizes[0].split('x')[0]) >= 760 && Number(sizes[0].split('x')[0]) <= 820, sizes.join(' '));
    check('computer: the active tab is underlined in ink, no ember anywhere in the window', await page.evaluate(() => {
      const ember = 'rgb(196, 80, 42)';
      const tab = document.querySelector('[data-testid="reglages"] [role="tab"][aria-selected="true"]');
      const after = getComputedStyle(tab, '::after');
      return after.backgroundColor === 'rgb(43, 31, 23)' && ![...document.querySelectorAll('[data-testid="reglages"], [data-testid="reglages"] *')].some((el) => {
        const cs = getComputedStyle(el);
        return [cs.color, cs.backgroundColor, cs.borderTopColor, cs.textDecorationColor].includes(ember) && !el.matches('.lien');
      });
    }));

    // The tab last seen is kept while the app stays open.
    await openSettingsTab(page, 'metronome');
    await page.keyboard.press('Escape');
    check('computer: Escape closes the window', (await page.locator('[data-testid="reglages"]').count()) === 0);
    await openSettings(page);
    check('computer: reopened on the tab last seen', (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').getAttribute('data-tab')) === 'metronome');

    // The keyboard: arrows change tab, the focus stays in the window, Space does not start the playback.
    await page.focus('[data-testid="reglages"] [role="tab"][aria-selected="true"]');
    await page.keyboard.press('ArrowRight');
    await sleep(100);
    check('computer: ArrowRight goes to the next tab and focuses it', (await state(page)).ui.settings.tab === 'display' && (await page.evaluate(() => document.activeElement?.getAttribute('data-tab'))) === 'display');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await sleep(100);
    check('computer: ArrowRight after the last tab goes back to the first', (await state(page)).ui.settings.tab === 'general');
    await page.keyboard.press('ArrowLeft');
    await sleep(100);
    check('computer: ArrowLeft before the first goes to the last', (await state(page)).ui.settings.tab === 'advanced');
    await page.keyboard.press('Home');
    await sleep(100);
    check('computer: Home and End', (await state(page)).ui.settings.tab === 'general');
    await page.keyboard.press('End');
    await sleep(100);
    check('computer: End goes to the last', (await state(page)).ui.settings.tab === 'advanced');
    const playingBefore = (await state(page)).transport.engine;
    await page.keyboard.press('Space');
    await sleep(150);
    check('computer: Space does not start the playback behind the window', (await state(page)).transport.engine === playingBefore);
    let stray = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => document.querySelector('[data-testid="reglages"]').contains(document.activeElement)))) stray++;
    }
    check('computer: Tab and Maj + Tab keep the focus inside the window', stray === 0, `${stray} presses left it`);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      if (!(await page.evaluate(() => document.querySelector('[data-testid="reglages"]').contains(document.activeElement)))) stray++;
    }
    check('computer: Maj + Tab too', stray === 0);
    await page.keyboard.press('Escape');
    check('computer: the focus goes back to the logo (the menu) when the window closes', await page.evaluate(() => document.activeElement?.classList.contains('marque')), await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));

    // A click on the veil (outside the window) closes it; the cross too.
    await openSettings(page);
    await page.mouse.click(10, 10);
    check('computer: a click outside the window closes it', (await page.locator('[data-testid="reglages"]').count()) === 0);
    await openSettings(page);
    await closeSettings(page);
    check('computer: the cross closes it', (await page.locator('[data-testid="reglages"]').count()) === 0);

    // The ways in: the menu (above), the shortcut, and the menu still working once the window is closed.
    await openSettings(page);
    await page.keyboard.press('Escape');
    await page.focus('body');
    await page.keyboard.press('ControlOrMeta+,');
    await page.waitForSelector('[data-testid="reglages"]', { timeout: 3000 }).catch(() => {});
    check('computer: Ctrl + , opens the window', (await page.locator('[data-testid="reglages"]').count()) === 1);
    await page.keyboard.press('ControlOrMeta+,');
    check('computer: Ctrl + , again does not stack a second window', (await page.locator('[data-testid="reglages"]').count()) === 1);
    await page.keyboard.press('Escape');
    check('computer: and Escape closes it', (await page.locator('[data-testid="reglages"]').count()) === 0);
    const entry = await menuEntry(page, 'Réglages…');
    check('computer: the menu is still usable after Réglages is closed (« Réglages… » is offered again)', entry.enabled && (await page.locator('.app').evaluate((el) => !el.hasAttribute('inert'))), JSON.stringify(entry));
    await closeMenu(page);

    // ---------------------------------------------------- Général
    await openSettingsTab(page, 'general');
    const general = await page.locator('[data-testid="reglages-panneau"]').innerText();
    check('general: « À l\'ouverture » with both choices, « Reprendre le dernier projet » chosen', general.includes('À l’ouverture') && (await page.locator('[data-testid="ouverture-lastProject"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-testid="ouverture-newProject"]').innerText()) === 'Ouvrir la fenêtre « Nouveau projet »');
    await page.click('[data-testid="ouverture-newProject"]');
    check('general: choosing the « Nouveau projet » window is stored and kept on the device', (await state(page)).settings.atLaunch === 'newProject' && (await saved(page)).atLaunch === 'newProject');
    const shortcuts = await page.locator('[data-testid="raccourcis"] li').evaluateAll((els) => els.map((el) => `${el.querySelector('span').textContent}=${el.querySelector('kbd').textContent}`));
    check('general: the list of shortcuts, read from the table of commands (Ctrl here, not a Mac)', shortcuts.join(' | ') === 'Lecture, pause=Espace | Annuler=Ctrl + Z | Rétablir=Maj + Ctrl + Z | Ouvrir…=Ctrl + O | Enregistrer=Ctrl + S | Enregistrer sous…=Maj + Ctrl + S | Imprimer…=Ctrl + P | Réglages…=Ctrl + ,', shortcuts.join(' | '));
    check('general: the section of the app only (no piece is needed)', (await page.locator('[data-testid="reglages-panneau"] [data-scope="piece"]').count()) === 0);

    // ---------------------------------------------------- Affichage
    await openSettingsTab(page, 'display');
    const before = await state(page);
    check('display: defaults — follow on, « m », « Auto » on, concert pitch', before.view.follow && before.settings.minorNotation === 'm' && before.view.auto && before.view.instrument === 'ut');
    await page.click('[data-testid="reglage-suivre"]');
    await page.click('[data-testid="reglages-panneau"] .duo button:has-text("C–7")');
    await page.click('[data-testid="reglage-auto"]');
    await page.click('[data-testid="reglages-panneau"] .duo.instrument button:has-text("Si♭")');
    let st = await state(page);
    check('display: follow, minor notation, « Auto » and the instrument act on the store', !st.view.follow && st.settings.minorNotation === '–' && !st.view.auto && st.view.instrument === 'sib');
    const prefs = await saved(page);
    check('display: follow and minor notation are kept on the device', prefs.follow === false && prefs.minorNotation === '–');
    await page.click('[data-testid="reglages-panneau"] .duo.instrument button:has-text("Ut")');
    await page.click('[data-testid="reglage-auto"]');
    await page.click('[data-testid="reglage-suivre"]');
    await page.click('[data-testid="reglages-panneau"] .duo button:has-text("Cm7")');
    st = await state(page);
    check('display: and back', st.view.follow && st.settings.minorNotation === 'm' && st.view.auto && st.view.instrument === 'ut');

    // ---------------------------------------------------- Tempo et analyse
    await openSettingsTab(page, 'tempo');
    check('tempo: « Analyser dès l\'import » is on by default and acts on the store, kept on the device', (await state(page)).settings.analyseOnImport === true);
    await page.click('[data-testid="analyser-des-import"]');
    check('tempo: unticked', (await state(page)).settings.analyseOnImport === false && (await saved(page)).analyseOnImport === false);
    await page.click('[data-testid="analyser-des-import"]');
    const sub = await page.locator('#reglage-sous-grille-liste option').allInnerTexts();
    check('tempo: the sub-grid list — blanches, noires, croches, doubles-croches, triples-croches', sub.join(',') === 'Blanches,Noires,Croches,Doubles-croches,Triples-croches', sub.join(','));
    check('tempo: « Noires » by default', (await state(page)).view.subdivision === 1 && (await page.locator('#reglage-sous-grille-liste').inputValue()) === '1');
    await page.selectOption('#reglage-sous-grille-liste', '0.5');
    await page.click('[data-testid="reglage-triolets"]');
    await page.click('[data-testid="reglage-magnetisme"]');
    st = await state(page);
    check('tempo: « Blanches », « Triolets » and the magnet act on the store', st.view.subdivision === 0.5 && st.view.triplets === true && st.view.snap === false);
    const p2 = await saved(page);
    check('tempo: and are kept on the device', p2.subdivision === 0.5 && p2.triplets === true && p2.snap === false);
    await page.screenshot({ path: path.join(out, 'ordi-tempo-blanches.png') });
    // Beats per bar, tempo × 2 and ÷ 2, first beat: the same actions as the panel « Tempo et mesures ».
    const meter0 = (await state(page)).tempoMap.meters[0].meter.numerator;
    await page.click('[data-testid="reglages-panneau"] .temps-mesure button:has-text("3")');
    check('tempo: « Temps par mesure » changes the grid', (await state(page)).tempoMap.meters[0].meter.numerator === 3 && meter0 !== 3, `${meter0} -> 3`);
    await page.click('[data-testid="reglages-panneau"] .temps-mesure button:has-text("4")');
    check('tempo: the origin of the grid is told', (await page.locator('[data-testid="grille-origine"]').innerText()).includes('corrigée à la main'), await page.locator('[data-testid="grille-origine"]').innerText());
    const gridJson = () => page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().tempoMap));
    const g0 = await gridJson();
    await page.evaluate(() => window.__fabtice.actions.seek(1.234));
    await page.click('[data-testid="reglages-panneau"] button:has-text("Premier temps ici")');
    check('tempo: « Premier temps ici » moves the first beat to the playhead', (await gridJson()) !== g0);
    await page.screenshot({ path: path.join(out, 'ordi-tempo-bas.png') });
    const fix = page.locator('[data-testid="reglages-panneau"] .corrige button');
    check('tempo: « ÷ 2 » and « × 2 » are there, as in the panel', (await fix.count()) === 2 && (await fix.first().innerText()) === '÷ 2' && (await fix.last().innerText()) === '× 2');
    if (await fix.last().isEnabled()) {
      const g1 = await gridJson();
      await fix.last().click();
      check('tempo: « × 2 » changes the grid', (await gridJson()) !== g1);
    }
    await page.click('[data-testid="reglages-panneau"] button:has-text("Revenir à l’analyse")');
    check('tempo: « Revenir à l\'analyse » brings the grid of the analysis back', (await state(page)).tempoMap.origin === 'analysis');
    await page.click('[data-testid="analyser-maintenant"]');
    await page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status !== 'idle' || window.__fabtice.store.getState().analysis !== null, null, { timeout: 10000 });
    check('tempo: « Analyser ce morceau » starts an analysis by hand', true);
    await page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status === 'idle', null, { timeout: 60000 }).catch(() => {});

    // ---------------------------------------------------- Détection des accords
    await openSettingsTab(page, 'chords');
    const chordText = await page.locator('[data-testid="reglages-panneau"]').innerText();
    check('chords: the model « Rapide » or « Détaillé », with its source and weight', chordText.includes('Rapide : CREMA') && chordText.includes('Détaillé : Tsumugi-Chords') && /licence/i.test(chordText));
    // Owner's decision of 17 November 2026: « Automatique (recommandé) » first and by default; on a test address it gives the standard model.
    check('chords: « Automatique (recommandé) » is the first entry, chosen, nothing stored', (await page.locator('[data-testid="modele-accords"] option').first().innerText()) === 'Automatique (recommandé)' && (await page.locator('[data-testid="modele-accords"]').inputValue()) === 'auto' && (await page.evaluate(() => localStorage.getItem('fabtice.chordModel.v1'))) === null);
    check('chords: its note says which model it gives on this device (the standard one on a test address)', (await page.locator('[data-testid="modele-accords-auto"]').innerText()).startsWith('Sur cet appareil : modèle rapide'), await page.locator('[data-testid="modele-accords-auto"]').innerText());
    await page.selectOption('[data-testid="modele-accords"]', 'fine');
    check('chords: an explicit choice hides the note', (await page.locator('[data-testid="modele-accords-auto"]').count()) === 0);
    check('chords: the detailed model states its cost, kept on the device', (await page.locator('[data-testid="modele-accords-cout"]').innerText()).includes('plusieurs minutes') && (await page.evaluate(() => localStorage.getItem('fabtice.chordModel.v1'))) === 'fine');
    check('chords: the detection can be run again for the open piece', await page.locator('[data-testid="modele-accords-relancer"]').isEnabled());
    check('chords: « S\'appuyer sur les grilles connues » is on, acts on the store, kept', (await state(page)).settings.useKnownCharts === true);
    await page.click('[data-testid="grilles-connues"]');
    check('chords: unticked', (await state(page)).settings.useKnownCharts === false && (await saved(page)).useKnownCharts === false);
    await page.click('[data-testid="grilles-connues"]');
    // Stage 5: the modulations and the structure, on by default, kept on the device; the mode of the open piece.
    check('chords: « Détecter les modulations » and « Structure automatique du morceau » are there, ticked', chordText.includes('Détecter les modulations') && chordText.includes('Structure automatique du morceau') && (await page.locator('[data-testid="detecter-modulations"]').isChecked()) && (await page.locator('[data-testid="structure-automatique"]').isChecked()));
    await page.click('[data-testid="detecter-modulations"]');
    await page.click('[data-testid="structure-automatique"]');
    st = await state(page);
    check('chords: unticked, in the store and on the device', st.settings.detectModulations === false && st.settings.autoStructure === false && (await saved(page)).detectModulations === false && (await saved(page)).autoStructure === false);
    await page.click('[data-testid="detecter-modulations"]');
    await page.click('[data-testid="structure-automatique"]');
    check('chords: « Mode » (Auto, Jazz, Pop) for the open piece, the same value as the column\'s', chordText.includes('Mode') && (await page.locator('[data-testid="mode-structure-auto"]').getAttribute('aria-checked')) === 'true');
    await page.click('[data-testid="mode-structure-pop"]');
    check('chords: « Pop » chosen, in the piece\'s corrections', (await state(page)).corrections.structure.mode === 'pop' && (await page.locator('[data-testid="mode-structure-pop"]').getAttribute('aria-checked')) === 'true');
    await page.click('[data-testid="mode-structure-auto"]');
    await page.selectOption('[data-testid="modele-accords"]', 'crema');

    // ---------------------------------------------------- Métronome (and the small panel)
    await openSettingsTab(page, 'metronome');
    await page.locator('[data-testid="clic-volume"]').fill('30');
    await page.click('[data-testid="decompte"] button:has-text("1 mesure")');
    st = await state(page);
    check('metronome: volume and count-in act on the store', Math.abs(st.metronome.volume - 0.3) < 0.011 && st.metronome.countInBars === 1, JSON.stringify([st.metronome.volume, st.metronome.countInBars]));
    await page.click('[data-testid="temps-forts"]');
    check('metronome: the strong and weak beats unfold', (await page.locator('[data-testid="temps-rangee"] button').count()) === 4);
    await page.click('[data-testid="acceleration"]');
    await page.click('[data-testid="acceleration-active"]');
    check('metronome: the progressive acceleration switches on', (await state(page)).metronome.acceleration.enabled === true);
    await page.click('[data-testid="acceleration-active"]');
    await page.screenshot({ path: path.join(out, 'ordi-metronome-ouvert.png') });
    await page.keyboard.press('Escape');
    await page.click('[data-testid="clic-reglages"]');
    const panelVolume = await page.locator('[data-testid="panneau-metronome"] [data-testid="clic-volume"]').inputValue();
    check('metronome: the small panel of the transport shows the same state and is still there', panelVolume === '30' && (await page.locator('[data-testid="panneau-metronome"] [data-testid="decompte"] button[aria-pressed="true"]').innerText()) === '1 mesure');
    await page.locator('[data-testid="panneau-metronome"] [data-testid="clic-volume"]').fill('60');
    await page.click('[data-testid="tous-reglages-metronome"]');
    check('metronome: « Tous les réglages… » opens the Métronome tab', (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').getAttribute('data-tab')) === 'metronome' && (await page.locator('[data-testid="panneau-metronome"]').count()) === 0);
    check('metronome: and the tab shows what the panel just changed', (await page.locator('[data-testid="reglages-panneau"] [data-testid="clic-volume"]').inputValue()) === '60');
    await page.click('[data-testid="decompte"] button:has-text("Aucun")');
    await page.keyboard.press('Escape');

    // ---------------------------------------------------- the panels « Tempo et mesures » and the tuning
    await page.click('.rang-tete.tempo');
    check('panels: « Tempo et mesures » still opens from the ruler, with its tempo entry and its tap tempo', (await page.locator('.panneau-grille').count()) === 1 && (await page.locator('.panneau-grille input[type="text"]').count()) === 1);
    await page.click('[data-testid="tous-reglages-tempo"]');
    check('panels: its link opens « Tempo et analyse »', (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').getAttribute('data-tab')) === 'tempo' && (await page.locator('.panneau-grille').count()) === 0);
    await page.keyboard.press('Escape');
    await page.click('.valeur[aria-haspopup="dialog"]');
    check('panels: the tuning panel still opens from the Tonalité box', (await page.locator('.panneau-accord').count()) === 1);
    await page.click('[data-testid="tous-reglages-accordage"]');
    check('panels: its link opens « Tempo et analyse »', (await page.locator('[data-testid="reglages"] [role="tab"][aria-selected="true"]').getAttribute('data-tab')) === 'tempo');
    await page.keyboard.press('Escape');
    await page.click('.sous-grille select');
    await page.keyboard.press('Escape');
    check('panels: the sub-grid of the transport is still there, with « Blanches » in its list', (await page.locator('.sous-grille select option').allInnerTexts()).join(',') === 'Blanches,Noires,Croches,Doubles-croches,Triples-croches');
    await page.selectOption('.sous-grille select', '2');
    check('panels: the transport\'s list and the tab are the same setting', (await state(page)).view.subdivision === 2);
    await openSettingsTab(page, 'tempo');
    check('panels: the tab follows', (await page.locator('#reglage-sous-grille-liste').inputValue()) === '2');
    await page.keyboard.press('Escape');

    // ---------------------------------------------------- Instruments
    await openSettingsTab(page, 'instruments');
    const tools = await page.locator('[data-testid="outil-separation"] option').allInnerTexts();
    check('instruments: the separation tool, automatic or one of the list, with its cost and licence', tools.length >= 2 && /Automatique/.test(tools[0]) && (await page.locator('[data-testid="outil-cout"]').innerText()).includes('Licence des poids'), tools.join(' | '));
    await page.selectOption('[data-testid="outil-separation"]', 'scnet');
    check('instruments: choosing another tool acts on the store, kept on the device', (await state(page)).settings.advanced.separationModel === 'scnet' && (await saved(page)).separationModel === 'scnet');
    check('instruments: the cost of that tool is shown', (await page.locator('[data-testid="outil-cout"]').innerText()).includes('téléchargé une fois depuis'));
    await page.click('[data-separation-entry]');
    check('instruments: the way into the separation panel (the window gives way)', (await page.locator('[data-testid="panneau-separation"]').count()) === 1 && (await page.locator('[data-testid="reglages"]').count()) === 0);
    await page.keyboard.press('Escape');
    await page.selectOption('[data-testid="outil-separation"]', 'auto').catch(() => {});

    // ---------------------------------------------------- Avancé
    await openSettingsTab(page, 'advanced');
    await page.check('[data-testid="formants"]');
    check('advanced: « Conserver le timbre » acts on the store, kept on the device', (await state(page)).settings.advanced.formants === true && (await saved(page)).formants === true);
    await page.waitForSelector('[data-testid="place-appareil"]');
    check('advanced: the room taken on the device, the entry of the collections, the audio journal (web app)', (await page.locator('[data-testid="standards-section"]').count()) === 1 && (await page.locator('[data-testid="journal-audio"]').count()) === 1);
    // Reset: a confirmation first; « Annuler » changes nothing.
    await page.click('[data-testid="reinitialiser-demande"]');
    check('advanced: « Rétablir les réglages d\'origine » asks first', (await page.locator('[data-testid="reinitialiser"]').innerText()).includes('Remettre tous les réglages de cet appareil à leur valeur d’origine ?'));
    await page.click('[data-testid="reinitialiser-non"]');
    check('advanced: « Annuler » changes nothing', (await state(page)).settings.advanced.formants === true && (await state(page)).settings.advanced.separationModel === 'scnet');
    const projectId = (await state(page)).project.id;
    const playback = JSON.stringify((await state(page)).playback);
    await page.click('[data-testid="reinitialiser-demande"]');
    await page.click('[data-testid="reinitialiser-oui"]');
    st = await state(page);
    check('advanced: « Rétablir » puts every preference back (tool, timbre, sub-grid, magnet, follow, minor notation, launch, analysis, charts, chord model)',
      st.settings.advanced.separationModel === 'auto' && st.settings.advanced.formants === false && st.view.subdivision === 1 && st.view.triplets === false && st.view.snap === true && st.view.follow === true && st.settings.minorNotation === 'm' && st.settings.atLaunch === 'lastProject' && st.settings.analyseOnImport === true && st.settings.useKnownCharts === true,
      JSON.stringify([st.settings, st.view.subdivision, st.view.triplets, st.view.snap]));
    check('advanced: and the chord model goes back to « Automatique » (nothing stored)', (await page.evaluate(() => localStorage.getItem('fabtice.chordModel.v1'))) === null);
    const p3 = await saved(page);
    check('advanced: and what is kept on the device is the default', p3.separationModel === 'auto' && p3.subdivision === 1 && p3.atLaunch === 'lastProject' && p3.formants === false);
    check('advanced: the piece and its settings are not touched', st.project.id === projectId && JSON.stringify(st.playback) === playback);
    check('advanced: it says so', (await page.locator('[data-testid="reinitialise"]').count()) === 1 || (await page.locator('[data-testid="reinitialiser"]').innerText()).includes('rétablis'));
    await page.screenshot({ path: path.join(out, 'ordi-avance-apres-reinitialisation.png') });
    check('computer: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============================================================ the window fits smaller computer windows too
  for (const [w, h] of [[1280, 656], [1024, 700], [960, 640], [800, 600]]) {
    const { context, page, errors } = await open(DEMO, { viewport: { width: w, height: h } });
    // The page itself may be wider than a small window (the top bar); the settings must not make it wider.
    await page.evaluate(() => (window.__baseWidth = document.documentElement.scrollWidth));
    let ok = true;
    let why = '';
    for (const tab of SETTINGS_TABS) {
      await openSettingsTab(page, tab);
      await sleep(300);
      const o = await overflow(page);
      if (!(o.inside && o.page && o.body && o.wide.length === 0)) {
        ok = false;
        why += `${tab}: ${JSON.stringify(o)} `;
      }
    }
    check(`${w} × ${h}: every tab whole in the viewport, nothing overflowing`, ok, why);
    if (w === 1280) await page.screenshot({ path: path.join(out, 'ordi-1280x656-avance.png') });
    check(`${w} × ${h}: no page error`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============================================================ kept after a reload, and the sub-grid back to « Noires » once
  {
    // A device that had saved a sub-grid before this version: it goes back to « Noires », once.
    const { context, page, errors } = await open(DEMO, DESKTOP, { 'fabtice.preferences.v1': JSON.stringify({ subdivision: 4, triplets: true, follow: false, minorNotation: '–' }) });
    let st = await state(page);
    check('reload: a sub-grid saved before goes back to « Noires » (once)', st.view.subdivision === 1, String(st.view.subdivision));
    check('reload: the other saved preferences are kept (triplets, follow, minor notation)', st.view.triplets === true && st.view.follow === false && st.settings.minorNotation === '–');
    check('reload: the marker of the return is written', (await saved(page)).subdivisionVersion === 2);
    await openSettingsTab(page, 'tempo');
    await page.selectOption('#reglage-sous-grille-liste', '4');
    await page.click('[data-testid="analyser-des-import"]');
    await openSettingsTab(page, 'general');
    await page.click('[data-testid="ouverture-newProject"]');
    await openSettingsTab(page, 'chords');
    await page.click('[data-testid="grilles-connues"]');
    await page.keyboard.press('Escape');
    await page.reload();
    await ready(page);
    st = await state(page);
    check('reload: the sub-grid chosen now is kept (not sent back again)', st.view.subdivision === 4, String(st.view.subdivision));
    check('reload: analysis at once, launch and known charts are kept', st.settings.analyseOnImport === false && st.settings.atLaunch === 'newProject' && st.settings.useKnownCharts === false);
    await openSettingsTab(page, 'tempo');
    check('reload: the tab shows them', (await page.locator('#reglage-sous-grille-liste').inputValue()) === '4' && !(await page.locator('[data-testid="analyser-des-import"]').isChecked()));
    await openSettingsTab(page, 'general');
    check('reload: and so does « À l\'ouverture »', (await page.locator('[data-testid="ouverture-newProject"]').getAttribute('aria-checked')) === 'true');
    check('reload: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============================================================ without a piece: « Pour ce morceau » is greyed, with a sentence
  {
    const { context, page, errors } = await open('?debug', DESKTOP);
    await page.evaluate(() => window.__fabtice.actions.openSettings('tempo'));
    await page.waitForSelector('[data-testid="reglages-panneau"][data-onglet="tempo"]');
    const grey = await page.evaluate(() => {
      const sec = document.querySelector('[data-scope="piece"]');
      return { sentence: document.querySelector('[data-testid="reglages-sans-morceau"]')?.textContent, inert: sec?.querySelector('.reglages-section-corps')?.hasAttribute('inert'), faded: Number(getComputedStyle(sec.querySelector('.reglages-section-corps')).opacity) < 0.6, app: !document.querySelector('[data-scope="app"]')?.hasAttribute('data-grise') };
    });
    check('no piece: the « Pour ce morceau » section is greyed and out of reach, with its sentence; « Pour l\'app » stays usable', grey.sentence === 'Ouvrez un morceau pour régler cette partie.' && grey.inert && grey.faded && grey.app, JSON.stringify(grey));
    await page.screenshot({ path: path.join(out, 'ordi-sans-morceau-tempo.png') });
    for (const tab of ['instruments', 'chords', 'metronome', 'display']) {
      await page.evaluate((t) => window.__fabtice.actions.setSettingsTab(t), tab);
      await sleep(150);
      check(`no piece: ${tab} shows the greyed section`, (await page.locator('[data-scope="piece"][data-grise]').count()) === 1);
    }
    check('no piece: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============================================================ phone: 390 × 844, by touch
  {
    const { context, page, errors } = await open(DEMO, PHONE);
    await menuCommand(page, 'Réglages…');
    await page.waitForSelector('[data-testid="reglages"]');
    await sleep(350);
    check('phone: a full-screen sheet, the list of the seven first', (await page.locator('[data-testid="reglages"]').getAttribute('data-vue')) === 'liste' && (await page.locator('[data-testid="reglages"]').getAttribute('data-forme')) === 'mobile');
    const rows = await page.locator('.reglages-ligne').evaluateAll((els) => els.map((el) => ({ text: el.innerText.replace(/\s*›\s*$/, '').trim(), h: Math.round(el.getBoundingClientRect().height) })));
    check('phone: the seven tabs in order, with their exact names', rows.map((r) => r.text).join(' | ') === SETTINGS_TABS.map((t) => SETTINGS_LABELS[t]).join(' | '), rows.map((r) => r.text).join(' | '));
    check('phone: each row is at least 44 px high', rows.every((r) => r.h >= 44), rows.map((r) => r.h).join(','));
    const sheet = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="reglages"]').getBoundingClientRect();
      return { full: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight, page: document.documentElement.scrollWidth <= innerWidth };
    });
    check('phone: the sheet fills the screen, the page does not scroll sideways', sheet.full && sheet.page, JSON.stringify(sheet));
    await page.screenshot({ path: path.join(out, 'mobile-liste.png') });
    for (const tab of SETTINGS_TABS) {
      await openSettingsTab(page, tab);
      await sleep(350);
      const o = await overflow(page);
      const title = await page.locator('#reglages-titre').innerText();
      check(`phone: touching « ${SETTINGS_LABELS[tab]} » opens it, with a button to go back, nothing overflows`, title === SETTINGS_LABELS[tab] && (await page.locator('[data-testid="reglages-retour"]').count()) === 1 && o.page && o.body && o.wide.length === 0, JSON.stringify(o));
      await page.screenshot({ path: path.join(out, `mobile-${tab}.png`) });
      // The controls are usable by thumb: every visible button, box and list is at least 40 px high.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="reglages-panneau"] button, [data-testid="reglages-panneau"] select, [data-testid="reglages-panneau"] label.option, [data-testid="reglages-panneau"] input[type="range"]')]
          .filter((el) => el.getBoundingClientRect().height > 0 && !el.closest('[inert]') && !el.matches('.lien, .lien *'))
          .filter((el) => el.getBoundingClientRect().height < 39.5)
          .map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().height)}`),
      );
      check(`phone: « ${SETTINGS_LABELS[tab]} » has no touch target under 40 px`, small.length === 0, small.slice(0, 4).join(' '));
    }
    await press(page, '[data-testid="reglages-retour"]');
    check('phone: the back button leads to the list', (await page.locator('[data-testid="reglages"]').getAttribute('data-vue')) === 'liste');
    // A few settings by touch.
    await openSettingsTab(page, 'display');
    await page.tap('[data-testid="reglage-suivre"]');
    await page.tap('[data-testid="reglages-panneau"] .duo button:has-text("C–7")');
    let st = await state(page);
    check('phone: follow and minor notation by touch', st.view.follow === false && st.settings.minorNotation === '–');
    await openSettingsTab(page, 'tempo');
    await page.selectOption('#reglage-sous-grille-liste', '0.5');
    await page.tap('[data-testid="reglage-triolets"]');
    await page.tap('[data-testid="reglage-magnetisme"]');
    st = await state(page);
    check('phone: the sub-grid (« Blanches »), « Triolets » and the magnet by touch', st.view.subdivision === 0.5 && st.view.triplets && !st.view.snap);
    await openSettingsTab(page, 'general');
    await page.tap('[data-testid="ouverture-newProject"]');
    check('phone: « À l\'ouverture » by touch, no list of shortcuts on a phone', (await state(page)).settings.atLaunch === 'newProject' && (await page.locator('[data-testid="raccourcis"]').count()) === 0);
    await openSettingsTab(page, 'metronome');
    await page.tap('[data-testid="decompte"] button:has-text("2 mesures")');
    check('phone: the count-in by touch', (await state(page)).metronome.countInBars === 2);
    // The chord model on a phone: « Automatique » gives the standard model.
    await openSettingsTab(page, 'chords');
    check('phone: the chord model is « Automatique », its note says the standard model', (await page.locator('[data-testid="modele-accords"]').inputValue()) === 'auto' && (await page.locator('[data-testid="modele-accords-auto"]').innerText()).startsWith('Sur cet appareil : modèle rapide'));
    // The way into the separation, from the Instruments tab.
    await openSettingsTab(page, 'instruments');
    await page.tap('[data-separation-entry]');
    check('phone: the separation is reached from the Instruments tab', (await page.locator('[data-testid="panneau-separation"]').count()) === 1 && (await page.locator('[data-testid="reglages"]').count()) === 0);
    await page.evaluate(() => window.__fabtice.actions.closePanel());
    // Advanced: reset by touch.
    await openSettingsTab(page, 'advanced');
    await page.tap('[data-testid="reinitialiser-demande"]');
    await page.screenshot({ path: path.join(out, 'mobile-avance-confirmation.png') });
    await page.tap('[data-testid="reinitialiser-oui"]');
    st = await state(page);
    check('phone: « Rétablir les réglages d\'origine » by touch', st.view.subdivision === 1 && st.view.snap && st.view.follow && st.settings.minorNotation === 'm' && st.settings.atLaunch === 'lastProject');
    await closeSettings(page);
    const phoneEntry = await menuEntry(page, 'Réglages…');
    check('phone: the menu is still usable after Réglages is closed', phoneEntry.enabled, JSON.stringify(phoneEntry));
    await menuCommand(page, 'Réglages…');
    check('phone: the menu opens Réglages on the list of the tabs', (await page.locator('[data-testid="reglages"]').getAttribute('data-vue')) === 'liste');
    await closeSettings(page);
    // A « Tous les réglages… » link goes straight to the tab.
    await page.tap('[data-testid="clic-reglages"]');
    await page.tap('[data-testid="tous-reglages-metronome"]');
    await page.waitForSelector('[data-testid="reglages"]');
    check('phone: the link of the metronome panel goes straight to the Métronome tab', (await page.locator('[data-testid="reglages"]').getAttribute('data-vue')) === 'onglet' && (await page.locator('#reglages-titre').innerText()) === 'Métronome');
    await press(page, '[data-testid="reglages-retour"]');
    check('phone: and back leads to the list', (await page.locator('[data-testid="reglages"]').getAttribute('data-vue')) === 'liste');
    await page.keyboard.press('Escape');
    check('phone: Escape closes the sheet', (await page.locator('[data-testid="reglages"]').count()) === 0);
    check('phone: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  console.log(`(screenshots in ${out})`);
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
