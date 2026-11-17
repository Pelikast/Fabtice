'use strict';

// Tempo by hand (stage 4), end to end in the Mac app: the bar menu, « Changer la
// signature rythmique », « Correction de la courbe en tapant le tempo », and the
// rule of the space bar (never starts the playback with a window or a menu open).
//
// The piece is the demo (`?demo`: analysed, a loop on, a mock analyser) and the
// engine is the real one, on Chromium's fake audio output (as audio-device.test.js):
// no sound is needed, only the clock of the playback. The taps are the space bar
// pressed once the playhead has reached each beat of the grid, as
// app/tests/tap-fix.mjs does. What the engine holds is not read (that check has
// a silent engine); what is checked is the playback state, the store and the page.
//
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface, pieceReady } = require('./helpers');

const MENU = '[data-testid="menu-tempo"]';
const BOX = '[data-testid="tapes"]';
const SIGNATURE = '[data-testid="signature"]';
// A tap lands a little after its beat, as a hand does (and the engine's position runs ahead of the sound by its output
// latency: a tap right on the first beat could count as before the chosen bar and be left out).
const LATE = 0.12;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The demo piece, open and ready, with the peaks drawn; `problems` collects page errors. */
async function startDemo() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-tempo-'));
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await page.evaluate(() => window.__fabtice.ready);
    await pieceReady(page);
    await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 60000 });
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
  return { app, page, problems };
}

/** An entry of the application menu bar, clicked as the bar would (Édition → Annuler). */
const clickBar = (app, id) =>
  app.evaluate(({ Menu, BrowserWindow }, itemId) => {
    const item = Menu.getApplicationMenu().getMenuItemById(itemId);
    if (!item || !item.enabled) throw new Error(`bar entry ${itemId} missing or greyed out`);
    item.click({ triggeredByAccelerator: false }, BrowserWindow.getAllWindows()[0]);
  }, id);

const store = (page) => page.evaluate(() => window.__fabtice.store.getState());
const engineState = (page) => page.evaluate(() => window.__fabtice.engine.getState());
const meters = (page) => page.evaluate(() => window.__fabtice.store.getState().tempoMap.meters.map((m) => `${m.bar}:${m.meter.numerator}/${m.meter.denominator}`).join(' '));
const signatures = (page) => page.evaluate(() => document.querySelector('.frise')?.dataset.signatures ?? '');
const canUndo = (page) => page.evaluate(() => window.__fabtice.history.canUndo());
const fixesCount = (page) => page.evaluate(() => window.__fabtice.store.getState().corrections.tempoFixes.length);

/** Where the « Mesures » row of the ruler shows the middle of bar `bar` (index), or null when out of view. */
const barPoint = (page, bar) =>
  page.evaluate((b) => {
    const f = document.querySelector('.frise');
    const r = document.querySelector('.frise-regle').getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const s = window.__fabtice.store.getState();
    const start = window.__fabtice.lot4.tempoMap.barStartTime;
    const t = start(s.tempoMap, b) + 0.5 * (start(s.tempoMap, b + 1) - start(s.tempoMap, b));
    const x = fr.left + (t - Number(f.dataset.t0)) * Number(f.dataset.pps);
    return x > fr.left + 60 && x < fr.right - 60 ? { x, y: r.bottom - 13 } : null;
  }, bar);

/** A bar (index, 4 or later, away from the first bars) whose middle is on the ruler, the view being moved if needed. */
async function barInView(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let b = 4; b <= 14; b++) {
      if (await barPoint(page, b)) return b;
    }
    await page.evaluate(() => {
      const s = window.__fabtice.store.getState();
      window.__fabtice.actions.seek(window.__fabtice.lot4.tempoMap.barStartTime(s.tempoMap, 6));
    });
    await wait(500);
  }
  throw new Error('no bar of the ruler is in view');
}

/** The bar menu at `bar`: a right click on the ruler (the app's own menu, not the system's). */
async function openBarMenu(page, bar) {
  await page.waitForFunction((b) => {
    const f = document.querySelector('.frise');
    return f && f.dataset.t0 !== undefined && b >= 0;
  }, bar);
  const p = await barPoint(page, bar);
  assert.ok(p, `bar ${bar} is in view`);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForSelector(MENU, { timeout: 10000 });
}

