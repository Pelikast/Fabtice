// Smoke test of the built interface in Chromium: serves web/ with the
// isolation headers, opens ?demo and drives the shell.
//   npm run build && npm run test:smoke
// Screenshots go to $FABTICE_SMOKE_OUT (default: a temporary folder), never
// into the repository. Playwright and Chromium are expected preinstalled
// (here under /opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from
// elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_SMOKE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-smoke-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(query, viewport, init) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  if (init) await page.addInitScript(init);
  await page.goto(`${url}/${query}`);
  return { page, errors };
}
const ready = (page) => page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const snapshot = (page) => page.evaluate(() => window.__fabtice.engine.snapshot());
const text = (page, sel) => page.locator(sel).first().innerText();

try {
  // ------------------------------------------------------------ desktop size, demo
  {
    const { page, errors } = await open('?demo', { width: 1280, height: 800 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    check('cross-origin isolated', await page.evaluate(() => crossOriginIsolated));

    // Shell
    check('top bar: brand and title', (await text(page, '.marque')) === 'Fabtice' && (await text(page, '.projet-titre')) === 'Blues du dimanche');
    check('top bar: export visible but disabled', await page.locator('button:has-text("Exporter")').isDisabled());
    check('four track headers', (await page.locator('.piste-tete').count()) === 4);
    check('four timeline lanes (placeholder)', (await page.locator('.frise-voie').count()) === 4);
    check('ruler heads: tempo and bars, no chords row', (await page.locator('.rang-tete').count()) === 2 && (await text(page, '.rang-tete.tempo')).toUpperCase().includes('TEMPO · 110'));
    check('dialog closed with a project', !(await page.locator('.voile').evaluate((el) => el.classList.contains('ouverte'))));
    check('transport position', (await text(page, '.temps')) === '0:09,3' && (await text(page, '.ou')).includes('mesure 5 · temps 1 · boucle 5–8'), await text(page, '.ou'));
    await page.screenshot({ path: path.join(out, 'app-1280.png') });

    // Play / pause
    const before = await text(page, '.temps');
    await page.click('.jouer');
    await sleep(700);
    check('play: button pressed, engine playing', (await page.getAttribute('.jouer', 'aria-pressed')) === 'true' && (await snapshot(page)).state === 'playing');
    check('play: the clock moves (read every frame)', (await text(page, '.temps')) !== before, `${before} -> ${await text(page, '.temps')}`);
    await page.click('.jouer');
    check('pause', (await page.getAttribute('.jouer', 'aria-pressed')) === 'false' && (await snapshot(page)).state === 'ready');

    // Space toggles playback, even with a button focused
    await page.focus('.metronome');
    await page.keyboard.press('Space');
    await sleep(100);
    const spaced = await snapshot(page);
    check('Space plays without pressing the focused button', spaced.state === 'playing' && spaced.metronome === false);
    await page.keyboard.press('Space');
    check('Space pauses', (await snapshot(page)).state === 'ready');

    // Back to the loop start
    await page.click('[aria-label="Revenir au début de la boucle"]');
    const loopStart = (await state(page)).loop.region.start;
    check('back to loop start', Math.abs((await snapshot(page)).position - loopStart) < 1e-6);

    // Key
    await page.click('[aria-label="Un demi-ton plus haut"]');
    await page.click('[aria-label="Un demi-ton plus haut"]');
    await page.click('[aria-label="Un demi-ton plus bas"]');
    await page.click('[aria-label="Un demi-ton plus haut"]');
    check('key +2 shown and sent to the engine', (await text(page, '[data-testid="ton"]')) === '+2' && (await snapshot(page)).semitones === 2);
    await page.click('[aria-label="Régler finement la tonalité"]');
    check('fine tuning panel opens', await page.locator('.panneau-accord').isVisible());
    await sleep(300);
    await page.click('[aria-label="Un cent plus haut"]');
    await page.click('[aria-label="Un cent plus haut"]');
    check('cents sent to the engine', (await snapshot(page)).cents === 2 && (await text(page, '[data-testid="cents"]')) === '+2 cents');
    await page.screenshot({ path: path.join(out, 'app-1280-accord-fin.png') });
    await page.keyboard.press('Escape');
    check('Escape closes the tuning panel', (await page.locator('.panneau-accord').count()) === 0);
    check('cents shown under the key', (await text(page, '.reglage .valeur small')) === '+2 cents');

    // Tempo
    await page.click('[aria-label="Ralentir"]');
    await page.click('[aria-label="Ralentir"]');
    const snapTempo = await snapshot(page);
    check('tempo 100 shown, ratio sent to the engine', (await text(page, '[data-testid="tempo"]')) === '100' && Math.abs(snapTempo.tempoRatio - 100 / 110) < 1e-9, `${snapTempo.tempoRatio}`);
    check('tempo: original shown', (await text(page, '.reglage:nth-of-type(2) .valeur small')) === 'original 110');

    // Sub-grid, triplets, metronome, magnet, zoom
    await page.selectOption('.choix select', '4');
    await page.click('.bascule');
    const v = (await state(page)).view;
    check('sub-grid and triplets', v.subdivision === 4 && v.triplets === true);
    await page.click('.metronome');
    check('metronome on', (await snapshot(page)).metronome === true && (await snapshot(page)).clicks > 40);
    await page.click('[aria-label^="Magnétisme"]');
    check('magnet off', (await state(page)).view.snap === false);
    await page.locator('input[aria-label="Zoom horizontal"]').fill('800');
    check('horizontal zoom leaves Auto', (await state(page)).view.auto === false && (await state(page)).view.pxPerSecond > 100);
    await page.locator('input[aria-label="Zoom vertical"]').fill('100');
    check('vertical zoom resizes the rows', (await page.locator('.piste-tete').first().evaluate((el) => el.getBoundingClientRect().height)) === 100);
    await page.click('.outil-texte');
    check('Auto back on', (await state(page)).view.auto === true);

    // Mute / solo
    await page.click('.piste-tete >> nth=1 >> .muet');
    const bassId = (await state(page)).tracks[1].id;
    check('mute reaches the engine', (await snapshot(page)).tracks.find((tr) => tr.id === bassId).mix.mute === true);
    await page.click('.piste-tete >> nth=2 >> .solo');
    check('solo dims the other headers', (await page.locator('.piste-tete.eteinte').count()) === 3);

    // Loop toggle
    await page.click('[aria-label="Lecture en boucle"]');
    check('loop off', (await snapshot(page)).loop === null && !(await text(page, '.ou')).includes('boucle'));
    await page.click('[aria-label="Lecture en boucle"]');
    check('loop on', (await snapshot(page)).loop !== null);

    // Manual grid entry
    await page.click('.rang-tete.tempo');
    check('tempo panel opens', await page.locator('.panneau-grille').isVisible());
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'app-1280-tempo.png') });
    const bpmInput = page.locator('.panneau-grille input');
    await bpmInput.fill('96');
    await bpmInput.press('Enter');
    check('tempo of the piece set by hand', (await state(page)).tempoMap.segments[0].bpm === 96);
    await page.click('.temps-mesure button:has-text("3")');
    check('beats per bar', (await state(page)).tempoMap.meters[0].meter.numerator === 3);
    for (let i = 0; i < 5; i++) {
      await page.click('.panneau-grille button:has-text("Battre le tempo")');
      await sleep(300);
    }
    const tapped = (await state(page)).tempoMap.segments[0].bpm;
    check('tap tempo', tapped > 150 && tapped < 260, `${tapped} BPM`);
    await page.evaluate(() => window.__fabtice.actions.seek(2));
    await page.click('.panneau-grille button:has-text("Premier temps ici")');
    await sleep(100); // the readout follows on the next animation frame
    check('first downbeat at the playhead', Math.abs((await state(page)).tempoMap.segments[0].time - 2) < 1e-6 && (await text(page, '.ou')).includes('mesure 1 · temps 1'), `${(await state(page)).tempoMap.segments[0].time} / ${await text(page, '.ou')}`);
    await page.mouse.click(700, 300);
    check('click outside closes the tempo panel', (await page.locator('.panneau-grille').count()) === 0);

    // View switch
    await page.click('.mode[data-vue="grille"]');
    check('chord chart view (empty state)', await page.locator('.vue-grille .vide-message h2').isVisible());
    await sleep(200);
    check('tools and sub-grid hidden in the chart view', (await page.locator('.outils').count()) === 0 && (await page.locator('.sous-grille').count()) === 0);
    await page.screenshot({ path: path.join(out, 'app-1280-grille.png') });
    await page.click('.vide-message button');
    check('back to the tracks view', (await state(page)).view.mode === 'pistes');

    // Settings
    await page.click('button:has-text("Réglages")');
    check('settings popover', await page.locator('.reglages-app').isVisible());
    await page.click('.reglages-app input[type="checkbox"]');
    await page.click('.reglages-app .duo button:has-text("C–7")');
    const st = await state(page);
    check('follow and minor notation stored', st.view.follow === false && st.settings.minorNotation === '–');
    await page.keyboard.press('Escape');
    check('Escape closes the settings', (await page.locator('.reglages-app').count()) === 0);

    // New-piece dialog over a project
    await page.click('button:has-text("Nouveau projet")');
    await sleep(300);
    check('dialog opens', await page.locator('.voile.ouverte').isVisible());
    check('web: no link field, a file button', (await page.locator('.champ').count()) === 0 && (await page.locator('.accueil .plein').innerText()) === 'Choisir un fichier audio');
    check('no instrument choice nor « ouvrir un projet » in lot 1', (await page.locator('text=Instruments à séparer').count()) === 0 && (await page.locator('text=ouvrir un projet').count()) === 0);
    await page.keyboard.press('Escape');
    await sleep(300);
    check('Escape closes the dialog', !(await page.locator('.voile').evaluate((el) => el.classList.contains('ouverte'))));

    // Import: unsupported file, then the stub's error, then progress
    await page.click('button:has-text("Nouveau projet")');
    await page.locator('.accueil input[type="file"]').setInputFiles({ name: 'partition.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    check('unsupported file refused', (await text(page, '.import-erreur')).includes('Formats acceptés'));
    await page.click('button:has-text("Réessayer")');
    await page.locator('.accueil input[type="file"]').setInputFiles({ name: 'morceau.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([0xff, 0xfb, 0x90, 0]) });
    check('file import reaches the stub', (await text(page, '.import-erreur')).includes('pas encore branché'));
    await page.screenshot({ path: path.join(out, 'app-1280-import-erreur.png') });
    await page.evaluate(() => window.__fabtice.actions.setImportStatus({ kind: 'busy', progress: { phase: 'downloading', fraction: 0.42, title: 'Blues du dimanche' } }));
    check('import progress view', (await text(page, '.import-etat')).includes('42 %'));
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'app-1280-import-progres.png') });
    await page.click('button:has-text("Annuler")');
    check('cancel returns to the choices', await page.locator('.accueil .plein').isVisible());

    check('no page errors (desktop size)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ launch without a project, web
  {
    const { page, errors } = await open('', { width: 1280, height: 800 });
    await sleep(500);
    await page.evaluate(() => document.fonts.ready);
    check('launch: dialog over the empty shell', await page.locator('.voile.ouverte').isVisible());
    check('launch: no close button without a project', (await page.locator('.fermer').count()) === 0);
    check('launch: play disabled', await page.locator('.jouer').isDisabled());
    await page.keyboard.press('Escape');
    check('launch: Escape keeps the dialog', await page.locator('.voile.ouverte').isVisible());
    await page.screenshot({ path: path.join(out, 'app-1280-accueil-web.png') });
    check('no page errors (launch)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ launch inside the Mac app (bridge simulated)
  {
    const fakeBridge = () => {
      const noop = () => () => {};
      window.fabtice = {
        systemInfo: async () => null,
        ytdlpStatus: async () => ({ source: 'managed', path: null, installed: true, attempts: [] }),
        ytdlpCheck: async () => ({ skipped: true, reason: 'test', attempts: [] }),
        ytdlpInstall: async () => ({ ok: false, error: 'test', attempts: [] }),
        extract: async () => ({ ok: false, error: 'test' }),
        copyText: async () => true,
        onYtdlpProgress: noop,
        onExtractProgress: noop,
      };
    };
    const { page, errors } = await open('', { width: 1280, height: 800 }, fakeBridge);
    await sleep(500);
    await page.evaluate(() => document.fonts.ready);
    check('Mac app: link field and Importer', await page.locator('.champ input[type="url"]').isVisible() && (await text(page, '.champ .plein')) === 'Importer');
    check('Mac app: file link as an alternative', await page.locator('.sinon .lien').isVisible());
    await page.fill('.champ input', 'https://www.youtube.com/watch?v=abc');
    await page.click('.champ .plein');
    check('Mac app: link import reaches the stub', (await text(page, '.import-erreur')).includes('pas encore branché'));
    await page.click('button:has-text("Réessayer")');
    await page.screenshot({ path: path.join(out, 'app-1280-accueil-mac.png') });
    check('no page errors (Mac app)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ phone
  {
    const { page, errors } = await open('?demo', { width: 390, height: 844 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check('phone: no horizontal page scroll', scrollW <= 390, `${scrollW}px`);
    check('phone: header column 92 px', (await page.locator('.tetes').evaluate((el) => el.getBoundingClientRect().width)) === 92);
    check('phone: views as a row of tabs, menus folded', await page.locator('.menu-plus').isVisible() && !(await page.locator('button:has-text("Exporter")').isVisible()));
    check('phone: zoom sliders hidden, magnet and Auto kept', !(await page.locator('.zoom').first().isVisible()) && await page.locator('.outil-texte').isVisible());
    check('phone: Auto off by default (bars scroll at 86 px)', (await state(page)).view.auto === false);
    await page.screenshot({ path: path.join(out, 'app-390.png') });
    await page.click('.menu-plus');
    await sleep(300);
    check('phone: menu holds « Nouveau projet… »', await page.locator('.lien-option').isVisible());
    await page.screenshot({ path: path.join(out, 'app-390-menu.png') });
    await page.click('.lien-option');
    await sleep(300);
    check('phone: dialog from the menu', await page.locator('.voile.ouverte').isVisible());
    await page.screenshot({ path: path.join(out, 'app-390-accueil.png') });
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.click('.mode[data-vue="grille"]');
    await sleep(200);
    await page.screenshot({ path: path.join(out, 'app-390-grille.png') });
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the mockup, for comparison
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${url}/maquette/`);
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    await page.screenshot({ path: path.join(out, `maquette-${w}.png`) });
    await page.goto(`${url}/maquette/#accueil`);
    await page.reload();
    await sleep(400);
    await page.screenshot({ path: path.join(out, `maquette-${w}-accueil.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
