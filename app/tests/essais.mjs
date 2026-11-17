// Trial files for the owner (stage 3, exports): what « Exporter » makes, made by the app itself in Chromium
// with the REAL renderer (Rubber Band R3) and the real encoders, so that he can try them in Logic Pro 13 (and
// Ableton Live once that export exists) without making them himself.
//
//   npm run essais -- /some/folder/outside/the/repository
//
// (the script builds the interface first, then serves it from web/ on a local port: nothing real is reached).
// The folder is created if needed; it must NOT be inside the repository. It receives:
//
//   LISEZ-MOI.txt                                    what to open first in Logic 13 and what to look at
//   1 - Tonalité et tempo d'origine/
//     Logic Pro/<the folder, unpacked>/              « Dossier pour Logic Pro… », as the Mac app writes it
//     Logic Pro/<the same, as the web's .zip>
//     Audio/                                         « Audio… »: Wave 48 kHz 16 bits, Wave 96 kHz 24 bits, Flac,
//                                                    MP3 320 and MP3 128 of the whole mix, and an archive of the tracks
//     Ableton Live/                                  « Projet Ableton Live… » when the app has it (else skipped, said)
//   2 - Plus 2 demi-tons, tempo 90 %/                the same, at +2 semitones and 90 % of the tempo
//
// The piece is the demonstration piece (four instruments, a moving tempo, chords, sections A B A), made more
// telling for a sequencer: a 3/4 bar in the middle (the stage 1 command « pour cette mesure seulement ») and a
// modulation for the B section, back home for the last A. When ffprobe is installed, each audio file is read
// back with it and its format printed. Playwright and Chromium are expected preinstalled (/opt/node-tools); set
// PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { menuCommand, menuEntry, closeMenu } from './lib/menu.mjs';
import { startServer } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repo = path.resolve(appDir, '..');

// ---------------------------------------------------------------- the folder: given, and outside the repository

const given = process.argv[2];
if (!given) {
  console.error('Il faut dire dans quel dossier ranger les fichiers d’essai, par exemple :\n  npm run essais -- ~/Desktop/essais-fabtice\nCe dossier doit être en dehors du dépôt.');
  process.exit(2);
}
const base = process.env.INIT_CWD || process.cwd();
const out = path.resolve(base, given.replace(/^~(?=$|\/)/, os.homedir()));
function realNearest(p) {
  let cur = p;
  const tail = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    cur = path.dirname(cur);
  }
  return path.join(fs.realpathSync(cur), ...tail);
}
const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
if (inside(realNearest(out), fs.realpathSync(repo))) {
  console.error(`Le dossier « ${out} » est dans le dépôt de Fabtice. Choisissez un dossier en dehors, par exemple ~/Desktop/essais-fabtice.`);
  process.exit(2);
}
if (!fs.existsSync(path.join(repo, 'web', 'index.html'))) {
  console.error('L’interface n’est pas construite : lancez d’abord « npm run build » dans le dossier app.');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/')('playwright'));
} catch {
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright est introuvable. Indiquez son dossier avec PLAYWRIGHT_MODULE_DIR=/chemin/vers/node_modules/..');
    process.exit(2);
  }
}
fs.mkdirSync(out, { recursive: true });

const problems = [];
const notes = new Set();
const fail = (text) => {
  problems.push(text);
  console.error(`PROBLÈME  ${text}`);
};
const say = (text) => console.log(text);

// ---------------------------------------------------------------- readers

/** The entries of a ZIP stored without compression (what the app writes). */
function readZip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('archive illisible');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    if (method !== 0) throw new Error(`entrée compressée inattendue : ${name}`);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.push({ name, data: buf.subarray(dataAt, dataAt + size) });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

