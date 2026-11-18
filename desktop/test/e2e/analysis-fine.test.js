'use strict';

// The optional fine chord model (Tsumugi-Chords) inside the app, under the shipped policy:
// the demo piece is analysed with the default model, then the fine model is chosen in
// Réglages → Détection des accords → Modèle d'accords and the piece analysed again with it: its
// weights (68 MB) come from Hugging Face, the graph shipped with the app reads them, the
// result records the model. Prints the time and the peak memory of the app's processes.
//
// Gated and not blocking: it downloads 68 MB and takes minutes.
//   FABTICE_E2E_ANALYSIS_FINE=1 xvfb-run -a node --test test/e2e/analysis-fine.test.js
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, menuCommand } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const SWING = path.join(ROOT, '..', 'web', 'spikes', 'analyse', 'demo', 'demo-swing.mp3');
const ENABLED = process.env.FABTICE_E2E_ANALYSIS_FINE === '1';
const HUB = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co)\//;

/** Resident memory of a process and its descendants, in MB (Linux /proc; 0 elsewhere). */
function treeMegabytes(rootPid) {
  if (process.platform !== 'linux' || !rootPid) return 0;
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
  let kb = 0;
  const walk = (pid) => {
    try {
      const m = /VmRSS:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'));
      if (m) kb += Number(m[1]);
    } catch {
      // the process ended
    }
    for (const c of children.get(pid) ?? []) walk(c);
  };
  walk(rootPid);
  return kb / 1024;
}

const analysedAgain = (page, was, timeout) =>
  page.waitForFunction(
    (w) => {
      const s = window.__fabtice.store.getState();
      return s.analysisRun.status === 'error' || (s.analysis && s.analysis.analysedAt !== w);
    },
    was,
    { timeout, polling: 200 },
  );

test('the fine chord model runs in the app, from the settings, and says what it cost', { skip: !ENABLED && 'set FABTICE_E2E_ANALYSIS_FINE=1 (downloads 68 MB, takes minutes)', timeout: 1800000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-fine-'));
  const { app, page, problems } = await launch({ FABTICE_YTDLP_PATH: STUB, FABTICE_E2E_QUERY: '?debug&analyse=reel' }, userData);
  const hub = [];
  app.context().on('request', (req) => {
    if (HUB.test(req.url())) hub.push(req.url().replace(/\?.*/, ''));
  });
  try {
    await page.locator('.voile.ouverte').waitFor({ timeout: 30000 });
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await pieceReady(page);
    await analysedAgain(page, null, 300000);
    const first = await page.evaluate(() => window.__fabtice.store.getState().analysis);
    assert.ok(first && first.analyser.models.includes('crema-chords'), 'first analysed with the default model');

    // Réglages… (menu Fabtice) → Détection des accords (the tabbed window of C7).
    await menuCommand(page, 'Réglages…');
    await page.click('[role="tab"][data-tab="chords"]');
    await page.selectOption('[data-testid="modele-accords"]', 'fine');
    const text = await page.locator('[data-testid="reglages-panneau"]').innerText();
    assert.match(text, /plusieurs minutes/);
    assert.match(text, /2,5 Go/);
    assert.match(text, /CC BY-NC 4\.0/);

    const pid = app.process().pid;
    let peak = treeMegabytes(pid);
    const before = peak;
    const timer = setInterval(() => (peak = Math.max(peak, treeMegabytes(pid))), 250);
    const t0 = Date.now();
    await page.click('[data-testid="modele-accords-relancer"]');
    await analysedAgain(page, first.analysedAt, 1500000);
    clearInterval(timer);
    const took = (Date.now() - t0) / 1000;
    const s = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      return { run: st.analysisRun, analysis: st.analysis };
    });
    assert.equal(s.run.status, 'idle', JSON.stringify(s.run));
    assert.ok(s.analysis.analyser.models.includes('tsumugi-chords'), JSON.stringify(s.analysis.analyser.models));
    assert.deepEqual(s.analysis.chordModel, { id: 'tsumugi-chords' });
    assert.ok(hub.some((u) => u.endsWith('chord-model.safetensors')), `weights fetched: ${hub.join(', ')}`);
    // Opening the advanced settings probes the graphics chip for the separation tool; on a
    // machine without one Chromium says so in the console: not a fault.
    const kept = problems.filter((p) => !/No available adapters|WebGPU.*(unavailable|not supported)|Failed to create WebGPU/i.test(p));
    problems.splice(0, problems.length, ...kept);
    await assertClean(page, problems, 'fine analysis');
    console.log(`fine chord model in the app: ${took.toFixed(1)} s for the demo piece (37 s, 2 windows), weights download included; memory of the app's processes ${before.toFixed(0)} MB before, peak ${peak.toFixed(0)} MB`);

    // Weights kept: the time of the analysis alone.
    const t1 = Date.now();
    peak = treeMegabytes(pid);
    const timer2 = setInterval(() => (peak = Math.max(peak, treeMegabytes(pid))), 250);
    const was = s.analysis.analysedAt;
    await page.keyboard.press('Escape');
    // « Analyser de nouveau » from the tempo panel (the ruler's « Tempo »), as in analysis.test.js.
    await page.locator('.rang-tete.tempo').click();
    await page.locator('.panneau-grille button:has-text("Analyser de nouveau")').click();
    await analysedAgain(page, was, 1500000);
    clearInterval(timer2);
    console.log(`fine chord model in the app, weights kept: ${((Date.now() - t1) / 1000).toFixed(1)} s; peak memory ${peak.toFixed(0)} MB`);
  } finally {
    await app.close();
  }
});

