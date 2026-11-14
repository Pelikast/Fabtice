// Lot 3 screens in Chromium: the separation (new-piece dialog, panel,
// progress, processor notice, first-download notice, cancel, error, result
// tracks in their hues, « Revenir au morceau entier », room used and « Libérer
// la place »), the advanced settings, « Appliquer » (button, waiting screen,
// applied state, back to preview), « Exporter le son » (a WAV and an archive
// downloaded and read back), and separated instruments of REAL size kept on
// the device and reopened after a reload (persistent profile).
// Every new panel is checked inside the window and above the transport at
// 1280 × 800, 960 × 640 and 390 × 844, and screenshotted.
//   npm run build && npm run test:separation
// Screenshots go to $FABTICE_SEPARATION_OUT (default: a temporary folder).
// `FABTICE_SEPARATION_ONLY=screens|flows|export|storage` runs one part.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_SEPARATION_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-separation-'));
fs.mkdirSync(out, { recursive: true });
const only = process.env.FABTICE_SEPARATION_ONLY || null;
const part = (name) => !only || only === name;

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
// A UTF-8 locale: without one (a bare container), Chromium refuses non-ASCII download names
// (« Blues du dimanche – mélange.wav » becomes « download »); every Mac has one.
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });

const SIZES = [
  [1280, 800],
  [960, 640],
  [390, 844],
];
const EMBER = 'rgb(196, 80, 42)';

async function open(query, viewport = { width: 1280, height: 800 }, context = null) {
  const page = context ? await context.newPage() : await browser.newPage({ viewport, acceptDownloads: true });
  if (context) await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}
const state = (page) => page.evaluate(() => window.__fabtice.store.getState());
const phone = (page) => page.viewportSize().width < 760;

/** Opens the separation panel from where it is on this size (the track column, or the phone menu). */
async function openSeparationPanel(page) {
  if ((await page.locator('[data-testid="panneau-separation"]').count()) > 0) return;
  if (phone(page)) {
    await page.click('.menu-plus');
    await page.click('[data-separation-entry]');
  } else await page.click('[data-testid="separer"]');
  await page.waitForSelector('[data-testid="panneau-separation"]');
}

/** A panel is whole, inside the window and above the transport; its last button can be clicked. */
async function fitsAboveTransport(page, selector) {
  // Panels rise by 10 px as they open (DESIGN.md): measure once they have arrived.
  await sleep(350);
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, why: 'missing' };
    const r = el.getBoundingClientRect();
    const bas = document.querySelector('.bas');
    const limit = bas && !el.closest('.voile') ? bas.getBoundingClientRect().top : window.innerHeight;
    const buttons = [...el.querySelectorAll('button, a, select')].filter((b) => b.getBoundingClientRect().height > 0);
    const last = buttons[buttons.length - 1];
    let clickable = true;
    if (last) {
      last.scrollIntoView({ block: 'nearest' });
      const lr = last.getBoundingClientRect();
      const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
      clickable = !!hit && (hit === last || last.contains(hit));
    }
    const ok = r.top >= -0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= limit + 0.5 && clickable;
    return { ok, why: `top ${r.top.toFixed(0)} bottom ${r.bottom.toFixed(0)} limit ${limit.toFixed(0)} right ${r.right.toFixed(0)}/${window.innerWidth} last clickable ${clickable}` };
  }, selector);
}

/** True when nothing of `selector` is painted in the ember (DESIGN.md: one red thing only). */
async function noEmber(page, selector) {
  return page.evaluate(
    ([sel, ember]) =>
      [...document.querySelectorAll(sel)].every((el) => {
        const cs = getComputedStyle(el);
        return ![cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderLeftColor].includes(ember);
      }),
    [selector, EMBER],
  );
}