/** Unpacks a ZIP into `dir` (names checked to stay inside it). */
function unzipInto(buf, dir) {
  for (const f of readZip(buf)) {
    const target = path.resolve(dir, f.name);
    if (!inside(target, dir) || f.name.endsWith('/')) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
}

/** Format of an audio file by ffprobe (an independent reader), or null when ffprobe is not installed. */
function probe(file) {
  try {
    const raw = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample,bit_rate:format=duration,bit_rate', '-of', 'json', file]);
    const j = JSON.parse(raw.toString());
    const s = j.streams?.[0] ?? {};
    const bits = Number(s.bits_per_sample) || Number(s.bits_per_raw_sample) || null;
    const kbps = Math.round(Number(s.bit_rate || j.format?.bit_rate) / 1000) || null;
    return { codec: s.codec_name, rate: Number(s.sample_rate), channels: s.channels, bits, kbps, seconds: Number(j.format?.duration) };
  } catch (e) {
    if (/ENOENT/.test(String(e))) return null;
    return { error: String(e.message || e).split('\n')[0] };
  }
}
const probeText = (p) =>
  !p ? '' : p.error ? `ffprobe : ${p.error}` : `${p.codec}, ${p.rate} Hz, ${p.channels} canal(aux)${p.bits ? `, ${p.bits} bits` : ''}${p.kbps && /mp3/.test(p.codec) ? `, ${p.kbps} kbit/s` : ''}, ${p.seconds.toFixed(3)} s`;

// ---------------------------------------------------------------- the page

const { srv, url } = await startServer(0);
// A UTF-8 locale: without one, Chromium renames non-ASCII download names.
const browser = await chromium.launch({ args: ['--no-sandbox'], env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });

async function openPiece(semitones, tempoRatio) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`erreur dans la page : ${e.message}`));
  // The real renderer even on a test page (`?rendu=reel`), the silent engine (no sound card here).
  await page.goto(`${url}/?demo&moteur=factice&rendu=reel`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 30000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.waitForFunction(() => window.__fabtice.lot2 && window.__fabtice.lot3 && window.__fabtice.lot4, null, { timeout: 20000 });
  const piece = await page.evaluate(
    ({ semitones, tempoRatio }) => {
      const f = window.__fabtice;
      const s = () => f.store.getState();
      const bar = (n) => f.lot4.tempoMap.barStartTime(s().tempoMap, n);
      // A 3/4 bar in the middle (« mesure 12 »), the stage 1 command « pour cette mesure seulement ».
      const meter = f.lot2.meter.setMeterForBar(11, { numerator: 3, denominator: 4 });
      // A modulation: the B section (« mesure 9 ») in E♭ major, back to A♭ major for the last A (« mesure 17 »).
      const keyB = f.lot2.key.addKeyChange(bar(8), { tonic: 3, mode: 'major' });
      const keyA = f.lot2.key.addKeyChange(bar(16), { tonic: 8, mode: 'major' });
      for (let i = 0; i < Math.abs(semitones); i++) f.actions.stepSemitones(Math.sign(semitones));
      f.actions.setTempoRatio(tempoRatio);
      const session = f.lot3.sequencer.buildSession(s());
      return {
        meter,
        keyB,
        keyA,
        renderer: f.lot3.renderer.getRenderer().kind,
        tracks: s().tracks.map((t) => t.name),
        title: s().project.title,
        session: {
          frames: session.frames,
          meters: session.meters.map((m) => `${m.meter.numerator}/${m.meter.denominator} (noire ${m.quarters})`),
          keys: session.keys.map((k) => k.name),
          leadIn: session.leadIn,
          start: session.start,
          beats: session.beats.length,
          sections: session.sections.map((x) => x.label).join(' '),
          chords: session.chords.length,
        },
      };
    },
    { semitones, tempoRatio },
  );
  if (!piece.meter) fail('la mesure en 3/4 n’a pas pu être posée');
  if (!piece.keyB || !piece.keyA) fail('la modulation n’a pas pu être posée');
  if (piece.renderer !== 'rubberband') fail(`le moteur de rendu n’est pas le vrai (${piece.renderer})`);
  return { context, page, piece };
}

/** Clicks a link of the page and saves the download in `dir`; resolves with the file's path. */
async function download(page, link, dir) {
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, d.suggestedFilename());
  await d.saveAs(file);
  return file;
}

// ---------------------------------------------------------------- 1. « Dossier pour Logic Pro… »

async function logicFolder(page, dir) {
  await menuCommand(page, 'Exporter', 'Dossier pour Logic Pro…');
  await page.waitForSelector('[data-testid="export-logic"]');
  await page.click('[data-testid="creer-dossier-logic"]');
  const link = page.locator('[data-testid="fichier-logic"]');
  await link.waitFor({ timeout: 900000 });
  const zip = await download(page, link, dir);
  unzipInto(fs.readFileSync(zip), dir);
  await page.getByRole('button', { name: 'Fermer' }).last().click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-logic"]'));
  const folder = path.join(dir, path.basename(zip, '.zip'));
  say(`  Logic Pro : « ${path.basename(folder)} » (décompressé) et son .zip`);
  for (const name of fs.readdirSync(folder).sort()) {
    const p = name.endsWith('.wav') ? probe(path.join(folder, name)) : null;
    say(`    ${name}${p ? `  —  ${probeText(p)}` : ''}`);
  }
  return folder;
}

// ---------------------------------------------------------------- 2. « Audio… »

