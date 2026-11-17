// The bar menu's manual tempo actions in Chromium, with the REAL analyser:
//   npm run build && npm run test:tempo-fix
//
// The demo piece (web/spikes/analyse/demo/demo-swing.mp3) is imported and
// analysed for real, in a persistent profile. Then a wrong detection is
// planted in the grid as the analysis gives it: bars 5 to 8 at half tempo
// (every other beat gone), the owner's « tempo lu à la moitié ». The network's
// outputs are the real ones (kept by the analyser), so the actions compute
// from what the network heard:
//   - right click on bar 5 in the ruler: the menu, with exactly the two
//     entries; « Corriger un changement de tempo indésirable »: the beats of
//     bars 5–8 are back, nothing before bar 5 moved, the curve has no dip; the
//     brass mark on the ruler; the chords from bar 5 are decoded again;
//   - reload (persistent profile): the correction is still there; the kept
//     outputs are gone, so an action runs the networks once again (progress
//     shown) and still works;
//   - « Revenir à l'analyse » from the menu at the mark: the grid as it was;
//   - « Réanalyser le tempo à partir de cette mesure » on the planted grid;
//   - the chord chart: right click on a bar, the keyboard (Shift+F10), Escape;
//   - a phone (390 × 844): the menu from the keyboard, inside the window.
// Screenshots go to $FABTICE_TEMPO_FIX_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const SWING = path.join(repo, 'web/spikes/analyse/demo/demo-swing.mp3');

