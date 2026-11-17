// « Dossier pour Logic Pro… » (C15.4) in Chromium, on the demo piece (moving
// tempo, chords, sections), in both forms (computer 1280 × 800 at the mouse,
// phone 390 × 844 at a touch):
//   - the entry is in « Exporter », after « PDF… »; its window says what the
//     folder holds, that volume, mute and solo do not apply, and closes with Escape;
//   - the web hands a .zip whose entries are inside one folder: the tracks in
//     Wave 48 kHz 16 bits, all of one length (the tempo chosen included), the
//     MIDI file, Lisez-moi.txt;
//   - the MIDI file read back here by an independent reader (`midi-file`):
//     every beat of the grid within a millisecond of its time in the audio,
//     the signatures, the key transposed, the markers;
//   - the percentage goes up while the tracks render, « Annuler » stops and
//     leaves no file; the end says the three gestures.
//   npm run build && npm run test:export-logic
// Screenshots go to $FABTICE_CAPTURES (default /tmp/fabtice-captures-C).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { menuCommand, menuEntry, menuOpenTo, closeMenu } from './lib/menu.mjs';
import { midiClock, readZip, wavInfo } from './lib/sequencer.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');
const { parseMidi } = createRequire(import.meta.url)('midi-file');

const out = process.env.FABTICE_CAPTURES || '/tmp/fabtice-captures-C';
fs.mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'], env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });

