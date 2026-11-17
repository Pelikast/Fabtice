// The captures of the structure column of « Grille d'accords » (C14, stage 5) for `npm run captures`: the column with a
// structure (whole chart), one part shown, a part corrected by hand, the part window, the empty state, and on a phone the
// bar under the title and the open sheet, the print window with « Une section » chosen (and its preview), and the calm
// notice of « Ouvrir dans iReal Pro » in the web app. Named `<form>-structure-…` (`ordinateur-…`, `telephone-…`).
// `modulationCaptures` (C10): the modulations on screen, named `<form>-modulations-…`: the chart with two modulations
// found by the analysis, then with the user's list (a bar with a letter, a signature and a modulation), the window, the
// bar menu, the ruler of « Pistes », the print window, and the settings tab « Détection des accords ».
// `simplifiedCaptures` (C14, fourth batch): « Grille complète simplifiée » of the owner's example piece, named
// `<form>-simplifiee-…`: on screen, while playing in the second pass of A (the lit bar and the repeat tag), a loop
// dragged over written bars, a modulation in the last chorus, the print window (one page) and the printed page itself.
//
// It is not run on its own: `tests/captures.mjs` calls it for each form, giving what its own sections use
// (the same `browser`, `openPage`, `snap`, `contextOptions`, `press` as in that file):
//
//   import { harmonyCaptures, modulationCaptures, simplifiedCaptures } from './captures-harmonie.mjs';
//   ...
//   ['structure du morceau', (form) => harmonyCaptures(form, { browser, openPage, snap, contextOptions, press })],
//   ['modulations de la grille', (form) => modulationCaptures(form, { browser, openPage, snap, contextOptions, press })],
//   ['grille simplifiée', (form) => simplifiedCaptures(form, { browser, openPage, snap, contextOptions, press })],

import { menuCommand } from './lib/menu.mjs';
import { openSettingsTab } from './lib/settings.mjs';

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

  // 7. The print window with « Une section » chosen: the preview is that part only, named under the title.
  {
    const { context, page } = await demo(form, deps);
    if (form.phone) await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
    else await press(page, page.locator('[data-testid="imprimer-grille"]'));
    await page.waitForSelector('[data-testid="impression"]');
    await sleep(400);
    await snap(page, form, 'structure-impression-complete');
    await press(page, page.locator('[data-testid="impression"] [data-choix="part"]'));
    await page.locator('[data-testid="impression-section"]').selectOption({ index: 1 });
    await sleep(300);
    // On a phone the options sit under the preview: bring the group into view next to it.
    if (form.phone) await page.evaluate(() => document.querySelector('.imp-section')?.scrollIntoView({ block: 'center' }));
    await sleep(250);
    await snap(page, form, 'structure-impression-section');
    await context.close();
  }

  // 8. « Ouvrir dans iReal Pro » in the web app: the link is followed (here intercepted), the page stays: the calm notice.
  {
    const context = await deps.browser.newContext(deps.contextOptions(form));
    await context.addInitScript(() => {
      document.addEventListener('click', (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[data-export="ireal-open"]') : null;
        if (a) e.preventDefault();
      }, true);
    });
    const page = await deps.openPage(context, '?demo&moteur=factice&vue=grille');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.vue-grille .case .ch', { timeout: 15000 });
    await sleep(300);
    await menuCommand(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro');
    await page.waitForSelector('[data-testid="avis-ireal"]', { timeout: 8000 });
    await sleep(500);
    await snap(page, form, 'ireal-avis');
    await context.close();
  }
}

// ---------------------------------------------------------------- C10, the modulations

/** The demo piece with the harmony pass suspended, and the analysis said to have found E major at bar 9 and A♭ at bar 17. */
async function detected(form, { browser, openPage, contextOptions }, query = '?demo&moteur=factice&vue=grille&harmonie=non', bars = [[8, 4], [16, 8]]) {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, query);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector(query.includes('vue=grille') ? '.vue-grille .case .ch' : '.frise', { timeout: 15000 });
  await page.evaluate((list) => {
    const f = window.__fabtice;
    const s = f.store.getState();
    const at = ([bar, tonic]) => ({ time: f.lot4.tempoMap.barStartTime(s.tempoMap, bar), key: { tonic, mode: 'major', confidence: 0.7, alternatives: [] } });
    f.store.setState({ analysis: { ...s.analysis, keyChanges: list.map(at) } });
  }, bars);
  await sleep(400);
  return { context, page };
}

/** A point of bar `bar` (index) that is none of its parts, for a right click or a long press. */
const freePoint = (page, bar) =>
  page.locator(`.vue-grille [data-mesure="${bar}"]`).evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    for (const fy of [0.55, 0.4, 0.7, 0.85]) for (let fx = 0.95; fx > 0.05; fx -= 0.05) {
      const x = b.left + b.width * fx;
      const y = b.top + b.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit) && !hit.closest('.accord-case, .section, .modulation, .numero, .signature')) return { x, y };
    }
    return null;
  });