/** Opens the bar menu and presses its entry `action`. */
async function chooseInBarMenu(page, bar, action) {
  await openBarMenu(page, bar);
  await page.locator(`${MENU} [data-action="${action}"]`).click();
}

/** The grid beats from `bar` on (source seconds). */
const beatsFrom = (page, bar, count) =>
  page.evaluate(
    ([b, n]) => {
      const s = window.__fabtice.store.getState();
      const m = s.tempoMap.meters[0].meter.numerator;
      return s.tempoMap.segments.filter((x) => x.beat >= b * m - 1e-6).slice(0, n).map((x) => x.time);
    },
    [bar, count],
  );

/** One tap: the space bar, once the playhead has reached `time` (the clock of the engine, not a sleep). */
async function tapAt(page, time) {
  await page.waitForFunction((t) => window.__fabtice.engine.getPosition() >= t, time, { polling: 'raf', timeout: 60000 });
  await page.keyboard.press('Space');
}

const tapCount = async (page) => {
  const text = await page.locator('[data-testid="tapes-compte"]').innerText();
  return text.startsWith('Aucune') ? 0 : Number(text.split(' ')[0]);
};
/** Waits until the window counts `n` taps; on a timeout says what the page showed (count, playback, position). */
async function waitTaps(page, n) {
  try {
    await page.waitForFunction((want) => new RegExp(`^${want} `).test(document.querySelector('[data-testid="tapes-compte"]')?.textContent ?? ''), n, { timeout: 15000 });
  } catch (error) {
    const seen = await page.evaluate(() => ({
      loop: window.__fabtice.store.getState().loop,
      count: document.querySelector('[data-testid="tapes-compte"]')?.textContent,
      phase: document.querySelector('[data-testid="tapes-phase"]')?.textContent,
      step: document.querySelector('[data-testid="tapes"]')?.dataset.etape,
      engine: window.__fabtice.engine.getState(),
      position: window.__fabtice.engine.getPosition(),
      focus: document.activeElement?.outerHTML.slice(0, 120),
    }));
    throw new Error(`${n} taps expected: ${JSON.stringify(seen)}`, { cause: error });
  }
}
const waitStep = (page, name, timeout = 60000) => page.waitForSelector(`${BOX}[data-etape="${name}"]`, { timeout });
const waitTapWindowClosed = (page, timeout = 30000) => page.waitForFunction(() => !document.querySelector('[data-testid="tapes"]'), null, { timeout });

/** The window of `selector` is inside the page: 20 px of margin on the sides, whole in height, nothing sticking out sideways. */
async function assertWindowInside(page, selector, label) {
  const problems = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    for (const a of el.getAnimations()) a.finish();
    const r = el.getBoundingClientRect();
    const out = [];
    if (r.left < 20 - 0.5 || r.right > innerWidth - 20 + 0.5) out.push(`sides ${Math.round(r.left)}..${Math.round(r.right)} in ${innerWidth}`);
    if (r.top < -0.5 || r.bottom > innerHeight + 0.5) out.push(`height ${Math.round(r.top)}..${Math.round(r.bottom)} in ${innerHeight}`);
    for (const c of el.querySelectorAll('*')) {
      const b = c.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.left < r.left - 1 || b.right > r.right + 1) out.push(`${c.tagName}.${c.className} sticks out sideways`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways');
    return out;
  }, selector);
  assert.deepEqual(problems, [], `${label}: the window is inside the page`);
}

/** The state a run of the tap window must leave as it found it. */
async function snapshotOf(page) {
  return page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    window.__before = s.tempoMap;
    return {
      fixes: s.corrections.tempoFixes.length,
      metronome: s.playback.metronome,
      loop: JSON.stringify(s.loop),
      ratio: s.playback.tempoRatio,
      canUndo: window.__fabtice.history.canUndo(),
      modified: window.__fabtice.history.isModified(),
    };
  });
}

