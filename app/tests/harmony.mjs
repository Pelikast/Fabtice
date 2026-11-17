// Stage 5, the harmony pass in Chromium, in both forms (a computer 1280 × 800, a phone 390 × 844), on the demo
// piece with the app's own detectors (`structure/refresh.ts` and `structure/index.ts`, no stand-in):
//   - a chord written by hand triggers a refresh (its input has the hand chord), undo and redo still go step by step;
//   - eight bars of E major written by hand in the A♭ piece: the modulation is detected there and back, the chords of
//     the passage are spelled in E on the chart, the transport says the key of the place being played, before and after
//     the playhead crosses the change;
//   - a modulation by hand (`window.__fabtice.lot2.key`) respells the chords after it and moves the transport's key;
//   - « Détecter les modulations » and « Structure automatique du morceau » switch the detection off and on;
//   - C10, the modulations on screen: the mark above the bar (follows transposition, instrument and minor sign), its
//     window (change, move, delete, the key before, « Revenir… »), the bar menu, the ruler of « Pistes », the paper.
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

// ---------------------------------------------------------------- C10 on screen: the mark, its window, the bar menu, the ruler, the paper

/** The demo piece with the harmony pass suspended (the checks make the state themselves). */
async function openMade(form, query = '?demo&moteur=factice&vue=grille&harmonie=non') {
  const phone = form === 'phone';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 15000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[data-testid="grille"] [data-mesure="14"]', { timeout: 15000 });
  await sleep(300);
  return { page, context, errors, phone, cdp: phone ? await context.newCDPSession(page) : null };
}

/** The detection stood in for: E major from bar 9, back to the main key at bar 17 (as the analysis would write them). */
const detect = (page, bars = [[8, 4], [16, 8]]) =>
  page.evaluate((list) => {
    const f = window.__fabtice;
    const s = f.store.getState();
    const map = s.tempoMap;
    f.store.setState({ analysis: { ...s.analysis, keyChanges: list.map(([bar, tonic]) => ({ time: f.lot4.tempoMap.barStartTime(map, bar), key: { tonic, mode: 'major', confidence: 0.7, alternatives: [] } })) } });
  }, bars);

const markOf = (page, bar) => page.locator(`[data-testid="grille"] [data-mesure="${bar}"] .modulation`);
const marks = (page) => page.$$eval('[data-testid="grille"] .modulation', (els) => els.map((e) => `${e.closest('[data-mesure]').dataset.mesure}:${e.dataset.cle}:${e.dataset.origine}`));
const press = (h, locator) => (h.phone ? locator.tap() : locator.click());
const DIALOG = '[data-testid="modulation-dialogue"]';
const undoLabel = (page) => page.evaluate(() => window.__fabtice.history.undoLabel());

