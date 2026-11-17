// « Correction de la courbe en tapant le tempo » (C12) in Chromium, in both forms of the interface (a computer:
// 1280 × 800, mouse and keyboard; a phone: 390 × 844, touch), and the rule of the space bar in every window.
//   npm run build && npm run test:tap-fix
//
// Uses the demo piece (analysed, a loop on) and the silent engine (`?moteur=factice`: a clock, no sound; the
// clicks it was given are readable in its snapshot). The taps are made at the beat times while the clock runs.
// Checked, in each form: the bar menu (four entries, a hint under each) → the window, step by step (the exact
// texts, one bar of count-in by default, none allowed); the passage that plays (metronome forced on whatever
// the user's switch says and the loop put aside, the click following the grid and stopping at the chosen bar,
// everything given back after); the space bar (or a touch on the zone) tapping without starting nor stopping
// the playback, even with a button focused; « Ok, j'ai fini » by mouse or touch and by Enter; a refusal with
// too few taps; the end of the piece; « Vérifier en écoutant » (click on the candidate grid, stops by itself or
// when pressed again); « Ce n'est pas bon, réessayer » (the grid exactly as before); « C'est bon, c'est
// corrigé » (one `tapped` correction, one undo step); Escape and the cross at every step (nothing left
// changed); nothing darkened, the ruler in view, nothing overflowing, touch targets of 40 px at least.
// Then, on a computer: for each kind of window, with a button focused, Space does not start the playback; with
// none open it does.
// Screenshots go to $FABTICE_TAP_FIX_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_TAP_FIX_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-tap-fix-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const FORMS = [
  { name: 'ordinateur', viewport: { width: 1280, height: 800 }, phone: false },
  { name: 'telephone', viewport: { width: 390, height: 844 }, phone: true },
];

// The owner's texts, to the letter (typographic apostrophes, as everywhere in the interface).
const TEXT = {
  menu: ['Corriger un changement de tempo indésirable', 'Réanalyser le tempo à partir de cette mesure', 'Correction de la courbe en tapant le tempo', 'Changer la signature rythmique'],
  title: (bar) => `Correction du tempo à partir de la mesure ${bar}`,
  countIn: 'Mesures de décompte',
  key: 'Tapez sur la touche espace à peu près sur chaque temps pendant le passage que l’algorithme a eu du mal à détecter, la suite du morceau sera ré-analysée automatiquement',
  touch: 'Touchez l’écran à peu près sur chaque temps pendant le passage que l’algorithme a eu du mal à détecter, la suite du morceau sera ré-analysée automatiquement',
  go: 'C’est parti',
  done: 'Ok, j’ai fini',
  verify: 'Vérifier en écoutant',
  stop: 'Arrêter l’écoute',
  retry: 'Ce n’est pas bon, réessayer',
  accept: 'C’est bon, c’est corrigé',
  tooFew: 'Tapez au moins trois temps à partir de la mesure choisie.',
  committing: 'Mise en place de la correction…',
  listen: 'Écoutez le décompte… Vous pouvez déjà taper avec le clic.',
  computing: 'Calcul de la nouvelle grille et analyse de la suite du morceau…',
};

const BOX = '[data-testid="tapes"]';
/** The cross of the window on screen (the closed opening window keeps its own, hidden). */
const MODAL = '[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])';
const FERMER = `${MODAL} .fermer`;
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const snapshot = (page) => page.evaluate(() => window.__fabtice.engine.snapshot());
const step = (page) => page.locator(BOX).getAttribute('data-etape');
const waitStep = (page, name, timeout = 15000) => page.waitForSelector(`${BOX}[data-etape="${name}"]`, { timeout });
const closed = async (page) => (await page.locator(BOX).count()) === 0;

