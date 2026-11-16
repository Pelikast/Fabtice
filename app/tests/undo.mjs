// « Annuler » / « Rétablir » in Chromium (C11): on the demo piece, a click
// (mute), a slider dragged slowly (one step, whatever the pauses), a chord
// typed in the chart, a loop drawn on the lanes; Ctrl + Z / Ctrl + Maj + Z /
// Ctrl + Y (cmd on a Mac) put back what is on screen; typing in a text field
// then Ctrl + Z undoes the typing, not the piece. Desktop (1280 × 800, mouse,
// also as a Mac) and phone (390 × 844, touch). Uses the silent engine.
//   npm run build && npm run test:undo

import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

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

async function open(query, options, initScript) {
  const context = await browser.newContext(options);
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => window.__fabtice.ready);
  return { context, page, errors };
}
const status = (page) => page.evaluate(() => window.__fabtice.history.historyStatus());
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const pressed = (page, sel) => page.getAttribute(sel, 'aria-pressed');
const MUTE = '.piste-tete >> nth=0 >> button.muet';
const VOLUME = '.piste-tete >> nth=0 >> input.volume';

/** Drags a slider from its thumb to the left, slowly, with a long pause half way. */
async function dragSlider(page, sel, by) {
  const b = await page.locator(sel).boundingBox();
  const { min, max, value } = await page.$eval(sel, (el) => ({ min: Number(el.min), max: Number(el.max), value: Number(el.value) }));
  const y = b.y + b.height / 2;
  // The thumb (11 px wide, DESIGN.md) where the value is.
  const x0 = b.x + 5.5 + ((b.width - 11) * (value - min)) / (max - min);
  if (by === 'mouse') {
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 - b.width * 0.25, y, { steps: 5 });
    await sleep(900); // longer than the coalescing window: still the same gesture
    await page.mouse.move(x0 - b.width * 0.5, y, { steps: 5 });
    await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', x0);
    for (let i = 1; i <= 5; i++) await touch('touchMove', x0 - (b.width * 0.25 * i) / 5);
    await sleep(900);
    for (let i = 6; i <= 10; i++) await touch('touchMove', x0 - (b.width * 0.25 * i) / 5);
    await touch('touchEnd', 0);
  }
  await sleep(50);
}

async function undoKeys(page, mod, label) {
  // ------------------------------------------------ a click: mute
  check(`${label}: nothing to undo at first`, !(await status(page)).canUndo);
  await page.click(MUTE);
  check(`${label}: « M » mutes the first track`, (await pressed(page, MUTE)) === 'true');
  const st = await status(page);
  check(`${label}: one step, named`, st.canUndo && st.undoLabel === 'Annuler : piste coupée', st.undoLabel);
  await page.keyboard.press(`${mod}+z`);
  check(`${label}: ${mod} + Z puts the track back on (on screen)`, (await pressed(page, MUTE)) === 'false');
  check(`${label}: … and it can be redone`, (await status(page)).redoLabel === 'Rétablir : piste coupée');
  await page.keyboard.press(`${mod}+Shift+z`);
  check(`${label}: Maj + ${mod} + Z mutes it again`, (await pressed(page, MUTE)) === 'true');
  await page.keyboard.press(`${mod}+z`);
  check(`${label}: undone again`, (await pressed(page, MUTE)) === 'false');
}

