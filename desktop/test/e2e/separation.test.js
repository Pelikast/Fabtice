'use strict';

// The REAL separation, inside the app, under the shipped policy (CSP, custom
// protocol, cross-origin isolation), from the import to the tracks shown:
//   - the list of tools is fetched from the project's public repository (the
//     one more host the policy allows); a 404 or a refused list keeps the
//     bundled copy without a word on screen;
//   - a file is imported → SCNet (the light tool, 13 MB) is downloaded from
//     Hugging Face → the separation worker runs ONNX Runtime (the graphics chip
//     when the machine offers one, else the processor; a graphics failure must
//     end on the processor with the same tool) → four instrument tracks are
//     shown, each of the piece's exact length → the tool is kept on the device;
//   - the measurement report reaches the Mac app's diagnostic window
//     (Aide → Diagnostic…), where the owner copies it.
//
// Gated: it downloads the tool (13 MB) from the real network and computes for
// a minute or more.
//   FABTICE_E2E_SEPARATION=1 xvfb-run -a npm run test:e2e
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, openDiagnostic } = require('./helpers');

const SWING = path.join(ROOT, '..', 'web', 'spikes', 'analyse', 'demo', 'demo-swing.mp3');
const ENABLED = process.env.FABTICE_E2E_SEPARATION === '1';
const HUB = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co)\//;
const LIST = /^https:\/\/raw\.githubusercontent\.com\//;
// Chromium says so in the console when it is asked for a graphics adapter on a
// machine that has none (the device probe of the separation): not a fault.
const NO_ADAPTER = /No available adapters|WebGPU.*(unavailable|not supported)|Failed to create WebGPU/i;

