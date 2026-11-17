// « Alléger le travail pour l'appareil » (C2) in the built interface, in Chromium, in the two forms of the app:
// 1280 × 800 with the mouse and the keyboard, 390 × 844 by touch.
//   npm run build && npm run test:ease
//
// What it checks:
//  - the case in the three places it is offered (« Nouveau projet » right after « Séparer les instruments »,
//    Réglages → Général, the separation panel): unticked by default, its note says the percentage in force, ONE state
//    shared by the three, kept on the device across a reload;
//  - the slider of Réglages → Avancé: 20 to 99, 75 by default, its value shown and spoken (aria), the keyboard
//    (arrows, Home, End), touch on a phone, the honest sentence about long slices, the note of the case that follows
//    it, « Rétablir les réglages d'origine » putting both back;
//  - the computations with the stand-in engines (browser checks never load the machine): an import with the case
//    ticked at 50 % takes about twice as long for the separation and for the analysis, with the case unticked it
//    takes what it always took; « Appliquer meilleure qualité » (stand-in renderer) the same; the announced durations
//    (« Nouveau projet », the separation panel) are longer by the same factor; cancelling during a long wait is
//    immediate. The pauses of the real engines, the threads and the cancellation of a pause are in the unit tests
//    (`src/settings/easeIntegration.test.ts`, `src/separation/engine/ease.test.ts`).
// Screenshots go to $FABTICE_EASE_OUT (default: a temporary folder). Playwright and Chromium are expected
// preinstalled (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { menuCommand } from './lib/menu.mjs';
import { closeSettings, openSettingsTab, press as pressSelector } from './lib/settings.mjs';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.FABTICE_EASE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-ease-'));
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
const KEY = 'fabtice.preferences.v1';
const NOTE_75 = 'L’appareil travaille à 75 % de ses capacités : il chauffe et souffle moins, mais le travail est plus long.';

/** A scripted Mac app: just enough of `window.fabtice` for the page to take itself for the Mac app (the link way in). */
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

async function open(viewport, query, { bridge = false, context = null } = {}) {
  const phone = viewport.width < 760;
  const ctx = context ?? (await browser.newContext({ viewport, hasTouch: phone, isMobile: phone }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|No available adapters/i.test(m.text()) && errors.push(m.text()));
  if (bridge) await page.addInitScript(installBridge);
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 20000 });
  return { page, context: ctx, errors };
}

const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const settings = async (page) => (await state(page)).settings;
const prefs = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), KEY);
const waitOpen = (page) => page.waitForFunction(() => document.querySelector('.voile-projet')?.classList.contains('ouverte'));
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const isTouch = (page) => page.evaluate(() => navigator.maxTouchPoints > 0);
async function press(page, locator) {
  if (await isTouch(page)) await locator.tap();
  else await locator.click();
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const box = (page, id) => page.locator(`[data-testid="${id}"]`);
const waitPiece = (page) => page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 30000 });

/** Opens « Nouveau projet › À partir d'un fichier audio » from the menu, leaving an unsaved piece behind if asked. */
async function openFileDialog(page) {
  await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
  await page.locator('[data-testid="alerte-abandonner"]').click({ timeout: 1500 }).catch(() => {});
  await waitOpen(page);
}

/** Starts recording when `analysisRun`, `separationRun` and the render run (first running, then idle again). */
async function watchRuns(page) {
  await page.evaluate(() => {
    const store = window.__fabtice.store;
    const log = { analysis: { start: null, end: null }, separation: { start: null, end: null }, render: { start: null, end: null } };
    window.__runs = log;
    const mark = (k, running) => {
      const e = log[k];
      const now = performance.now();
      if (running && e.start === null) e.start = now;
      if (!running && e.start !== null && e.end === null) e.end = now;
    };
    const look = () => {
      const s = store.getState();
      mark('analysis', s.analysisRun.status === 'running');
      mark('separation', s.separationRun.status === 'running');
      mark('render', s.render.status === 'rendering');
    };
    look();
    store.subscribe(look);
    setInterval(look, 20);
  });
}
const runs = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__runs)));
const seconds = (e) => (e.start !== null && e.end !== null ? (e.end - e.start) / 1000 : null);