try {
  // ------------------------------------------------------------ desktop, mouse, Ctrl
  {
    const { context, page, errors } = await open('?demo&moteur=factice', { viewport: { width: 1280, height: 800 } });
    await undoKeys(page, 'Control', 'desktop');
    await page.keyboard.press('Control+y');
    check('desktop: Ctrl + Y redoes too', (await pressed(page, MUTE)) === 'true');
    await page.keyboard.press('Control+z');

    // A slider dragged slowly is one step.
    const v0 = Number(await page.inputValue(VOLUME));
    await dragSlider(page, VOLUME, 'mouse');
    const v1 = Number(await page.inputValue(VOLUME));
    check('desktop: the volume slider was dragged', v1 < v0 - 20, `${v0} → ${v1}`);
    let st = await status(page);
    check('desktop: the drag is one step (« volume de la piste »), what was redoable is gone', st.undoLabel === 'Annuler : volume de la piste' && !st.canRedo, JSON.stringify(st));
    await page.keyboard.press('Control+z');
    check('desktop: Ctrl + Z puts the slider back where it was, in one step', Number(await page.inputValue(VOLUME)) === v0 && !(await status(page)).canUndo, await page.inputValue(VOLUME));
    check('desktop: the engine hears it', await page.evaluate(() => window.__fabtice.engine.snapshot().tracks[0].mix.volume === window.__fabtice.store.getState().tracks[0].volume));
    await page.keyboard.press('Control+Shift+z');
    check('desktop: redone: the slider where the drag left it', Number(await page.inputValue(VOLUME)) === v1);

    // A loop drawn on the lanes, slowly: one step.
    const loopBefore = (await state(page)).loop;
    const area = await page.locator('.frise-corps').boundingBox();
    const voie = await page.locator('.frise-voie').first().boundingBox();
    const ly = voie.y + voie.height / 2;
    await page.mouse.move(area.x + area.width * 0.55, ly);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.65, ly, { steps: 4 });
    await sleep(900);
    await page.mouse.move(area.x + area.width * 0.75, ly, { steps: 4 });
    await page.mouse.up();
    await sleep(100);
    const loopAfter = (await state(page)).loop;
    const changed = JSON.stringify(loopAfter) !== JSON.stringify(loopBefore);
    check('desktop: a loop drawn on the lanes', changed, JSON.stringify(loopAfter.region));
    st = await status(page);
    check('desktop: … is one step (« boucle »)', st.undoLabel === 'Annuler : boucle', st.undoLabel);
    await page.keyboard.press('Control+z');
    const back = (await state(page)).loop;
    check('desktop: Ctrl + Z gives back the loop before the drawing', JSON.stringify(back) === JSON.stringify(loopBefore) && (await status(page)).undoLabel === 'Annuler : volume de la piste', JSON.stringify(back.region));

    // A chord typed in the chart.
    await page.click('button[data-vue="grille"]');
    await page.waitForSelector('.vue-grille .case[data-mesure="2"] .accord-case[data-accord="0"]');
    const chordText = () => page.locator('.case[data-mesure="2"] .ch').first().innerText();
    const before = await chordText();
    await page.locator('.case[data-mesure="2"] .accord-case[data-accord="0"]').click();
    await page.waitForSelector('[data-testid="editeur"] .editeur-saisie input');
    await page.fill('[data-testid="editeur"] .editeur-saisie input', 'Ebmaj7');
    await page.keyboard.press('Enter');
    await sleep(150);
    const typed = await chordText();
    check('desktop: a chord typed in the chart', typed !== before && typed.startsWith('E'), `${before} → ${typed}`);
    check('desktop: … one step (« accords »)', (await status(page)).undoLabel === 'Annuler : accords');
    await page.keyboard.press('Control+z');
    await sleep(100);
    check('desktop: Ctrl + Z gives back the chord on screen', (await chordText()) === before, await chordText());
    await page.keyboard.press('Control+Shift+z');
    await sleep(100);
    check('desktop: Ctrl + Maj + Z writes it again', (await chordText()) === typed);

    // Typing in a text field: Ctrl + Z undoes the typing, not the piece.
    await page.locator('.case[data-mesure="3"] .accord-case[data-accord="0"]').click();
    await page.waitForSelector('[data-testid="editeur"] .editeur-saisie input');
    const input = '[data-testid="editeur"] .editeur-saisie input';
    await page.focus(input);
    await page.fill(input, '');
    await page.keyboard.type('Bb7', { delay: 30 });
    const corrections = JSON.stringify((await state(page)).corrections);
    const stBefore = await status(page);
    await page.keyboard.press('Control+z');
    await sleep(100);
    const value = await page.inputValue(input);
    check('desktop: in the chord field, Ctrl + Z undoes the typing', value !== 'Bb7', JSON.stringify(value));
    check('desktop: … and not the piece', JSON.stringify((await state(page)).corrections) === corrections && JSON.stringify(await status(page)) === JSON.stringify(stBefore) && (await chordText()) === typed);
    await page.keyboard.press('Escape');
    await sleep(100);
    check('desktop: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ desktop as a Mac: cmd
  {
    const { context, page, errors } = await open('?demo&moteur=factice', { viewport: { width: 1280, height: 800 } }, () => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    });
    await undoKeys(page, 'Meta', 'Mac');
    await page.click(MUTE);
    await page.keyboard.press('Control+z');
    check('Mac: Ctrl + Z is not the shortcut there', (await pressed(page, MUTE)) === 'true');
    check('Mac: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ phone, touch
  {
    const { context, page, errors } = await open('?demo&moteur=factice', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const st0 = await status(page);
    check('phone: nothing to undo at first', !st0.canUndo);
    await page.tap(MUTE);
    check('phone: a tap on « M » mutes the track, one step', (await pressed(page, MUTE)) === 'true' && (await status(page)).undoLabel === 'Annuler : piste coupée');
    await page.evaluate(() => window.__fabtice.history.undo());
    check('phone: undone (as the menu will do it)', (await pressed(page, MUTE)) === 'false');
    // On a phone the tracks show no volume: the click's volume, in the metronome panel.
    await page.tap('[data-testid="clic-reglages"]');
    await page.waitForSelector('[data-testid="panneau-metronome"]');
    await sleep(300);
    const CLICK = '[data-testid="clic-volume"]';
    const v0 = Number(await page.inputValue(CLICK));
    await dragSlider(page, CLICK, 'touch');
    const v1 = Number(await page.inputValue(CLICK));
    check('phone: the click volume slider was dragged with a finger', v1 < v0 - 5, `${v0} → ${v1}`);
    const st = await status(page);
    check('phone: the drag is one step', st.undoLabel === 'Annuler : réglages du métronome' && st.canUndo, JSON.stringify(st));
    await page.evaluate(() => window.__fabtice.history.undo());
    check('phone: undone in one step, on screen and in the engine', Number(await page.inputValue(CLICK)) === v0 && !(await status(page)).canUndo && (await page.evaluate(() => window.__fabtice.engine.snapshot().metronomeVolume)) === v0 / 100);
    check('phone: no page error', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} catch (e) {
  failed++;
  console.log(`FAIL  unexpected: ${e.stack || e}`);
} finally {
  await browser.close();
  srv.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
