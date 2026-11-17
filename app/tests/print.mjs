// Browser checks of the print window (C4) in Chromium, in both forms of the
// interface: a computer (1280 × 800, a mouse) and a phone (390 × 844, touch):
//   npm run build && npm run test:print
//
// What matters most: THE PREVIEW IS WHAT COMES OUT. For several combinations of
// options (A4 upright, Letter on its side, a reduced scale, « Tenir sur une
// page », a piece of more than a hundred bars, no title block, an instrument in
// B♭) the PDF that Chromium makes from the page (`page.pdf` with
// `preferCSSPageSize`, in print media) has exactly the pages of the preview: the
// same number, the same paper size, and the same text on each page. The PDF is
// read here (`pdf-read.mjs`): no poppler is needed (FABTICE_NO_POPPLER=1 leaves
// out the cross-check with `pdfinfo` where it exists).
//
// Screenshots and a PDF go to $FABTICE_PRINT_OUT (default: a temporary folder),
// never into the repository. Playwright and Chromium are expected preinstalled
// (here under /opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { differences, readPdf, sameCharacters } from './pdf-read.mjs';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_PRINT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-print-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const POPPLER = !process.env.FABTICE_NO_POPPLER && (() => {
  try {
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return e.code !== 'ENOENT';
  }
})();

const FORMS = [
  { name: 'ordinateur', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, touch: true },
];

// Paper in points, as a PDF says it.
const PT = { a4: [595, 842], lettre: [612, 792] };
const upright = (paper, orientation) => (orientation === 'paysage' ? [PT[paper][1], PT[paper][0]] : PT[paper]);

const DIALOG = '[data-testid="impression"]';

async function open(form, query = '?demo&moteur=factice&vue=grille') {
  const context = await browser.newContext({ viewport: form.viewport, hasTouch: form.touch, isMobile: form.touch, deviceScaleFactor: form.touch ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  return { page, errors, context };
}

/** A press: a tap on a touch screen, a click with a mouse. */
const press = (page, form, selector) => (form.touch ? page.tap(selector) : page.click(selector));

const openDialog = (page) =>
  page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
const closeDialog = async (page) => {
  await page.keyboard.press('Escape');
  await sleep(120);
};

/** The piece lasts `bars` bars (the demo piece has chords in the first 25, the rest is repeat signs). */
const setBars = (page, bars) =>
  page.evaluate((n) => {
    const s = window.__fabtice.store;
    const st = s.getState();
    s.setState({ project: { ...st.project, duration: n * 4 * (60 / 110) - 0.2 } });
  }, bars);

/** What the preview shows: one entry per sheet. */
const sheets = (page) =>
  page.$$eval('.pp-papier', (els) =>
    els.map((el) => {
      const st = getComputedStyle(el);
      return {
        // innerText: what the style sheet sets in capitals (the name of a part, « Intro ») is as the PDF has it.
        text: el.innerText,
        lines: el.querySelectorAll('.pp-ligne').length,
        bars: el.querySelectorAll('.pp-case').length,
        w: parseFloat(st.getPropertyValue('--pl')),
        h: parseFloat(st.getPropertyValue('--ph')),
        margin: parseFloat(st.getPropertyValue('--marge')),
        scale: parseFloat(st.getPropertyValue('--e')),
        number: el.querySelector('.pp-numero-page')?.textContent ?? null,
        title: el.querySelector('.pp-titre')?.textContent ?? null,
        info: el.querySelector('.pp-infos')?.textContent ?? null,
      };
    }),
  );

const pageRule = (page) => page.evaluate(() => [...document.querySelectorAll('style[data-impression="page"]')].map((e) => e.textContent).join(' '));

/** Sets the options through the window, the way a person would (taps on a phone). */
async function choose(page, form, o) {
  const radio = (id) => press(page, form, `${DIALOG} [data-choix="${id}"]`);
  if (o.paper) await radio(o.paper);
  if (o.orientation) await radio(o.orientation);
  if (o.margins) await radio(o.margins);
  if (o.instrument) await radio(o.instrument);
  if (o.what) await radio(o.what);
  if (o.section !== undefined) await page.selectOption('[data-testid="impression-section"]', { index: o.section });
  const box = async (testid, want) => {
    if (want === undefined) return;
    if ((await page.isChecked(`[data-testid="${testid}"]`)) !== want) await press(page, form, `[data-testid="${testid}"]`);
  };
  // The scale list is off while « Tenir sur une page » is on.
  await box('impression-une-page', o.fitOne);
  if (o.scale !== undefined && !(await page.isDisabled('[data-testid="impression-echelle"]'))) await page.selectOption('[data-testid="impression-echelle"]', String(o.scale));
  await box('impression-titre-case', o.title);
  await box('impression-ton-case', o.key);
  await box('impression-tempo-case', o.tempo);
  await box('impression-forme-case', o.form);
  await sleep(150);
}

const RESET = { orientation: 'portrait', paper: 'a4', margins: 'normales', instrument: 'ut', fitOne: false, title: true, key: true, tempo: true };

/** The PDF of the page as it is printed (print media, the page size from the style sheet). */
async function pdfOf(page, file) {
  await page.emulateMedia({ media: 'print' });
  await sleep(150);
  const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: false });
  await page.emulateMedia({ media: 'screen' });
  await sleep(100);
  if (file) fs.writeFileSync(file, bytes);
  return bytes;
}

/** The preview and the PDF compared: the same pages, the same paper, the same text on each. */
async function comparePdf(page, label, expected, file) {
  const preview = await sheets(page);
  const bytes = await pdfOf(page, file);
  const pdf = readPdf(bytes);
  check(`${label}: the PDF has the pages of the preview (${preview.length})`, pdf.length === preview.length && preview.length === expected.pages, `preview ${preview.length}, PDF ${pdf.length}, expected ${expected.pages}`);
  const [w, h] = upright(expected.paper, expected.orientation);
  check(`${label}: every PDF page is ${expected.paper === 'a4' ? 'A4' : 'Letter'} ${expected.orientation === 'paysage' ? 'on its side' : 'upright'} (${w} × ${h} pt)`, pdf.length > 0 && pdf.every((p) => Math.abs(p.size[0] - w) <= 1 && Math.abs(p.size[1] - h) <= 1), JSON.stringify(pdf.map((p) => p.size)));
  const same = preview.map((s, i) => (pdf[i] ? sameCharacters(s.text, pdf[i].text) : false));
  check(`${label}: the same text on each page, page by page`, same.length > 0 && same.every(Boolean), same.map((ok, i) => (ok ? '' : `page ${i + 1}: ${pdf[i] ? differences(preview[i].text, pdf[i].text) : 'missing'}`)).filter(Boolean).join(' ; '));
  if (preview.length > 1) check(`${label}: the page numbers « 1 / ${preview.length} »… are on the pages`, preview.every((s, i) => s.number === `${i + 1} / ${preview.length}` && pdf[i] && pdf[i].text.replace(/\s+/g, '').includes(`${i + 1}/${preview.length}`)));
  else check(`${label}: no page number on a single page`, preview[0].number === null);
  if (POPPLER) {
    const n = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', ['-'], { input: bytes, encoding: 'utf8' }))?.[1]);
    check(`${label}: poppler counts the same pages as the reader`, n === pdf.length, `${n} / ${pdf.length}`);
  }
  return { preview, pdf };
}

