// Captures of « Correction de la courbe en tapant le tempo » (C12), for `tests/captures.mjs`: one section, in the
// two forms of the app (a computer, a phone), the way `tests/tap-fix.mjs` reaches each moment.
//
//   import { tapFixCaptures } from './captures-tap.mjs';
//   ...
//   await tapFixCaptures(form, { browser, contextOptions, openPage, snap, press, sleep });
//
// The helpers are those of `captures.mjs` (`browser`, `contextOptions(form)`, `openPage(context, query)`,
// `snap(page, form, name)`, `press(page, locator)`, `sleep`). Files written (`ordinateur-…`, `telephone-…`):
//   tempo-menu-de-la-mesure, tapes-preparation, tapes-decompte, tapes-en-cours, tapes-verification,
//   tapes-refus, tapes-attente.

const BAR = 6; // index; « mesure 7 », inside the demo's loop and away from its edges
const BOX = '[data-testid="tapes"]';

/** The ruler's points of the bars whose line is on screen. */
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

export async function tapFixCaptures(form, { browser, contextOptions, openPage, snap, press, sleep }) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice');
  await sleep(500);

  const barOnScreen = async () => {
    let at = (await rulerBars(page)).find((b) => b.bar === BAR);
    for (let i = 0; i < 20 && !at; i++) {
      if (i === 0) {
        await page.evaluate((b) => {
          const s = window.__fabtice.store.getState();
          window.__fabtice.actions.seek(s.tempoMap.segments.find((x) => Math.abs(x.beat - b * s.tempoMap.meters[0].meter.numerator) < 1e-6).time);
        }, BAR);
      }
      await sleep(150);
      at = (await rulerBars(page)).find((b) => b.bar === BAR);
    }
    return at;
  };
  /** The bar menu at the bar (a right click; a long press on a phone). */
  const openMenu = async () => {
    const at = await barOnScreen();
    if (form.phone) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
      await sleep(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.click(at.x, at.y, { button: 'right' });
    }
    await page.waitForSelector('[data-testid="menu-tempo"]');
  };
  const beats = await page.evaluate((b) => {
    const s = window.__fabtice.store.getState();
    return s.tempoMap.segments.filter((x) => x.beat >= b * s.tempoMap.meters[0].meter.numerator - 1e-6).slice(0, 8).map((x) => x.time);
  }, BAR);
  const tapAt = async (time) => {
    await page.waitForFunction((t) => window.__fabtice.engine.getPosition() >= t, time, { polling: 'raf', timeout: 30000 });
    if (form.phone) {
      const b = await page.locator('[data-testid="tapes-zone"]').boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else {
      await page.keyboard.press('Space');
    }
  };
  const waitStep = (name) => page.waitForSelector(`${BOX}[data-etape="${name}"]`, { timeout: 15000 });
  const go = async () => {
    await press(page, page.locator('[data-testid="tapes-depart"]'));
    await waitStep('tapping');
  };

  // The menu, with its four entries.
  await openMenu();
  await snap(page, form, 'tempo-menu-de-la-mesure');
  await press(page, page.locator('[data-action="tap"]'));
  await page.waitForSelector(BOX);
  await snap(page, form, 'tapes-preparation');

  // The count-in, then the taps.
  await go();
  await sleep(500);
  await snap(page, form, 'tapes-decompte');
  for (let k = 0; k < 4; k++) await tapAt(beats[k] + 0.02);
  await sleep(100);
  await snap(page, form, 'tapes-en-cours');
  await press(page, page.locator('[data-testid="tapes-fini"]'));
  await waitStep('check');
  await snap(page, form, 'tapes-verification');

  // Too few taps: the calm refusal.
  await press(page, page.locator('[data-testid="tapes-reessayer"]'));
  await waitStep('prepare');
  await go();
  await press(page, page.locator('[data-testid="tapes-fini"]'));
  await waitStep('refused');
  await snap(page, form, 'tapes-refus');

  // « C'est bon, c'est corrigé »: the wait while the rest of the piece is analysed.
  await press(page, page.locator('[data-testid="tapes-encore"]'));
  await waitStep('prepare');
  await go();
  for (let k = 0; k < 5; k++) await tapAt(beats[k] + 0.02);
  await press(page, page.locator('[data-testid="tapes-fini"]'));
  await waitStep('check');
  await press(page, page.locator('[data-testid="tapes-ok"]'));
  await waitStep('committing');
  await snap(page, form, 'tapes-attente');
  await context.close();
}
