// Browser checks of the export to iReal Pro in Chromium, on the built interface
// served from web/ with the isolation headers:
//   npm run build && npm run test:export
// « Exporter ▸ iReal Pro » in the menu Fabtice, the file the browser downloads, and the link inside it
// read back (by a reader written here, from the format described in
// src/export/IREAL-FORMAT.md) and compared with the chords the chart view
// shows, with a transposition set. Playwright and Chromium are expected
// preinstalled (/opt/node-tools); set PLAYWRIGHT_MODULE_DIR to load them
// from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { closeMenu, menuCommand, menuEntry, openMenu } from './lib/menu.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.env.FABTICE_EXPORT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-export-'));
fs.mkdirSync(out, { recursive: true });
/** The texts of the elements a locator matches, trimmed. */
const texts = (locator) => locator.allInnerTexts().then((all) => all.map((x) => x.trim()));

// ---------------------------------------------------------------- a reader of the link (not the app's)

function unhussle(text) {
  let rest = text;
  let out = '';
  const rev = (s) => [...s].reverse().join('');
  while (rest.length > 50) {
    const seg = rest.slice(0, 50);
    rest = rest.slice(50);
    if (rest.length < 2) {
      out += seg;
      continue;
    }
    out += rev(seg.slice(45, 50)) + seg.slice(5, 10) + rev(seg.slice(26, 40)) + seg.slice(24, 26) + rev(seg.slice(10, 24)) + seg.slice(40, 45) + rev(seg.slice(0, 5));
  }
  return out + rest;
}

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootPc = (name) => (ROOTS[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;

/** The song of an irealb:// link: fields and bars (each bar: list of cell tokens). */
function readLink(link) {
  const body = /^irealb:\/\/(.*)$/s.exec(link)?.[1];
  if (!body) throw new Error('not an irealb link');
  const f = decodeURIComponent(body).split('=');
  if (f.length !== 10) throw new Error(`${f.length} fields`);
  const music = unhussle(f[6].replace(/^1r34LbKcu7/, '')).replaceAll('XyQ', '   ').replaceAll('LZ', ' |').replaceAll('Kcl', '| x');
  const bars = [];
  let cur = { cells: [], section: null, ts: null, double: false };
  let s = music;
  const chord = /^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\/[A-G][b#]?)?/;
  let previousClose = '';
  while (s.length) {
    let m;
    if ((m = /^T(\d)(\d)/.exec(s))) { cur.ts = `${m[1]}/${m[2]}`; s = s.slice(3); }
    else if ((m = /^\*([A-Za-z])/.exec(s))) { cur.section = m[1]; s = s.slice(2); }
    else if ((m = /^<[^>]*>/.exec(s))) { s = s.slice(m[0].length); }
    else if (s[0] === '[' || s[0] === '{') { if (bars.length > 0) cur.double = true; s = s.slice(1); }
    else if ('|]}Z'.includes(s[0])) { cur.close = s[0]; if (previousClose === ']') cur.double = bars.length > 0; bars.push(cur); previousClose = s[0]; cur = { cells: [], section: null, ts: null, double: false }; s = s.slice(1); }
    else if (s[0] === ' ') { cur.cells.push(''); s = s.slice(1); }
    else if (s[0] === ',') s = s.slice(1);
    else if ('npx'.includes(s[0])) { cur.cells.push(s[0]); s = s.slice(1); }
    else if ((m = chord.exec(s))) { cur.cells.push(m[0]); s = s.slice(m[0].length); }
    else throw new Error(`unexpected ${s.slice(0, 6)}`);
  }
  return { title: f[0], composer: f[1], style: f[3], key: f[4], feel: f[7], bpm: Number(f[8]), bars };
}

/** What a chord token says: root, and a family comparable with what the chart shows. */
function irealFamily(token) {
  const m = /^([A-G][b#]?)(.*?)(\/[A-G][b#]?)?$/.exec(token);
  const q = m[2];
  const family = q.includes('^') && !q.startsWith('-') ? 'maj7' : q.startsWith('-') || q.startsWith('h') ? 'min' : 'other';
  return `${rootPc(m[1])}:${family}`;
}

/** The same for what the chart view shows in a bar (a `.ch` element, serialised by the page). */
function shownFamily(chordText) {
  const m = /^([A-G])([♭♯]?)(.*)$/.exec(chordText.replace(/△/g, '^'));
  const root = (ROOTS[m[1]] + (m[2] === '♭' ? -1 : m[2] === '♯' ? 1 : 0) + 12) % 12;
  const q = m[3].replace(/\/.*$/, '');
  const family = q.startsWith('^') ? 'maj7' : q.startsWith('m') || q.startsWith('–') ? 'min' : 'other';
  return `${root}:${family}`;
}

// ---------------------------------------------------------------- run

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(query, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  return { page, context, errors };
}

/** Downloads through the menu and returns the file's text and name. */
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), menuCommand(page, 'Exporter', 'iReal Pro', 'Fichier iReal Pro…')]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), html: fs.readFileSync(file, 'utf8') };
}

