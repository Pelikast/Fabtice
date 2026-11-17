// Browser check of the REAL analyser, in Chromium, on the built interface
// served from web/ with the isolation headers:
//   npm run build && npm run test:analysis
//
// What it covers (the numbers it measures are printed as NOTE lines):
//   - the demo piece (web/spikes/analyse/demo/demo-swing.mp3, a synthetic
//     swing excerpt whose beats, key, tuning and chords are known, in
//     demo-swing.json) is imported through the interface and analysed by the
//     real analyser; the result is compared with what is known and with what
//     the prototype itself finds on the same file;
//   - the models are downloaded from Hugging Face the first time (progress,
//     steps in French), then kept: a second analysis downloads nothing;
//   - the status panel that opens by itself the first time the tools are
//     downloaded: it closes by itself when the analysis ends, unless the user
//     touched it, and stays open on an error;
//   - cancellation (in the panel, and by a new import), the network missing
//     (the piece stays usable, the analysis starts again), a damaged download
//     (refused, fetched again; refused for good after three tries), a hub that
//     accepts ranged requests from this origin (resuming);
//   - the real audio engine plays while the analysis works, without one
//     quantum over budget;
//   - the cost: analysis time for this file and for a 4-minute piece, peak
//     memory of the browser's processes, longest task of the main thread.
// Scenarios: first, panel, cancel, network, integrity, resume, playing, long; and, on request
// only (several minutes), fin: the optional fine chord model.
//
// The models are fetched for real: the network must reach Hugging Face. Set
// FABTICE_ANALYSIS_ONLY=<name> to run one scenario (names are in `scenarios`).
// Playwright and Chromium are expected preinstalled (/opt/node-tools); set
// PLAYWRIGHT_MODULE_DIR to load them from elsewhere.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { openSettingsTab } from './lib/settings.mjs';
import { menuCommand } from './lib/menu.mjs';
import { playlistFile } from './standards-fixtures.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const SWING = path.join(repo, 'web/spikes/analyse/demo/demo-swing.mp3');
const TRUTH = JSON.parse(fs.readFileSync(path.join(repo, 'web/spikes/analyse/demo/demo-swing.json'), 'utf8'));
const TONE = path.join(here, 'fixtures/tone.wav');