async function open(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/?demo&moteur=factice&rendu=lent`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.waitForFunction(() => window.__fabtice.lot3, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

const press = async (page, locator, touch) => (touch ? locator.tap() : locator.click());

async function run(form) {
  const touch = form === 'telephone';
  const viewport = touch ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const { context, page, errors } = await open(viewport, touch);
  const tag = `${form}`;

  // ------------------------------------------------------------ the entry
  await menuOpenTo(page, 'Exporter');
  const sub = touch ? '.feuille-menu-liste' : '.menu-fabtice';
  const labels = await page.locator(`${sub} [role="menuitem"] .menu-texte`).allTextContents();
  const trimmed = labels.map((s) => s.trim());
  const at = trimmed.indexOf('Dossier pour Logic Pro…');
  check(`${tag}: « Dossier pour Logic Pro… » is in « Exporter », after « PDF… »`, at > 0 && trimmed[at - 1] === 'PDF…', trimmed.join(' | '));
  await page.screenshot({ path: path.join(out, `${tag}-menu-exporter.png`) });
  await closeMenu(page);
  const entry = await menuEntry(page, 'Exporter', 'Dossier pour Logic Pro…');
  check(`${tag}: the entry can be chosen with a piece open`, entry.enabled === true);
  await closeMenu(page);

  // A key and a tempo of its own: +2 semitones, tempo 90 %.
  await page.evaluate(() => {
    const a = window.__fabtice.actions;
    a.stepSemitones(1);
    a.stepSemitones(1);
    a.setTempoRatio(0.9);
  });
  await menuCommand(page, 'Exporter', 'Dossier pour Logic Pro…');
  const dialog = page.locator('[data-testid="export-logic"]');
  await dialog.waitFor({ timeout: 5000 });
  const text = await dialog.innerText();
  check(`${tag}: the window says what the folder holds and that volume, mute and solo do not apply`, /Wave \(48 kHz, 16 bits\)/.test(text) && /fichier MIDI/.test(text) && /volume, le muet et le solo ne s’appliquent pas/.test(text) && /\+2 demi-tons/.test(text), text.slice(0, 160));
  check(`${tag}: on the web, the folder comes as a .zip`, /archive \.zip/.test(text));
  const go = page.locator('[data-testid="creer-dossier-logic"]');
  const goBox = await go.boundingBox();
  check(`${tag}: the main button is in ink`, (await go.evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(43, 31, 23)');
  if (touch) {
    const box = await page.locator('.export-logic').boundingBox();
    check(`${tag}: a sheet at the bottom, full width, buttons stacked full width at least 44 px`, Math.abs(box.x) < 1 && Math.abs(box.width - 390) < 1 && Math.abs(box.y + box.height - 844) < 2 && goBox.width > 340 && goBox.height >= 44, JSON.stringify({ box, goBox }));
  } else {
    check(`${tag}: everything fits on the screen`, (await page.locator('.export-logic').boundingBox()).height < 800);
  }
  await page.screenshot({ path: path.join(out, `${tag}-logic-fenetre.png`) });
  check(`${tag}: the window is in the way of the commands (menu greyed out)`, (await page.evaluate(() => window.__fabtice.store.getState().ui.exportAudioOpen)) === false && (await page.locator('.app[inert]').count()) === 1);

  // ------------------------------------------------------------ cancel in the middle
  await press(page, go, touch);
  await page.locator('[data-testid="pourcentage-logic"]').waitFor({ timeout: 10000 });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const p = await page.locator('[data-testid="pourcentage-logic"]').textContent().catch(() => null);
    if (p) seen.push(parseInt(p, 10));
    await sleep(250);
  }
  await page.screenshot({ path: path.join(out, `${tag}-logic-attente.png`) });
  const rising = seen.every((v, i) => i === 0 || v >= seen[i - 1]) && seen.at(-1) > seen[0];
  check(`${tag}: the percentage goes up while the tracks are made`, rising, seen.join(' '));
  await press(page, page.getByRole('button', { name: 'Annuler' }), touch);
  await page.waitForFunction(() => document.querySelector('[data-testid="export-logic"]')?.dataset.phase === 'choose', null, { timeout: 10000 });
  check(`${tag}: « Annuler » goes back to the window, no file`, (await page.locator('[data-testid="fichier-logic"]').count()) === 0);

  // ------------------------------------------------------------ the whole folder (faster renderer now)
  await page.evaluate(() => {
    const r = window.__fabtice.lot3.renderer;
    r.replaceRenderer(new r.MockRenderer());
  });
  await press(page, go, touch);
  const link = page.locator('[data-testid="fichier-logic"]');
  await link.waitFor({ timeout: 120000 });
  const end = await dialog.innerText();
  check(`${tag}: the end says the three gestures`, /Fichier > Ouvrir/.test(end) && /Conserver/.test(end) && /Créer de nouvelles pistes/.test(end) && (await page.locator('[data-testid="gestes-logic"] li').count()) === 3);
  await page.screenshot({ path: path.join(out, `${tag}-logic-fin.png`) });
  const [download] = await Promise.all([page.waitForEvent('download'), press(page, link, touch)]);
  const zipName = download.suggestedFilename();
  const buf = fs.readFileSync(await download.path());
  const files = readZip(buf);
  const session = await page.evaluate(() => {
    const f = window.__fabtice;
    const s = f.lot3.sequencer.buildSession(f.store.getState());
    return { frames: s.frames, beats: s.beats.map((b) => [b.time, b.quarters]), startError: s.startError, meters: s.meters, keys: s.keys, title: s.title, chords: s.chords.length, sections: s.sections.length };
  });
  const folder = zipName.replace(/\.zip$/, '');
  check(`${tag}: the archive is named after the piece and the changes`, /– Logic Pro \(\+2 demi-tons, tempo 90 %\)\.zip$/.test(zipName), zipName);
  check(`${tag}: every entry is inside the one folder`, files.every((f) => f.name.startsWith(`${folder}/`)), files.map((f) => f.name).join(', '));
  const names = files.map((f) => f.name.slice(folder.length + 1));
  const wavs = files.filter((f) => f.name.endsWith('.wav'));
  const trackCount = await page.evaluate(() => window.__fabtice.store.getState().tracks.length);
  check(`${tag}: one Wave per track, numbered, then the MIDI file and Lisez-moi.txt`, wavs.length === trackCount && names.at(-1) === 'Lisez-moi.txt' && names.at(-2).endsWith('.mid') && names[0].startsWith('01 '), names.join(', '));
  const infos = wavs.map((f) => wavInfo(f.data));
  check(`${tag}: Wave 48 kHz 16 bits, all exactly the length of the piece at 90 %`, infos.every((w) => w.riff && w.declared && w.rate === 48000 && w.bits === 16 && w.frames === session.frames), `${infos.map((w) => w.frames).join(', ')} vs ${session.frames}`);
  const midi = parseMidi(files.find((f) => f.name.endsWith('.mid')).data);
  const clock = midiClock(midi);
  let worst = 0;
  for (const [i, [time, quarters]] of session.beats.entries()) {
    if (i === 0 && session.startError !== 0) continue;
    worst = Math.max(worst, Math.abs(clock.seconds(quarters * clock.ppq) - time));
  }
  check(`${tag}: MIDI read back independently: every beat within a millisecond of the audio`, session.beats.length > 50 && worst < 0.001, `${session.beats.length} beats, worst ${(worst * 1000).toFixed(4)} ms`);
  const sigs = clock.abs[0].filter((e) => e.type === 'timeSignature').map((e) => `${e.numerator}/${e.denominator}@${e.tick / clock.ppq}`);
  check(`${tag}: MIDI signatures as the session says`, sigs.join(',') === session.meters.map((m) => `${m.meter.numerator}/${m.meter.denominator}@${m.quarters}`).join(','), sigs.join(','));
  const keys = clock.abs[0].filter((e) => e.type === 'keySignature');
  // The demo is in A♭ major: +2 is B♭ major, two flats.
  check(`${tag}: MIDI key transposed (B♭ major, two flats)`, keys.length >= 1 && keys[0].key === -2 && keys[0].scale === 0, JSON.stringify(keys.map((k) => [k.key, k.scale])));
  const markers = clock.abs[0].filter((e) => e.type === 'marker').map((e) => e.text);
  check(`${tag}: MIDI markers: the sections and the chords, ASCII`, markers.length > 8 && markers.some((m) => m.startsWith('[A]')) && markers.every((m) => /^[\x20-\x7e]+$/.test(m)), markers.slice(0, 6).join(' | '));
  const readme = files.find((f) => f.name.endsWith('Lisez-moi.txt')).data.toString('utf8');
  check(`${tag}: Lisez-moi.txt in French, UTF-8, the three gestures`, readme.charCodeAt(0) === 0xfeff && /1\. Dans Logic Pro/.test(readme) && /3\. Dans le Finder/.test(readme));
  fs.writeFileSync(path.join(out, `${tag}-${zipName}`), buf);
  await press(page, page.getByRole('button', { name: 'Fermer' }).last(), touch);
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-logic"]'), null, { timeout: 5000 });

  // ------------------------------------------------------------ Escape closes the window
  if (!touch) {
    await menuCommand(page, 'Exporter', 'Dossier pour Logic Pro…');
    await dialog.waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="export-logic"]'), null, { timeout: 5000 });
    check(`${tag}: Escape closes the window`, true);
  }
  check(`${tag}: no error on the page`, errors.length === 0, errors.slice(0, 3).join(' / '));
  await context.close();
}

try {
  await run('ordinateur');
  await run('telephone');
} catch (e) {
  failed++;
  console.log(`FAIL  ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
console.log(`screenshots: ${out}`);
process.exit(failed ? 1 : 0);