async function assertSameAs(page, base, label) {
  const now = await snapshotOf2(page);
  assert.equal(now.sameGrid, true, `${label}: the grid is the very same object`);
  assert.equal(now.fixes, base.fixes, `${label}: no correction added`);
  assert.equal(now.metronome, base.metronome, `${label}: the metronome setting is the user's`);
  assert.equal(now.loop, base.loop, `${label}: the loop is as before`);
  assert.equal(now.ratio, base.ratio, `${label}: the playback tempo is as before`);
  assert.equal(now.canUndo, base.canUndo, `${label}: no undo step left behind`);
  assert.equal(now.modified, base.modified, `${label}: nothing to save left behind`);
  assert.equal(now.engine, 'ready', `${label}: the playback is stopped`);
}

const snapshotOf2 = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    return {
      sameGrid: s.tempoMap === window.__before,
      fixes: s.corrections.tempoFixes.length,
      metronome: s.playback.metronome,
      loop: JSON.stringify(s.loop),
      ratio: s.playback.tempoRatio,
      canUndo: window.__fabtice.history.canUndo(),
      modified: window.__fabtice.history.isModified(),
      engine: window.__fabtice.engine.getState(),
    };
  });

/** What must stay empty at the end of a test: policy violations and page errors (warnings of the audio stack are not counted). */
async function assertNoPageProblems(page, problems, label) {
  assert.deepEqual(await page.evaluate(() => window.__csp), [], `${label}: CSP violations`);
  assert.deepEqual(problems.filter((p) => p.startsWith('[pageerror]')), [], `${label}: page errors`);
}