// What the prototype itself reaches on this file (its own functions run in Node
// on the same audio with the light Beat This! network; see app/README.md).
const PROTOTYPE = { beatRecall: 0.963, beatPrecision: 0.939, downbeats: 19, roots: 0.842, rootsAndQualities: 0.743, tuning: 30.5 };

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (text) => console.log(`NOTE  ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
// One browser per scenario: its memory figures start from an idle browser.
let browser = null;
const launch = () => chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });

// ------------------------------------------------------------------ helpers

/** Runs in every page: what the analysis does to the main thread, and the texts the interface shows. */
function probe() {
  window.__texts = [];
  window.__textTimes = [];
  window.__long = [];
  window.__lag = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push({ start: e.startTime, duration: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // not supported: the timer-based figure below remains
  }
  // Event-loop lag: a 10 ms timer that notes how late it is.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    window.__lag.push({ at: now, late: now - last - 10 });
    last = now;
  }, 10);
  const note = () => {
    const bar = document.querySelector('[data-testid="analyse-etat"]');
    const step = document.querySelector('.analyse-etape');
    for (const el of [bar, step]) {
      const text = el && el.textContent;
      if (text && window.__texts[window.__texts.length - 1] !== text) {
        window.__texts.push(text);
        window.__textTimes.push(performance.now());
      }
    }
  };
  new MutationObserver(note).observe(document, { childList: true, subtree: true, characterData: true });
}

/** A page on the interface, in `context` (a context has its own storage). */
async function open(context, { query = '?debug&moteur=factice&analyse=reel', viewport = { width: 1280, height: 800 } } = {}) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  await page.addInitScript(probe);
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice, null, { timeout: 15000 });
  // Marks of the analysis, on the page's clock.
  await page.evaluate(() => {
    window.__marks = { start: null, end: null };
    window.__steps = [];
    window.__fabtice.store.subscribe((s) => {
      const step = s.analysisRun.status === 'running' ? s.analysisRun.step : null;
      const last = window.__steps[window.__steps.length - 1];
      if (step && (!last || last.step !== step)) window.__steps.push({ step, t: performance.now() });
      if (s.analysisRun.status === 'running' && window.__marks.start === null) window.__marks.start = performance.now();
      if (window.__marks.start !== null && window.__marks.end === null && (s.analysis || s.analysisRun.status === 'error')) window.__marks.end = performance.now();
    });
  });
  return { page, errors };
}

const state = (page) => page.evaluate(() => {
  const s = window.__fabtice.store.getState();
  return { projectId: s.project ? s.project.id : null, engine: s.transport.engine, run: s.analysisRun, hasAnalysis: !!s.analysis, tracks: s.tracks.length, importKind: s.ui.import.kind };
});
const result = (page) => page.evaluate(() => window.__fabtice.store.getState().analysis);

async function openDialog(page) {
  await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
  // A piece imported earlier reads « modified »: the alert about changes not saved comes first (C5).
  await page.locator('[data-testid="alerte-abandonner"]').click({ timeout: 1500 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.voile')?.classList.contains('ouverte'));
  await sleep(260);
}

async function pickFile(page, file) {
  await page.locator('.accueil input[type="file"]').setInputFiles(file);
}

/** Imports a file from the welcome screen and waits for the piece to play. */
async function importFile(page, file) {
  await pickFile(page, file);
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && s.transport.engine === 'ready' && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
  }, null, { timeout: 60000 });
}

/**
 * Imports a piece of `seconds` made in the page by repeating the demo file (a
 * 16-bit mono WAV, handed to the file picker like a real file would be).
 */
async function importLong(page, seconds, name = 'long.wav', loopSeconds = 0) {
  await page.evaluate(async ([secs, mp3, fileName, loop]) => {
    const data = await (await fetch(mp3)).arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
    const one = loop ? decoded.getChannelData(0).subarray(0, Math.round(loop * 44100)) : decoded.getChannelData(0);
    const n = Math.round(secs * 44100);
    const wav = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (o, t) => [...t].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
    text(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); text(8, 'WAVEfmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, 44100, true); wav.setUint32(28, 88200, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
    text(36, 'data'); wav.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, one[i % one.length])) * 32767, true);
    const dt = new DataTransfer();
    dt.items.add(new File([wav.buffer], fileName, { type: 'audio/wav' }));
    const input = document.querySelector('.accueil input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [seconds, '/spikes/analyse/demo/demo-swing.mp3', name, loopSeconds]);
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && s.transport.engine === 'ready' && s.ui.import.kind === 'idle' && !s.ui.newPieceOpen;
  }, null, { timeout: 120000 });
}

/** Waits until the analysis of the open piece ended: a result, or an error state. */
async function analysisEnded(page, timeout = 240000) {
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.analysis || s.analysisRun.status === 'error';
  }, null, { timeout, polling: 100 });
}

/** Opens the status panel and presses the named button (« Arrêter l’analyse », « Analyser de nouveau »). */
async function panelButton(page, name) {
  const panel = page.locator('.panneau-analyse');
  if (!(await panel.count())) await page.locator('[data-testid="analyse-etat"], .analyse-etat button').first().click();
  await page.locator(`.panneau-analyse button:has-text("${name}")`).click();
}

/** When each step of the analysis began, in seconds after its start (from the store's status). */
async function stepStarts(page) {
  const { steps, start, end } = await page.evaluate(() => ({ steps: window.__steps, start: window.__marks.start, end: window.__marks.end }));
  return `${steps.map((x) => `${x.step} ${((x.t - start) / 1000).toFixed(1)}`).join(', ')}, end ${((end - start) / 1000).toFixed(1)}`;
}

/** Marks of the analysis and the longest tasks of the main thread inside them. */
async function mainThread(page) {
  return page.evaluate(() => {
    const { start, end } = window.__marks;
    const from = start ?? 0;
    const to = end ?? performance.now();
    const long = window.__long.filter((e) => e.start + e.duration >= from && e.start <= to);
    const lag = window.__lag.filter((e) => e.at >= from && e.at <= to);
    return {
      seconds: (to - from) / 1000,
      longestTask: long.reduce((m, e) => Math.max(m, e.duration), 0),
      longTasks: long.length,
      tasks: long.map((e) => `${((e.start - from) / 1000).toFixed(1)} s: ${e.duration.toFixed(0)} ms`),
      worstLag: lag.reduce((m, e) => Math.max(m, e.late), 0),
    };
  });
}

// ---------------------------------------------- memory of the browser's processes (Linux)

function descendants(rootPid) {
  const children = new Map();
  for (const dir of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(dir)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${dir}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(Number(dir));
    } catch {
      // the process ended
    }
  }
  const out = [];
  const walk = (pid) => {
    for (const c of children.get(pid) ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(rootPid);
  return out;
}

function rssMegabytes() {
  let kb = 0;
  for (const pid of descendants(process.pid)) {
    try {
      const m = /VmRSS:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'));
      if (m) kb += Number(m[1]);
    } catch {
      // the process ended
    }
  }
  return kb / 1024;
}

/** Samples the browser's memory until `stop()` is called; resolves with { before, peak }. */
function watchMemory() {
  const before = process.platform === 'linux' ? rssMegabytes() : 0;
  let peak = before;
  const timer = setInterval(() => {
    if (process.platform === 'linux') peak = Math.max(peak, rssMegabytes());
  }, 200);
  return () => {
    clearInterval(timer);
    return { before, peak };
  };
}

// ------------------------------------------------------ comparison with what is known

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Compares an `AnalysisResult` with demo-swing.json. */
function compare(r) {
  const times = r.beats.times;
  const truth = TRUTH.beats.map((b) => b[0]);
  const TOL = 0.07;
  const hit = truth.filter((t) => times.some((b) => Math.abs(b - t) <= TOL)).length;
  const good = times.filter((b) => truth.some((t) => Math.abs(b - t) <= TOL)).length;
  const recall = hit / truth.length;
  const precision = good / times.length;
  const truthDowns = TRUTH.beats.filter((b) => b[1] === 1).map((b) => b[0]);
  const downs = times.filter((_, i) => ((i - r.beats.downbeat) % r.beats.meter.numerator + r.beats.meter.numerator) % r.beats.meter.numerator === 0);
  const downHit = truthDowns.filter((t) => downs.some((b) => Math.abs(b - t) <= TOL)).length;
  // Chords: share of the time (sampled every 50 ms) where the root, then root and quality, are right.
  const at = (t) => {
    let found = null;
    for (const c of r.chords) if (c.time <= t) found = c;
    return found;
  };
  let total = 0;
  let roots = 0;
  let rootsAndQualities = 0;
  for (const [a, b, , basic] of TRUTH.chords) {
    const [rootName, quality] = basic.split(':');
    const root = PCS.indexOf(rootName);
    for (let t = a; t < b; t += 0.05) {
      total++;
      const c = at(t)?.chord;
      if (!c) continue;
      if (c.root === root) roots++;
      if (c.root === root && c.quality === quality) rootsAndQualities++;
    }
  }
  const [keyName, mode] = TRUTH.key.split(':');
  return {
    recall, precision, downHit, downTotal: truthDowns.length,
    meter: r.beats.meter.numerator,
    keyOk: !!r.key && r.key.tonic === PCS.indexOf(keyName) && r.key.mode === mode,
    tuning: r.tuning?.cents ?? NaN,
    roots: roots / total, rootsAndQualities: rootsAndQualities / total,
  };
}

// ------------------------------------------------------------------- scenarios

const scenarios = {};

/** First use: download, then analysis of the demo file; compared with the known answer. */
scenarios.first = async () => {
  const context = await browser.newContext();
  const requests = [];
  context.on('request', (req) => {
    if (/huggingface\.co|\.hf\.co/.test(req.url())) requests.push(req.url().replace(/\?.*/, ''));
  });
  const { page, errors } = await open(context);
  const stop = watchMemory();
  const t0 = Date.now();
  await importFile(page, SWING);
  const imported = Date.now();
  await analysisEnded(page);
  const total = (Date.now() - t0) / 1000;
  const memory = stop();
  await page.evaluate(() => (window.__marks = { ...window.__fine }));
  const st = await state(page);
  check('first use: the analysis ends with a result', st.hasAnalysis && st.run.status === 'idle', JSON.stringify(st.run));
  check('first use: the piece stayed playable', st.engine === 'ready' && st.tracks === 1);
  const texts = await page.evaluate(() => window.__texts);
  check('first use: the download of the analysis tools is announced, in French', texts.some((x) => /Outils d’analyse · \d+ %/.test(x)), texts.slice(0, 4).join(' | '));
  check('first use: the steps are announced in order', (() => {
    const order = ['Téléchargement', 'Préparation', 'accordage', 'rythme', 'accords', 'tonalité'].map((w) => texts.findIndex((x) => x.includes(w)));
    return order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v >= order[i - 1]);
  })(), texts.filter((x) => !/^Analyse · |^Outils/.test(x)).join(' | '));
  check('first use: the three files came from Hugging Face', ['logmel.onnx', 'beat_this_small0.onnx', 'crema_chords.onnx'].every((f) => requests.some((u) => u.endsWith(f))), requests.map((u) => path.basename(u)).join(', '));

  note(`steps began (s after the start of the analysis, tools downloaded): ${await stepStarts(page)}`);

  const r = await result(page);
  const c = compare(r);
  note(`beats: ${r.beats.times.length} found, recall ${(c.recall * 100).toFixed(1)} %, precision ${(c.precision * 100).toFixed(1)} % (prototype ${(PROTOTYPE.beatRecall * 100).toFixed(1)} / ${(PROTOTYPE.beatPrecision * 100).toFixed(1)}), downbeats ${c.downHit}/${c.downTotal} (prototype ${PROTOTYPE.downbeats})`);
  note(`meter ${c.meter}/4 (confidence ${r.beats.meterConfidence.toFixed(2)}), key ${r.key ? `${r.key.tonic} ${r.key.mode} (${r.key.confidence.toFixed(2)})` : 'none'}, tuning ${c.tuning.toFixed(1)} cents (known 30, prototype ${PROTOTYPE.tuning})`);
  note(`chords: ${r.chords.length} segments, roots right ${(c.roots * 100).toFixed(1)} % of the time (prototype ${(PROTOTYPE.roots * 100).toFixed(1)}), root and quality ${(c.rootsAndQualities * 100).toFixed(1)} % (prototype ${(PROTOTYPE.rootsAndQualities * 100).toFixed(1)}), doubtful ${r.chords.filter((x) => x.doubtful).length}`);
  check('beats: recall at least the prototype\'s, less 3 points', c.recall >= PROTOTYPE.beatRecall - 0.03);
  check('beats: precision at least the prototype\'s, less 3 points', c.precision >= PROTOTYPE.beatPrecision - 0.03);
  check('downbeats: at least the prototype\'s, less one', c.downHit >= PROTOTYPE.downbeats - 1);
  check('meter: 4/4', c.meter === 4 && r.beats.meter.denominator === 4);
  check('key: B major', c.keyOk);
  check('tuning: within 3 cents of the known 30', Math.abs(c.tuning - 30) <= 3);
  check('chord roots: at least the prototype\'s, less 3 points', c.roots >= PROTOTYPE.roots - 0.03);
  check('result: made by the real analyser, with its models', r.analyser.id === 'fabtice' && r.analyser.models.includes('beat-this-small0') && r.analyser.models.includes('crema-chords'), JSON.stringify(r.analyser));
  check('result: chords ascending, qualities and extensions valid', r.chords.every((x, i) => i === 0 || x.time > r.chords[i - 1].time) && r.chords.every((x) => x.chord === null || (typeof x.chord.root === 'number' && typeof x.chord.quality === 'string' && Array.isArray(x.chord.extensions))));
  check('result: the grid is applied (one segment per analysed beat)', await page.evaluate(() => window.__fabtice.store.getState().tempoMap.origin === 'analysis'));

  const mt = await mainThread(page);
  note(`demo file (${(await page.evaluate(() => window.__fabtice.store.getState().project.duration)).toFixed(1)} s of music): import ${((imported - t0) / 1000).toFixed(1)} s, then analysis ${mt.seconds.toFixed(1)} s with the download included; whole run ${total.toFixed(1)} s`);
  note(`main thread during the analysis: longest task ${mt.longestTask.toFixed(0)} ms (${mt.longTasks} over 50 ms${mt.tasks.length ? `: ${mt.tasks.join(', ')}` : ''}), worst timer lateness ${mt.worstLag.toFixed(0)} ms`);
  note(`browser memory: ${memory.before.toFixed(0)} MB before, peak ${memory.peak.toFixed(0)} MB (all browser processes, resident)`);
  check('main thread: no task over 200 ms during the analysis', mt.longestTask < 200 && mt.worstLag < 200, `${mt.longestTask.toFixed(0)} / ${mt.worstLag.toFixed(0)} ms`);
  check('no console error during the whole run', errors.length === 0, errors.join(' | '));

  // The worker is gone once the analysis is done (everything is given back).
  for (let i = 0; i < 30 && page.workers().length; i++) await sleep(100);
  check('the worker ended with the analysis', page.workers().length === 0, `${page.workers().length} workers`);

  // ------ second use in the same browser profile: nothing is downloaded
  const before = requests.length;
  const second = await open(context);
  await importFile(second.page, SWING);
  await analysisEnded(second.page);
  const again = await state(second.page);
  const texts2 = await second.page.evaluate(() => window.__texts);
  check('second use: analysed again', again.hasAnalysis);
  check('second use: nothing downloaded (no request to the hub)', requests.length === before, `${requests.length - before} requests`);
  check('second use: no download step shown', !texts2.some((x) => /Outils d’analyse|Téléchargement/.test(x)));
  const r2 = await result(second.page);
  check('second use: same result as the first', JSON.stringify(r2.beats.times) === JSON.stringify(r.beats.times) && JSON.stringify(r2.chords.map((x) => x.chord)) === JSON.stringify(r.chords.map((x) => x.chord)));
  note(`second use (models kept): steps began ${await stepStarts(second.page)}`);
  const mt2 = await mainThread(second.page);
  note(`second use: analysis ${mt2.seconds.toFixed(1)} s, longest main-thread task ${mt2.longestTask.toFixed(0)} ms, worst timer lateness ${mt2.worstLag.toFixed(0)} ms`);
  check('second use: no console error', second.errors.length === 0, second.errors.join(' | '));
  await context.close();
};

/**
 * The status panel that opens by itself during the first download of the tools
 * (a fresh browser context keeps none): it leaves by itself when the analysis
 * ends, unless the user touched it; an error keeps it open.
 */
scenarios.panel = async () => {
  const panelOpen = async (page) => (await page.locator('.panneau-analyse').count()) > 0;
  const waitPanel = (page, open, timeout = 4000) =>
    page.waitForFunction((want) => !!document.querySelector('.panneau-analyse') === want, open, { timeout, polling: 50 }).then(() => true, () => false);

  // --- 1. left alone: it opens by itself, then closes by itself when the analysis is done
  {
    const context = await browser.newContext(); // empty storage: the tools are downloaded
    const { page, errors } = await open(context);
    await importFile(page, SWING);
    await waitStep(page, 'download');
    check('panel, first download: it opens by itself', await waitPanel(page, true), 'no panel');
    check('panel, first download: it explains where the tools come from', /Hugging Face|huggingface/i.test(await page.locator('.panneau-analyse').innerText().catch(() => '')));
    await analysisEnded(page);
    check('panel, left alone: it closes by itself when the analysis ends', await waitPanel(page, false), 'still open');
    check('panel, left alone: the analysis succeeded', (await state(page)).hasAnalysis);
    check('panel, left alone: no console error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- 2. touched by the user: it stays open (the hub is held back until the user has pressed in the panel)
  {
    const context = await browser.newContext();
    let release;
    const gate = new Promise((r) => (release = r));
    await context.route(HUB, async (route) => {
      await gate;
      await route.continue();
    });
    const { page, errors } = await open(context);
    await importFile(page, SWING);
    await waitStep(page, 'download');
    check('panel, touched: it opens by itself', await waitPanel(page, true), 'no panel');
    await page.locator('.panneau-analyse h2').click(); // the user reads it, presses in it
    release();
    await analysisEnded(page);
    await sleep(1200);
    check('panel, touched: it stays open after the analysis, which succeeded', (await panelOpen(page)) && (await state(page)).hasAnalysis);
    check('panel, touched: no console error', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // --- 3. the status button pressed twice (closed, opened again by the user): it stays too
  {
    const context = await browser.newContext();
    let release;
    const gate = new Promise((r) => (release = r));
    await context.route(HUB, async (route) => {
      await gate;
      await route.continue();
    });
    const { page } = await open(context);
    await importFile(page, SWING);
    await waitStep(page, 'download');
    await waitPanel(page, true);
    await page.locator('[data-testid="analyse-etat"]').click();
    check('panel, status button: pressed once it closes', await waitPanel(page, false), 'still open');
    await page.locator('[data-testid="analyse-etat"]').click();
    check('panel, status button: pressed again it opens', await waitPanel(page, true), 'not open');
    release();
    await analysisEnded(page);
    await sleep(1200);
    check('panel, status button: it stays open after the analysis', await panelOpen(page));
    await context.close();
  }

  // --- 4. an error keeps it open, with the reason
  {
    const context = await browser.newContext();
    await context.route(HUB, (route) => route.abort('internetdisconnected'));
    const { page } = await open(context);
    await importFile(page, SWING);
    check('panel, error: it opened by itself for the download', await waitPanel(page, true, 15000), 'no panel');
    await analysisEnded(page, 60000);
    await sleep(1200);
    const st = await state(page);
    const text = (await panelOpen(page)) ? await page.locator('.panneau-analyse').innerText() : '';
    check('panel, error: the analysis failed', st.run.status === 'error' && st.run.code === 'download-failed', JSON.stringify(st.run));
    check('panel, error: it stays open and says what happened', (await panelOpen(page)) && /n’ont pas pu être téléchargés/.test(text), text.replace(/\s+/g, ' '));
    await context.close();
  }
};

const HUB = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co)\//;
const CREMA_URL = 'https://huggingface.co/thebluescreen/crema-chords-onnx/resolve/302ae89e3ed7753fc8da9cb08274aff446d8fe47/crema_chords.onnx';
const CREMA = { id: 'crema-chords', bytes: 2728454, sha256: '3222e641f23f668caabb48498d8d4db258216753af8d1da2753da002eb786c1e' };

/** What the device keeps of the analysis tools, read from IndexedDB; each kept file is checked against its digest. */
const keptTools = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice-analysis-tools');
        open.onerror = () => resolve({ files: {}, parts: {} });
        open.onupgradeneeded = () => open.transaction.abort();
        open.onsuccess = async () => {
          const db = open.result;
          const all = (store) =>
            new Promise((ok) => {
              const r = db.transaction(store).objectStore(store).getAll();
              r.onsuccess = () => ok(r.result);
              r.onerror = () => ok([]);
            });
          const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
          const files = {};
          for (const f of await all('files')) files[f.id] = { bytes: f.data.byteLength, digestOk: (await hex(f.data)) === f.sha256 };
          const parts = {};
          for (const p of await all('parts')) parts[p.id] = (parts[p.id] ?? 0) + p.data.byteLength;
          db.close();
          resolve({ files, parts });
        };
      }),
  );

/** The panel's text (opens it if needed). */
async function panelText(page) {
  if (!(await page.locator('.panneau-analyse').count())) await page.locator('[data-testid="analyse-etat"]').first().click();
  return page.locator('.panneau-analyse').innerText();
}

const runStep = (page) =>
  page.evaluate(() => {
    const r = window.__fabtice.store.getState().analysisRun;
    return r.status === 'running' ? r.step : r.status;
  });

async function waitStep(page, step, timeout = 120000) {
  await page.waitForFunction(
    (st) => {
      const r = window.__fabtice.store.getState().analysisRun;
      return r.status === 'running' && r.step === st;
    },
    step,
    { timeout, polling: 50 },
  );
}

async function waitNoWorkers(page, ms = 6000) {
  const t0 = Date.now();
  for (let i = 0; i < ms / 100 && page.workers().length; i++) await sleep(100);
  const gone = page.workers().length === 0;
  if (gone && Date.now() - t0 > 400) note(`workers took ${Date.now() - t0} ms to be gone`);
  return gone;
}

/** Cancellation: in the panel, by a new import, and during the download. */
scenarios.cancel = async () => {
  const context = await browser.newContext();
  const { page, errors } = await open(context);
  await importFile(page, SWING);
  await analysisEnded(page); // the tools are now on the device

  // --- in the panel, while the networks run
  await openDialog(page);
  await pickFile(page, SWING);
  await waitStep(page, 'beats');
  const t0 = Date.now();
  await panelButton(page, 'Arrêter l’analyse');
  await page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status === 'idle', null, { timeout: 3000 });
  const took = Date.now() - t0;
  check('cancel in the panel: the status is idle at once', took < 1500, `${took} ms`);
  check('cancel in the panel: no result kept', !(await state(page)).hasAnalysis);
  check('cancel in the panel: the piece stays playable', (await state(page)).engine === 'ready');
  check('cancel in the panel: the worker is ended', await waitNoWorkers(page), `${page.workers().length} workers`);
  await sleep(1500);
  check('cancel in the panel: nothing comes back afterwards', !(await state(page)).hasAnalysis && (await runStep(page)) === 'idle');
  // And an analysis started again works.
  await panelButton(page, 'Analyser le morceau');
  await analysisEnded(page);
  check('cancel in the panel: a new analysis works afterwards', (await state(page)).hasAnalysis);

  // --- a new import cancels the analysis of the previous piece
  await openDialog(page);
  await pickFile(page, SWING);
  await waitStep(page, 'beats');
  const first = (await state(page)).projectId;
  await openDialog(page);
  await pickFile(page, TONE);
  await page.waitForFunction(
    (id) => {
      const s = window.__fabtice.store.getState();
      return s.project && s.project.id !== id && s.transport.engine === 'ready';
    },
    first,
    { timeout: 30000 },
  );
  const second = await state(page);
  check('a new import: the piece changed', second.projectId !== first);
  await analysisEnded(page);
  const r2 = await result(page);
  const st2 = await state(page);
  // The new piece is a 1.5 s tone: the analysis of it says « no music », not « failed », not a result of the old piece.
  check('a new import: the new piece gets its own verdict (nothing to analyse)', !r2 && st2.run.status === 'error' && st2.run.code === 'no-music', r2 ? `duration ${r2.duration.toFixed(1)} s` : JSON.stringify(st2.run));
  check('a new import: no worker left', await waitNoWorkers(page, 20000), `${page.workers().length} workers`);
  check('cancel: no console error', errors.length === 0, errors.join(' | '));
  await context.close();

  // --- during the download (a hub that never answers)
  const fresh = await browser.newContext();
  await fresh.route(HUB, () => {}); // never fulfilled: the download hangs
  const hung = await open(fresh);
  await importFile(hung.page, SWING);
  await waitStep(hung.page, 'download');
  await sleep(500);
  const t1 = Date.now();
  await panelButton(hung.page, 'Arrêter l’analyse');
  await hung.page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status === 'idle', null, { timeout: 3000 });
  check('cancel during the download: the status is idle at once', Date.now() - t1 < 1500, `${Date.now() - t1} ms`);
  check('cancel during the download: the worker is ended', await waitNoWorkers(hung.page), `${hung.page.workers().length} workers`);
  check('cancel during the download: the piece stays playable', (await state(hung.page)).engine === 'ready');
  await fresh.close();
};

/** The network is missing: the piece stays usable, the analysis can start again later. */
scenarios.network = async () => {
  const context = await browser.newContext();
  await context.route(HUB, (route) => route.abort('internetdisconnected'));
  const { page, errors } = await open(context);
  await importFile(page, SWING);
  const t0 = Date.now();
  await analysisEnded(page, 60000);
  const st = await state(page);
  check('network missing: the analysis stops with the download error', st.run.status === 'error' && st.run.code === 'download-failed', JSON.stringify(st.run));
  note(`network missing: reported after ${((Date.now() - t0) / 1000).toFixed(1)} s (three tries)`);
  check('network missing: the piece stays usable', st.engine === 'ready' && st.tracks === 1 && !st.hasAnalysis);
  const text = await panelText(page);
  check('network missing: the panel says so in French, and says what to do', /n’ont pas pu être téléchargés/.test(text) && /connexion/.test(text) && /jouable/.test(text), text.replace(/\s+/g, ' '));
  check('network missing: nothing was kept', Object.keys((await keptTools(page)).files).length === 0);
  check('network missing: no worker left', await waitNoWorkers(page));
  // The connection comes back: the same button starts the analysis again.
  await context.unroute(HUB);
  await panelButton(page, 'Analyser de nouveau');
  await analysisEnded(page);
  check('network back: the analysis starts again and succeeds', (await state(page)).hasAnalysis);
  const kept = await keptTools(page);
  check('network back: the three tools are kept and intact', ['beat-this-logmel', 'beat-this-small0', 'crema-chords'].every((id) => kept.files[id]?.digestOk), JSON.stringify(kept.files));
  check('network: no console error', errors.length === 0, errors.join(' | '));
  await context.close();
};

/** A damaged download is refused and fetched again; refused for good after three tries. */
scenarios.integrity = async () => {
  // --- damaged once, then fine
  let context = await browser.newContext();
  let seen = 0;
  await context.route(/crema_chords\.onnx/, (route) => {
    seen++;
    if (seen === 1) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body: Buffer.alloc(CREMA.bytes, 7) });
    return route.continue();
  });
  let { page, errors } = await open(context);
  await importFile(page, SWING);
  await analysisEnded(page);
  check('damaged once: the analysis still succeeds', (await state(page)).hasAnalysis);
  check('damaged once: the file was fetched again', seen === 2, `${seen} requests`);
  let kept = await keptTools(page);
  check('damaged once: the kept file is the intact one', kept.files['crema-chords']?.digestOk === true && kept.files['crema-chords'].bytes === CREMA.bytes, JSON.stringify(kept));
  check('damaged once: no piece of download left behind', Object.keys(kept.parts).length === 0, JSON.stringify(kept.parts));
  check('damaged once: no console error', errors.length === 0, errors.join(' | '));
  await context.close();

  // --- always damaged
  context = await browser.newContext();
  seen = 0;
  await context.route(/logmel\.onnx/, (route) => {
    seen++;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body: Buffer.alloc(4468830, 9) });
  });
  ({ page, errors } = await open(context));
  await importFile(page, SWING);
  await analysisEnded(page, 60000);
  const st = await state(page);
  check('always damaged: refused, the analysis stops with the download error', st.run.status === 'error' && st.run.code === 'download-failed', JSON.stringify(st.run));
  check('always damaged: tried three times, no more', seen === 3, `${seen} requests`);
  kept = await keptTools(page);
  check('always damaged: the damaged file is not kept', !kept.files['beat-this-logmel'] && !kept.parts['beat-this-logmel'], JSON.stringify(kept));
  check('always damaged: the piece stays usable', st.engine === 'ready' && st.tracks === 1);
  await context.close();
};

/** The hub answers ranged requests from this origin, and an interrupted download is resumed. */
scenarios.resume = async () => {
  const context = await browser.newContext();
  const ranges = [];
  context.on('request', (req) => {
    if (/crema_chords\.onnx/.test(req.url()) && req.headers().range) ranges.push(req.headers().range);
  });
  const { page, errors } = await open(context);
  const probeResult = await page.evaluate(async (url) => {
    const res = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    return { status: res.status, range: res.headers.get('Content-Range'), length: (await res.arrayBuffer()).byteLength };
  }, CREMA_URL);
  check('the hub answers a ranged request from this origin (206)', probeResult.status === 206 && probeResult.length === 100 && /\/2728454$/.test(probeResult.range ?? ''), JSON.stringify(probeResult));
  ranges.length = 0;
  // A download interrupted at 1 000 000 bytes: its first piece is already on the device.
  const have = 1_000_000;
  await page.evaluate(
    async ([url, have]) => {
      const part = await (await fetch(url, { headers: { Range: `bytes=0-${have - 1}` } })).arrayBuffer();
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('fabtice-analysis-tools', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('files', { keyPath: 'id' });
          open.result.createObjectStore('parts', { keyPath: ['id', 'index'] });
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('parts', 'readwrite');
          tx.objectStore('parts').put({ id: 'crema-chords', index: 0, data: part });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      });
    },
    [CREMA_URL, have],
  );
  ranges.length = 0; // the seeding above asked for a range of its own
  check('resume: the interrupted piece is on the device', (await keptTools(page)).parts['crema-chords'] === have);
  await importFile(page, SWING);
  await analysisEnded(page);
  check('resume: the analysis succeeds', (await state(page)).hasAnalysis);
  check('resume: only the rest was asked for', ranges.length === 1 && ranges[0] === `bytes=${have}-`, ranges.join(' | '));
  const kept = await keptTools(page);
  check('resume: the assembled file is intact and the pieces are gone', kept.files['crema-chords']?.digestOk === true && !kept.parts['crema-chords'], JSON.stringify(kept));
  check('resume: no console error', errors.length === 0, errors.join(' | '));
  await context.close();
};

/** The piece plays (real audio engine) while the analysis works: the audio thread is not starved. */
scenarios.playing = async () => {
  const context = await browser.newContext();
  const { page, errors } = await open(context, { query: '?debug&analyse=reel' });
  await importFile(page, SWING);
  await analysisEnded(page); // the tools are on the device
  await sleep(6000); // memory and threads settle
  await openDialog(page);
  await page.evaluate(() => {
    window.__marks = { start: null, end: null };
  });
  await importLong(page, 240);
  await page.waitForFunction(() => window.__fabtice.store.getState().analysisRun.status === 'running', null, { timeout: 10000 }).catch(() => {});
  await waitStep(page, 'beats');
  const t0 = Date.now();
  await page.locator('button.jouer').click();
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'playing', null, { timeout: 20000 });
  const position = () => page.locator('[data-testid="temps"]').innerText();
  const p0 = await position();
  await sleep(5000);
  const p1 = await position();
  const running = (await runStep(page)) !== 'idle';
  const diag = await page.evaluate(() => window.__fabtice.engine.diagnostics());
  note(`playing during the analysis of a 4-minute piece: clock ${p0} -> ${p1} in ${((Date.now() - t0) / 1000).toFixed(1)} s, analysis still running: ${running}, audio thread: ${diag.overBudget} quanta over budget, ${diag.missingChunks} missing chunks, load average ${diag.loadAvg.toFixed(2)}, worst ${diag.loadMax.toFixed(2)}`);
  check('playing during the analysis: the clock moves', p1 !== p0);
  check('playing during the analysis: the audio thread keeps up (no quantum over budget, no missing chunk)', diag.overBudget === 0 && diag.missingChunks === 0, JSON.stringify(diag));
  await page.locator('button.jouer').click();
  await analysisEnded(page, 300000);
  check('playing during the analysis: the analysis still ends', (await state(page)).hasAnalysis);
  check('playing during the analysis: no console error', errors.length === 0, errors.join(' | '));
  await context.close();
};

/** A 4-minute piece: the cost of a real piece, and the memory it takes. */
scenarios.long = async () => {
  const context = await browser.newContext();
  const { page, errors } = await open(context);
  // The models first, with the short piece; then a pause for the browser to give its memory back.
  await importFile(page, SWING);
  await analysisEnded(page);
  await sleep(9000);
  await openDialog(page);
  await page.evaluate(() => {
    window.__marks = { start: null, end: null };
    window.__texts = [];
    window.__textTimes = [];
    window.__steps = [];
  });
  const stop = watchMemory();
  await importLong(page, 240);
  await analysisEnded(page, 600000);
  const memory = stop();
  const st = await state(page);
  const r = await result(page);
  const mt = await mainThread(page);
  check('4 minutes: analysed', st.hasAnalysis && r.beats.times.length > 300, `${r.beats.times.length} beats, ${r.chords.length} chords`);
  note(`4-minute piece (${r.duration.toFixed(0)} s): analysis ${mt.seconds.toFixed(1)} s (models kept), ${r.beats.times.length} beats, ${r.chords.length} chords`);
  note(`4-minute piece: steps began ${await stepStarts(page)}`);
  note(`4-minute piece: browser memory ${memory.before.toFixed(0)} MB before, peak ${memory.peak.toFixed(0)} MB`);
  note(`4-minute piece: longest main-thread task ${mt.longestTask.toFixed(0)} ms (${mt.longTasks} over 50 ms), worst timer lateness ${mt.worstLag.toFixed(0)} ms`);
  check('4 minutes: main thread stays fluid (no task over 200 ms)', mt.longestTask < 200 && mt.worstLag < 200);
  check('4 minutes: no console error', errors.length === 0, errors.join(' | '));
  await context.close();
};


/**
 * Known chart (CLAUDE.md, analysis, means 3), end to end: a small invented library is kept on the
 * device; a piece whose title is in it gets the chart fitted and used (`evidence.knownChart`), with
 * the form found by its repeats; a title whose chart does not match the audio is rejected.
 */
scenarios.charts = async () => {
  const context = await browser.newContext();
  const { page, errors } = await open(context, { query: '?debug&analyse=reel' });
  // The demo's 20 bars as a lead sheet (B major), and an unrelated blues.
  const demo = '[T44B^7   |Co7   |C#-7   |F#7   |E-7   |A7   |B^7   |B^7   |B7   |E7   |B7   |B7   |E7   |E7   |B7   |B7   |E-7   |A7   |B^7   |B^7   Z';
  const blues = '[T44F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |G-7   |C7   |F7   |C7   Z';
  const other = '[T44C^7   |A-7   |D-7   |G7   |E-7   |A7   |D-7   |G7   Z';
  const html = playlistFile([
    { title: 'Fixture Swing Tune', key: 'B', chart: demo },
    { title: 'Fixture Wrong Tune', key: 'F', chart: blues },
    ...Array.from({ length: 12 }, (_, i) => ({ title: `Fixture Filler ${i + 1}`, chart: i % 2 ? blues : other })),
  ], 'Fixture Book');
  const kept = await page.evaluate(async (text) => {
    const r = await window.__fabtice.standards.importStandardsFile({ name: 'fixture-book.html', size: text.length, text: async () => text });
    return r.ok ? r.tunes : -1;
  }, html);
  check('charts: the invented library is kept on the device', kept === 14, `${kept} tunes`);
  const run = async (name) => {
    // The demo's 20 bars end at 35.65 s: looped there, the piece is the form played three times.
    await importLong(page, 3 * 35.649581, name, 35.649581);
    await analysisEnded(page);
    return page.evaluate(() => {
      const a = window.__fabtice.store.getState().analysis;
      return a ? { evidence: a.evidence ?? null, version: a.analyser.version, chords: a.chords.length } : null;
    });
  };
  const right = await run('Fixture Swing Tune.wav');
  check('charts: the title found, the chart accepted and used', right?.evidence?.knownChart?.title === 'Fixture Swing Tune', JSON.stringify(right?.evidence));
  check('charts: the collection is named', typeof right?.evidence?.knownChart?.collection === 'string', String(right?.evidence?.knownChart?.collection));
  check('charts: the bass line is listened to (band of the mix)', right?.evidence?.bass === 'band');
  check('charts: analyser version 5', right?.version === '5', String(right?.version));
  await page.evaluate(() => window.__fabtice.actions.openPanel('analysis'));
  const line = await page.locator('[data-testid="analyse-ecoute"]').innerText({ timeout: 5000 }).catch(() => '');
  check('charts: the analysis panel says what was used', line.includes('Grille connue : Fixture Swing Tune (Fixture Book)'), line);
  await page.evaluate(() => window.__fabtice.actions.closePanel());
  note(`charts: form found by the repeats: ${right?.evidence?.formBars} bars (the demo's 20 bars, played three times)`);
  await openDialog(page);
  const wrong = await run('Fixture Wrong Tune.wav');
  check('charts: a chart that does not match the audio is rejected', !!wrong?.evidence && wrong.evidence.knownChart === null, JSON.stringify(wrong?.evidence));
  check('charts: no console error', errors.length === 0, errors.join(' | '));
};

/** Chooses the chord model in Réglages → Détection des accords, as a user would. */
async function chooseChordModel(page, value) {
  const panel = await openSettingsTab(page, 'chords');
  await page.selectOption('[data-testid="modele-accords"]', value);
  return panel.innerText();
}

/**
 * The fine chord model (Tsumugi-Chords, optional): chosen in the advanced settings, its 68 MB
 * downloaded for real from Hugging Face, the demo piece analysed (2 windows of 30 s), progress
 * per window, the model recorded in the result; then its fallback to CREMA (a simulated
 * failure). Several minutes: not in the default list, run it with FABTICE_ANALYSIS_ONLY=fin.
 */
scenarios.fin = async () => {
  const context = await browser.newContext();
  const requests = [];
  context.on('request', (req) => {
    if (/huggingface\.co|\.hf\.co/.test(req.url())) requests.push(req.url().replace(/\?.*/, ''));
  });
  const { page, errors } = await open(context);
  // The piece is first analysed with the default model; then the fine one is chosen and
  // « Analyser de nouveau ce morceau avec ce modèle » pressed, as the owner would.
  await importFile(page, SWING);
  await analysisEnded(page);
  const before = await result(page);
  check('fine: first analysed with the default model', before.analyser.models.includes('crema-chords'));
  const settings = await chooseChordModel(page, 'fine');
  check('fine: the setting states the cost and the licence plainly', /plusieurs minutes/.test(settings) && /2,5 Go/.test(settings) && /CC BY-NC 4\.0/.test(settings) && /68 Mo/.test(settings), settings.replace(/\s+/g, ' ').slice(0, 400));
  check('fine: the choice is kept on this device', (await page.evaluate(() => localStorage.getItem('fabtice.chordModel.v1'))) === 'fine');
  check('fine: analysing the open piece again is offered', settings.includes('Analyser de nouveau ce morceau avec ce modèle'));
  // Marks of this second analysis: from its start to its result (the page's own marks belong to the first).
  await page.evaluate(() => {
    window.__texts = [];
    window.__steps = [];
    const first = window.__fabtice.store.getState().analysis;
    window.__firstAnalysis = first;
    window.__fine = { start: null, end: null };
    window.__fabtice.store.subscribe((s) => {
      const f = window.__fine;
      if (s.analysisRun.status === 'running' && f.start === null) f.start = performance.now();
      if (f.start !== null && f.end === null && ((s.analysis && s.analysis !== first) || s.analysisRun.status === 'error')) f.end = performance.now();
    });
  });
  const stop = watchMemory();
  const t0 = Date.now();
  await page.click('[data-testid="modele-accords-relancer"]');
  await page.keyboard.press('Escape');
  // Window progress, sampled from the fine progress store as it goes.
  await page.evaluate(() => {
    window.__windows = [];
    setInterval(() => {
      const w = document.querySelector('[data-testid="analyse-etat"]')?.textContent ?? '';
      if (/écoute fine/.test(w) && window.__windows[window.__windows.length - 1]?.text !== w) window.__windows.push({ text: w, t: performance.now() });
    }, 50);
  });
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return (s.analysis && s.analysis !== window.__firstAnalysis) || s.analysisRun.status === 'error';
  }, null, { timeout: 900000, polling: 200 });
  const total = (Date.now() - t0) / 1000;
  const memory = stop();
  await page.evaluate(() => (window.__marks = { ...window.__fine }));
  const st = await state(page);
  check('fine: the analysis ends with a result', st.hasAnalysis && st.run.status === 'idle', JSON.stringify(st.run));
  check('fine: its weights came from Hugging Face', requests.some((u) => u.endsWith('chord-model.safetensors')), requests.map((u) => path.basename(u)).join(', '));
  const texts = await page.evaluate(() => window.__texts);
  const windows = await page.evaluate(() => window.__windows);
  // A steady percentage of the step (not one per window): in French, whole numbers, 0 to 100, never going back.
  const percents = windows.map((w) => /^Accords : écoute fine, (\d+) %$/.exec(w.text)).filter(Boolean).map((m) => Number(m[1]));
  check('fine: steady percentage in French, never going back', percents.length >= 3 && percents.every((p, i) => p >= 0 && p <= 100 && (i === 0 || p >= percents[i - 1])), windows.map((w) => w.text).join(' | '));
  check('fine: the percentage moves between windows (more steps than the 2 windows)', new Set(percents).size > 3, percents.join(' '));
  const r = await result(page);
  const c = compare(r);
  check('fine: the result records the fine model', r.analyser.models.includes('tsumugi-chords') && !r.analyser.models.includes('crema-chords') && r.chordModel?.id === 'tsumugi-chords' && !r.chordModel.fallback, JSON.stringify([r.analyser.models, r.chordModel]));
  // Measured with Python on this file (RECHERCHE.md): roots 0.948 frame by frame; after the decoding, at least CREMA's.
  check('fine: chord roots at least 0.90 of the time', c.roots >= 0.9, (c.roots * 100).toFixed(1));
  note(`fine model on the demo file: roots ${(c.roots * 100).toFixed(1)} %, root and quality ${(c.rootsAndQualities * 100).toFixed(1)} % (CREMA: prototype ${(PROTOTYPE.roots * 100).toFixed(1)} / ${(PROTOTYPE.rootsAndQualities * 100).toFixed(1)}), key ${c.keyOk ? 'right' : 'wrong'}`);
  note(`fine model steps: ${await stepStarts(page)}`);
  if (windows.length > 1) note(`fine model windows: ${windows.map((w, i) => (i ? `${((w.t - windows[i - 1].t) / 1000).toFixed(1)} s` : w.text)).join(', ')} (time between window reports)`);
  const mt = await mainThread(page);
  note(`fine model, first use (68 MB downloaded): analysis ${mt.seconds.toFixed(1)} s for ${(await page.evaluate(() => window.__fabtice.store.getState().project.duration)).toFixed(1)} s of music; whole run ${total.toFixed(1)} s`);
  note(`fine model: browser memory ${memory.before.toFixed(0)} MB before, peak ${memory.peak.toFixed(0)} MB (all browser processes, resident)`);
  check('fine: no task over 200 ms on the main thread', mt.longestTask < 200, `${mt.longestTask.toFixed(0)} ms`);
  // Opening the advanced settings probes the graphics chip for the separation tool: Chromium then says it has none (not a fault).
  const realErrors = errors.filter((e) => !/No available adapters/i.test(e));
  check('fine: no console error', realErrors.length === 0, realErrors.join(' | '));

  // Second use: the weights are kept; the analysis time alone.
  {
    const second = await open(context);
    const before = requests.length;
    const stop2 = watchMemory();
    await importFile(second.page, SWING);
    await analysisEnded(second.page, 900000);
    const m2 = stop2();
    const mt2 = await mainThread(second.page);
    check('fine, second use: nothing downloaded', requests.length === before, `${requests.length - before} requests`);
    note(`fine model, weights kept: analysis ${mt2.seconds.toFixed(1)} s; steps ${await stepStarts(second.page)}; peak memory ${m2.peak.toFixed(0)} MB`);
    await second.page.close();
  }

  // Fallback: the fine model fails (as on a device without memory): CREMA reads the chords, said calmly.
  for (const fail of ['memoire', 'session']) {
    const p = await open(context, { query: `?debug&moteur=factice&analyse=reel&echec-accords=${fail}` });
    await importFile(p.page, SWING);
    await analysisEnded(p.page, 900000);
    const rf = await result(p.page);
    const status = await p.page.locator('[data-testid="analyse-etat"]').innerText().catch(() => '');
    check(`fine, fallback (${fail}): CREMA read the chords and the result says so`, !!rf && rf.analyser.models.includes('crema-chords') && rf.chordModel?.fallback === (fail === 'memoire' ? 'memory' : 'failed'), JSON.stringify(rf?.chordModel));
    check(`fine, fallback (${fail}): the status line says it plainly`, /modèle rapide/.test(status), status);
    check(`fine, fallback (${fail}): no console error`, p.errors.length === 0, p.errors.join(' | '));
    await p.page.close();
  }
  await context.close();
};

// ---------------------------------------------------------------------- main

/** Long scenarios run only when asked by name. */
const ON_REQUEST = new Set(['fin']);
const only = process.env.FABTICE_ANALYSIS_ONLY;
try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (only ? only !== name : ON_REQUEST.has(name)) continue;
    console.log(`\n# ${name}`);
    browser = await launch();
    try {
      await run();
    } catch (e) {
      failed++;
      console.log(`FAIL  scenario ${name} threw: ${e && e.stack ? e.stack : e}`);
    } finally {
      await browser.close().catch(() => {});
    }
  }
} finally {
  srv.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