async function open(form) {
  const context = await browser.newContext({ viewport: form.viewport, hasTouch: form.phone, isMobile: form.phone, deviceScaleFactor: form.phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/?demo&moteur=factice`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
  return { context, page, errors };
}

/** A touch on a phone, a click on a computer. */
async function press(page, form, locator) {
  if (form.phone) await locator.tap();
  else await locator.click();
}

/** A touch held still (a phone has no right click): the bar menu opens after a moment. */
async function longPress(context, page, x, y) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The viewport point of the bars of the ruler, for the bars whose line is on screen. */
const rulerBars = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    const frise = document.querySelector('.frise').getBoundingClientRect();
    const t0 = Number(document.querySelector('[data-t0]').dataset.t0);
    const pps = Number(document.querySelector('[data-t0]').dataset.pps);
    const row = document.querySelector('.frise-rang.mesures').getBoundingClientRect();
    const m = s.tempoMap.meters[0].meter.numerator;
    const out = [];
    for (const seg of s.tempoMap.segments) {
      const bar = seg.beat / m;
      if (!Number.isInteger(bar) || bar < 0) continue;
      const x = frise.left + (seg.time - t0) * pps;
      if (x > frise.left + 8 && x < frise.right - 70) out.push({ bar, x: x + 12, y: row.top + row.height / 2, time: seg.time });
    }
    return out;
  });

/** The ruler's point of `bar`; a phone shows a few bars only: the playhead is put there first, and the view follows. */
async function barOnScreen(page, bar) {
  let at = (await rulerBars(page)).find((b) => b.bar === bar);
  if (!at) {
    await page.evaluate((b) => {
      const s = window.__fabtice.store.getState();
      const seg = s.tempoMap.segments.find((x) => Math.abs(x.beat - b * s.tempoMap.meters[0].meter.numerator) < 1e-6);
      window.__fabtice.actions.seek(seg.time);
    }, bar);
    for (let i = 0; i < 20 && !at; i++) {
      await sleep(150);
      at = (await rulerBars(page)).find((b) => b.bar === bar);
    }
  }
  if (!at) throw new Error(`bar ${bar} is not on screen`);
  return at;
}

/** Opens the bar menu at `bar` (a right click, a long press on a phone) and chooses « Correction de la courbe en tapant le tempo ». */
async function openTapWindow(context, page, form, bar) {
  const at = await barOnScreen(page, bar);
  if (form.phone) await longPress(context, page, at.x, at.y);
  else await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 5000 });
  await press(page, form, page.locator('[data-action="tap"]'));
  await page.waitForSelector(BOX, { timeout: 5000 });
  return at;
}

/** Times of the beats of bar `bar` onwards (source seconds), from the grid in force. */
const beatsFrom = (page, bar, n) =>
  page.evaluate(
    ([b, count]) => {
      const s = window.__fabtice.store.getState();
      const m = s.tempoMap.meters[0].meter.numerator;
      return s.tempoMap.segments.filter((x) => x.beat >= b * m - 1e-6).slice(0, count).map((x) => x.time);
    },
    [bar, n],
  );

/** One tap: the space bar on a computer, a touch of the zone on a phone — once the playhead has reached `time`. */
async function tapAt(page, form, time) {
  await page.waitForFunction((t) => window.__fabtice.engine.getPosition() >= t, time, { polling: 'raf', timeout: 30000 });
  if (form.phone) {
    const b = await page.locator('[data-testid="tapes-zone"]').boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  } else {
    await page.keyboard.press('Space');
  }
}

async function tapCount(page) {
  const text = await page.locator('[data-testid="tapes-compte"]').innerText();
  return text.startsWith('Aucune') ? 0 : Number(text.split(' ')[0]);
}

/** The window's box is in the window with the margin of the form, and nothing inside it sticks out of it. */
async function insideAndWhole(page, form) {
  return page.evaluate((phone) => {
    const el = document.querySelector('[data-testid="tapes"]');
    for (const a of el.getAnimations()) a.finish();
    const r = el.getBoundingClientRect();
    const margin = phone ? 0 : 20;
    const problems = [];
    if (r.left < margin - 0.5 || r.right > innerWidth - margin + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5) problems.push(`box ${[r.left, r.top, r.right, r.bottom].map(Math.round)} in ${innerWidth}x${innerHeight}`);
    for (const c of el.querySelectorAll('*')) {
      const b = c.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.left < r.left - 1 || b.right > r.right + 1) problems.push(`${c.tagName}.${c.className} sticks out sideways`);
      if (c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow === 'visible' && c.children.length === 0) problems.push(`${c.tagName}.${c.className} is cut`);
    }
    if (el.scrollWidth > el.clientWidth + 1) problems.push('the window scrolls sideways');
    if (document.documentElement.scrollWidth > innerWidth) problems.push('the page scrolls sideways');
    return problems;
  }, form.phone);
}

/** Controls of the window that are touched: 40 px at least. */
async function touchTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('[data-testid="tapes"] button, [data-testid="tapes"] input, [data-testid="tapes-zone"]')) {
      const r = b.getBoundingClientRect();
      if (r.height < 39.5 || r.width < 39.5) out.push(`${b.getAttribute('data-testid') || b.className}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

/** The ruler is not under the window, nothing darkens the screen, the piece behind waits (inert). */
async function inTheOpen(page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="tapes"]').getBoundingClientRect();
    const row = document.querySelector('.frise-rang.mesures').getBoundingClientRect();
    const covering = [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('.app') || e.closest('[data-testid="tapes"]')) return false;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return cs.position === 'fixed' && cs.visibility !== 'hidden' && r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    return { rulerClear: row.bottom <= box.top, voile: document.querySelectorAll('.voile.ouverte').length, covering: covering.map((e) => e.className), inert: document.querySelector('.app').inert === true };
  });
}

/** The engine and the store as they were before the window: nothing left changed. */
async function untouched(page, base, tag) {
  const snap = await snapshot(page);
  const s = await state(page);
  const same = await page.evaluate(() => window.__fabtice.store.getState().tempoMap === window.__orig.tempoMap);
  check(`${tag}: playback stopped`, snap.state === 'ready');
  check(`${tag}: the metronome is the user's again (${base.metronome ? 'on' : 'off'}), in the engine and in the store`, snap.metronome === base.metronome && s.playback.metronome === base.metronome);
  check(`${tag}: the loop is back in the engine`, JSON.stringify(snap.loop) === JSON.stringify(base.loop));
  check(`${tag}: the click track is the whole grid again`, snap.clickTimes.length === base.clicks && snap.clickTimes[0] === base.firstClick);
  check(`${tag}: the grid in force is the very same object, no correction added`, same && s.corrections.tempoFixes.length === base.fixes);
  check(`${tag}: the tempo of playback was not touched`, s.playback.tempoRatio === base.ratio);
  check(`${tag}: no undo step and nothing to save left behind`, (await page.evaluate(() => window.__fabtice.history.canUndo())) === base.canUndo && (await page.evaluate(() => window.__fabtice.history.isModified())) === base.modified);
}

async function baseline(page) {
  await page.evaluate(() => {
    window.__orig = { tempoMap: window.__fabtice.store.getState().tempoMap };
  });
  const snap = await snapshot(page);
  const s = await state(page);
  const canUndo = await page.evaluate(() => window.__fabtice.history.canUndo());
  const modified = await page.evaluate(() => window.__fabtice.history.isModified());
  return { canUndo, modified, metronome: snap.metronome, loop: snap.loop, clicks: snap.clickTimes.length, firstClick: snap.clickTimes[0], fixes: s.corrections.tempoFixes.length, ratio: s.playback.tempoRatio, map: JSON.stringify(s.tempoMap) };
}

async function setPlayback(page, patch) {
  await page.evaluate((p) => {
    const st = window.__fabtice.store;
    st.setState({ playback: { ...st.getState().playback, ...p } });
    // a setting changed by the check, not by the window under test: not a step to count
    window.__fabtice.history.resetHistory({ modified: false });
  }, patch);
  await sleep(50);
}

