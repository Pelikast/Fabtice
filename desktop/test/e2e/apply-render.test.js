'use strict';

// « Appliquer » IN THE APP, under the shipped policy (the `fabtice://app`
// origin, its CSP, cross-origin isolation): the offline renderer's WebAssembly
// binary (Rubber Band R3 « finer ») is found and loaded by the render worker
// only when the render starts, the worker and the binary pass the policy,
// the rendered audio reaches the real engine as shared memory and is played as
// it is, and the Rubber Band licence is served next to its binary.
//
// Also checked here, in the same session: the renderer puts every click of a
// click train where it belongs (±2 ms) at tempo 0.7 and +2 semitones, and the
// worker is gone when the render is done.
//
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface: launch, assertClean } = require('./helpers');

test('« Appliquer » renders with the real renderer in the app and the engine plays the rendered audio', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-apply-'));
  const { app, page, problems } = await launch({ FABTICE_E2E_QUERY: '?debug&analyse=aucune&rendu=reel' }, userData);
  const requests = [];
  app.context().on('request', (r) => requests.push(r.url()));
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'the page is cross-origin isolated');
    assert.equal(await page.evaluate(() => window.__fabtice.lot3.renderer.getRenderer().kind), 'rubberband', 'the real renderer is the one in use');

    // A short two-track piece, opened through the store like an import would.
    await page.evaluate(async () => {
      const sr = 48000;
      const n = sr * 12;
      const tracks = [];
      for (let k = 0; k < 2; k++) {
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          l[i] = 0.25 * Math.sin(2 * Math.PI * (110 + 55 * k) * t);
          r[i] = 0.25 * Math.sin(2 * Math.PI * (110 + 55 * k) * t + 0.5);
        }
        tracks.push({ role: k ? 'batterie' : 'voix', audio: { channels: [l, r], sampleRate: sr } });
      }
      await window.__fabtice.actions.openProject({ title: 'rendu', source: { kind: 'demo' }, tracks });
    });
    await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    assert.ok(!requests.some((u) => /rubberband/.test(u)), 'nothing of the renderer is fetched before « Appliquer » is used');

    // A key and a tempo that differ from the original: the preview, then « Appliquer ».
    await page.click('button[aria-label="Un demi-ton plus haut"]');
    await page.click('button[aria-label="Ralentir"]');
    await page.waitForSelector('[data-testid="appliquer"]');
    assert.equal(await page.evaluate(() => window.__fabtice.engine.isRenderedInUse()), false, 'the preview is what is heard before « Appliquer »');
    await page.click('[data-testid="appliquer"]');
    await page.waitForSelector('[data-testid="attente-rendu"]');
    await page.waitForSelector('[data-testid="applique"]', { timeout: 120000 });

    const played = await page.evaluate(async () => {
      const e = window.__fabtice.engine;
      const s = window.__fabtice.store.getState();
      e.seek(2);
      await e.play();
      await new Promise((r) => setTimeout(r, 1500));
      const d = e.diagnostics();
      const pos = e.getPosition();
      e.pause();
      return { inUse: e.isRenderedInUse(), weight: d.applied, pos, bytes: e.renderedBytes(), semitones: s.playback.semitones, ratio: s.playback.tempoRatio, over: d.overBudget };
    });
    assert.equal(played.inUse, true, 'the engine holds the rendered set for the live key and tempo');
    assert.equal(played.weight, 1, 'the rendered audio, as it is, is what is heard');
    assert.ok(played.pos > 2.5 && played.pos < 3.6, `position in source time: ${played.pos}`);
    assert.ok(played.bytes > 0);

    // The binary was fetched by the worker from the app's own origin, once the render started; its licence sits next to it.
    const wasm = requests.filter((u) => /^fabtice:\/\/app\/assets\/rubberband-nosimd-[^/]*\.wasm$/.test(u));
    assert.ok(wasm.length >= 1, `the renderer's binary was loaded under fabtice://app: ${requests.filter((u) => /rubberband|worker/.test(u)).join(' ')}`);
    assert.ok(requests.some((u) => /^fabtice:\/\/app\/assets\/worker-[^/]*\.js$/.test(u)), 'the render worker script was loaded under fabtice://app');
    const licence = await page.evaluate(async () => {
      const r = await fetch(new URL('assets/LICENSE-rubberband-GPL.txt', location.href));
      return { status: r.status, text: (await r.text()).slice(0, 60) };
    });
    assert.equal(licence.status, 200);
    assert.match(licence.text, /GNU GENERAL PUBLIC LICENSE/);
    assert.equal(page.workers().length, 0, 'no render worker is left running');

    // The renderer under this policy puts the clicks where they belong.
    const align = await page.evaluate(async () => {
      const SR = 48000;
      const len = 48;
      const times = [];
      for (let t = 0.5; t < 9.5; t += 0.2713) times.push(t);
      const x = new Float32Array(SR * 10);
      let seed = 99;
      for (const t of times) {
        const start = Math.round(t * SR);
        for (let i = 0; i < len; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          x[start + i] += 0.8 * Math.sin((Math.PI * (i + 0.5)) / len) ** 2 * (seed / 2 ** 31 - 1);
        }
      }
      const { pcm, renderer } = window.__fabtice.lot3;
      const audio = pcm.pcmFromChannels([x], SR);
      const out = await renderer.getRenderer().render({ audio, semitones: 2, cents: 0, tempoRatio: 0.7, formants: false });
      const y = new Float32Array(out.frames);
      pcm.readPcm(out, 0, 0, y);
      const errors = times.map((t) => {
        const wanted = (t * SR + len / 2) / 0.7;
        let num = 0;
        let den = 0;
        for (let i = Math.round(wanted) - 1200; i < Math.round(wanted) + 1200; i++) {
          const v = y[i] * y[i];
          num += v * i;
          den += v;
        }
        return ((num / den - wanted) / SR) * 1000;
      });
      return { frames: out.frames, expected: Math.round(x.length / 0.7), worst: Math.max(...errors.map(Math.abs)), n: errors.length };
    });
    assert.equal(align.frames, align.expected, 'exact length');
    assert.ok(align.worst <= 2, `every click within ±2 ms: worst ${align.worst.toFixed(2)} ms over ${align.n} clicks`);

    await assertClean(page, problems, 'apply render');
  } finally {
    await app.close();
  }
});
