// The captures of « Alléger le travail pour l'appareil » (C2) for `npm run captures` (stage 6): the case in
// « Nouveau projet » (alone, then with the instruments ticked), in Réglages → Général, the slider in Réglages →
// Avancé, and the case in the separation panel. Named `<form>-alleger-…` (`ordinateur-…`, `telephone-…`).
//
// It is not run on its own: `tests/captures.mjs` calls it for each form, giving what its own sections use
// (the same `browser`, `openPage`, `snap`, `contextOptions`, `press` as in that file):
//
//   import { easeCaptures } from './captures-alleger.mjs';
//   ...
//   ['alléger le travail', (form) => easeCaptures(form, { browser, openPage, snap, contextOptions, press })],

import { openSettingsTab } from './lib/settings.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitOpen = (page) => page.waitForFunction(() => document.querySelector('.voile-projet')?.classList.contains('ouverte'));

/** The window of « Nouveau projet », as it opens at launch. */
async function newProject(form, { browser, openPage, contextOptions, press, snap }) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?debug&moteur=factice');
  await waitOpen(page);
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  await snap(page, form, 'alleger-nouveau');
  // The instruments ticked, then the case: the announced wait gets longer.
  await press(page, page.locator('[data-testid="separer-case"]'));
  await press(page, page.locator('[data-testid="alleger-nouveau"]'));
  await sleep(300);
  await snap(page, form, 'alleger-nouveau-cochee');
  await context.close();
}

/** Réglages → Général with the case ticked, and → Avancé with the slider (at 60 %). */
async function settings(form, { browser, openPage, contextOptions, press, snap }) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice');
  await sleep(500);
  await openSettingsTab(page, 'general');
  await sleep(300);
  await snap(page, form, 'alleger-reglages-general');
  await press(page, page.locator('[data-testid="alleger-reglages"]'));
  await sleep(300);
  await snap(page, form, 'alleger-reglages-general-cochee');

  await openSettingsTab(page, 'advanced');
  await sleep(300);
  await page.locator('[data-testid="alleger-curseur"]').scrollIntoViewIfNeeded();
  await snap(page, form, 'alleger-reglages-avance');
  // 60 %: the slider moved by the keyboard as a user would, the value and the note of the case following.
  await page.locator('[data-testid="alleger-pourcentage"]').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await sleep(250);
  await page.locator('[data-testid="alleger-curseur"]').scrollIntoViewIfNeeded();
  await snap(page, form, 'alleger-reglages-avance-60');
  await context.close();
}

/** The separation panel, where a separation is launched later. */
async function panel(form, { browser, openPage, contextOptions, press, snap }) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&moteur=factice');
  await sleep(500);
  await press(page, page.locator('[data-testid="separer"]'));
  await page.waitForSelector('[data-testid="panneau-separation"]');
  await sleep(500);
  await snap(page, form, 'alleger-panneau-separation');
  await press(page, page.locator('[data-testid="alleger-separation"]'));
  await sleep(400);
  await snap(page, form, 'alleger-panneau-separation-cochee');
  await context.close();
}

export async function easeCaptures(form, deps) {
  await newProject(form, deps);
  await settings(form, deps);
  await panel(form, deps);
}