test('the bar menu lists its five entries in order, each with its hint', async () => {
  const { app, page, problems } = await startDemo();
  try {
    const bar = await barInView(page);
    await openBarMenu(page, bar);
    const entries = await page.locator(`${MENU} [role="menuitem"]`).evaluateAll((els) => els.map((e) => ({ action: e.dataset.action, name: e.querySelector('span')?.textContent, hint: e.querySelector('small')?.textContent ?? '', off: e.disabled })));
    assert.deepEqual(entries.map((e) => e.action), ['continuity', 'fresh', 'tap', 'meter', 'key'], 'five entries, in order (no « Revenir à l’analyse » where nothing was done)');
    assert.deepEqual(entries.map((e) => e.name), [
      'Corriger un changement de tempo indésirable',
      'Réanalyser le tempo à partir de cette mesure',
      'Correction de la courbe en tapant le tempo',
      'Changer la signature rythmique',
      'Changer de tonalité à partir de cette mesure…',
    ]);
    for (const e of entries) {
      assert.ok(e.hint.length > 20, `« ${e.name} » has its line of explanation`);
      assert.equal(e.off, false, `« ${e.name} » is usable`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction((sel) => !document.querySelector(sel), MENU, { timeout: 5000 });
    await assertNoPageProblems(page, problems, 'bar menu');
  } finally {
    await app.close();
  }
});

test('« Changer la signature rythmique »: 7/8 for one bar only, the ruler writes it and the return, one undo takes both back', async () => {
  const { app, page, problems } = await startDemo();
  try {
    const bar = await barInView(page);
    const before = await meters(page);
    assert.equal(await signatures(page), '', 'one signature: nothing written on the ruler');
    await chooseInBarMenu(page, bar, 'meter');
    await page.waitForSelector(SIGNATURE, { timeout: 10000 });
    await assertWindowInside(page, `${SIGNATURE} .fenetre-signature`, 'signature window');
    assert.equal(await page.locator('[data-testid="signature-mesure"]').textContent(), `Mesure ${bar + 1}`);

    await page.locator('[data-testid="signature-haut"]').fill('7');
    await page.selectOption('[data-testid="signature-bas"]', '8');
    await page.locator('.signature-choix', { hasText: 'Changement uniquement pour cette mesure' }).click();
    assert.equal(await page.locator('[data-testid="signature-portee-bar"]').isChecked(), true);
    await page.locator('[data-testid="signature-valider"]').click();
    await page.waitForFunction((sel) => !document.querySelector(sel), SIGNATURE, { timeout: 10000 });

    assert.equal(await meters(page), `${before} ${bar}:7/8 ${bar + 1}:4/4`, 'the change for that bar and the return at the next');
    await page.waitForFunction((want) => document.querySelector('.frise')?.dataset.signatures === want, `1:4/4 ${bar + 1}:7/8 ${bar + 2}:4/4`, { timeout: 10000 });
    assert.equal(await canUndo(page), true);

    // Édition → Annuler: one step takes both back, the ruler writes nothing again.
    await clickBar(app, 'undo');
    await page.waitForFunction((want) => window.__fabtice.store.getState().tempoMap.meters.map((m) => `${m.bar}:${m.meter.numerator}/${m.meter.denominator}`).join(' ') === want, before, { timeout: 10000 });
    await page.waitForFunction(() => (document.querySelector('.frise')?.dataset.signatures ?? '') === '', null, { timeout: 10000 });
    assert.equal(await canUndo(page), false, 'that was the only step');
    await assertNoPageProblems(page, problems, 'signature');
  } finally {
    await app.close();
  }
});

test('« Correction de la courbe en tapant le tempo »: the full flow, one correction, one undo step; Escape in a second run changes nothing', async () => {
  const { app, page, problems } = await startDemo();
  try {
    const bar = await barInView(page);
    const original = await snapshotOf(page);
    assert.equal(original.fixes, 0);
    assert.equal(await engineState(page), 'ready');

    // ---- the full flow: no count-in is the shortest wait, one bar is the default; this run uses the default
    await chooseInBarMenu(page, bar, 'tap');
    await page.waitForSelector(BOX, { timeout: 10000 });
    await waitStep(page, 'prepare');
    assert.equal(await page.locator('#tapes-titre').innerText(), `Correction du tempo à partir de la mesure ${bar + 1}`);
    assert.equal(await page.locator('[data-testid="tapes-decompte"]').inputValue(), '1', 'one bar of count-in by default');
    await assertWindowInside(page, BOX, 'prepare');
    const beats = await beatsFrom(page, bar, 12);
    await page.locator('[data-testid="tapes-depart"]').click();
    await waitStep(page, 'tapping');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 30000 });
    await assertWindowInside(page, BOX, 'tapping');
    assert.equal(await page.locator('[data-testid="tapes-phase"]').innerText(), 'Écoutez le décompte… Vous pouvez déjà taper avec le clic.', 'one bar of count-in is heard first');
    // from the chosen bar the window listens (« À vous »): the taps start there
    await page.waitForFunction(() => document.querySelector('[data-testid="tapes-phase"]')?.textContent === 'À vous : tapez sur chaque temps', null, { timeout: 60000 });
    assert.equal((await store(page)).playback.metronome, original.metronome, 'the user\'s metronome switch is untouched while tapping');

    for (let k = 0; k < 4; k++) await tapAt(page, beats[k] + LATE);
    await waitTaps(page, 4);
    assert.equal(await engineState(page), 'playing', 'Space tapped: it did not stop the playback');
    // with a button of the window focused, Space still taps and does not press it
    await page.locator('[data-testid="tapes-fini"]').focus();
    await tapAt(page, beats[4] + LATE);
    await waitTaps(page, 5);
    assert.equal(await tapCount(page), 5);
    assert.equal(await engineState(page), 'playing', 'with « Ok, j’ai fini » focused, Space neither stops the playback nor presses the button');
    for (let k = 5; k < 8; k++) await tapAt(page, beats[k] + LATE);
    await waitTaps(page, 8);
    assert.equal(await page.locator(BOX).getAttribute('data-etape'), 'tapping');

    await page.locator('[data-testid="tapes-fini"]').click();
    await waitStep(page, 'check', 90000);
    assert.equal(await engineState(page), 'ready', '« Ok, j’ai fini » stopped the playback');
    assert.equal(await fixesCount(page), 0, 'not a correction yet');
    await assertWindowInside(page, BOX, 'check');

    await page.locator('[data-testid="tapes-ok"]').click();
    await waitTapWindowClosed(page, 60000);
    const after = await store(page);
    const tapped = after.corrections.tempoFixes.filter((f) => f.kind === 'tapped');
    assert.equal(tapped.length, 1, 'one « tapped » correction');
    assert.equal(after.corrections.tempoFixes.length, 1);
    assert.equal(tapped[0].taps.length, 8, 'the eight taps are recorded');
    assert.equal(after.tempoPreview, null, 'the preview is over');
    assert.equal(await engineState(page), 'ready');
    assert.equal(await canUndo(page), true);

    // one undo step (Édition → Annuler) takes it back
    await clickBar(app, 'undo');
    await page.waitForFunction(() => window.__fabtice.store.getState().corrections.tempoFixes.length === 0, null, { timeout: 10000 });
    assert.equal(await canUndo(page), false, 'that was the only step');
    assert.equal((await store(page)).tempoMap.meters.length, 1);

    // ---- a second run, left with Escape in the middle of the tapping: everything as before
    await page.evaluate(() => {
      const st = window.__fabtice.store;
      st.setState({ playback: { ...st.getState().playback, metronome: true } });
      window.__fabtice.history.resetHistory({ modified: false });
    });
    const base = await snapshotOf(page);
    assert.equal(base.metronome, true);
    assert.equal(base.fixes, 0);
    await chooseInBarMenu(page, bar, 'tap');
    await waitStep(page, 'prepare');
    await page.locator('[data-testid="tapes-decompte"]').fill('0');
    await page.locator('[data-testid="tapes-decompte"]').blur();
    await page.locator('[data-testid="tapes-depart"]').click();
    await waitStep(page, 'tapping');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="tapes-phase"]')?.textContent === 'À vous : tapez sur chaque temps', null, { timeout: 60000 });
    await tapAt(page, beats[0] + LATE);
    await tapAt(page, beats[1] + LATE);
    await page.keyboard.press('Escape');
    await waitTapWindowClosed(page, 10000);
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 10000 });
    await assertSameAs(page, base, 'Escape while tapping');
    assert.equal(await page.evaluate(() => document.querySelector('.app').inert), false, 'the app behind is live again');
    await assertNoPageProblems(page, problems, 'tap correction');
  } finally {
    await app.close();
  }
});