try {
  // ------------------------------------------------------------ screens at three sizes
  if (part('screens')) {
    for (const [width, height] of SIZES) {
      const vp = { width, height };
      const tag = `${width}`;
      {
        const { page, errors } = await open('?debug&moteur=factice', vp);
        await page.waitForSelector('.voile.ouverte');
        const chips = await page.locator('.stems-choix .stem').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('aria-pressed')]));
        check(`${tag}: new-piece dialog lists the instruments, none ticked`, chips.length >= 4 && chips.every(([, p]) => p === 'false'), JSON.stringify(chips));
        check(`${tag}: no estimate before a tick`, (await page.locator('[data-testid="estimation-import"]').count()) === 0);
        await page.click('.stems-choix .stem[data-stem="vocals"]');
        await page.click('.stems-choix .stem[data-stem="bass"]');
        const estimate = await page.locator('[data-testid="estimation-import"]').innerText();
        check(`${tag}: ticking shows an honest estimate`, /environ .+ pour un morceau de quatre minutes/.test(estimate), estimate);
        await page.click('.pied-separation .lien');
        check(`${tag}: « Aller plus loin » promises no tool the list does not have`, (await page.locator('[data-testid="aller-plus-loin"]').innerText()).includes('Aucun outil de séparation détaillée'));
        check(`${tag}: the dialog fits the window`, (await fitsAboveTransport(page, '.accueil')).ok, (await fitsAboveTransport(page, '.accueil')).why);
        await page.screenshot({ path: path.join(out, `dialogue-instruments-${tag}.png`) });
        check(`${tag}: no page errors (dialog)`, errors.length === 0, errors.join(' | '));
        await page.close();
      }
      {
        const { page, errors } = await open('?demo&moteur=factice&separation=entier', vp);
        await openSeparationPanel(page);
        const text = await page.locator('[data-testid="panneau-separation"]').innerText();
        check(`${tag}: panel names the tool and the estimate`, text.includes('BS-RoFormer SW') && /Environ .+ sur cet appareil/.test(text), text.slice(0, 160));
        check(`${tag}: first download: size, source and known licence`, (await page.locator('[data-testid="premier-telechargement"]').count()) === 1 && text.includes('353 Mo') && text.includes('huggingface.co/elicwhite') && text.includes('Licence connue'));
        const fit = await fitsAboveTransport(page, '.panneau-separation');
        check(`${tag}: separation panel inside the window, above the transport`, fit.ok, fit.why);
        await page.screenshot({ path: path.join(out, `separation-offre-${tag}.png`) });
        check(`${tag}: no page errors (offer)`, errors.length === 0, errors.join(' | '));
        await page.close();
      }
      {
        const { page, errors } = await open('?demo&moteur=factice&separation=lente', vp);
        await page.waitForSelector('[data-testid="separation-etat"]');
        await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.step === 'download', null, { timeout: 10000 });
        await page.click('[data-testid="separation-etat"]');
        await sleep(600);
        const dl = await page.locator('[data-testid="panneau-separation"]').innerText();
        check(`${tag}: first download in progress shows bytes and its source`, /Téléchargement de l’outil/.test(dl) && /sur 353 Mo/.test(dl) && dl.includes('Licence connue'), dl.slice(0, 200));
        await page.screenshot({ path: path.join(out, `separation-telechargement-${tag}.png`) });
        await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.step === 'separate', null, { timeout: 20000 });
        await sleep(2500);
        const run = await page.locator('[data-testid="panneau-separation"]').innerText();
        check(`${tag}: running: progress and remaining time`, /Séparation en cours/.test(run) && /(encore environ|restante)/.test(run), run.slice(0, 200));
        const fit = await fitsAboveTransport(page, '.panneau-separation');
        check(`${tag}: running panel inside the window`, fit.ok, fit.why);
        check(`${tag}: the piece stays playable while separating`, (await state(page)).transport.engine === 'ready');
        await page.screenshot({ path: path.join(out, `separation-en-cours-${tag}.png`) });
        check(`${tag}: no page errors (running)`, errors.length === 0, errors.join(' | '));
        await page.close();
      }
      {
        const { page } = await open('?demo&moteur=factice&separation=repli', vp);
        await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.fellBack === true, null, { timeout: 20000 });
        await page.click('[data-testid="separation-etat"]');
        await page.waitForSelector('[data-testid="repli"]');
        const fit = await fitsAboveTransport(page, '.panneau-separation');
        check(`${tag}: processor notice shown, calm (brass rule, no ember)`, fit.ok && (await noEmber(page, '[data-testid="repli"]')), fit.why);
        await page.screenshot({ path: path.join(out, `separation-repli-${tag}.png`) });
        await page.close();
      }
      {
        const { page, errors } = await open('?demo&moteur=factice&separation=faite', vp);
        await page.waitForFunction(() => window.__fabtice.store.getState().separation.result);
        await sleep(400);
        await page.screenshot({ path: path.join(out, `separation-pistes-${tag}.png`) });
        await openSeparationPanel(page);
        const fit = await fitsAboveTransport(page, '.panneau-separation');
        check(`${tag}: result panel inside the window`, fit.ok, fit.why);
        await page.screenshot({ path: path.join(out, `separation-resultat-${tag}.png`) });
        check(`${tag}: no page errors (done)`, errors.length === 0, errors.join(' | '));
        await page.close();
      }
      {
        const { page } = await open('?demo&moteur=factice', vp);
        await page.click(phone(page) ? '.menu-plus' : 'button.menu:has-text("Réglages")');
        await page.click('[data-testid="reglages-avances"]');
        await sleep(300);
        const fit = await fitsAboveTransport(page, '.reglages-app');
        check(`${tag}: advanced settings inside the window`, fit.ok, fit.why);
        await page.screenshot({ path: path.join(out, `reglages-avances-${tag}.png`) });
        await page.close();
      }
      {
        const { page } = await open('?demo&moteur=factice&rendu=lent', vp);
        await page.click('button[aria-label="Un demi-ton plus haut"]');
        await page.waitForSelector('[data-testid="appliquer"]');
        check(`${tag}: « Appliquer » never in the ember`, await noEmber(page, '[data-testid="appliquer"]'));
        const metronome = await page.locator('.metronome').boundingBox();
        check(`${tag}: the transport keeps the metronome whole next to « Appliquer »`, metronome.width >= 50 && metronome.x + metronome.width <= width, JSON.stringify(metronome));
        await page.screenshot({ path: path.join(out, `appliquer-${tag}.png`) });
        await page.click('[data-testid="appliquer"]');
        await page.waitForSelector('[data-testid="attente-rendu"]');
        await sleep(500);
        const fit = await fitsAboveTransport(page, '.attente');
        check(`${tag}: waiting screen fits`, fit.ok, fit.why);
        await page.screenshot({ path: path.join(out, `appliquer-attente-${tag}.png`) });
        await page.waitForSelector('[data-testid="applique"]', { timeout: 30000 });
        check(`${tag}: applied state, quiet and never in the ember`, await noEmber(page, '[data-testid="applique"]'));
        await page.screenshot({ path: path.join(out, `applique-${tag}.png`) });
        await page.close();
      }
      {
        const { page } = await open('?demo&moteur=factice&separation=faite&export=ouvert', vp);
        await page.waitForSelector('[data-testid="export-son"]');
        await page.click('.choix-export .choix:has-text("Les pistes")');
        const fit = await fitsAboveTransport(page, '.export-son');
        check(`${tag}: export dialog fits the window`, fit.ok, fit.why);
        await page.screenshot({ path: path.join(out, `exporter-son-${tag}.png`) });
        await page.close();
      }
    }
  }

  // ------------------------------------------------------------ flows
  if (part('flows')) {
    // Ticked in the new-piece dialog: separated once the imported piece can play.
    {
      const { page, errors } = await open('?debug&moteur=factice&separation=instant');
      await page.waitForSelector('.voile.ouverte');
      await page.click('.stems-choix .stem[data-stem="vocals"]');
      await page.locator('.accueil input[type="file"]').setInputFiles(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'tone.wav'));
      await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 30000 });
      const s = await state(page);
      check('import with « Voix » ticked: Voix and Autres, the whole piece aside', s.tracks.map((tr) => tr.name).join(',') === 'Voix,Autres' && s.separation.aside.length === 1 && s.ui.importStems.length === 0, s.tracks.map((tr) => tr.name).join(','));
      check('no page errors (separation at import)', errors.length === 0, errors.join(' | '));
      await page.close();
    }
    // Later, from the panel: six instruments in their hues, whole piece and back, free the room.
    {
      const { page, errors } = await open('?demo&moteur=factice&separation=entier');
      check('one whole-piece track to start with', (await page.locator('.piste-tete').count()) === 1);
      await openSeparationPanel(page);
      await page.click('[data-testid="lancer-separation"]');
      await page.waitForSelector('[data-testid="separation-etat"]');
      await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 30000 });
      const hues = await page.locator('.piste-tete').evaluateAll((els) => els.map((e) => [e.querySelector('.nom').textContent, e.style.getPropertyValue('--teinte')]));
      check(
        'six instrument tracks in the design hues',
        JSON.stringify(hues) === JSON.stringify([['Voix', 'var(--voix)'], ['Batterie', 'var(--batterie)'], ['Basse', 'var(--basse)'], ['Guitare', 'var(--guitare)'], ['Piano', 'var(--piano)'], ['Autres', 'var(--autres)']]),
        JSON.stringify(hues),
      );
      check('six lanes drawn', (await page.locator('.frise-voie').count()) === 6);
      await openSeparationPanel(page);
      await page.click('[data-testid="bascule-morceau"]');
      await sleep(200);
      check('« Revenir au morceau entier »: one track again', (await page.locator('.piste-tete').count()) === 1 && (await state(page)).separation.showing === 'whole');
      await page.click('[data-testid="bascule-morceau"]');
      await sleep(200);
      check('« Revoir les instruments »: six again, no new computation', (await page.locator('.piste-tete').count()) === 6 && (await state(page)).separationRun.status === 'idle');
      await page.click('[data-testid="liberer"]');
      await page.click('[data-testid="liberer-oui"]');
      await sleep(300);
      const s = await state(page);
      check('« Libérer la place »: the whole piece, the separation forgotten', s.tracks.length === 1 && s.separation.result === null);
      check('no page errors (panel)', errors.length === 0, errors.join(' | '));
      await page.close();
    }
    // Cancel, error, retry.
    {
      const { page } = await open('?demo&moteur=factice&separation=lente');
      await page.waitForSelector('[data-testid="separation-etat"]');
      await page.click('[data-testid="separation-etat"]');
      await page.click('.panneau-separation button:has-text("Annuler")');
      await sleep(300);
      const s = await state(page);
      check('cancel: back to idle, the whole piece untouched', s.separationRun.status === 'idle' && s.tracks.length === 1 && s.separation.result === null);
      await page.close();
    }
    {
      const { page } = await open('?demo&moteur=factice&separation=echec');
      await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.status === 'error', null, { timeout: 20000 });
      check('failure: a calm status in the top bar', (await page.locator('[data-testid="separation-etat"]').innerText()).includes('interrompue'));
      await page.click('[data-testid="separation-etat"]');
      const text = await page.locator('[data-testid="panneau-separation"]').innerText();
      check('failure: the panel says it and offers to try again', text.includes('n’a pas abouti') && text.includes('Réessayer') && (await noEmber(page, '.panneau-separation *')));
      await page.close();
    }
    // Advanced settings: another tool, formants; kept on this device.
    {
      const { page } = await open('?demo&moteur=factice&separation=entier');
      await page.click('button.menu:has-text("Réglages")');
      await page.click('[data-testid="reglages-avances"]');
      const auto = await page.locator('.reglages-app small').first().innerText();
      check('advanced: the automatic choice says why', auto.includes('BS-RoFormer SW') && auto.includes('carte graphique Apple'), auto);
      await page.selectOption('[data-testid="outil-separation"]', 'scnet');
      await page.check('[data-testid="formants"]');
      const s = await state(page);
      check('advanced: tool and formants in the settings', s.settings.advanced.separationModel === 'scnet' && s.settings.advanced.formants === true);
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('fabtice.preferences.v1')));
      check('advanced: kept on this device', kept.separationModel === 'scnet' && kept.formants === true);
      await page.keyboard.press('Escape');
      await openSeparationPanel(page);
      const chips = await page.locator('.panneau-separation .stem').allInnerTexts();
      check('the panel follows the chosen tool (SCNet: four parts)', (await page.locator('.panneau-separation').innerText()).includes('SCNet') && chips.join(',') === 'Voix,Batterie,Basse,Autres', chips.join(','));
      await page.evaluate(() => localStorage.removeItem('fabtice.preferences.v1'));
      await page.close();
    }
    // « Appliquer »: preview, render, applied, back to preview on any change.
    {
      const { page, errors } = await open('?demo&moteur=factice');
      check('original key and tempo: no « Appliquer »', (await page.locator('[data-testid="appliquer"]').count()) === 0);
      await page.click('button[aria-label="Un demi-ton plus haut"]');
      check('a changed key: « Appliquer » offered (preview heard at once)', await page.locator('[data-testid="appliquer"]').isVisible());
      await page.click('[data-testid="appliquer"]');
      await page.waitForSelector('[data-testid="applique"]', { timeout: 20000 });
      const snap = await page.evaluate(() => window.__fabtice.engine.snapshot());
      check('applied: the engine plays the rendered audio as it is', snap.rendered?.inUse === true && snap.rendered.tracks.length === 4 && snap.rendered.semitones === 1, JSON.stringify(snap.rendered));
      await page.click('button[aria-label="Ralentir"]');
      await sleep(200);
      const snap2 = await page.evaluate(() => window.__fabtice.engine.snapshot());
      check('a new change: back to preview, « Appliquer » again, the render dropped', (await page.locator('[data-testid="appliquer"]').isVisible()) && snap2.rendered === null);
      check('no page errors (Appliquer)', errors.length === 0, errors.join(' | '));
      await page.close();
    }
  }

  // ------------------------------------------------------------ export: files downloaded and read back
  if (part('export')) {
    const { page, errors } = await open('?demo&moteur=factice&separation=faite');
    await page.waitForFunction(() => window.__fabtice.store.getState().separation.result);
    await page.click('button:has-text("Exporter")');
    await page.click('[data-export="audio"]');
    await page.waitForSelector('[data-testid="export-son"]');
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 30000 });
    let [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-son"]')]);
    let file = path.join(out, download.suggestedFilename());
    await download.saveAs(file);
    let bytes = fs.readFileSync(file);
    const s = await state(page);
    const frames = Math.round(s.project.duration * 48000);
    const dataBytes = bytes.readUInt32LE(40);
    const ch = bytes.readUInt16LE(22);
    note(`downloaded: ${download.suggestedFilename()}`);
    check('mix: a WAV named after the piece, 48 kHz, the whole length', download.suggestedFilename() === 'Blues du dimanche – mélange.wav' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(24) === 48000 && Math.abs(dataBytes / (ch * 2) - frames) <= 1, `${download.suggestedFilename()} ${dataBytes / (ch * 2)} frames vs ${frames}`);
    // The tracks, the loop only, at another tempo: one archive.
    await page.click('button:has-text("Exporter autre chose")');
    await page.click('.choix-export .choix:has-text("Les pistes")');
    await page.click('.choix-export .choix:has-text("La boucle")');
    await page.evaluate(() => window.__fabtice.actions.setTempoRatio(0.5));
    await page.click('[data-testid="exporter-son"]');
    await page.waitForSelector('[data-testid="fichier-son"]', { timeout: 60000 });
    [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="fichier-son"]')]);
    file = path.join(out, download.suggestedFilename());
    await download.saveAs(file);
    bytes = fs.readFileSync(file);
    let entries = 0;
    let firstData = 0;
    for (let at = 0; at + 4 <= bytes.length; ) {
      if (bytes.readUInt32LE(at) !== 0x04034b50) break;
      const size = bytes.readUInt32LE(at + 18);
      const nameLen = bytes.readUInt16LE(at + 26);
      if (entries === 0) firstData = bytes.readUInt32LE(at + 30 + nameLen + 40);
      entries++;
      at += 30 + nameLen + size;
    }
    const loop = s.loop.region;
    const loopFrames = Math.round(((loop.end - loop.start) * 48000) / 0.5);
    note(`downloaded: ${download.suggestedFilename()}`);
    check('tracks: one archive, six WAV files', download.suggestedFilename().endsWith('.zip') && entries === 6, `${download.suggestedFilename()}: ${entries} entries`);
    check('loop at half speed: each file lasts twice the loop', Math.abs(firstData / 2 - loopFrames) <= 2, `${firstData / 2} frames vs ${loopFrames}`);
    check('no page errors (export)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------ real sizes kept on the device, reopened after a reload
  if (part('storage')) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-sep-'));
    const seconds = 150;
    const wav = path.join(work, 'deux-minutes-et-demie.wav');
    {
      const rate = 44100;
      const n = seconds * rate;
      const data = Buffer.alloc(n * 4);
      let seed = 7;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const t = i / rate;
        const l = 0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 880 * t) + (seed / 0x7fffffff - 0.5) * 0.05;
        const r = 0.3 * Math.sin(2 * Math.PI * 165 * t) + 0.2 * Math.sin(2 * Math.PI * 1320 * t);
        data.writeInt16LE(Math.round(l * 32767), i * 4);
        data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
      }
      const h = Buffer.alloc(44);
      h.write('RIFF', 0);
      h.writeUInt32LE(36 + data.length, 4);
      h.write('WAVEfmt ', 8);
      h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20);
      h.writeUInt16LE(2, 22);
      h.writeUInt32LE(rate, 24);
      h.writeUInt32LE(rate * 4, 28);
      h.writeUInt16LE(4, 32);
      h.writeUInt16LE(16, 34);
      h.write('data', 36);
      h.writeUInt32LE(data.length, 40);
      fs.writeFileSync(wav, Buffer.concat([h, data]));
    }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-sep-profile-'));
    const context = await chromium.launchPersistentContext(profile, { args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } });
    try {
      const { page, errors } = await open('?debug&moteur=factice&separation=instant', { width: 1280, height: 800 }, context);
      await page.waitForSelector('.voile.ouverte');
      await page.locator('.accueil input[type="file"]').setInputFiles(wav);
      await page.waitForFunction(() => {
        const s = window.__fabtice.store.getState();
        return s.project && s.transport.engine === 'ready' && !s.ui.newPieceOpen;
      }, null, { timeout: 120000 });
      await sleep(1500); // the original is written
      const t0 = Date.now();
      await openSeparationPanel(page);
      await page.click('[data-testid="lancer-separation"]');
      await page.waitForFunction(() => window.__fabtice.store.getState().separation.result, null, { timeout: 120000 });
      await sleep(1500); // autosave of the document
      const before = await state(page);
      const usage = await page.evaluate(() => window.__fabtice.lot3.storage().trackAudioUsage());
      note(`separated ${seconds} s stereo into ${before.tracks.length} tracks and kept them: ${(usage.bytes / 1e6).toFixed(1)} MB on the device, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      check('real size: every instrument kept on the device (16-bit, tens of MB)', usage.ids.length === before.tracks.length && usage.bytes > 50e6, `${usage.ids.length} tracks, ${usage.bytes} bytes`);
      await openSeparationPanel(page).catch(() => {});
      const place = await page.locator('[data-testid="place"]').innerText().catch(() => '');
      check('the panel says how much room the instruments take', /Instruments gardés sur cet appareil\s:\s\d+ Mo/.test(place.replace(/\u00a0/g, ' ')), place);
      // Reload: the instruments come back without any computation.
      const t1 = Date.now();
      await page.reload();
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 120000 });
      const after = await state(page);
      note(`reopened with ${after.tracks.length} instrument tracks in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
      check(
        'after a reload: the same instrument tracks, the whole piece aside, no new separation',
        JSON.stringify(after.tracks.map((tr) => tr.id)) === JSON.stringify(before.tracks.map((tr) => tr.id)) &&
          after.separation.result?.id === before.separation.result.id &&
          after.separation.aside.length === 1 &&
          after.separationRun.status === 'idle',
      );
      const frames = await page.evaluate(() => {
        const s = window.__fabtice.store.getState();
        return [...s.tracks, ...s.separation.aside].map((tr) => window.__fabtice.lot3.registry.getAudio(tr.audio.id)?.frames ?? -1);
      });
      check('every track is back at full length', frames.every((f) => f === before.tracks[0].audio.frames), JSON.stringify(frames));
      // Free the room: gone from the device, and after a reload the whole piece opens.
      await openSeparationPanel(page);
      await page.click('[data-testid="liberer"]');
      await page.click('[data-testid="liberer-oui"]');
      await sleep(1500);
      const freed = await page.evaluate(() => window.__fabtice.lot3.storage().trackAudioUsage());
      check('« Libérer la place »: nothing left on the device', freed.bytes === 0 && freed.ids.length === 0, JSON.stringify(freed));
      await page.reload();
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 120000 });
      const whole = await state(page);
      check('after freeing and a reload: the whole piece', whole.tracks.length === 1 && whole.tracks[0].role === 'morceau' && whole.separation.result === null);
      check('no page errors (storage)', errors.length === 0, errors.join(' | '));
    } finally {
      await context.close();
      fs.rmSync(work, { recursive: true, force: true });
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(`\nscreenshots: ${out}`);
if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('separation: all checks passed');