/** Nothing leaves its place: the content in its sheet, the chords in their bars, one size for every chord. */
const layoutProblems = (page) =>
  page.evaluate(() => {
    const problems = [];
    const sizes = new Set();
    for (const sheet of document.querySelectorAll('.pp-papier')) {
      const s = sheet.getBoundingClientRect();
      const c = sheet.querySelector('.pp-contenu').getBoundingClientRect();
      if (c.left < s.left - 0.5 || c.right > s.right + 0.5 || c.top < s.top - 0.5 || c.bottom > s.bottom + 0.5) problems.push('content outside its sheet');
      // The margin is kept: the content starts at least the margin (less the scale's centring) from the edge.
      for (const bar of sheet.querySelectorAll('.pp-case')) {
        const b = bar.getBoundingClientRect();
        if (b.right > c.right + 0.5 || b.left < c.left - 0.5) problems.push(`bar ${bar.dataset.mesure} outside the content`);
        if (bar.dataset.temps) sizes.add(getComputedStyle(bar).fontSize);
        const chords = [...bar.querySelectorAll('.pp-accord')].map((a) => ({ a, box: a.querySelector('.ch').getBoundingClientRect() }));
        chords.forEach(({ box }, i) => {
          if (box.right > b.right + 1 || box.left < b.left - 1 || box.top < b.top - 1 || box.bottom > b.bottom + 1) problems.push(`chord ${i} of bar ${bar.dataset.mesure} leaves its bar`);
        });
        const rows = bar.dataset.rangs === '2' ? 2 : 1;
        chords.forEach(({ box }, i) => {
          if (i >= rows && box.left < chords[i - rows].box.right - 0.5) problems.push(`chord ${i} of bar ${bar.dataset.mesure} touches the one before`);
        });
      }
    }
    if (sizes.size > 1) problems.push(`several chord sizes: ${[...sizes].join(' ')}`);
    return problems;
  });

const noOverflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const win = document.querySelector('.fenetre-impression').getBoundingClientRect();
    const problems = [];
    if (doc.scrollWidth > innerWidth) problems.push(`page scrolls sideways (${doc.scrollWidth} > ${innerWidth})`);
    if (win.left < -0.5 || win.right > innerWidth + 0.5 || win.top < -0.5 || win.bottom > innerHeight + 0.5) problems.push(`the window leaves the screen (${Math.round(win.left)},${Math.round(win.top)} ${Math.round(win.right)},${Math.round(win.bottom)})`);
    for (const el of document.querySelectorAll('.imp-options, .imp-pied, .imp-entete')) if (el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className} overflows sideways`);
    for (const el of document.querySelectorAll('.imp-options *, .imp-pied *, .imp-entete *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > win.right + 0.5 || r.left < win.left - 0.5)) problems.push(`${el.tagName}.${el.className} leaves the window`);
    }
    return problems;
  });

try {
  for (const form of FORMS) {
    const tag = form.name;
    const { page, errors } = await open(form);
    await page.setViewportSize(form.viewport);

    // ============================================================ the window
    if (!form.touch) {
      const entry = page.locator('[data-testid="imprimer-grille"]');
      await entry.click();
    } else await openDialog(page);
    await page.waitForSelector(DIALOG);
    await sleep(400);
    const radios = await page.$$eval(`${DIALOG} [role="radio"]`, (els) => els.map((e) => `${e.dataset.choix}:${e.getAttribute('aria-checked')}`));
    check(`${tag}: the options are there: orientation, format, margins, instrument`, ['portrait', 'paysage', 'a4', 'lettre', 'etroites', 'normales', 'larges', 'ut', 'sib', 'mib'].every((id) => radios.some((r) => r.startsWith(`${id}:`))), radios.join());
    check(`${tag}: two buttons, « Enregistrer en PDF » then « Imprimer »`, (await page.locator('[data-testid="impression-pdf"]').innerText()) === 'Enregistrer en PDF' && (await page.locator('[data-testid="impression-imprimer"]').innerText()) === 'Imprimer');
    check(`${tag}: the window says its title and has a preview and the options`, (await page.locator(`${DIALOG} h2`).innerText()) === 'Imprimer la grille' && (await page.locator('[data-testid="apercu"]').count()) === 1 && (await page.locator('.imp-options').count()) === 1);
    const primary = await page.$eval('[data-testid="impression-imprimer"]', (el) => getComputedStyle(el).backgroundColor);
    check(`${tag}: the main button is in ink, not in ember`, primary === 'rgb(43, 31, 23)', primary);
    const shot = (name) => page.screenshot({ path: path.join(out, `impression-${tag}-${name}.png`) });
    await choose(page, form, RESET);
    const base = await sheets(page);
    check(`${tag}: the demo piece (25 bars) is one A4 sheet, « Page 1 sur 1 » under it`, base.length === 1 && base[0].lines === 7 && base[0].w === 210 && (await page.locator('.pp-legende').innerText()) === 'Page 1 sur 1', JSON.stringify(base.map((s) => [s.lines, s.w])));
    check(`${tag}: the title block is on the sheet: title, key with its instrument, meter and tempo`, base[0].title === 'Blues du dimanche' && base[0].info === 'Tonalité de A♭ pour instrument en Ut · 4/4 · tempo 110', `${base[0].title} | ${base[0].info}`);
    check(`${tag}: the page rule is the sheet's size, no margin`, (await pageRule(page)) === '@page { size: 210mm 297mm; margin: 0; }', await pageRule(page));
    check(`${tag}: the page is marked for printing while the window is open`, await page.evaluate(() => document.documentElement.dataset.imprime !== undefined));
    await shot('une-page');

    const win = await page.$eval('.fenetre-impression', (el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    const overflow = await noOverflow(page);
    check(`${tag}: nothing overflows (${Math.round(win.w)} × ${Math.round(win.h)} window in ${form.viewport.width} × ${form.viewport.height})`, overflow.length === 0, overflow.join(' ; '));
    check(`${tag}: nothing leaves its place on the sheet; one size for every chord`, (await layoutProblems(page)).length === 0, (await layoutProblems(page)).join(' ; '));

    // The size of the window on the Macs of the build (a screen 656 high).
    if (!form.touch) {
      await page.setViewportSize({ width: 1280, height: 656 });
      await sleep(250);
      const small = await noOverflow(page);
      check(`${tag}: the window holds in 1280 × 656, the screen of the Macs of the build`, small.length === 0, small.join(' ; '));
      await page.setViewportSize(form.viewport);
      await sleep(200);
    }

    // Touch targets of at least 40 px (a phone).
    if (form.touch) {
      const small = await page.$$eval(`${DIALOG} button, ${DIALOG} select, ${DIALOG} .imp-case, ${DIALOG} input[type="number"]`, (els) =>
        els.map((el) => [el.dataset.choix || el.dataset.testid || el.className || el.tagName, el.getBoundingClientRect().height]).filter(([, h]) => h < 39.5),
      );
      check(`${tag}: every control is at least 40 px high`, small.length === 0, JSON.stringify(small));
    }

    // ============================================================ every option changes the preview
    await setBars(page, 104);
    await sleep(250);
    await choose(page, form, RESET);
    const long = await sheets(page);
    check(`${tag}: 104 bars (26 lines) on A4 upright: 10, 11 then 5 lines on three sheets; the title block only on the first`, long.length === 3 && long.map((s) => s.lines).join() === '10,11,5' && long[0].title !== null && long[1].title === null && long[2].title === null, long.map((s) => s.lines).join());
    check(`${tag}: the sheets are numbered « 1 / 3 »…`, long.map((s) => s.number).join() === '1 / 3,2 / 3,3 / 3');
    check(`${tag}: the number of pages is said above the preview`, (await page.locator('[data-testid="impression-pages"]').innerText()) === '3 pages');
    check(`${tag}: each page has its caption « Page n sur 3 »`, (await page.$$eval('.pp-legende', (els) => els.map((e) => e.textContent).join('|'))) === 'Page 1 sur 3|Page 2 sur 3|Page 3 sur 3');
    // Every bar once, in order, from 1 to 104.
    const numbers = await page.$$eval('.pp-case .pp-numero', (els) => els.map((e) => Number(e.textContent)));
    check(`${tag}: every bar is on exactly one sheet, in order (1 to 104)`, numbers.length === 104 && numbers.every((n, i) => n === i + 1));
    check(`${tag}: four bars per line, a line is never split between two sheets`, (await page.$$eval('.pp-ligne', (els) => els.every((l) => l.querySelectorAll('.pp-case').length === 4))) === true);
    await shot('plusieurs-pages');
    const lp = await layoutProblems(page);
    check(`${tag}: nothing leaves its place on any of the three sheets`, lp.length === 0, lp.slice(0, 3).join(' ; '));

    await choose(page, form, { orientation: 'paysage' });
    let s = await sheets(page);
    check(`${tag}: « Paysage » turns the sheets (297 × 210) and makes more of them (8 lines a sheet)`, s[0].w === 297 && s[0].h === 210 && s.length === 4 && /size: 297mm 210mm/.test(await pageRule(page)), `${s.length} sheets ${s[0].w}×${s[0].h}`);
    await shot('paysage');
    await choose(page, form, { orientation: 'portrait', paper: 'lettre' });
    s = await sheets(page);
    check(`${tag}: « Lettre » changes the paper (215.9 × 279.4): the first sheet holds fewer lines`, s[0].w === 215.9 && s[0].h === 279.4 && s[0].lines === 9 && s.length === 3 && /size: 215.9mm 279.4mm/.test(await pageRule(page)), `${s[0].w}×${s[0].h}, ${s.map((x) => x.lines).join()}`);
    await choose(page, form, { paper: 'a4', margins: 'larges' });
    s = await sheets(page);
    check(`${tag}: « Larges » widens the margins (25 mm) and shrinks the bars`, s[0].margin === 25 && s[0].lines === 9 && s.length === 3, `margin ${s[0].margin}, ${s.map((x) => x.lines).join()}`);
    await choose(page, form, { margins: 'etroites' });
    s = await sheets(page);
    check(`${tag}: « Étroites » narrows them (10 mm)`, s[0].margin === 10 && s[0].lines === 10, `margin ${s[0].margin}, ${s.map((x) => x.lines).join()}`);
    await choose(page, form, { margins: 'normales', scale: 60 });
    s = await sheets(page);
    check(`${tag}: a scale of 60 % puts 18 lines on a sheet and the piece on two sheets`, s[0].scale === 0.6 && s.length === 2 && s[0].lines === 17 && s[1].lines === 9, `${s[0].scale} ${s.map((x) => x.lines).join()}`);
    await choose(page, form, { scale: 100 });
    await choose(page, form, { fitOne: true });
    s = await sheets(page);
    check(`${tag}: « Tenir sur une page »: one sheet with all 26 lines, at a scale below 1`, s.length === 1 && s[0].lines === 26 && s[0].scale < 1 && s[0].scale >= 0.4, `${s.length} sheets, scale ${s[0].scale}`);
    check(`${tag}: … the scale list is off and the note says the scale applied`, (await page.isDisabled('[data-testid="impression-echelle"]')) && /Échelle appliquée : \d+ %/.test(await page.locator('[data-testid="impression-une-note"]').innerText()), await page.locator('[data-testid="impression-une-note"]').innerText());
    check(`${tag}: … and nothing leaves its place on it`, (await layoutProblems(page)).length === 0, (await layoutProblems(page)).slice(0, 3).join(' ; '));
    await shot('tenir-sur-une-page');
    await setBars(page, 140);
    await sleep(250);
    check(`${tag}: a piece too long to be read on one page: the choice is off, and says why`, (await page.isDisabled('[data-testid="impression-une-page"]')) && (await page.locator('[data-testid="impression-une-note"]').innerText()).includes('trop long'), await page.locator('[data-testid="impression-une-note"]').innerText());
    s = await sheets(page);
    check(`${tag}: … and the pages are made at the scale chosen`, s.length > 1 && s[0].scale === 1, `${s.length} sheets`);
    await setBars(page, 104);
    await sleep(250);
    await choose(page, form, { fitOne: false });

    // Instrument and title block.
    await choose(page, form, { instrument: 'sib' });
    s = await sheets(page);
    check(`${tag}: « Si♭ » rewrites the chords and the title block (the screen is left as it is)`, s[0].info.startsWith('Tonalité de B♭ pour instrument en Si♭') && s[0].text.includes('Gm7') && (await page.evaluate(() => window.__fabtice.store.getState().view.instrument)) === 'ut', s[0].info);
    await choose(page, form, { instrument: 'mib' });
    s = await sheets(page);
    check(`${tag}: « Mi♭ »`, s[0].info.includes('pour instrument en Mi♭'), s[0].info);
    await choose(page, form, { instrument: 'ut', tempo: false });
    s = await sheets(page);
    check(`${tag}: leaving out « Tempo » leaves out the meter and the tempo`, s[0].info === 'Tonalité de A♭ pour instrument en Ut', s[0].info);
    await choose(page, form, { tempo: true, key: false });
    s = await sheets(page);
    check(`${tag}: leaving out « Tonalité » leaves out the key`, s[0].info === '4/4 · tempo 110', s[0].info);
    await choose(page, form, { key: true, title: false });
    s = await sheets(page);
    check(`${tag}: leaving out « Titre » leaves out the title, the key row stays, the first sheet keeps 10 lines`, s[0].title === null && s[0].info !== null && s[0].lines === 10 && s.length === 3, `${s[0].lines} ${s.map((x) => x.lines).join()}`);
    await choose(page, form, { key: false, tempo: false });
    s = await sheets(page);
    check(`${tag}: no title block at all: the first sheet holds as many lines as the others (11)`, s[0].title === null && s[0].info === null && s[0].lines === 11, s.map((x) => x.lines).join());
    await choose(page, form, { title: true, key: true, tempo: true });

    // The choices are kept from one time to the next.
    await choose(page, form, { orientation: 'paysage', paper: 'lettre', margins: 'larges', scale: 70, title: false });
    await closeDialog(page);
    if (form.touch) await openDialog(page);
    else await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector(DIALOG);
    const kept = await page.evaluate(() => ({
      checked: [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map((e) => e.dataset.choix).join(),
      scale: document.querySelector('[data-testid="impression-echelle"]').value,
      title: document.querySelector('[data-testid="impression-titre-case"]').checked,
      stored: localStorage.getItem('fabtice.print'),
    }));
    check(`${tag}: the choices are kept on the device (orientation, paper, margins, scale, title block)`, kept.checked.includes('paysage') && kept.checked.includes('lettre') && kept.checked.includes('larges') && kept.scale === '70' && kept.title === false, JSON.stringify(kept));
    check(`${tag}: the instrument is not kept (it starts as the screen's)`, kept.checked.split(',').includes('ut') && !/instrument/.test(kept.stored ?? ''));
    await choose(page, form, { ...RESET, scale: 100 });

    // ============================================================ the PDF is the preview
    const combos = [
      ['A4 upright, one sheet', 25, { ...RESET }, { paper: 'a4', orientation: 'portrait', pages: 1 }],
      ['A4 upright, 104 bars', 104, { ...RESET }, { paper: 'a4', orientation: 'portrait', pages: 3 }],
      ['Letter on its side, 104 bars', 104, { ...RESET, paper: 'lettre', orientation: 'paysage' }, { paper: 'lettre', orientation: 'paysage', pages: 4 }],
      ['A4 on its side, reduced scale 60 %', 104, { ...RESET, orientation: 'paysage', scale: 60 }, { paper: 'a4', orientation: 'paysage', pages: 2 }],
      ['Letter upright, wide margins', 104, { ...RESET, paper: 'lettre', margins: 'larges', scale: 100 }, { paper: 'lettre', orientation: 'portrait', pages: 3 }],
      ['A4 upright, narrow margins, scale 80 %', 104, { ...RESET, margins: 'etroites', scale: 80 }, { paper: 'a4', orientation: 'portrait', pages: 2 }],
      ['A4 upright, « Tenir sur une page »', 104, { ...RESET, fitOne: true }, { paper: 'a4', orientation: 'portrait', pages: 1 }],
      ['Letter on its side, « Tenir sur une page »', 60, { ...RESET, paper: 'lettre', orientation: 'paysage', fitOne: true }, { paper: 'lettre', orientation: 'paysage', pages: 1 }],
      ['no title block, B♭', 104, { ...RESET, instrument: 'sib', title: false, key: false, tempo: false }, { paper: 'a4', orientation: 'portrait', pages: 3 }],
      ['a piece of 140 bars (35 lines)', 140, { ...RESET, scale: 100 }, { paper: 'a4', orientation: 'portrait', pages: 4 }],
    ];
    await choose(page, form, { ...RESET, scale: 100 });
    for (const [label, bars, options, expected] of combos) {
      await setBars(page, bars);
      await sleep(200);
      await choose(page, form, { scale: 100, fitOne: false });
      await choose(page, form, options);
      const file = label === 'A4 upright, 104 bars' ? path.join(out, `impression-${tag}-exemple.pdf`) : null;
      await comparePdf(page, `${tag}, ${label}`, expected, file);
    }
    // Bars with several chords on paper (the rules of DESIGN.md hold on paper): each chord at the place of its beat, none touching,
    // none leaving its bar, ONE size for every chord of the chart, in both orientations and at a reduced scale.
    {
      const C = (root, quality, extensions = []) => ({ root, quality, extensions, bass: null });
      await setBars(page, 25);
      await page.evaluate((bars) => {
        for (const [bar, entries] of Object.entries(bars)) window.__fabtice.lot2.harmony.setBarChords(Number(bar), entries.map(([beat, chord]) => ({ beatInBar: beat, chord })));
      }, {
        0: [[0, C(0, 'maj7')]],
        1: [[0, C(2, 'min7')], [2, C(7, '7')]],
        2: [[0, C(0, 'maj7')], [2, C(9, 'min7')], [3, C(2, '7')]],
        3: [[0, C(0, 'maj7')], [1, C(9, 'min7')], [2, C(2, 'min7')], [3, C(7, '7')]],
        4: [[0, C(1, 'min7', ['b5'])], [2, C(6, '7', ['b9'])]],
        5: [[0, C(1, 'min7', ['b5'])], [1, C(6, '7', ['b9'])]],
        8: [[0, C(11, 'min7', ['b5'])], [1, C(4, '7', ['#9', 'b13'])], [2, C(9, 'min7')], [3, C(2, '7', ['b9'])]],
        9: [[0, C(2, 'min7', ['9'])], [3, C(1, '7', ['#11'])]],
        10: [[0, C(7, 'min7', ['9', '11'])], [1, C(3, '7', ['9', '#11', '13'])]],
        11: [[0, C(10, '7', ['b9', 'b13'])], [3, { root: 10, quality: '7', extensions: ['b9', 'b13'], bass: 3 }]],
        12: [[1, C(9, '7', ['#9', 'b13'])], [3, C(5, 'maj7', ['9', '13'])]],
      });
      await sleep(300);
      const paperGeometry = () =>
        page.$$eval('.pp-case[data-temps]', (cells) => {
          const sizes = new Set();
          const bars = cells.map((c) => {
            const r = c.getBoundingClientRect();
            const k = r.width / c.offsetWidth;
            const u = c.offsetWidth / 206;
            const pg = (c.classList.contains('pp-signee') ? 30 : 16) * u;
            const inner = c.clientWidth - pg - 8 * u;
            const beats = Number(c.dataset.temps);
            const rows = c.dataset.rangs === '2' ? 2 : 1;
            sizes.add(getComputedStyle(c).fontSize);
            const chords = [...c.querySelectorAll('.pp-accord')].map((a) => ({ beat: Number(a.dataset.debut), box: a.querySelector('.ch').getBoundingClientRect() }));
            const problems = [];
            chords.forEach((ch, i) => {
              const expected = r.left + (c.clientLeft + pg + (ch.beat / beats) * inner) * k;
              if (i === 0 && ch.box.left - expected > 2.5 * k) problems.push(`chord ${i} at ${((ch.box.left - expected) / k).toFixed(1)} px from its beat`);
              if (ch.box.right > r.right + 0.5 || ch.box.left < r.left) problems.push(`chord ${i} leaves the bar`);
              if (i >= rows && ch.box.left < chords[i - rows].box.right - 0.01) problems.push(`chord ${i} touches chord ${i - rows}`);
            });
            return { bar: c.dataset.mesure, n: chords.length, problems };
          });
          return { bars, sizes: sizes.size };
        });
      for (const [label, options] of [['portrait A4', { ...RESET }], ['landscape A4', { ...RESET, orientation: 'paysage' }], ['portrait Letter at 70 %', { ...RESET, paper: 'lettre', scale: 70 }], ['landscape Letter, wide margins', { ...RESET, paper: 'lettre', orientation: 'paysage', margins: 'larges' }]]) {
        await choose(page, form, { scale: 100, fitOne: false });
        await choose(page, form, options);
        const g = await paperGeometry();
        const wanted = g.bars.filter((b) => [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12].includes(Number(b.bar)));
        check(`${tag}, on paper (${label}): chords at the place of their beat, none touching, none leaving the bar`, wanted.length === 11 && wanted.every((b) => b.problems.length === 0), wanted.filter((b) => b.problems.length).map((b) => `bar ${b.bar}: ${b.problems.join(', ')}`).join(' ; '));
        check(`${tag}, on paper (${label}): ONE size for every chord of the chart (a bar with two chords is not smaller)`, g.sizes === 1, `${g.sizes} sizes`);
        if (label === 'landscape A4') await shot('paysage-accords');
        const lp = await layoutProblems(page);
        check(`${tag}, on paper (${label}): nothing leaves its place`, lp.length === 0, lp.slice(0, 3).join(' ; '));
      }
      // Doubtful chords are written like any other on paper; the ink is the ink.
      const tone = await page.evaluate(() => ({ doubtful: document.querySelectorAll('.pp-papier .douteux').length, ink: getComputedStyle(document.querySelector('.pp-case .ch')).color }));
      check(`${tag}, on paper: no « doubtful » style, ink on white`, tone.doubtful === 0 && tone.ink === 'rgb(43, 31, 23)', JSON.stringify(tone));
      await page.evaluate(() => window.__fabtice.lot2.harmony.resetChordCorrections());
      await choose(page, form, { ...RESET, scale: 100 });
    }

    // Print media: the sheets are put back to their size, one under the other, and nothing else is on the page.
    await setBars(page, 104);
    await choose(page, form, { ...RESET, scale: 100 });
    await page.emulateMedia({ media: 'print' });
    await sleep(150);
    const printed = await page.evaluate(() => {
      const cadres = [...document.querySelectorAll('.pp-cadre')];
      const px = 96 / 25.4;
      return {
        app: getComputedStyle(document.querySelector('.app')).display,
        options: getComputedStyle(document.querySelector('.imp-options')).display,
        captions: getComputedStyle(document.querySelector('.pp-legende')).display,
        transform: cadres.map((c) => getComputedStyle(c.querySelector('.pp-papier')).transform),
        width: Math.round(cadres[0].querySelector('.pp-papier').getBoundingClientRect().width),
        wantWidth: Math.round(210 * px),
        background: getComputedStyle(document.body).backgroundColor,
      };
    });
    await page.emulateMedia({ media: 'screen' });
    check(`${tag}: in print media the app, the options and the captions are gone, the sheets at life size on white`, printed.app === 'none' && printed.options === 'none' && printed.captions === 'none' && printed.transform.every((x) => x === 'none') && Math.abs(printed.width - printed.wantWidth) <= 1 && printed.background === 'rgb(255, 255, 255)', JSON.stringify(printed));

    // ============================================================ « Imprimer » and « Enregistrer en PDF » in a browser
    await page.evaluate(() => {
      window.__printed = [];
      window.print = () => {
        window.__printed.push({
          pages: document.querySelectorAll('.pp-papier').length,
          rule: [...document.querySelectorAll('style[data-impression="page"]')].map((e) => e.textContent).join(' '),
          marked: document.documentElement.dataset.imprime !== undefined,
          fonts: document.fonts.status,
        });
      };
    });
    await choose(page, form, { orientation: 'paysage' });
    await press(page, form, '[data-testid="impression-imprimer"]');
    await page.waitForFunction(() => window.__printed.length === 1, null, { timeout: 5000 });
    const printedNow = await page.evaluate(() => window.__printed[0]);
    check(`${tag}: « Imprimer » opens the browser's print window on exactly the sheets of the preview (4 pages, landscape, fonts loaded)`, printedNow.pages === 4 && /size: 297mm 210mm/.test(printedNow.rule) && printedNow.marked && printedNow.fonts === 'loaded', JSON.stringify(printedNow));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.waitForSelector(DIALOG, { state: 'detached', timeout: 4000 });
    check(`${tag}: the window closes once the print window is done, the page rule and the mark are gone`, await page.evaluate(() => !document.querySelector('style[data-impression="page"]') && document.documentElement.dataset.imprime === undefined));
    if (form.touch) await openDialog(page);
    else await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector(DIALOG);
    check(`${tag}: in a browser, the window says that « Enregistrer au format PDF » is in its print window`, (await page.locator(DIALOG).innerText()).includes('choisissez « Enregistrer au format PDF »'));
    await page.evaluate(() => (window.__printed.length = 0));
    await press(page, form, '[data-testid="impression-pdf"]');
    await page.waitForFunction(() => window.__printed.length === 1, null, { timeout: 5000 });
    check(`${tag}: « Enregistrer en PDF » in a browser opens the same print window, on the same sheets`, (await page.evaluate(() => window.__printed[0].pages)) === 4);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.waitForSelector(DIALOG, { state: 'detached', timeout: 4000 });

    // ============================================================ nothing to print
    await page.evaluate(() => {
      const s = window.__fabtice.store;
      s.setState({ analysis: { ...s.getState().analysis, chords: [] } });
    });
    await openDialog(page);
    await page.waitForSelector(DIALOG);
    await sleep(250);
    check(`${tag}: with no chords the window says there is nothing to print, with no options and no print button`, (await page.locator('[data-testid="impression-vide"]').count()) === 1 && (await page.locator('[data-testid="impression-imprimer"]').count()) === 0 && (await page.locator('.imp-options').count()) === 0);
    await shot('sans-accords');
    check(`${tag}: … and it can be closed`, (await page.locator(`${DIALOG} .fermer`).count()) === 1);
    await closeDialog(page);
    check(`${tag}: Escape closes it`, (await page.locator(DIALOG).count()) === 0);

    check(`no page errors (${tag})`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ============================================================ the mark of a modulation on the paper (C10)
  for (const form of FORMS) {
    const tag = `${form.name} (modulations)`;
    const { page, errors } = await open(form, '?demo&moteur=factice&vue=grille&harmonie=non');
    await page.setViewportSize(form.viewport);
    // The analysis said to have found E major at bar 9 and A♭ (the main key) at bar 17.
    await page.evaluate(() => {
      const f = window.__fabtice;
      const s = f.store.getState();
      const at = (bar, tonic) => ({ time: f.lot4.tempoMap.barStartTime(s.tempoMap, bar), key: { tonic, mode: 'major', confidence: 0.7, alternatives: [] } });
      f.store.setState({ analysis: { ...s.analysis, keyChanges: [at(8, 4), at(16, 8)] } });
    });
    await sleep(300);
    await openDialog(page);
    await page.waitForSelector(DIALOG);
    await sleep(400);
    await choose(page, form, RESET);
    const marks = await page.$$eval('.pp-case .pp-modulation', (els) => els.map((e) => `${e.closest('.pp-case').dataset.mesure}:${e.dataset.cle}:${e.textContent.replace(/\s+/g, ' ').trim()}`));
    check(`${tag}: the sheet writes « Ton : E » above bar 9 and « Ton : A♭ » above bar 17`, marks.join(' | ') === '8:E:Ton : E | 16:A♭:Ton : A♭', marks.join(' | '));
    check(`${tag}: the letter and the mark are side by side in the bar's top row`, await page.$$eval('.pp-case', (cells) => cells.every((c) => {
      const box = [...c.querySelectorAll('.pp-section, .pp-modulation, .pp-numero')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      return box.every((a, i) => box.every((b, j) => j <= i || !(a.left < b.right - 0.3 && b.left < a.right - 0.3 && a.top < b.bottom - 0.3 && b.top < a.bottom - 0.3)));
    })));
    check(`${tag}: nothing leaves its place on the sheet; one size for every chord`, (await layoutProblems(page)).length === 0, (await layoutProblems(page)).join(' ; '));
    // Crowded chords (two rows) under a letter and a mark: they stay in their bar and below the top row.
    await page.evaluate(() => {
      const c = (root, quality, extensions = []) => ({ root, quality, extensions, bass: null });
      window.__fabtice.lot2.harmony.setBarChords(8, [{ beatInBar: 0, chord: c(4, 'min7', ['b5', '9']) }, { beatInBar: 1, chord: c(9, '7', ['#9', 'b13']) }, { beatInBar: 2, chord: c(2, 'min7', ['9', '11']) }, { beatInBar: 3, chord: c(7, '7', ['b9', 'b13']) }]);
    });
    await sleep(400);
    check(`${tag}: crowded chords under a letter and a mark leave their bar nowhere`, (await layoutProblems(page)).length === 0, (await layoutProblems(page)).join(' ; '));
    const gap = await page.evaluate(() => {
      const cell = document.querySelector('.pp-case[data-mesure="8"]');
      const head = cell.querySelector('.pp-entete-case').getBoundingClientRect();
      const first = [...cell.querySelectorAll('.pp-accord .ch')].map((e) => e.getBoundingClientRect().top);
      return { head: head.bottom, chord: Math.min(...first), rows: cell.dataset.rangs };
    });
    check(`${tag}: the first row of chords starts below the top row of the bar`, gap.chord >= gap.head - 1.5, JSON.stringify(gap));
    // The PDF is the preview, mark included.
    const { pdf } = await comparePdf(page, tag, { pages: 1, paper: 'a4', orientation: 'portrait' }, path.join(out, `modulations-${form.name}.pdf`));
    check(`${tag}: the PDF text carries « Ton : E » and « Ton : A♭ »`, pdf.length === 1 && /Ton\s*:\s*E/.test(pdf[0].text) && /Ton\s*:\s*A/.test(pdf[0].text), pdf[0]?.text.slice(0, 120));
    // The key is written for the instrument: a B♭ instrument sees F♯ or G♭ and B♭.
    await choose(page, form, { ...RESET, instrument: 'sib' });
    const sib = await page.$$eval('.pp-case .pp-modulation', (els) => els.map((e) => e.dataset.cle).join(' '));
    check(`${tag}: written for a B♭ instrument the marks follow (G♭ and B♭)`, sib === 'G♭ B♭', sib);
    await page.screenshot({ path: path.join(out, `modulations-${form.name}.png`) });
    check(`no page errors (${tag})`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ============================================================ the keyboard, on a computer
  {
    const form = FORMS[0];
    const { page, errors } = await open(form);
    await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector(DIALOG);
    await sleep(300);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="impression"]'));
    check('keyboard: the focus is in the window when it opens (the first option)', (await inside()) && (await page.evaluate(() => document.activeElement.dataset.choix)) === 'portrait');
    let always = true;
    const visited = new Set();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      always = always && (await inside());
      visited.add(await page.evaluate(() => document.activeElement.dataset.choix || document.activeElement.dataset.testid || document.activeElement.className));
    }
    check('keyboard: Tab goes round the window and never leaves it (40 presses)', always, [...visited].join(' '));
    check('keyboard: it reaches the options, the checkboxes, the list and both buttons', ['paysage', 'impression-echelle', 'impression-une-page', 'impression-titre-case', 'impression-pdf', 'impression-imprimer'].every((id) => visited.has(id)), [...visited].join(' '));
    await page.evaluate(() => document.querySelector('[data-testid="impression"] .fermer').focus());
    await page.keyboard.press('Shift+Tab');
    check('keyboard: Shift+Tab from the first control (the close button) goes to the last, inside the window', (await inside()) && (await page.evaluate(() => document.activeElement.dataset.testid)) === 'impression-imprimer');
    // Space chooses an option.
    await page.evaluate(() => document.querySelector('[data-choix="paysage"]').focus());
    const playing = await page.evaluate(() => window.__fabtice.store.getState().transport.engine);
    await page.keyboard.press('Space');
    await sleep(120);
    check('keyboard: Space does not start the music under the window', (await page.evaluate(() => window.__fabtice.store.getState().transport.engine)) === playing);
    check('keyboard: Space on « Paysage » chooses it', (await sheets(page))[0].w > (await sheets(page))[0].h);
    await page.keyboard.press('Escape');
    await sleep(150);
    check('keyboard: Escape closes the window and the focus goes back to « Imprimer » of the chart', (await page.locator(DIALOG).count()) === 0 && (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'imprimer-grille');
    // The background does not answer while it is open (Tab does not reach it).
    await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector(DIALOG);
    check('the app behind is inert while the window is open', await page.evaluate(() => document.querySelector('.app').inert === true));
    check('no page errors (keyboard)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ============================================================ a phone: the pages side by side
  {
    const form = FORMS[1];
    const { page, errors } = await open(form);
    await setBars(page, 104);
    await sleep(250);
    await openDialog(page);
    await page.waitForSelector(DIALOG);
    await sleep(400);
    const scroll = await page.$eval('[data-testid="apercu"]', (el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, dir: getComputedStyle(el.querySelector('.pp-pages')).flexDirection }));
    check('mobile: the pages are side by side, the preview scrolls sideways', scroll.dir === 'row' && scroll.sw > scroll.cw, JSON.stringify(scroll));
    const box = await page.$eval('[data-testid="apercu"] .pp-papier', (el) => el.getBoundingClientRect().toJSON());
    const area = await page.$eval('[data-testid="apercu"]', (el) => el.getBoundingClientRect().toJSON());
    check('mobile: a whole page is visible in the preview (it is not cropped)', box.top >= area.top - 1 && box.bottom <= area.bottom + 1, `page ${Math.round(box.top)}–${Math.round(box.bottom)} in ${Math.round(area.top)}–${Math.round(area.bottom)}`);
    await page.evaluate(() => (document.querySelector('[data-testid="apercu"]').scrollLeft = 10000));
    await sleep(150);
    check('mobile: the last page can be reached by scrolling', await page.$eval('[data-testid="apercu"]', (el) => el.scrollLeft > 100));
    const dock = await page.$eval('.imp-pied', (el) => ({ bottom: Math.round(el.getBoundingClientRect().bottom), h: Math.round(el.getBoundingClientRect().height) }));
    check('mobile: the two buttons are stuck at the bottom of the screen', dock.bottom === 844 && (await page.locator('[data-testid="impression-imprimer"]').boundingBox()).y > 700, JSON.stringify(dock));
    check('mobile: the window fills the screen', await page.$eval('.fenetre-impression', (el) => Math.round(el.getBoundingClientRect().width) === 390 && Math.round(el.getBoundingClientRect().height) === 844));
    // The options scroll under the preview and the buttons stay.
    const opt = await page.$eval('.imp-options', (el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    await page.evaluate(() => (document.querySelector('.imp-options').scrollTop = 1000));
    await page.screenshot({ path: path.join(out, 'impression-mobile-options-bas.png') });
    check('mobile: the options list scrolls by itself when it does not fit', opt.sh >= opt.ch);
    await page.evaluate(() => (document.querySelector('.imp-options').scrollTop = 0));
    await choose(page, form, { orientation: 'paysage' });
    await page.screenshot({ path: path.join(out, 'impression-mobile-paysage.png') });
    check('no page errors (mobile pages)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ============================================================ « Ce qu'on imprime » (C14): the whole chart, or one section
  for (const form of FORMS) {
    const tag = form.name;
    const { page, errors } = await open(form, '?demo&structure=demo&moteur=factice&vue=grille');
    await page.setViewportSize(form.viewport);
    const shot = (name) => page.screenshot({ path: path.join(out, `impression-${tag}-${name}.png`) });
    const partIds = await page.evaluate(() => window.__fabtice.structure.selectors.structureInForce(window.__fabtice.store.getState()).parts.map((p) => p.id));
    const openIt = async () => {
      if (!form.touch) await page.click('[data-testid="imprimer-grille"]');
      else await openDialog(page);
      await page.waitForSelector(DIALOG);
      await sleep(350);
    };
    const checked = () => page.$$eval(`${DIALOG} [role="radio"][aria-checked="true"]`, (els) => els.map((e) => e.dataset.choix));
    const barsOnPaper = () => page.$$eval('.pp-case .pp-numero', (els) => els.map((e) => Number(e.textContent)));
    const textOf = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);

    await openIt();
    await choose(page, form, RESET);
    const groups = await page.$$eval(`${DIALOG} .imp-groupe h3`, (els) => els.map((e) => e.textContent));
    check(`${tag}: « Ce qu’on imprime » is a group of the window, before « Marges »`, groups.includes('Ce qu’on imprime') && groups.indexOf('Ce qu’on imprime') < groups.indexOf('Marges'), groups.join('|'));
    const choices = await page.$$eval(`${DIALOG} [data-choix="full"], ${DIALOG} [data-choix="simplified"], ${DIALOG} [data-choix="part"]`, (els) => els.map((e) => `${e.dataset.choix}:${e.textContent.trim()}`));
    check(`${tag}: « Grille complète », « Grille complète simplifiée » (the piece has a form to fold) and « Une section »`, choices.join('|') === 'full:Grille complète|simplified:Grille complète simplifiée|part:Une section', choices.join('|'));
    check(`${tag}: the screen shows the whole chart: « Grille complète » is chosen, all 25 bars are on the paper`, (await checked()).includes('full') && (await barsOnPaper()).length === 25, (await checked()).join());
    check(`${tag}: the first sheet says the form under the key and tempo: « Forme : AABC »`, (await textOf('.pp-forme')) === 'Forme : AABC' && (await textOf('.pp-infos')) !== null);
    const order = await page.$$eval('.pp-tete > *', (els) => els.map((e) => e.className));
    check(`${tag}: …the rows of the title block are title, key and tempo, form`, order.join('|') === 'pp-titre|pp-infos|pp-forme', order.join('|'));
    check(`${tag}: « Forme » is a box of the « En-tête » group, ticked`, (await page.isChecked('[data-testid="impression-forme-case"]')) && (await page.locator('.imp-groupe', { hasText: 'En-tête' }).locator('.imp-case', { hasText: 'Forme' }).count()) === 1);
    await shot('ce-quon-imprime');
    await choose(page, form, { form: false });
    check(`${tag}: leaving « Forme » out removes the line`, (await page.locator('.pp-forme').count()) === 0);
    await choose(page, form, { form: true });

    // One section.
    await choose(page, form, { what: 'part' });
    const options = await page.$$eval('[data-testid="impression-section"] option', (els) => els.map((e) => e.textContent));
    check(`${tag}: « Une section » offers the parts in force, with their letters`, options.join('|') === 'Intro|Thème 1 · AABC|Solo (Guitare) · AA|Solo (Trompette) · AA|Thème 2 · BC|Outro', options.join('|'));
    check(`${tag}: …the first one is on the paper, with the line that names it under the title`, (await textOf('.pp-partie')) !== null);
    await choose(page, form, { section: 2 });
    let nums = await barsOnPaper();
    check(`${tag}: « Solo (Guitare) »: only its bars, numbers kept (11 to 14)`, nums.join() === '11,12,13,14', nums.join());
    const order2 = await page.$$eval('.pp-tete > *', (els) => els.map((e) => e.className));
    check(`${tag}: the header says which part, under the title: « Solo (Guitare) · mesures 11–14 »`, (await textOf('.pp-partie')) === 'Solo (Guitare) · mesures 11–14' && order2.join('|') === 'pp-titre|pp-partie|pp-infos|pp-forme', `${await textOf('.pp-partie')} | ${order2.join('|')}`);
    const one = await sheets(page);
    check(`${tag}: one sheet, one line of four bars`, one.length === 1 && one[0].lines === 1 && one[0].bars === 4, JSON.stringify(one.map((x) => [x.lines, x.bars])));
    check(`${tag}: the section's own letters are on its bars (A, A)`, (await page.$$eval('.pp-case .pp-section', (els) => els.map((e) => e.textContent))).join('') === 'AA');
    check(`${tag}: the first bar of the section has no double bar`, !(await page.$eval('.pp-case', (el) => el.classList.contains('pp-double'))));
    await shot('une-section');
    await choose(page, form, { section: 1 });
    nums = await barsOnPaper();
    check(`${tag}: « Thème 1 »: bars 3 to 10, in two lines, from the first bar of the section`, nums.join() === '3,4,5,6,7,8,9,10' && (await sheets(page))[0].lines === 2 && (await textOf('.pp-partie')) === 'Thème 1 · mesures 3–10', nums.join());
    await choose(page, form, { section: 5 });
    check(`${tag}: « Outro »: its two bars, 23 and 24`, (await barsOnPaper()).join() === '23,24', (await barsOnPaper()).join());
    // The PDF is the preview for a section too.
    await choose(page, form, { section: 2 });
    await comparePdf(page, `${tag}, one section`, { paper: 'a4', orientation: 'portrait', pages: 1 }, null);
    await choose(page, form, { orientation: 'paysage', paper: 'lettre' });
    await comparePdf(page, `${tag}, one section, Letter on its side`, { paper: 'lettre', orientation: 'paysage', pages: 1 }, null);
    await choose(page, form, { orientation: 'portrait', paper: 'a4' });
    // Back to the whole chart.
    await choose(page, form, { what: 'full' });
    check(`${tag}: « Grille complète » again: all the bars, no line naming a part`, (await barsOnPaper()).length === 25 && (await page.locator('.pp-partie').count()) === 0);
    check(`${tag}: choosing what to print leaves the chart on the screen as it was`, (await page.evaluate(() => window.__fabtice.store.getState().ui.chartDisplay.kind)) === 'full');
    // What is kept is the kind, never the section.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fabtice.print')));
    check(`${tag}: the options kept hold « what » and the form box, never the section`, stored.what === 'full' && stored.header.form === true && !JSON.stringify(stored).includes('demo-'), JSON.stringify(stored));
    await closeDialog(page);

    // The window opens on what the screen shows.
    await page.evaluate((id) => window.__fabtice.structure.display.showPart(id), partIds[3]);
    await sleep(300);
    await openIt();
    check(`${tag}: the screen shows « Solo (Trompette) »: the window opens on « Une section », that one`, (await checked()).includes('part') && (await page.$eval('[data-testid="impression-section"]', (el) => el.selectedOptions[0].textContent)).startsWith('Solo (Trompette)') && (await barsOnPaper()).join() === '15,16,17,18', `${(await checked()).join()} ${(await barsOnPaper()).join()}`);
    await closeDialog(page);
    await page.evaluate(() => window.__fabtice.structure.display.showSimplifiedChart());
    await sleep(200);
    await openIt();
    check(`${tag}: the screen shows the simplified chart: the window opens on it (its written bars, no bar numbers; see simplified.mjs)`, (await checked()).includes('simplified') && (await barsOnPaper()).length === 0 && (await page.locator('.pp-case[data-ecrite]').count()) > 0, (await checked()).join());
    // The PDF is the preview for the simplified chart too (headings, repeat signs, « ×2 », the form line in full).
    await comparePdf(page, `${tag}, the simplified chart`, { paper: 'a4', orientation: 'portrait', pages: 1 }, null);
    check(`${tag}: the form line is written in full (the parts and their letters)`, ((await textOf('.pp-forme')) ?? '').startsWith('Forme : Intro, Thème 1 (AABC)'), String(await textOf('.pp-forme')));
    check(`${tag}: everything on the simplified page stays inside its sheet`, (await layoutProblems(page)).length === 0, (await layoutProblems(page)).join(' ; '));
    await closeDialog(page);

    // A part deleted while it is chosen: the list follows.
    await page.evaluate((id) => window.__fabtice.structure.display.showPart(id), partIds[1]);
    await openIt();
    await page.evaluate((id) => window.__fabtice.structure.actions.removePart(id), partIds[1]);
    await sleep(300);
    check(`${tag}: the part chosen is deleted behind the window: the list follows (five parts left)`, (await page.$$eval('[data-testid="impression-section"] option', (els) => els.length)) === 5);
    await closeDialog(page);

    // No structure at all: « Une section » cannot be chosen.
    await page.evaluate(() => {
      const f = window.__fabtice.structure;
      f.actions.resetStructure();
      f.setDetected(null);
      f.display.showFullChart();
    });
    await sleep(250);
    await openIt();
    check(`${tag}: no parts: « Une section » is greyed out, no « Forme » line (the form is not known)`, (await page.isDisabled('[data-choix="part"]')) && (await page.locator('.pp-forme').count()) === 0);
    await closeDialog(page);

    // Options kept by an older version (without « what » or « Forme ») still load.
    await page.evaluate(() => localStorage.setItem('fabtice.print', JSON.stringify({ orientation: 'paysage', paper: 'a4', margins: 'larges', scale: 70, fitOne: false, header: { title: true, key: false, tempo: true } })));
    await openIt();
    const old = await page.evaluate(() => ({ checked: [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map((e) => e.dataset.choix).join(), forme: document.querySelector('[data-testid="impression-forme-case"]').checked, key: document.querySelector('[data-testid="impression-ton-case"]').checked }));
    check(`${tag}: options kept before « Ce qu’on imprime » still load (landscape, wide margins kept; the whole chart; « Forme » on)`, old.checked.includes('paysage') && old.checked.includes('larges') && old.checked.includes('full') && old.forme === true && old.key === false, JSON.stringify(old));
    if (form.touch) {
      const small = await page.$$eval(`${DIALOG} [data-choix="full"], ${DIALOG} [data-choix="part"], ${DIALOG} [data-testid="impression-forme-case"]`, (els) => els.map((el) => [el.dataset.choix || el.dataset.testid, (el.closest('.imp-case') ?? el).getBoundingClientRect().height]).filter(([, h]) => h < 39.5));
      check(`${tag}: the new controls are at least 40 px high`, small.length === 0, JSON.stringify(small));
    }
    const overflow = await noOverflow(page);
    check(`${tag}: nothing overflows with the new group`, overflow.length === 0, overflow.join(' ; '));
    check(`no page errors (${tag}, what is printed)`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
} catch (e) {
  failed++;
  console.log('FAIL  (exception)', e);
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots and PDF: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