test('the real separation runs in the app under the shipped policy, shows the instruments and reports to the diagnostic window', { skip: !ENABLED && 'set FABTICE_E2E_SEPARATION=1 (downloads SCNet, 13 MB, and separates 38 s)', timeout: 1200000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-separation-'));
  const env = { FABTICE_E2E_QUERY: '?debug&analyse=aucune&separation=reel&outils=distant' };
  const { app, page, problems } = await launch(env, userData);
  const hub = [];
  const list = [];
  app.context().on('request', (req) => {
    if (HUB.test(req.url())) hub.push(req.url().replace(/\?.*/, ''));
    if (LIST.test(req.url())) list.push(req.url());
  });
  app.context().on('response', (res) => {
    if (LIST.test(res.url())) list.push(`HTTP ${res.status()}`);
  });
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
    // The list: fetched (or its fetch refused), the bundled copy in use if it was not valid.
    await page.waitForFunction(() => window.__fabtice.lot3.separation.models().problem !== 'not fetched yet', null, { timeout: 20000 }).catch(() => {});
    const listed = await page.evaluate(() => {
      const l = window.__fabtice.lot3.separation.models();
      return { source: l.source, problem: l.problem, ids: l.list.models.map((m) => m.id) };
    });
    console.log(`tools list: ${listed.source} (${listed.problem ?? 'ok'}), ${listed.ids.join(', ')}; requests: ${list.join(' ') || 'none seen'}`);
    assert.ok(listed.ids.includes('scnet'), `SCNet listed: ${JSON.stringify(listed)}`);
    assert.ok(!/Content Security Policy|Refused to connect/i.test(listed.problem ?? ''), `the policy let the list through: ${listed.problem}`);

    // Import the demo piece (38 s).
    await page.locator('.voile.ouverte').waitFor({ timeout: 30000 });
    await page.locator('.accueil input[type="file"]').setInputFiles(SWING);
    await pieceReady(page);
    await page.evaluate(() => window.__fabtice.lot3.separation.setSeparationModel('scnet'));
    await page.locator('[data-testid="separer"]').click();
    await page.locator('[data-testid="panneau-separation"]').waitFor();
    const offer = await page.locator('.panneau-separation').innerText();
    assert.match(offer, /SCNet/);
    assert.doesNotMatch(offer, /Outil d’essai/, 'the real separator is in use');
    const t0 = Date.now();
    await page.locator('[data-testid="lancer-separation"]').click();
    const seen = [];
    const steps = setInterval(() => {
      page.evaluate(() => JSON.stringify(window.__fabtice.store.getState().separationRun)).then((s) => {
        if (seen[seen.length - 1] !== s) seen.push(s);
      }, () => {});
    }, 500);
    await page.waitForFunction(() => {
      const s = window.__fabtice.store.getState();
      return (s.separation.result && s.separationRun.status === 'idle') || s.separationRun.status === 'error';
    }, null, { timeout: 900000, polling: 500 });
    clearInterval(steps);
    const took = (Date.now() - t0) / 1000;
    const s = await page.evaluate(() => {
      const st = window.__fabtice.store.getState();
      const { registry } = window.__fabtice.lot3;
      return {
        run: st.separationRun,
        result: st.separation.result,
        names: st.tracks.map((tr) => tr.name),
        frames: st.tracks.map((tr) => registry.getAudio(tr.audio.id).frames),
        whole: registry.getAudio(st.separation.aside[0].audio.id).frames,
        isolated: crossOriginIsolated,
        report: window.__fabtice.lot3.separation.report(st.separation.result.id),
      };
    });
    console.log(`separation states: ${seen.join(' → ')}`);
    assert.equal(s.run.status, 'idle', `ended in ${JSON.stringify(s.run)}`);
    assert.equal(s.isolated, true);
    assert.equal(s.result.modelId, 'scnet', 'the same tool, whatever the path');
    assert.deepEqual([...s.names].sort(), ['Autres', 'Basse', 'Batterie', 'Voix']);
    assert.ok(s.frames.every((f) => f === s.whole), `lengths ${s.frames.join(',')} vs ${s.whole}`);
    assert.equal(await page.locator('.piste-tete').count(), 4, 'four tracks shown');
    assert.ok(hub.some((u) => u.endsWith('scnet.int8.onnx')), `SCNet fetched from the hub: ${hub.join(', ')}`);
    assert.match(s.report, /Rapport de séparation Fabtice/);
    console.log(`separation in the app: ${took.toFixed(1)} s with the download, on ${s.result.backend}${s.result.fellBack ? ' after a graphics failure' : ''}; compute ${s.result.computeSeconds.toFixed(1)} s\n${s.report}`);

    // The tool is kept on the device (a Blob in its own database).
    const kept = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('fabtice-separation-tools');
          open.onerror = () => resolve(null);
          open.onsuccess = () => {
            const get = open.result.transaction('files').objectStore('files').get('scnet');
            get.onsuccess = () => {
              const r = get.result;
              open.result.close();
              resolve(r ? { bytes: r.bytes, size: r.data instanceof Blob ? r.data.size : r.data.byteLength } : null);
            };
          };
        }),
    );
    assert.deepEqual(kept, { bytes: 12900277, size: 12900277 });

    // The page's own « Copier le rapport », and the report in the diagnostic window.
    await page.locator('[data-testid="copier-rapport"]').click();
    await page.locator('.separation-rapport [role="status"]').waitFor();
    const diagnostic = await openDiagnostic(app);
    const text = await diagnostic.locator('#diag-text').innerText();
    assert.match(text, /--- Dernière séparation ---\nRapport de séparation Fabtice/);
    assert.match(text, /Outil : SCNet \(scnet\)/);
    console.log('the report is in the diagnostic window');

    // Chromium notes a 404 of the list in the console (the list is not on the main branch yet): the page says nothing.
    const listMissing = list.includes('HTTP 404');
    const harmless = (p) => NO_ADAPTER.test(p) || (listMissing && /Failed to load resource: the server responded with a status of 404/.test(p));
    const ignored = problems.filter(harmless);
    if (ignored.length) console.log(`ignored: ${ignored.join(' | ')}`);
    problems.splice(0, problems.length, ...problems.filter((p) => !harmless(p)));
    await assertClean(page, problems, 'separation');
  } finally {
    await app.close();
  }
});