const AUDIO = [
  { label: 'Wave 48 kHz 16 bits', format: 'wav', rate: '48000', bits: '16', what: 'mix', sub: 'Wave 48 kHz 16 bits' },
  { label: 'Wave 96 kHz 24 bits', format: 'wav', rate: '96000', bits: '24', what: 'mix', sub: 'Wave 96 kHz 24 bits' },
  { label: 'Flac', format: 'flac', what: 'mix', sub: 'Flac' },
  { label: 'MP3 320 kbit/s', format: 'mp3', kbps: '320', what: 'mix', sub: 'MP3 320' },
  { label: 'MP3 128 kbit/s', format: 'mp3', kbps: '128', what: 'mix', sub: 'MP3 128' },
  { label: 'Archive des pistes (Wave 48 kHz 16 bits)', format: 'wav', rate: '48000', bits: '16', what: 'tracks', sub: 'Pistes' },
];

async function audioFile(page, dir, spec) {
  await menuCommand(page, 'Exporter', 'Audio…');
  await page.waitForSelector('[data-testid="export-son"]');
  await page.click(`[data-testid="export-son"] [data-choix="${spec.what}"]`);
  await page.click(`[data-testid="export-son"] [data-choix="whole"]`);
  await page.click(`.exp-formats [data-format="${spec.format}"]`);
  if (spec.rate) await page.selectOption('[data-testid="export-frequence"]', spec.rate);
  if (spec.bits) await page.click(`.exp-duo [data-bits="${spec.bits}"]`);
  if (spec.kbps) await page.selectOption('[data-testid="export-debit"]', spec.kbps);
  if (spec.what === 'tracks') {
    const separate = page.locator('[data-testid="export-separes"]');
    if (!(await separate.isChecked())) await separate.check();
  }
  await page.click('[data-testid="exporter-son"]');
  const link = page.locator('[data-testid="fichier-son"]');
  await link.waitFor({ timeout: 900000 });
  const file = await download(page, link, path.join(dir, spec.sub));
  await page.locator('[data-testid="export-son"] .fermer').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-son"]'));
  if (file.endsWith('.zip')) {
    unzipInto(fs.readFileSync(file), path.dirname(file));
    const inner = readZip(fs.readFileSync(file)).map((e) => e.name);
    say(`  ${spec.label} : ${path.basename(file)} (décompressé à côté)`);
    for (const n of inner) say(`    ${n}  —  ${probeText(probe(path.join(path.dirname(file), n)))}`);
  } else {
    say(`  ${spec.label} : ${path.basename(file)}  —  ${probeText(probe(file))}`);
  }
  return file;
}

// ---------------------------------------------------------------- 3. « Projet Ableton Live… » (when the app has it)

async function abletonProject(page, dir) {
  let entry = null;
  try {
    entry = await menuEntry(page, 'Exporter', 'Projet Ableton Live…');
  } catch {
    entry = null;
  }
  await closeMenu(page);
  if (!entry || !entry.enabled) {
    const why = entry ? 'l’entrée est grisée' : 'l’app n’a pas encore cette commande';
    say(`  Ableton Live : sauté (${why}).`);
    notes.add(`« Projet Ableton Live… » n’a pas été fabriqué : ${why}.`);
    return null;
  }
  await menuCommand(page, 'Exporter', 'Projet Ableton Live…');
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator('button.plein').first().click();
  const link = dialog.locator('a[download]').first();
  await link.waitFor({ timeout: 900000 });
  const file = await download(page, link, dir);
  if (file.endsWith('.zip')) unzipInto(fs.readFileSync(file), dir);
  await page.keyboard.press('Escape');
  say(`  Ableton Live : ${path.basename(file)}${file.endsWith('.zip') ? ' (décompressé à côté)' : ''}`);
  return file;
}

// ---------------------------------------------------------------- the two variants

const VARIANTS = [
  { name: '1 - Tonalité et tempo d’origine', semitones: 0, tempoRatio: 1 },
  { name: '2 - Plus 2 demi-tons, tempo 90 %', semitones: 2, tempoRatio: 0.9 },
];

