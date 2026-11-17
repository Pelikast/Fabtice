// The captures of the structure column of « Grille d'accords » (C14, stage 5) for `npm run captures`: the column with a
// structure (whole chart), one part shown, a part corrected by hand, the part window, the empty state, and on a phone the
// bar under the title and the open sheet. Named `<form>-structure-…` (`ordinateur-…`, `telephone-…`).
//
// It is not run on its own: `tests/captures.mjs` calls it for each form, giving what its own sections use
// (the same `browser`, `openPage`, `snap`, `contextOptions`, `press` as in that file):
//
//   import { harmonyCaptures } from './captures-harmonie.mjs';
//   ...
//   ['structure du morceau', (form) => harmonyCaptures(form, { browser, openPage, snap, contextOptions, press })],

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The demo piece with its made-up detected structure, on the chord chart. */
async function demo(form, { browser, openPage, contextOptions }) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, '?demo&structure=demo&moteur=factice&vue=grille');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.vue-grille .case .ch', { timeout: 15000 });
  await sleep(300);
  return { context, page };
}

export async function harmonyCaptures(form, deps) {
  const { snap, press } = deps;
  const bar = (page) => page.locator('[data-testid="structure-barre"]');
  /** On a phone the list is in a sheet: open it, or close it. */
  const openList = async (page) => {
    if (form.phone && (await page.locator('[data-testid="structure-feuille"]').count()) === 0) {
      await press(page, bar(page));
      await page.waitForSelector('[data-testid="structure-feuille"]');
      await sleep(350);
    }
  };
  const closeList = async (page) => {
    if (form.phone && (await page.locator('[data-testid="structure-feuille"]').count()) === 1) {
      await press(page, page.locator('[data-testid="structure-fermer"]'));
      await sleep(250);
    }
  };
  const part = (page, name) => page.locator('[data-testid="structure-partie"]', { has: page.locator('.structure-nom-texte', { hasText: name }) });

  // 1. The column with a structure, the whole chart; on a phone, the bar, then the open sheet.
  {
    const { context, page } = await demo(form, deps);
    await page.evaluate(() => window.__fabtice.actions.seek(0));
    await sleep(300);
    await snap(page, form, 'structure-complet');
    if (form.phone) {
      await openList(page);
      await snap(page, form, 'structure-feuille');
      await closeList(page);
    }

    // 2. One part shown, the playhead at its start, a loop on another part.
    await openList(page);
    await press(page, part(page, 'Solo (Guitare)').locator('[data-testid="structure-boucle"]'));
    await sleep(300);
    await openList(page);
    await press(page, part(page, 'Thème 1').locator('.structure-nom'));
    await sleep(400);
    if (form.phone) await openList(page);
    await snap(page, form, 'structure-partie');
    await closeList(page);

    // 3. The window of a part, then the part corrected by hand.
    await openList(page);
    await press(page, part(page, 'Solo (Trompette)').locator('[data-testid="structure-modifier"]'));
    await page.waitForSelector('[data-testid="partie-dialogue"]');
    await sleep(350);
    await snap(page, form, 'structure-fenetre');
    await page.locator('[data-testid="partie-numero"]').selectOption('2');
    await page.locator('[data-testid="partie-instrument"]').selectOption('saxophone');
    await page.locator('[data-testid="partie-a"]').fill('40');
    await sleep(200);
    await snap(page, form, 'structure-fenetre-invalide');
    await page.locator('[data-testid="partie-a"]').fill('19');
    await press(page, page.locator('[data-testid="partie-valider"]'));
    await sleep(400);
    await openList(page);
    await snap(page, form, 'structure-corrigee');
    await closeList(page);

    // 4. Pop: the same piece named in the other mode (the detection stood in for by the test handle).
    await openList(page);
    await press(page, page.locator('[data-testid="structure-revenir"]'));
    await press(page, page.locator('[data-testid="structure-mode-pop"]'));
    await page.evaluate(() => window.__fabtice.structure.setDetected(window.__fabtice.structure.demo('pop')));
    await sleep(300);
    await snap(page, form, 'structure-pop');
    await closeList(page);

    // 5. The simplified display, not written yet.
    await openList(page);
    await press(page, page.locator('[data-testid="structure-affichage-simplifie"]'));
    await sleep(300);
    await closeList(page);
    await snap(page, form, 'structure-simplifiee');
    await context.close();
  }

  // 6. No structure at all: the column keeps its texts and offers to add a part.
  {
    const { context, page } = await demo(form, deps);
    await page.evaluate(() => window.__fabtice.structure.setDetected(null));
    await sleep(300);
    await openList(page);
    await snap(page, form, 'structure-vide');
    await context.close();
  }
}