/** Nothing of the top row of a bar covers anything else in it: the letter, the mark, the number, the signature, the chords. */
const topRowProblems = (page) =>
  page.evaluate(() => {
    const out = [];
    for (const cell of document.querySelectorAll('[data-testid="grille"] .case')) {
      const items = [...cell.querySelectorAll('.section, .modulation, .numero, .signature, .accord-case .ch')].map((e) => ({ k: e.className.toString().split(' ')[0], r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i].r;
          const b = items[j].r;
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push(`bar ${cell.dataset.mesure}: ${items[i].k} over ${items[j].k}`);
        }
    }
    return out;
  });

async function modulationScreens(form) {
  const tag = form;
  const h = await openMade(form);
  const { page } = h;
  await detect(page);
  await sleep(300);

  // ---------------------------------------------------- the mark on the chart
  check(`${tag}: a mark above bar 9 (E) and bar 17 (A♭), from the analysis`, (await marks(page)).join(' ') === '8:E:analysis 16:A♭:analysis', (await marks(page)).join(' '));
  const text9 = await markOf(page, 8).textContent();
  check(`${tag}: it reads « Ton : E »${h.phone ? ' (on a phone, just the key is shown)' : ''}`, text9.replace(/\s+/g, ' ').trim() === 'Ton : E', text9);
  const shown = await markOf(page, 8).evaluate((e) => ({ word: getComputedStyle(e.querySelector('.modulation-mot')).display, font: getComputedStyle(e).fontFamily, color: getComputedStyle(e).color }));
  check(`${tag}: ${h.phone ? 'the word « Ton : » is left out on a phone' : 'the word « Ton : » is shown'}, in ink-soft, never ember or brass`, (h.phone ? shown.word === 'none' : shown.word !== 'none') && shown.color === 'rgb(106, 86, 70)', JSON.stringify(shown));
  check(`${tag}: the chords of the passage are spelled in E (bar 10: C♯, not D♭), and after it in A♭`, (await barText(page, 9)).includes('C♯') && !(await barText(page, 17)).includes('♯'), `${await barText(page, 9)} / ${await barText(page, 17)}`);
  check(`${tag}: bar 9 carries a letter (B) and the mark side by side, bar 17 too (A); nothing covers anything`, (await topRowProblems(page)).length === 0 && (await page.locator('[data-mesure="8"] .case-tete .section').count()) === 1, (await topRowProblems(page)).join(' ; '));
  // A signature too: a bar with a letter, a signature AND a modulation.
  await page.evaluate(() => window.__fabtice.lot2.meter.setMeterFrom(8, { numerator: 3, denominator: 4 }));
  await sleep(300);
  check(`${tag}: a letter, a signature and a modulation in one bar: nothing covers anything`, (await topRowProblems(page)).length === 0 && (await page.locator('[data-mesure="8"] .signature').count()) === 1 && (await markOf(page, 8).count()) === 1, (await topRowProblems(page)).join(' ; '));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(300);
  // Two rows of chords on a bar with a letter and a mark.
  await page.evaluate(() => {
    const c = (root, quality, extensions = []) => ({ root, quality, extensions, bass: null });
    window.__fabtice.lot2.harmony.setBarChords(8, [{ beatInBar: 0, chord: c(4, 'min7', ['b5', '9']) }, { beatInBar: 1, chord: c(9, '7', ['#9', 'b13']) }, { beatInBar: 2, chord: c(2, 'min7', ['9', '11']) }, { beatInBar: 3, chord: c(7, '7', ['b9', 'b13']) }]);
  });
  await sleep(300);
  check(`${tag}: crowded chords (two rows) under a letter and a mark: the top row stays clear`, (await topRowProblems(page)).length === 0, (await topRowProblems(page)).join(' ; '));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);

  // Transposition, instrument, minor sign.
  await page.evaluate(() => window.__fabtice.actions.stepSemitones(1));
  await sleep(250);
  check(`${tag}: transposed by a semitone the marks say F and A`, (await marks(page)).map((m) => m.split(':')[1]).join(' ') === 'F A', (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.actions.resetTransposition());
  await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('sib'));
  await sleep(250);
  check(`${tag}: written for a B♭ instrument: F♯ and B♭`, (await marks(page)).map((m) => m.split(':')[1]).join(' ') === 'F♯ B♭', (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('mib'));
  await sleep(250);
  check(`${tag}: written for an E♭ instrument: C♯ and F`, (await marks(page)).map((m) => m.split(':')[1]).join(' ') === 'C♯ F', (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.lot2.harmony.setInstrument('ut'));
  await detect(page, [[8, 4]]);
  await page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    window.__fabtice.store.setState({ analysis: { ...s.analysis, keyChanges: s.analysis.keyChanges.map((c) => ({ ...c, key: { ...c.key, mode: 'minor' } })) } });
  });
  await sleep(250);
  check(`${tag}: a minor key is written « Em » (setting « m »), « E– » with the other sign`, (await marks(page))[0]?.includes(':Em:'), (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.actions.setMinorNotation('–'));
  await sleep(250);
  check(`${tag}: … « E– » with the dash`, (await marks(page))[0]?.includes(':E–:'), (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.actions.setMinorNotation('m'));
  await detect(page);
  await sleep(300);
  await page.screenshot({ path: path.join(out, `${tag}-marque.png`) });

  // ---------------------------------------------------- a click on the mark opens its window
  const posBefore = await page.evaluate(() => window.__fabtice.engine.getPosition());
  const loopBefore = await page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().loop));
  await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
  await markOf(page, 8).scrollIntoViewIfNeeded();
  await press(h, markOf(page, 8));
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  await sleep(350);
  check(`${tag}: a click on the mark opens « Modifier la modulation »`, (await page.locator('#modulation-titre').textContent()) === 'Modifier la modulation');
  check(`${tag}: it neither moves the playhead nor selects a loop`, (await page.evaluate(() => window.__fabtice.engine.getPosition())) === posBefore && (await page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().loop))) === loopBefore);
  check(`${tag}: it starts from the modulation: E major, bar 9, the key before said`, (await page.locator('[data-testid="modulation-note-4"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-testid="modulation-mode-major"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('[data-testid="modulation-mesure"]').inputValue()) === '9' && (await page.locator('[data-testid="modulation-avant"]').textContent()).trim() === 'Tonalité d’avant : A♭');
  check(`${tag}: found by the analysis, no « Revenir… » link yet (the list is the analysis')`, (await page.locator('.modulation-origine').textContent()) === 'Trouvée par l’analyse.' && (await page.locator('[data-testid="modulation-revenir"]').count()) === 0);
  check(`${tag}: « Supprimer la modulation », « Annuler », « Valider »`, (await page.locator('[data-testid="modulation-supprimer"]').innerText()) === 'Supprimer la modulation' && (await page.locator('[data-testid="modulation-annuler"]').innerText()) === 'Annuler' && (await page.locator('[data-testid="modulation-valider"]').innerText()) === 'Valider');
  const primary = await page.$eval('[data-testid="modulation-valider"]', (e) => getComputedStyle(e).backgroundColor);
  check(`${tag}: the primary button is ink, not ember`, primary === 'rgb(43, 31, 23)', primary);
  const twelve = await page.$$eval('.fenetre-modulation .cle-notes button', (els) => els.map((e) => e.textContent));
  check(`${tag}: the twelve notes`, twelve.join(' ') === 'C D♭ D E♭ E F G♭ G A♭ A B♭ B', twelve.join(' '));
  if (h.phone) {
    const box = await page.locator('.fenetre-modulation').boundingBox();
    const sizes = await page.$$eval('.fenetre-modulation button, .fenetre-modulation input', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    check(`${tag}: a sheet at the bottom of the screen, the full width, targets of 40 px or more`, box.x === 0 && Math.round(box.width) === 390 && Math.abs(box.y + box.height - 844) <= 1 && Math.min(...sizes) >= 40, `${JSON.stringify(box)} ${Math.min(...sizes)}`);
  }
  await page.screenshot({ path: path.join(out, `${tag}-fenetre.png`) });

  // The key before: a calm sentence, nothing created.
  await press(h, page.locator('[data-testid="modulation-note-8"]'));
  check(`${tag}: choosing the key of the passage before: « C'est déjà la tonalité de ce passage. », « Valider » waits`, (await page.locator('[data-testid="modulation-erreur"]').textContent()) === 'C’est déjà la tonalité de ce passage.' && (await page.locator('[data-testid="modulation-valider"]').isDisabled()));
  await page.screenshot({ path: path.join(out, `${tag}-fenetre-meme.png`) });
  await page.locator('[data-testid="modulation-mesure"]').fill('40');
  await press(h, page.locator('[data-testid="modulation-note-9"]'));
  const range = await page.locator('[data-testid="modulation-erreur"]').textContent();
  check(`${tag}: a bar that does not exist: the bars possible are said`, /^Une mesure de 2 à \d+\.$/.test(range) && (await page.locator('[data-testid="modulation-valider"]').isDisabled()), range);
  await page.locator('[data-testid="modulation-mesure"]').fill('17');
  await sleep(100);
  check(`${tag}: a bar that already has a modulation: said`, (await page.locator('[data-testid="modulation-erreur"]').textContent()) === 'Il y a déjà une modulation à cette mesure.');
  await page.locator('[data-testid="modulation-mesure"]').fill('9');

  // Change the key (F♯ minor): one step, now the user's.
  await press(h, page.locator('[data-testid="modulation-mode-minor"]'));
  await press(h, page.locator('[data-testid="modulation-note-6"]'));
  await press(h, page.locator('[data-testid="modulation-valider"]'));
  await sleep(300);
  check(`${tag}: Valider closes the window; the mark says F♯m, written by hand (the list is the user's)`, (await page.locator(DIALOG).count()) === 0 && (await marks(page)).join(' ') === '8:F♯m:manual 16:A♭:manual', (await marks(page)).join(' '));
  check(`${tag}: one undo step, « Annuler : tonalité »`, (await undoLabel(page)) === 'Annuler : tonalité');
  check(`${tag}: the chords of the passage are spelled in F♯ minor now (bar 10 has sharps)`, (await barText(page, 9)).includes('♯'), await barText(page, 9));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  check(`${tag}: undo gives back the analysis' E, the list is the analysis' again`, (await marks(page)).join(' ') === '8:E:analysis 16:A♭:analysis', (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.history.redo());
  await sleep(250);
  check(`${tag}: redo does it again`, (await marks(page))[0] === '8:F♯m:manual');

  // Move it to another bar.
  await press(h, markOf(page, 8));
  await page.waitForSelector(DIALOG);
  await sleep(300);
  check(`${tag}: written by hand: « Écrite à la main. » and « Revenir aux modulations de l’analyse »`, (await page.locator('.modulation-origine').textContent()) === 'Écrite à la main.' && (await page.locator('[data-testid="modulation-revenir"]').innerText()) === 'Revenir aux modulations de l’analyse');
  await page.locator('[data-testid="modulation-mesure"]').fill('11');
  await press(h, page.locator('[data-testid="modulation-valider"]'));
  await sleep(300);
  check(`${tag}: moved to bar 11: the mark is above bar 11 and gone from bar 9`, (await marks(page)).join(' ') === '10:F♯m:manual 16:A♭:manual', (await marks(page)).join(' '));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  check(`${tag}: undone: back at bar 9`, (await marks(page))[0] === '8:F♯m:manual');
  await page.evaluate(() => window.__fabtice.history.redo());
  await sleep(250);
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);

  // « Revenir aux modulations de l'analyse » from the window and from the key of the title.
  await press(h, markOf(page, 8));
  await page.waitForSelector(DIALOG);
  await sleep(250);
  await press(h, page.locator('[data-testid="modulation-revenir"]'));
  await sleep(300);
  check(`${tag}: « Revenir aux modulations de l’analyse » gives E and A♭ back, as the analysis'`, (await marks(page)).join(' ') === '8:E:analysis 16:A♭:analysis' && (await page.evaluate(() => window.__fabtice.store.getState().corrections.keyChanges)) === null, (await marks(page)).join(' '));
  check(`${tag}: it is one undo step`, (await undoLabel(page)) === 'Annuler : tonalité');
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  // The key of the title: the main key stays the piece's (A♭), with the link only when the list is the user's.
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  await page.evaluate(() => (document.querySelector('.vue-grille').scrollTop = 0));
  await page.locator('[data-testid="cle-bouton"]').scrollIntoViewIfNeeded();
  check(`${tag}: the title still says the MAIN key (A♭), not the key of a passage`, (await page.locator('[data-testid="grille-ton"]').textContent()).startsWith('Tonalité de A♭'), await page.locator('[data-testid="grille-ton"]').textContent());
  await press(h, page.locator('[data-testid="cle-bouton"]'));
  await page.waitForSelector('[data-testid="cle-editeur"]');
  check(`${tag}: the key window of the title offers « Revenir aux modulations de l’analyse » when the list is the user's`, (await page.locator('[data-testid="cle-modulations-revenir"]').innerText()) === 'Revenir aux modulations de l’analyse');
  await press(h, page.locator('[data-testid="cle-modulations-revenir"]'));
  await sleep(300);
  check(`${tag}: …and it gives them back`, (await marks(page)).join(' ') === '8:E:analysis 16:A♭:analysis');
  await press(h, page.locator('[data-testid="cle-bouton"]'));
  await page.waitForSelector('[data-testid="cle-editeur"]');
  check(`${tag}: with the analysis' list, the link is not offered`, (await page.locator('[data-testid="cle-modulations-revenir"]').count()) === 0);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------- the bar menu
  const openMenu = async (bar) => {
    const cell = page.locator(`[data-testid="grille"] [data-mesure="${bar}"]`);
    await cell.scrollIntoViewIfNeeded();
    const b = await cell.boundingBox();
    const x = b.x + b.width - 6;
    const y = b.y + b.height - 6;
    if (h.phone) {
      await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(1100);
      await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 4000 });
    await sleep(200);
  };
  const menuActions = () => page.$$eval('[data-testid="menu-tempo"] [role="menuitem"]', (els) => els.map((e) => `${e.dataset.action}${e.disabled ? ':off' : ''}`));
  await openMenu(4);
  check(`${tag}: the bar menu of a bar with no modulation: four tempo entries, then « Changer de tonalité à partir de cette mesure… »`, (await menuActions()).join(' ') === 'continuity fresh tap meter key' && (await page.locator('[data-action="key"] span').textContent()) === 'Changer de tonalité à partir de cette mesure…', (await menuActions()).join(' '));
  await page.screenshot({ path: path.join(out, `${tag}-menu-mesure.png`) });
  await press(h, page.locator('[data-testid="menu-tempo"] [data-action="key"]'));
  await page.waitForSelector(DIALOG);
  await sleep(300);
  check(`${tag}: it opens « Changer de tonalité » on that bar (5), no key chosen, « Valider » waits`, (await page.locator('#modulation-titre').textContent()) === 'Changer de tonalité' && (await page.locator('[data-testid="modulation-mesure"]').inputValue()) === '5' && (await page.locator('[data-testid="modulation-valider"]').isDisabled()) && (await page.locator('.fenetre-modulation [aria-checked="true"]').count()) === 0 && (await page.locator('[data-testid="modulation-supprimer"]').count()) === 0 && (await page.locator('[data-testid="modulation-valider"]').innerText()) === 'Changer de tonalité');
  await press(h, page.locator('[data-testid="modulation-note-0"]'));
  await press(h, page.locator('[data-testid="modulation-valider"]'));
  await sleep(300);
  check(`${tag}: a modulation to C at bar 5: the mark is there, written by hand, the list is the user's (the analysed ones kept)`, (await marks(page)).join(' ') === '4:C:manual 8:E:manual 16:A♭:manual', (await marks(page)).join(' '));
  check(`${tag}: the chords after it are spelled in C (bar 6, no flats), a step « Annuler : tonalité »`, !(await barText(page, 5)).includes('♭') && (await undoLabel(page)) === 'Annuler : tonalité', await barText(page, 5));
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  check(`${tag}: undone`, (await marks(page)).join(' ') === '8:E:analysis 16:A♭:analysis');
  await page.evaluate(() => window.__fabtice.history.redo());
  await sleep(250);
  // On a bar with a modulation: change it, delete it. On the first bar: greyed.
  await openMenu(8);
  check(`${tag}: the bar menu of a bar that carries a modulation: « Modifier la modulation… » and « Supprimer la modulation »`, (await menuActions()).join(' ') === 'continuity fresh tap meter key-edit key-remove' && (await page.locator('[data-action="key-edit"] span').textContent()) === 'Modifier la modulation…' && (await page.locator('[data-action="key-remove"] span').textContent()) === 'Supprimer la modulation', (await menuActions()).join(' '));
  await press(h, page.locator('[data-testid="menu-tempo"] [data-action="key-edit"]'));
  await page.waitForSelector(DIALOG);
  check(`${tag}: « Modifier la modulation… » opens the window on it`, (await page.locator('#modulation-titre').textContent()) === 'Modifier la modulation' && (await page.locator('[data-testid="modulation-mesure"]').inputValue()) === '9');
  await press(h, page.locator('[data-testid="modulation-annuler"]'));
  await sleep(200);
  check(`${tag}: « Annuler » changes nothing`, (await marks(page)).join(' ') === '4:C:manual 8:E:manual 16:A♭:manual' && (await page.locator(DIALOG).count()) === 0);
  await openMenu(8);
  await press(h, page.locator('[data-testid="menu-tempo"] [data-action="key-remove"]'));
  await sleep(300);
  check(`${tag}: « Supprimer la modulation » removes it; the chords after it are spelled in C then (bar 10: no sharps)`, (await marks(page)).join(' ') === '4:C:manual 16:A♭:manual' && !(await barText(page, 9)).includes('♯'), `${(await marks(page)).join(' ')} / ${await barText(page, 9)}`);
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(250);
  check(`${tag}: undone: it is back`, (await marks(page)).join(' ') === '4:C:manual 8:E:manual 16:A♭:manual');
  await openMenu(0);
  check(`${tag}: on the first bar the entry is greyed, with the reason`, (await menuActions()).includes('key:off') && (await page.locator('[data-action="key"] small').textContent()) === 'La tonalité du début se change au titre de la grille.');
  await page.keyboard.press('Escape');
  await sleep(150);
  await page.evaluate(() => window.__fabtice.history.undo());
  await sleep(200);

  // ---------------------------------------------------- the paper
  await page.evaluate(() => window.__fabtice.store.setState((s) => ({ ui: { ...s.ui, printOpen: true, panel: 'none' } })));
  await page.waitForSelector('[data-testid="impression"]');
  await sleep(500);
  const paper = await page.$$eval('.pp-case .pp-modulation', (els) => els.map((e) => `${e.closest('.pp-case').dataset.mesure}:${e.dataset.cle}`));
  check(`${tag}: the paper writes the marks too: above bars 9 and 17`, paper.join(' ') === '8:E 16:A♭', paper.join(' '));
  const paperText = await page.$eval('.pp-case[data-mesure="8"] .pp-modulation', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  check(`${tag}: … « Ton : E », with the letter beside it, nothing over anything`, paperText === 'Ton : E' && (await page.$$eval('.pp-case', (cells) => cells.every((c) => {
    const items = [...c.querySelectorAll('.pp-section, .pp-modulation, .pp-numero')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    return items.every((a, i) => items.every((b, j) => j <= i || !(a.left < b.right - 0.3 && b.left < a.right - 0.3 && a.top < b.bottom - 0.3 && b.top < a.bottom - 0.3)));
  }))));
  const ink = await page.$eval('.pp-case[data-mesure="8"] .pp-modulation', (e) => getComputedStyle(e).color);
  check(`${tag}: ink on white`, ink === 'rgb(43, 31, 23)', ink);
  await page.screenshot({ path: path.join(out, `${tag}-papier.png`) });
  await page.keyboard.press('Escape');
  await sleep(200);

  // ---------------------------------------------------- the part shown has its marks too
  const shownPart = await page.evaluate(() => {
    const f = window.__fabtice;
    const st = f.structure.demo('jazz');
    f.structure.setDetected(st);
    const map = f.store.getState().tempoMap;
    const t = f.lot4.tempoMap.barStartTime(map, 8);
    const p = st.parts.find((x) => x.start <= t && t < x.end);
    return p ? f.structure.display.showPart(p.id) : false;
  });
  await sleep(400);
  check(`${tag}: the display of a part that holds bar 9 keeps its mark`, shownPart && (await marks(page)).join(' ') === '8:E:analysis', `${shownPart} ${(await marks(page)).join(' ')}`);
  await page.evaluate(() => window.__fabtice.structure.display.showFullChart());

  check(`${tag}: no console error (the marks)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

/** The ruler of « Pistes »: the stronger bar line and the key in a small box, when there is room. */
async function modulationRuler(form) {
  const tag = form;
  const h = await openMade(form, '?demo&moteur=factice&harmonie=non');
  const { page } = h;
  await page.waitForSelector('.frise');
  await page.evaluate(() => window.__fabtice.actions.setZoom(h.phone ? 90 : 130));
  await detect(page, [[1, 4], [3, 8]]);
  await page.mouse.move(h.phone ? 250 : 700, 400);
  await page.mouse.wheel(-8000, 0);
  await sleep(600);
  const data = () => page.evaluate(() => document.querySelector('.frise')?.dataset.modulations ?? '');
  const d = await data();
  check(`${tag}: the ruler writes the key at the bar line where it changes (data-modulations)`, d.startsWith('2:E'), d);
  await page.screenshot({ path: path.join(out, `${tag}-regle.png`) });
  await page.evaluate(() => window.__fabtice.actions.stepSemitones(1));
  await sleep(500);
  check(`${tag}: it follows the transposition`, (await data()).startsWith('2:F'), await data());
  await page.evaluate(() => window.__fabtice.actions.resetTransposition());
  await page.evaluate(() => window.__fabtice.actions.setAuto(true));
  await sleep(500);
  const crowded = await data();
  check(`${tag}: zoomed out until the box does not fit, the name is left out, never drawn over something`, crowded.split(' ').filter(Boolean).length <= 2, crowded);
  await page.evaluate(() => window.__fabtice.actions.setZoom(130));
  await detect(page, []);
  await sleep(500);
  check(`${tag}: no modulation: nothing written (no data-modulations)`, (await data()) === '');
  check(`${tag}: no console error (the ruler)`, h.errors.length === 0, h.errors.join(' | '));
  await h.context.close();
}

try {
  await suite('computer');
  await suite('phone');
  await modulationScreens('computer');
  await modulationScreens('phone');
  await modulationRuler('computer');
  await modulationRuler('phone');
} finally {
  await browser.close();
  srv.close();
}
console.log(`\nScreenshots: ${out}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