const out = process.env.FABTICE_TEMPO_FIX_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-tempo-fix-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (text) => console.log(`NOTE  ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-tempo-fix-profile-'));
const QUERY = '?debug&moteur=factice&analyse=reel';
const BAR = 4; // index: shown as « 5 »
const BARS = 4; // planted at half tempo

async function launch(viewport = { width: 1280, height: 800 }) {
  const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], viewport });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${QUERY}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  return { context, page, errors };
}

/** Beats of the grid in force (integer beats of the tempo map), and its bar tempi. */
const grid = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    const segs = s.tempoMap.segments;
    const times = segs.map((x) => x.time);
    const last = segs[segs.length - 1];
    times.push(last.time + 60 / last.bpm);
    const first = segs.findIndex((x) => Math.abs(x.beat) < 1e-6);
    const m = s.tempoMap.meters[0].meter.numerator;
    const tempi = [];
    for (let i = first; i + m < times.length; i += m) tempi.push((60 * m) / (times[i + m] - times[i]));
    return { times, first, m, tempi, origin: s.tempoMap.origin, fixes: s.corrections.tempoFixes.map((f) => [f.time, f.kind]), run: s.analysisRun.status };
  });

/** Plants bars BAR … BAR+BARS−1 at half tempo in the analysis and in the grid (origin `analysis`). */
async function plant(page) {
  await page.evaluate(([bar, bars]) => {
    const st = window.__fabtice.store;
    const s = st.getState();
    const b = s.analysis.beats;
    const m = b.meter.numerator;
    const i0 = b.downbeat + bar * m;
    const times = b.times.filter((_, i) => i <= i0 || i >= i0 + bars * m || (i - i0) % 2 === 0);
    const segments = [];
    for (let i = 0; i + 1 < times.length; i++) segments.push({ time: times[i], beat: i - b.downbeat, bpm: 60 / (times[i + 1] - times[i]) });
    const map = { origin: 'analysis', segments, meters: [{ bar: 0, beat: 0, meter: { ...b.meter } }] };
    st.setState({ analysis: { ...s.analysis, beats: { ...b, times } }, tempoMap: map, corrections: { ...s.corrections, tempoFixes: [] } });
  }, [BAR, BARS]);
}

/** Viewport point of a bar line in the ruler's bars row (the view starts at 0: Auto is on). */
const rulerPoint = (page, bar) =>
  page.evaluate((b) => {
    const s = window.__fabtice.store.getState();
    const segs = s.tempoMap.segments;
    const m = s.tempoMap.meters[0].meter.numerator;
    const seg = segs.find((x) => Math.abs(x.beat - b * m) < 1e-6);
    const r = document.querySelector('.frise').getBoundingClientRect();
    const row = document.querySelector('.frise-rang.mesures').getBoundingClientRect();
    return { x: r.left + seg.time * s.view.pxPerSecond + 12, y: row.top + row.height / 2 };
  }, bar);

const near = (a, b, tol = 0.07) => Math.abs(a - b) <= tol;
/** Share of `want` beats (in [from, to]) found in `got` within 70 ms. */
const found = (want, got, from, to) => {
  const w = want.filter((t) => t >= from && t <= to);
  return w.filter((t) => got.some((g) => near(g, t))).length / Math.max(1, w.length);
};

async function waitIdle(page, timeout = 240000) {
  await page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status !== 'running', null, { timeout, polling: 100 });
}

async function menuAt(page, bar) {
  const p = await rulerPoint(page, bar);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 5000 });
}

try {
  // ------------------------------------------------------------ import, analyse for real, plant the error
  let analysed;
  {
    const { context, page, errors } = await launch();
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await page.waitForFunction(() => window.__fabtice.store.getState().analysis, null, { timeout: 240000, polling: 200 });
    await waitIdle(page);
    analysed = await grid(page);
    note(`analysed: ${analysed.times.length} beats, ${analysed.m}/4`);
    await plant(page);
    const planted = await grid(page);
    const i0 = planted.first + BAR * planted.m;
    const t0 = planted.times[i0];
    const t1 = analysed.times[analysed.first + (BAR + BARS) * analysed.m];
    const dip = Math.min(...planted.tempi.slice(BAR, BAR + BARS)) / Math.max(...planted.tempi.slice(0, BAR));
    check('planted: bars 5–8 at half tempo (the curve dips to half)', dip < 0.6, dip.toFixed(2));

    // The menu from the ruler.
    await menuAt(page, BAR);
    const entries = await page.locator('[data-testid="menu-tempo"] [role="menuitem"] > span').allInnerTexts();
    check('right click on bar 5 of the ruler: the menu with exactly the five entries', entries.join(' | ') === 'Corriger un changement de tempo indésirable | Réanalyser le tempo à partir de cette mesure | Correction de la courbe en tapant le tempo | Changer la signature rythmique | Changer de tonalité à partir de cette mesure…', entries.join(' | '));
    const label = await page.locator('[data-testid="menu-tempo"] .libelle').innerText();
    check('the menu is for bar 5', label.includes('5'), label);
    const hints = await page.locator('[data-testid="menu-tempo"] .option small').allInnerTexts();
    check('one line of explanation under each entry', hints.length === 5 && hints.every((h) => h.length > 20));
    const inWindow = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="menu-tempo"]').getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    });
    check('the menu is inside the window', inWindow);
    await page.screenshot({ path: path.join(out, 'menu-ruler-1280.png') });

    await page.click('[data-action="continuity"]');
    await page.waitForFunction(() => window.__fabtice.store.getState().corrections.tempoFixes.length === 1, null, { timeout: 60000 });
    await waitIdle(page);
    const fixed = await grid(page);
    check('« Corriger »: kept as a correction by hand, at bar 5', fixed.origin === 'corrected' && fixed.fixes.length === 1 && near(fixed.fixes[0][0], t0, 1e-3) && fixed.fixes[0][1] === 'continuity', JSON.stringify(fixed.fixes));
    check('« Corriger »: nothing before bar 5 moved', planted.times.slice(0, i0).every((t, i) => t === fixed.times[i]));
    const back = found(analysed.times, fixed.times, t0, t1);
    check('« Corriger »: the beats of bars 5–8 are back (70 ms)', back >= 0.95, `${(100 * back).toFixed(0)} %`);
    const worst = Math.min(...fixed.tempi) / Math.max(...fixed.tempi);
    check('« Corriger »: the curve has no dip any more', worst > 0.8, worst.toFixed(2));
    const chordsAfter = await page.evaluate((t) => window.__fabtice.store.getState().analysis.chords.filter((c) => c.time >= t).length, t0);
    check('the chords from bar 5 are there (decoded on the new grid)', chordsAfter > 0, String(chordsAfter));
    await sleep(300);
    await page.screenshot({ path: path.join(out, 'after-continuity-1280.png') });
    check('no console error (import, actions)', errors.length === 0, errors.join(' | '));
    await page.waitForTimeout(1500); // the autosave
    await context.close();
  }

  // ------------------------------------------------------------ reload: still there; undo; the fresh action without kept outputs
  {
    const { context, page, errors } = await launch();
    await page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().analysis, null, { timeout: 30000 });
    const kept = await grid(page);
    check('reload: the manual tempo correction is still there', kept.origin === 'corrected' && kept.fixes.length === 1, JSON.stringify(kept.fixes));
    await sleep(500);
    await page.screenshot({ path: path.join(out, 'reloaded-mark-1280.png') });

    await menuAt(page, BAR);
    const undo = await page.locator('[data-action="undo"] span').innerText().catch(() => '');
    check('at the mark, the menu offers « Revenir à l’analyse »', undo === 'Revenir à l’analyse', undo);
    await page.click('[data-action="undo"]');
    const undone = await grid(page);
    check('« Revenir à l’analyse »: the grid as it was (the planted one), no correction left', undone.fixes.length === 0 && undone.times.length === kept.times.length - BARS * kept.m / 2, `${undone.times.length} beats`);

    // The networks' outputs are not kept across a reload: the action runs them once again.
    const steps = [];
    await page.exposeFunction('__step', (s) => steps.push(s));
    await page.evaluate(() => window.__fabtice.store.subscribe((s) => s.analysisRun.status === 'running' && window.__step(s.analysisRun.step + (s.analysisRun.tempoBar !== undefined ? `@${s.analysisRun.tempoBar}` : ''))));
    await menuAt(page, BAR);
    await page.click('[data-action="fresh"]');
    await page.waitForFunction(() => window.__fabtice.store.getState().corrections.tempoFixes.length === 1, null, { timeout: 240000, polling: 200 });
    await waitIdle(page);
    const uniq = [...new Set(steps)];
    check('after a reload the networks run once again, with the usual steps', uniq.some((s) => s.startsWith('beats@4')), uniq.join(', '));
    const status = await page.evaluate(() => window.__fabtice.store.getState().analysisRun.status);
    check('then the status is idle', status === 'idle', status);
    const fresh = await grid(page);
    const i0 = fresh.first + BAR * fresh.m;
    const t0 = fresh.times[i0];
    const t1 = analysed.times[analysed.first + (BAR + BARS) * analysed.m];
    check('« Réanalyser »: nothing before bar 5 moved', undone.times.slice(0, i0).every((t, i) => t === fresh.times[i]));
    const back = found(analysed.times, fresh.times, t0, t1);
    check('« Réanalyser »: the beats of bars 5–8 found again from what the network heard', back >= 0.95, `${(100 * back).toFixed(0)} %`);
    const freshWorst = Math.min(...fresh.tempi) / Math.max(...fresh.tempi);
    check('« Réanalyser »: the curve has no dip any more', freshWorst > 0.8, `${freshWorst.toFixed(2)}; ${fresh.times.length} beats; tempi ${fresh.tempi.map((x) => x.toFixed(0)).join(' ')}`);

    // The chart: right click on a bar, Escape; the keyboard from a chord.
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('[data-mesure="6"]');
    const cell = await page.locator('[data-mesure="6"]').boundingBox();
    await page.mouse.click(cell.x + cell.width - 6, cell.y + cell.height - 6, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-tempo"]');
    const chartLabel = await page.locator('[data-testid="menu-tempo"] .libelle').innerText();
    check('chart: right click on a bar opens the menu for that bar', chartLabel.includes('7'), chartLabel);
    await page.screenshot({ path: path.join(out, 'menu-chart-1280.png') });
    await page.keyboard.press('Escape');
    check('Escape closes it', (await page.locator('[data-testid="menu-tempo"]').count()) === 0);
    const mark = await page.locator('[data-mesure="4"] .numero.tempo-corrige').count();
    check('chart: the bar where the correction starts is marked', mark === 1);
    await page.locator('[data-mesure="2"] [data-stop]').first().focus();
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('[data-testid="menu-tempo"]');
    const keyLabel = await page.locator('[data-testid="menu-tempo"] .libelle').innerText();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-action'));
    check('chart: Shift+F10 on a chord opens the menu for its bar, its first entry focused', keyLabel.includes('3') && focused === 'continuity', `${keyLabel} / ${focused}`);
    await page.keyboard.press('Escape');
    check('no console error (reload, chart)', errors.length === 0, errors.join(' | '));
    await page.waitForTimeout(1500); // the autosave
    await context.close();
  }

  // ------------------------------------------------------------ a phone: the menu inside the window
  {
    const { context, page, errors } = await launch({ width: 390, height: 844 });
    await page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().analysis, null, { timeout: 30000 });
    await page.evaluate(() => window.__fabtice.actions.setViewMode('pistes'));
    await sleep(400);
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 5000 });
    const r = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="menu-tempo"]');
      for (const a of el.getAnimations()) a.finish();
      const b = el.getBoundingClientRect();
      return [b.left, b.top, b.right, b.bottom].map(Math.round);
    });
    check('phone: the menu (keyboard, bar under the playhead) is inside the window', r[0] >= 0 && r[1] >= 0 && r[2] <= 390 && r[3] <= 844, r.join(','));
    await page.screenshot({ path: path.join(out, 'menu-phone-390.png') });
    check('no console error (phone)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  // ------------------------------------------------------------ the tapped correction (C12), through its contract
  {
    const { context, page, errors } = await launch();
    await page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().analysis, null, { timeout: 30000 });
    await plant(page);
    const planted = await grid(page);
    const i0 = planted.first + BAR * planted.m;
    const t0 = planted.times[i0];
    const t1 = analysed.times[analysed.first + (BAR + BARS) * analysed.m];
    // A tapper 40 ms late, ±30 ms, one tap forgotten, from bar 5 to one bar after the planted passage.
    const want = analysed.times.filter((t) => t >= t0 - 0.01 && t <= t1 + (analysed.m * (t1 - t0)) / (BARS * analysed.m) + 0.01);
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const taps = want.map((t) => t + 0.04 + 0.06 * rnd()).filter((_, i) => i !== 7);
    const modifiedBefore = await page.evaluate(() => window.__fabtice.history.isModified());
    const preview = await page.evaluate(([bar, x]) => window.__fabtice.tapFix.previewTappedFix(bar, x).then((p) => ('refused' in p ? p : { end: p.end, from: p.from, reading: p.reading, ok: true })), [BAR, taps]);
    check('tapped: the passage is computed from the taps', preview.ok === true, JSON.stringify(preview));
    await waitIdle(page);
    const shown = await page.evaluate(async ([bar, x]) => {
      const t = window.__fabtice.tapFix;
      const p = await t.previewTappedFix(bar, x);
      if ('refused' in p) return null;
      window.__tapped = p;
      t.showTappedPreview(p);
      const s = window.__fabtice.store.getState();
      return { candidate: s.tempoMap === p.tempoMap, canUndo: window.__fabtice.history.canUndo(), modified: window.__fabtice.history.isModified() };
    }, [BAR, taps]);
    const candidate = await grid(page);
    check('tapped: shown for listening, the candidate grid is the grid the views read', shown?.candidate === true);
    check('tapped: listening is no undo step and marks nothing modified', shown?.modified === modifiedBefore, JSON.stringify(shown));
    check('tapped: nothing before bar 5 moved', planted.times.slice(0, i0).every((t, i) => t === candidate.times[i]));
    const back = found(analysed.times, candidate.times, t0, t1);
    check('tapped: the beats of bars 5–8 are back (70 ms)', back >= 0.95, `${(100 * back).toFixed(0)} %, offset ${(1000 * preview.reading.offset).toFixed(0)} ms, filled ${preview.reading.filled}`);
    const worst = Math.min(...candidate.tempi) / Math.max(...candidate.tempi);
    check('tapped: the curve has no dip any more', worst > 0.8, worst.toFixed(2));
    await page.evaluate(() => window.__fabtice.tapFix.discardTappedPreview());
    const discarded = await grid(page);
    check('tapped: discarded, the grid in force is back beat for beat', discarded.times.length === planted.times.length && discarded.times.every((t, i) => t === planted.times[i]));
    await page.evaluate(() => window.__fabtice.tapFix.commitTappedFix(window.__tapped));
    const kept = await grid(page);
    check('tapped: kept as one manual tempo action at bar 5', kept.fixes.length === 1 && kept.fixes[0][1] === 'tapped' && near(kept.fixes[0][0], t0, 1e-3), JSON.stringify(kept.fixes));
    const undone = await page.evaluate(() => {
      window.__fabtice.history.undo();
      return window.__fabtice.store.getState().corrections.tempoFixes.length;
    });
    check('tapped: one undo gives the grid before back', undone === 0 && (await grid(page)).times.every((t, i) => t === planted.times[i]));
    check('no console error (tapped correction)', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.stack || e}`);
} finally {
  srv.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
