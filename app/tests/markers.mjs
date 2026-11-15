// Repères in Chromium (lot 4): named loops (keep the loop, recall, rename,
// reorder, delete), sections (the chart's letters: listed, looped, added,
// renamed, deleted, and the same in the chord chart), the ruler's markers row
// (click to recall), keyboard use, the panel inside the window on a phone,
// and everything kept with the piece (persistent profile, reload). Uses the
// silent engine (`?moteur=factice`).
//   npm run build && npm run test:markers
// Screenshots go to $FABTICE_MARKERS_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));

const out = process.env.FABTICE_MARKERS_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-markers-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });

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
const near = (a, b) => Math.abs(a - b) < 1e-6;

async function fits(page, sel) {
  await sleep(300); // panels rise 10 px as they open
  return page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    const bas = document.querySelector('.bas').getBoundingClientRect();
    return { ok: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= Math.min(innerHeight, bas.top) + 0.5, r: [r.left, r.top, r.right, r.bottom, bas.top].map(Math.round) };
  }, sel);
}

try {
  // ------------------------------------------------------------ desktop: named loops, sections, ruler, keyboard
  {
    const { page, errors } = await open('?demo&moteur=factice', { width: 1280, height: 800 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);

    // the demo's sections A, B, A are on the ruler's markers row
    await page.waitForSelector('button.frise-repere.section');
    const rulerSections = await page.locator('button.frise-repere.section').allInnerTexts();
    check('the ruler shows the sections (the chart letters A, B, A)', rulerSections.join(',') === 'A,B,A', rulerSections.join(','));

    await page.click('[data-testid="reperes"]');
    await page.waitForSelector('[data-testid="panneau-reperes"]');
    let f = await fits(page, '[data-testid="panneau-reperes"]');
    check('markers panel inside the window, above the transport (1280 × 800)', f.ok, f.r.join(','));
    const sec = await page.locator('[data-testid="liste-sections"] .repere-section').allInnerTexts();
    check('the panel lists the same sections', sec.join(',') === 'A,B,A');
    await page.screenshot({ path: path.join(out, 'markers-panel-empty-1280.png') });

    // keep the demo loop (bars 5–8)
    const loop1 = (await state(page)).loop.region;
    await page.click('[data-testid="garder-boucle"]');
    let s = await state(page);
    check('« Garder cette boucle » keeps the loop under « Boucle 1 », in seconds', s.markers.loops.length === 1 && s.markers.loops[0].name === 'Boucle 1' && near(s.markers.loops[0].region.start, loop1.start) && near(s.markers.loops[0].region.end, loop1.end));
    check('the panel says this loop is kept', /gardée/.test(await page.locator('[data-testid="panneau-reperes"]').innerText()));

    // a loop that is not whole bars (free edges), kept too
    await page.evaluate(() => window.__fabtice.actions.setLoopRegion({ start: 21.123, end: 24.456 }));
    await page.click('[data-testid="garder-boucle"]');
    s = await state(page);
    check('a free loop is kept exactly (seconds, not bars)', s.markers.loops.length === 2 && s.markers.loops[1].name === 'Boucle 2' && near(s.markers.loops[1].region.start, 21.123) && near(s.markers.loops[1].region.end, 24.456));

    // recall the first one from the list: loop set and on, playhead brought inside (the rule of any new loop)
    await page.evaluate(() => window.__fabtice.actions.seek(40));
    await page.locator('[data-testid="liste-boucles"] .repere-rappel').first().click();
    s = await state(page);
    const pos = await page.evaluate(() => window.__fabtice.engine.getPosition());
    check('recalling « Boucle 1 » sets the loop and switches it on', s.loop.enabled && near(s.loop.region.start, loop1.start) && near(s.loop.region.end, loop1.end));
    check('the playhead goes to the loop start (it was outside)', near(pos, loop1.start), String(pos));

    // the ruler: two named loops, one marked current; a click on the second recalls it
    await page.keyboard.press('Escape');
    await page.waitForSelector('button.frise-repere.loop');
    const loopsOnRuler = await page.locator('button.frise-repere.loop').count();
    check('the ruler shows the named loops', loopsOnRuler === 2, String(loopsOnRuler));
    check('the current one is marked', (await page.locator('button.frise-repere.loop.courant').count()) === 1);
    await page.locator('button.frise-repere.loop[aria-label*="Boucle 2"]').click();
    s = await state(page);
    check('a click on a loop of the ruler recalls it', near(s.loop.region.start, 21.123) && near(s.loop.region.end, 24.456));
    // a click on section B loops it, from its bar line to the next section's
    await page.locator('button.frise-repere.section:has-text("B")').click();
    s = await state(page);
    const b = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      const secs = st.corrections.sections;
      return { start: secs[1].time, end: secs[2].time };
    });
    check('a click on section B of the ruler loops section B', Math.abs(s.loop.region.start - b.start) < 0.05 && Math.abs(s.loop.region.end - b.end) < 0.05, `${s.loop.region.start.toFixed(2)}–${s.loop.region.end.toFixed(2)} vs ${b.start.toFixed(2)}–${b.end.toFixed(2)}`);
    await page.screenshot({ path: path.join(out, 'markers-ruler-1280.png') });

    // editing: rename, reorder, delete
    await page.click('[data-testid="reperes"]');
    await page.click('[data-testid="reperes-modifier"]');
    const field = page.locator('[data-testid="liste-boucles"] .repere-champ').first();
    await field.fill('Pont');
    await field.press('Enter');
    s = await state(page);
    check('rename « Boucle 1 » to « Pont »', s.markers.loops[0].name === 'Pont');
    await page.click('[data-testid="liste-boucles"] button[aria-label="Descendre « Pont »"]');
    s = await state(page);
    check('move « Pont » down: the list keeps the user’s order', s.markers.loops.map((l) => l.name).join(',') === 'Boucle 2,Pont');
    await page.screenshot({ path: path.join(out, 'markers-edit-1280.png') });
    await page.click('[data-testid="liste-boucles"] button[aria-label="Supprimer « Boucle 2 »"]');
    s = await state(page);
    check('delete « Boucle 2 »', s.markers.loops.map((l) => l.name).join(',') === 'Pont');

    // sections: a new one where the loop starts (section B's loop is set: on B's bar, so set another loop first)
    await page.click('[data-testid="reperes-modifier"]');
    const bar21 = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      return st.corrections.sections.length;
    });
    await page.evaluate(() => {
      // bars 21–24 of the demo (between the last A and the end)
      const st = window.__fabtice.store.getState();
      const segs = st.tempoMap.segments;
      const last = st.corrections.sections[st.corrections.sections.length - 1].time;
      window.__fabtice.actions.setLoopRegion({ start: last + 8 * (60 / segs[segs.length - 1].bpm) * 4, end: last + 9 * (60 / segs[segs.length - 1].bpm) * 4 });
    });
    await page.click('[data-testid="nouvelle-section"]');
    s = await state(page);
    check('« Nouvelle section ici » adds the next free letter (C) at the loop start', s.corrections.sections.length === bar21 + 1 && s.corrections.sections.some((x) => x.label === 'C'));
    await page.click('[data-testid="reperes-modifier"]');
    const cField = page.locator('[data-testid="liste-sections"] .repere-champ[aria-label="Nom de la section C"]');
    await cField.fill('Solo');
    await cField.press('Enter');
    s = await state(page);
    check('rename section C to « Solo »', s.corrections.sections.some((x) => x.label === 'Solo') && !s.corrections.sections.some((x) => x.label === 'C'));
    await page.click('[data-testid="reperes-modifier"]');

    // the chord chart shows the same sections (one notion)
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('.case .section');
    const chartSections = await page.locator('.case .section').allInnerTexts();
    check('the chord chart shows the same sections, « Solo » included', chartSections.join(',') === 'A,B,A,Solo', chartSections.join(','));
    await page.evaluate(() => window.__fabtice.actions.setViewMode('pistes'));

    // keyboard: the list is reached with Tab, arrows move, Enter recalls
    await page.click('[data-testid="reperes"]');
    await page.locator('[data-testid="liste-sections"] .repere-rappel').first().focus();
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
    check('arrow down moves to the next section', /section B/.test(focused), focused);
    await page.keyboard.press('Enter');
    s = await state(page);
    check('Enter recalls it', Math.abs(s.loop.region.start - b.start) < 0.05);
    await page.keyboard.press('Escape');
    check('Escape closes the panel', (await page.locator('[data-testid="panneau-reperes"]').count()) === 0);

    // delete the section from the panel
    await page.click('[data-testid="reperes"]');
    await page.click('[data-testid="reperes-modifier"]');
    await page.click('[data-testid="liste-sections"] button[aria-label="Supprimer la section Solo"]');
    s = await state(page);
    check('delete the section « Solo »', !s.corrections.sections.some((x) => x.label === 'Solo') && s.corrections.sections.length === 3);
    check('no page errors (desktop)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ phone
  {
    const { page, errors } = await open('?demo&moteur=factice', { width: 390, height: 844 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__fabtice.store.setState((s) => ({
        markers: { loops: [{ id: 'a', name: 'Thème', region: { start: 8, end: 16 } }, { id: 'b', name: 'Solo de trompette, deuxième chorus', region: { start: 30, end: 38 } }] },
      }));
    });
    await page.click('[data-testid="reperes"]');
    const f = await fits(page, '[data-testid="panneau-reperes"]');
    check('markers panel inside the window on a phone (390 × 844)', f.ok, f.r.join(','));
    check('the page does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'markers-panel-390.png') });
    await page.locator('[data-testid="liste-boucles"] .repere-rappel').nth(1).tap().catch(() => page.locator('[data-testid="liste-boucles"] .repere-rappel').nth(1).click());
    const s = await state(page);
    check('a touch on a name recalls the loop (phone)', near(s.loop.region.start, 30) && near(s.loop.region.end, 38));
    check('no page errors (phone)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ kept with the piece (persistent profile, reload)
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-markers-profile-'));
    const context = await chromium.launchPersistentContext(dir, { args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${url}/?debug&moteur=factice`);
    await page.waitForFunction(() => window.__fabtice !== undefined);
    const wav = fs.readFileSync(path.join(here, 'fixtures', 'tone.wav'));
    await page.locator('.accueil input[type="file"]').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav });
    await ready(page);
    const duration = (await state(page)).project.duration;
    await page.evaluate((d) => window.__fabtice.actions.setLoopRegion({ start: d * 0.2, end: d * 0.6 }), duration);
    await page.click('[data-testid="reperes"]');
    await page.click('[data-testid="garder-boucle"]');
    await page.click('[data-testid="reperes-modifier"]');
    const field = page.locator('[data-testid="liste-boucles"] .repere-champ').first();
    await field.fill('Couplet');
    await field.press('Enter');
    await page.click('[data-testid="reperes-modifier"]');
    await page.click('[data-testid="nouvelle-section"]');
    const before = await state(page);
    await sleep(1600); // autosave
    await page.reload();
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project !== null, null, { timeout: 15000 });
    const after = await state(page);
    check(
      'named loop and section kept with the piece and found again after a reload',
      after.markers.loops.length === 1 && after.markers.loops[0].name === 'Couplet' && near(after.markers.loops[0].region.start, before.markers.loops[0].region.start) && after.corrections.sections.length === 1 && after.corrections.sections[0].label === 'A',
      JSON.stringify({ loops: after.markers.loops, sections: after.corrections.sections }),
    );
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll markers checks passed');
process.exit(failed ? 1 : 0);