const linkOf = (html) => {
  const links = [...html.matchAll(/href="(irealb:\/\/[^"]*)"/g)].map((m) => m[1]);
  return links.length === 1 ? links[0] : null;
};

/** What the chart view shows, bar by bar: the chords (family and root) or « repeat ». */
const shownBars = (page) =>
  page.$$eval('.vue-grille .case', (cells) =>
    cells.map((c) => {
      const chords = [...c.querySelectorAll('.ch')].map((ch) => {
        const clone = ch.cloneNode(true);
        clone.querySelectorAll('svg.tri').forEach((svg) => svg.replaceWith('△'));
        clone.querySelectorAll('.ext').forEach((e) => e.remove());
        return clone.textContent;
      });
      return chords;
    }),
  );

try {
  // ------------------------------------------------------------ the demo piece: menu, file, link
  {
    const { page, context, errors } = await open('?demo');
    // The menu Fabtice (C6): Exporter ▸ iReal Pro ▸ Fichier iReal Pro…, Ouvrir dans iReal Pro (the web app follows the link itself).
    await openMenu(page);
    await page.click('[data-sous-menu="export"]');
    await page.click('[data-sous-menu="ireal"]');
    const items = await page.$$eval('.sous-menu .sous-menu [role="menuitem"]', (els) => els.map((e) => ({ key: e.dataset.commande, disabled: e.getAttribute('aria-disabled') === 'true', text: e.innerText.trim() })));
    check('menu: « Fichier iReal Pro… », available', items.length >= 1 && items[0].key === 'irealFile' && !items[0].disabled && items[0].text === 'Fichier iReal Pro…', JSON.stringify(items));
    check('menu: « Ouvrir dans iReal Pro » follows it, in the web app too', items.length === 2 && items[1].key === 'irealOpen' && !items[1].disabled && items[1].text === 'Ouvrir dans iReal Pro', JSON.stringify(items));
    check('menu: the sound and PDF entries are still there', (await page.locator('.sous-menu [data-commande="exportAudio"]').count()) === 1 && (await page.locator('.sous-menu [data-commande="pdf"]').count()) === 1);
    await closeMenu(page);

    // The file.
    const { name, html } = await download(page);
    check('file: named after the piece', name === 'Blues du dimanche.html', name);
    check('file: one irealb:// link, a French sentence, valid page', linkOf(html) !== null && /<html lang="fr">/.test(html) && /ouvrez ce fichier avec iReal Pro/.test(html) && html.includes('<title>Blues du dimanche · iReal Pro</title>'));
    const link = linkOf(html);
    check('file: the link is plain ASCII, no spaces', /^irealb:\/\/[\x21-\x7e]+$/.test(link), `${link.length} characters`);
    let song = readLink(link);
    check('link: title, unknown composer, style, key of the piece, tempo', song.title === 'Blues du dimanche' && song.composer === 'Unknown' && song.style === 'Medium Swing' && song.key === 'Ab' && song.feel === 'Jazz-Medium Swing' && song.bpm === 110, JSON.stringify({ ...song, bars: undefined }));
    check('link: the menu closed after the click', (await page.locator('#menu-fabtice').count()) === 0);

    // Compared with the chart view.
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await sleep(300);
    let shown = await shownBars(page);
    const compare = (song, shown, label) => {
      let bad = 0;
      let notes = '';
      let n = 0;
      song.bars.forEach((bar, i) => {
        const wanted = (shown[i] ?? []).map(shownFamily);
        const read = bar.cells.filter((c) => c !== '' && c !== 'x' && c !== 'p' && c !== 'n').map(irealFamily);
        n += wanted.length;
        if (wanted.join() !== read.join()) {
          bad++;
          if (notes.length < 120) notes += ` bar ${i + 1}: shown ${wanted.join('|')} / link ${read.join('|')};`;
        }
      });
      check(`${label}: every bar of the link has the chords the chart shows (${n} chords)`, bad === 0 && song.bars.length === shown.length, `${song.bars.length} bars vs ${shown.length}${notes}`);
    };
    compare(song, shown, 'link vs chart (original key)');
    const dub = song.bars.filter((b) => b.cells.filter((c) => c !== '' && c !== 'x' && c !== 'p').length === 2).length;
    check('link: a bar with two chords keeps both (demo bar 15)', dub >= 1, `${dub} bars`);
    check('link: sections A, B, A with double bars', song.bars.map((b) => b.section).filter(Boolean).join('') === 'ABA' && song.bars.filter((b) => b.double).length === 2);
    check('link: a repeat sign where the chart writes one', song.bars.some((b) => b.cells.includes('x')) && shown.some((chords) => chords.length === 0));

    // Transposition set in the transport: the export follows it, at concert pitch.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__fabtice.actions.stepSemitones(1);
      window.__fabtice.lot2.harmony.setInstrument('sib'); // the instrument must NOT change the export
    });
    await sleep(300);
    const up = await download(page);
    song = readLink(linkOf(up.html));
    check('transposed +5: key Db (A♭ up a fourth), the tempo stays the recording’s', song.key === 'Db' && song.bpm === 110, `${song.key} ${song.bpm}`);
    await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('ut'));
    await sleep(300);
    shown = await shownBars(page);
    check('transposed +5: the chart shows D♭ as first chord', shown[0][0].startsWith('D♭'), shown[0][0]);
    compare(song, shown, 'link vs chart (+5 semitones)');
    await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('sib'));
    await sleep(300);
    shown = await shownBars(page);
    check('instrument B♭ changes the chart but not the file (concert pitch)', shown[0][0].startsWith('E♭') && readLink(linkOf((await download(page)).html)).key === 'Db', shown[0][0]);
    await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('ut'));

    // The minor sign of the settings is a display choice: the export always writes « - ».
    await page.evaluate(() => window.__fabtice.actions.setMinorNotation('–'));
    await sleep(200);
    const dash = readLink(linkOf((await download(page)).html));
    check('minor sign « – » in the settings does not change the file', dash.bars.some((b) => b.cells.some((c) => /^F-7$|^Gb?-7$|-7/.test(c))), '');

    // A chord written by hand is exported.
    await page.evaluate(() => {
      window.__fabtice.actions.resetTransposition();
      window.__fabtice.lot2.harmony.setBarChords(1, [{ beatInBar: 0, chord: { root: 0, quality: 'min7', extensions: ['9'], bass: 7 } }]);
    });
    await sleep(300);
    const edited = readLink(linkOf((await download(page)).html));
    check('a chord typed by hand is exported (C-9/G in bar 2)', edited.bars[1].cells[0] === 'C-9/G', edited.bars[1].cells.join('|'));
    check('no page errors (demo)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ nothing to export without chords
  {
    const { page, context, errors } = await open('?demo&analyse=aucune');
    const entry = await menuEntry(page, 'Exporter', 'iReal Pro');
    check('no chords yet: « iReal Pro » is greyed out', !entry.enabled, JSON.stringify(entry));
    check('no page errors (no chords)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the entry follows an analysis that ends
  {
    const { page, context, errors } = await open('?demo&analyse=lente');
    await openMenu(page);
    await page.click('[data-sous-menu="export"]');
    const entry = page.locator('[data-sous-menu="ireal"]');
    check('analysis running: the entry waits', (await entry.getAttribute('aria-disabled')) === 'true');
    await page.waitForFunction(() => document.querySelector('[data-sous-menu="ireal"]') && !document.querySelector('[data-sous-menu="ireal"]').hasAttribute('aria-disabled'), null, { timeout: 30000 });
    check('analysis done: the open menu offers it by itself', (await entry.getAttribute('aria-disabled')) === null);
    await closeMenu(page);
    const { html } = await download(page);
    check('the file of the analysed piece decodes', readLink(linkOf(html)).bars.length > 20);
    check('no page errors (analysis)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ « Ouvrir dans iReal Pro » in the web app, in both forms
  for (const form of [{ name: 'computer', viewport: { width: 1280, height: 800 }, touch: false }, { name: 'phone', viewport: { width: 390, height: 844 }, touch: true }]) {
    const tag = form.name;
    const context = await browser.newContext({ viewport: form.viewport, hasTouch: form.touch, isMobile: form.touch, deviceScaleFactor: form.touch ? 2 : 1, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // The navigation to irealb:// is intercepted: the link followed is noted and goes no further.
    await page.addInitScript(() => {
      document.addEventListener(
        'click',
        (e) => {
          const a = e.target instanceof Element ? e.target.closest('a[data-export="ireal-open"]') : null;
          if (!a) return;
          (window.__irealClicks ||= []).push({ href: a.href, hidden: document.hidden, target: a.target });
          e.preventDefault();
        },
        true,
      );
    });
    await page.goto(`${url}/?demo&moteur=factice`);
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    const clicks = () => page.evaluate(() => window.__irealClicks ?? []);
    const notice = page.locator('[data-testid="avis-ireal"]');

    // The entry is offered next to the file, and works.
    const entry = await menuEntry(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro');
    check(`${tag}: « Ouvrir dans iReal Pro » is in the web app too, available`, entry.enabled, JSON.stringify(entry));
    const pagesBefore = context.pages().length;
    await menuCommand(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro');
    await sleep(150);
    let c = await clicks();
    check(`${tag}: the link of the chart is followed once, from the gesture`, c.length === 1 && /^irealb:\/\/[\x21-\x7e]+$/.test(c[0].href), JSON.stringify(c.map((x) => x.href.slice(0, 40))));
    check(`${tag}: …no tab is opened, the page itself does not navigate`, context.pages().length === pagesBefore && c[0].target === '' && page.url().startsWith(url), `${context.pages().length} pages, ${page.url()}`);
    const { html } = await download(page);
    check(`${tag}: …and it is the link of the file « Fichier iReal Pro… » saves`, c[0].href === linkOf(html));
    check(`${tag}: nothing is said at once`, (await notice.count()) === 0);

    // The page stays visible: after a moment, the calm notice.
    await notice.waitFor({ timeout: 6000 });
    const text = (await notice.locator('p').innerText()).trim();
    check(`${tag}: a moment later, the notice, to the letter`, text === 'Si rien ne s’est ouvert, iReal Pro n’est pas installé sur cet appareil, ou le navigateur a bloqué l’ouverture. Vous pouvez enregistrer le fichier et l’ouvrir depuis iReal Pro.', text);
    check(`${tag}: …with « Enregistrer le fichier… » and « Fermer »`, (await texts(notice.locator('button'))).join('|') === 'Enregistrer le fichier…|Fermer');
    const box = await notice.boundingBox();
    check(`${tag}: …inside the screen, not over the transport`, box.x >= 0 && box.x + box.width <= form.viewport.width + 0.5 && box.y >= 0, JSON.stringify(box));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check(`${tag}: …the page does not scroll sideways`, overflow);
    if (form.touch) {
      const small = await notice.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h < 40));
      check(`${tag}: …its buttons are 40 px or more`, small.length === 0, JSON.stringify(small));
    }
    await page.screenshot({ path: path.join(out, `ireal-${tag}-avis.png`) });
    // « Enregistrer le fichier… » is the file command.
    const [dl] = await Promise.all([page.waitForEvent('download'), (form.touch ? notice.locator('[data-testid="avis-ireal-fichier"]').tap() : notice.locator('[data-testid="avis-ireal-fichier"]').click())]);
    check(`${tag}: « Enregistrer le fichier… » saves the file of the piece, and the notice goes`, dl.suggestedFilename() === 'Blues du dimanche.html' && (await notice.count()) === 0, dl.suggestedFilename());
    // « Fermer ».
    await menuCommand(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro');
    await notice.waitFor({ timeout: 6000 });
    await (form.touch ? notice.locator('[data-testid="avis-ireal-fermer"]').tap() : notice.locator('[data-testid="avis-ireal-fermer"]').click());
    check(`${tag}: « Fermer » closes it`, (await notice.count()) === 0);

    // The page goes away (an app took the link): no notice.
    await page.evaluate(() => (window.__irealClicks = []));
    await menuCommand(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(150);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(2400);
    check(`${tag}: the page was hidden for a moment (an app took the link): no notice`, (await notice.count()) === 0 && (await clicks()).length === 1);

    // A link too long to follow: the file is saved, the sentence says why, nothing is followed.
    await page.evaluate(() => (window.__irealClicks = []));
    await page.evaluate(() => {
      const s = window.__fabtice.store;
      s.setState({ project: { ...s.getState().project, duration: 60000 * 4 * (60 / 110) } });
    });
    await sleep(500);
    const [long] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), menuCommand(page, 'Exporter', 'iReal Pro', 'Ouvrir dans iReal Pro')]);
    await notice.waitFor({ timeout: 6000 });
    const longText = (await notice.locator('p').innerText()).trim();
    check(`${tag}: a link longer than the longest: the file is saved, nothing is followed, the sentence says why`, long.suggestedFilename() === 'Blues du dimanche.html' && (await clicks()).length === 0 && longText.includes('trop longue') && (await notice.getAttribute('data-avis')) === 'tooLong', longText);
    check(`${tag}: …with « Fermer » only`, (await texts(notice.locator('button'))).join('|') === 'Fermer');
    await page.screenshot({ path: path.join(out, `ireal-${tag}-trop-longue.png`) });
    check(`no page errors (${tag}, opening in iReal Pro)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