test('the space bar: with a window or a menu open it never starts the playback; with none open it does', async () => {
  const { app, page, problems } = await startDemo();
  try {
    assert.equal(await engineState(page), 'ready');

    // Réglages (opened from the application bar), its cross focused: Space presses the cross, nothing plays.
    await clickBar(app, 'settings');
    await page.waitForFunction(() => window.__fabtice.store.getState().ui.settings.open, null, { timeout: 10000 });
    const cross = page.locator('[data-testid="reglages-fermer"]');
    await cross.waitFor({ timeout: 10000 });
    await cross.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !window.__fabtice.store.getState().ui.settings.open, null, { timeout: 10000 });
    assert.equal(await engineState(page), 'ready', 'Réglages: Space pressed the focused button and did not start the playback');

    // The bar menu open, « Correction de la courbe… » focused: Space presses it (the window of the taps opens), nothing plays.
    const bar = await barInView(page);
    await openBarMenu(page, bar);
    await page.locator(`${MENU} [data-action="tap"]`).focus();
    await page.keyboard.press('Space');
    await page.waitForSelector(BOX, { timeout: 10000 });
    await waitStep(page, 'prepare');
    assert.equal(await engineState(page), 'ready', 'bar menu: Space pressed the entry and did not start the playback');
    await page.keyboard.press('Escape');
    await waitTapWindowClosed(page, 10000);

    // No window open: Space plays and stops, also with a toolbar button focused (which it does not press).
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 30000 });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 10000 });
    const metronome = (await store(page)).playback.metronome;
    await page.locator('button.metronome').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 30000 });
    assert.equal((await store(page)).playback.metronome, metronome, 'the focused toolbar button was not pressed');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 10000 });
    await assertNoPageProblems(page, problems, 'space bar');
  } finally {
    await app.close();
  }
});
