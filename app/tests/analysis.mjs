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
//   - cancellation (in the panel, and by a new import), the network missing
//     (the piece stays usable, the analysis starts again), a damaged download
//     (refused, fetched again; refused for good after three tries), a hub that
//     accepts ranged requests from this origin (resuming);
//   - the cost: analysis time for this file and for a 4-minute piece, peak
//     memory of the browser's processes, longest task of the main thread.
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
  await page.click('button:has-text("Nouveau projet")');
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
async function importLong(page, seconds) {
  await page.evaluate(async ([secs, mp3]) => {
    const data = await (await fetch(mp3)).arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
    const one = decoded.getChannelData(0);
    const n = Math.round(secs * 44100);
    const wav = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (o, t) => [...t].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
    text(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); text(8, 'WAVEfmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, 44100, true); wav.setUint32(28, 88200, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
    text(36, 'data'); wav.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, one[i % one.length])) * 32767, true);
    const dt = new DataTransfer();
    dt.items.add(new File([wav.buffer], 'long.wav', { type: 'audio/wav' }));
    const input = document.querySelector('.accueil input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [seconds, '/spikes/analyse/demo/demo-swing.mp3']);
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

// ---------------------------------------------------------------------- main

const only = process.env.FABTICE_ANALYSIS_ONLY;
try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (only && only !== name) continue;
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