async function suite(form) {
  const tag0 = form.name;
  const { context, page, errors } = await open(form);
  const BAR = 6; // index; « mesure 7 » (inside the demo's loop, away from its edges: a finger there would grab the edge)
  const BAR_NAME = String(BAR + 1);
  const shot = (name) => page.screenshot({ path: path.join(out, `${form.name}-${name}.png`) });
  let base = await baseline(page);
  check(`${tag0}: the demo piece has a loop on and the metronome off`, base.loop !== null && base.metronome === false);

  // ------------------------------------------------------------ the bar menu
  {
    const at = await barOnScreen(page, BAR);
    if (form.phone) await longPress(context, page, at.x, at.y);
    else await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-tempo"]');
    const entries = await page.locator('[data-testid="menu-tempo"] [role="menuitem"] > span').allInnerTexts();
    check(`${tag0}: the bar menu has the four entries`, entries.join(' | ') === TEXT.menu.join(' | '), entries.join(' | '));
    const hints = await page.locator('[data-testid="menu-tempo"] [role="menuitem"] > small').allInnerTexts();
    check(`${tag0}: a line of explanation under each`, hints.length === 4 && hints.every((h) => h.length > 20));
    await page.evaluate(() => document.querySelector('[data-testid="menu-tempo"]').getAnimations().forEach((a) => a.finish()));
    await shot('menu');
    await page.locator('[data-action="continuity"]').focus();
    await page.keyboard.press('Escape');
    check(`${tag0}: Escape closes the menu`, (await page.locator('[data-testid="menu-tempo"]').count()) === 0);
  }

  // ------------------------------------------------------------ the window, « prepare »
  await openTapWindow(context, page, form, BAR);
  {
    const tag = `${tag0} prepare`;
    check(`${tag}: step « prepare »`, (await step(page)) === 'prepare');
    check(`${tag}: the title says the bar`, (await page.locator('#tapes-titre').innerText()) === TEXT.title(BAR_NAME));
    check(`${tag}: the label of the count-in field`, (await page.locator('label[for="tapes-decompte"]').innerText()) === TEXT.countIn);
    check(`${tag}: one bar of count-in by default`, (await page.locator('[data-testid="tapes-decompte"]').inputValue()) === '1');
    check(`${tag}: the text, ${form.phone ? '« Touchez l’écran »' : '« Tapez sur la touche espace »'}, to the letter`, (await page.locator('[data-testid="tapes-consigne"]').innerText()) === (form.phone ? TEXT.touch : TEXT.key));
    check(`${tag}: « C’est parti »`, (await page.locator('[data-testid="tapes-depart"]').innerText()) === TEXT.go);
    const w = await inTheOpen(page);
    check(`${tag}: the ruler stays in view above the window, nothing darkened, the app behind is inert`, w.rulerClear && w.voile === 0 && w.covering.length === 0 && w.inert, JSON.stringify(w));
    const problems = await insideAndWhole(page, form);
    check(`${tag}: the window is inside the screen, nothing sticks out`, problems.length === 0, problems.join(' ; '));
    if (form.phone) {
      const small = await touchTargets(page);
      check(`${tag}: every control to touch is 40 px at least`, small.length === 0, small.join(' ; '));
    }
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    check(`${tag}: « C’est parti » has the focus (Enter starts)`, focus === 'tapes-depart', String(focus));
    await shot('prepare');
  }

  // ------------------------------------------------------------ « C'est parti » with no count-in: Escape closes at once
  {
    const tag = `${tag0} 0 bars`;
    await page.locator('[data-testid="tapes-decompte"]').fill('0');
    await page.locator('[data-testid="tapes-decompte"]').blur();
    check(`${tag}: 0 is accepted`, (await page.locator('[data-testid="tapes-decompte"]').inputValue()) === '0');
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 5000 });
    const bars = await rulerBars(page);
    const barTime = (await beatsFrom(page, BAR, 1))[0];
    const snap = await snapshot(page);
    check(`${tag}: playback starts at the chosen bar itself`, snap.position >= barTime - 0.05 && snap.position < barTime + 0.6, `${snap.position.toFixed(2)} for ${barTime.toFixed(2)}`);
    check(`${tag}: no click at all is left to hear from there`, snap.clickTimes.every((t) => t < barTime - 0.01) && snap.lastCountIn === null);
    check(`${tag}: it listens at once (« À vous »)`, (await page.locator('[data-testid="tapes-phase"]').innerText()) === (form.phone ? 'À vous : touchez sur chaque temps' : 'À vous : tapez sur chaque temps'));
    void bars;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await untouched(page, base, `${tag} Escape`);
  }

  // ------------------------------------------------------------ the main passage: one bar of count-in, the loop on, the metronome off
  const ratio = 1;
  await openTapWindow(context, page, form, BAR);
  const barTime = (await beatsFrom(page, BAR, 1))[0];
  const beats = await beatsFrom(page, BAR, 12);
  const barLength = beats[4] - beats[0];
  // The beats of the grid before the chosen bar (the clicks heard while tapping).
  const before = await page.evaluate((t) => window.__fabtice.store.getState().tempoMap.segments.filter((x) => x.time >= 0 && x.time < t - 0.01).length, barTime);
  {
    const tag = `${tag0} tapping`;
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 5000 });
    const snap = await snapshot(page);
    const s = await state(page);
    check(`${tag}: playback starts one bar before the chosen bar`, Math.abs(snap.position - (barTime - barLength)) < 0.35, `${snap.position.toFixed(2)} for ${(barTime - barLength).toFixed(2)}`);
    check(`${tag}: the metronome is forced on in the engine, the user's switch (off) untouched`, snap.metronome === true && s.playback.metronome === false);
    check(`${tag}: the loop is put aside in the engine, kept in the store`, snap.loop === null && s.loop.enabled === true);
    check(`${tag}: the playback tempo is not touched`, s.playback.tempoRatio === ratio);
    const times = snap.clickTimes;
    const last = times[times.length - 1];
    const beatLen = beats[1] - beats[0];
    check(`${tag}: the clicks follow the grid up to the chosen bar and none from it`, times.length === before && times.every((t) => t < barTime - 0.01) && Math.abs(last - (barTime - beatLen)) < 0.05, `${times.length} clicks for ${before}, last ${last.toFixed(2)}, bar at ${barTime.toFixed(2)}`);
    check(`${tag}: it says to listen to the count-in`, (await page.locator('[data-testid="tapes-phase"]').innerText()) === TEXT.listen);
    // taps before the chosen bar do not count
    if (form.phone) {
      const b = await page.locator('[data-testid="tapes-zone"]').boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else {
      await page.keyboard.press('Space');
    }
    await sleep(60);
    check(`${tag}: a tap along the count-in pulses but is not counted (the counter counts from the chosen bar)`, (await tapCount(page)) === 0 && (await page.locator('.tapes-pouls.bat').count()) === 1);
    check(`${tag}: and it did not stop the playback`, (await snapshot(page)).state === 'playing');
    await shot('tapping-decompte');
    const w = await inTheOpen(page);
    check(`${tag}: the ruler stays in view, nothing darkened`, w.rulerClear && w.voile === 0 && w.covering.length === 0, JSON.stringify(w));
    const problems = await insideAndWhole(page, form);
    check(`${tag}: nothing sticks out of the window`, problems.length === 0, problems.join(' ; '));
    if (form.phone) {
      const zone = await page.locator('[data-testid="tapes-zone"]').boundingBox();
      const box = await page.locator(BOX).boundingBox();
      check(`${tag}: the zone to touch fills most of the window`, zone.height > box.height * 0.5 && zone.width > box.width - 40, `${Math.round(zone.width)}x${Math.round(zone.height)} in ${Math.round(box.width)}x${Math.round(box.height)}`);
      const small = await touchTargets(page);
      check(`${tag}: every control to touch is 40 px at least`, small.length === 0, small.join(' ; '));
    }

    // from the chosen bar: tap each beat
    await page.waitForFunction((t) => window.__fabtice.engine.getPosition() >= t, barTime, { polling: 'raf', timeout: 15000 });
    await sleep(60);
    check(`${tag}: from the bar it says « À vous »`, (await page.locator('[data-testid="tapes-phase"]').innerText()) === (form.phone ? 'À vous : touchez sur chaque temps' : 'À vous : tapez sur chaque temps'));
    for (let k = 0; k < 4; k++) await tapAt(page, form, beats[k] + 0.02);
    await sleep(80);
    check(`${tag}: each tap is counted (4 taps)`, (await tapCount(page)) === 4 && (await page.locator('[data-testid="tapes-compte"]').innerText()) === '4 tapes');
    const mid = await snapshot(page);
    check(`${tag}: the taps neither started nor stopped the playback`, mid.state === 'playing' && mid.metronome === true);
    if (!form.phone) {
      // with another button focused (the cross): Space still taps, and does not press it
      await page.locator('[data-testid="tapes-fermer"]').focus();
      await tapAt(page, form, beats[4] + 0.02);
      await sleep(80);
      check(`${tag}: Space taps with a button focused (the cross), the window stays, the playback goes on`, (await tapCount(page)) === 5 && !(await closed(page)) && (await snapshot(page)).state === 'playing');
      await page.locator('[data-testid="tapes-fini"]').focus();
      await tapAt(page, form, beats[5] + 0.02);
      await sleep(80);
      check(`${tag}: Space taps with « Ok, j’ai fini » focused, without pressing it`, (await tapCount(page)) === 6 && (await step(page)) === 'tapping');
    } else {
      await tapAt(page, form, beats[4] + 0.02);
      await tapAt(page, form, beats[5] + 0.02);
      await sleep(80);
      check(`${tag}: six touches, six taps`, (await tapCount(page)) === 6);
    }
    await shot('tapping');
    check(`${tag}: « Ok, j’ai fini »`, (await page.locator('[data-testid="tapes-fini"]').innerText()) === TEXT.done);
    await press(page, form, page.locator('[data-testid="tapes-fini"]'));
  }

  // ------------------------------------------------------------ check
  await waitStep(page, 'check');
  {
    const tag = `${tag0} check`;
    const snap = await snapshot(page);
    const s = await state(page);
    check(`${tag}: « Ok, j’ai fini » stopped the playback`, snap.state === 'ready');
    check(`${tag}: the candidate grid is in force (heard and shown)`, JSON.stringify(s.tempoMap) !== base.map);
    check(`${tag}: it is not a correction yet`, s.corrections.tempoFixes.length === base.fixes);
    check(`${tag}: the buttons`, (await page.locator('[data-testid="tapes-verifier"]').innerText()) === TEXT.verify && (await page.locator('[data-testid="tapes-reessayer"]').innerText()) === TEXT.retry && (await page.locator('[data-testid="tapes-ok"]').innerText()) === TEXT.accept);
    const problems = await insideAndWhole(page, form);
    check(`${tag}: nothing sticks out of the window`, problems.length === 0, problems.join(' ; '));
    if (form.phone) {
      const small = await touchTargets(page);
      check(`${tag}: every control to touch is 40 px at least`, small.length === 0, small.join(' ; '));
    }
    await shot('verifier');

    // « Vérifier en écoutant »: plays, click on, on the candidate grid; pressed again, stops
    await press(page, form, page.locator('[data-testid="tapes-verifier"]'));
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 5000 });
    const v = await snapshot(page);
    const wanted = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      return window.__fabtice.lot4.metronome.metronomeClickTrack(st.tempoMap, 0, st.project.duration, st.metronome.patterns).times.length;
    });
    check(`${tag}: « Vérifier en écoutant » plays with the click on, the whole candidate grid clicking`, v.metronome === true && v.clicks === wanted && v.loop === null, `${v.clicks} clicks for ${wanted}`);
    check(`${tag}: it starts one bar before the chosen bar`, Math.abs(v.position - (barTime - barLength)) < 0.35, v.position.toFixed(2));
    check(`${tag}: the button now says how to stop`, (await page.locator('[data-testid="tapes-verifier"]').innerText()) === TEXT.stop);
    await press(page, form, page.locator('[data-testid="tapes-verifier"]'));
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 3000 });
    check(`${tag}: pressed again, it stops`, (await page.locator('[data-testid="tapes-verifier"]').innerText()) === TEXT.verify);

    // « Ce n'est pas bon, réessayer »: the grid exactly as before, back to the first step with the same count-in
    await press(page, form, page.locator('[data-testid="tapes-reessayer"]'));
    await waitStep(page, 'prepare');
    const same = await page.evaluate(() => window.__fabtice.store.getState().tempoMap === window.__orig.tempoMap);
    const after = await snapshot(page);
    check(`${tag}: « réessayer » gives the very same grid back`, same && after.clickTimes.length === base.clicks && after.metronome === base.metronome);
    check(`${tag}: showing and giving back the candidate grid made no undo step and nothing to save`, (await page.evaluate(() => window.__fabtice.history.canUndo())) === base.canUndo && (await page.evaluate(() => window.__fabtice.history.isModified())) === base.modified);
    check(`${tag}: and the count-in as it was (the default)`, (await page.locator('[data-testid="tapes-decompte"]').inputValue()) === '1');
    await shot('reessayer');
  }

  // ------------------------------------------------------------ a refusal: too few taps
  {
    const tag = `${tag0} refusal`;
    await page.locator('[data-testid="tapes-decompte"]').fill('2');
    if (form.phone) await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    else {
      // Space presses the focused button of the window (it does not start the playback by itself)
      await page.locator('[data-testid="tapes-depart"]').focus();
      await page.keyboard.press('Space');
    }
    await waitStep(page, 'tapping');
    check(`${tag}: ${form.phone ? 'the touch' : 'Space'} that pressed « C’est parti » is not a tap`, (await tapCount(page)) === 0);
    check(`${tag}: two bars of count-in start two bars before`, Math.abs((await snapshot(page)).position - (barTime - 2 * barLength)) < 0.4);
    await tapAt(page, form, barTime + 0.02);
    await sleep(80);
    await press(page, form, page.locator('[data-testid="tapes-fini"]'));
    await waitStep(page, 'refused');
    check(`${tag}: one tap is too few: the calm sentence`, (await page.locator('[data-testid="tapes-refus"]').innerText()) === TEXT.tooFew && (await page.locator('[data-testid="tapes-refus"]').getAttribute('data-code')) === 'tooFewTaps');
    check(`${tag}: the grid in force is the original one`, await page.evaluate(() => window.__fabtice.store.getState().tempoMap === window.__orig.tempoMap));
    const problems = await insideAndWhole(page, form);
    check(`${tag}: nothing sticks out of the window`, problems.length === 0, problems.join(' ; '));
    await shot('refus');
    await press(page, form, page.locator('[data-testid="tapes-encore"]'));
    await waitStep(page, 'prepare');
    check(`${tag}: « Réessayer » goes back to the first step, with the same count-in`, (await page.locator('[data-testid="tapes-decompte"]').inputValue()) === '2');
  }

  // ------------------------------------------------------------ second passage: slowed down, no count-in, Enter, then « C'est bon »
  {
    const tag = `${tag0} accepted`;
    await setPlayback(page, { tempoRatio: 0.75 });
    base = { ...base, ratio: 0.75 };
    await page.locator('[data-testid="tapes-decompte"]').fill('0');
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    for (let k = 0; k < 5; k++) await tapAt(page, form, beats[k] + 0.03);
    await sleep(80);
    check(`${tag}: five taps at a slowed tempo (75 %)`, (await tapCount(page)) === 5);
    check(`${tag}: the tempo of playback is still the user's`, (await state(page)).playback.tempoRatio === 0.75 && (await snapshot(page)).tempoRatio === 0.75);
    if (form.phone) await press(page, form, page.locator('[data-testid="tapes-fini"]'));
    else {
      check(`${tag}: « Ok, j’ai fini » is reachable by Enter (it has the focus)`, (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'tapes-fini');
      await page.keyboard.press('Enter');
    }
    await waitStep(page, 'check');
    const shown = await state(page);
    const previewMap = JSON.stringify(shown.tempoMap.segments);
    check(`${tag}: while the candidate is shown, the store says which grid is in force, and listening made nothing to undo or save`, shown.tempoPreview !== null && (await page.evaluate(() => window.__fabtice.history.canUndo())) === base.canUndo && (await page.evaluate(() => window.__fabtice.history.isModified())) === base.modified);
    const line = await page.locator('[data-testid="tapes-lecture"]').allInnerTexts();
    check(`${tag}: at most one calm line about the way of tapping`, line.length <= 1 && (line.length === 0 || /ms (avant|après) le temps|temps oubliés? a|tapes? en trop/.test(line[0])), line.join(' | '));
    // the whole listening, up to its end by itself
    await press(page, form, page.locator('[data-testid="tapes-verifier"]'));
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 5000 });
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 20000 });
    const stopped = await snapshot(page);
    check(`${tag}: « Vérifier en écoutant » stops by itself a little after the last tap`, stopped.position > beats[4] && stopped.position < beats[4] + 4 && (await page.locator('[data-testid="tapes-verifier"]').innerText()) === TEXT.verify, stopped.position.toFixed(2));
    await press(page, form, page.locator('[data-testid="tapes-ok"]'));
    await waitStep(page, 'committing', 4000);
    check(`${tag}: the wait while the rest of the piece is analysed, with its percentage`, (await page.locator('[data-testid="tapes-attente"]').innerText()).includes(TEXT.committing) && /\d+ %/.test(await page.locator('[data-testid="tapes-pourcentage"]').innerText()));
    await shot('attente');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 20000 });
    const s = await state(page);
    const fixes = s.corrections.tempoFixes.filter((f) => f.kind === 'tapped');
    check(`${tag}: the window closes, one « tapped » correction is kept`, fixes.length === 1 && s.corrections.tempoFixes.length === base.fixes + 1, JSON.stringify(s.corrections.tempoFixes.map((f) => f.kind)));
    const taps = fixes[0]?.taps ?? [];
    const dev = taps.map((t) => Math.min(...beats.map((b) => Math.abs(b - t))));
    check(`${tag}: the taps are recorded in source time, at the beats heard (slowed playback)`, taps.length === 5 && Math.max(...dev) < 0.15, `${taps.map((t) => t.toFixed(2))} vs ${beats.slice(0, 5).map((t) => t.toFixed(2))}`);
    check(`${tag}: the grid kept is the one that was heard (the candidate), the preview is over`, JSON.stringify(s.tempoMap.segments) === previewMap && s.tempoPreview === null, `origin ${s.tempoMap.origin}`);
    const snap = await snapshot(page);
    check(`${tag}: the user's metronome and loop are back`, snap.metronome === false && JSON.stringify(snap.loop) === JSON.stringify(base.loop));
    // one undo step
    const label = await page.evaluate(() => window.__fabtice.history.undoLabel());
    await page.evaluate(() => window.__fabtice.history.undo());
    check(`${tag}: and that was the only step (nothing else to undo)`, (await page.evaluate(() => window.__fabtice.history.canUndo())) === base.canUndo);
    const undone = await state(page);
    check(`${tag}: one undo step takes it back (« ${label} »): no fix, the previous grid`, undone.corrections.tempoFixes.length === base.fixes && JSON.stringify(undone.tempoMap.segments) === JSON.stringify(JSON.parse(base.map).segments), `${undone.corrections.tempoFixes.length} fixes; origin ${undone.tempoMap.origin}`);
    // redo, then « Revenir à l'analyse » on the bar's menu
    await page.evaluate(() => window.__fabtice.history.redo());
    check(`${tag}: redo gives it back`, (await state(page)).corrections.tempoFixes.filter((f) => f.kind === 'tapped').length === 1 && JSON.stringify((await state(page)).tempoMap.segments) === previewMap);
    {
      const at = await barOnScreen(page, BAR);
      if (form.phone) await longPress(context, page, at.x, at.y);
      else await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForSelector('[data-testid="menu-tempo"]');
      await press(page, form, page.locator('[data-action="undo"]'));
      await sleep(200);
      const back = await state(page);
      check(`${tag}: « Revenir à l’analyse » on that bar gives the previous grid back, no fix left`, back.corrections.tempoFixes.length === base.fixes && JSON.stringify(back.tempoMap.segments) === JSON.stringify(JSON.parse(base.map).segments));
      await page.evaluate(() => window.__fabtice.history.resetHistory({ modified: false }));
    }
    // space plays again when the window is closed
    await setPlayback(page, { tempoRatio: 1 });
    await page.evaluate(() => window.__fabtice.store.setState({ playback: { ...window.__fabtice.store.getState().playback, tempoRatio: 1 } }));
    await page.evaluate(() => window.__fabtice.actions.seek(0));
    await page.keyboard.press('Space');
    await sleep(150);
    check(`${tag}: once the window is closed, Space starts the playback again`, (await snapshot(page)).state === 'playing');
    await page.keyboard.press('Space');
    await sleep(150);
    check(`${tag}: and stops it`, (await snapshot(page)).state === 'ready');
    base = { ...base, ratio: 1 };
    await page.evaluate(() => {
      window.__orig = { tempoMap: window.__fabtice.store.getState().tempoMap };
    });
  }

  // ------------------------------------------------------------ Escape and the cross, at every step
  {
    // prepare: the cross
    await openTapWindow(context, page, form, BAR);
    await press(page, form, page.locator('[data-testid="tapes-fermer"]'));
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await untouched(page, base, `${tag0} prepare, the cross`);
    check(`${tag0}: the app behind is live again`, await page.evaluate(() => document.querySelector('.app').inert === false));

    // tapping, with the user's metronome ON and the playback at double speed
    await setPlayback(page, { metronome: true, tempoRatio: 2 });
    base = { ...base, metronome: true, ratio: 2, clicks: (await snapshot(page)).clickTimes.length };
    await openTapWindow(context, page, form, BAR);
    await page.locator('[data-testid="tapes-decompte"]').fill('1');
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    await tapAt(page, form, barTime + 0.02);
    const mid = await snapshot(page);
    check(`${tag0} tapping, Escape: the click is cut at the bar even with the user's own metronome on`, mid.metronome === true && mid.clickTimes.length === before);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await untouched(page, base, `${tag0} tapping, Escape`);

    // check
    await openTapWindow(context, page, form, BAR);
    await page.locator('[data-testid="tapes-decompte"]').fill('0');
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    for (let k = 0; k < 4; k++) await tapAt(page, form, beats[k] + 0.02);
    await press(page, form, page.locator('[data-testid="tapes-fini"]'));
    await waitStep(page, 'check');
    await press(page, form, page.locator('[data-testid="tapes-verifier"]'));
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await untouched(page, base, `${tag0} check (listening), Escape`);

    // refused
    await openTapWindow(context, page, form, BAR);
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    await press(page, form, page.locator('[data-testid="tapes-fini"]'));
    await waitStep(page, 'refused');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await untouched(page, base, `${tag0} refusal, Escape`);
    await setPlayback(page, { metronome: false, tempoRatio: 1 });
    base = { ...base, metronome: false, ratio: 1, clicks: (await snapshot(page)).clickTimes.length };
  }

  // ------------------------------------------------------------ the end of the piece is « Ok, j'ai fini »
  {
    const tag = `${tag0} end of the piece`;
    const lastBar = await page.evaluate(() => {
      const s = window.__fabtice.store.getState();
      const m = s.tempoMap.meters[0].meter.numerator;
      return Math.max(...s.tempoMap.segments.filter((x) => x.time < s.project.duration - 4.5).map((x) => Math.floor(x.beat / m)));
    });
    const last = { bar: lastBar };
    await setPlayback(page, { tempoRatio: 2 });
    await openTapWindow(context, page, form, last.bar);
    await page.locator('[data-testid="tapes-decompte"]').fill('0');
    await press(page, form, page.locator('[data-testid="tapes-depart"]'));
    await waitStep(page, 'tapping');
    await page.waitForFunction(() => document.querySelector('[data-testid="tapes"]')?.getAttribute('data-etape') !== 'tapping', null, { timeout: 15000 });
    check(`${tag}: reaching the end of the piece ends the tapping by itself (here: too few taps)`, ['refused', 'computing', 'check'].includes(await step(page)), String(await step(page)));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    await setPlayback(page, { tempoRatio: 1 });
  }

  check(`${tag0}: no console error`, errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- the space bar, in every window

async function spaceRule() {
  const form = FORMS[0];
  const { context, page, errors } = await open(form);
  const playing = async () => {
    await sleep(200);
    return (await snapshot(page)).state === 'playing';
  };
  const reset = async () => {
    for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.__fabtice.engine.pause();
      window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, exportAudioOpen: false, printOpen: false, saveProjectOpen: false, panel: 'none', storageNotice: null } }));
    });
    await sleep(150);
    await page.evaluate(() => document.activeElement?.blur());
  };
  const command = (id) => page.evaluate((c) => void window.__fabtice.project.runCommand(c), id);

  const windows = [
    { name: 'Export audio', open: () => command('exportAudio'), focus: FERMER, closesBySpace: true },
    { name: 'Dossier pour Logic Pro', open: () => command('exportLogic'), focus: FERMER, closesBySpace: true },
    { name: 'Projet Ableton Live', open: () => command('exportAbleton'), focus: FERMER, closesBySpace: true },
    { name: 'Impression', open: () => command('print'), focus: FERMER, closesBySpace: true },
    { name: 'Enregistrer', open: () => page.evaluate(() => window.__fabtice.lot3.exportAudio.openSaveProject()), focus: FERMER, closesBySpace: true },
    {
      name: 'Alerte : modifications non enregistrées',
      open: () =>
        page.evaluate(() => {
          window.__fabtice.history.markModified();
          void window.__fabtice.project.confirmLeaveProject();
        }),
      focus: '[role="alertdialog"] button:has-text("Annuler")',
      closesBySpace: true,
    },
    { name: 'Réglages', open: () => command('settings'), focus: '[data-testid="reglages-fermer"]', closesBySpace: true },
    { name: 'Nouveau projet', open: () => page.evaluate(() => window.__fabtice.actions.openNewPiece()), focus: '[data-testid="separer-case"]', ticks: true },
    { name: 'Avis de stockage', open: () => page.evaluate(() => window.__fabtice.actions.setStorageNotice('unavailable')), focus: '.avis-stockage button', closesBySpace: true },
    { name: 'Panneau du métronome', open: () => page.evaluate(() => window.__fabtice.actions.openPanel('metronome')), focus: '[data-testid="panneau-metronome"] button' },
    { name: 'Panneau des repères', open: () => page.evaluate(() => window.__fabtice.actions.openPanel('markers')), focus: '[data-testid="panneau-reperes"] button' },
    { name: 'Panneau de séparation', open: () => page.evaluate(() => window.__fabtice.actions.openPanel('separation')), focus: '[data-testid="panneau-separation"] button.stem' },
    { name: 'Panneau de la grille', open: () => page.evaluate(() => window.__fabtice.actions.openPanel('grid')), focus: '[data-testid="tous-reglages-tempo"]' },
    { name: 'Panneau d’accordage', open: () => page.evaluate(() => window.__fabtice.actions.openPanel('tuning')), focus: '[data-testid="tous-reglages-accordage"]' },
    {
      name: 'Menu du clic droit sur une mesure',
      open: async () => {
        const bar = await barOnScreen(page, 6);
        await page.mouse.click(bar.x, bar.y, { button: 'right' });
        await page.waitForSelector('[data-testid="menu-tempo"]');
      },
      focus: '[data-testid="menu-tempo"] [data-action="tap"]',
      opensTapWindow: true,
    },
    {
      name: 'Menu Fabtice',
      open: async () => {
        await page.locator('button.marque').click();
        await page.locator('#menu-fabtice').waitFor();
      },
      focus: '#menu-fabtice [role="menuitem"]',
    },
  ];
  for (const w of windows) {
    await reset();
    await w.open();
    const target = page.locator(w.focus).first();
    try {
      await target.waitFor({ timeout: 5000 });
    } catch {
      check(`space bar, ${w.name}: the window opens`, false, w.focus);
      continue;
    }
    await target.focus();
    const before = w.ticks ? await target.isChecked() : null;
    await page.keyboard.press('Space');
    const started = await playing();
    check(`space bar, ${w.name}: with a button focused, Space does not start the playback`, !started);
    if (w.ticks) check(`space bar, ${w.name}: it ticks the box`, (await target.isChecked()) === !before);
    if (w.closesBySpace) check(`space bar, ${w.name}: it pressed the focused button (the window is gone)`, (await page.locator(w.focus).count()) === 0);
    if (w.opensTapWindow) check(`space bar, ${w.name}: it pressed the focused entry (the window of the taps opens)`, (await page.locator(BOX).count()) === 1);
  }
  // With the focus nowhere in a window that is modal: still nothing.
  await reset();
  await command('exportAudio');
  await page.waitForSelector(MODAL);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  check('space bar, Export audio, nothing focused: Space does not start the playback', !(await playing()));

  // The message of the chord charts: it shows over the opening screen only (no piece is open then, so no playback could
  // start anyway); what is checked is that Space still does what the box does there.
  {
    const second = await context.newPage();
    await second.goto(`${url}/?debug&moteur=factice&grilles=message`);
    await second.waitForSelector('[data-testid="grilles-message"]', { timeout: 20000 });
    const box = second.locator('[data-testid="grilles-ne-plus"]');
    await box.focus();
    const was = await box.isChecked();
    await second.keyboard.press('Space');
    await sleep(250);
    check('space bar, the message of the chord charts: Space ticks the box', (await box.isChecked()) === !was);
    await second.close();
  }

  // With no window open: Space plays, also with a toolbar button focused, and does not press it.
  await reset();
  await page.keyboard.press('Space');
  check('no window open: Space starts the playback', await playing());
  await page.keyboard.press('Space');
  check('no window open: and stops it', !(await playing()));
  await page.locator('button.metronome').focus();
  await page.keyboard.press('Space');
  check('no window open, a toolbar button focused: Space starts the playback…', await playing());
  check('… and does not press the button', (await state(page)).playback.metronome === false);
  await page.keyboard.press('Space');
  check('… and stops it again', !(await playing()));
  // A window closed by Escape gives Space back.
  await command('exportAudio');
  await page.waitForSelector(MODAL);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])'), null, { timeout: 3000 });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  check('a window closed: Space starts the playback again', await playing());
  check('no console error (the space bar)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- the REAL analyser: taps at the true beats, with jitter

/** A small seeded generator (mulberry32): the same jitter at every run. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function realPass() {
  const SWING = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 'web/spikes/analyse/demo/demo-swing.mp3');
  const R_BAR = 4; // « mesure 5 »
  const R_BARS = 4;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-tap-fix-profile-'));
  const form = FORMS[0];
  const launch = async () => {
    const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], viewport: form.viewport });
    const page = context.pages()[0] ?? (await context.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`${url}/?debug&moteur=factice&analyse=reel`);
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
    return { context, page, errors };
  };
  const idle = (page) => page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status !== 'running', null, { timeout: 240000, polling: 100 });
  /** Beats of the grid in force (times of its segments). */
  const gridTimes = (page) => page.evaluate(() => window.__fabtice.store.getState().tempoMap.segments.map((x) => x.time));
  /** Plants bars R_BAR … at half tempo in the analysis and the grid (as `tempo-fix.mjs` does). */
  const plant = (page) =>
    page.evaluate(
      ([bar, bars]) => {
        const st = window.__fabtice.store;
        const s = st.getState();
        const b = s.analysis.beats;
        const m = b.meter.numerator;
        const i0 = b.downbeat + bar * m;
        const times = b.times.filter((_, i) => i <= i0 || i >= i0 + bars * m || (i - i0) % 2 === 0);
        const segments = [];
        for (let i = 0; i + 1 < times.length; i++) segments.push({ time: times[i], beat: i - b.downbeat, bpm: 60 / (times[i + 1] - times[i]) });
        st.setState({ analysis: { ...s.analysis, beats: { ...b, times } }, tempoMap: { origin: 'analysis', segments, meters: [{ bar: 0, beat: 0, meter: { ...b.meter } }] }, corrections: { ...s.corrections, tempoFixes: [] } });
      },
      [R_BAR, R_BARS],
    );
  const rulerAt = (page, bar) =>
    page.evaluate((b) => {
      const s = window.__fabtice.store.getState();
      const m = s.tempoMap.meters[0].meter.numerator;
      const seg = s.tempoMap.segments.find((x) => Math.abs(x.beat - b * m) < 1e-6);
      const r = document.querySelector('.frise').getBoundingClientRect();
      const row = document.querySelector('.frise-rang.mesures').getBoundingClientRect();
      return { x: r.left + seg.time * s.view.pxPerSecond + 12, y: row.top + row.height / 2 };
    }, bar);
  /** The share of the true beats of [from, to] that the grid has a beat within 50 ms of, and the worst gap. */
  const landing = (truth, got, from, to) => {
    const want = truth.filter((t) => t >= from - 1e-3 && t <= to + 1e-3);
    const gaps = want.map((t) => Math.min(...got.map((g) => Math.abs(g - t))));
    return { share: gaps.filter((g) => g <= 0.05).length / Math.max(1, want.length), worst: Math.max(...gaps), n: want.length };
  };

  /** Opens the window at the bar, one bar of count-in, taps along the count-in bar and the passage, « Ok, j'ai fini »; returns what the wait showed. */
  async function tapPassage(page, truth, tag, rand) {
    const at = await rulerAt(page, R_BAR);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-tempo"]');
    await page.click('[data-action="tap"]');
    await page.waitForSelector(BOX);
    await page.click('[data-testid="tapes-depart"]');
    await waitStep(page, 'tapping');
    // taps along the count-in bar and the passage: a habitual delay of 70 ms and ± 40 ms of jitter
    for (const t of truth) {
      const target = t + 0.07 + (rand() * 2 - 1) * 0.04;
      await page.waitForFunction((x) => window.__fabtice.engine.getPosition() >= x, target, { polling: 'raf', timeout: 60000 });
      await page.keyboard.press('Space');
    }
    await sleep(100);
    await page.click('[data-testid="tapes-fini"]');
    // the wait: its text and the percentage, as long as it lasts
    const seen = { text: false, percents: [] };
    for (let i = 0; i < 4800; i++) {
      const stepNow = await page.locator(BOX).getAttribute('data-etape').catch(() => null);
      if (stepNow !== 'computing') break;
      if ((await page.locator('[data-testid="tapes-attente"]').innerText().catch(() => '')).includes(TEXT.computing)) seen.text = true;
      const pc = await page.locator('[data-testid="tapes-pourcentage"]').innerText({ timeout: 100 }).catch(() => null);
      if (pc) seen.percents.push(Number.parseInt(pc, 10));
      await sleep(50);
    }
    await waitStep(page, 'check', 5000).catch(() => {});
    return seen;
  }

  let truth;
  let from;
  let last;
  // ---- pass 1: the piece is analysed for real in this session (the networks' outputs are kept)
  {
    const { context, page, errors } = await launch();
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await page.waitForFunction(() => window.__fabtice.store.getState().analysis, null, { timeout: 240000, polling: 200 });
    await idle(page);
    const a = await page.evaluate(() => {
      const b = window.__fabtice.store.getState().analysis.beats;
      return { times: b.times, downbeat: b.downbeat, m: b.meter.numerator };
    });
    truth = a.times.slice(a.downbeat + (R_BAR - 1) * a.m, a.downbeat + (R_BAR + R_BARS) * a.m + 1);
    from = a.times[a.downbeat + R_BAR * a.m];
    last = a.times[a.downbeat + (R_BAR + R_BARS) * a.m];
    await plant(page);
    const planted = await gridTimes(page);
    const before = landing(a.times, planted, from, last);
    check('real analyser: the planted passage is wrong (half tempo: few true beats are on the grid)', before.share < 0.7, `${(100 * before.share).toFixed(0)} %`);
    const rand = seeded(20261117);
    const seen = await tapPassage(page, truth, 'real 1', rand);
    check('real analyser: the check step is reached', (await step(page)) === 'check', String(await step(page)));
    const got = await gridTimes(page);
    const fit = landing(a.times, got, from, last);
    check('real analyser: the grid heard in the passage lands within 50 ms of the true beats (taps delayed by 70 ms, ± 40 ms of jitter)', fit.share >= 0.95, `${(100 * fit.share).toFixed(0)} % of ${fit.n}, worst ${(1000 * fit.worst).toFixed(0)} ms`);
    const line = await page.locator('[data-testid="tapes-lecture"]').allInnerTexts();
    console.log(`NOTE  the line about the taps: ${line.join(' | ') || '(none)'}; the wait: text ${seen.text}, percents ${seen.percents.join(',') || '-'}`);
    check('real analyser: it says the habitual delay, calmly, compensated', line.length === 1 && /ms après le temps : c’est compensé\./.test(line[0]), line.join(' | '));
    await page.screenshot({ path: path.join(out, 'ordinateur-reel-verification.png') });
    const preview = (await state(page)).tempoMap;
    await page.click('[data-testid="tapes-ok"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 30000 });
    const s = await state(page);
    const fixes = s.corrections.tempoFixes.filter((f) => f.kind === 'tapped');
    check('real analyser: « C’est bon »: one « tapped » correction, the grid kept is the previewed one, one undo step', fixes.length === 1 && JSON.stringify(s.tempoMap.segments) === JSON.stringify(preview.segments) && s.tempoPreview === null);
    const kept = landing(a.times, await gridTimes(page), from, last);
    check('real analyser: the kept grid is within 50 ms of the true beats', kept.share >= 0.95, `${(100 * kept.share).toFixed(0)} %`);
    await page.evaluate(() => window.__fabtice.history.undo());
    check('real analyser: undo gives the previous grid back, no fix', (await state(page)).corrections.tempoFixes.length === 0 && JSON.stringify(await gridTimes(page)) === JSON.stringify(planted));
    await page.evaluate(() => window.__fabtice.history.redo());
    check('real analyser: no console error', errors.length === 0, errors.join(' | '));
    await page.waitForTimeout(1800); // the autosave
    await context.close();
  }
  // ---- pass 2: the piece comes back from the device: the networks run again during the wait, with a percentage
  {
    const { context, page, errors } = await launch();
    await page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().analysis, null, { timeout: 30000 });
    await sleep(500);
    await plant(page);
    const a = await page.evaluate(() => ({ times: window.__fabtice.store.getState().analysis.beats.times }));
    void a;
    const rand = seeded(7);
    const seen = await tapPassage(page, truth, 'real 2', rand);
    check('reopened piece: the wait says what is done, with a percentage that goes up', seen.text && seen.percents.length >= 2 && seen.percents.every((p, i) => i === 0 || p >= seen.percents[i - 1]), `text ${seen.text}, percents ${seen.percents.join(',')}`);
    check('reopened piece: the check step is reached', (await step(page)) === 'check', String(await step(page)));
    await page.screenshot({ path: path.join(out, 'ordinateur-reel-reouverture.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout: 3000 });
    check('reopened piece: Escape leaves no fix', (await state(page)).corrections.tempoFixes.length === 0);
    check('reopened piece: no console error', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  fs.rmSync(profile, { recursive: true, force: true });
}

try {
  for (const form of FORMS) await suite(form);
  await spaceRule();
  await realPass();
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.stack || e}`);
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
