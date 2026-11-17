// « Grille complète simplifiée » (C14, stage 5, fourth batch) in Chromium, in both forms of the interface: a computer
// (1280 × 800, a mouse) and a phone (390 × 844, touch).
//   npm run build && npm run test:simplified
//
// Uses the made-up piece of the owner's example (`?demo&piece=feuilles`, `demo/demoAutumn.ts`: Intro, Thème (AABC),
// Solo Piano (AABC), Solo Trompette (AA), Thème 2 (BC), 97 bars in B minor, small variations between the repeats) with the
// silent engine, as a real state: its chords are the analysis', its letters and parts the detected structure.
// Checked, in each form:
//   - the blocks and their texts (Intro: Bm; A with its 8 bars, a repeat bracket and « ×2 »; B; C with its two-chord
//     bars; the « % » bars), the form line and its clickable parts, the quiet line about editing, no bar numbers, the final
//     double bar, one size for every chord;
//   - the playing: the written bar that corresponds to the audio is highlighted (several positions, the second pass of A
//     included), the repeat tag says which time it is, it moves while playing, the sheet follows smoothly;
//   - the clicks: a click goes to the next occurrence of the written bar (the first when none is after), a click on a
//     part of the form line goes to its start, a drag selects the played bars of the next occurrence (the loop veil on the
//     written bars), a right click, a long press and a click on a chord open nothing;
//   - « Affichage complet » is untouched, and a piece with no form says so calmly and shows the whole chart;
//   - the print window opens on it: one page, the headings, the repeat signs, « ×2 », the form line in full, the PDF is the
//     preview (same text, one A4 page);
//   - the phone: the blocks in the phone's chart size, the sheet of the structure opens on top;
//   - no horizontal scroll, no console error.
// Screenshots go to $FABTICE_SIMPLIFIED_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { differences, sameCharacters, readPdf } from './pdf-read.mjs';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_SIMPLIFIED_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-simplified-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const GRID = '[data-testid="grille-simplifiee"]';
// 120 BPM, first downbeat at 0.5 s: bar n starts at 0.5 + 2 n.
const barTime = (bar) => 0.5 + 2 * bar;

async function open(form, query = '?demo&piece=feuilles&moteur=factice&vue=grille') {
  const phone = form === 'phone';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 30000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.vue-grille .case .ch', { timeout: 20000 });
  await sleep(300);
  return { page, context, errors, phone, cdp: phone ? await context.newCDPSession(page) : null };
}

const showSimplified = async (page) => {
  await page.evaluate(() => window.__fabtice.structure.display.showSimplifiedChart());
  await page.waitForSelector(GRID);
  await sleep(500);
};
const seekBar = (page, bar, frac = 0.3) => page.evaluate((t) => window.__fabtice.actions.seek(t), barTime(bar) + frac * 2);
const position = (page) => page.evaluate(() => window.__fabtice.engine.getPosition());
const jouee = (page) => page.$$eval(`${GRID} .jouee`, (els) => els.map((e) => Number(e.dataset.ecrite)));
const tagOf = (page) => page.$$eval(`${GRID} .bloc-fois`, (els) => els.map((e) => e.textContent).filter(Boolean));
/** The chart as the store writes it: where a played bar is written, the occurrences of a written bar. */
const placeOf = (page, bar) =>
  page.evaluate((b) => {
    const f = window.__fabtice;
    const chart = f.structure.selectors.selectSimplifiedChart(f.store.getState());
    return chart.places.get(b) ?? null;
  }, bar);
const playedOf = (page, written) =>
  page.evaluate((w) => {
    const f = window.__fabtice;
    return f.structure.selectors.selectSimplifiedChart(f.store.getState()).bars[w].played;
  }, written);

