// Browser check of the REAL separator, in Chromium (no graphics chip here: the
// processor path), on the built interface served from web/ with the isolation
// headers:
//   npm run build && npm run test:separation-real
//
// What it covers (the numbers it measures are printed as NOTE lines):
//   - first: SCNet on 25 s of the analysis' demo piece
//     (web/spikes/analyse/demo/demo-swing.mp3), from the import to the tracks
//     shown: the tool is downloaded from Hugging Face (progress in bytes), the
//     progress never goes back, the remaining time is said, the parts have
//     exactly the piece's length and sum back close to it (error measured), the
//     « Outil d'essai » notice is gone, « Copier le rapport » gives the report;
//   - again: a reload, a second separation: nothing downloaded, the tool found
//     again on the device (isCached, toolsUsage), then forgotten (forgetTools);
//   - cancel: a separation cancelled mid-run: back to idle at once, the
//     worker gone, the whole piece untouched;
//   - fallback: the « graphics » path failing at segment 2 (simulated on the
//     processor, `?separation=reel&repli-essai=2`): the processor goes on with
//     the same tool from where it stopped; same result as without the failure;
//   - tools (FABTICE_SEPARATION_TOOLS=1, long: downloads 409 MB): HTDemucs and
//     BS-RoFormer on 12 s, to prove they load and run on the processor path;
//     time per segment;
//   - memory (FABTICE_SEPARATION_MEMORY=1, long): peak resident memory of all
//     the browser's processes while each tool separates a 4-minute piece.
// The tools are fetched for real: the network must reach Hugging Face.
// FABTICE_SEPARATION_REAL_ONLY=<name> runs one scenario. Screenshots of the
// result panel go to $FABTICE_SEPARATION_OUT (default: a temporary folder).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_SEPARATION_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-separation-real-'));
fs.mkdirSync(out, { recursive: true });
const only = process.env.FABTICE_SEPARATION_REAL_ONLY || null;
const run = (name, enabled = true) => (only ? only === name : enabled);

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;

// Each browser of this run carries a mark on its command line: its memory is that of its own process tree
// (other Chromium processes on the machine, from other work, are not counted).
const MARK = `--fabtice-separation-real=${process.pid}`;

/** Resident memory of the browser launched with MARK and all its child processes, in bytes. */
const rss = () => {
  try {
    const rows = execSync('ps -eo pid=,ppid=,rss=,args=', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]) * 1024, args: m[4] }));
    const roots = rows.filter((r) => r.args.includes(MARK)).map((r) => r.pid);
    if (!roots.length) return null;
    const tree = new Set(roots);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of rows) if (!tree.has(r.pid) && tree.has(r.ppid)) (tree.add(r.pid), (grew = true));
    }
    return rows.filter((r) => tree.has(r.pid)).reduce((n, r) => n + r.rss, 0);
  } catch {
    return null;
  }
};

const { srv, url } = await startServer(0);
const HUB = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co)\//;
const QUERY = '?debug&moteur=factice&analyse=aucune&separation=reel';
const launch = () => chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', MARK] });

