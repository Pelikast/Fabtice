// Measures what « Alléger le travail pour l'appareil » really does to the processor, with the REAL analysis and the
// REAL separation (the lightest tool, SCNet, on the processor: this machine has no graphics chip), in Chromium.
// Not part of the regular suites (it takes several minutes and downloads the tools from Hugging Face once):
//   npm run build && npm run measure:ease
//
// Method: the processor time (user + system) of the browser's whole process tree, read from /proc every 200 ms
// (the largest value seen for each process, so a process that ends is still counted), divided by the wall-clock time of
// the computation. « Load » is that ratio, in cores kept busy on average; « relative » is the load against the
// unthrottled run of the same computation (what the setting promises: 75 % → 0.75). Elapsed-time ratio is the other
// side of the same coin. Each setting runs after a warm-up (the tools are downloaded once), on the same 25 s stereo
// excerpt of the demo piece. The machine should be otherwise idle: run it under the shared lock.
//   FABTICE_EASE_PERCENTS=75,50   the settings measured besides unticked (default 75,50)
//   FABTICE_EASE_SECONDS=25       the length of the excerpt
//   FABTICE_EASE_ONLY=analysis|separation
//   FABTICE_EASE_CHORDS=fine|crema  the chord model read by the analysis (default: what the device chooses by itself;
//                                  the test address holds the automatic choice to `crema`, so `fine` is stored explicitly)
// Playwright and Chromium are expected preinstalled (/opt/node-tools).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const PERCENTS = (process.env.FABTICE_EASE_PERCENTS || '75,50').split(',').map(Number);
const SECONDS = Number(process.env.FABTICE_EASE_SECONDS || 25);
const ONLY = process.env.FABTICE_EASE_ONLY || null;
const note = (s) => console.log(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = `--fabtice-ease-measure=${process.pid}`;
const TICKS = 100; // clock ticks per second (getconf CLK_TCK on Linux)

// ---------------------------------------------------------------- the processor time of the browser's tree
const seen = new Map(); // pid -> ticks (the largest seen)
function sample() {
  try {
    const rows = execSync('ps -eo pid=,ppid=,args=', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
    const tree = new Set(rows.filter((r) => r.args.includes(MARK)).map((r) => r.pid));
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of rows) if (!tree.has(r.pid) && tree.has(r.ppid)) (tree.add(r.pid), (grew = true));
    }
    for (const pid of tree) {
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const ticks = Number(after[11]) + Number(after[12]); // utime + stime (fields 14 and 15)
        if (ticks > (seen.get(pid) ?? 0)) seen.set(pid, ticks);
      } catch {
        // the process ended between the two reads
      }
    }
  } catch {
    // ps unavailable: the figures will say so
  }
}
const cpuSeconds = () => {
  sample();
  let n = 0;
  for (const t of seen.values()) n += t;
  return n / TICKS;
};

// ---------------------------------------------------------------- the page
const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', MARK] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const CHORDS = process.env.FABTICE_EASE_CHORDS || null;
if (CHORDS) await context.addInitScript((m) => localStorage.setItem('fabtice.chordModel.v1', m), CHORDS);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/No available adapters|Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.goto(`${url}/?debug&moteur=factice&analyse=reel&separation=reel`);
await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
const isolated = await page.evaluate(() => crossOriginIsolated);