const made = [];
try {
  for (const v of VARIANTS) {
    const dir = path.join(out, v.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    say(`\n${v.name}`);
    const { context, page, piece } = await openPiece(v.semitones, v.tempoRatio);
    say(`  Morceau : « ${piece.title} », pistes ${piece.tracks.join(', ')} ; moteur de rendu ${piece.renderer}`);
    say(`  Signatures : ${piece.session.meters.join(', ')} ; tonalités : ${piece.session.keys.join(', ')} ; sections ${piece.session.sections} ; ${piece.session.chords} accords ; ${piece.session.beats} temps`);
    const logic = await logicFolder(page, path.join(dir, 'Logic Pro'));
    for (const spec of AUDIO) await audioFile(page, path.join(dir, 'Audio'), spec);
    await abletonProject(page, path.join(dir, 'Ableton Live'));
    made.push({ variant: v, piece, logic });
    await context.close();
  }
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
} finally {
  await browser.close();
  srv.close();
}

// ---------------------------------------------------------------- LISEZ-MOI.txt

if (made.length) {
  const first = made[0];
  const lead = first.piece.session.leadIn;
  const midi = fs.readdirSync(first.logic).find((n) => n.endsWith('.mid'));
  const logicBar = 1 + (lead ? lead.bars : 0) - first.piece.session.start.bar;
  const text = [
    'Fichiers d’essai de Fabtice – exports (étape 3 de la version 1.0.0)',
    '',
    `Le morceau : « ${first.piece.title} », le morceau de démonstration de Fabtice (quatre instruments : ${first.piece.tracks.join(', ')}).`,
    'Pour que l’essai dise quelque chose, on lui a donné :',
    '  - un tempo qui varie un peu d’une mesure à l’autre (entre 107 et 113) ;',
    '  - une mesure en 3/4 au milieu (la mesure 12 de Fabtice), toutes les autres en 4/4 ;',
    '  - des accords, et trois sections : A, B, A ;',
    '  - un changement de tonalité : la section B en Mi♭ majeur, le reste en La♭ majeur.',
    '',
    'Deux variantes, chacune dans son dossier :',
    `  « ${VARIANTS[0].name} »`,
    `  « ${VARIANTS[1].name} » : tout transposé et ralenti, comme si vous l’aviez réglé dans Fabtice.`,
    '',
    'Dans chaque variante :',
    '  - « Logic Pro » : le « Dossier pour Logic Pro », tel que l’app Mac l’écrit (et la même chose en .zip, comme sur le web) ;',
    '  - « Audio » : un fichier de chaque format de la fenêtre « Audio… » (le mélange entier), et une archive des pistes ;',
    '  - « Ableton Live » : le projet Ableton, s’il a pu être fabriqué (voir à la fin).',
    '',
    'Quoi essayer en premier, dans Logic Pro 13 :',
    `  1. Ouvrez « Logic Pro » de la première variante et lisez « Lisez-moi.txt » : il donne les trois gestes. En bref : Fichier > Ouvrir… sur « ${midi} », réglez le mode de tempo sur « Conserver », puis glissez les quatre fichiers .wav sous la piste « Accords », à la mesure 1, et choisissez « Créer de nouvelles pistes ».`,
    '  2. Regardez :',
    '     - Les signatures : la piste des signatures doit montrer la mesure d’attente du début, puis 4/4, une mesure en 3/4, puis 4/4 de nouveau.',
    '     - Les armures : La♭ majeur au début, Mi♭ majeur à la section B, La♭ majeur à la dernière section A (dans la piste des signatures, ou la partition).',
    '     - Les pistes audio : elles commencent toutes à la mesure 1, au tout début, et ne sont pas étirées.',
    `     - Le métronome (touche K) : il doit tomber sur les temps de la musique du début à la fin, y compris après la mesure en 3/4. La mesure 1 de Fabtice est la mesure ${logicBar} de Logic${lead ? ' : la première est une mesure d’attente, qui dure exactement le temps avant la musique' : ''}.`,
    '     - Les marqueurs : un par accord, avec les sections, par exemple « [A] Abmaj7 », « [B] … ». Sont-ils lisibles dans la piste et la liste des marqueurs ?',
    '     - La piste « Accords » joue les accords : ils doivent tomber avec la musique.',
    '  3. Refaites la même chose avec la deuxième variante (+2 demi-tons, tempo 90 %) : tout doit rester aligné, et les accords et armures doivent être transposés (Si♭ majeur, Fa majeur).',
    '  4. Les fichiers du dossier « Audio » s’ouvrent dans le Finder (barre d’espace) ou dans Logic : vérifiez qu’ils sonnent bien et durent le morceau entier.',
    '',
    'Dites-nous ce qui ne va pas, même un détail : un marqueur mal placé, une signature absente, une piste décalée, une fenêtre de Logic qui pose une question inattendue.',
    '',
    ...(notes.size ? ["À savoir :", ...[...notes].map((n) => `  - ${n}`), ""] : []),
  ].join('\n');
  fs.writeFileSync(path.join(out, 'LISEZ-MOI.txt'), `﻿${text}`);
}

console.log(`\nDossier : ${out}`);
if (problems.length) {
  console.log(`${problems.length} problème(s) :`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('Tout a été fabriqué.');