// 1.0.1, step 5: « Écouter aussi les instruments séparés » (off by default). The fine model is
// chosen and the case ticked in the settings, the piece is separated (SCNet, the light tool); at
// the end of the separation the analysis runs again by itself (first the separation, then the
// analysis), the worker hears each part with CREMA, keeps the harmony parts and runs the fine model
// once more on their remix. The panel says what was heard.
test('the fine chord model also listens to the separated parts when asked', { skip: !ENABLED && 'set FABTICE_E2E_ANALYSIS_FINE=1 (downloads about 80 MB, takes minutes)', timeout: 2400000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-fine-stems-'));
  const { app, page, problems } = await launch({ FABTICE_YTDLP_PATH: STUB, FABTICE_E2E_QUERY: '?debug&analyse=reel' }, userData);
  try {
    await page.locator('.voile.ouverte').waitFor({ timeout: 30000 });
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await pieceReady(page);
    await menuCommand(page, 'Réglages…');
    await page.click('[role="tab"][data-tab="chords"]');
    await page.selectOption('[data-testid="modele-accords"]', 'fine');
    const box = page.locator('[data-testid="ecouter-instruments"]');
    assert.equal(await box.isChecked(), false, 'off by default');
    await box.check();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
    await page.evaluate(() => window.__fabtice.lot3.separation.setSeparationModel('scnet'));
    await page.locator('[data-testid="separer"]').click();
    await page.locator('[data-testid="panneau-separation"]').waitFor();
    await page.locator('[data-testid="lancer-separation"]').click();
    await page.waitForFunction(() => {
      const s = window.__fabtice.store.getState();
      return (s.separation.result && s.separationRun.status === 'idle') || s.separationRun.status === 'error';
    }, null, { timeout: 900000, polling: 500 });
    // The analysis after the separation, with the fine model and the parts.
    await page.waitForFunction(
      () => {
        const s = window.__fabtice.store.getState();
        if (s.analysisRun.status === 'error') return true;
        return s.analysisRun.status === 'idle' && s.analysis && s.analysis.chordModel && s.analysis.chordModel.id === 'tsumugi-chords' && s.analysis.analysedAt > s.separation.result.finishedAt;
      },
      null,
      { timeout: 1800000, polling: 500 },
    );
    const s = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      return { run: st.analysisRun, chordModel: st.analysis.chordModel, evidence: st.analysis.evidence, stems: [...st.tracks, ...st.separation.aside].map((t) => t.stem).filter(Boolean) };
    });
    assert.equal(s.run.status, 'idle', JSON.stringify(s.run));
    assert.deepEqual(s.chordModel, { id: 'tsumugi-chords' });
    assert.ok(Array.isArray(s.evidence.harmonyStems), JSON.stringify(s.evidence));
    for (const name of s.evidence.harmonyStems) assert.ok(s.stems.includes(name), `${name} is one of the parts ${s.stems.join(', ')}`);
    console.log(`parts of the separation: ${s.stems.join(', ')}; heard for the harmony: ${s.evidence.harmonyStems.join(', ') || 'none'}`);
    // The analysis panel (the ruler's « Accords » status): « Écoute : … ».
    const line = await page.evaluate(() => (window.__fabtice.store.getState().analysis.evidence.harmonyStems.length ? 'stems' : 'whole'));
    assert.ok(line === 'stems' || line === 'whole');
    const kept = problems.filter((p) => !/No available adapters|WebGPU.*(unavailable|not supported)|Failed to create WebGPU/i.test(p));
    problems.splice(0, problems.length, ...kept);
    await assertClean(page, problems, 'fine analysis with the separated parts');
  } finally {
    await app.close();
  }
});