/** WAV bytes of `seconds` of the demo piece, stereo (the right channel a little late), repeated to reach the length. */
async function excerpt(seconds) {
  const b64 = await page.evaluate(async (seconds) => {
    const bytes = await (await fetch('./spikes/analyse/demo/demo-swing.mp3')).arrayBuffer();
    const buf = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(bytes);
    const sr = buf.sampleRate;
    const n = Math.round(seconds * sr);
    const ch = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
    const data = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    data.setUint32(4, 36 + n * 4, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, 2, true);
    data.setUint32(24, sr, true);
    data.setUint32(28, sr * 4, true);
    data.setUint16(32, 4, true);
    data.setUint16(34, 16, true);
    str(36, 'data');
    data.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.setInt16(44 + i * 4 + c * 2, Math.max(-32768, Math.min(32767, Math.round(ch[c][(i + (c ? buf.length - 336 : 0)) % buf.length] * 32767))), true);
    const u8 = new Uint8Array(data.buffer);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, seconds);
  return Buffer.from(b64, 'base64');
}

const setEase = (percent) =>
  page.evaluate(
    ([on, p]) => window.__fabtice.store.setState((s) => ({ settings: { ...s.settings, easeLoad: on, easeLoadPercent: p ?? s.settings.easeLoadPercent } })),
    percent === null ? [false, null] : [true, percent],
  );

/** Imports the excerpt as a new project (the analysis starts by itself). */
async function importPiece(wav) {
  if (!(await page.locator('.voile-projet.ouverte').count())) {
    const { menuCommand } = await import('./lib/menu.mjs');
    await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
    await page.locator('[data-testid="alerte-abandonner"]').click({ timeout: 1500 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('.voile-projet')?.classList.contains('ouverte'));
  }
  await page.locator('.accueil input[type="file"]').setInputFiles({ name: 'extrait.wav', mimeType: 'audio/wav', buffer: wav });
}

/** Waits for `test` (run in the page) to be true, then false again: the window of a computation. Returns its timing and processor time. */
async function window_(startTest, endTest, timeout) {
  const t0 = Date.now();
  while (!(await page.evaluate(startTest))) {
    if (Date.now() - t0 > timeout) throw new Error('the computation did not start');
    await sleep(25);
  }
  const wall0 = performance.now();
  const cpu0 = cpuSeconds();
  const ticker = setInterval(sample, 200);
  while (!(await page.evaluate(endTest))) {
    if (Date.now() - t0 > timeout) throw new Error('the computation did not end');
    await sleep(40);
  }
  clearInterval(ticker);
  const wall = (performance.now() - wall0) / 1000;
  const cpu = cpuSeconds() - cpu0;
  return { wall, cpu, load: cpu / wall };
}

const analysisStart = () => {
  const s = window.__fabtice.store.getState();
  return s.analysisRun.status === 'running' && s.analysisRun.step !== 'download';
};
const analysisEnd = () => window.__fabtice.store.getState().analysisRun.status !== 'running';
const separationStart = () => {
  const s = window.__fabtice.store.getState();
  return s.separationRun.status === 'running' && s.separationRun.step === 'separate';
};
const separationEnd = () => window.__fabtice.store.getState().separationRun.status !== 'running';

const results = { analysis: {}, separation: {} };
try {
  const wav = await excerpt(SECONDS);
  note(`chord model: ${CHORDS ?? 'automatic'}; excerpt ${SECONDS} s stereo; cross-origin isolated: ${isolated}; cores: ${os.cpus().length}; settings: unticked, ${PERCENTS.join(' % and ')} %`);
  await page.evaluate(() => window.__fabtice.lot3.separation.setSeparationModel('scnet'));

  const runAll = async (label, percent) => {
    await setEase(percent);
    await importPiece(wav);
    let a = null;
    if (!ONLY || ONLY === 'analysis') a = await window_(analysisStart, analysisEnd, 10 * 60000);
    await page.waitForFunction(() => window.__fabtice.store.getState().project && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    if (!ONLY || ONLY === 'analysis') {
      const ok = await page.evaluate(() => !!window.__fabtice.store.getState().analysis);
      if (!ok) throw new Error('the analysis gave nothing');
    }
    let s = null;
    let threads = null;
    if (!ONLY || ONLY === 'separation') {
      await page.evaluate(() => void window.__fabtice.lot3.separation.startSeparation());
      s = await window_(separationStart, separationEnd, 40 * 60000);
      const ok = await page.evaluate(() => !!window.__fabtice.store.getState().separation.result);
      if (!ok) throw new Error('the separation gave nothing');
      threads = await page.evaluate(() => {
        const id = window.__fabtice.store.getState().separation.result.id;
        const m = /Fils de calcul\s*:\s*(\d+)/.exec(window.__fabtice.lot3.separation.report(id) ?? '');
        return m ? Number(m[1]) : null;
      });
    }
    if (a) results.analysis[label] = a;
    if (s) results.separation[label] = { ...s, threads };
    note(`${label}: ${a ? `analysis ${a.wall.toFixed(1)} s, cpu ${a.cpu.toFixed(1)} s, load ${a.load.toFixed(2)} cores; ` : ''}${s ? `separation ${s.wall.toFixed(1)} s, cpu ${s.cpu.toFixed(1)} s, load ${s.load.toFixed(2)} cores, ${threads} threads` : ''}`);
  };

  note('warm-up (the tools are downloaded once; not counted)');
  await runAll('warm-up', null);
  delete results.analysis['warm-up'];
  delete results.separation['warm-up'];
  await runAll('off', null);
  for (const p of PERCENTS) await runAll(`${p} %`, p);

  for (const kind of ['analysis', 'separation']) {
    const rows = results[kind];
    if (!rows.off) continue;
    console.log(`\n${kind}: setting | elapsed s | cpu s | load (cores) | relative load | elapsed ratio${kind === 'separation' ? ' | threads' : ''}`);
    for (const [label, r] of Object.entries(rows)) {
      console.log(`  ${label.padEnd(6)} | ${r.wall.toFixed(1).padStart(7)} | ${r.cpu.toFixed(1).padStart(6)} | ${r.load.toFixed(2).padStart(5)} | ${(r.load / rows.off.load).toFixed(2).padStart(5)} | ${(r.wall / rows.off.wall).toFixed(2).padStart(5)}${kind === 'separation' ? ` | ${r.threads}` : ''}`);
    }
  }
  if (errors.length) note(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  srv.close();
}
