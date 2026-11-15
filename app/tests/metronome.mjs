// The advanced metronome in Chromium (lot 4): the « Clic » switch and its
// panel (volume, count-in, meter and grouping, strong and weak beats folded,
// progressive acceleration folded), what reaches the engine (click track
// levels, volume, acceleration schedule, count-in at play), the step and the
// count-in shown in the transport, the panel inside the window at desktop and
// phone widths, and the settings kept with the piece (persistent profile,
// reload). Uses the silent engine (`?moteur=factice`); the sound itself is
// measured by `test:engine` (sections 19 to 22).
//   npm run build && npm run test:metronome
// Screenshots go to $FABTICE_METRONOME_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_METRONOME_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-metronome-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(query, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  return { page, errors };
}
const ready = (page) => page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const snapshot = (page) => page.evaluate(() => window.__fabtice.engine.snapshot());

/** The panel's box is inside the window and above the transport. */
async function fits(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    // the opening rise (10 px, DESIGN.md) is finished before measuring
    for (const a of el.getAnimations()) a.finish();
    const r = el.getBoundingClientRect();
    const bas = document.querySelector('.bas').getBoundingClientRect();
    return { ok: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= Math.min(innerHeight, bas.top) + 0.5, r: [r.left, r.top, r.right, r.bottom, bas.top].map(Math.round), w: innerWidth };
  }, sel);
}

