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
import { closeMenu, menuCommand, menuEntry, openMenu } from './lib/menu.mjs';

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

/** Every bar with chords: inside the bar, no chord on another on the same row, each at the place of its beat. (On paper: `print.mjs`.) */
const geometry = (page) =>
  page.$$eval(
    '.case[data-temps]',
    (cells) =>
      cells.map((c) => {
        const r = c.getBoundingClientRect();
        const st = getComputedStyle(c);
        const pg = parseFloat(st.getPropertyValue('--pg'));
        const pd = parseFloat(st.getPropertyValue('--pd'));
        const inner = c.clientWidth - pg - pd;
        const beats = Number(c.dataset.temps);
        const rows = c.dataset.rangs === '2' ? 2 : 1;
        const chords = [...c.querySelectorAll('.accord-case[data-debut]')].map((b) => ({ beat: Number(b.dataset.debut), box: b.querySelector('.ch').getBoundingClientRect() }));
        const problems = [];
        chords.forEach((ch, i) => {
          const expected = r.left + c.clientLeft + pg + (ch.beat / beats) * inner;
          // At its beat, or moved: back from the bar line, or to the right of a long chord before it (never far).
          if (Math.abs(ch.box.left - expected) > 2.5 && ch.box.left - expected > 0 && chords[i - 1] === undefined) problems.push(`chord ${i} at ${(ch.box.left - expected).toFixed(1)} px from its beat`);
          if (ch.box.right > r.right + 0.5 || ch.box.left < r.left) problems.push(`chord ${i} leaves the bar`);
          if (i >= rows && ch.box.left < chords[i - rows].box.right - 0.01) problems.push(`chord ${i} touches chord ${i - rows}`);
        });
        const pushed = chords.map((ch) => Math.round(r.left + c.clientLeft + pg + (ch.beat / beats) * inner - ch.box.left)).filter((x) => Math.abs(x) > 2);
        return { bar: c.dataset.mesure, n: chords.length, problems, size: st.fontSize, rows, pushed: pushed.length };
      }),
  );

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
    check('two chords in bar 15', (await page.locator('.case[data-mesure="14"][data-accords="2"] .ch').count()) === 2);
    {
      // The second chord is written where its beat is: beat 3 of 4, the middle of the bar (Real Book).
      const at = await page.$eval('.case[data-mesure="14"]', (c) => {
        const r = c.getBoundingClientRect();
        const st = getComputedStyle(c);
        const pg = parseFloat(st.getPropertyValue('--pg'));
        const pd = parseFloat(st.getPropertyValue('--pd'));
        return [...c.querySelectorAll('.ch')].map((e) => (e.getBoundingClientRect().left - r.left - c.clientLeft - pg) / (c.clientWidth - pg - pd));
      });
      check('bar 15: the first chord is on the bar line, the second in the middle of the bar', Math.abs(at[0]) < 0.02 && Math.abs(at[1] - 0.5) < 0.02, at.map((v) => v.toFixed(3)).join(' / '));
    }
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

    // A loop that does not start or end on a bar line veils only the part of the bars inside it.
    {
      const timeOfBeat = (beat) =>
        page.evaluate((b) => {
          const segs = window.__fabtice.store.getState().tempoMap.segments;
          const seg = segs.findLast((x) => x.beat <= b);
          return seg.time + ((b - seg.beat) * 60) / seg.bpm;
        }, beat);
      // From beat 2 of bar 6 to the 4th sixteenth of beat 3 of bar 8 (indices 5 and 7, four beats a bar).
      const a = await timeOfBeat(5 * 4 + 1);
      const b = await timeOfBeat(7 * 4 + 2.75);
      await page.evaluate(([x, y]) => window.__fabtice.actions.setLoopRegion({ start: x, end: y }), [a, b]);
      await sleep(350); // the cells' background transition (140 ms) has to finish
      const veils = await page.$$eval('.case.dans-boucle', (els) =>
        els.map((e) => ({
          bar: Number(e.dataset.mesure),
          partial: e.classList.contains('partielle'),
          from: e.style.getPropertyValue('--boucle-de'),
          to: e.style.getPropertyValue('--boucle-a'),
          width: e.getBoundingClientRect().width,
          bg: getComputedStyle(e).backgroundColor,
          before: { left: getComputedStyle(e, '::before').left, right: getComputedStyle(e, '::before').right, bg: getComputedStyle(e, '::before').backgroundColor },
        })),
      );
      check('partial loop: bars 6 to 8 are in the loop, no others', veils.map((v) => v.bar).join(',') === '5,6,7', veils.map((v) => v.bar).join(','));
      const [first, middle, last] = veils;
      check('partial loop: the first bar is veiled from beat 2 (a quarter in), the last up to 0.6875', first.partial && Math.abs(Number(first.from) - 0.25) < 0.001 && first.to === '1' && last.partial && last.from === '0' && Math.abs(Number(last.to) - 0.6875) < 0.001, JSON.stringify([first.from, first.to, last.from, last.to]));
      check('partial loop: the bar between is veiled whole, like before', !middle.partial && middle.bg === BRASS_VEIL && middle.from === '' && middle.to === '');
      check('partial loop: a partly veiled bar has no veil of its own, only the brass strip over its part', first.bg === 'rgba(0, 0, 0, 0)' && first.before.bg === BRASS_VEIL && last.bg === 'rgba(0, 0, 0, 0)' && last.before.bg === BRASS_VEIL);
      const px = (s) => Number.parseFloat(s);
      check(
        'partial loop: the strip starts a quarter into the first bar and stops at 69 % of the last',
        Math.abs(px(first.before.left) - first.width * 0.25) < 1.5 && px(first.before.right) < 1.5 && px(last.before.left) < 1.5 && Math.abs(px(last.before.right) - last.width * (1 - 0.6875)) < 1.5,
        JSON.stringify([first.before, last.before, first.width]),
      );
      await page.screenshot({ path: path.join(out, 'app-grille-boucle-partielle-1280.png') });
      // The whole-bar loop is back as it was.
      await page.evaluate(([x, y]) => window.__fabtice.actions.setLoopRegion({ start: x, end: y }), [await timeOfBeat(16), await timeOfBeat(32)]);
      await sleep(120);
      const whole = await page.$$eval('.case.dans-boucle', (els) => els.map((e) => [Number(e.dataset.mesure), e.classList.contains('partielle')]));
      check('whole bars after a partial loop: the veil is whole again on bars 5–8', whole.map((x) => x[0]).join(',') === '4,5,6,7' && whole.every((x) => !x[1]), JSON.stringify(whole));
    }

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

    // The menu Fabtice (C6): the sound, iReal Pro, PDF and printing available; « Enregistrer » off for the demo piece.
    const items = [];
    for (const p of [['Exporter', 'Audio…'], ['Exporter', 'iReal Pro', 'Fichier iReal Pro…'], ['Exporter', 'PDF…'], ['Imprimer…'], ['Enregistrer']]) items.push(`${p.at(-1)}:${(await menuEntry(page, ...p)).enabled}`);
    check('menu: the sound, iReal Pro, PDF and printing available, « Enregistrer » off for the demo', items.join('|') === 'Audio…:true|Fichier iReal Pro…:true|PDF…:true|Imprimer…:true|Enregistrer:false', items.join('|'));

    check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ chords at the place of their beat (Real Book)
  {
    const C = (root, quality, extensions = []) => ({ root, quality, extensions, bass: null });
    // One, two, three and four chords in a bar; long symbols that meet; a chord that starts in the middle of a bar.
    const BARS = {
      0: [[0, C(0, 'maj7')]],
      1: [[0, C(2, 'min7')], [2, C(7, '7')]],
      2: [[0, C(0, 'maj7')], [2, C(9, 'min7')], [3, C(2, '7')]],
      3: [[0, C(0, 'maj7')], [1, C(9, 'min7')], [2, C(2, 'min7')], [3, C(7, '7')]],
      4: [[0, C(1, 'min7', ['b5'])], [2, C(6, '7', ['b9'])]],
      5: [[0, C(1, 'min7', ['b5'])], [1, C(6, '7', ['b9'])]],
      6: [[2, C(5, 'maj7')]],
      7: [[0, C(10, '7', ['b13'])], [3, C(3, 'maj7')]],
      8: [[0, C(11, 'min7', ['b5'])], [1, C(4, '7', ['#9', 'b13'])], [2, C(9, 'min7')], [3, C(2, '7', ['b9'])]],
      // Long fine-model symbols late in the bar (the owner's bar 31): a chord on beat 4, on beat 2, a slash bass, two long ones.
      9: [[0, C(2, 'min7', ['9'])], [3, C(1, '7', ['#11'])]],
      10: [[0, C(7, 'min7', ['9', '11'])], [1, C(3, '7', ['9', '#11', '13'])]],
      11: [[0, C(10, '7', ['b9', 'b13'])], [3, { root: 10, quality: '7', extensions: ['b9', 'b13'], bass: 3 }]],
      12: [[1, C(9, '7', ['#9', 'b13'])], [3, C(5, 'maj7', ['9', '13'])]],
    };
    for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['laptop', { width: 960, height: 640 }], ['phone', { width: 390, height: 844 }]]) {
      const { page, errors } = await open('?demo&moteur=factice&vue=grille', viewport);
      await sleep(200);
      const demo = await geometry(page);
      check(`${label}: the demo piece: every chord at the place of its beat, none touching another or leaving its bar`, demo.length > 20 && demo.every((b) => b.problems.length === 0), demo.filter((b) => b.problems.length).map((b) => `bar ${b.bar}: ${b.problems.join(', ')}`).join(' ; '));
      await page.evaluate((bars) => {
        for (const [bar, entries] of Object.entries(bars)) window.__fabtice.lot2.harmony.setBarChords(Number(bar), entries.map(([beat, chord]) => ({ beatInBar: beat, chord })));
      }, BARS);
      await sleep(400);
      const g = await geometry(page);
      const mine = g.filter((b) => Number(b.bar) in BARS);
      check(`${label}: one to four chords, long symbols, a late chord: each at the place of its beat, none touching, none leaving the bar`, mine.length === Object.keys(BARS).length && mine.every((b) => b.problems.length === 0), mine.filter((b) => b.problems.length).map((b) => `bar ${b.bar}: ${b.problems.join(', ')}`).join(' ; '));
      const sizes = Object.fromEntries(mine.map((b) => [b.bar, `${parseFloat(b.size).toFixed(0)}px${b.rows === 2 ? '×2 rows' : ''}`]));
      console.log(`      sizes (${label}): ${JSON.stringify(sizes)}`);
      // ONE size for the whole chart: every bar with chords has the same font size, whatever its chords.
      const allSizes = [...new Set(g.filter((b) => b.n > 0).map((b) => b.size))];
      check(`${label}: one size for every chord of the chart (long symbols on beats 2 and 4 included)`, allSizes.length === 1, allSizes.join(' / '));
      const late = mine.find((b) => b.bar === '9');
      check(`${label}: bar 9, a long chord on beat 4, is written at the same size as the others (pushed back or on two rows)`, late.size === mine[0].size && (late.pushed > 0 || late.rows === 2), JSON.stringify(late));
      const base = parseFloat(await css(page, '.case[data-mesure="0"]', 'font-size'));
      check(`${label}: a lone chord keeps the normal size${label === 'desktop' ? ', and so do two short chords' : ''}`, parseFloat(mine[0].size) === base && (label === 'phone' || parseFloat(mine[1].size) === base), `${mine[0].size} ${mine[1].size}`);
      const mid = await page.evaluate(() => {
        const c = document.querySelector('.case[data-mesure="1"]');
        const [a, b] = [...c.querySelectorAll('.ch')].map((e) => e.getBoundingClientRect());
        const r = c.getBoundingClientRect();
        return { first: (a.left - r.left) / r.width, second: (b.left - r.left) / r.width };
      });
      check(`${label}: two chords in a bar: the second starts at the middle of the bar`, Math.abs(mid.second - 0.5) < 0.06 && mid.first < 0.15, JSON.stringify(mid));
      await page.screenshot({ path: path.join(out, `grille-accords-${viewport.width}.png`) });
      // Resizing the window re-fits.
      if (label === 'desktop') {
        await page.setViewportSize({ width: 700, height: 800 });
        await sleep(400);
        const narrow = (await geometry(page)).filter((b) => Number(b.bar) in BARS);
        check('desktop narrowed to 700 px: still nothing touching, nothing leaving a bar', narrow.every((b) => b.problems.length === 0), narrow.filter((b) => b.problems.length).map((b) => `bar ${b.bar}: ${b.problems.join(', ')}`).join(' ; '));
      }
      check(`no page errors (${label}, placement)`, errors.length === 0, errors.join(' | '));
      await page.close();
    }

    // How a chord is put on a beat: « Deux accords dans la mesure » gives beat 3 (the middle); the editor moves it to 2 or 4.
    {
      const chordOf = (page, bar, i = 0) => page.locator(`.case[data-mesure="${bar}"] .accord-case[data-accord="${i}"]`);
      const { page, errors } = await open('?demo&moteur=factice&vue=grille');
      await sleep(300);
      const beats = (bar) => page.$$eval(`.case[data-mesure="${bar}"] .accord-case[data-debut]`, (els) => els.map((e) => Number(e.dataset.debut)).join(','));
      check('bar 14 (Cm7) has one chord, on beat 1', (await beats(13)) === '0');
      await chordOf(page, 13).click();
      await page.waitForSelector('[data-testid="editeur"]');
      check('one chord on the bar line: no beat choice offered', (await page.locator('.editeur-temps').count()) === 0);
      await page.click('.editeur-actions button:has-text("Deux accords dans la mesure")');
      await sleep(200);
      check('« Deux accords dans la mesure »: the second chord is on beat 3', (await beats(13)) === '0,2', await beats(13));
      check('… and it is drawn in the middle of the bar', await page.$eval('.case[data-mesure="13"]', (c) => {
        const r = c.getBoundingClientRect();
        const b = c.querySelectorAll('.ch')[1].getBoundingClientRect();
        return Math.abs((b.left - r.left) / r.width - 0.5) < 0.06;
      }));
      check('the editor now offers the beat of the second chord: 1 to 4, with 3 chosen, 1 out of reach', (await page.$$eval('.editeur-temps button', (els) => els.map((e) => `${e.dataset.temps}${e.getAttribute('aria-pressed') === 'true' ? '*' : ''}${e.disabled ? 'x' : ''}`).join(','))) === '1x,2,3*,4', await page.$$eval('.editeur-temps button', (els) => els.map((e) => `${e.dataset.temps}${e.getAttribute('aria-pressed') === 'true' ? '*' : ''}${e.disabled ? 'x' : ''}`).join(',')));
      await page.click('.editeur-temps button[data-temps="4"]');
      await sleep(200);
      check('a click on « 4 »: the second chord is on beat 4', (await beats(13)) === '0,3', await beats(13));
      await page.click('.editeur-temps button[data-temps="2"]');
      await sleep(200);
      check('a click on « 2 »: on beat 2', (await beats(13)) === '0,1', await beats(13));
      check('the stored chord follows (a hand chord on beat 2 of the bar)', (await state(page)).corrections.chords.length >= 2);
      check('no page errors (beat choice)', errors.length === 0, errors.join(' | '));
      await page.close();
    }
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

  // ============================================================ lot 2, chantier « grille » : gestes, éditeur, impression
  // Times in the demo piece: beat b of the analysed grid is at `timeOfBeat(b)`; bar n (0-based) starts at beat 4n.
  const timeOfBar = (page, bar) =>
    page.evaluate((b) => {
      const segs = window.__fabtice.store.getState().tempoMap.segments;
      const beat = b * 4;
      const seg = segs.findLast((x) => x.beat <= beat);
      return seg.time + ((beat - seg.beat) * 60) / seg.bpm;
    }, bar);
  const position = (page) => page.evaluate(() => window.__fabtice.engine.getPosition());
  const loopOf = (page) => page.evaluate(() => window.__fabtice.store.getState().loop);
  const loopedBars = (page) => page.$$eval('.case.dans-boucle', (els) => els.map((e) => Number(e.dataset.mesure)).join(','));
  const box = (page, sel) => page.locator(sel).first().boundingBox();
  /** A spot of a bar away from its chord: bottom right. */
  const blank = async (page, bar) => {
    const b = await box(page, `.case[data-mesure="${bar}"]`);
    return { x: b.x + b.width * 0.8, y: b.y + b.height * 0.9 };
  };
  const middle = async (page, bar) => {
    const b = await box(page, `.case[data-mesure="${bar}"]`);
    return { x: b.x + b.width * 0.6, y: b.y + b.height * 0.9 };
  };
  const chordOf = (page, bar, i = 0) => page.locator(`.case[data-mesure="${bar}"] .accord-case[data-accord="${i}"]`);
  const edited = async (page) => (await state(page)).corrections;
  const handChord = async (page, bar) => {
    const s = await state(page);
    const segs = s.tempoMap.segments;
    const t = await timeOfBar(page, bar);
    return s.corrections.chords.find((c) => Math.abs(c.time - t) < 0.4 * (60 / segs[3].bpm) * 4) ?? null;
  };
  const editorOpen = (page) => page.locator('[data-testid="editeur"]').count().then((n) => n > 0);
  const root = (page, name) => page.getByRole('radio', { name, exact: true });
  const activeStop = (page) => page.evaluate(() => document.activeElement?.dataset?.stop ?? null);

  // ------------------------------------------------------------ mouse: click, drag, loop
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    check('the bars are clickable (pointer cursor)', (await css(page, '.case', 'cursor')) === 'pointer');
    check('each chord is a button, one tab stop for the whole chart', (await page.locator('.case .accord-case').count()) > 20 && (await page.locator('.accord-case[tabindex="0"]').count()) === 1);

    // A click on a bar moves the playhead to its start.
    await page.evaluate(() => window.__fabtice.actions.toggleLoop()); // loop off: the playhead stays where it is put
    let p = await blank(page, 9);
    await page.mouse.click(p.x, p.y);
    await sleep(80);
    check('a click on a bar: the playhead goes to the start of the bar', Math.abs((await position(page)) - (await timeOfBar(page, 9))) < 0.02, `${await position(page)} / ${await timeOfBar(page, 9)}`);
    check('… and the current-bar hairline is on that bar, empty', (await page.$eval('.case.jouee', (e) => [e.dataset.mesure, Number(e.style.getPropertyValue('--avance'))])).join() === '9,0');
    check('a click on a bar opens no editor', !(await editorOpen(page)));
    await page.evaluate(() => window.__fabtice.actions.toggleLoop());
    await sleep(60);

    // A click on a chord opens its editor and leaves the playhead alone.
    const before = await position(page);
    await chordOf(page, 2).click();
    await sleep(120);
    check('a click on a chord opens the editor, and does not move the playhead', (await editorOpen(page)) && Math.abs((await position(page)) - before) < 0.02);
    await page.keyboard.press('Escape');
    await sleep(60);
    check('Escape closes the editor', !(await editorOpen(page)));

    // Dragging across bars, across lines: live, then enterLoop() on release.
    await page.evaluate(() => {
      window.__fabtice.actions.setLoopRegion(null);
      window.__fabtice.actions.seek(0);
    });
    p = await blank(page, 5);
    const q = await middle(page, 10);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y, { steps: 3 });
    await page.mouse.move(q.x, q.y, { steps: 8 });
    await sleep(80);
    const live = await loopOf(page);
    check('drag from bar 6 to bar 11, across lines: the loop follows live (before release)', live.enabled && Math.abs(live.region.start - (await timeOfBar(page, 5))) < 0.02 && Math.abs(live.region.end - (await timeOfBar(page, 11))) < 0.02, JSON.stringify(live.region));
    check('… the veil is on bars 6 to 11 while dragging', (await loopedBars(page)) === '5,6,7,8,9,10', await loopedBars(page));
    check('… the playhead has not moved yet', (await position(page)) < 0.5);
    await page.screenshot({ path: path.join(out, 'app-grille-selection-1280.png') });
    await page.mouse.up();
    await sleep(100);
    check('on release the playhead enters the loop (enterLoop)', Math.abs((await position(page)) - (await timeOfBar(page, 5))) < 0.05, String(await position(page)));
    check('a drag opens no editor', !(await editorOpen(page)));

    // Backwards, from the bottom up across lines.
    p = await middle(page, 14);
    const r = await blank(page, 2);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y - 20, { steps: 3 });
    await page.mouse.move(r.x, r.y, { steps: 10 });
    await page.mouse.up();
    await sleep(100);
    const back = await loopOf(page);
    check('drag backwards (bar 15 up to bar 3): the loop is bars 3 to 15', Math.abs(back.region.start - (await timeOfBar(page, 2))) < 0.02 && Math.abs(back.region.end - (await timeOfBar(page, 15))) < 0.02 && (await loopedBars(page)) === '2,3,4,5,6,7,8,9,10,11,12,13,14');

    // A drag that starts on a chord selects (the editor is for a click).
    const c6 = await box(page, '.case[data-mesure="6"] .accord-case');
    const t8 = await middle(page, 8);
    await page.mouse.move(c6.x + c6.width / 2, c6.y + c6.height / 2);
    await page.mouse.down();
    await page.mouse.move(t8.x, t8.y, { steps: 8 });
    await page.mouse.up();
    await sleep(100);
    check('a drag from a chord selects bars 7 to 9 and opens no editor', (await loopedBars(page)) === '6,7,8' && !(await editorOpen(page)), await loopedBars(page));

    // A click inside the loop only moves the playhead.
    const keep = JSON.stringify((await loopOf(page)).region);
    p = await blank(page, 7);
    await page.mouse.click(p.x, p.y);
    await sleep(60);
    check('a click inside the loop moves the playhead and keeps the loop', JSON.stringify((await loopOf(page)).region) === keep && Math.abs((await position(page)) - (await timeOfBar(page, 7))) < 0.02);
    check('no page errors (mouse)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the sheet follows the playhead, and never fights the reader
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille', { width: 1280, height: 520 });
    await sleep(300);
    const scroller = '.vue-grille';
    const scrollTop = () => page.$eval(scroller, (e) => e.scrollTop);
    check('« Suivre la tête de lecture » is on by default', (await state(page)).view.follow === true);
    await page.evaluate(() => {
      const a = window.__fabtice.actions;
      a.toggleLoop();
      document.querySelector('.vue-grille').scrollTop = 0;
    });
    await page.evaluate((t) => window.__fabtice.actions.seek(t), await timeOfBar(page, 20));
    await sleep(100);
    check('the line being played is below the fold', (await page.$eval('.case.jouee', (e, s) => e.getBoundingClientRect().bottom > document.querySelector(s).getBoundingClientRect().bottom, scroller)) === true);
    await page.click('.jouer');
    await sleep(1400);
    const followed = await scrollTop();
    const inView = await page.$eval('.case.jouee', (e, s) => {
      const r = e.getBoundingClientRect();
      const v = document.querySelector(s).getBoundingClientRect();
      return r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
    }, scroller);
    check('playing: the sheet scrolled by itself to the line being played', followed > 150 && inView, `scrollTop ${followed}`);
    // The reader scrolls up: the sheet does not pull back.
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, -4000);
    await sleep(300);
    const mine = await scrollTop();
    await sleep(1800);
    check('the reader scrolls up while it plays: the sheet stays where they put it', mine < 40 && (await scrollTop()) < 40, `${mine} then ${await scrollTop()}`);
    await page.click('.jouer'); // pause
    // Following off: the sheet never moves by itself.
    await page.evaluate(() => {
      const a = window.__fabtice.actions;
      a.setFollow(false);
      document.querySelector('.vue-grille').scrollTop = 0;
    });
    await page.evaluate((t) => window.__fabtice.actions.seek(t), await timeOfBar(page, 20));
    await page.click('.jouer');
    await sleep(1500);
    check('following off: the sheet does not move', (await scrollTop()) === 0);
    await page.click('.jouer');
    check('no page errors (following)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the chord editor
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    await chordOf(page, 1).click();
    await sleep(500);
    const ed = '[data-testid="editeur"]';
    const eb = await box(page, ed);
    const cb = await box(page, '.case[data-mesure="1"]');
    // Under, over or beside the bar (depending on the room), never on it, always right next to it.
    const gapX = Math.max(cb.x - (eb.x + eb.width), eb.x - (cb.x + cb.width));
    const gapY = Math.max(cb.y - (eb.y + eb.height), eb.y - (cb.y + cb.height));
    check('the editor is anchored to the bar', Math.max(gapX, gapY) >= 0 && Math.max(gapX, gapY) < 20 && (gapX >= 0 ? gapY < cb.height : gapX < cb.width), `editor ${Math.round(eb.x)},${Math.round(eb.y)} bar ${Math.round(cb.x)},${Math.round(cb.y)}`);
    check('the chord being edited is ringed in ink', (await chordOf(page, 1).getAttribute('class')).includes('edite') && (await css(page, '.case[data-mesure="1"] .accord-case.edite', 'box-shadow')).includes(INK));
    check('the editor names the bar and shows the chord', (await text(page, `${ed} .editeur-tete h2`)) === 'MESURE 2' && (await text(page, `${ed} .editeur-apercu`)) === 'Fm7');
    check('it is a window of the design: paper, 1 px rule, 8 px radius, warm shadow', (await css(page, ed, 'background-color')) === 'rgb(251, 246, 236)' && (await css(page, ed, 'border-top-left-radius')) === '8px' && (await css(page, ed, 'box-shadow')) !== 'none');
    check('twelve notes, sixteen qualities, the current ones are marked', (await page.locator(`${ed} .editeur-notes button`).count()) === 12 && (await page.locator(`${ed} .editeur-natures button`).count()) === 16 && (await root(page, 'F').getAttribute('aria-checked')) === 'true' && (await root(page, 'mineur 7').getAttribute('aria-checked')) === 'true');
    check('qualities are written as on the chart: a triangle for major 7', (await page.locator(`${ed} .editeur-natures button[title="majeur 7"] svg.tri`).count()) === 1 && !(await text(page, `${ed} .editeur-natures`)).includes('maj'));
    check('the touch targets are 40 px or more', (await box(page, `${ed} .editeur-notes button`)).height >= 40 && (await box(page, `${ed} .editeur-natures button`)).height >= 40);
    check('only ink and brass in the editor: no ember', !(await page.$$eval(`${ed} *`, (els) => els.some((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderTopColor].some((v) => v === 'rgb(196, 80, 42)'); }))));

    await sleep(400); // the sheet has finished scrolling the bar and the window into view
    await page.screenshot({ path: path.join(out, 'app-grille-editeur-1280.png') });
    await page.click(`${ed} .editeur-plus`);
    await sleep(500);
    await page.screenshot({ path: path.join(out, 'app-grille-editeur-plus-1280.png') });
    await page.click(`${ed} .editeur-plus`);
    await sleep(200);
    await root(page, 'G').click();
    await sleep(80);
    let h = await handChord(page, 1);
    check('a note: the chord keeps its quality (Gm7), stored as a hand chord', h && h.chord.root === 7 && h.chord.quality === 'min7' && (await text(page, '.case[data-mesure="1"] .ch')) === 'Gm7', JSON.stringify(h));
    check('the preview in the editor follows', (await text(page, `${ed} .editeur-apercu`)) === 'Gm7');
    await root(page, 'majeur 7').click();
    await sleep(80);
    h = await handChord(page, 1);
    check('a quality: G△', h.chord.quality === 'maj7' && (await page.locator('.case[data-mesure="1"] .ch svg.tri').count()) === 1);
    await page.click(`${ed} .editeur-plus`);
    await page.locator('.editeur-extensions button').filter({ hasText: /^♭9$/ }).click();
    await page.locator('.editeur-extensions button').filter({ hasText: /^13$/ }).click();
    await page.selectOption(`${ed} .editeur-basse select`, '4');
    await sleep(80);
    h = await handChord(page, 1);
    check('an extension (several, in chart order) and a bass note', h.chord.extensions.join() === 'b9,13' && h.chord.bass === 4, JSON.stringify(h.chord));
    check('written on the chart: G△♭9 13 over E, extensions raised', (await text(page, '.case[data-mesure="1"] .ch')).replace(/\s/g, '') === 'G♭913/E' || (await text(page, '.case[data-mesure="1"] .ch')).includes('/E'), await text(page, '.case[data-mesure="1"] .ch'));
    await page.locator('.editeur-extensions button').filter({ hasText: /^♭9$/ }).click();
    check('an extension switches off again', (await handChord(page, 1)).chord.extensions.join() === '13');
    await page.selectOption(`${ed} .editeur-basse select`, '');
    await page.click(`${ed} .editeur-actions button:has-text("Pas d’accord")`);
    await sleep(80);
    check('« Pas d’accord (N.C.) »', (await handChord(page, 1)).chord === null && (await text(page, '.case[data-mesure="1"] .ch')) === 'N.C.');
    await root(page, 'C').click();
    await sleep(80);
    check('a note on N.C. starts a major triad', JSON.stringify((await handChord(page, 1)).chord) === JSON.stringify({ root: 0, quality: 'maj', extensions: [], bass: null }));

    // Two chords in the bar, and back to one.
    await page.click(`${ed} .editeur-actions button:has-text("Deux accords")`);
    await sleep(100);
    check('split: two chords in the bar, the second one is selected', (await page.locator('.case[data-mesure="1"] .accord-case').count()) === 2 && (await page.getAttribute(`${ed} .editeur-accords button:nth-child(2)`, 'aria-pressed')) === 'true' && (await chordOf(page, 1, 1).getAttribute('class')).includes('edite'));
    await root(page, 'D').click();
    await sleep(80);
    check('… and a note changes that second chord only', (await text(page, '.case[data-mesure="1"] .accord-case[data-accord="1"] .ch')) === 'D' && (await text(page, '.case[data-mesure="1"] .accord-case[data-accord="0"] .ch')) === 'C');
    await page.click(`${ed} .editeur-accords button:nth-child(1)`);
    check('the tabs go from one chord of the bar to the other', (await text(page, `${ed} .editeur-apercu`)) === 'C');
    await page.click(`${ed} .editeur-accords button:nth-child(2)`);
    await page.click(`${ed} .editeur-actions button:has-text("Un seul accord")`);
    await sleep(100);
    check('merge: one chord, the one that was selected', (await page.locator('.case[data-mesure="1"] .accord-case').count()) === 1 && (await text(page, '.case[data-mesure="1"] .ch')) === 'D' && (await page.locator(`${ed} .editeur-accords`).count()) === 0);
    await page.click(`${ed} .editeur-actions button:has-text("Retirer")`);
    await sleep(100);
    check('remove: the chord before goes on (repeat sign), the editor stays on the bar', (await text(page, '.case[data-mesure="1"] .repete')) === '𝄎' && (await editorOpen(page)) && (await text(page, `${ed} .editeur-note`)).startsWith('L’accord précédent continue'));
    check('« Revenir à l’analyse » is offered for a bar written by hand', (await page.locator(`${ed} .editeur-actions button:has-text("Revenir à l’analyse")`).count()) === 1);
    await page.click(`${ed} .editeur-actions button:has-text("Revenir à l’analyse")`);
    await sleep(100);
    const s0 = await edited(page);
    check('back to the analysis for this bar: Fm7 again, nothing left in the corrections', (await text(page, '.case[data-mesure="1"] .ch')) === 'Fm7' && s0.chords.length === 0 && s0.handSpans.length === 0);
    check('… and the button is not offered for a bar the analysis wrote', (await page.locator(`${ed} .editeur-actions button:has-text("Revenir à l’analyse")`).count()) === 0);

    // The focus goes back to the chord when it closes.
    await page.keyboard.press('Escape');
    await sleep(60);
    check('Escape: closed, the focus is back on the chord', !(await editorOpen(page)) && (await activeStop(page)) === '1:0', await activeStop(page));

    // A doubtful chord: one click confirms it.
    await chordOf(page, 11).click();
    await sleep(400);
    check('a doubtful chord: the editor says so and offers « C’est le bon accord » and the other readings', (await page.locator('[data-testid="editeur-doute"]').count()) === 1 && (await page.locator('[data-testid="editeur-doute"] .puce').count()) >= 1);
    await page.screenshot({ path: path.join(out, 'app-grille-editeur-doute-1280.png') });
    const doubtBefore = await state(page);
    await page.click('[data-testid="editeur-doute"] button:has-text("C’est le bon accord")');
    await sleep(100);
    const doubtAfter = await state(page);
    h = await handChord(page, 11);
    check('« C’est le bon accord »: same chord, now a hand chord, no more doubt', h && h.chord.root === 1 && h.chord.quality === 'min6' && (await page.locator('.case[data-mesure="11"] .ch.douteux').count()) === 0 && (await page.locator('[data-testid="editeur-doute"]').count()) === 0 && doubtBefore.analysis.chords.length === doubtAfter.analysis.chords.length);
    await page.keyboard.press('Escape');

    // A bar where the chord goes on: editing it writes a chord.
    check('bar 25 is a repeat bar', (await page.locator('.case[data-mesure="24"] .repete').count()) === 1);
    await chordOf(page, 24, -1).click();
    await sleep(300);
    check('a repeat bar opens the editor on the chord that goes on', (await text(page, `${ed} .editeur-apercu`)).startsWith('E'), await text(page, `${ed} .editeur-apercu`));
    await root(page, 'D').click();
    await sleep(100);
    h = await handChord(page, 24);
    check('… a note there writes the chord (quality and extension carried on)', h && h.chord.root === 2 && h.chord.quality === '7' && (await page.locator('.case[data-mesure="24"] .repete').count()) === 0 && (await text(page, '.case[data-mesure="24"] .ch')).startsWith('D7'), JSON.stringify(h));
    await page.keyboard.press('Escape');

    // Typing a symbol.
    await chordOf(page, 2).click();
    await sleep(200);
    await page.fill('[data-testid="editeur"] .editeur-saisie input', 'Zz9');
    await page.keyboard.press('Enter');
    await sleep(60);
    check('an unreadable symbol: said calmly, nothing changed, the editor stays', (await page.locator('.editeur-erreur').count()) === 1 && (await handChord(page, 2)) === null && (await editorOpen(page)));
    await page.fill('[data-testid="editeur"] .editeur-saisie input', 'Ebmaj7');
    await page.keyboard.press('Enter');
    await sleep(100);
    h = await handChord(page, 2);
    check('a typed symbol (Ebmaj7) replaces the chord and closes the editor', h && h.chord.root === 3 && h.chord.quality === 'maj7' && !(await editorOpen(page)));
    check('… and the focus moves on to the next chord, ready for the next one', (await activeStop(page)) === '3:0', await activeStop(page));

    // Sections.
    await chordOf(page, 3).click();
    await sleep(300);
    await page.click('[data-testid="editeur"] .puce-lettre:has-text("C")');
    await sleep(100);
    check('a section letter on bar 4: boxed letter and a double bar', (await text(page, '.case[data-mesure="3"] .section')) === 'C' && (await page.getAttribute('.case[data-mesure="3"]', 'class')).includes('double'));
    await page.fill('[data-testid="editeur"] .editeur-section input', 'Solo');
    await page.keyboard.press('Enter');
    await sleep(100);
    check('renamed (a short word)', (await text(page, '.case[data-mesure="3"] .section')) === 'Solo' && (await state(page)).corrections.sections.filter((x) => x.label === 'Solo').length === 1);
    await page.click('[data-testid="editeur"] button:has-text("Retirer la lettre")');
    await sleep(100);
    check('removed: no letter, no double bar', (await page.locator('.case[data-mesure="3"] .section').count()) === 0 && !(await page.getAttribute('.case[data-mesure="3"]', 'class')).includes('double'));
    await page.keyboard.press('Escape');
    await page.click('.case[data-mesure="8"] .section');
    await sleep(300);
    check('a click on an existing section letter opens the editor on its name', (await editorOpen(page)) && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Nom de la section');
    await page.keyboard.press('Escape');
    check('no page errors (editor)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the chord editor stays whole and in view (computer)
  {
    const ed = '[data-testid="editeur"]';
    for (const [w, h] of [[1280, 800], [960, 640]]) {
      const { page, errors } = await open('?demo&moteur=factice&vue=grille', { width: w, height: h });
      await sleep(300);
      // A first line bar with two chords (the case of the report): split the second bar first.
      await page.locator('.case[data-mesure="1"] .accord-case').first().click();
      await sleep(200);
      await page.click(`${ed} .editeur-actions button:has-text("Deux accords")`);
      await page.keyboard.press('Escape');
      await sleep(200);
      let shot = 0;
      for (const [label, bar] of [['first line, two chords', 1], ['first line', 0], ['middle', 13], ['last line', 24]]) {
        for (const more of [false, true]) {
          await page.locator(`.case[data-mesure="${bar}"] .accord-case`).first().click();
          await sleep(200);
          if (more) await page.click(`${ed} .editeur-plus`);
          await sleep(900); // smooth scrolling settles
          const r = await page.evaluate(() => {
            const bb = (el) => el.getBoundingClientRect();
            const view = bb(document.querySelector('.vue-grille'));
            const transport = bb(document.querySelector('.bas'));
            const bottom = Math.min(view.bottom, transport.top);
            const editor = document.querySelector('[data-testid="editeur"]');
            const eb = bb(editor);
            const cell = bb(document.querySelector('.case.edite, .case:has(.accord-case.edite)') ?? document.body);
            // Every control, once the editor's own scroll has brought it to the top of its window if needed.
            const out = [];
            for (const b of editor.querySelectorAll('button, input, select')) {
              b.scrollIntoView({ block: 'nearest' });
              const r = bb(b);
              if (r.width === 0) continue;
              if (r.top < view.top - 0.5 || r.bottom > bottom + 0.5 || r.left < view.left - 0.5 || r.right > view.right + 0.5 || r.top < eb.top - 0.5 || r.bottom > eb.bottom + 0.5) out.push((b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 24));
            }
            editor.scrollTop = 0;
            const e2 = bb(editor);
            return { out, editorInside: e2.top >= view.top - 0.5 && e2.bottom <= bottom + 0.5 && e2.left >= -0.5 && e2.right <= innerWidth + 0.5, cellVisible: cell.height > 0 && cell.top >= view.top - 0.5 && cell.bottom <= bottom + 0.5, e2, cell, bottom };
          });
          const tag = `${w}×${h}, ${label}${more ? ', extensions unfolded' : ''}`;
          check(`editor, ${tag}: every control is inside the visible area above the transport`, r.out.length === 0 && r.editorInside, `${r.out.join(', ')} ${JSON.stringify([r.e2.top, r.e2.bottom, r.bottom])}`);
          check(`editor, ${tag}: the bar being edited is visible and not covered`, r.cellVisible && !(r.e2.left < r.cell.right && r.e2.right > r.cell.left && r.e2.top < r.cell.bottom && r.e2.bottom > r.cell.top), JSON.stringify(r.cell));
          if (shot++ < 8 && (more || label === 'first line, two chords')) await page.screenshot({ path: path.join(out, `app-grille-editeur-place-${w}-${bar}${more ? '-plus' : ''}.png`) });
          await page.keyboard.press('Escape');
          await sleep(150);
        }
      }
      check(`no page errors (editor placement ${w}×${h})`, errors.length === 0, errors.join(' | '));
      await page.close();
    }
  }

  // ------------------------------------------------------------ every panel stays in the window, above the transport (« Réglages » is a window of its own: test:settings)
  {
    const panels = [
      { name: 'grid panel (Tempo)', sel: '.panneau-grille', view: 'pistes', open: (page) => page.click('.rang-tete.tempo') },
      { name: 'analysis panel', sel: '.panneau-analyse', view: 'pistes', open: (page) => page.evaluate(() => window.__fabtice.actions.openPanel('analysis')) },
      { name: 'menu Fabtice', sel: '#menu-fabtice', view: 'pistes', open: (page) => openMenu(page) },
      { name: 'fine tuning', sel: '.panneau-accord', up: true, view: 'pistes', open: (page) => page.evaluate(() => window.__fabtice.actions.openPanel('tuning')) },
      { name: 'key editor', sel: '.cle-editeur', view: 'grille', open: (page) => page.click('[data-testid="cle-bouton"]') },
    ];
    for (const [w, h] of [[1280, 800], [1024, 700], [960, 640]]) {
      for (const view of ['pistes', 'grille']) {
        const { page, errors } = await open(`?demo&moteur=factice&vue=${view}`, { width: w, height: h });
        await sleep(300);
        for (const p of panels.filter((x) => x.view === view)) {
          await p.open(page);
          await sleep(450);
          const r = await page.evaluate(([sel, up]) => {
            const panel = document.querySelector(sel);
            if (!panel) return null;
            // The tuning panel opens upwards from the Tonalité box, inside the transport bar: it only has to stay in the window.
            const bas = up ? innerHeight : document.querySelector('.bas').getBoundingClientRect().top;
            const pb = panel.getBoundingClientRect();
            const out = [];
            let last = null;
            for (const b of panel.querySelectorAll('button, input, select, a')) {
              b.scrollIntoView({ block: 'nearest' });
              const r = b.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              last = b;
              if (r.top < 0 - 0.5 || r.bottom > bas + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < pb.top - 0.5 || r.bottom > pb.bottom + 0.5) out.push((b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 24));
            }
            panel.scrollTop = 0;
            const e = panel.getBoundingClientRect();
            return { out, inside: e.top >= -0.5 && e.bottom <= bas + 0.5 && e.left >= -0.5 && e.right <= innerWidth + 0.5, top: e.top, bottom: e.bottom, bas, lastIndex: last ? [...panel.querySelectorAll('button, input, select, a')].indexOf(last) : -1 };
          }, [p.sel, !!p.up]);
          const tag = `${p.name} at ${w}×${h}`;
          check(`${tag}: the panel and every control lie inside the window, above the transport`, !!r && r.out.length === 0 && r.inside, r ? `${r.out.join(', ')} ${Math.round(r.top)}-${Math.round(r.bottom)} / transport ${Math.round(r.bas)}` : 'not open');
          if (r) {
            // A real click would reach it: trial mode runs Playwright's hit-target check (nothing covers the control).
            const last = page.locator(`${p.sel} :is(button, input, select, a):visible:enabled`).last();
            let clickable = true;
            let why = '';
            try {
              await last.click({ trial: true, timeout: 3000 });
            } catch (e) {
              clickable = false;
              why = String(e.message).split('\n').slice(0, 3).join(' ');
            }
            check(`${tag}: the last control can really be clicked`, clickable, why);
          }
          if (w === 960) await page.screenshot({ path: path.join(out, `app-panneau-${p.sel.replace(/[^a-z-]/g, '')}-960.png`) });
          await page.evaluate(() => window.__fabtice.actions.closePanel());
          await sleep(150);
        }
        check(`panels ${w}×${h} ${view}: no page errors`, errors.length === 0, errors.join(' | '));
        await page.close();
      }
    }
  }

  // ------------------------------------------------------------ the key
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    await page.click('[data-testid="cle-bouton"]');
    await sleep(300);
    const kp = '[data-testid="cle-editeur"]';
    check('a click on « Tonalité de A♭ » opens the key window (major, A♭ marked)', (await page.locator(kp).count()) === 1 && (await page.locator('.cle-notes button').filter({ hasText: /^A♭$/ }).getAttribute('aria-checked')) === 'true');
    await page.click(`${kp} .cle-mode button:has-text("Mineur")`);
    await page.getByRole('radio', { name: 'F', exact: true }).click();
    await sleep(120);
    let s1 = await state(page);
    check('F minor: stored as the key by hand, the title line says it, the window closed', JSON.stringify(s1.corrections.key) === JSON.stringify({ tonic: 5, mode: 'minor' }) && (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de Fm') && (await page.locator(kp).count()) === 0);
    await page.click('[data-testid="cle-bouton"]');
    check('the window says it was corrected by hand', (await text(page, `${kp} .panneau-note`)) === 'Corrigée à la main.');
    await page.click(`${kp} button:has-text("Revenir à la tonalité de l’analyse")`);
    await sleep(100);
    s1 = await state(page);
    check('back to the analysed key: A♭, no correction left', s1.corrections.key === null && (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de A♭'));
    await page.click('[data-testid="cle-bouton"]');
    await page.keyboard.press('Escape');
    await sleep(60);
    check('Escape closes the key window, the focus is back on its button', (await page.locator(kp).count()) === 0 && (await page.evaluate(() => document.activeElement?.dataset?.testid)) === 'cle-bouton');
    check('no page errors (key)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ B♭ instrument and +2 semitones: what is typed is what is shown, what is stored is concert pitch
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    await page.evaluate(() => {
      window.__fabtice.actions.stepSemitones(1);
      window.__fabtice.actions.stepSemitones(1);
      window.__fabtice.lot2.harmony.setInstrument('sib');
    });
    await sleep(100);
    check('displayed key: A♭ + 2 semitones + B♭ instrument = C', (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de C pour instrument en Si♭'));
    const before = JSON.stringify((await state(page)).analysis);
    // Click on a note.
    await chordOf(page, 3).click();
    await sleep(300);
    await root(page, 'E').click();
    await sleep(80);
    let h = await handChord(page, 3);
    check('a note clicked in the editor (displayed E) is stored a major third lower… (C: 4 semitones up)', h.chord.root === 0, JSON.stringify(h.chord));
    check('… and shown as E', (await text(page, '.case[data-mesure="3"] .ch')).startsWith('E'));
    // Typed.
    await page.fill('[data-testid="editeur"] .editeur-saisie input', 'Bb7');
    await page.keyboard.press('Enter');
    await sleep(100);
    h = await handChord(page, 3);
    check('a typed Bb7 (displayed) is stored as F♯7 = G♭7 (B♭ = 10, minus 4)', h.chord.root === 6 && h.chord.quality === '7', JSON.stringify(h.chord));
    check('… shown as typed', (await text(page, '.case[data-mesure="3"] .ch')) === 'B♭7');
    // Bass note, as displayed.
    await chordOf(page, 3).click();
    await sleep(200);
    await page.click('[data-testid="editeur"] .editeur-plus');
    await page.selectOption('[data-testid="editeur"] .editeur-basse select', '10'); // displayed B♭... option value is the displayed pitch class
    await sleep(80);
    h = await handChord(page, 3);
    check('a bass note chosen as displayed is stored at concert pitch too (displayed 10 → 6 is the root, so none)', h.chord.bass === null, JSON.stringify(h.chord));
    await page.selectOption('[data-testid="editeur"] .editeur-basse select', '2'); // displayed D
    await sleep(80);
    h = await handChord(page, 3);
    check('displayed D over B♭7 is stored as concert pitch (2 − 4 = 10)', h.chord.bass === 10, JSON.stringify(h.chord));
    await page.keyboard.press('Escape');
    // The key window: displayed C major is the analysed key: no correction; displayed D♭ is stored as A.
    await page.click('[data-testid="cle-bouton"]');
    await page.getByRole('radio', { name: 'C', exact: true }).click();
    await sleep(100);
    check('the displayed key chosen again (C major = the analysed A♭): no correction', (await state(page)).corrections.key === null);
    await page.click('[data-testid="cle-bouton"]');
    await page.locator('.cle-notes button').filter({ hasText: /^D♭$/ }).click();
    await sleep(100);
    check('displayed D♭ major is stored in the original key: A major (9)', JSON.stringify((await state(page)).corrections.key) === JSON.stringify({ tonic: 9, mode: 'major' }), JSON.stringify((await state(page)).corrections.key));
    check('the analysis itself is untouched', JSON.stringify((await state(page)).analysis) === before);
    check('no page errors (instrument)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the keyboard
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    await page.focus('[data-stop="0:0"]');
    await page.keyboard.press('ArrowRight');
    check('→ goes to the next chord', (await activeStop(page)) === '1:0');
    await page.keyboard.press('ArrowDown');
    check('↓ goes to the line below, same column', (await activeStop(page)) === '5:0');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    check('← and ↑ come back', (await activeStop(page)) === '0:0');
    await page.keyboard.press('End');
    check('End: the last chord', (await activeStop(page)) === '24:-1');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    check('the chart is one tab stop: Tab leaves it', (await activeStop(page)) === null);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    check('… and comes back to the chord last visited', (await activeStop(page)) === '0:0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await sleep(300);
    check('Enter opens the editor, with the cursor in the typing field', (await editorOpen(page)) && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Taper un accord');
    await page.keyboard.press('Escape');
    await sleep(60);
    check('Escape closes it, the focus returns to the chord', !(await editorOpen(page)) && (await activeStop(page)) === '1:0');
    // Typing replaces the chord: a letter opens the field with that letter, the rest goes in, Enter applies.
    await page.keyboard.type('Bbm7', { delay: 70 });
    await sleep(150);
    check('typing a letter opens the editor with it in the field', (await editorOpen(page)) && (await page.inputValue('[data-testid="editeur"] .editeur-saisie input')) === 'Bbm7');
    await page.keyboard.press('Enter');
    await sleep(100);
    let h = await handChord(page, 1);
    check('Bbm7 replaces the chord (B♭m7), the editor closes, the focus is on the next chord', h && h.chord.root === 10 && h.chord.quality === 'min7' && (await activeStop(page)) === '2:0', JSON.stringify(h));
    // And on: F7b9, then C-7, then Ebmaj7, a letter and Enter each.
    for (const sym of ['F7b9', 'C-7', 'Ebmaj7']) {
      await page.keyboard.type(sym, { delay: 70 });
      await page.keyboard.press('Enter');
      await sleep(80);
    }
    const typed = await Promise.all([2, 3, 4].map((b) => handChord(page, b)));
    check('F7b9, C-7, Ebmaj7 typed one after the other', typed[0].chord.root === 5 && typed[0].chord.extensions.join() === 'b9' && typed[1].chord.quality === 'min7' && typed[1].chord.root === 0 && typed[2].chord.quality === 'maj7' && typed[2].chord.root === 3, JSON.stringify(typed.map((x) => x.chord)));
    await page.keyboard.press('Space');
    await sleep(100);
    check('Space still plays and pauses', (await state(page)).transport.engine === 'playing');
    await page.keyboard.press('Space');
    check('no page errors (keyboard)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ the edits are kept: reload and find them again (a real piece, kept on the device)
  {
    const SWING = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../web/spikes/analyse/demo/demo-swing.mp3');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/?debug&moteur=factice&analyse=instant`);
    await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await page.waitForFunction(() => window.__fabtice.store.getState().project !== null && window.__fabtice.store.getState().analysis !== null, null, { timeout: 20000 });
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('.vue-grille .case .ch');
    // Two bars that have a chord of their own (the piece is the prototype's excerpt).
    const own = await page.$$eval('.case:has(.accord-case[data-accord="0"])', (els) => els.map((e) => Number(e.dataset.mesure)));
    const [barA, barB] = [own[2], own[5]];
    await chordOf(page, barA).click();
    await sleep(300);
    await page.fill('[data-testid="editeur"] .editeur-saisie input', 'Ab7#11');
    await page.keyboard.press('Enter');
    await sleep(100);
    await chordOf(page, barB).click();
    await sleep(200);
    await page.click('[data-testid="editeur"] .puce-lettre:has-text("B")');
    await page.keyboard.press('Escape');
    await page.click('[data-testid="cle-bouton"]');
    await page.click('[data-testid="cle-editeur"] .cle-mode button:has-text("Mineur")');
    await page.getByRole('radio', { name: 'A', exact: true }).click();
    const edits = await edited(page);
    const wanted = JSON.stringify({ chords: edits.chords, sections: edits.sections, key: edits.key });
    check('edits made: one chord, one section letter, a key', edits.chords.length === 1 && edits.sections.length === 1 && edits.key !== null, wanted);
    await sleep(2500); // autosave is debounced
    await page.reload();
    await page.waitForFunction(() => window.__fabtice.store.getState().project !== null && window.__fabtice.store.getState().analysis !== null, null, { timeout: 20000 });
    const back = await edited(page);
    check('reload: the chord, the section letter and the key are found again (autosave)', JSON.stringify({ chords: back.chords, sections: back.sections, key: back.key }) === wanted, JSON.stringify({ chords: back.chords, sections: back.sections, key: back.key }));
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('.vue-grille .case .ch');
    const shownA = await text(page, `.case[data-mesure="${barA}"] .ch`);
    const sectionsShown = await page.locator('.case .section').allInnerTexts();
    check('… and the chart shows them (A♭7♯11 spelled G♯ in A minor)', shownA.startsWith('G♯7') && sectionsShown.includes('B') && (await text(page, '[data-testid="grille-ton"]')).startsWith('Tonalité de Am'), `${shownA} / ${sectionsShown} / ${await text(page, '[data-testid="grille-ton"]')}`);
    check('no page errors (autosave)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the phone: real touch events, the editor as a sheet
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${url}/?demo&moteur=factice&vue=grille`);
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const tap = async (x, y) => {
      await touch('touchStart', x, y);
      await sleep(60);
      await touch('touchEnd');
      await sleep(120);
    };
    const edge = (page, bar, fx = 0.8, fy = 0.9) => box(page, `.case[data-mesure="${bar}"]`).then((b) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy }));

    check('phone: the touch hint is shown (touch screen only)', (await text(page, '.aide-doigt')).includes('Restez appuyé'));
    await page.evaluate(() => window.__fabtice.actions.toggleLoop());
    let p = await edge(page, 6);
    await tap(p.x, p.y);
    check('phone: a tap on a bar moves the playhead to its start', Math.abs((await position(page)) - (await timeOfBar(page, 6))) < 0.02 && !(await editorOpen(page)), String(await position(page)));
    const c1 = await box(page, '.case[data-mesure="2"] .accord-case');
    check('phone: a chord is a touch target of 40 px or more', c1.height >= 40);
    await tap(c1.x + c1.width / 2, c1.y + c1.height / 2);
    await sleep(500);
    check('phone: a tap on a chord opens the editor as a sheet from the bottom', (await editorOpen(page)) && (await css(page, '[data-testid="editeur"]', 'position')) === 'fixed');
    const sheet = await box(page, '[data-testid="editeur"]');
    check('phone: the sheet is as wide as the screen and sits at its bottom', Math.abs(sheet.width - 390) < 1 && Math.abs(sheet.y + sheet.height - 844) < 2, `${sheet.width} × ${sheet.height} at ${sheet.y}`);
    const cNow = await box(page, '.case[data-mesure="2"]');
    check('phone: the bar being edited stays in view above the sheet', cNow.y + cNow.height <= sheet.y + 1 && cNow.y >= 0, `bar bottom ${cNow.y + cNow.height}, sheet top ${sheet.y}`);
    check('phone: no on-screen keyboard pulled up by a tap (the typing field is not focused)', (await page.evaluate(() => document.activeElement?.tagName)) !== 'INPUT');
    const small = await page.$$eval('[data-testid="editeur"] button', (els) => els.filter((b) => b.getBoundingClientRect().height < 39.5 && b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== 'hidden').map((b) => b.textContent));
    check('phone: every control of the sheet is a target of 40 px', small.length === 0, small.join(','));
    await page.screenshot({ path: path.join(out, 'app-grille-editeur-390.png') });
    // A note, by thumb.
    const g = await box(page, '[data-testid="editeur"] .editeur-notes button:nth-child(8)');
    await tap(g.x + g.width / 2, g.y + g.height / 2);
    const h = await handChord(page, 2);
    check('phone: a tap on a note writes the chord (G, quality kept)', h && h.chord.root === 7, JSON.stringify(h));
    // Tapping the bar below the sheet closes it and moves the playhead: here, outside of the sheet.
    const x = await box(page, '[data-testid="editeur"] .fermer');
    await tap(x.x + x.width / 2, x.y + x.height / 2);
    check('phone: the cross closes the sheet', !(await editorOpen(page)));

    // A finger that slides scrolls the sheet and does not touch the loop.
    const loopBefore = JSON.stringify(await loopOf(page));
    await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
    const top = await edge(page, 4, 0.5, 0.5);
    await touch('touchStart', top.x, top.y + 150);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', top.x, top.y + 150 - i * 25);
      await sleep(16);
    }
    await touch('touchEnd');
    await sleep(400);
    const scrolled = await page.$eval('.vue-grille', (e) => e.scrollTop);
    check('phone: a drag scrolls the sheet…', scrolled > 40, `scrollTop ${scrolled}`);
    check('phone: … and neither selects bars nor moves the playhead nor opens an editor', JSON.stringify(await loopOf(page)) === loopBefore && !(await editorOpen(page)));
    await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
    await sleep(100);

    // Press and hold on a bar, then drag: the selection.
    await page.evaluate(() => {
      window.__fabtice.actions.setLoopRegion(null);
      window.__fabtice.actions.seek(0);
    });
    const a = await edge(page, 5, 0.8, 0.9);
    const z = await edge(page, 10, 0.5, 0.9);
    await touch('touchStart', a.x, a.y);
    await sleep(700); // the hold
    const held = await loopOf(page);
    check('phone: press and hold selects the bar under the finger (the veil tells it worked)', held.enabled && (await loopedBars(page)) === '5', await loopedBars(page));
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', a.x + ((z.x - a.x) * i) / 10, a.y + ((z.y - a.y) * i) / 10);
      await sleep(30);
    }
    await sleep(80);
    check('phone: … and dragging on extends it across lines (bars 6 to 11)', (await loopedBars(page)) === '5,6,7,8,9,10', await loopedBars(page));
    check('phone: the sheet did not scroll while selecting', (await page.$eval('.vue-grille', (e) => e.scrollTop)) < 5);
    await page.screenshot({ path: path.join(out, 'app-grille-selection-390.png') });
    await touch('touchEnd');
    await sleep(150);
    check('phone: lifting the finger ends the selection and brings the playhead into the loop', Math.abs((await position(page)) - (await timeOfBar(page, 5))) < 0.05 && !(await editorOpen(page)), String(await position(page)));

    // Export entries in the phone menu.
    await page.evaluate(() => {
      window.__printed = null;
      window.print = () => {
        window.__printed = { mode: window.__fabtice.store.getState().view.mode, sheets: document.querySelectorAll('.pp-papier').length };
      };
    });
    await page.evaluate(() => window.__fabtice.actions.setViewMode('pistes'));
    await sleep(100);
    await openMenu(page);
    await page.tap('.feuille-menu [data-sous-menu="export"]');
    await sleep(300);
    const items = await page.$$eval('.feuille-menu-liste [role="menuitem"]', (els) => els.map((e) => `${e.querySelector('.menu-texte').textContent}:${e.getAttribute('aria-disabled') === 'true'}`));
    check('phone: the menu Fabtice lists the export entries (Audio…, iReal Pro, PDF…)', items.map((i) => i.split(':')[0]).join() === 'Audio…,iReal Pro,PDF…', items.join());
    check('phone: « PDF… » is available there', items.includes('PDF…:false'));
    await page.screenshot({ path: path.join(out, 'app-390-menu-export.png') });
    await closeMenu(page);
    await menuCommand(page, 'Imprimer…');
    await page.waitForSelector('[data-testid="impression"]');
    await page.screenshot({ path: path.join(out, 'impression-dialogue-390.png') });
    await page.tap('[data-testid="impression-imprimer"]');
    await page.waitForFunction(() => window.__printed !== null, null, { timeout: 5000 });
    check('phone: printing from the menu prints the sheets of the window, from the tracks view (the view is not switched)', (await page.evaluate(() => window.__printed))?.mode === 'pistes' && (await page.evaluate(() => window.__printed.sheets)) >= 1);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await sleep(100);
    check('phone: … and the tracks view is still there afterwards', (await state(page)).view.mode === 'pistes' && (await page.locator('[data-testid="impression"]').count()) === 0);
    check('phone: the page never scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('no page errors (touch)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ signatures bar by bar (C13), through the debug handle
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    const { page, errors } = await open('?demo&moteur=factice&vue=grille', viewport);
    await sleep(300);
    // « mesure 3 » alone in 7/8, then 6/8 from « mesure 6 »: one undo step each.
    const done = await page.evaluate(() => {
      const m = window.__fabtice.lot2.meter;
      return [m.setMeterForBar(2, { numerator: 7, denominator: 8 }), m.setMeterFrom(5, { numerator: 6, denominator: 8 })];
    });
    check(`${w}: both commands applied`, done.every(Boolean), JSON.stringify(done));
    await sleep(400);
    const sig = await page.$$eval('.vue-grille .case', (cells) => cells.slice(0, 9).map((c) => [c.dataset.mesure, c.querySelector('.numero')?.textContent, c.querySelector('.signature')?.dataset.signature ?? null]));
    const expected = [['0', '1', '4/4'], ['1', '2', null], ['2', '3', '7/8'], ['3', '4', '4/4'], ['4', '5', null], ['5', '6', '6/8'], ['6', '7', null], ['7', '8', null], ['8', '9', null]];
    check(`${w}: bar numbers follow, the signature written where it changes and in the first bar`, JSON.stringify(sig) === JSON.stringify(expected), JSON.stringify(sig));
    // The bar lines of the grid: the 7/8 bar lasts 3.5 analysed beats, a 6/8 bar 3 (the quarter stays the quarter).
    const lines = await page.evaluate(() => {
      const s = window.__fabtice.store.getState();
      const { barStartTime, beatToTime } = window.__fabtice.lot4.tempoMap;
      const map = s.tempoMap;
      return [2, 3, 5, 6, 7].map((bar) => [barStartTime(map, bar), beatToTime(map, { 2: 8, 3: 11.5, 5: 19.5, 6: 22.5, 7: 25.5 }[bar])]);
    });
    check(`${w}: bar lines of bars 3, 4, 6, 7, 8 at 8, 11.5, 19.5, 22.5, 25.5 analysed beats`, lines.every(([a, b]) => Math.abs(a - b) < 1e-6), JSON.stringify(lines));
    const placed = (await geometry(page)).filter((b) => ['2', '3', '5', '6'].includes(b.bar));
    check(`${w}: in the bars with a signature, every chord at the place of its beat, none touching`, placed.every((b) => b.problems.length === 0), placed.filter((b) => b.problems.length).map((b) => `bar ${b.bar}: ${b.problems.join(', ')}`).join(' ; '));
    const clear = await page.$$eval('.case.signee', (cells) =>
      cells.every((c) => {
        const s = c.querySelector('.signature').getBoundingClientRect();
        const r = c.getBoundingClientRect();
        const ch = c.querySelector('.ch')?.getBoundingClientRect();
        return s.left >= r.left && s.right <= r.right && s.height > 0 && (!ch || s.right <= ch.left + 1);
      }),
    );
    check(`${w}: the written signature sits in its bar, before the first chord`, clear);
    await page.screenshot({ path: path.join(out, `signatures-grille-${w}.png`) });
    const undone = await page.evaluate(() => [window.__fabtice.history.undoLabel(), window.__fabtice.history.undo(), window.__fabtice.history.undo(), window.__fabtice.store.getState().tempoMap.meters.length]);
    await sleep(300);
    check(`${w}: « Annuler : signature rythmique » twice gives back one signature, nothing written in the bars`, undone[0] === 'Annuler : signature rythmique' && undone[3] === 1 && (await page.locator('.case .signature').count()) === 0, JSON.stringify(undone));
    check(`no page errors (signatures, ${w})`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ printing
  // The print window itself (preview, options, PDF of the sheets) is checked by `npm run test:print`; here, the way in.
  {
    const { page, errors } = await open('?demo&moteur=factice&vue=grille');
    await sleep(300);
    const control = page.locator('[data-testid="imprimer-grille"]');
    check('the chart has its own quiet « Imprimer » button, with a printer icon, beside the instrument choice', (await control.innerText()) === 'Imprimer' && (await control.locator('svg').count()) === 1 && (await control.getAttribute('title')) === 'Imprimer la grille, ou l’enregistrer en PDF');
    check('… in the encre-douce ink, not the ember', (await css(page, '[data-testid="imprimer-grille"]', 'color')) === INK_SOFT);
    await page.screenshot({ path: path.join(out, 'grille-bouton-imprimer-1280.png') });
    await control.click();
    await page.waitForSelector('[data-testid="impression"]');
    check('the button opens the print window: a preview, « Enregistrer en PDF » and « Imprimer »', (await page.locator('.pp-papier').count()) === 1 && (await text(page, '[data-testid="impression-pdf"]')) === 'Enregistrer en PDF' && (await text(page, '[data-testid="impression-imprimer"]')) === 'Imprimer');
    await page.screenshot({ path: path.join(out, 'impression-dialogue-1280.png') });
    await page.keyboard.press('Escape');
    await sleep(100);
    check('Escape closes the window', (await page.locator('[data-testid="impression"]').count()) === 0);
    check('the chart on the screen has no trace of the paper (no « pour instrument en Ut » in C, no print rule left)', !(await text(page, '[data-testid="grille-ton"]')).includes('pour instrument') && (await page.evaluate(() => !document.querySelector('style[data-impression="page"]'))));

    // From the tracks view, by the menu: the same window, and the tracks view stays.
    await page.evaluate(() => window.__fabtice.actions.setViewMode('pistes'));
    check('menu: « Imprimer… » is available', (await menuEntry(page, 'Imprimer…')).enabled);
    await menuCommand(page, 'Imprimer…');
    await page.waitForSelector('[data-testid="impression"]');
    check('printing from the tracks view: the window prints the chart as well (one sheet), the view stays « Pistes »', (await page.locator('.pp-papier').count()) === 1 && (await state(page)).view.mode === 'pistes');
    await page.keyboard.press('Escape');
    await sleep(100);
    check('no page errors (printing)', errors.length === 0, errors.join(' | '));
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
