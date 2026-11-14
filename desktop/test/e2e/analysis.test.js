'use strict';

// The REAL analysis, inside the app, under the shipped policy (CSP, custom
// protocol, cross-origin isolation): import a file → the analysis tools are
// downloaded from Hugging Face (the hosts the policy allows, and nothing else)
// → the worker, ONNX Runtime and WebAssembly run → the result is the right
// one for a piece whose beats, key and tuning are known → the tools are kept
// on the device (IndexedDB, under the `fabtice://app` origin) → after a quit
// and a relaunch the piece comes back analysed, and analysing it again
// downloads nothing.
//
// Gated: it downloads the models (about 18 MB) from the real network.
//   FABTICE_E2E_ANALYSIS=1 xvfb-run -a npm run test:e2e
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const SPIKE = path.join(ROOT, '..', 'web', 'spikes', 'analyse', 'demo');
const SWING = path.join(SPIKE, 'demo-swing.mp3');
const TRUTH = JSON.parse(fs.readFileSync(path.join(SPIKE, 'demo-swing.json'), 'utf8'));
const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENABLED = process.env.FABTICE_E2E_ANALYSIS === '1';
const HUB = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co)\//;
const TOOLS = ['beat-this-logmel', 'beat-this-small0', 'crema-chords'];

const analysed = (page, timeout = 300000) =>
  page.waitForFunction(() => {
    const s = window.__fabtice.store.getState();
    return s.analysis || s.analysisRun.status === 'error';
  }, null, { timeout, polling: 200 });

const storeState = (page) =>
  page.evaluate(() => {
    const s = window.__fabtice.store.getState();
    return { run: s.analysisRun, analysis: s.analysis, origin: s.tempoMap.origin, crossOriginIsolated, engine: s.transport.engine };
  });

/** What the device keeps of the analysis tools, read from IndexedDB, each file checked against its digest. */
const keptTools = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('fabtice-analysis-tools');
        open.onerror = () => resolve({});
        open.onupgradeneeded = () => open.transaction.abort();
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('files').objectStore('files').getAll();
          all.onsuccess = async () => {
            const out = {};
            for (const f of all.result) {
              const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', f.data))].map((b) => b.toString(16).padStart(2, '0')).join('');
              out[f.id] = { bytes: f.data.byteLength, digestOk: digest === f.sha256 };
            }
            db.close();
            resolve(out);
          };
        };
      }),
  );

/** Compares the result with what is known of the demo file. */
function check(result) {
  const times = result.beats.times;
  const truth = TRUTH.beats.map((b) => b[0]);
  const within = (a, list) => list.some((b) => Math.abs(a - b) <= 0.07);
  const recall = truth.filter((t) => within(t, times)).length / truth.length;
  const precision = times.filter((b) => within(b, truth)).length / times.length;
  const [keyName, mode] = TRUTH.key.split(':');
  return { recall, precision, meter: result.beats.meter.numerator, key: result.key.tonic === PCS.indexOf(keyName) && result.key.mode === mode, tuning: result.tuning.cents };
}

