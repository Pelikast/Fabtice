// Stage 5, the harmony pass in Chromium, in both forms (a computer 1280 × 800, a phone 390 × 844), on the demo
// piece with the app's own detectors (`structure/refresh.ts` and `structure/index.ts`, no stand-in):
//   - a chord written by hand triggers a refresh (its input has the hand chord), undo and redo still go step by step;
//   - eight bars of E major written by hand in the A♭ piece: the modulation is detected there and back, the chords of
//     the passage are spelled in E on the chart, the transport says the key of the place being played, before and after
//     the playhead crosses the change;
//   - a modulation by hand (`window.__fabtice.lot2.key`) respells the chords after it and moves the transport's key;
//   - « Détecter les modulations » and « Structure automatique du morceau » switch the detection off and on.
//   npm run build && npm run test:harmony
// Screenshots go to $FABTICE_HARMONY_OUT (default: a temporary folder). Uses the silent engine.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_HARMONY_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-harmony-'));
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

/** Waits until the harmony pass has nothing pending (its debounce included). */
const settled = (page) => page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 50));
  await window.__fabtice.harmony.settled();
});
const barText = (page, bar) => page.locator(`[data-testid="grille"] [data-mesure="${bar}"]`).first().innerText().then((s) => s.replace(/\s+/g, ' ').trim());
const keyDetail = (page) => page.locator('[data-testid="ton-detail"]').innerText().then((s) => s.trim());
const barStart = (page, bar) => page.evaluate((b) => {
  const f = window.__fabtice;
  const s = f.store.getState();
  return f.lot4.tempoMap.barStartTime(s.tempoMap, b);
}, bar);