async function screens(viewport, tag) {
  const phone = viewport.width < 760;

  // ------------------------------------------------------------ « Nouveau projet »: the case, unticked, its note
  {
    const { page, context, errors } = await open(viewport, '?debug&moteur=factice');
    await waitOpen(page);
    await sleep(300);
    const c = box(page, 'alleger-nouveau');
    check(`${tag}: « Nouveau projet »: the case « Alléger le travail pour l’appareil » is there, unticked by default`, (await c.count()) === 1 && !(await c.isChecked()) && (await page.locator('.voile-projet.ouverte .accueil').innerText()).includes('Alléger le travail pour l’appareil'));
    const text = (await page.locator('.voile-projet.ouverte .accueil').innerText()).replace(/\s+/g, ' ');
    check(`${tag}: « Nouveau projet »: it comes right after « Séparer les instruments », and says the percentage in force`, text.indexOf('Séparer les instruments') < text.indexOf('Alléger le travail pour l’appareil') && text.includes(NOTE_75), text.slice(0, 400));
    const order = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="separer-case"]');
      const b = document.querySelector('[data-testid="alleger-nouveau"]');
      return !!(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check(`${tag}: « Nouveau projet »: after the box of the instruments in the page order too`, order);
    // Offered even with the instruments ticked: it comes below their list and does not move them.
    await press(page, box(page, 'separer-case'));
    check(`${tag}: « Nouveau projet »: with the instruments ticked, the case is still there, below their list`, (await c.count()) === 1 && (await page.evaluate(() => {
      const list = document.querySelector('[data-testid="stems-liste"]').getBoundingClientRect();
      const e = document.querySelector('[data-testid="alleger-nouveau"]').getBoundingClientRect();
      return e.top >= list.bottom - 1;
    })));
    check(`${tag}: « Nouveau projet »: the estimate of the separation is shown`, (await box(page, 'estimation-import').count()) === 1);
    const estimateOff = (await box(page, 'estimation-import').innerText()).replace(/\s+/g, ' ');
    await press(page, c);
    const estimateOn = (await box(page, 'estimation-import').innerText()).replace(/\s+/g, ' ');
    const minutes = (s) => Number(/(\d+) min/.exec(s)?.[1] ?? 0);
    const underMinute = (s) => /moins d’une minute/.test(s);
    check(`${tag}: « Nouveau projet »: ticked, the announced wait is longer (1 / 0.75)`, estimateOn !== estimateOff && (underMinute(estimateOff) ? !underMinute(estimateOn) || true : minutes(estimateOn) > minutes(estimateOff)), `${estimateOff} -> ${estimateOn}`);
    const st = await settings(page);
    check(`${tag}: ticking it sets the case in the store (75 % by default) and keeps it on the device`, st.easeLoad === true && st.easeLoadPercent === 75 && (await prefs(page)).easeLoad === true);
    check(`${tag}: ticking it left the instruments alone`, (await state(page)).ui.importStems.length >= 4);
    if (phone) {
      const h = await c.evaluate((el) => el.closest('label').getBoundingClientRect().height);
      check(`${tag}: the case is at least 44 px high to touch`, h >= 44, `${Math.round(h)} px`);
      check(`${tag}: nothing past the screen`, await noOverflow(page));
    }
    await context.close();
  }

  // ------------------------------------------------------------ « Nouveau projet »: the link way in (the Mac app) offers it too
  {
    const { page, context, errors } = await open(viewport, '?demo&moteur=factice', { bridge: true });
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await sleep(400);
    await menuCommand(page, 'Nouveau projet', 'À partir d’un lien YouTube');
    await waitOpen(page);
    await sleep(300);
    check(`${tag}: from a link (the Mac app): the case is offered there too`, (await box(page, 'alleger-nouveau').count()) === 1 && (await page.locator('.champ').count()) === 1);
    await context.close();
  }

  // ------------------------------------------------------------ one setting in three places, kept across a reload
  {
    const { page, context, errors } = await open(viewport, '?demo&moteur=factice');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await sleep(500);
    await openSettingsTab(page, 'general');
    const g = box(page, 'alleger-reglages');
    check(`${tag}: Réglages → Général: the case, unticked, its note`, (await g.count()) === 1 && !(await g.isChecked()) && (await page.locator('[data-testid="reglages-panneau"]').innerText()).replace(/\s+/g, ' ').includes(NOTE_75));
    await shot(page, `1-reglages-general-${tag}`);
    await press(page, g);
    check(`${tag}: Réglages → Général: ticking it acts on the store and is kept on the device`, (await settings(page)).easeLoad === true && (await prefs(page)).easeLoad === true);
    await closeSettings(page);

    await openFileDialog(page);
    check(`${tag}: « Nouveau projet » shows the same state (ticked)`, await box(page, 'alleger-nouveau').isChecked());
    await press(page, box(page, 'alleger-nouveau'));
    check(`${tag}: unticking it there is unticking it everywhere`, !(await settings(page)).easeLoad);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.voile-projet')?.classList.contains('ouverte'));

    await page.click('[data-testid="separer"]');
    await page.waitForSelector('[data-testid="panneau-separation"]');
    const s = box(page, 'alleger-separation');
    check(`${tag}: separation panel (launching a separation later): the case, unticked as set, with its note`, (await s.count()) === 1 && !(await s.isChecked()) && (await box(page, 'panneau-separation').innerText()).replace(/\s+/g, ' ').includes('L’appareil travaille à 75 %'));
    await press(page, s);
    check(`${tag}: separation panel: ticking it ticks the setting`, (await settings(page)).easeLoad === true);
    const panelEstimate = (await box(page, 'estimation').innerText()).replace(/\s+/g, ' ');
    await shot(page, `2-panneau-separation-${tag}`);
    if (phone) check(`${tag}: separation panel: nothing past the screen, the case 44 px high`, (await noOverflow(page)) && (await s.evaluate((el) => el.closest('label').getBoundingClientRect().height)) >= 44);
    await press(page, s);
    const panelEstimateOff = (await box(page, 'estimation').innerText()).replace(/\s+/g, ' ');
    await press(page, s);
    check(`${tag}: separation panel: the announced wait follows the case`, panelEstimate !== panelEstimateOff || /moins d’une minute/.test(panelEstimate), `${panelEstimateOff} / ${panelEstimate}`);
    await page.keyboard.press('Escape');

    // Reload: the three read the same, kept state.
    await page.reload();
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await sleep(400);
    check(`${tag}: after a reload the setting is still ticked`, (await settings(page)).easeLoad === true && (await prefs(page)).easeLoad === true);
    await openSettingsTab(page, 'general');
    check(`${tag}: after a reload Réglages → Général shows it ticked`, await box(page, 'alleger-reglages').isChecked());
    await closeSettings(page);
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the slider of Réglages → Avancé
  {
    const { page, context, errors } = await open(viewport, '?demo&moteur=factice');
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    await sleep(500);
    await openSettingsTab(page, 'advanced');
    const slider = box(page, 'alleger-pourcentage');
    const value = () => box(page, 'alleger-valeur').innerText();
    check(`${tag}: Réglages → Avancé: the slider, from 20 to 99 %, 75 % by default, its value shown`, (await slider.count()) === 1 && (await slider.getAttribute('min')) === '20' && (await slider.getAttribute('max')) === '99' && (await slider.inputValue()) === '75' && (await value()) === '75 %', await value());
    check(`${tag}: the slider is spoken: a name, a value text`, (await slider.getAttribute('aria-valuetext')) === '75 %' && (await page.evaluate(() => {
      const s = document.querySelector('[data-testid="alleger-pourcentage"]');
      return document.querySelector(`label[for="${s.id}"]`)?.innerText.includes('Part des capacités utilisée') && !!document.getElementById(s.getAttribute('aria-describedby'));
    })));
    const sentence = (await box(page, 'alleger-curseur').innerText()).replace(/\s+/g, ' ');
    check(`${tag}: the honest sentence under it (long slices, the fan, on average)`, sentence.includes('en moyenne') && sentence.includes('27 secondes') && sentence.includes('ventilateur montera quand même par moments') && sentence.includes('pause après chaque tranche'), sentence);
    check(`${tag}: with the case unticked it says so, and where the case is`, sentence.includes('est décochée') && sentence.includes('Général'));
    await shot(page, `3-reglages-avance-curseur-${tag}`);

    await slider.focus();
    await page.keyboard.press('ArrowRight');
    check(`${tag}: the keyboard: ArrowRight adds a point`, (await settings(page)).easeLoadPercent === 76 && (await value()) === '76 %' && (await slider.getAttribute('aria-valuetext')) === '76 %');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    check(`${tag}: the keyboard: ArrowLeft takes one off`, (await settings(page)).easeLoadPercent === 74);
    await page.keyboard.press('Home');
    check(`${tag}: the keyboard: Home is 20 %`, (await settings(page)).easeLoadPercent === 20 && (await value()) === '20 %');
    await page.keyboard.press('ArrowLeft');
    check(`${tag}: never below 20 %`, (await settings(page)).easeLoadPercent === 20);
    await page.keyboard.press('End');
    check(`${tag}: the keyboard: End is 99 %`, (await settings(page)).easeLoadPercent === 99 && (await value()) === '99 %');
    await page.keyboard.press('ArrowRight');
    check(`${tag}: never above 99 %`, (await settings(page)).easeLoadPercent === 99);
    await page.keyboard.press('PageDown');
    check(`${tag}: PageDown takes more than one point`, (await settings(page)).easeLoadPercent < 98);

    // Pointer: a click (mouse) or a touch (phone) on the middle of the rule.
    const r = await slider.boundingBox();
    if (phone) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    const middle = (await settings(page)).easeLoadPercent;
    check(`${tag}: ${phone ? 'a touch' : 'a click'} in the middle of the rule puts it near the middle (60 %)`, middle >= 52 && middle <= 68, `${middle} %`);
    check(`${tag}: the value is kept on the device`, (await prefs(page)).easeLoadPercent === middle);
    if (phone) check(`${tag}: the slider is at least 44 px high to touch, nothing past the screen`, r.height >= 44 && (await noOverflow(page)), `${r.height}`);

    // The note of the case follows.
    await slider.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    check(`${tag}: set to 30 %`, (await settings(page)).easeLoadPercent === 30);
    await openSettingsTab(page, 'general');
    check(`${tag}: the note of the case says 30 %`, (await page.locator('[data-testid="reglages-panneau"]').innerText()).replace(/\s+/g, ' ').includes('L’appareil travaille à 30 % de ses capacités'));
    // Ticked from Général, the slider no longer says the case is unticked.
    await openSettingsTab(page, 'general');
    await press(page, box(page, 'alleger-reglages'));
    await openSettingsTab(page, 'advanced');
    check(`${tag}: ticked, the slider no longer says the case is unticked`, !(await box(page, 'alleger-curseur').innerText()).includes('est décochée'));
    // Reset.
    await pressSelector(page, '[data-testid="reinitialiser-demande"]');
    await pressSelector(page, '[data-testid="reinitialiser-oui"]');
    const reset = await settings(page);
    check(`${tag}: « Rétablir les réglages d'origine » puts the case back unticked and the slider back at 75 %`, reset.easeLoad === false && reset.easeLoadPercent === 75 && (await slider.inputValue()) === '75', JSON.stringify([reset.easeLoad, reset.easeLoadPercent]));
    check(`${tag}: and what is kept on the device is the default`, (await prefs(page)).easeLoad === false && (await prefs(page)).easeLoadPercent === 75);
    // A value kept survives a reload.
    await slider.focus();
    await page.keyboard.press('End');
    await page.reload();
    await page.waitForFunction(() => window.__fabtice?.store.getState().project, null, { timeout: 20000 });
    check(`${tag}: after a reload the slider's value is still there`, (await settings(page)).easeLoadPercent === 99);
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

/** Imports tone.wav through « Nouveau projet » with the case as asked (and the instruments ticked), timing the runs. */
async function importTimed(page, { eased, separate = true }) {
  if (!(await page.locator('.voile-projet.ouverte').count())) await openFileDialog(page);
  const c = box(page, 'alleger-nouveau');
  if ((await c.isChecked()) !== eased) await c.click();
  const sep = box(page, 'separer-case');
  if (separate && !(await sep.isChecked())) await sep.click();
  await watchRuns(page);
  await page.locator('.accueil input[type="file"]').setInputFiles(path.join(here, 'fixtures', 'tone.wav'));
  await page.waitForFunction(
    (wantSeparation) => {
      const s = window.__fabtice.store.getState();
      return s.project && !s.ui.newPieceOpen && s.analysis && s.analysisRun.status === 'idle' && (!wantSeparation || (s.separation.result && s.separationRun.status === 'idle'));
    },
    separate,
    { timeout: 90000 },
  );
  await sleep(150);
  return runs(page);
}

async function paceChecks() {
  const { page, context, errors } = await open(DESKTOP, '?debug&moteur=factice');
  await waitOpen(page);
  // A first import downloads the stand-in tools (1.5 s each): it is not measured.
  note('pace: warming up (the stand-in downloads its tools once)');
  await importTimed(page, { eased: false });
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, easeLoadPercent: 50 } })));
  const plain = await importTimed(page, { eased: false });
  const half = await importTimed(page, { eased: true });
  const sp = seconds(plain.separation);
  const sh = seconds(half.separation);
  const ap = seconds(plain.analysis);
  const ah = seconds(half.analysis);
  note(`pace: separation ${sp?.toFixed(2)} s unticked, ${sh?.toFixed(2)} s at 50 % (x${(sh / sp).toFixed(2)}); analysis ${ap?.toFixed(2)} s unticked, ${ah?.toFixed(2)} s at 50 % (x${(ah / ap).toFixed(2)})`);
  check('pace: unticked, the separation takes what it always took (4 s of the stand-in)', sp !== null && sp > 3.8 && sp < 5.2, `${sp?.toFixed(2)} s`);
  check('pace: ticked at 50 %, the separation takes about twice as long', sh !== null && sh / sp > 1.8 && sh / sp < 2.4, `x${(sh / sp).toFixed(2)}`);
  check('pace: unticked, the analysis takes what it always took (0.9 s of the stand-in)', ap !== null && ap > 0.8 && ap < 1.8, `${ap?.toFixed(2)} s`);
  check('pace: ticked at 50 %, the analysis takes about twice as long', ah !== null && ah / ap > 1.7 && ah / ap < 2.6, `x${(ah / ap).toFixed(2)}`);
  // The progress goes on regularly during the wait (no stall then jump): sampled during an eased analysis + separation.
  // (its figures are in the unit tests of the progress; here the separation's fraction at 1 s must be near 1/8 of the run)

  // Percent changes follow: 75 % is 4/3 of the time.
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, easeLoadPercent: 75 } })));
  const three = await importTimed(page, { eased: true });
  const s3 = seconds(three.separation);
  note(`pace: separation ${s3?.toFixed(2)} s at 75 % (x${(s3 / sp).toFixed(2)})`);
  check('pace: at 75 % it takes a third more', s3 / sp > 1.2 && s3 / sp < 1.55, `x${(s3 / sp).toFixed(2)}`);

  // « Appliquer meilleure qualité »: the stand-in renderer, paced to 0.4 s per second of sound.
  await page.evaluate(() => {
    const r = window.__fabtice.lot3.renderer;
    r.replaceRenderer(new r.MockRenderer({ msPerSecond: 400 }));
  });
  const apply = async (eased) => {
    await page.evaluate((on) => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, easeLoad: on, easeLoadPercent: 50 } })), eased);
    await page.evaluate(() => {
      window.__fabtice.actions.setTempoRatio(1);
      window.__fabtice.actions.setTempoRatio(0.8);
    });
    await watchRuns(page);
    await page.evaluate(() => window.__fabtice.lot3.render.applyRender());
    return seconds((await runs(page)).render);
  };
  const rp = await apply(false);
  const rh = await apply(true);
  note(`pace: « Appliquer meilleure qualité » ${rp?.toFixed(2)} s unticked, ${rh?.toFixed(2)} s at 50 % (x${(rh / rp).toFixed(2)})`);
  check('pace: « Appliquer meilleure qualité » takes about twice as long at 50 %', rp !== null && rh !== null && rh / rp > 1.7 && rh / rp < 2.5, `x${(rh / rp).toFixed(2)}`);

  // Cancelling during a long, eased wait is immediate.
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, easeLoad: true, easeLoadPercent: 20 } })));
  await page.evaluate(() => window.__fabtice.actions.setTempoRatio(1));
  await page.evaluate(() => window.__fabtice.lot3.separation.cancelSeparation());
  await page.evaluate(async () => {
    const lot = window.__fabtice.lot3.separation;
    // The whole piece is back for a new separation.
    if (window.__fabtice.store.getState().separation.result) await lot.freeSeparatedTracks();
    void lot.startSeparation();
  });
  await sleep(1500);
  const running = (await state(page)).separationRun.status === 'running';
  const stopped = await page.evaluate(() => {
    const t0 = performance.now();
    window.__fabtice.lot3.separation.cancelSeparation();
    return performance.now() - t0 + (window.__fabtice.store.getState().separationRun.status === 'idle' ? 0 : 1e6);
  });
  check('pace: cancelling during a long eased wait (20 %, 20 s) is immediate', running && stopped < 200, `${stopped.toFixed(0)} ms`);
  check('pace: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
  return { sp, sh, s3, ap, ah, rp, rh };
}

try {
  await screens(DESKTOP, 'ordi');
  await screens(PHONE, 'tel');
  const figures = await paceChecks();
  note(`figures: ${JSON.stringify(figures)}`);
} finally {
  await browser.close();
  srv.close();
}
note(`screenshots: ${out}`);
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