/** A page on the interface, in `context` (its own storage), with the real separator. */
async function open(context, query = QUERY) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`);
  });
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
  return { page, errors };
}

/** WAV bytes of `seconds` of the demo piece (mono), from `from` s (decoded and cut in the page; repeated to reach `seconds`; `stereo`: made stereo). */
async function excerpt(page, from, seconds, stereo = false) {
  const b64 = await page.evaluate(
    async ({ from, seconds, stereo }) => {
      const bytes = await (await fetch('./spikes/analyse/demo/demo-swing.mp3')).arrayBuffer();
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      const buf = await ctx.decodeAudioData(bytes);
      const sr = buf.sampleRate;
      const n = Math.round(seconds * sr);
      const start = Math.round(from * sr);
      const ch = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
      const avail = buf.length - start;
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
      for (let i = 0; i < n; i++) {
        const k = start + (i % avail);
        for (let c = 0; c < 2; c++) {
          // A stereo piece from a mono one: the right channel a little late (7 ms).
          const kk = stereo && c === 1 ? start + ((i + avail - 336) % avail) : k;
          data.setInt16(44 + i * 4 + c * 2, Math.max(-32768, Math.min(32767, Math.round(ch[c][kk] * 32767))), true);
        }
      }
      const u8 = new Uint8Array(data.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { from, seconds, stereo },
  );
  return Buffer.from(b64, 'base64');
}

/** Imports `wav` through the new-piece dialog and waits until the piece plays. */
async function importPiece(page, wav, name) {
  await page.waitForSelector('.voile.ouverte', { timeout: 20000 });
  await page.locator('.accueil input[type="file"]').setInputFiles({ name, mimeType: 'audio/wav', buffer: wav });
  await page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.project && s.tracks.length === 1 && (s.transport.engine === 'ready' || s.transport.engine === 'playing') && !s.ui.newPieceOpen;
  }, null, { timeout: 60000 });
}

/** Watches the separation in the page: the fraction shown, the texts, the coarse states. */
async function watch(page) {
  await page.evaluate(() => {
    window.__sep = { fractions: [], texts: [], runs: [], workers: 0 };
    const tick = () => {
      const bar = document.querySelector('.panneau-separation [role="progressbar"]');
      if (bar) window.__sep.fractions.push(Number(bar.getAttribute('aria-valuenow')));
      const step = document.querySelector('.panneau-separation .analyse-etape');
      const text = step && step.textContent;
      if (text && window.__sep.texts[window.__sep.texts.length - 1] !== text) window.__sep.texts.push(text);
    };
    window.__sepTimer = setInterval(tick, 150);
    window.__fabtice.store.subscribe((s) => {
      const r = s.separationRun;
      const last = window.__sep.runs[window.__sep.runs.length - 1];
      const key = JSON.stringify(r);
      if (last !== key) window.__sep.runs.push(key);
    });
  });
}

const separated = (page, timeout = 20 * 60000) =>
  page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return (s.separation.result && s.separationRun.status === 'idle') || s.separationRun.status === 'error';
  }, null, { timeout, polling: 250 });

async function startFromPanel(page, model) {
  await page.evaluate((m) => window.__fabtice.lot3.separation.setSeparationModel(m), model);
  await page.click('[data-testid="separer"]');
  await page.waitForSelector('[data-testid="panneau-separation"]');
  await page.click('[data-testid="lancer-separation"]');
}

/** The parts against the whole piece: lengths, and the error of their sum (dB under the piece). */
function compare(page) {
  return page.evaluate(() => {
    const { store, lot3 } = window.__fabtice;
    const s = store.getState();
    const wholeTrack = [...s.tracks, ...s.separation.aside].find((tr) => tr.audio.origin !== 'separated');
    const parts = s.tracks.filter((tr) => tr.audio.origin === 'separated');
    const whole = lot3.registry.getAudio(wholeTrack.audio.id);
    const audios = parts.map((tr) => lot3.registry.getAudio(tr.audio.id));
    const N = whole.frames;
    const B = 65536;
    const a = new Float32Array(B);
    const b = new Float32Array(B);
    let err = 0;
    let sig = 0;
    for (let c = 0; c < 2; c++) {
      for (let s0 = 0; s0 < N; s0 += B) {
        const n = Math.min(B, N - s0);
        const av = a.subarray(0, n);
        lot3.pcm.readPcm(whole, c, s0, av);
        const sum = new Float64Array(n);
        for (const p of audios) {
          const bv = b.subarray(0, n);
          lot3.pcm.readPcm(p, c, s0, bv);
          for (let i = 0; i < n; i++) sum[i] += bv[i];
        }
        for (let i = 0; i < n; i++) {
          err += (sum[i] - av[i]) ** 2;
          sig += av[i] ** 2;
        }
      }
    }
    return {
      names: parts.map((tr) => tr.name),
      stems: parts.map((tr) => tr.stem),
      frames: audios.map((p) => p.frames),
      rates: audios.map((p) => p.sampleRate),
      wholeFrames: N,
      errorDb: 10 * Math.log10(err / sig),
      result: s.separation.result,
    };
  });
}

/** Separation workers alive in the page (Playwright sees each worker). */
const separationWorkers = (page) => page.workers().filter((w) => /separation\.worker/.test(w.url())).length;

let browser = null;
try {
  // ------------------------------------------------------------------ first: SCNet, from the import to the tracks
  if (run('first')) {
    browser = await launch();
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const hub = [];
    context.on('request', (req) => {
      if (HUB.test(req.url())) hub.push(req.url().replace(/\?.*/, ''));
    });
    const { page, errors } = await open(context);
    const wav = await excerpt(page, 4, 25);
    await importPiece(page, wav, 'extrait-swing.wav');
    await watch(page);
    const t0 = Date.now();
    const rss0 = rss();
    let peak = rss0;
    const sampler = setInterval(() => {
      const r = rss();
      if (r !== null && r > peak) peak = r;
    }, 250);
    await startFromPanel(page, 'scnet');
    // While it runs: the processor is named, the trial notice is gone, the remaining time comes.
    await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.step === 'separate', null, { timeout: 300000 });
    const runningText = await page.locator('.panneau-separation').innerText();
    check('first: running on the processor, said plainly', /Calcul par le processeur/.test(runningText), runningText.slice(0, 200));
    check('first: no « Outil d’essai » notice with the real separator', !/Outil d’essai/.test(runningText));
    check('first: a separation worker is running', separationWorkers(page) === 1, `${separationWorkers(page)}`);
    await separated(page);
    clearInterval(sampler);
    const took = (Date.now() - t0) / 1000;
    const st = await page.evaluate(() => ({ run: window.__fabtice.store.getState().separationRun, sep: window.__sep }));
    check('first: the separation ended well', st.run.status === 'idle', JSON.stringify(st.run));
    const fr = st.sep.fractions.filter((f) => Number.isFinite(f));
    const back = fr.findIndex((f, i) => i > 0 && f < fr[i - 1]);
    check('first: the fraction never goes back', back === -1 && fr.length > 5, `${fr.length} samples, first back at ${back}: ${fr.slice(Math.max(0, back - 2), back + 2).join(',')}`);
    check('first: the download showed its bytes', st.sep.texts.some((t) => /Téléchargement de l’outil.*sur 13 Mo/.test(t)), st.sep.texts.slice(0, 4).join(' | '));
    check('first: the remaining time was said', st.sep.texts.some((t) => /encore environ|restante/.test(t)), st.sep.texts.join(' | ').slice(0, 400));
    check('first: SCNet downloaded from the hub', hub.some((u) => u.endsWith('scnet.int8.onnx')), hub.join(', '));
    const c = await compare(page);
    check('first: four parts as tracks, in the hues of the instruments', c.stems.slice().sort().join(',') === 'bass,drums,other,vocals', c.names.join(','));
    check('first: every part has exactly the length and rate of the piece', c.frames.every((f) => f === c.wholeFrames) && c.rates.every((r) => r === 48000), `${c.frames.join(',')} vs ${c.wholeFrames}`);
    note(`SCNet on 25 s (processor, this machine): ${took.toFixed(1)} s from « Séparer » to the tracks, download included; compute ${c.result.computeSeconds.toFixed(1)} s; sum of the parts vs the piece: ${c.errorDb.toFixed(1)} dB; peak resident memory +${mb(peak - rss0)} (this browser and its processes)`);
    check('first: the parts sum back close to the piece (under −15 dB)', c.errorDb < -15, `${c.errorDb.toFixed(1)} dB`);
    check('first: the summary says processor, no fallback', c.result.backend === 'cpu' && c.result.fellBack === false && c.result.modelId === 'scnet');
    for (let i = 0; i < 20 && separationWorkers(page) > 0; i++) await sleep(100);
    check('first: the worker is gone once done', separationWorkers(page) === 0, `${separationWorkers(page)}`);
    // The result panel: « Copier le rapport ».
    const panel = await page.locator('.panneau-separation').innerText();
    check('first: result panel without the trial notice, with « Copier le rapport »', !/Outil d’essai/.test(panel) && (await page.locator('[data-testid="copier-rapport"]').count()) === 1, panel.slice(0, 300));
    await page.click('[data-testid="copier-rapport"]');
    await page.waitForSelector('.separation-rapport [role="status"]');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check('first: the report is copied as text, with the tool, the processor and the timings', /Rapport de séparation Fabtice/.test(clip) && /SCNet/.test(clip) && /processeur \(WebAssembly\)/.test(clip) && /Par segment/.test(clip) && /Téléchargement de l’outil\s:\s[\d,]+ s pour 13 Mo/.test(clip), clip.slice(0, 300));
    check('first: no personal data in the report (no file name)', !/extrait-swing/.test(clip));
    note(`report:\n${clip}`);
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(400);
      if ((await page.locator('[data-testid="panneau-separation"]').count()) === 0) {
        if (w < 760) {
          await page.click('.menu-plus');
          await page.click('[data-separation-entry]');
        } else await page.click('[data-testid="separer"]');
        await page.waitForSelector('[data-testid="panneau-separation"]');
      }
      await sleep(350);
      await page.screenshot({ path: path.join(out, `separation-real-result-${w}.png`) });
      const fit = await page.evaluate(() => {
        const r = document.querySelector('.panneau-separation').getBoundingClientRect();
        return r.right <= window.innerWidth + 0.5 && r.left >= -0.5 && r.top >= -0.5;
      });
      check(`first: result panel inside the window at ${w}`, fit);
    }
    check('first: no page errors', errors.length === 0, errors.join(' | '));

    // ---------------------------------------------------------------- again: tools kept, found again, forgotten
    if (run('again', true)) {
      await page.reload();
      await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
      await page.waitForFunction(() => window.__fabtice.store.getState().tracks.length > 0 && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
      const usage = await page.evaluate(async () => {
        const sep = window.__fabtice.lot3.separation.separator();
        const model = window.__fabtice.lot3.separation.models().list.models.find((m) => m.id === 'scnet');
        return { kind: sep.kind, cached: await sep.isCached(model), usage: await sep.toolsUsage() };
      });
      check('again: the tool is found again on the device', usage.kind === 'onnx' && usage.cached === true && usage.usage.cached.some((c) => c.id === 'scnet' && c.bytes === 12900277), JSON.stringify(usage));
      const before = hub.length;
      // Separate again (the panel's « Séparer de nouveau »), nothing downloaded.
      await page.evaluate(() => window.__fabtice.lot3.separation.startSeparation({ stems: ['vocals'] }));
      await separated(page);
      const again = await compare(page);
      check('again: separated again without any download', hub.length === before && again.result.modelId === 'scnet', `${hub.length - before} requests`);
      check('again: « Voix » asked: Voix and Autres', again.stems.join(',') === 'vocals,other', again.names.join(','));
      note(`SCNet again (tool already there): compute ${again.result.computeSeconds.toFixed(1)} s for 25 s`);
      const forgot = await page.evaluate(async () => {
        const sep = window.__fabtice.lot3.separation.separator();
        await sep.forgetTools();
        const model = window.__fabtice.lot3.separation.models().list.models.find((m) => m.id === 'scnet');
        return { cached: await sep.isCached(model), usage: await sep.toolsUsage() };
      });
      check('again: forgetTools empties the tools database', forgot.cached === false && forgot.usage.bytes === 0, JSON.stringify(forgot));
    }
    await context.close();
    await browser.close();
    browser = null;
  }

  // ------------------------------------------------------------------ cancel mid-run
  if (run('cancel')) {
    browser = await launch();
    const context = await browser.newContext();
    const { page, errors } = await open(context);
    const wav = await excerpt(page, 0, 30);
    await importPiece(page, wav, 'annulation.wav');
    await startFromPanel(page, 'scnet');
    await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.step === 'separate', null, { timeout: 300000 });
    await sleep(2500);
    check('cancel: a worker runs before', separationWorkers(page) === 1);
    const t = Date.now();
    await page.click('.panneau-separation button:has-text("Annuler")');
    await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.status === 'idle', null, { timeout: 5000 });
    const ms = Date.now() - t;
    let gone = 0;
    while (separationWorkers(page) > 0 && gone < 30000) {
      await sleep(100);
      gone += 100;
    }
    note(`cancel: the separation worker gone ${(Date.now() - t) / 1000} s after the click`);
    const s = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      return { tracks: st.tracks.length, result: st.separation.result, run: st.separationRun };
    });
    check('cancel: back to idle at once, the whole piece untouched', s.tracks === 1 && s.result === null && s.run.status === 'idle', `${ms} ms`);
    check('cancel: the worker is ended (its memory given back)', separationWorkers(page) === 0, `${separationWorkers(page)} left`);
    note(`cancel: idle ${ms} ms after the click`);
    check('cancel: no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
    await browser.close();
    browser = null;
  }

  // ------------------------------------------------------------------ the processor taking over mid-run
  if (run('fallback')) {
    browser = await launch();
    // Reference without a failure, then the same piece with the « graphics » path failing at segment 2
    // (each in a context of its own: a fresh device, no piece kept from the other run).
    const results = {};
    for (const query of [QUERY, `${QUERY}&repli-essai=2`]) {
      const context = await browser.newContext();
      const { page, errors } = await open(context, query);
      const wav = await excerpt(page, 4, 25);
      await page.evaluate(() => window.__fabtice.lot3.separation.setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 4, desktopApp: false }));
      await importPiece(page, wav, 'repli.wav');
      await watch(page);
      if (query.includes('repli-essai')) await startFromPanel(page, 'scnet');
      else {
        // The reference on the processor directly.
        await page.evaluate(() => window.__fabtice.lot3.separation.setDevice({ phone: false, gpu: 'none', browser: 'chromium', memoryGB: 8, cores: 4, desktopApp: false }));
        await startFromPanel(page, 'scnet');
      }
      await separated(page);
      const c = await compare(page);
      const runs = await page.evaluate(() => window.__sep.runs.map((r) => JSON.parse(r)));
      // Samples of a part, to compare both runs.
      const sample = await page.evaluate(() => {
        const { store, lot3 } = window.__fabtice;
        const tr = store.getState().tracks.find((t) => t.stem === 'vocals');
        const a = lot3.registry.getAudio(tr.audio.id);
        const out = new Float32Array(a.frames);
        lot3.pcm.readPcm(a, 0, 0, out);
        return Array.from(out.filter((_, i) => i % 7 === 0));
      });
      results[query.includes('repli') ? 'fallback' : 'plain'] = { c, runs, sample, errors };
      await context.close();
    }
    const fb = results.fallback;
    const plain = results.plain;
    const sawFallback = fb.runs.some((r) => r.status === 'running' && r.fellBack === true && r.backend === 'cpu');
    const firstGpu = fb.runs.findIndex((r) => r.status === 'running' && r.backend === 'gpu');
    check('fallback: started on the « graphics » path, then said at once that the processor took over', firstGpu >= 0 && sawFallback, fb.runs.map((r) => `${r.step}/${r.backend}/${r.fellBack}`).join(' '));
    check('fallback: the same tool all along', fb.c.result.modelId === 'scnet' && fb.c.result.fellBack === true && fb.c.result.backend === 'cpu');
    check('fallback: lengths exact', fb.c.frames.every((f) => f === fb.c.wholeFrames));
    let maxDiff = 0;
    for (let i = 0; i < plain.sample.length; i++) maxDiff = Math.max(maxDiff, Math.abs(plain.sample[i] - fb.sample[i]));
    check('fallback: the result is the one of a run without failure (resumed where it stopped)', maxDiff <= 2 / 32768, `largest difference ${(maxDiff * 32768).toFixed(1)} steps of 16 bits`);
    const rep = fb.runs.length;
    note(`fallback: ${rep} coarse states; error of the sum ${fb.c.errorDb.toFixed(1)} dB (plain ${plain.c.errorDb.toFixed(1)} dB)`);
    check('fallback: no page errors', fb.errors.length === 0 && plain.errors.length === 0, [...fb.errors, ...plain.errors].join(' | '));
    await browser.close();
    browser = null;
  }

  // ------------------------------------------------------------------ the two other tools load and run (long)
  if (run('tools', process.env.FABTICE_SEPARATION_TOOLS === '1')) {
    browser = await launch();
    const context = await browser.newContext();
    for (const id of ['htdemucs-6s', 'bs-roformer-sw']) {
      const { page, errors } = await open(context);
      const wav = await excerpt(page, 4, 12);
      await importPiece(page, wav, `outil-${id}.wav`);
      const t0 = Date.now();
      await startFromPanel(page, id);
      await separated(page, 60 * 60000);
      const c = await compare(page);
      const report = await page.evaluate((rid) => window.__fabtice.lot3.separation.report(rid), c.result.id);
      const per = /Par segment, processeur \(WebAssembly\)\s:\s([\d,]+) s/.exec(report ?? '');
      check(`tools: ${id} runs on the processor, six parts of the exact length`, c.result.modelId === id && c.stems.length === 6 && c.frames.every((f) => f === c.wholeFrames), c.names.join(','));
      note(`${id} on 12 s (processor, this machine): ${((Date.now() - t0) / 1000).toFixed(0)} s with the download, compute ${c.result.computeSeconds.toFixed(1)} s, ${per ? per[1] : '?'} s per segment; sum of the parts vs the piece ${c.errorDb.toFixed(1)} dB`);
      check(`tools: ${id}: no page errors`, errors.length === 0, errors.join(' | '));
      await page.close();
    }
    await context.close();
    await browser.close();
    browser = null;
  }

  // ------------------------------------------------------------------ peak memory per tool, 4-minute piece (long)
  if (run('memory', process.env.FABTICE_SEPARATION_MEMORY === '1')) {
    const tools = (process.env.FABTICE_SEPARATION_MEMORY_TOOLS || 'scnet,htdemucs-6s,bs-roformer-sw').split(',');
    // Long tools on the processor: stop after this many seconds of computing (the peak comes with the first
    // segments, one segment at a time; what a whole run adds is its output tracks, said below).
    const limit = Number(process.env.FABTICE_SEPARATION_MEMORY_SECONDS || 0);
    for (const id of tools) {
      browser = await launch();
      const context = await browser.newContext();
      const { page } = await open(context);
      const wav = await excerpt(page, 0, 240, true);
      await importPiece(page, wav, 'quatre-minutes.wav');
      await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 120000 }).catch(() => {});
      await sleep(1500);
      const base = rss();
      let peak = base;
      const sampler = setInterval(() => {
        const r = rss();
        if (r !== null && r > peak) peak = r;
      }, 200);
      const t0 = Date.now();
      await startFromPanel(page, id);
      let stopped = false;
      if (limit > 0) {
        await page.waitForFunction(() => window.__fabtice.store.getState().separationRun.step === 'separate', null, { timeout: 30 * 60000 });
        const t1 = Date.now();
        await separated(page, limit * 1000).catch(() => {
          stopped = true;
        });
        if (stopped) {
          await page.evaluate(() => window.__fabtice.lot3.separation.cancelSeparation());
          note(`memory ${id}: stopped after ${((Date.now() - t1) / 1000).toFixed(0)} s of computing`);
        }
      } else await separated(page, 3 * 60 * 60000);
      clearInterval(sampler);
      const s = await page.evaluate(() => window.__fabtice.store.getState().separation.result);
      const model = await page.evaluate((m) => window.__fabtice.lot3.separation.models().list.models.find((x) => x.id === m), id);
      const tracks = model.stems.length * 240 * 48000 * 2 * (await page.evaluate(() => (window.__fabtice.lot3.registry.getAudio(window.__fabtice.store.getState().tracks[0].audio.id).mono ? 1 : 2)));
      note(`memory ${id}, 4-minute piece: resident (this browser and its processes) ${mb(base)} before, peak ${mb(peak)} (+${mb(peak - base)})${stopped ? ' over the first minutes' : ''}; ${s ? `compute ${s.computeSeconds.toFixed(0)} s` : 'not finished'} (${((Date.now() - t0) / 1000).toFixed(0)} s with the download); the output tracks weigh ${mb(tracks)} in 16 bits once complete`);
      await context.close();
      await browser.close();
      browser = null;
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  srv.close();
}
console.log(`Screenshots: ${out}`);
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nseparation (real): all checks passed');