/** What a written bar says: its chords (the triangle written △), « % » for a bar that goes on. */
const cellTexts = (page, block) =>
  page.$$eval(`${GRID} [data-bloc="${block}"] .case`, (cells) =>
    cells.map((c) => {
      if (c.querySelector('.repete')) return '%';
      return [...c.querySelectorAll('.accord-case .ch')]
        .map((ch) => [...ch.childNodes].map((n) => (n.nodeType === 1 && n.tagName.toLowerCase() === 'svg' ? '△' : n.textContent)).join('').replace(/\s+/g, ''))
        .join(' ');
    }),
  );

/** A point inside written bar `index`, in the page (the sheet scrolls it into the middle of the view first). */
async function cellPoint(page, index) {
  await page.evaluate((i) => document.querySelector(`[data-testid="grille-simplifiee"] [data-ecrite="${i}"]`).scrollIntoView({ block: 'center' }), index);
  await sleep(250);
  return page.evaluate((i) => {
    const b = document.querySelector(`[data-testid="grille-simplifiee"] [data-ecrite="${i}"]`).getBoundingClientRect();
    return { x: b.left + b.width * 0.55, y: b.top + b.height * 0.7 };
  }, index);
}

async function tap(h, x, y) {
  if (h.phone) {
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await h.page.mouse.click(x, y);
  await sleep(250);
}

/** Press, drag over written bars, release: a mouse, or a finger that holds first (the loop is selected by press and hold). */
async function drag(h, from, to) {
  const a = await cellPoint(h.page, from);
  // Both ends must be on screen at once: the second is found without scrolling.
  const b = await h.page.evaluate((i) => {
    const r = document.querySelector(`[data-testid="grille-simplifiee"] [data-ecrite="${i}"]`).getBoundingClientRect();
    return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.7 };
  }, to);
  if (h.phone) {
    const t = (type, x, y) => h.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await t('touchStart', a.x, a.y);
    await sleep(650);
    for (let k = 1; k <= 6; k++) {
      await t('touchMove', a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
      await sleep(40);
    }
    await t('touchEnd');
  } else {
    await h.page.mouse.move(a.x, a.y);
    await h.page.mouse.down();
    for (let k = 1; k <= 8; k++) {
      await h.page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
      await sleep(20);
    }
    await h.page.mouse.up();
  }
  await sleep(300);
}

async function suite(form) {
  const tag = form;
  const h = await open(form);
  const { page } = h;
  await showSimplified(page);

  // ---------------------------------------------------- the blocks and their texts
  const heads = await page.$$eval(`${GRID} [data-testid="bloc-titre"]`, (els) => els.map((e) => e.textContent));
  check(`${tag}: four blocks: Intro, A, B, C`, heads.join(' ') === 'Intro A B C', heads.join(' '));
  check(`${tag}: the letters are boxed as on the chart, the intro is named in the label style`, (await page.locator(`${GRID} .bloc-lettre`).count()) === 3 && (await page.locator(`${GRID} .bloc-nom`).count()) === 1);
  const counts = await page.$$eval(`${GRID} .bloc`, (els) => els.map((b) => b.querySelectorAll('.case').length));
  check(`${tag}: the bars: 1, 8, 8, 8`, counts.join(' ') === '1 8 8 8', counts.join(' '));
  check(`${tag}: Intro: Bm`, (await cellTexts(page, 'intro')).join('|') === 'Bm', (await cellTexts(page, 'intro')).join('|'));
  check(`${tag}: A, 8 bars, the last one %`, (await cellTexts(page, 'A')).join('|') === 'Em7|A7|D△|G△|C♯m7♭5|F♯7|Bm|%', (await cellTexts(page, 'A')).join('|'));
  check(`${tag}: B, 8 bars, % after the first Bm`, (await cellTexts(page, 'B')).join('|') === 'C♯m7♭5|F♯7|Bm|%|Em7|A7|D△|G△', (await cellTexts(page, 'B')).join('|'));
  check(`${tag}: C, with its two-chord bars (the key spells them with sharps) and its %`, (await cellTexts(page, 'C')).join('|') === 'C♯m7♭5|F♯7|Bm A♯7|Am7 G♯7|C♯m7♭5|F♯7|Bm|%', (await cellTexts(page, 'C')).join('|'));
  check(`${tag}: the variations of the repeats are not written (A13, F♯7♭9, the tritone C7: none on the page)`, !(await page.locator(GRID).innerText()).match(/A13|♭9|♯9|C7|Em9|Dmaj9|Bm6/));
  check(`${tag}: a bar that goes on has the repeat sign of the chart (the same glyph), labelled`, (await page.locator(`${GRID} .repete`).count()) === 3 && (await page.locator(`${GRID} .repete`).first().getAttribute('aria-label')) === 'Même accord que la mesure précédente');
  check(`${tag}: no bar numbers on the written bars`, (await page.locator(`${GRID} .numero`).count()) === 0);
  check(`${tag}: a two-chord bar writes each chord at its beat (1 and 3)`, (await page.$$eval(`${GRID} [data-bloc="C"] .ligne:first-of-type .case:nth-child(3) .accord-case`, (els) => els.map((e) => e.dataset.debut))).join() === '0,2');

  // ---------------------------------------------------- repeat signs, the final double bar
  check(`${tag}: A is played twice in a row: one opening sign, one closing sign, « ×2 »`, (await page.locator(`${GRID} .rep-debut`).count()) === 1 && (await page.locator(`${GRID} .rep-ferme`).count()) === 1 && (await page.locator(`${GRID} .rep-fois`).innerText()) === '×2');
  check(`${tag}: they are in A, on its first and its last bar`, (await page.locator(`${GRID} [data-bloc="A"] .case:first-of-type .rep-debut`).count()) === 1 && (await page.locator(`${GRID} [data-bloc="A"] .case:last-of-type .rep-ferme`).count()) === 1);
  check(`${tag}: the final double bar is at the very end (the last bar of C), once`, (await page.locator(`${GRID} .rep-final`).count()) === 1 && (await page.locator(`${GRID} [data-bloc="C"] .case:last-of-type .rep-final`).count()) === 1);
  const ink = await page.$eval(`${GRID} .rep-debut`, (e) => getComputedStyle(e).backgroundImage.includes('linear-gradient'));
  check(`${tag}: the signs are drawn (no image file)`, ink && (await page.$$eval(`${GRID} img`, (e) => e.length)) === 0);
  const sizes = await page.$$eval(`${GRID} .case[data-temps]`, (cells) => [...new Set(cells.map((c) => getComputedStyle(c).fontSize))]);
  check(`${tag}: one size for the chords of the whole chart`, sizes.length === 1, sizes.join(' '));
  check(`${tag}: the chords stay inside their bar`, await page.$$eval(`${GRID} .case`, (cells) => cells.every((c) => {
    const b = c.getBoundingClientRect();
    return [...c.querySelectorAll('.accord-case .ch')].every((ch) => { const r = ch.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; });
  })));

  // ---------------------------------------------------- the form line and the quiet line
  const form1 = await page.locator('[data-testid="ecrite-forme"]').innerText();
  check(`${tag}: « Forme : Intro, Thème 1 (AABC), Solo (Piano) (AABC), Solo (Trompette) (AA), Thème 2 (BC) »`, form1.replace(/\s+/g, ' ') === 'Forme : Intro, Thème 1 (AABC), Solo (Piano) (AABC), Solo (Trompette) (AA), Thème 2 (BC)', form1);
  check(`${tag}: five parts to click`, (await page.locator('[data-testid="ecrite-forme"] button').count()) === 5);
  check(`${tag}: « Pour corriger un accord, passez par l’affichage complet. » under it`, (await page.locator('[data-testid="ecrite-aide"]').innerText()) === 'Pour corriger un accord, passez par l’affichage complet.');
  check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.vue-grille').scrollWidth <= document.querySelector('.vue-grille').clientWidth + 1));
  await page.screenshot({ path: path.join(out, `${tag}-blocs.png`) });

  // ---------------------------------------------------- the playing: highlight and tag
  const cases = [
    [0, 'the intro', null],
    [1, 'the first A bar, first pass', 'reprise 1/6'],
    [9, 'the first A bar, second pass (« 2 »)', 'reprise 2/6'],
    [16, 'the last A bar, second pass', 'reprise 2/6'],
    [17, 'the first B bar, theme', '1ʳᵉ fois'],
    [25, 'the first C bar, theme', '1ʳᵉ fois'],
    [33, 'the first A bar of the piano solo', 'reprise 3/6'],
    [49, 'the first B bar of the piano solo', '2ᵉ fois'],
    [73, 'the first A bar of the second trumpet chorus', 'reprise 6/6'],
    [81, 'the first B bar of the second theme', '3ᵉ fois'],
    [96, 'the very last bar', '3ᵉ fois'],
  ];
  for (const [bar, what, tagText] of cases) {
    await seekBar(page, bar);
    await sleep(250);
    const place = await placeOf(page, bar);
    const lit = await jouee(page);
    check(`${tag}: at bar ${bar + 1} (${what}) the written bar ${place.written} is the one lit, and only it`, lit.length === 1 && lit[0] === place.written, `${lit.join(',')} / ${place.written}`);
    const tags = await tagOf(page);
    check(`${tag}: … its block says ${tagText ? `« ${tagText} »` : 'nothing'}`, tagText === null ? tags.length === 0 : tags.length === 1 && tags[0] === tagText, tags.join('|'));
  }
  await seekBar(page, 9, 0.5);
  await sleep(250);
  const fill = await page.$eval(`${GRID} .jouee`, (e) => getComputedStyle(e).getPropertyValue('--avance'));
  check(`${tag}: the ember hairline fills with the progress in the bar (half way)`, Math.abs(Number(fill) - 0.5) < 0.05, fill);
  if (!h.phone) check(`${tag}: the part being played is marked in the column (« Thème 1 » at bar 10)`, (await page.locator('.structure-partie[data-jouee] .structure-nom-texte').innerText()) === 'Thème 1');
  await page.evaluate(() => window.__fabtice.engine.pause());

  // It moves while playing.
  await seekBar(page, 1, 0.8);
  await sleep(200);
  const before = (await jouee(page))[0];
  await page.evaluate(() => window.__fabtice.actions.play());
  await sleep(1400);
  const after = (await jouee(page))[0];
  await page.evaluate(() => window.__fabtice.actions.pause());
  const expectedAfter = await page.evaluate(() => {
    const f = window.__fabtice;
    const bar = Math.floor((f.engine.getPosition() - 0.5) / 2);
    return f.structure.selectors.selectSimplifiedChart(f.store.getState()).places.get(bar).written;
  });
  check(`${tag}: while playing the lit bar moves on (written bar ${before} then ${after})`, after !== before && after === expectedAfter, `${before} → ${after}, expected ${expectedAfter}`);

  // The sheet follows smoothly when a repeated passage comes back (the same written bar becomes current again).
  await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = document.querySelector('.vue-grille').scrollHeight));
  await sleep(200);
  const bottom = await page.evaluate(() => document.querySelector('.vue-grille').scrollTop);
  await seekBar(page, 9, 0.85);
  await page.evaluate(() => window.__fabtice.actions.play());
  const samples = [];
  for (let k = 0; k < 8; k++) {
    await sleep(90);
    samples.push(await page.evaluate(() => document.querySelector('.vue-grille').scrollTop));
  }
  await page.evaluate(() => window.__fabtice.actions.pause());
  const steps = samples.map((v, i) => (i === 0 ? bottom - v : samples[i - 1] - v));
  check(`${tag}: coming back to A, the sheet glides up: several steps, none the whole way, never down`, steps.every((d) => d >= -1) && steps.filter((d) => d > 2).length >= 2 && Math.max(...steps) <= 0.85 * Math.max(1, bottom - Math.min(...samples)), steps.map((d) => Math.round(d)).join(' '));

  // ---------------------------------------------------- the clicks
  await page.evaluate(() => window.__fabtice.actions.pause());
  await seekBar(page, 0, 0.2);
  const firstA = await page.evaluate(() => Number(document.querySelector('[data-testid="grille-simplifiee"] [data-bloc="A"] .case').dataset.ecrite));
  const played = await playedOf(page, firstA);
  check(`${tag}: the first A bar stands for six played bars`, played.join(',') === '1,9,33,41,65,73', played.join(','));
  const seen = [];
  for (let k = 0; k < 7; k++) {
    const p = await cellPoint(page, firstA);
    await tap(h, p.x, p.y);
    seen.push(Math.round((await position(page)) - 0.5) / 2);
  }
  check(`${tag}: each click goes to the next occurrence after the playhead, the first one after the last`, seen.join(',') === '1,9,33,41,65,73,1', seen.join(','));
  const p0 = await cellPoint(page, firstA);
  await tap(h, p0.x, p0.y);
  check(`${tag}: it lands on the start of the bar`, Math.abs((await position(page)) - barTime(9)) < 0.02, String(await position(page)));
  // A part of the form line.
  await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
  await sleep(200);
  const solo = page.locator('[data-testid="ecrite-forme"] button', { hasText: 'Solo (Piano)' });
  if (h.phone) await solo.tap();
  else await solo.click();
  await sleep(300);
  check(`${tag}: a click on « Solo (Piano) (AABC) » of the form line goes to the start of that part (bar 34)`, Math.abs((await position(page)) - barTime(33)) < 0.02, String(await position(page)));
  check(`${tag}: it shows nothing new: the display stays the simplified chart`, (await page.evaluate(() => window.__fabtice.store.getState().ui.chartDisplay.kind)) === 'simplified');

  // ---------------------------------------------------- the loop by drag
  await page.evaluate(() => window.__fabtice.actions.pause());
  await seekBar(page, 33, 0.2);
  await drag(h, firstA, firstA + 2);
  const loop = await page.evaluate(() => window.__fabtice.store.getState().loop);
  check(`${tag}: a drag over three written bars selects the three played bars of the NEXT occurrence (bars 42 to 44)`, loop.enabled && Math.abs(loop.region.start - barTime(41)) < 0.02 && Math.abs(loop.region.end - barTime(44)) < 0.02, JSON.stringify(loop));
  const veiled = await page.$$eval(`${GRID} .dans-boucle`, (els) => els.map((e) => Number(e.dataset.ecrite)));
  check(`${tag}: the three written bars are veiled (the loop veil), no other`, veiled.join(',') === [firstA, firstA + 1, firstA + 2].join(','), veiled.join(','));
  check(`${tag}: the playhead went into the loop`, (await position(page)) >= barTime(41) - 0.02 && (await position(page)) < barTime(44));
  await page.screenshot({ path: path.join(out, `${tag}-boucle.png`) });
  // Across a section boundary: the last bar of A to the first of B, where B follows the A.
  await page.evaluate(() => window.__fabtice.actions.pause());
  const aLast = firstA + 7;
  await seekBar(page, 0, 0.2);
  await drag(h, aLast, aLast + 1);
  const loop2 = await page.evaluate(() => window.__fabtice.store.getState().loop);
  check(`${tag}: from the last A bar to the first B bar: the occurrence where B follows (bars 16 and 17)`, Math.abs(loop2.region.start - barTime(16)) < 0.02 && Math.abs(loop2.region.end - barTime(18)) < 0.02, JSON.stringify(loop2.region));
  await page.evaluate(() => window.__fabtice.actions.toggleLoop());

  // ---------------------------------------------------- what is not opened from here
  const corrections0 = await page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().corrections));
  const p1 = await cellPoint(page, firstA + 4);
  if (h.phone) {
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p1.x, y: p1.y, id: 1 }] });
    await sleep(1100);
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(p1.x, p1.y, { button: 'right' });
  await sleep(500);
  check(`${tag}: a ${h.phone ? 'long press' : 'right click'} on a bar opens no menu`, (await page.locator('[data-testid="menu-tempo"]').count()) === 0);
  const c0 = await page.evaluate((i) => {
    const r = document.querySelector(`[data-testid="grille-simplifiee"] [data-ecrite="${i}"] .accord-case`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, firstA + 4);
  await tap(h, c0.x, c0.y);
  check(`${tag}: a click on a chord opens no editor`, (await page.locator('.editeur').count()) === 0 && (await page.locator('[data-testid="modulation-dialogue"]').count()) === 0);
  check(`${tag}: the display is still the simplified chart, no chord, letter or key was edited`, (await page.evaluate(() => window.__fabtice.store.getState().ui.chartDisplay.kind)) === 'simplified' && (await page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().corrections))) === corrections0);

  // ---------------------------------------------------- the other displays are untouched
  await page.evaluate(() => window.__fabtice.structure.display.showFullChart());
  await sleep(400);
  check(`${tag}: « Affichage complet » is the full chart again, with its bar numbers`, (await page.locator('[data-testid="grille"] .case').count()) >= 97 && (await page.locator('[data-testid="grille"] .numero').count()) === (await page.locator('[data-testid="grille"] .case').count()) && (await page.locator(GRID).count()) === 0, `${await page.locator('[data-testid="grille"] .case').count()} bars, ${await page.locator('[data-testid="grille"] .numero').count()} numbers`);

  // ---------------------------------------------------- the phone: the sheet of the structure opens on top
  if (h.phone) {
    await showSimplified(page);
    const cell = await page.$eval(`${GRID} .case`, (e) => ({ h: Math.round(e.getBoundingClientRect().height), fs: getComputedStyle(e).getPropertyValue('--corps') }));
    check(`${tag}: the bars are the phone's chart size (76 px high)`, cell.h === 76, JSON.stringify(cell));
    await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
    await page.tap('[data-testid="structure-barre"]');
    await page.waitForSelector('[data-testid="structure-feuille"]');
    await sleep(400);
    const onTop = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="structure-feuille"]').getBoundingClientRect();
      const hit = document.elementFromPoint(sheet.left + sheet.width / 2, sheet.top + 30);
      return !!hit?.closest('[data-testid="structure-feuille"]');
    });
    check(`${tag}: the sheet of the structure opens on top of the simplified chart`, onTop);
    await page.screenshot({ path: path.join(out, `${tag}-feuille.png`) });
    await page.tap('[data-testid="structure-fermer"]');
    await sleep(300);
  }
  check(`${tag}: no console error (the screen)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

async function printing(form) {
  const tag = form;
  const h = await open(form);
  const { page } = h;
  await showSimplified(page);
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
  await page.waitForSelector('[data-testid="impression"]');
  await sleep(600);
  check(`${tag}: the print window opens on « Grille complète simplifiée » when the screen shows it`, (await page.locator('[data-testid="impression"] [data-choix="simplified"]').getAttribute('aria-checked')) === 'true');
  // A4 upright, 100 %, as the other print checks start.
  const choose = (id) => (h.phone ? page.tap(`[data-testid="impression"] [data-choix="${id}"]`) : page.click(`[data-testid="impression"] [data-choix="${id}"]`));
  await choose('a4');
  await choose('portrait');
  await sleep(300);
  check(`${tag}: one page`, (await page.locator('[data-testid="impression-pages"]').innerText()) === '1 page' && (await page.locator('.pp-papier').count()) === 1);
  const heads = await page.$$eval('.pp-bloc-tete', (els) => els.map((e) => e.textContent));
  check(`${tag}: the headings: Intro, A, B, C`, heads.join(' ') === 'Intro A B C', heads.join(' '));
  const paper = await page.locator('.pp-papier').innerText();
  check(`${tag}: « Forme : Intro, Thème 1 (AABC), Solo (Piano) (AABC), Solo (Trompette) (AA), Thème 2 (BC) » in full under the title`, paper.replace(/\s+/g, ' ').includes('Forme : Intro, Thème 1 (AABC), Solo (Piano) (AABC), Solo (Trompette) (AA), Thème 2 (BC)'));
  check(`${tag}: the repeat signs, « ×2 », the % bars and the final double bar are on the paper`, (await page.locator('.pp-rep-debut').count()) === 1 && (await page.locator('.pp-rep-fin').count()) === 1 && (await page.locator('.pp-rep-fois').innerText()) === '×2' && (await page.locator('.pp-repete').count()) === 3 && (await page.locator('.pp-rep-final').count()) === 1);
  check(`${tag}: no bar numbers on the paper`, (await page.locator('.pp-numero').count()) === 0);
  const texts = await page.$$eval('.pp-case', (cells) => cells.map((c) => (c.querySelector('.pp-repete') ? '%' : [...c.querySelectorAll('.pp-accord .ch')].map((ch) => [...ch.childNodes].map((n) => (n.nodeType === 1 && n.tagName.toLowerCase() === 'svg' ? '△' : n.textContent)).join('').replace(/\s+/g, '')).join(' '))));
  check(`${tag}: the 25 written bars, the same chords as on the screen`, texts.length === 25 && texts.slice(0, 9).join('|') === 'Bm|Em7|A7|D△|G△|C♯m7♭5|F♯7|Bm|%', texts.slice(0, 9).join('|'));
  const fit = await page.evaluate(() => {
    const sheet = document.querySelector('.pp-papier').getBoundingClientRect();
    const content = document.querySelector('.pp-contenu').getBoundingClientRect();
    return { inside: content.bottom <= sheet.bottom - 1 && content.right <= sheet.right + 1, bottom: Math.round(content.bottom - sheet.top), height: Math.round(sheet.height) };
  });
  check(`${tag}: everything is inside the sheet, with room to spare (A4 upright, 100 %)`, fit.inside && fit.bottom < fit.height * 0.9, JSON.stringify(fit));
  const forme = await page.$eval('.pp-forme', (e) => e.scrollHeight <= e.clientHeight + 1);
  check(`${tag}: the form line is not cut`, forme);
  await page.screenshot({ path: path.join(out, `${tag}-impression.png`) });
  // The PDF is the preview.
  await page.emulateMedia({ media: 'print' });
  await sleep(150);
  const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: false });
  await page.emulateMedia({ media: 'screen' });
  fs.writeFileSync(path.join(out, `${tag}-simplifiee.pdf`), bytes);
  const pdf = readPdf(bytes);
  // innerText: the name of a part (« Intro ») is set in capitals by the style sheet, as the PDF has it.
  const previewText = await page.locator('.pp-papier').first().evaluate((e) => e.innerText);
  check(`${tag}: the PDF is one A4 page`, pdf.length === 1 && Math.abs(pdf[0].size[0] - 595) <= 1 && Math.abs(pdf[0].size[1] - 842) <= 1, JSON.stringify(pdf.map((p) => p.size)));
  const same = pdf.length === 1 && sameCharacters(previewText, pdf[0].text);
  check(`${tag}: the PDF has the text of the preview (the form line, the headings, the chords)`, same, same ? '' : differences(previewText, pdf[0]?.text ?? ''));
  check(`${tag}: … « ×2 » among it`, pdf.length === 1 && /×\s*2/.test(pdf[0].text), JSON.stringify(pdf[0]?.text.slice(-120)));
  check(`${tag}: no console error (the paper)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

/** The last chorus a tone higher (`&modulation=oui`): its B and C are written again, the new key above the first bar. */
async function modulated(form) {
  const tag = form;
  const h = await open(form, '?demo&piece=feuilles&modulation=oui&moteur=factice&vue=grille');
  const { page } = h;
  await showSimplified(page);
  const heads = await page.$$eval(`${GRID} [data-testid="bloc-titre"]`, (els) => els.map((e) => e.textContent));
  check(`${tag}: a last chorus a tone higher: the blocks are Intro, A, B, C, B, C`, heads.join(' ') === 'Intro A B C B C', heads.join(' '));
  const marks = await page.$$eval(`${GRID} .modulation-lue`, (els) => els.map((e) => [e.closest('.bloc').dataset.bloc, e.textContent.replace(/\s+/g, ' ').trim(), getComputedStyle(e).pointerEvents]));
  check(`${tag}: the new key is written once, above the first bar of the first block in it, only to be read`, marks.length === 1 && marks[0][1].endsWith('C♯m') && marks[0][2] === 'none', JSON.stringify(marks));
  check(`${tag}: it does not collide with the bar (the chords start under it)`, await page.evaluate(() => {
    const cell = document.querySelector('[data-testid="grille-simplifiee"] .modulation-lue').closest('.case');
    const pill = cell.querySelector('.modulation-lue').getBoundingClientRect();
    return [...cell.querySelectorAll('.accord-case .ch')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= cell.getBoundingClientRect().left && (r.top >= pill.bottom - 4 || r.left >= pill.right || r.right <= pill.left); });
  }));
  await seekBar(page, 90);
  await sleep(300);
  const place = await placeOf(page, 90);
  const lit = await jouee(page);
  check(`${tag}: the playing follows into the modulated block (bar 91: written bar ${place.written})`, lit.length === 1 && lit[0] === place.written, `${lit.join()} / ${place.written}`);
  await page.screenshot({ path: path.join(out, `${tag}-modulation.png`) });
  // On paper.
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
  await page.waitForSelector('[data-testid="impression"]');
  await sleep(500);
  const paper = await page.$$eval('.pp-modulation', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check(`${tag}: the paper writes it too (« Ton : C♯m »)`, paper.join('|') === 'Ton : C♯m', paper.join('|'));
  // Eleven lines and six headings are more than an A4 page at 100 %: two pages; « Tenir sur une page » makes it one.
  const pagesText = () => page.locator('[data-testid="impression-pages"]').innerText();
  const longer = await pagesText();
  await (form === 'phone' ? page.tap('[data-testid="impression-une-page"]') : page.click('[data-testid="impression-une-page"]'));
  await sleep(400);
  check(`${tag}: the longer chart is ${longer} at 100 % and one page with « Tenir sur une page »`, longer === '2 pages' && (await pagesText()) === '1 page', `${longer} → ${await pagesText()}`);
  check(`${tag}: no console error (modulation)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

/** A piece with no form to fold: the chart is shown in full, and the row says so calmly. */
async function noForm(form) {
  const tag = form;
  const h = await open(form, '?demo&moteur=factice&vue=grille&harmonie=non');
  const { page } = h;
  // The demo piece has its hand letters A, B, A: taken away, there is no form to fold.
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ corrections: { ...s.corrections, sections: [] } })));
  await page.evaluate(() => window.__fabtice.structure.display.showSimplifiedChart());
  await sleep(500);
  const note = await page.locator('[data-testid="structure-note"]').innerText();
  check(`${tag}: no form to fold: « Ce morceau n’a pas de forme à replier : la grille est affichée en entier. »`, note === 'Ce morceau n’a pas de forme à replier : la grille est affichée en entier.', note);
  check(`${tag}: …and the whole chart is on the page`, (await page.locator('[data-testid="grille"] .case').count()) > 20 && (await page.locator(GRID).count()) === 0);
  check(`${tag}: no console error (no form)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

try {
  await suite('computer');
  await suite('phone');
  await printing('computer');
  await printing('phone');
  await modulated('computer');
  await modulated('phone');
  await noForm('computer');
  await noForm('phone');
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
