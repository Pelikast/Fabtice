// Browser checks of the « Grille d'accords » (lot 2) in Chromium, against the
// mockup it must follow (web/maquette/, served by the same server):
//   npm run build && npm run test:chart
// Screenshots (the app's chart next to the mockup's, at 1280×800 and 390×844)
// go to $FABTICE_CHART_OUT (default: a temporary folder), never into the
// repository. Playwright and Chromium are expected preinstalled (here under
// /opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_CHART_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-chart-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(query, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const text = (page, sel) => page.locator(sel).first().innerText();
/** Markup of each bar's chords, normalised to compare with the mockup (our extra attributes dropped). */
const barChords = (page) =>
  page.$$eval('.vue-grille .case', (cells) =>
    cells.map((c) =>
      [...c.querySelectorAll('.ch')]
        .map((ch) => ch.outerHTML.replace(/ role="img"/g, '').replace(/ title="[^"]*"/g, '').replace(/ class="ch douteux"/g, ' class="ch"'))
        .join(''),
    ),
  );
const css = (page, sel, prop, pseudo = null) => page.$eval(sel, (el, [p, ps]) => getComputedStyle(el, ps).getPropertyValue(p), [prop, pseudo]);

const INK = 'rgb(43, 31, 23)';
const INK_SOFT = 'rgb(106, 86, 70)';
const EMBER = 'rgb(196, 80, 42)';
const BRASS_VEIL = 'rgba(184, 135, 58, 0.17)';

try {
  // ------------------------------------------------------------ the mockup, for reference
  const mock = {};
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${url}/maquette/#vue=grille`);
    await page.evaluate(() => document.fonts.ready);
    await sleep(400);
    await page.screenshot({ path: path.join(out, `maquette-grille-${w}.png`) });
    if (w === 1280) {
      mock.chords = await barChords(page);
      mock.caseHeight = (await page.locator('.case').first().boundingBox()).height;
      mock.caseFont = await css(page, '.case', 'font-size');
    } else {
      mock.phoneCaseHeight = (await page.locator('.case').first().boundingBox()).height;
      mock.phoneCaseFont = await css(page, '.case', 'font-size');
    }
    await page.close();
  }

  // ------------------------------------------------------------ desktop: the analysed demo piece
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'app-grille-1280.png') });

    // Sheet and title line
    check('sheet: title', (await text(page, '.feuille-tete h1')) === 'Blues du dimanche');
    const info = await text(page, '[data-testid="grille-ton"]');
    check('title line: key as displayed, meter, tempo', info === 'Tonalité de A♭ · 4/4 · tempo 110', info);
    check('title line: the accidental in the music font', (await css(page, '[data-testid="grille-ton"] .alt', 'font-family')).includes('Noto Music'));
    check('instrument choice: Ut, Si♭, Mi♭, Ut pressed', (await page.locator('.duo.instrument button').allInnerTexts()).join(',') === 'Ut,Si♭,Mi♭' && (await page.getAttribute('.duo.instrument button:first-child', 'aria-pressed')) === 'true');

    // Bars: four per line, numbers, the piece to its end
    const cells = await page.$$eval('.vue-grille .case', (els) => els.map((e) => ({ bar: Number(e.dataset.mesure), n: e.querySelector('.numero').textContent, cls: e.className, top: Math.round(e.getBoundingClientRect().top) })));
    check('25 bars (24 and the ringing end), numbered from 1', cells.length === 25 && cells.map((c) => c.n).join(',') === Array.from({ length: 25 }, (_, i) => i + 1).join(','));
    const rows = [...new Set(cells.map((c) => c.top))];
    check('four bars per line', rows.length === 7 && cells.filter((c) => c.top === rows[0]).length === 4 && cells.filter((c) => c.top === rows[6]).length === 1, `${rows.length} lines`);
    const box = await page.locator('.case').first().boundingBox();
    check('bar size and chord size as in the mockup', Math.abs(box.height - mock.caseHeight) < 1.5 && (await css(page, '.case', 'font-size')) === mock.caseFont, `${box.height} / ${mock.caseHeight}`);
    check('bar lines in ink', (await css(page, '.case', 'border-left-color')) === INK);

    // Same chord symbols, same markup as the mockup's chordHTML (the mockup plays 5 semitones up)
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__fabtice.actions.stepSemitones(1);
    });
    await sleep(100);
    const ours = (await barChords(page)).slice(0, 16);
    const same = ours.map((html, i) => html === mock.chords[i]);
    check('the 16 bars of the mockup: identical chord markup (+5 semitones, as the mockup shows them)', same.every(Boolean), same.map((ok, i) => (ok ? '' : `bar ${i + 1}: ${ours[i]} ≠ ${mock.chords[i]}`)).filter(Boolean).join(' ; '));
    check('key line follows the transposition', (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de D♭'));
    await page.evaluate(() => window.__fabtice.actions.resetTransposition());
    await sleep(100);

    // Notation details
    check('major 7: a triangle, no « maj7 »', (await page.locator('.case[data-mesure="0"] .ch svg.tri').count()) === 1 && !(await text(page, '.vue-grille')).includes('maj'));
    check('quality at 74 %', (await page.$eval('.case[data-mesure="1"] .q', (q) => parseFloat(getComputedStyle(q).fontSize) / parseFloat(getComputedStyle(q.closest('.case')).fontSize))).toFixed(2) === '0.74');
    check('extension raised', parseFloat(await css(page, '.case[data-mesure="7"] .ext', 'vertical-align')) > 0);
    check('accidentals tight against the root, in the music font', (await css(page, '.case[data-mesure="2"] .ch > .alt', 'font-family')).includes('Noto Music'));
    await page.evaluate(() => window.__fabtice.actions.setMinorNotation('–'));
    await sleep(80);
    check('minor written « – » by the setting', (await text(page, '.case[data-mesure="1"] .ch')) === 'F–7');
    await page.evaluate(() => window.__fabtice.actions.setMinorNotation('m'));

    // Sections, double bars, two chords, doubt, repeat
    const sections = cells.filter((c) => c.cls.includes('double')).map((c) => c.bar);
    check('section letters A, B, A, boxed', (await page.locator('.case .section').allInnerTexts()).join(',') === 'A,B,A' && (await css(page, '.case .section', 'border-top-style')) === 'solid');
    check('double bar at section changes, not at the start', sections.join(',') === '8,16' && (await css(page, '.case[data-mesure="8"]', 'border-left-style')) === 'double');
    check('two chords in bar 15', (await page.locator('.case[data-mesure="14"].deux .ch').count()) === 2);
    const doubt = page.locator('.case[data-mesure="11"] .ch');
    check(
      'the doubtful chord is quiet: soft ink, dotted rule, a title; never the ember',
      (await doubt.getAttribute('class')) === 'ch douteux' && (await css(page, '.case[data-mesure="11"] .ch', 'color')) === INK_SOFT &&
        (await css(page, '.case[data-mesure="11"] .ch', 'border-bottom-style')) === 'dotted' && (await doubt.getAttribute('title')) === 'Accord incertain : D♭m6',
    );
    check('only one doubtful chord in the demo', (await page.locator('.ch.douteux').count()) === 2 - 1);
    check('a bar where the chord goes on shows the bar-repeat sign', (await text(page, '.case[data-mesure="24"] .repete')) === '𝄎' && (await css(page, '.case[data-mesure="24"] .repete', 'font-family')).includes('Noto Music'));

    // Loop veil
    const looped = await page.$$eval('.case.dans-boucle', (els) => els.map((e) => Number(e.dataset.mesure)));
    check('the loop: a brass veil on bars 5–8', looped.join(',') === '4,5,6,7' && (await css(page, '.case.dans-boucle', 'background-color')) === BRASS_VEIL, looped.join(','));
    await page.evaluate(() => window.__fabtice.actions.toggleLoop());
    await sleep(80);
    check('loop off: no veil', (await page.locator('.case.dans-boucle').count()) === 0);
    await page.evaluate(() => window.__fabtice.actions.toggleLoop());
    await sleep(80); // React rewrote the cells' classes: the frame loop puts the current-bar mark back on the next frame

    // Current bar: an ember hairline driven by the frame loop
    check('current bar: bar 5 at the start of the loop', (await page.$$eval('.case.jouee', (els) => els.map((e) => e.dataset.mesure))).join(',') === '4');
    check('the hairline is ember', (await css(page, '.case.jouee', 'background-color', '::after')) === EMBER);
    const cellHandle = await page.$('.case[data-mesure="9"]');
    const mid = await page.evaluate(() => {
      const { actions, store } = window.__fabtice;
      actions.toggleLoop(); // off: playing goes on past the loop
      // Source time of beat 38: bar 10 (index 9), half-way through its four beats.
      const segs = store.getState().tempoMap.segments;
      const seg = segs.findLast((x) => x.beat <= 38);
      const t = seg.time + ((38 - seg.beat) * 60) / seg.bpm;
      actions.seek(t);
      return t;
    });
    await sleep(150);
    const avance = await page.$eval('.case.jouee', (e) => [e.dataset.mesure, Number(e.style.getPropertyValue('--avance'))]);
    check('seek: the hairline goes to bar 10, half filled', avance[0] === '9' && Math.abs(avance[1] - 0.5) < 0.01, `${avance} at ${mid.toFixed(2)} s`);
    await page.click('.jouer');
    await sleep(600);
    const later = await page.$eval('.case.jouee', (e) => Number(e.style.getPropertyValue('--avance')));
    await page.click('.jouer');
    check('playing: the hairline fills as the bar goes on', later > avance[1] + 0.1, `${avance[1]} -> ${later}`);
    check('the bar cell was not re-rendered by the playhead (frame loop, not React)', await cellHandle.evaluate((el) => el.isConnected && el.classList.contains('jouee')));
    check('only one current bar', (await page.locator('.case.jouee').count()) === 1);

    // Instruments: display only, the stored chords stay at concert pitch
    const storedBefore = JSON.stringify((await state(page)).analysis.chords);
    await page.click('.duo.instrument button:has-text("Si")');
    await sleep(80);
    check('Si♭: the chart reads a major second higher (A♭ -> B♭)', (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de B♭ pour instrument en Si♭') && (await text(page, '.case[data-mesure="1"] .ch')) === 'Gm7');
    await page.click('.duo.instrument button:has-text("Mi")');
    await sleep(80);
    check('Mi♭: a major sixth higher (A♭ -> F)', (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de F ') && (await text(page, '.case[data-mesure="1"] .ch')) === 'Dm7');
    check('instrument kept with the piece (document view)', (await state(page)).view.instrument === 'mib');
    check('stored chords unchanged (concert pitch, original key)', JSON.stringify((await state(page)).analysis.chords) === storedBefore);
    await page.click('.duo.instrument button:has-text("Ut")');

    // Export menu
    await page.click('button:has-text("Exporter")');
    const items = await page.$$eval('.menu-export [role="menuitem"]', (els) => els.map((e) => `${e.dataset.export}:${e.disabled}:${e.querySelector('small')?.textContent ?? ''}`));
    // The iReal Pro entry is a link to the page it writes (tests/export.mjs checks it); an anchor has no `disabled`.
    check('Exporter: iReal Pro is a link, print « bientôt », audio later', items.join('|') === 'ireal:undefined:|print:true:bientôt|audio:true:dans une prochaine version', items.join('|'));
    await page.keyboard.press('Escape');

    check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ grid corrections and tuning, from the panels
  {
    const { page, errors } = await open('?demo&moteur=factice');
    await page.click('.rang-tete.tempo');
    await sleep(200);
    check('grid panel: the grid comes from the analysis', (await text(page, '[data-testid="grille-origine"]')) === 'Grille trouvée par l’analyse.');
    const bars0 = await page.evaluate(() => window.__fabtice.store.getState().tempoMap.segments.length);
    await page.click('.corrige button:has-text("× 2")');
    let s = await state(page);
    check('× 2: corrected grid, twice the tempo, same beats', s.tempoMap.origin === 'corrected' && s.tempoMap.segments.length === bars0 && Math.abs(s.tempoMap.segments[3].bpm / 2 - 110) < 0.5);
    check('grid panel says it was corrected', (await text(page, '[data-testid="grille-origine"]')) === 'Grille de l’analyse, corrigée à la main.');
    await page.click('.corrige button:has-text("÷ 2")');
    await page.click('[aria-label="Premier temps un temps plus tard"]');
    s = await state(page);
    const firstBeat = s.tempoMap.segments.find((x) => x.beat === 0)?.time;
    check('first beat one beat later', Math.abs(firstBeat - (0.55 + 60 / 110)) < 1e-6, String(firstBeat));
    await page.click('.panneau-actions button:has-text("Revenir à l’analyse")');
    check('back to the analysed grid', (await state(page)).tempoMap.origin === 'analysis');
    await page.keyboard.press('Escape');

    await page.click('[aria-label="Régler finement la tonalité"]');
    await sleep(150);
    check('tuning: what the analysis measured', (await text(page, '[data-testid="accordage"] .panneau-note')).includes('La = 444,6 Hz (+18 cents'));
    await page.click('[data-testid="accordage"] button:has-text("Ramener à 440")');
    s = await state(page);
    check('tuning: compensated with the cents setting, offer gone', s.playback.cents === -18 && (await page.locator('.accordage-offre').count()) === 0 && (await page.evaluate(() => window.__fabtice.engine.snapshot().cents)) === -18);
    check('no page errors (panels)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ empty, running, failed, started by hand
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille&analyse=lente');
    await page.waitForSelector('.vide-message[data-etat="running"]', { timeout: 5000 });
    await sleep(600);
    check('analysis running: empty bars and a calm sentence', (await page.locator('.grille-vide span').count()) === 8 && (await text(page, '.vide-message h2')) === 'Analyse en cours…');
    const note = await text(page, '.vide-message .analyse-sources');
    check('first time: where the tools come from and their licences', note.includes('Hugging Face') && note.includes('Beat This!') && note.includes('MIT') && note.includes('CREMA') && note.includes('BSD-2-Clause'), note.replace(/\n/g, ' '));
    check('discreet status in the top bar', (await text(page, '[data-testid="analyse-etat"]')).startsWith('Outils d’analyse'));
    check('the piece plays while analysing', await page.isEnabled('.jouer'));
    await page.screenshot({ path: path.join(out, 'app-grille-1280-analyse.png') });
    await page.close();
    check('no page errors (running)', errors.length === 0, errors.join(' | '));
  }
  {
    const { page } = await open('?demo&moteur=factice&vue=grille&analyse=instant');
    await page.waitForSelector('.vue-grille .case .ch', { timeout: 5000 });
    const s = await state(page);
    check('analysed after opening: chords, key, the analysed grid in force', s.analysis !== null && s.tempoMap.origin === 'analysis' && (await page.locator('.case .ch').count()) > 20);
    await page.close();
  }
  {
    const { page } = await open('?demo&moteur=factice&vue=grille&analyse=echec');
    await page.waitForSelector('.vide-message[data-etat="error"]', { timeout: 5000 });
    check('failed analysis: said calmly, a way to try again', (await text(page, '.vide-message h2')) === 'L’analyse n’a pas abouti' && (await text(page, '.vide-message button')) === 'Analyser de nouveau');
    check('failed analysis: the top bar says it, in ink', (await text(page, '[data-testid="analyse-etat"]')) === 'Analyse interrompue' && (await css(page, '[data-testid="analyse-etat"]', 'color')) === INK_SOFT);
    await page.close();
  }
  {
    const { page } = await open('?demo&moteur=factice&vue=grille&analyse=aucune');
    await sleep(400);
    check('never analysed: no automatic start here, an invitation', (await text(page, '.vide-message h2')) === 'Pas encore d’accords' && (await state(page)).analysisRun.status === 'idle');
    await page.click('.vide-message button:has-text("Analyser le morceau")');
    await page.waitForSelector('.vue-grille .case .ch', { timeout: 5000 });
    check('analysis on demand keeps the grid entered by hand', (await state(page)).tempoMap.origin === 'manual');
    await page.close();
  }

  // ------------------------------------------------------------ phone
  {
    const { page, errors } = await open('?demo&vue=grille', { width: 390, height: 844 });
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'app-grille-390.png') });
    const tops = await page.$$eval('.vue-grille .case', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    check('phone: four bars per line', tops.filter((t) => t === tops[0]).length === 4);
    const h = (await page.locator('.case').first().boundingBox()).height;
    check('phone: bar size and chord size as in the mockup', Math.abs(h - mock.phoneCaseHeight) < 1.5 && (await css(page, '.case', 'font-size')) === mock.phoneCaseFont, `${h} / ${mock.phoneCaseHeight}`);
    check('phone: the page never scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const overflow = await page.$$eval('.case', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.dataset.mesure));
    check('phone: every chord fits in its bar', overflow.length === 0, overflow.join(','));
    check('phone: instrument choice visible', await page.locator('.duo.instrument').isVisible());
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await page.close();
  }
} catch (e) {
  failed++;
  console.log('FAIL  (exception)', e);
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