try {
  // ------------------------------------------------------------ desktop: the panel and what reaches the engine
  {
    const { page, errors } = await open('?demo&analyse=aucune&moteur=factice', { width: 1280, height: 800 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);

    // the one-touch switch is unchanged
    await page.click('button.metronome');
    check('« Clic » switches the click on in one touch', (await state(page)).playback.metronome && (await snapshot(page)).metronome);
    await page.click('button.metronome');
    check('and off again', !(await state(page)).playback.metronome);

    await page.click('[data-testid="clic-reglages"]');
    await page.waitForSelector('[data-testid="panneau-metronome"]');
    const f = await fits(page, '[data-testid="panneau-metronome"]');
    check('metronome panel inside the window, above the transport (1280 × 800)', f.ok, f.r.join(','));
    check('advanced parts folded by default', (await page.locator('[data-testid="temps-rangee"]').count()) === 0 && (await page.locator('[data-testid="acceleration-active"]').count()) === 0);
    await page.screenshot({ path: path.join(out, 'metronome-panel-1280.png') });

    // volume
    await page.locator('[data-testid="clic-volume"]').fill('80');
    check('volume reaches the store and the engine', (await state(page)).metronome.volume === 0.8 && (await snapshot(page)).metronomeVolume === 0.8);

    // count-in: two bars of 4/4 = 8 clicks before the start, at the grid's tempo (110 BPM)
    await page.click('[data-testid="decompte"] button:has-text("2 mesures")');
    check('count-in setting kept', (await state(page)).metronome.countInBars === 2);
    await page.evaluate(() => window.__fabtice.actions.seek(window.__fabtice.store.getState().tempoMap.segments[0].time + (60 / 110) * 8));
    await page.click('button.jouer');
    await sleep(120);
    const snap = await snapshot(page);
    const ci = snap.lastCountIn ?? [];
    const spb = 60 / 110;
    check('Play with a count-in: 8 clicks a beat apart, the last one a beat before the start', ci.length === 8 && Math.abs(Math.max(...ci) - 8 * spb) < 1e-3 && Math.abs(Math.min(...ci) - spb) < 1e-3, ci.map((x) => x.toFixed(3)).join(' '));
    const shown = await page.locator('[data-testid="decompte-en-cours"]').innerText();
    check('the transport says the count-in while the position waits', /décompte · \d/.test(shown), shown);
    await page.click('button.jouer');
    // a press outside the panel (here: Play) closes it, as every panel
    await page.click('[data-testid="clic-reglages"]');

    // meter 7/8 grouped 2+2+3, then 3+2+2
    await page.selectOption('[data-testid="mesure-metrique"]', '7/8');
    let s = await state(page);
    check('7/8 set from the panel (a grid correction)', s.tempoMap.meters[0].meter.numerator === 7 && s.tempoMap.meters[0].meter.denominator === 8);
    const groups = await page.locator('[data-testid="regroupement"] button').allInnerTexts();
    check('7/8 offers its groupings, 2+2+3 first', groups[0] === '2+2+3' && groups.includes('3+2+2') && groups.includes('2+3+2'), groups.join(' | '));
    await page.click('[data-testid="regroupement"] button:has-text("3+2+2")');
    s = await state(page);
    check('grouping 3+2+2 kept with its default accents', JSON.stringify(s.metronome.patterns['7/8']) === JSON.stringify({ grouping: [3, 2, 2], levels: ['accent', 'soft', 'soft', 'normal', 'soft', 'normal', 'soft'] }));
    check('the engine gets the 7/8 click track (accent, soft, normal codes)', (await page.evaluate(() => window.__fabtice.engine.snapshot().clicks)) > 0);

    // strong and weak beats (folded)
    await page.click('[data-testid="temps-forts"]');
    const beats = page.locator('[data-testid="temps-rangee"] button');
    check('one button per beat of 7/8', (await beats.count()) === 7);
    await beats.nth(1).click(); // soft -> silent
    s = await state(page);
    check('a beat cycles to silent', s.metronome.patterns['7/8'].levels[1] === 'silent', s.metronome.patterns['7/8'].levels.join(','));
    await page.screenshot({ path: path.join(out, 'metronome-beats-1280.png') });

    // acceleration (folded)
    await page.evaluate(() => window.__fabtice.actions.setLoopRegion(null));
    await page.click('[data-testid="acceleration"]');
    await page.click('[data-testid="acceleration-active"]');
    check('without a loop, it says the loop is what accelerates', (await page.locator('[data-testid="accel-sans-boucle"]').count()) === 1);
    await page.evaluate(() => {
      const map = window.__fabtice.store.getState().tempoMap;
      const t = (b) => map.segments[0].time + (b * 60) / map.segments[0].bpm;
      window.__fabtice.actions.setLoopRegion({ start: t(0), end: t(7) });
    });
    await page.click('[data-testid="accel-startPercent"] button[aria-label*="plus"]');
    s = await state(page);
    check('start step changes by 5 %', s.metronome.acceleration.startPercent === 75);
    const acc = (await snapshot(page)).acceleration;
    check('the engine gets the steps 75…100 % and the passes per step', acc && acc.factors[0] === 0.75 && acc.factors[acc.factors.length - 1] === 1 && acc.every === 2, JSON.stringify(acc));
    await page.waitForFunction(() => /Palier 1 sur 6/.test(document.querySelector('[data-testid="accel-etat"]')?.textContent ?? ''), null, { timeout: 3000 }).then(() => true, () => false).then((ok) => check('the step is shown (« Palier 1 sur 6 · 75 % »)', ok));
    check('the transport says the step heard', /palier 1\/6 · 75 %/.test(await page.locator('[data-testid="tempo-palier"]').innerText()));
    await page.screenshot({ path: path.join(out, 'metronome-acceleration-1280.png') });

    // the mock engine steps on each wrap: play the 7-eighth loop a few passes
    await page.evaluate(() => window.__fabtice.store.setState((st) => ({ metronome: { ...st.metronome, countInBars: 0 } })));
    await page.evaluate(() => window.__fabtice.actions.seek(window.__fabtice.store.getState().loop.region.start));
    await page.click('button.jouer');
    // the panel opens again with the acceleration unfolded (it is on)
    await page.click('[data-testid="clic-reglages"]');
    const loopSec = await page.evaluate(() => {
      const r = window.__fabtice.store.getState().loop.region;
      return r.end - r.start;
    });
    // steps 0.75 x 2 passes, 0.8 x 2: about 4 passes
    await sleep(((loopSec / 0.75) * 2 + (loopSec / 0.8) * 2) * 1000 + 300);
    const step = (await snapshot(page)).accelerationStep;
    check('after two passes at each of the first two steps, the third step plays', step === 2, `step ${step}`);
    await page.click('.accel-etat button');
    check('« Recommencer » goes back to the first step', (await snapshot(page)).accelerationStep === 0);
    await page.evaluate(() => window.__fabtice.actions.pause());

    // Escape closes the panel
    await page.keyboard.press('Escape');
    check('Escape closes the panel', (await page.locator('[data-testid="panneau-metronome"]').count()) === 0);
    check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ smaller windows and the phone
  for (const vp of [{ width: 960, height: 640 }, { width: 390, height: 844 }]) {
    const { page, errors } = await open('?demo&moteur=factice', vp);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.click('[data-testid="clic-reglages"]');
    await page.click('[data-testid="acceleration"]');
    await page.click('[data-testid="temps-forts"]');
    await sleep(150);
    const f = await fits(page, '[data-testid="panneau-metronome"]');
    check(`metronome panel inside the window at ${vp.width} × ${vp.height}`, f.ok, f.r.join(','));
    // the last control can be reached (the panel scrolls when the window is low)
    await page.locator('[data-testid="accel-targetPercent"] button').last().scrollIntoViewIfNeeded();
    await page.locator('[data-testid="accel-targetPercent"] button').last().click();
    check(`last control usable at ${vp.width} × ${vp.height}`, (await state(page)).metronome.acceleration.targetPercent === 105);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check(`the page does not scroll sideways at ${vp.width}`, scroll);
    await page.screenshot({ path: path.join(out, `metronome-panel-${vp.width}.png`) });
    check(`no page errors at ${vp.width}`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ kept with the piece (persistent profile, reload)
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-metronome-profile-'));
    const context = await chromium.launchPersistentContext(dir, { args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${url}/?debug&moteur=factice`);
    await page.waitForFunction(() => window.__fabtice !== undefined);
    const wav = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'tone.wav'));
    await page.locator(".accueil input[type=\"file\"]").setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav });
    await ready(page);
    await page.evaluate(() => {
      const st = window.__fabtice.store;
      st.setState((s) => ({
        metronome: { ...s.metronome, volume: 0.3, countInBars: 1, patterns: { '5/4': { grouping: [2, 3], levels: ['accent', 'soft', 'normal', 'soft', 'silent'] } }, acceleration: { enabled: true, startPercent: 60, stepPercent: 10, everyRepeats: 3, targetPercent: 90 } },
      }));
    });
    await sleep(1600); // autosave (0.7 s after the store calms down)
    await page.reload();
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project !== null, null, { timeout: 15000 });
    const m = (await state(page)).metronome;
    check(
      'metronome settings kept with the piece and found again after a reload',
      m.volume === 0.3 && m.countInBars === 1 && m.patterns['5/4']?.levels[4] === 'silent' && m.acceleration.enabled && m.acceleration.everyRepeats === 3 && m.acceleration.targetPercent === 90,
      JSON.stringify(m),
    );
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll metronome checks passed');
process.exit(failed ? 1 : 0);
