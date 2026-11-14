// Browser checks of the timeline (waveforms, grid, ruler, loop, playhead,
// scroll, zoom, Auto, follow, phone layout) in Chromium, on the built
// interface served from web/ with the isolation headers.
//   npm run build && npm run test:timeline
// Screenshots go to $FABTICE_TIMELINE_OUT (default: a temporary folder).
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set
// PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_TIMELINE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-timeline-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// TIMELINE_ONLY=desktop|chords|stress|phone runs one section (handy when debugging).
const only = process.env.TIMELINE_ONLY || '';
const want = (name) => !only || only === name;
const chordsWanted = () => !only || only === 'chords';

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(viewport, { touch = false, dpr = 1, query = '?demo&analyse=aucune', waitPeaks = true } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => console.log('PAGE CRASHED'));
  page.on('close', () => console.log('page closed'));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // By default the lot 1 demo: a constant 110 BPM grid (the checks compute bar lines from it), no analysis.
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  if (waitPeaks) await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 15000 });
  await sleep(150);
  return { page, context, errors };
}

const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const position = (page) => page.evaluate(() => window.__fabtice.engine.getPosition());
/** View geometry in page coordinates. */
const geo = (page) =>
  page.evaluate(() => {
    const f = document.querySelector('.frise');
    const fr = f.getBoundingClientRect();
    const ruler = document.querySelector('.frise-regle').getBoundingClientRect();
    const corps = document.querySelector('.frise-corps').getBoundingClientRect();
    const lane = document.querySelector('.frise-voie').getBoundingClientRect();
    const s = window.__fabtice.store.getState();
    const seg = s.tempoMap.segments[0];
    return {
      left: fr.left,
      width: fr.width,
      t0: Number(f.dataset.t0),
      pps: Number(f.dataset.pps),
      tempoTop: ruler.top,
      mesTop: ruler.top + 34,
      lanesTop: corps.top,
      laneH: lane.height,
      bpm: seg.bpm,
      first: seg.time,
      beats: s.tempoMap.meters[0].meter.numerator,
      duration: s.project.duration,
    };
  });
const barTime = (g, bar) => g.first + (bar * g.beats * 60) / g.bpm;
const xOfTime = (g, t) => g.left + (t - g.t0) * g.pps;
const timeOfX = (g, x) => g.t0 + (x - g.left) / g.pps;
const waitView = async (page, fn, timeout = 5000) => {
  await page.waitForFunction(fn, null, { timeout });
  await sleep(60);
};

/** Pixels of a canvas as [r, g, b, a] rows, read in the page. */
const pixelRow = (page, selector, y, index = 0) =>
  page.evaluate(
    ([sel, row, i]) => {
      const c = document.querySelectorAll(sel)[i];
      const d = c.getContext('2d').getImageData(0, row, c.width, 1).data;
      return Array.from(d);
    },
    [selector, y, index],
  );
const alphaAt = (row, x) => row[x * 4 + 3];
/** Strongest alpha within one pixel (the browser and the test may round a line's position differently). */
const alphaNear = (row, x) => Math.max(alphaAt(row, x - 1), alphaAt(row, x), alphaAt(row, x + 1));