async function openBarMenu(form, page, bar) {
  await page.evaluate((b) => document.querySelector(`.vue-grille [data-mesure="${b}"]`).scrollIntoView({ block: 'center' }), bar);
  await sleep(300);
  const at = await freePoint(page, bar);
  if (form.phone) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
    await sleep(1100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForSelector('[data-testid="menu-tempo"]');
  await sleep(700);
}

export async function modulationCaptures(form, deps) {
  const { snap, press } = deps;
  const centre = async (page, bar) => {
    await page.evaluate((b) => document.querySelector(`.vue-grille [data-mesure="${b}"]`).scrollIntoView({ block: 'center' }), bar);
    await sleep(300);
  };

  // 1. The chart with two modulations found by the analysis: quiet marks, the chords respelled.
  {
    const { context, page } = await detected(form, deps);
    await centre(page, 8);
    await snap(page, form, 'modulations-grille-analyse');

    // 2. The window on one of them, then with the key of the passage before: the calm sentence.
    await press(page, page.locator('.vue-grille [data-mesure="8"] .modulation'));
    await page.waitForSelector('[data-testid="modulation-dialogue"]');
    await sleep(800);
    await snap(page, form, 'modulations-fenetre');
    await press(page, page.locator('[data-testid="modulation-note-8"]'));
    await sleep(800);
    await snap(page, form, 'modulations-fenetre-meme-tonalite');
    await press(page, page.locator('[data-testid="modulation-annuler"]'));
    await sleep(300);

    // 3. The bar menu on a bar with a modulation, then on a bar without; the window from it.
    await openBarMenu(form, page, 8);
    await snap(page, form, 'modulations-menu-avec');
    await page.keyboard.press('Escape');
    await sleep(300);
    await openBarMenu(form, page, 4);
    await snap(page, form, 'modulations-menu-sans');
    await press(page, page.locator('[data-testid="menu-tempo"] [data-action="key"]'));
    await page.waitForSelector('[data-testid="modulation-dialogue"]');
    await sleep(800);
    await snap(page, form, 'modulations-fenetre-nouvelle');

    // 4. C major from bar 5, written by hand: the user's list now (the marks are ink); a bar with a letter, a signature and a mark.
    await press(page, page.locator('[data-testid="modulation-note-0"]'));
    await press(page, page.locator('[data-testid="modulation-valider"]'));
    await sleep(400);
    await page.evaluate(() => window.__fabtice.lot2.meter.setMeterFrom(8, { numerator: 3, denominator: 4 }));
    await sleep(400);
    await page.evaluate(() => document.querySelector('.vue-grille [data-mesure="4"]').scrollIntoView({ block: 'start' }));
    await sleep(400);
    await snap(page, form, 'modulations-grille-main');
    await context.close();
  }

  // 5. Crowded chords under a letter and a mark, in the key of the passage.
  {
    const { context, page } = await detected(form, deps);
    await page.evaluate(() => {
      const c = (root, quality, extensions = []) => ({ root, quality, extensions, bass: null });
      window.__fabtice.lot2.harmony.setBarChords(8, [{ beatInBar: 0, chord: c(4, 'min7', ['b5', '9']) }, { beatInBar: 1, chord: c(9, '7', ['#9', 'b13']) }, { beatInBar: 2, chord: c(2, 'min7', ['9', '11']) }, { beatInBar: 3, chord: c(7, '7', ['b9', 'b13']) }]);
    });
    await centre(page, 8);
    await snap(page, form, 'modulations-grille-accords-serres');
    await context.close();
  }

  // 6. The ruler of « Pistes »: the stronger bar line and the key, at the bar where it changes.
  {
    const { context, page } = await detected(form, deps, '?demo&moteur=factice&harmonie=non', [[1, 4], [3, 8]]);
    await page.evaluate((pps) => window.__fabtice.actions.setZoom(pps), form.phone ? 90 : 130);
    await sleep(700);
    await snap(page, form, 'modulations-regle');
    await context.close();
  }

  // 7. The paper: the print window, then the sheet alone close up (its preview is the paper).
  {
    const { context, page } = await detected(form, deps);
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
    await page.waitForSelector('[data-testid="impression"]');
    await sleep(500);
    await snap(page, form, 'modulations-impression');
    await context.close();
  }

  // 8. « Réglages », « Détection des accords »: « Détecter les modulations », « Structure automatique », « Mode ».
  {
    const context = await deps.browser.newContext(deps.contextOptions(form));
    const page = await deps.openPage(context, '?demo&moteur=factice');
    await sleep(500);
    await openSettingsTab(page, 'chords');
    await sleep(400);
    await snap(page, form, 'modulations-reglages');
    await context.close();
  }
}

// ---------------------------------------------------------------- C14, the simplified chart

/** The made-up piece of the owner's example (`demo/demoAutumn.ts`), the simplified chart on screen. */
async function feuilles(form, { browser, openPage, contextOptions }, query = '?demo&piece=feuilles&moteur=factice&vue=grille') {
  const context = await browser.newContext(contextOptions(form));
  const page = await openPage(context, query);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.vue-grille .case .ch', { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.structure.display.showSimplifiedChart());
  await page.waitForSelector('[data-testid="grille-simplifiee"]');
  await sleep(600);
  return { context, page };
}

const barSeconds = (bar) => 0.5 + 2 * bar;

export async function simplifiedCaptures(form, deps) {
  const { snap, press } = deps;
  const top = (page) => page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));

  // 1. The simplified chart on screen: the form line, the blocks, the repeat signs, the final double bar.
  {
    const { context, page } = await feuilles(form, deps);
    await top(page);
    await page.evaluate((t) => window.__fabtice.actions.seek(t), barSeconds(0));
    await sleep(300);
    await snap(page, form, 'simplifiee-ecran');
    await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = document.querySelector('.vue-grille').scrollHeight));
    await sleep(300);
    await snap(page, form, 'simplifiee-ecran-fin');
    if (form.phone) {
      await top(page);
      await press(page, page.locator('[data-testid="structure-barre"]'));
      await page.waitForSelector('[data-testid="structure-feuille"]');
      await sleep(450);
      await snap(page, form, 'simplifiee-feuille');
    }
    await context.close();
  }

  // 2. While playing, in the second pass of A: the lit bar and the repeat tag (« reprise 2/6 »).
  {
    const { context, page } = await feuilles(form, deps);
    await page.evaluate((t) => window.__fabtice.actions.seek(t), barSeconds(9) + 0.4);
    await page.evaluate(() => window.__fabtice.actions.play());
    await sleep(900);
    await snap(page, form, 'simplifiee-lecture-2e-passage');
    await page.evaluate(() => window.__fabtice.actions.pause());
    // The same bars heard in the piano solo: another time, another tag.
    await page.evaluate((t) => window.__fabtice.actions.seek(t), barSeconds(49) + 0.7);
    await page.evaluate(() => document.querySelector('[data-testid="grille-simplifiee"] [data-bloc="B"]').scrollIntoView({ block: 'center' }));
    await sleep(500);
    await snap(page, form, 'simplifiee-lecture-solo');
    await context.close();
  }

  // 3. A loop dragged over written bars: the veil on the bars, the played bars of the next occurrence.
  {
    const { context, page } = await feuilles(form, deps);
    await page.evaluate((t) => window.__fabtice.actions.seek(t), barSeconds(33) + 0.4);
    const cell = (i) =>
      page.evaluate((k) => {
        const e = document.querySelector(`[data-testid="grille-simplifiee"] [data-ecrite="${k}"]`);
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.7 };
      }, i);
    const a = await cell(1);
    const b = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="grille-simplifiee"] [data-ecrite="3"]').getBoundingClientRect();
      return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.7 };
    });
    if (form.phone) {
      const cdp = await page.context().newCDPSession(page);
      const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await t('touchStart', a.x, a.y);
      await sleep(650);
      for (let k = 1; k <= 6; k++) {
        await t('touchMove', a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
        await sleep(40);
      }
      await t('touchEnd');
      await cdp.detach();
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) {
        await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
        await sleep(20);
      }
      await page.mouse.up();
    }
    await sleep(400);
    await snap(page, form, 'simplifiee-boucle');
    await context.close();
  }

  // 4. A modulation in the last chorus (written by hand from bar 90): its mark above the first bar of the block.
  {
    const { context, page } = await feuilles(form, deps);
    await page.evaluate((t) => window.__fabtice.lot2.key.addKeyChange(t + 0.05, { tonic: 1, mode: 'minor' }), barSeconds(89));
    await sleep(700);
    await page.evaluate(() => {
      const marks = [...document.querySelectorAll('[data-testid="grille-simplifiee"] .modulation-lue')];
      (marks[0] ?? document.querySelector('[data-testid="grille-simplifiee"] .bloc:last-child')).scrollIntoView({ block: 'center' });
    });
    await sleep(400);
    await snap(page, form, 'simplifiee-modulation');
    await context.close();
  }

  // 5. The print window on the simplified chart: one page; then the page itself, at life size, large enough to read.
  {
    const { context, page } = await feuilles(form, deps);
    await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
    await page.waitForSelector('[data-testid="impression"]');
    await press(page, page.locator('[data-testid="impression"] [data-choix="a4"]'));
    await sleep(500);
    await snap(page, form, 'simplifiee-impression');
    // The paper: print media puts the sheet back to its size (the preview only shrinks it).
    await page.setViewportSize({ width: 900, height: 1250 });
    await page.emulateMedia({ media: 'print' });
    await sleep(500);
    await snap(page, form, 'simplifiee-papier', page.locator('.pp-papier').first());
    await page.emulateMedia({ media: 'screen' });
    await context.close();
  }
}