async function open(form) {
  const phone = form === 'phone';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/?demo&moteur=factice&vue=grille`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[data-testid="grille"] [data-mesure="14"]', { timeout: 15000 });
  await settled(page);
  return { page, context, errors, phone };
}

async function suite(form) {
  const tag = form;
  const h = await open(form);
  const { page } = h;

  // ---------------------------------------------------- the pass runs on the demo piece
  let r = await page.evaluate(() => {
    const f = window.__fabtice;
    const input = f.harmony.lastInput();
    const s = f.store.getState();
    return { has: !!input, bars: input?.bars.length ?? 0, key: input?.key ?? null, suspended: f.harmony.suspended(), keyChanges: s.analysis.keyChanges.length, canUndo: f.history.canUndo(), modified: f.history.isModified() };
  });
  check(`${tag}: the harmony pass ran on the opened piece (its bars, its key A♭)`, r.has && r.bars >= 24 && r.key?.tonic === 8 && !r.suspended, JSON.stringify(r));
  check(`${tag}: no modulation in the demo piece, nothing to undo, not modified`, r.keyChanges === 0 && !r.canUndo && !r.modified, JSON.stringify(r));

  // ---------------------------------------------------- a chord by hand: a refresh, undo step by step
  const chordOf = (root, quality) => ({ root, quality, extensions: [], bass: null });
  await page.evaluate((c) => window.__fabtice.lot2.harmony.setBarChords(2, [{ beatInBar: 0, chord: c }]), chordOf(2, 'min7'));
  await page.evaluate((c) => window.__fabtice.lot2.harmony.setBarChords(3, [{ beatInBar: 0, chord: c }]), chordOf(7, '7'));
  check(`${tag}: a refresh is pending right after the edit (debounced)`, await page.evaluate(() => window.__fabtice.harmony.pending()));
  await settled(page);
  r = await page.evaluate(() => {
    const f = window.__fabtice;
    const bars = f.harmony.lastInput().bars;
    const b2 = bars.find((b) => b.bar === 2);
    const b3 = bars.find((b) => b.bar === 3);
    return { b2: b2.chords[0], b3: b3.chords[0], label: f.history.undoLabel() };
  });
  check(`${tag}: the refresh read the hand chords (trusted)`, r.b2?.byHand && r.b2.chord.root === 2 && r.b3?.byHand && r.b3.chord.root === 7, JSON.stringify(r));
  check(`${tag}: the edits are steps (« Annuler : accords »)`, /accord/i.test(r.label ?? ''), String(r.label));
  await page.evaluate(() => window.__fabtice.history.undo());
  await settled(page);
  r = await page.evaluate(() => {
    const f = window.__fabtice;
    const bars = f.harmony.lastInput().bars;
    return { b2: bars.find((b) => b.bar === 2).chords[0], b3: bars.find((b) => b.bar === 3).chords[0], canUndo: f.history.canUndo(), canRedo: f.history.canRedo() };
  });
  check(`${tag}: undo gives back the last chord only, the pass ran again on it`, r.b2?.byHand && r.b2.chord.root === 2 && !r.b3?.byHand && r.canUndo && r.canRedo, JSON.stringify(r));
  await page.evaluate(() => window.__fabtice.history.undo());
  await settled(page);
  r = await page.evaluate(() => {
    const f = window.__fabtice;
    const bars = f.harmony.lastInput().bars;
    return { b2: bars.find((b) => b.bar === 2).chords[0], canUndo: f.history.canUndo(), canRedo: f.history.canRedo() };
  });
  check(`${tag}: a second undo gives back the first one; nothing left to undo`, !r.b2?.byHand && !r.canUndo && r.canRedo, JSON.stringify(r));
  await page.evaluate(() => window.__fabtice.history.redo());
  await settled(page);
  check(`${tag}: redo puts it back`, await page.evaluate(() => window.__fabtice.harmony.lastInput().bars.find((b) => b.bar === 2).chords[0].byHand === true));
  await page.evaluate(() => window.__fabtice.history.undo());
  await settled(page);

  // ---------------------------------------------------- eight bars in E: a detected modulation, spelled in E
  check(`${tag}: before: bar 15 written in A♭ (B♭m7 E♭7)`, (await barText(page, 14)).includes('B♭'), await barText(page, 14));
  await page.evaluate(() => {
    const f = window.__fabtice;
    const c = (root, quality) => ({ root, quality, extensions: [], bass: null });
    const inE = [[c(4, 'maj7')], [c(1, 'min7')], [c(6, 'min7')], [c(11, '7')], [c(4, 'maj7')], [c(1, 'min7')], [c(6, 'min7'), c(11, '7')], [c(4, 'maj7')]];
    inE.forEach((list, i) => f.lot2.harmony.setBarChords(8 + i, list.map((x, j) => ({ beatInBar: j * 2, chord: x }))));
  });
  await settled(page);
  r = await page.evaluate(() => {
    const f = window.__fabtice;
    const s = f.store.getState();
    const map = s.tempoMap;
    return {
      changes: s.analysis.keyChanges.map((c) => ({ bar: c.time, tonic: c.key.tonic, mode: c.key.mode })),
      at8: f.lot4.tempoMap.barStartTime(map, 8),
      at16: f.lot4.tempoMap.barStartTime(map, 16),
      canUndo: f.history.canUndo(),
    };
  });
  const near = (a, b) => Math.abs(a - b) < 0.01;
  check(
    `${tag}: the modulation is detected on the bar lines: to E at bar 9, back to A♭ at bar 17`,
    r.changes.length === 2 && near(r.changes[0].bar, r.at8) && r.changes[0].tonic === 4 && near(r.changes[1].bar, r.at16) && r.changes[1].tonic === 8,
    JSON.stringify(r),
  );
  check(`${tag}: the chords of the passage are spelled in E on the chart (C♯m7, not D♭m7)`, (await barText(page, 9)).includes('C♯'), await barText(page, 9));
  check(`${tag}: after it, back in A♭ (bar 18 has flats)`, !(await barText(page, 17)).includes('♯'), await barText(page, 17));
  check(`${tag}: the detection made no undo step of its own (the chords did)`, r.canUndo && /accord/i.test((await page.evaluate(() => window.__fabtice.history.undoLabel())) ?? ''));
  // The transport: the key of the place being played.
  await page.evaluate((t) => window.__fabtice.actions.seek(t), (await barStart(page, 8)) - 1);
  await sleep(250);
  const beforeDetail = await keyDetail(page);
  await page.evaluate((t) => window.__fabtice.actions.seek(t), (await barStart(page, 10)) + 0.2);
  await sleep(250);
  const inside = await keyDetail(page);
  check(`${tag}: the transport says A♭ before the change, E inside the passage`, beforeDetail.startsWith('A♭') && inside.startsWith('E'), `${beforeDetail} / ${inside}`);
  // Crossing it while playing.
  await page.evaluate((t) => window.__fabtice.actions.seek(t), (await barStart(page, 16)) - 0.4);
  await sleep(150);
  const wasE = await keyDetail(page);
  await page.evaluate(() => window.__fabtice.actions.togglePlay());
  await page.waitForFunction((t) => window.__fabtice.engine.getPosition() > t + 0.3, await barStart(page, 16), { timeout: 5000 }).catch(() => {});
  await sleep(150);
  const crossed = await keyDetail(page);
  await page.evaluate(() => window.__fabtice.actions.togglePlay());
  check(`${tag}: playing across bar 17, the transport goes from E back to A♭`, wasE.startsWith('E') && crossed.startsWith('A♭'), `${wasE} → ${crossed}`);
  await page.screenshot({ path: path.join(out, `${tag}-modulation-detected.png`) });

  // ---------------------------------------------------- the two settings
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, detectModulations: false } })));
  await settled(page);
  r = await page.evaluate(() => ({ changes: window.__fabtice.store.getState().analysis.keyChanges.length }));
  check(`${tag}: « Détecter les modulations » off: the detected modulations go`, r.changes === 0, JSON.stringify(r));
  check(`${tag}: and the passage is spelled in A♭ again`, (await barText(page, 9)).includes('D♭'), await barText(page, 9));
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, detectModulations: true } })));
  await settled(page);
  check(`${tag}: on again: detected again`, (await page.evaluate(() => window.__fabtice.store.getState().analysis.keyChanges.length)) === 2);
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, autoStructure: false } })));
  await settled(page);
  r = await page.evaluate(() => ({ structure: window.__fabtice.store.getState().analysis.structure, changes: window.__fabtice.store.getState().analysis.keyChanges.length }));
  check(`${tag}: « Structure automatique » off: no detected structure, the modulations stay`, r.structure === null && r.changes === 2, JSON.stringify(r));
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, autoStructure: true } })));
  await settled(page);
  check(`${tag}: the hand letters A B A still in force`, (await page.evaluate(() => window.__fabtice.structure.selectors.sectionsInForce(window.__fabtice.store.getState()).map((m) => m.label).join(''))) === 'ABA');

  // ---------------------------------------------------- a modulation by hand
  // Back to the demo's own chords (undo the eight bars), then a hand modulation to E at bar 13.
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__fabtice.history.undo());
  await settled(page);
  check(`${tag}: the eight bars undone: no modulation detected any more`, (await page.evaluate(() => window.__fabtice.store.getState().analysis.keyChanges.length)) === 0);
  const t12 = await barStart(page, 12);
  await page.evaluate((t) => window.__fabtice.lot2.key.addKeyChange(t + 0.05, { tonic: 4, mode: 'major' }), t12);
  await settled(page);
  r = await page.evaluate(() => {
    const f = window.__fabtice;
    const s = f.store.getState();
    return { hand: s.corrections.keyChanges, detected: s.analysis.keyChanges.length, label: f.history.undoLabel() };
  });
  check(`${tag}: the hand modulation is on the bar line, a step of its own`, r.hand?.length === 1 && Math.abs(r.hand[0].time - t12) < 1e-6 && /tonalit/i.test(r.label ?? ''), JSON.stringify(r));
  check(`${tag}: it respells the chords after it (bar 15: A♯m7 D♯7), not before (bar 12)`, (await barText(page, 14)).includes('A♯') && !(await barText(page, 11)).includes('♯'), `${await barText(page, 14)} / ${await barText(page, 11)}`);
  await page.evaluate((t) => window.__fabtice.actions.seek(t), t12 - 0.5);
  await sleep(250);
  const handBefore = await keyDetail(page);
  await page.evaluate((t) => window.__fabtice.actions.seek(t), t12 + 0.5);
  await sleep(250);
  const handAfter = await keyDetail(page);
  check(`${tag}: the transport follows the hand modulation`, handBefore.startsWith('A♭') && handAfter.startsWith('E'), `${handBefore} / ${handAfter}`);
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ playback: { ...s.playback, semitones: 1 } })));
  await sleep(250);
  check(`${tag}: transposed, both move together (E → F)`, (await keyDetail(page)).startsWith('E → F'), await keyDetail(page));
  await page.screenshot({ path: path.join(out, `${tag}-modulation-hand.png`) });
  await page.evaluate(() => window.__fabtice.history.undo());
  await page.evaluate(() => window.__fabtice.history.undo());
  await settled(page);
  check(`${tag}: undone: the chords are in A♭ again`, (await barText(page, 14)).includes('B♭'), await barText(page, 14));

  check(`${tag}: no console error`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

try {
  await suite('computer');
  await suite('phone');
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