try {
  // ------------------------------------------------------------ desktop, 1280 × 800
  if (want('desktop')) {
    const { page, context, errors } = await open({ width: 1280, height: 800 });
    check('timeline replaces the placeholder: four lanes, no placeholder marker', (await page.locator('.frise-voie').count()) === 4 && (await page.locator('[data-placeholder]').count()) === 0);
    let g = await geo(page);

    // Auto is on: the whole piece fits the width, the tracks fit the height without overflow.
    const st0 = await state(page);
    check('Auto: the piece fits the width', st0.view.auto && near(g.pps, g.width / g.duration, 1e-6) && g.t0 === 0, `${g.pps.toFixed(3)} px/s for ${g.width} px`);
    const overflow = await page.evaluate(() => {
      const w = document.querySelector('.travail');
      return w.scrollHeight - w.clientHeight;
    });
    check('Auto: no vertical overflow', overflow <= 0, `${overflow} px`);
    check('Auto: lanes sized to the window', st0.view.trackHeight > 74 && (await page.locator('.piste-tete').first().evaluate((el) => el.getBoundingClientRect().height)) === st0.view.trackHeight, `${st0.view.trackHeight} px`);
    check('ruler and lanes aligned with the header column', await page.evaluate(() => {
      const a = document.querySelector('.regle-tetes').getBoundingClientRect();
      const b = document.querySelector('.frise-regle').getBoundingClientRect();
      const lt = document.querySelector('.piste-tete').getBoundingClientRect();
      const lv = document.querySelector('.frise-voie').getBoundingClientRect();
      return Math.abs(a.bottom - b.bottom) <= 1 && Math.abs(lt.top - lv.top) <= 1 && Math.abs(lt.height - lv.height) <= 1;
    }));

    // Waveforms: pixels in each track's hue.
    const hues = { batterie: [0x6f, 0x58, 0x47], basse: [0x85, 0x50, 0x6b], piano: [0x55, 0x78, 0x86], vents: [0xbd, 0x8a, 0x2c] };
    const roles = (await state(page)).tracks.map((tr) => tr.role);
    for (const [i, role] of roles.entries()) {
      const info = await page.evaluate(
        ([idx, hue]) => {
          const c = document.querySelectorAll('.frise-voie canvas')[idx];
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          let strong = 0;
          for (let p = 0; p < d.length; p += 4) {
            if (d[p + 3] < 80) continue;
            n++;
            if (d[p + 3] > 200 && Math.abs(d[p] - hue[0]) < 8 && Math.abs(d[p + 1] - hue[1]) < 8 && Math.abs(d[p + 2] - hue[2]) < 8) strong++;
          }
          return { n, strong, w: c.width, h: c.height };
        },
        [i, hues[role]],
      );
      check(`waveform drawn in the ${role} hue (two tones)`, info.strong > 400 && info.n > info.strong, `${info.strong} solid px of ${info.n}`);
    }

    // Grid: bar lines in ink at 26 %, sub-grid in the fine rule colour.
    const midRow = Math.floor(g.laneH / 2);
    let row = await pixelRow(page, '.frise-grille', midRow);
    const barX = (b) => Math.round(xOfTime(g, barTime(g, b)) - g.left);
    const sub = Math.round(xOfTime(g, barTime(g, 3) + 60 / g.bpm / 2) - g.left);
    check('bar line at bar 4 (ink, 26 %)', alphaAt(row, barX(3)) >= 55 && alphaAt(row, barX(3)) <= 80 && row[barX(3) * 4] < 70, `alpha ${alphaAt(row, barX(3))}`);
    check('sub-grid line at the eighth (fine rule colour)', alphaAt(row, sub) > 200 && near(row[sub * 4], 0xe6, 3) && near(row[sub * 4 + 1], 0xda, 3), `rgb ${row.slice(sub * 4, sub * 4 + 3)}`);
    check('nothing between the lines', alphaAt(row, barX(3) + 5) === 0);

    // The sub-grid disappears under 5 px: eighths at 28 px/s are 7.6 px; thirty-seconds are 1.9 px.
    await page.selectOption('.choix select', '8');
    await sleep(100);
    row = await pixelRow(page, '.frise-grille', midRow);
    check('sub-grid hidden under 5 px (thirty-seconds at this zoom)', alphaAt(row, sub) === 0 && alphaAt(row, barX(3)) > 0);
    await page.selectOption('.choix select', '1');
    await sleep(100);
    row = await pixelRow(page, '.frise-grille', midRow);
    const beat = Math.round(xOfTime(g, barTime(g, 3) + 60 / g.bpm) - g.left);
    check('quarter notes show again', alphaAt(row, beat) > 200);
    await page.click('.bascule');
    await sleep(100);
    row = await pixelRow(page, '.frise-grille', midRow);
    const twoThirds = Math.round(xOfTime(g, barTime(g, 3) + ((60 / g.bpm) * 2) / 3) - g.left);
    check('triplets: quarter-note triplets (three per two beats)', alphaNear(row, twoThirds) > 200 && alphaAt(row, beat) === 0, `at ${twoThirds}`);
    await page.click('.bascule');
    await page.selectOption('.choix select', '2');

    // Ruler contents: bar numbers, tempo line, loop band.
    const rulerInk = await page.evaluate(() => {
      const c = document.querySelector('.frise-regle-toile');
      const ctx = c.getContext('2d');
      const count = (y0, y1) => {
        const d = ctx.getImageData(0, y0, c.width, y1 - y0).data;
        let n = 0;
        for (let p = 3; p < d.length; p += 4) if (d[p] > 100) n++;
        return n;
      };
      return { tempo: count(0, 34), bars: count(34, 58) };
    });
    check('ruler: tempo line and bar numbers are drawn', rulerInk.tempo > 500 && rulerInk.bars > 300, `${rulerInk.tempo} / ${rulerInk.bars} px`);
    const bandBg = await page.evaluate(() => getComputedStyle(document.querySelector('.frise-bande')).backgroundColor);
    check('loop band: solid brass in the ruler, veil over the lanes', bandBg === 'rgb(184, 135, 58)' && (await page.locator('.frise-voile').isVisible()));
    const loop = (await state(page)).loop.region;
    const bandBox = await page.locator('.frise-bande').boundingBox();
    check('loop band and veil placed on the loop', near(bandBox.x, xOfTime(g, loop.start), 1.5) && near(bandBox.width, (loop.end - loop.start) * g.pps, 2));
    // Numbers inside the loop are ink, not white, on the brass.
    const inkOnBrass = await page.evaluate(
      ([x0, x1]) => {
        const c = document.querySelector('.frise-regle-toile');
        const d = c.getContext('2d').getImageData(x0, 36, x1 - x0, 20).data;
        let dark = 0;
        let white = 0;
        for (let p = 0; p < d.length; p += 4) {
          if (d[p + 3] < 200) continue;
          if (d[p] < 90) dark++;
          if (d[p] > 240 && d[p + 1] > 240) white++;
        }
        return { dark, white };
      },
      [Math.round(bandBox.x - g.left) + 2, Math.round(bandBox.x - g.left + 60)],
    );
    check('ruler numbers on the loop band are ink (never white)', inkOnBrass.dark > 10 && inkOnBrass.white === 0, JSON.stringify(inkOnBrass));

    // Bar thinning: a whole long piece in the ruler stays readable.
    // (Checked in the stress scenario below.)

    // ---- Seek: click without drag
    await page.click('[aria-label^="Magnétisme"]'); // magnet off
    const clickX = xOfTime(g, 20.123);
    const laneY = g.lanesTop + g.laneH * 1.5;
    await page.mouse.click(clickX, laneY);
    await sleep(80);
    let pos = await position(page);
    check('click on a lane seeks, free when the magnet is off', near(pos, 20.123, 1.5 / g.pps), `${pos.toFixed(3)} s`);
    await page.click('[aria-label^="Magnétisme"]'); // magnet on
    await page.mouse.click(clickX, laneY);
    await sleep(80);
    pos = await position(page);
    const step = 60 / g.bpm / 2;
    const k = (pos - g.first) / step;
    check('click on a lane seeks, snapped to the sub-grid when the magnet is on', near(k, Math.round(k), 1e-6) && Math.abs(pos - 20.123) <= step / 2 + 1e-6, `${pos.toFixed(3)} s, ${k.toFixed(2)} steps`);
    await page.mouse.click(xOfTime(g, 31), g.mesTop + 12);
    await sleep(80);
    pos = await position(page);
    const kk = (pos - g.first) / step;
    check('click in the bars row seeks (snapped)', near(kk, Math.round(kk), 1e-6) && Math.abs(pos - 31) <= step / 2 + 1e-6, `${pos.toFixed(3)} s`);
    const headX = await page.evaluate(() => {
      const r = document.querySelector('.frise-corps .frise-lecture').getBoundingClientRect();
      return r.left;
    });
    check('playhead drawn at the new position', near(headX, xOfTime(g, pos), 1.2), `${headX.toFixed(1)} vs ${xOfTime(g, pos).toFixed(1)}`);

    // ---- Drag selects bars (lanes, mouse)
    await page.mouse.move(xOfTime(g, barTime(g, 10) + 1.0), laneY);
    await page.mouse.down();
    await page.mouse.move(xOfTime(g, barTime(g, 12) + 0.5), laneY, { steps: 6 });
    let reg = (await state(page)).loop.region;
    check('dragging on the lanes selects whole bars while moving', near(reg.start, barTime(g, 10), 1e-6) && near(reg.end, barTime(g, 13), 1e-6), JSON.stringify(reg));
    await page.mouse.move(xOfTime(g, barTime(g, 8) + 0.2), laneY, { steps: 6 });
    await page.mouse.up();
    reg = (await state(page)).loop.region;
    check('dragging backwards selects from the first bar touched', near(reg.start, barTime(g, 8), 1e-6) && near(reg.end, barTime(g, 11), 1e-6), JSON.stringify(reg));
    // The click target is where the pointer went down, never where it was released:
    // the playhead either stays (inside the new loop) or goes to the loop start.
    {
      const after = await position(page);
      const inside = pos >= reg.start && pos < reg.end;
      check(
        'a drag does not seek to the pointer; the playhead is brought into the new loop',
        inside ? Math.abs(after - pos) < 1e-6 : near(after, reg.start, 1e-6),
        `${after} (was ${pos}, loop ${JSON.stringify(reg)})`,
      );
    }
    check('selection switches the loop on', (await state(page)).loop.enabled === true);

    // ---- Drag in the bars row
    await page.mouse.move(xOfTime(g, barTime(g, 14) + 0.5), g.mesTop + 12);
    await page.mouse.down();
    await page.mouse.move(xOfTime(g, barTime(g, 16) + 0.5), g.mesTop + 12, { steps: 5 });
    await page.mouse.up();
    reg = (await state(page)).loop.region;
    check('dragging in the bars row selects bars', near(reg.start, barTime(g, 14), 1e-6) && near(reg.end, barTime(g, 17), 1e-6), JSON.stringify(reg));

    // ---- Edge drag adjusts the loop bar by bar
    const endX = xOfTime(g, reg.end);
    await page.mouse.move(endX - 1, g.mesTop + 12);
    check('cursor on a loop edge', (await page.evaluate(() => document.querySelector('.frise').style.cursor)) === 'ew-resize');
    await page.mouse.down();
    await page.mouse.move(endX + (barTime(g, 2) - barTime(g, 0)) * g.pps - 6, g.mesTop + 12, { steps: 6 });
    await page.mouse.up();
    let reg2 = (await state(page)).loop.region;
    check('dragging the right edge extends the loop by two bars', near(reg2.start, barTime(g, 14), 1e-6) && near(reg2.end, barTime(g, 19), 1e-6), JSON.stringify(reg2));
    const startX2 = xOfTime(g, reg2.start);
    await page.mouse.move(startX2 + 1, laneY);
    await page.mouse.down();
    await page.mouse.move(startX2 + (barTime(g, 1) - barTime(g, 0)) * g.pps + 4, laneY, { steps: 6 });
    await page.mouse.up();
    reg2 = (await state(page)).loop.region;
    check('dragging the left edge on the lanes shortens the loop by one bar', near(reg2.start, barTime(g, 15), 1e-6) && near(reg2.end, barTime(g, 19), 1e-6), JSON.stringify(reg2));

    // ---- Loop off: dimmed, not removed
    await page.click('[aria-label="Lecture en boucle"]');
    await sleep(350);
    const dim = await page.evaluate(() => ({
      veil: getComputedStyle(document.querySelector('.frise-voile')).opacity,
      band: getComputedStyle(document.querySelector('.frise-bande')).opacity,
      visible: !document.querySelector('.frise-voile').hidden && !document.querySelector('.frise-bande').hidden,
    }));
    check('loop switched off: region kept and dimmed', dim.visible && Number(dim.veil) < 0.6 && Number(dim.band) < 0.6 && (await state(page)).loop.region !== null, JSON.stringify(dim));
    await page.click('[aria-label="Lecture en boucle"]');
    await sleep(350);
    check('loop back on: full strength', Number(await page.evaluate(() => getComputedStyle(document.querySelector('.frise-voile')).opacity)) === 1);

    // ---- Muted and silenced lanes drop to 22 %
    await page.click('.piste-tete >> nth=1 >> .muet');
    await sleep(400);
    const ops = await page.evaluate(() => [...document.querySelectorAll('.frise-voie canvas')].map((c) => Number(getComputedStyle(c).opacity).toFixed(2)));
    check('muted lane at 22 % opacity, the others untouched', ops[1] === '0.22' && ops[0] === '1.00' && ops[2] === '1.00', ops.join(' '));
    await page.click('.piste-tete >> nth=1 >> .muet');
    await page.click('.piste-tete >> nth=2 >> .solo');
    await sleep(400);
    const ops2 = await page.evaluate(() => [...document.querySelectorAll('.frise-voie canvas')].map((c) => Number(getComputedStyle(c).opacity).toFixed(2)));
    check('solo silences the other lanes (22 %)', ops2.join(' ') === '0.22 0.22 1.00 0.22', ops2.join(' '));
    await page.click('.piste-tete >> nth=2 >> .solo');
    await sleep(400);

    // ---- Sliders and Auto change the scale
    await page.locator('input[aria-label="Zoom horizontal"]').fill('800');
    await waitView(page, () => Number(document.querySelector('.frise').dataset.pps) > 100);
    g = await geo(page);
    const s1 = await state(page);
    check('horizontal slider sets the scale and leaves Auto', s1.view.auto === false && near(g.pps, s1.view.pxPerSecond, 1e-6) && g.pps > 100, `${g.pps.toFixed(1)} px/s`);
    const bar5 = await page.locator('.frise-defile').evaluate((el) => !el.classList.contains('inutile'));
    check('scrollbar appears when the piece overflows', bar5);
    await page.locator('input[aria-label="Zoom vertical"]').fill('150');
    await sleep(150);
    g = await geo(page);
    check('vertical slider sets the lane height', g.laneH === 150 && (await state(page)).view.trackHeight === 150);
    check('lanes overflow vertically and scroll', await page.evaluate(() => {
      const w = document.querySelector('.travail');
      return w.scrollHeight > w.clientHeight;
    }));
    await page.click('.outil-texte');
    await waitView(page, () => document.querySelector('.travail').scrollHeight <= document.querySelector('.travail').clientHeight);
    g = await geo(page);
    check('Auto again: piece fitted, no overflow', near(g.pps, g.width / g.duration, 1e-6) && g.t0 === 0 && (await state(page)).view.auto === true);

    // ---- Wheel and trackpad
    await page.locator('input[aria-label="Zoom horizontal"]').fill('800');
    await waitView(page, () => Number(document.querySelector('.frise').dataset.pps) > 100);
    g = await geo(page);
    await page.mouse.move(g.left + 400, laneY);
    await page.mouse.wheel(300, 0);
    await sleep(150);
    let g2 = await geo(page);
    check('horizontal wheel (trackpad swipe) scrolls', near(g2.t0 - g.t0, 300 / g.pps, 0.02), `${(g2.t0 - g.t0).toFixed(3)} s`);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Shift');
    await sleep(150);
    const g3 = await geo(page);
    check('Shift + wheel scrolls horizontally', near(g3.t0 - g2.t0, 200 / g.pps, 0.02), `${(g3.t0 - g2.t0).toFixed(3)} s`);
    const before = timeOfX(g3, g3.left + 500);
    await page.mouse.move(g3.left + 500, laneY);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await sleep(150);
    const g4 = await geo(page);
    check('Ctrl + wheel zooms around the pointer', g4.pps > g3.pps * 1.2 && near(timeOfX(g4, g4.left + 500), before, 0.02), `${g3.pps.toFixed(1)} -> ${g4.pps.toFixed(1)} px/s`);
    check('Ctrl + wheel leaves Auto and the sliders follow', (await state(page)).view.auto === false && near((await state(page)).view.pxPerSecond, g4.pps, 1e-6));
    const vscroll = await page.evaluate(() => document.querySelector('.travail').scrollTop);
    check('plain wheel is left to the vertical scroller', vscroll === 0);

    // ---- Scrollbar
    const thumb = await page.locator('.frise-pouce').boundingBox();
    const barBox = await page.locator('.frise-defile').boundingBox();
    const tBefore = (await geo(page)).t0;
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2 + 120, thumb.y + thumb.height / 2, { steps: 5 });
    await page.mouse.up();
    await sleep(100);
    const tAfter = (await geo(page)).t0;
    check('dragging the scrollbar thumb scrolls', tAfter > tBefore + 1, `${tBefore.toFixed(2)} -> ${tAfter.toFixed(2)} s`);
    await page.mouse.click(barBox.x + 4, barBox.y + barBox.height / 2);
    await sleep(100);
    check('clicking the scrollbar rule pages back', (await geo(page)).t0 < tAfter);
    await page.focus('.frise-defile');
    await page.keyboard.press('End');
    await sleep(100);
    const gEnd = await geo(page);
    check('keyboard: End on the scrollbar shows the end of the piece', near(gEnd.t0 + gEnd.width / gEnd.pps, gEnd.duration, 0.01));
    await page.keyboard.press('Home');
    await sleep(100);
    check('keyboard: Home goes back to the start', (await geo(page)).t0 === 0);

    // ---- Playhead moves while playing, the view follows (turns the page)
    await page.locator('input[aria-label="Zoom horizontal"]').fill('850');
    await waitView(page, () => Number(document.querySelector('.frise').dataset.pps) > 150);
    g = await geo(page);
    const spanSec = g.width / g.pps;
    await page.evaluate(() => window.__fabtice.actions.setLoopRegion(null));
    await page.evaluate(() => window.__fabtice.actions.seek(0));
    await sleep(100);
    g = await geo(page);
    check('view at the start before playing', g.t0 === 0);
    const x1 = await page.evaluate(() => document.querySelector('.frise-corps .frise-lecture').getBoundingClientRect().left);
    await page.click('.jouer');
    await sleep(500);
    const x2 = await page.evaluate(() => document.querySelector('.frise-corps .frise-lecture').getBoundingClientRect().left);
    check('playhead moves while playing', x2 > x1 + 20, `${x1.toFixed(1)} -> ${x2.toFixed(1)}`);
    const sync = await page.evaluate(() => {
      const f = document.querySelector('.frise');
      const m = new DOMMatrix(getComputedStyle(document.querySelector('.frise-corps .frise-lecture')).transform);
      return { x: m.m41, expected: (window.__fabtice.engine.getPosition() - Number(f.dataset.t0)) * Number(f.dataset.pps) };
    });
    check('playhead position matches the engine (within a frame)', near(sync.x, sync.expected, 25), `${sync.x.toFixed(1)} vs ${sync.expected.toFixed(1)}`);
    await waitView(page, () => Number(document.querySelector('.frise').dataset.t0) > 0, 12000);
    g2 = await geo(page);
    const headNow = await page.evaluate(() => document.querySelector('.frise-corps .frise-lecture').getBoundingClientRect().left);
    check('follow: the page turns when the playhead reaches the right edge', g2.t0 > 0 && headNow >= g.left && headNow <= g.left + g.width, `t0 = ${g2.t0.toFixed(2)} s, playhead at ${(headNow - g.left).toFixed(0)} px`);
    check('follow: the new page is about one span further', near(g2.t0, spanSec - 0.12 * g.width / g.pps - 0.5, 1.5) || g2.t0 > spanSec * 0.7, `${g2.t0.toFixed(2)} vs span ${spanSec.toFixed(2)}`);
    await page.click('.jouer');

    // Scrolling away while playing: following does not fight the user.
    await page.evaluate(() => window.__fabtice.actions.seek(0));
    await sleep(100);
    await page.click('.jouer');
    await sleep(150);
    await page.mouse.move(g.left + 300, laneY);
    await page.mouse.wheel(900, 0);
    await sleep(600);
    const gAway = await geo(page);
    const posAway = await position(page);
    check('following waits while the user has scrolled the playhead out of view', gAway.t0 > 3 && timeOfX(gAway, gAway.left) > posAway, `t0 ${gAway.t0.toFixed(2)}, pos ${posAway.toFixed(2)}`);
    await page.click('.jouer');

    // Follow off: the view never moves by itself.
    await page.click('button:has-text("Réglages")');
    await page.click('.reglages-app input[type="checkbox"]');
    await page.keyboard.press('Escape');
    check('follow switched off in the settings', (await state(page)).view.follow === false);
    await page.focus('.frise-defile');
    await page.keyboard.press('Home');
    await page.evaluate((t) => window.__fabtice.actions.seek(t), spanSec - 1);
    await sleep(150);
    await page.click('.jouer');
    await sleep(2500);
    const gOff = await geo(page);
    const posOff = await position(page);
    check('follow off: the view stays put while the playhead leaves it', gOff.t0 === 0 && posOff > spanSec + 0.5, `pos ${posOff.toFixed(2)} > span ${spanSec.toFixed(2)}`);
    await page.click('.jouer');
    await page.click('button:has-text("Réglages")');
    await page.click('.reglages-app input[type="checkbox"]');
    await page.keyboard.press('Escape');

    check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ screenshots at 1280 × 800 with a loop and the playhead inside it
  if (want('desktop')) {
    const { page, context, errors } = await open({ width: 1280, height: 800 });
    await page.evaluate(() => window.__fabtice.actions.seek(window.__fabtice.store.getState().loop.region.start + 2.2));
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'timeline-1280.png') });
    check('no page errors (screenshot run)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ the ruler of an analysed piece: chords row and tempo curve
  if (chordsWanted()) {
    // What the page knows of the chord labels: text, left edge in the view, width, and the bar line / beat they should sit on.
    const labels = (page) =>
      page.evaluate(() => {
        const f = document.querySelector('.frise');
        const fr = f.getBoundingClientRect();
        const t0 = Number(f.dataset.t0);
        const pps = Number(f.dataset.pps);
        const s = window.__fabtice.store.getState();
        const segs = s.tempoMap.segments;
        const beatTime = (beat) => {
          let i = 0;
          while (i + 1 < segs.length && segs[i + 1].beat <= beat) i++;
          return segs[i].time + ((beat - segs[i].beat) * 60) / segs[i].bpm;
        };
        const n = s.tempoMap.meters[0].meter.numerator;
        return [...document.querySelectorAll('.frise-accords .frise-accord:not(.frise-jauge)')].map((el) => {
          const r = el.getBoundingClientRect();
          const ch = el.querySelector('.ch');
          const cr = ch.getBoundingClientRect();
          const x = r.left - fr.left; // the element's left edge = the translate
          // Nearest bar line and nearest beat to the label's anchor, in pixels.
          let bestBar = Infinity;
          let bestBeat = Infinity;
          for (let b = -n; b < 4000; b += 1) {
            const px = (beatTime(b) - t0) * pps;
            if (px > x + 40) break;
            if (b % n === 0) bestBar = Math.min(bestBar, Math.abs(px + 9 - x));
            bestBeat = Math.min(bestBeat, Math.abs(px + 6 - x));
          }
          return { text: ch.innerText.replace(/\s+/g, ''), html: ch.outerHTML, x, w: cr.width, nearBar: bestBar, nearBeat: bestBeat, douteux: ch.classList.contains('douteux'), color: getComputedStyle(ch).color };
        });
      });
    const rulerState = (page) =>
      page.evaluate(() => {
        const heads = document.querySelector('.regle-tetes').getBoundingClientRect();
        const ruler = document.querySelector('.frise-regle').getBoundingClientRect();
        const rows = [...document.querySelectorAll('.frise-rang')].map((el) => el.className.replace('frise-rang ', ''));
        const headRows = [...document.querySelectorAll('.regle-tetes .rang-tete')].map((el) => [el.className.replace('rang-tete ', ''), el.getBoundingClientRect().top, el.getBoundingClientRect().height]);
        const rangs = [...document.querySelectorAll('.frise-rang')].map((el) => [el.getBoundingClientRect().top, el.getBoundingClientRect().height]);
        const f = document.querySelector('.frise');
        return { headsBottom: heads.bottom, rulerBottom: ruler.bottom, rows, headRows, rangs, t0: Number(f.dataset.t0), pps: Number(f.dataset.pps), stride: Number(f.dataset.chordStride), count: Number(f.dataset.chordLabels), overflow: document.querySelector('.travail').scrollHeight - document.querySelector('.travail').clientHeight };
      });
    const labelRect = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll('.frise-accords .frise-accord:not(.frise-jauge)')].map((el) => {
          const r = el.querySelector('.ch').getBoundingClientRect();
          return [r.left, r.right, r.top, r.bottom];
        }),
      );

    // ---- desktop, 1280 × 800, analysed piece
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 }, { query: '?demo' });
      let rs = await rulerState(page);
      check('chords: the ruler has three rows, tempo, accords, mesures, in the header column too', rs.rows.join() === 'tempo,accords,mesures' && rs.headRows.map((r) => r[0].replace(/ .*/, '')).join() === 'tempo,accords,mesures', `${rs.rows} | ${rs.headRows.map((r) => r[0])}`);
      check('chords: heights shared with the header column (34, 42, 24)', rs.headRows.every((r, i) => near(r[2], rs.rangs[i][1], 0.5) && near(r[1], rs.rangs[i][0], 1)) && rs.rangs.map((r) => r[1]).join() === '34,42,24', JSON.stringify(rs.rangs));
      check('chords: ruler and header column end together', near(rs.headsBottom, rs.rulerBottom, 1));
      check('chords: Auto still leaves no vertical overflow', rs.overflow <= 0, `${rs.overflow} px`);
      check('tempo head reads « Tempo · ≈ N » on a variable tempo', /Tempo\s*·\s*≈\s*1\d\d/i.test(await page.locator('.rang-tete.tempo').innerText()), await page.locator('.rang-tete.tempo').innerText());

      let ls = await labels(page);
      check('chords: labels are drawn', ls.length >= 8, `${ls.length} labels, stride ${rs.stride}`);
      check('chords: the markup is the chart\'s (triangle, accidentals in the music font)', ls.some((l) => l.html.includes('class="tri"')) && ls.some((l) => l.html.includes('class="alt"')) && ls[0].text.startsWith('A♭'), ls.slice(0, 3).map((l) => l.text).join(' '));
      // Bar 12 of the demo holds the doubtful chord: zoom in so it is written.
      await page.evaluate(() => window.__fabtice.actions.setZoom(120));
      await page.evaluate(() => window.__fabtice.actions.seek(22));
      await sleep(250);
      ls = await labels(page);
      const doubtful = ls.filter((l) => l.douteux);
      check('chords: a doubtful chord is in ink-soft, not ember', doubtful.length >= 1 && doubtful.every((l) => l.color === 'rgb(106, 86, 70)'), doubtful.map((l) => `${l.text} ${l.color}`).join());

      // Alignment with the bar lines at three zoom levels (and scrolled).
      for (const pps of [90, 160, 300]) {
        await page.evaluate((v) => window.__fabtice.actions.setZoom(v), pps);
        await sleep(250);
        rs = await rulerState(page);
        ls = await labels(page);
        const bad = ls.filter((l) => l.nearBar > 1 && l.nearBeat > 1.5);
        check(`chords: every label sits on its bar line (+9 px) or its beat at ${pps} px/s`, ls.length >= 2 && bad.length === 0 && rs.stride === 1, `${ls.length} labels, ${bad.length} off: ${bad.map((b) => `${b.text}@${b.x.toFixed(1)} (${b.nearBar.toFixed(1)}/${b.nearBeat.toFixed(1)})`)}`);
        // The faint bar line of the chord row: a pixel column in the canvas right before a bar-first label.
        const first = ls.find((l) => l.nearBar <= 1 && l.x > 20);
        if (first) {
          const row = await pixelRow(page, '.frise-regle-toile', 34 + 6);
          const x = Math.round(first.x - 9);
          check(`chords: the bar line is drawn in the chord row under the label at ${pps} px/s`, alphaNear(row, x) > 100, `alpha ${alphaNear(row, x)}`);
        }
        // Scrolled by a bar and a half, still aligned.
        await page.evaluate(() => document.querySelector('.frise-regle').dispatchEvent(new WheelEvent('wheel', { deltaX: 333, deltaY: 0, bubbles: true, cancelable: true })));
        await sleep(250);
        ls = await labels(page);
        const bad2 = ls.filter((l) => l.nearBar > 1 && l.nearBeat > 1.5);
        check(`chords: still aligned after scrolling at ${pps} px/s`, ls.length >= 2 && bad2.length === 0, `${ls.length} labels, ${bad2.length} off`);
        await page.evaluate(() => window.__fabtice.actions.seek(0));
      }

      // Playing without scrolling: not a single element created, removed or moved in the ruler's chord row.
      await page.evaluate(() => window.__fabtice.actions.setFollow(false));
      await page.evaluate(() => window.__fabtice.actions.setZoom(60));
      await sleep(250);
      await page.evaluate(() => {
        window.__mut = 0;
        window.__counts = { ruler: 0 };
        const row = document.querySelector('.frise-accords');
        new MutationObserver((m) => (window.__mut += m.length)).observe(row, { childList: true, attributes: true, subtree: true, characterData: true });
        const c = document.querySelector('.frise-regle-toile');
        const ctx = c.getContext('2d');
        for (const name of ['fillRect', 'stroke', 'fill', 'fillText']) {
          const orig = ctx[name].bind(ctx);
          ctx[name] = (...a) => {
            window.__counts.ruler++;
            return orig(...a);
          };
        }
      });
      await page.click('.jouer');
      await sleep(1800);
      const playing = await page.evaluate(() => ({ mut: window.__mut, ruler: window.__counts.ruler, pos: window.__fabtice.engine.getPosition() }));
      await page.click('.jouer');
      check('chords: while playing without scrolling the chord row is not touched (no element created, removed or changed)', playing.mut === 0 && playing.pos > 0.5, `${playing.mut} mutations, position ${playing.pos.toFixed(2)} s`);
      check('chords: nor is the ruler canvas repainted', playing.ruler === 0, `${playing.ruler} drawing calls`);
      await page.evaluate(() => window.__fabtice.actions.setFollow(true));

      // Transposition, instrument and minor sign are reflected.
      await page.evaluate(() => window.__fabtice.actions.setZoom(160));
      await page.evaluate(() => window.__fabtice.actions.seek(0));
      await sleep(250);
      await page.evaluate(() => document.querySelector('.frise-regle').dispatchEvent(new WheelEvent('wheel', { deltaX: -1e6, deltaY: 0, bubbles: true, cancelable: true })));
      await sleep(250);
      const texts = async () => (await labels(page)).filter((l) => l.x > 0).sort((a, b) => a.x - b.x).map((l) => l.text);
      const before = await texts();
      check('chords: the original key reads A♭ (△) then Fm7 (concert pitch, A♭ major)', before[0] === 'A♭' && before[1] === 'Fm7', before.slice(0, 4).join(' '));
      await page.evaluate(() => {
        window.__fabtice.actions.stepSemitones(1);
        window.__fabtice.actions.stepSemitones(1);
      });
      await sleep(250);
      const up2 = await texts();
      check('chords: transposed up two semitones, the row writes B♭ (△) then Gm7', up2[0] === 'B♭' && up2[1] === 'Gm7', up2.slice(0, 4).join(' '));
      await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('sib'));
      await sleep(250);
      const sib = await texts();
      check('chords: for a B♭ instrument two more semitones (C△ then Am7)', sib[0] === 'C' && sib[1] === 'Am7', sib.slice(0, 4).join(' '));
      await page.evaluate(() => {
        window.__fabtice.lot2.harmony.setInstrument('ut');
        window.__fabtice.actions.resetTransposition();
        window.__fabtice.actions.setMinorNotation('–');
      });
      await sleep(250);
      const dash = await texts();
      check('chords: « – » for minor when the setting says so', dash[1] === 'F–7', dash.slice(0, 3).join(' '));
      await page.evaluate(() => window.__fabtice.actions.setMinorNotation('m'));

      // Thinning: zoomed out, the row keeps a regular rhythm and never overlaps.
      for (const pps of [16, 10, 6]) {
        await page.evaluate((v) => window.__fabtice.actions.setZoom(v), pps);
        await sleep(250);
        rs = await rulerState(page);
        const rects = (await labelRect(page)).sort((a, b) => a[0] - b[0]);
        let gaps = true;
        for (let i = 1; i < rects.length; i++) if (rects[i][0] - rects[i - 1][1] < 7) gaps = false;
        const total = await page.evaluate(() => window.__fabtice.store.getState().tempoMap.segments.length);
        check(`chords: zoomed out to ${pps} px/s the row is thinned (stride ${rs.stride}) with no overlap`, gaps && rs.stride >= 2 && (rs.stride & (rs.stride - 1)) === 0 && rects.length >= 2 && rects.length < total / 4, `${rects.length} labels`);
        await page.screenshot({ path: path.join(out, `chords-thinned-${pps}.png`), clip: { x: 0, y: 56, width: 1280, height: 130 } });
      }
      await page.evaluate(() => window.__fabtice.actions.setAuto(true));
      await sleep(300);
      await page.screenshot({ path: path.join(out, 'timeline-chords-1280.png') });

      // Tempo curve: pixels in the tempo row (variable tempo): a curve with dots, over a dotted reference.
      const ink = await page.evaluate(() => {
        const c = document.querySelector('.frise-regle-toile');
        const d = c.getContext('2d').getImageData(0, 0, c.width, 34 * (c.height / (c.clientHeight || c.height))).data;
        const rows = new Set();
        let dark = 0;
        for (let y = 0; y < 34; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i + 3] > 200 && d[i] < 130) {
            dark++;
            rows.add(y);
          }
        }
        return { dark, rows: rows.size };
      });
      check('tempo curve: drawn, and it moves up and down (variable tempo)', ink.dark > 600 && ink.rows >= 8, `${ink.dark} px on ${ink.rows} rows`);
      check('chords: no page errors (desktop)', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- a constant tempo is a flat line
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 });
      const ink = await page.evaluate(() => {
        const c = document.querySelector('.frise-regle-toile');
        const d = c.getContext('2d').getImageData(0, 0, c.width, 34).data;
        const rows = new Set();
        let dark = 0;
        for (let y = 0; y < 34; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i + 3] > 100 && d[i] < 130) {
            dark++;
            rows.add(y);
          }
        }
        return { dark, rows: [...rows] };
      });
      check('tempo curve: a constant tempo is a flat line (1.5 px, same rows everywhere, no dots)', ink.dark > 800 && ink.rows.length <= 3, `${ink.dark} px on rows ${ink.rows}`);
      check('chords: no chords, no chord row (two rows, in both columns)', (await page.locator('.frise-accords').count()) === 0 && (await page.locator('.regle-tetes .rang-tete').count()) === 2);
      check('tempo head of a constant tempo has no « ≈ »', !(await page.locator('.rang-tete.tempo').innerText()).includes('≈'));
      await context.close();
      void errors;
    }

    // ---- the row appears when an analysis ends: nothing jumps
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 }, { query: '?demo&analyse=lente', waitPeaks: true });
      const before = await rulerState(page);
      check('row appears later: no chord row before the analysis', before.rows.join() === 'tempo,mesures');
      await page.evaluate(() => window.__fabtice.actions.setAuto(false));
      await page.evaluate(() => window.__fabtice.actions.setZoom(55));
      await sleep(200);
      const st0 = await rulerState(page);
      await page.waitForFunction(() => document.querySelector('.frise-accords'), null, { timeout: 30000 });
      await sleep(400);
      const after = await rulerState(page);
      check('row appears later: the three rows are there, aligned with the header column', after.rows.join() === 'tempo,accords,mesures' && near(after.headsBottom, after.rulerBottom, 1) && after.headRows.every((r, i) => near(r[2], after.rangs[i][1], 0.5) && near(r[1], after.rangs[i][0], 1)));
      check('row appears later: the view keeps its position and scale', near(after.pps, st0.pps, 1e-6) && near(after.t0, st0.t0, 1e-6), `${st0.t0} -> ${after.t0}, ${st0.pps} -> ${after.pps}`);
      check('row appears later: labels are drawn at once', after.count >= 3, `${after.count}`);
      check('no page errors (row appears)', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- bars and beats of the analysed map drive the grid, the snapping and the selection
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 }, { query: '?demo' });
      await page.evaluate(() => window.__fabtice.actions.setZoom(120));
      await page.evaluate(() => window.__fabtice.actions.seek(0));
      await sleep(300);
      const g = await page.evaluate(() => {
        const f = document.querySelector('.frise');
        const fr = f.getBoundingClientRect();
        const s = window.__fabtice.store.getState();
        const segs = s.tempoMap.segments;
        const beatTime = (beat) => {
          let i = 0;
          while (i + 1 < segs.length && segs[i + 1].beat <= beat) i++;
          return segs[i].time + ((beat - segs[i].beat) * 60) / segs[i].bpm;
        };
        const bt = [];
        for (let b = 0; b <= 40; b++) bt.push(beatTime(b));
        const lane = document.querySelector('.frise-voie').getBoundingClientRect();
        return { left: fr.left, width: fr.width, t0: Number(f.dataset.t0), pps: Number(f.dataset.pps), bt, laneY: lane.top + lane.height / 2, mesY: document.querySelector('.frise-regle').getBoundingClientRect().bottom - 12, variable: segs.length > 1 };
      });
      const px = (t) => g.left + (t - g.t0) * g.pps;
      // Bar lines on the lanes' grid canvas at the analysed bar starts (every 4th beat), not at a constant-tempo guess.
      const row = await pixelRow(page, '.frise-grille', 20);
      let onBeats = 0;
      let total = 0;
      const seen = [];
      for (let b = 4; b <= 28; b += 4) {
        const x = Math.round(px(g.bt[b]) - g.left);
        if (x < 3 || x > g.width - 5) continue;
        total++;
        seen.push(`${b}:${x}=${alphaNear(row, x)}`);
        if (alphaNear(row, x) >= 40) onBeats++;
      }
      check('analysed beats: the bar lines of the grid stand on the analysed bar starts', g.variable && total >= 3 && onBeats === total, `${onBeats}/${total} ${seen}`);
      const constantGuess = (b) => g.bt[0] + (g.bt[4] - g.bt[0]) * (b / 4);
      const drift = Math.max(...[8, 12, 16, 20, 24].map((b) => Math.abs(px(g.bt[b]) - px(constantGuess(b)))));
      check('analysed beats: the demo\'s tempo really moves (a fixed grid would be off by several pixels)', drift > 3, `${drift.toFixed(1)} px`);
      // Snapping: a click near the beat 10 snaps to it with the magnet on and the quarter sub-grid.
      await page.selectOption('.choix select', '1');
      const target = g.bt[10];
      await page.mouse.click(px(target) + 5, g.laneY);
      await sleep(200);
      const pos = await position(page);
      check('analysed beats: a click snaps to the analysed beat', near(pos, target, 0.012), `${pos.toFixed(3)} vs ${target.toFixed(3)}`);
      // Selecting bars in the chord row selects whole analysed bars.
      await page.mouse.move(px(g.bt[9]) + 3, g.mesY - 30);
      await page.mouse.down();
      await page.mouse.move(px(g.bt[17]) + 3, g.mesY - 30, { steps: 8 });
      await page.mouse.up();
      await sleep(200);
      const loop = (await state(page)).loop.region;
      check('analysed bars: dragging across the chord row selects whole bars on the analysed grid', loop && near(loop.start, g.bt[8], 0.012) && near(loop.end, g.bt[20], 0.012), JSON.stringify(loop));
      check('no page errors (grid)', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- a long piece fitted in the window: the chord row thins out regularly
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 }, { query: '?demo&analyse=aucune', waitPeaks: false });
      await page.evaluate(async () => {
        const SR = 48000;
        const n = SR * 600;
        const left = new Float32Array(n);
        for (let i = 0; i < n; i += 97) left[i] = 0.3;
        await window.__fabtice.actions.openProject({ title: 'Dix minutes', source: { kind: 'demo' }, tracks: [{ role: 'batterie', audio: { channels: [left], sampleRate: SR } }] });
        const quals = ['maj7', 'min7', '7', 'min7'];
        for (let bar = 0; bar < 290; bar++) window.__fabtice.lot2.harmony.setBarChords(bar, [{ beatInBar: 0, chord: { root: (bar * 5) % 12, quality: quals[bar % 4], extensions: bar % 3 === 0 ? ['9'] : [], bass: null } }]);
      });
      await page.waitForFunction(() => document.querySelector('.frise-accords'), null, { timeout: 15000 });
      await sleep(600);
      const rs = await rulerState(page);
      const rects = (await labelRect(page)).sort((a, b) => a[0] - b[0]);
      let gaps = true;
      for (let i = 1; i < rects.length; i++) if (rects[i][0] - rects[i - 1][1] < 7) gaps = false;
      check('long piece fitted: 290 bars in the window, the row keeps every 16th, 32nd… bar, no overlap', rs.stride >= 16 && (rs.stride & (rs.stride - 1)) === 0 && gaps && rects.length >= 5 && rects.length <= 40, `stride ${rs.stride}, ${rects.length} labels`);
      check('long piece fitted: aligned header column', near(rs.headsBottom, rs.rulerBottom, 1));
      await page.screenshot({ path: path.join(out, 'chords-long-fitted.png'), clip: { x: 0, y: 56, width: 1280, height: 130 } });
      check('no page errors (long piece)', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- the chord row steps down in size before it drops chords
    {
      const { page, context, errors } = await open({ width: 1280, height: 800 }, { query: '?demo' });
      // What the chart writes at the start of each bar, without the ones that repeat the one before: what the row must show
      // (a second chord inside a bar cannot fit in a 43 px bar and stays out, as the bar-first chord has priority).
      await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
      await sleep(300);
      const expected = await page.$$eval('.vue-grille .case', (cases) => {
        const out = [];
        for (const c of cases) {
          const el = c.querySelector('.ch');
          if (!el) continue;
          const text = el.innerText.replace(/\s+/g, '');
          if (out[out.length - 1] !== text) out.push(text);
        }
        return out;
      });
      await page.evaluate(() => window.__fabtice.actions.setViewMode('pistes'));
      await page.evaluate(() => window.__fabtice.actions.setAuto(true));
      await sleep(400);
      const rowInfo = () =>
        page.evaluate(() => {
          const f = document.querySelector('.frise');
          const fr = f.getBoundingClientRect();
          const t0 = Number(f.dataset.t0);
          const pps = Number(f.dataset.pps);
          const segs = window.__fabtice.store.getState().tempoMap.segments;
          const n = window.__fabtice.store.getState().tempoMap.meters[0].meter.numerator;
          const beatTime = (beat) => {
            let i = 0;
            while (i + 1 < segs.length && segs[i + 1].beat <= beat) i++;
            return segs[i].time + ((beat - segs[i].beat) * 60) / segs[i].bpm;
          };
          const els = [...document.querySelectorAll('.frise-accords .frise-accord:not(.frise-jauge)')];
          const labels = els.map((el) => {
            const r = el.querySelector('.ch').getBoundingClientRect();
            return { text: el.querySelector('.ch').innerText.replace(/\s+/g, ''), left: r.left - fr.left, right: r.right - fr.left, size: getComputedStyle(el).fontSize, small: el.classList.contains('deux'), x: el.getBoundingClientRect().left - fr.left };
          });
          // Next bar line strictly after a label's left edge.
          let crossing = 0;
          for (const l of labels) {
            let next = Infinity;
            for (let b = 0; b < 4000; b += n) {
              const px = (beatTime(b) - t0) * pps;
              if (px > l.x + 1) {
                next = px;
                break;
              }
            }
            if (l.right > next + 0.5) crossing++;
          }
          const sorted = [...labels].sort((a, b) => a.left - b.left);
          let overlaps = 0;
          for (let i = 1; i < sorted.length; i++) if (sorted[i].left < sorted[i - 1].right) overlaps++;
          return { stride: Number(f.dataset.chordStride), size: Number(f.dataset.chordSize), t0, pps, labels, crossing, overlaps, sizes: [...new Set(labels.filter((l) => !l.small).map((l) => l.size))] };
        });
      let r = await rowInfo();
      check('chord row fitted to 1280 px: every chord of the piece is written (no stride)', r.stride === 1 && r.labels.map((l) => l.text).join() === expected.join(), `${r.labels.length}/${expected.length} labels, stride ${r.stride}, pps ${r.pps.toFixed(2)}`);
      check('chord row fitted: the whole row stepped down together (one size, below the comfortable 18 px, not below 14.5)', r.size >= 1 && r.sizes.length === 1 && parseFloat(r.sizes[0]) >= 14.5 && parseFloat(r.sizes[0]) < 18, `level ${r.size}, sizes ${r.sizes}`);
      check('chord row fitted: no label overlaps another or crosses the next bar line', r.overlaps === 0 && r.crossing === 0, `${r.overlaps} overlaps, ${r.crossing} crossings`);
      await page.screenshot({ path: path.join(out, 'chords-size-fitted.png'), clip: { x: 0, y: 56, width: 1280, height: 130 } });

      // Comfortable zoom: nothing changes (18 px, level 0, every chord).
      await page.evaluate(() => window.__fabtice.actions.setZoom(90));
      await sleep(300);
      r = await rowInfo();
      check('chord row at a comfortable zoom: level 0, 18 px, stride 1', r.size === 0 && r.stride === 1 && r.sizes.join() === '18px', `level ${r.size}, ${r.sizes}`);
      await page.screenshot({ path: path.join(out, 'chords-size-comfortable.png'), clip: { x: 0, y: 56, width: 1280, height: 130 } });

      // Where even the smallest size cannot fit: the stride comes back, at the smallest size.
      await page.evaluate(() => window.__fabtice.actions.setZoom(10));
      await sleep(300);
      r = await rowInfo();
      check('chord row where even the smallest size cannot fit: the stride comes back at 14.5 px', r.stride >= 2 && r.size === 2 && r.sizes.join() === '14.5px' && r.overlaps === 0, `stride ${r.stride}, level ${r.size}, ${r.sizes}`);
      await page.screenshot({ path: path.join(out, 'chords-size-stride.png'), clip: { x: 0, y: 56, width: 1280, height: 130 } });

      check('chord row size: no page errors', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- ... and it does not change while scrolling at a fixed zoom (a narrower window, so that the piece scrolls at these zooms)
    {
      const { page, context, errors } = await open({ width: 960, height: 640 }, { query: '?demo' });
      const reading = () =>
        page.evaluate(() => {
          const f = document.querySelector('.frise');
          const sizes = [...new Set([...document.querySelectorAll('.frise-accords .frise-accord:not(.frise-jauge):not(.deux)')].map((el) => getComputedStyle(el).fontSize))];
          return { t0: Number(f.dataset.t0), key: `${f.dataset.chordSize}/${f.dataset.chordStride}/${sizes.join()}` };
        });
      let stepped = 0;
      for (const pps of [19, 21, 23, 27, 40]) {
        await page.evaluate((v) => window.__fabtice.actions.setZoom(v), pps);
        await page.evaluate(() => window.__fabtice.actions.seek(0));
        await page.evaluate(() => document.querySelector('.frise-regle').dispatchEvent(new WheelEvent('wheel', { deltaX: -9000, deltaY: 0, bubbles: true, cancelable: true })));
        await sleep(300);
        const seen = new Set();
        const positions = new Set();
        for (let i = 0; i < 14; i++) {
          const r = await reading();
          seen.add(r.key);
          positions.add(r.t0.toFixed(2));
          await page.evaluate(() => document.querySelector('.frise-regle').dispatchEvent(new WheelEvent('wheel', { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true })));
          await sleep(160);
        }
        if (![...seen][0].startsWith('0/1/')) stepped++;
        check(`chord row at ${pps} px/s: one size and one stride the whole way while scrolling`, seen.size === 1 && positions.size >= 6, `${[...seen]} (${[...positions]})`);
      }
      check('chord row scrolling: at least one of these zooms is below the comfortable size or thinned (the test is meaningful)', stepped >= 2, `${stepped} zooms`);
      check('chord row scrolling: no page errors', errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- phone, 390 × 844
    {
      const { page, context, errors } = await open({ width: 390, height: 844 }, { touch: true, dpr: 2, query: '?demo' });
      const rs = await rulerState(page);
      const ls = await labels(page);
      check('phone: chord row present and aligned with the header column', rs.rows.join() === 'tempo,accords,mesures' && near(rs.headsBottom, rs.rulerBottom, 1) && rs.headRows.every((r, i) => near(r[2], rs.rangs[i][1], 0.5)));
      check('phone: one chord per bar of 86 px, every label on its bar line', rs.stride === 1 && ls.length >= 3 && ls.filter((l) => l.nearBar > 1 && l.nearBeat > 1.5).length === 0, `stride ${rs.stride}, ${ls.length} labels`);
      check('phone: no horizontal page scroll', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      const rects = await labelRect(page);
      check('phone: labels stay inside the ruler (with the loop and the playhead in view)', rects.every((r) => r[2] >= 56 && r[3] <= 400));
      await page.screenshot({ path: path.join(out, 'timeline-chords-390.png') });
      check('no page errors (phone chords)', errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }

  // ------------------------------------------------------------ stress: ten minutes, stereo, four tracks; frame times
  if (want('stress')) {
    const { page, context, errors } = await open({ width: 1280, height: 800 });
    const stats = await page.evaluate(async () => {
      const SR = 48000;
      const n = SR * 600;
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      let seed = 7;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
      // A swinging 120 BPM groove: decaying notes every half beat, plus noise.
      for (let i = 0; i < n; i++) {
        const beat = (i / SR) * 2;
        const phase = beat % 0.5;
        const env = Math.exp(-phase * 9) * (0.4 + 0.6 * Math.abs(Math.sin(beat / 8)));
        const v = env * Math.sin((2 * Math.PI * 110 * i) / SR) + 0.05 * rnd();
        left[i] = v * 0.7;
        right[i] = v * 0.6 + 0.02 * rnd();
      }
      const t = performance.now();
      const audio = { channels: [left, right], sampleRate: SR };
      await window.__fabtice.actions.openProject({
        title: 'Dix minutes',
        source: { kind: 'demo' },
        tracks: [
          { role: 'batterie', audio },
          { role: 'basse', audio },
          { role: 'piano', audio },
          { role: 'vents', audio },
        ],
      });
      return { generate: performance.now() - t };
    });
    // Frames while the peaks are being built.
    const sampler = () =>
      page.evaluate(() => {
        window.__frames = [];
        window.__stop = false;
        window.__long = 0;
        try {
          new PerformanceObserver((l) => {
            window.__long += l.getEntries().length;
          }).observe({ entryTypes: ['longtask'] });
        } catch {
          /* not supported */
        }
        let last = 0;
        const tick = (t) => {
          if (last) window.__frames.push(t - last);
          last = t;
          if (!window.__stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    const report = (page) =>
      page.evaluate(() => {
        window.__stop = true;
        const f = [...window.__frames].sort((a, b) => a - b);
        const q = (p) => f[Math.min(f.length - 1, Math.floor(p * f.length))];
        return { n: f.length, mean: f.reduce((a, b) => a + b, 0) / f.length, p95: q(0.95), p99: q(0.99), max: f[f.length - 1], long: window.__long };
      });
    await sampler();
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('.frise').dataset.peaks === 'ready', null, { timeout: 60000 });
    const peaksMs = Date.now() - t0;
    const building = await report(page);
    console.log(`INFO  peaks of 4 × 10 min stereo: ${peaksMs} ms after opening; frames meanwhile: ${building.n}, mean ${building.mean.toFixed(1)} ms, p95 ${building.p95.toFixed(1)}, max ${building.max.toFixed(1)}, long tasks ${building.long}`);
    check('ten minutes of stereo audio: peaks built without freezing the page (max frame < 250 ms)', building.max < 250, `max ${building.max.toFixed(0)} ms`);
    await page.evaluate(() => window.__fabtice.actions.setAuto(true));
    await sleep(400);
    const g = await geo(page);
    check('ten-minute piece fits the width in Auto', near(g.pps, g.width / g.duration, 1e-6) && g.pps >= 1, `${g.pps.toFixed(2)} px/s`);

    // Ruler thinning with the whole piece in view: 300 bars in ~1000 px.
    await page.evaluate(() => window.__fabtice.actions.setManualGrid({ bpm: 120, firstDownbeat: 0 }));
    await sleep(300);
    const labels = await page.evaluate(() => {
      const c = document.querySelector('.frise-regle-toile');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 34, c.width, 24).data;
      // Columns holding label ink (alpha > 150 and dark): group adjacent ones into glyph clusters.
      const cols = [];
      for (let x = 0; x < c.width; x++) {
        let ink = false;
        for (let y = 0; y < 24 && !ink; y++) if (d[(y * c.width + x) * 4 + 3] > 150 && d[(y * c.width + x) * 4] < 130) ink = true;
        cols.push(ink);
      }
      let clusters = 0;
      let gap = 0;
      let minGap = 1e9;
      let lastEnd = -1;
      for (let x = 0; x < cols.length; x++) {
        if (cols[x]) {
          if (lastEnd >= 0 && x - lastEnd > 6) {
            minGap = Math.min(minGap, x - lastEnd);
            clusters++;
          } else if (lastEnd < 0) clusters++;
          lastEnd = x;
        }
      }
      return { clusters, minGap, gap };
    });
    check('ruler: bar numbers are thinned out regularly and stay readable', labels.clusters > 4 && labels.clusters < 40 && labels.minGap >= 16, JSON.stringify(labels));
    await page.screenshot({ path: path.join(out, 'timeline-1280-ten-minutes.png') });

    // Frames while scrolling and zooming a zoomed-in ten-minute piece.
    await page.evaluate(() => window.__fabtice.actions.setZoom(60));
    await sleep(300);
    await sampler();
    const gg = await geo(page);
    await page.mouse.move(gg.left + 500, gg.lanesTop + 100);
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(80, 0);
      await sleep(16);
    }
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, i < 15 ? -25 : 25);
      await sleep(16);
    }
    await page.keyboard.up('Control');
    const scrolling = await report(page);
    const [fn1, ft1, fm1] = (await page.evaluate(() => document.querySelector('.frise').dataset.flush)).split(',').map(Number);
    console.log(`INFO  scrolling and zooming 4 × 10 min stereo: ${scrolling.n} frames, mean ${scrolling.mean.toFixed(1)} ms, p95 ${scrolling.p95.toFixed(1)}, max ${scrolling.max.toFixed(1)}, long tasks ${scrolling.long}`);
    console.log(`INFO  full redraw cost (grid + 4 waveforms + ruler), cumulative since opening: ${fn1} redraws, mean ${(ft1 / fn1).toFixed(2)} ms, worst ${fm1.toFixed(2)} ms`);
    check('a full redraw costs a fraction of a frame (worst < 12 ms)', fm1 < 12, `worst ${fm1.toFixed(2)} ms`);
    check('scroll and zoom of the ten-minute piece stay smooth (p95 < 40 ms)', scrolling.p95 < 40, `p95 ${scrolling.p95.toFixed(1)} ms`);

    // Frames while playing (the playhead moves, the static layers are not repainted).
    await page.evaluate(() => window.__fabtice.actions.setZoom(40));
    await page.evaluate(() => window.__fabtice.actions.seek(10));
    await sleep(200);
    const paints = await page.evaluate(() => {
      // Count how many times the canvases are written to while playing.
      const counts = { grid: 0, wave: 0, ruler: 0 };
      const hook = (sel, key) => {
        for (const c of document.querySelectorAll(sel)) {
          const ctx = c.getContext('2d');
          const clear = ctx.clearRect.bind(ctx);
          ctx.clearRect = (...a) => {
            counts[key]++;
            return clear(...a);
          };
        }
      };
      hook('.frise-grille', 'grid');
      hook('.frise-voie canvas', 'wave');
      hook('.frise-regle-toile', 'ruler');
      window.__counts = counts;
      return true;
    });
    void paints;
    await sampler();
    await page.click('.jouer');
    await sleep(3000);
    const playing = await report(page);
    const counts = await page.evaluate(() => window.__counts);
    await page.click('.jouer');
    console.log(`INFO  playing, 10-minute piece, follow on: ${playing.n} frames, mean ${playing.mean.toFixed(1)} ms, p95 ${playing.p95.toFixed(1)}, max ${playing.max.toFixed(1)}, long tasks ${playing.long}; canvas repaints (grid / waves / ruler): ${counts.grid} / ${counts.wave} / ${counts.ruler}`);
    check('playing: 60 images/s (mean frame < 20 ms)', playing.mean < 20, `mean ${playing.mean.toFixed(1)} ms`);
    check('playing: static layers are not repainted every frame', counts.grid < 10 && counts.ruler < 10 && counts.wave < 40, JSON.stringify(counts));
    check('no page errors (stress)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ------------------------------------------------------------ phone, 390 × 844, touch
  if (want('phone')) {
    const { page, context, errors } = await open({ width: 390, height: 844 }, { touch: true, dpr: 2 });
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    let g = await geo(page);
    const st = await state(page);
    check('phone: no horizontal page scroll', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    const barPx = (g.beats * 60) / g.bpm * g.pps;
    check('phone: 86 px per bar by default', near(barPx, 86, 0.5) && st.view.auto === false, `${barPx.toFixed(1)} px`);
    check('phone: the playhead is in view (loop at bar 5 revealed)', await page.evaluate(() => {
      const r = document.querySelector('.frise-corps .frise-lecture').getBoundingClientRect();
      const f = document.querySelector('.frise').getBoundingClientRect();
      return r.left >= f.left && r.left <= f.right;
    }));
    await page.evaluate(() => window.__fabtice.actions.seek(window.__fabtice.store.getState().loop.region.start + 2.2));
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'timeline-390.png') });
    g = await geo(page);
    const laneY = g.lanesTop + g.laneH * 1.5;

    // One-finger drag on the lanes scrolls.
    const t0a = g.t0;
    await touch('touchStart', [[g.left + 250, laneY]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[g.left + 250 - i * 15, laneY]]);
    await touch('touchEnd', []);
    await sleep(500);
    let g2 = await geo(page);
    check('touch: one-finger drag on the lanes scrolls', g2.t0 > t0a + 120 / g.pps * 0.8, `${t0a.toFixed(2)} -> ${g2.t0.toFixed(2)} s`);
    check('touch: the drag did not change the loop', JSON.stringify((await state(page)).loop.region) === JSON.stringify(st.loop.region));

    // Tap on a lane seeks.
    const tapX = g.left + 150;
    await touch('touchStart', [[tapX, laneY]]);
    await touch('touchEnd', []);
    await sleep(200);
    const posTap = await position(page);
    check('touch: tap on a lane seeks', near(posTap, timeOfX(g2, tapX), 0.3), `${posTap.toFixed(2)} s`);

    // Dragging in the bars row selects bars.
    g2 = await geo(page);
    const rowY = g2.mesTop + 12;
    await touch('touchStart', [[g2.left + 60, rowY]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[g2.left + 60 + i * 20, rowY]]);
    await touch('touchEnd', []);
    await sleep(200);
    const rg = (await state(page)).loop.region;
    const gbar = (t) => Math.round(((t - g2.first) * g2.bpm) / 60 / g2.beats);
    check('touch: dragging in the bars row selects whole bars', rg && gbar(rg.start) !== gbar(st.loop.region.start) && near(rg.end - rg.start, Math.round((rg.end - rg.start) / ((g2.beats * 60) / g2.bpm)) * ((g2.beats * 60) / g2.bpm), 1e-6), JSON.stringify(rg));

    // Pinch zooms around the fingers.
    g2 = await geo(page);
    const cx = g2.left + 150;
    const anchorT = timeOfX(g2, cx);
    await touch('touchStart', [[cx - 40, laneY], [cx + 40, laneY]]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - 40 - i * 8, laneY], [cx + 40 + i * 8, laneY]]);
    await touch('touchEnd', []);
    await sleep(300);
    const g3 = await geo(page);
    check('touch: pinch zooms (fingers 80 px -> 240 px apart)', g3.pps > g2.pps * 2.5, `${g2.pps.toFixed(1)} -> ${g3.pps.toFixed(1)} px/s`);
    check('touch: pinch keeps the time between the fingers in place', near(timeOfX(g3, cx), anchorT, 0.15), `${timeOfX(g3, cx).toFixed(2)} vs ${anchorT.toFixed(2)}`);
    check('touch: pinch writes the scale to the store (leaves Auto)', near((await state(page)).view.pxPerSecond, g3.pps, 1e-6));
    check('phone: no horizontal page scroll after the gestures', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
