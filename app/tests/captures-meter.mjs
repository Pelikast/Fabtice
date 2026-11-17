// The captures of « Changer la signature rythmique » (C13) for `npm run captures` (stage 4): the window (as
// it opens, and with 7/8 typed), the ruler of « Pistes » with a signature change, the chord chart with the same
// change. Named `<form>-signature-…` (`ordinateur-…`, `telephone-…`).
//
// It is not run on its own: `tests/captures.mjs` calls it for each form, giving what its own sections use
// (the same `browser`, `openPage`, `snap`, `contextOptions`, `press` as in that file):
//
//   import { meterCaptures } from './captures-meter.mjs';
//   ...
//   ['signature rythmique', (form) => meterCaptures(form, { browser, openPage, snap, contextOptions, press })],

import { openBarMenu } from './lib/bar-menu.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The demo piece (110 BPM, 4/4, its chords) opened as the other sections do; the phone's view is brought back to the first bars. */
async function demo(form, { browser, openPage, contextOptions }, query) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, query);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready' || document.querySelector('.vue-grille'), null, { timeout: 15000 });
  const cdp = form.phone ? await context.newCDPSession(page) : null;
  return { context, page, cdp };
}

export async function meterCaptures(form, deps) {
  const { snap, press } = deps;

  // 1. The window, from the bar menu: as it opens, then with a 7/8 typed (the hint about the quarter note).
  {
    const { context, page, cdp } = await demo(form, deps, '?demo&analyse=aucune&moteur=factice');
    await page.mouse.move(form.phone ? 250 : 700, 400);
    await page.mouse.wheel(-8000, 0);
    await sleep(500);
    await openBarMenu(page, 2, cdp);
    await snap(page, form, 'signature-menu');
    await press(page, page.locator('[data-testid="menu-tempo"] [data-action="meter"]'));
    await page.waitForSelector('[data-testid="signature"]');
    await sleep(300);
    await snap(page, form, 'signature-fenetre');
    await page.locator('[data-testid="signature-haut"]').fill('7');
    await page.selectOption('[data-testid="signature-bas"]', '8');
    await snap(page, form, 'signature-fenetre-7-8');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (document.querySelector('.frise')?.dataset.signatures ?? '') !== '');
    await sleep(300);
    // 2. The ruler with the change (the real command, from the window).
    await snap(page, form, 'signature-regle');
    // The window opened again on that bar: the change can be removed.
    await openBarMenu(page, 2, cdp);
    await press(page, page.locator('[data-testid="menu-tempo"] [data-action="meter"]'));
    await page.waitForSelector('[data-testid="signature-retirer"]');
    await sleep(300);
    await snap(page, form, 'signature-fenetre-retrait');
    await context.close();
  }

  // 3. The chord chart with the same change, and the « only this bar » one (a change, then the return).
  {
    const { context, page } = await demo(form, deps, '?demo&moteur=factice&vue=grille');
    await page.waitForSelector('.vue-grille .case .ch');
    await page.evaluate(() => window.__fabtice.lot2.meter.setMeterFrom(8, { numerator: 7, denominator: 8 }));
    await sleep(500);
    await snap(page, form, 'signature-grille');
    await page.evaluate(() => {
      window.__fabtice.history.undo();
      window.__fabtice.lot2.meter.setMeterForBar(4, { numerator: 5, denominator: 4 });
    });
    await sleep(500);
    await snap(page, form, 'signature-grille-une-mesure');
    await context.close();
  }
}