test('the real analysis runs in the app under the shipped policy, keeps its tools, and does not download them twice', { skip: !ENABLED && 'set FABTICE_E2E_ANALYSIS=1 (downloads the analysis tools, about 18 MB)', timeout: 600000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-analysis-'));
  const env = { FABTICE_YTDLP_PATH: STUB, FABTICE_E2E_QUERY: '?debug&analyse=reel' };
  const requests = (app) => {
    const seen = [];
    app.context().on('request', (req) => {
      if (HUB.test(req.url())) seen.push(req.url().replace(/\?.*/, ''));
    });
    return seen;
  };
  let saved;

  // ---- first launch: download, analyse
  {
    const { app, page, problems } = await launch(env, userData);
    const hub = requests(app);
    try {
      await page.locator('.voile.ouverte').waitFor({ timeout: 30000 });
      await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
      await pieceReady(page);
      const t0 = Date.now();
      await analysed(page);
      const took = (Date.now() - t0) / 1000;
      const s = await storeState(page);
      assert.equal(s.run.status, 'idle', `analysis ended in ${JSON.stringify(s.run)}`);
      assert.ok(s.analysis, 'a result');
      assert.equal(s.crossOriginIsolated, true);
      assert.equal(s.origin, 'analysis', 'the analysed grid is the one in force');
      assert.equal(s.analysis.analyser.id, 'fabtice');
      assert.deepEqual(s.analysis.analyser.models, TOOLS);
      const c = check(s.analysis);
      assert.ok(c.recall > 0.93 && c.precision > 0.9, `beats: recall ${c.recall.toFixed(3)}, precision ${c.precision.toFixed(3)}`);
      assert.equal(c.meter, 4);
      assert.ok(c.key, 'key: B major');
      assert.ok(Math.abs(c.tuning - 30) < 3, `tuning ${c.tuning}`);
      assert.ok(s.analysis.chords.length >= 10, `${s.analysis.chords.length} chords`);
      // The tools came from the hub (the three files) and are on the device, intact.
      for (const f of ['logmel.onnx', 'beat_this_small0.onnx', 'crema_chords.onnx']) assert.ok(hub.some((u) => u.endsWith(f)), `${f} fetched: ${hub.join(', ')}`);
      const kept = await keptTools(page);
      for (const id of TOOLS) assert.ok(kept[id] && kept[id].digestOk, `${id} kept and intact: ${JSON.stringify(kept)}`);
      // The policy did its work without complaint.
      await assertClean(page, problems, 'first analysis');
      saved = { id: (await page.evaluate(() => window.__fabtice.store.getState().project.id)), beats: s.analysis.beats.times.length, chords: s.analysis.chords.length };
      console.log(`analysis in the app: ${took.toFixed(1)} s with the download; beats recall ${(c.recall * 100).toFixed(1)} %, precision ${(c.precision * 100).toFixed(1)} %, tuning ${c.tuning.toFixed(1)} cents, ${s.analysis.chords.length} chords; hub requests: ${hub.length}`);
      // Wait for the autosave to carry the analysis.
      await page.waitForFunction(() => new Promise((resolve) => {
        const open = indexedDB.open('fabtice');
        open.onsuccess = () => {
          const get = open.result.transaction('project').objectStore('project').get('current');
          get.onsuccess = () => { open.result.close(); resolve(!!(get.result && get.result.document && get.result.document.analysis)); };
        };
      }), null, { timeout: 15000, polling: 300 });
    } finally {
      await app.close();
    }
  }

  // ---- relaunch: the piece is back, analysed; analysing again downloads nothing
  {
    const { app, page, problems } = await launch(env, userData);
    const hub = requests(app);
    try {
      await pieceReady(page, 30000);
      const back = await storeState(page);
      assert.ok(back.analysis, 'the analysis came back with the piece');
      assert.equal(back.analysis.beats.times.length, saved.beats);
      assert.equal(back.analysis.chords.length, saved.chords);
      const kept = await keptTools(page);
      for (const id of TOOLS) assert.ok(kept[id] && kept[id].digestOk, `${id} still kept after the relaunch`);
      // « Analyser de nouveau » from the tempo panel (the ruler's « Tempo »).
      await page.locator('.rang-tete.tempo').click();
      await page.locator('.panneau-grille button:has-text("Analyser de nouveau")').click();
      await page.waitForFunction((was) => {
        const st = window.__fabtice.store.getState();
        return st.analysisRun.status === 'error' || (st.analysis && st.analysis.analysedAt !== was);
      }, back.analysis.analysedAt, { timeout: 300000, polling: 200 });
      const again = await storeState(page);
      assert.equal(again.run.status, 'idle', JSON.stringify(again.run));
      assert.ok(again.analysis && again.analysis.beats.times.length > 70);
      assert.equal(hub.length, 0, `nothing downloaded the second time: ${hub.join(', ')}`);
      await assertClean(page, problems, 'second analysis');
      console.log('second analysis in the app: no request to the hub');
    } finally {
      await app.close();
    }
  }
});
