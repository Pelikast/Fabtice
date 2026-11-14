// The real offline renderer (Rubber Band R3 « finer » in a Web Worker) and
// « Appliquer » with the real engine, in Chromium:
//   renderer   alignment of a click train at several tempos and pitches, no
//              drift along a 5-minute file, speed (seconds of compute per
//              minute of stereo audio) and what several workers gain, fast
//              cancel, the binary loaded only when a render starts and served
//              with its licence;
//   app        the whole journey on a piece with the REAL engine and renderer:
//              « Appliquer » offered, the waiting screen with a real progress,
//              the rendered audio played as it is, back to the preview on any
//              change; the calm refusal when the device could not hold the
//              render; screenshots of each state.
//   npm run build && npm run test:render
// Screenshots go to $FABTICE_RENDER_OUT (default: a temporary folder).
// `FABTICE_RENDER_ONLY=renderer|app` runs one part. Speeds measured here say
// nothing about other machines. Run in the foreground.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const out = process.env.FABTICE_RENDER_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-render-'));
fs.mkdirSync(out, { recursive: true });
const only = process.env.FABTICE_RENDER_ONLY || null;
const part = (name) => !only || only === name;

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(query, { viewport = { width: 1280, height: 800 }, init = null } = {}) {
  const context = await browser.newContext({ viewport });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${url}/${query}`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
  await page.evaluate(() => window.__fabtice.ready);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, requests, context };
}

try {
  // ============================================================ the renderer on its own
  if (part('renderer')) {
    const { page, errors, requests, context } = await open('?debug&analyse=aucune&rendu=reel');
    const kind = await page.evaluate(() => window.__fabtice.lot3.renderer.getRenderer().kind);
    check('?rendu=reel gives the real renderer in a browser', kind === 'rubberband', kind);
    check('the binary is not fetched before a render is asked for', !requests.some((u) => /rubberband.*\.wasm/.test(u)), requests.filter((u) => /rubberband/.test(u)).join(' '));
    await page.evaluate(() => {
      const SR = 48000;
      const T = (window.T = {});
      T.pcm = (channels) => window.__fabtice.lot3.pcm.pcmFromChannels(channels, SR);
      T.read = (pcm, ch = 0) => {
        const a = new Float32Array(pcm.frames);
        window.__fabtice.lot3.pcm.readPcm(pcm, ch, 0, a);
        return a;
      };
      T.clicks = (sec, times, len = 48, seed = 99) => {
        const a = new Float32Array(Math.round(sec * SR));
        let s = seed;
        for (const t of times) {
          const start = Math.round(t * SR);
          for (let i = 0; i < len && start + i < a.length; i++) {
            s = (s * 1664525 + 1013904223) >>> 0;
            a[start + i] += 0.8 * Math.sin((Math.PI * (i + 0.5)) / len) ** 2 * (s / 2 ** 31 - 1);
          }
        }
        return a;
      };
      T.centroid = (x, at, half) => {
        let num = 0, den = 0;
        for (let i = Math.max(0, Math.round(at) - half); i < Math.min(x.length, Math.round(at) + half); i++) {
          const v = x[i] * x[i];
          num += v * i;
          den += v;
        }
        return den > 1e-12 ? num / den : NaN;
      };
      /** Errors in ms of every click of a rendered click train against where it belongs. */
      T.errors = (out, times, len, ratio) => times.map((t) => {
        const wanted = (t * SR + len / 2) / ratio;
        return ((T.centroid(out, wanted, 1200) - wanted) / SR) * 1000;
      });
      T.renderer = () => window.__fabtice.lot3.renderer.getRenderer();
    });

    // ---- alignment at several tempos and pitches (20 s, a click every 0.27 s)
    const grid = await page.evaluate(async () => {
      const times = [];
      for (let t = 0.5; t < 19.5; t += 0.2713) times.push(t);
      const x = T.clicks(20, times);
      const audio = T.pcm([x]);
      const rows = [];
      for (const ratio of [0.5, 0.7, 1.25]) {
        for (const semitones of [-3, 2, 7]) {
          const o = await T.renderer().render({ audio, semitones, cents: 0, tempoRatio: ratio, formants: false });
          const e = T.errors(T.read(o), times, 48, ratio);
          const within = e.filter((v) => Math.abs(v) <= 2).length / e.length;
          rows.push({ ratio, semitones, frames: o.frames, expected: Math.round(x.length / ratio), first: e[0], last: e[e.length - 1], worst: Math.max(...e.map(Math.abs)), within, n: e.length });
        }
      }
      return rows;
    });
    for (const r of grid) {
      note(`ratio ${r.ratio}, ${r.semitones >= 0 ? '+' : ''}${r.semitones} st: ${r.n} clicks, first ${r.first.toFixed(2)} ms, last ${r.last.toFixed(2)} ms, worst ${r.worst.toFixed(2)} ms, ${(r.within * 100).toFixed(0)} % within ±2 ms`);
    }
    check('every output lasts exactly round(frames / tempo)', grid.every((r) => r.frames === r.expected), grid.map((r) => `${r.frames - r.expected}`).join(' '));
    check('ratios 0.7 and 1.25: every click within ±2 ms of where it belongs, first to last', grid.filter((r) => r.ratio !== 0.5).every((r) => r.worst <= 2), grid.filter((r) => r.ratio !== 0.5).map((r) => r.worst.toFixed(2)).join(' '));
    check('ratio 0.5 (the engine\'s hop grid is coarser): the bulk within ±2 ms, the worst within 5 ms', grid.filter((r) => r.ratio === 0.5).every((r) => r.within >= 0.85 && r.worst <= 5), grid.filter((r) => r.ratio === 0.5).map((r) => `${(r.within * 100).toFixed(0)} % / ${r.worst.toFixed(1)}`).join('  '));

    if (process.env.FABTICE_RENDER_QUICK !== '1') {
      // ---- five minutes: no drift
      const long = await page.evaluate(async () => {
        const times = [];
        for (let t = 1.013; t < 296; t += 1.9137) times.push(t);
        const audio = T.pcm([T.clicks(300, times)]);
        const t0 = performance.now();
        const o = await T.renderer().render({ audio, semitones: 2, cents: 0, tempoRatio: 0.7, formants: false });
        const took = (performance.now() - t0) / 1000;
        const e = T.errors(T.read(o), times, 48, 0.7);
        const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        return { n: e.length, first: mean(e.slice(0, 20)), middle: mean(e.slice(e.length / 2 - 10, e.length / 2 + 10)), last: mean(e.slice(-20)), worst: Math.max(...e.map(Math.abs)), frames: o.frames, expected: Math.round(audio.frames / 0.7), took };
      });
      note(`5-minute mono file at 0.7, +2 st: ${long.n} clicks, mean error first 20 ${long.first.toFixed(2)} ms, middle ${long.middle.toFixed(2)} ms, last 20 ${long.last.toFixed(2)} ms, worst ${long.worst.toFixed(2)} ms; ${long.took.toFixed(1)} s`);
      check('5 minutes: no drift (first and last clicks agree), exact length', Math.abs(long.last - long.first) < 0.5 && long.worst <= 2 && long.frames === long.expected, `drift ${(long.last - long.first).toFixed(2)} ms, worst ${long.worst.toFixed(2)} ms`);
    }

    // ---- speed, stereo, one worker; then several tracks at once
    const speed = await page.evaluate(async () => {
      const mk = (seed) => {
        const n = 48000 * 60;
        const l = new Float32Array(n), r = new Float32Array(n);
        let s = seed;
        for (let i = 0; i < n; i++) {
          s = (s * 1664525 + 1013904223) >>> 0;
          const nz = (s / 2 ** 32 - 0.5) * 0.04;
          const t = i / 48000;
          l[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 330 * t + seed) + nz;
          r[i] = 0.25 * Math.sin(2 * Math.PI * 247 * t) + 0.2 * Math.sin(2 * Math.PI * 392 * t) - nz;
        }
        return T.pcm([l, r]);
      };
      const audios = [mk(1), mk(2), mk(3), mk(4)];
      const res = { cores: navigator.hardwareConcurrency };
      for (const ratio of [1, 0.7]) {
        const t0 = performance.now();
        await T.renderer().render({ audio: audios[0], semitones: 2, cents: 0, tempoRatio: ratio, formants: false });
        res['one' + String(ratio).replace('.', '_')] = (performance.now() - t0) / 1000;
      }
      for (const lanes of [1, 2, 3, 4]) {
        const t0 = performance.now();
        let next = 0;
        const lane = async () => {
          while (next < audios.length) {
            const i = next++;
            await T.renderer().render({ audio: audios[i], semitones: 2, cents: 0, tempoRatio: 0.7, formants: false });
          }
        };
        await Promise.all(Array.from({ length: lanes }, lane));
        res['lanes' + lanes] = (performance.now() - t0) / 1000;
      }
      // the same with the formants kept
      const t0 = performance.now();
      await T.renderer().render({ audio: audios[0], semitones: 2, cents: 0, tempoRatio: 0.7, formants: true });
      res.formants = (performance.now() - t0) / 1000;
      return res;
    });
    note(`speed, 60 s of stereo, one worker, +2 st: ${speed.one1.toFixed(1)} s at tempo 1, ${speed.one0_7.toFixed(1)} s at 0.7 (${speed.cores} cores here); formants kept at 0.7: ${speed.formants.toFixed(1)} s`);
    note(`4 stereo tracks of 60 s at 0.7: ${speed.lanes1.toFixed(1)} s with 1 worker, ${speed.lanes2.toFixed(1)} s with 2, ${speed.lanes3.toFixed(1)} s with 3, ${speed.lanes4.toFixed(1)} s with 4`);
    check('several workers help (4 tracks, 2 workers at least 1.4 times faster than one)', speed.lanes1 / speed.lanes2 > 1.4, `${(speed.lanes1 / speed.lanes2).toFixed(2)} times`);

    // ---- cancel
    const cancel = await page.evaluate(async () => {
      const x = new Float32Array(48000 * 120);
      for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000);
      const audio = T.pcm([x]);
      const abort = new AbortController();
      let abortedAt = 0;
      const p = T.renderer().render({ audio, semitones: 2, cents: 0, tempoRatio: 0.7, formants: false, signal: abort.signal, onProgress: (f) => { if (f > 0.05 && !abortedAt) { abortedAt = performance.now(); abort.abort(); } } });
      let code = 'resolved';
      try { await p; } catch (e) { code = e.code; }
      return { code, ms: performance.now() - abortedAt };
    });
    await sleep(300);
    check('cancel is fast: the call rejects with `cancelled` within a few milliseconds and the worker is gone', cancel.code === 'cancelled' && cancel.ms < 200 && page.workers().length === 0, `${cancel.ms.toFixed(1)} ms, ${page.workers().length} worker(s) left`);
    check('the binary was fetched when the render began, and its licence is served', requests.some((u) => /assets\/rubberband-nosimd-.*\.wasm/.test(u)));
    const licence = await page.evaluate(async () => (await fetch(new URL('assets/LICENSE-rubberband-GPL.txt', location.href))).status);
    check('the Rubber Band licence (GPL) is served with the binary', licence === 200);
    check('no page errors (renderer)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============================================================ « Appliquer » in the app, real engine and renderer
  if (part('app')) {
    const piece = async (page, seconds, tracks = 2) => {
      await page.evaluate(
        async ({ seconds, tracks }) => {
          const sr = 48000;
          const n = sr * seconds;
          const roles = ['voix', 'batterie', 'basse', 'guitare', 'piano', 'vents', 'autres'];
          const list = [];
          for (let k = 0; k < tracks; k++) {
            const l = new Float32Array(n), r = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const t = i / sr;
              l[i] = 0.25 * Math.sin(2 * Math.PI * (110 + 55 * k) * t) + 0.1 * Math.sin(2 * Math.PI * (330 + 110 * k) * t);
              r[i] = 0.25 * Math.sin(2 * Math.PI * (110 + 55 * k) * t + 0.5) + 0.1 * Math.sin(2 * Math.PI * (440 + 110 * k) * t);
            }
            list.push({ role: roles[k % roles.length], audio: { channels: [l, r], sampleRate: sr } });
          }
          await window.__fabtice.actions.openProject({ title: 'rendu', source: { kind: 'demo' }, tracks: list });
        },
        { seconds, tracks },
      );
      await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    };

    for (const [width, height] of [[1280, 800], [390, 844]]) {
      const tag = `${width}x${height}`;
      const { page, errors, context } = await open('?debug&analyse=aucune&rendu=reel', { viewport: { width, height } });
      await piece(page, 36);
      await page.click('button[aria-label="Un demi-ton plus haut"]');
      await page.waitForSelector('[data-testid="appliquer"]');
      check(`${tag}: a changed key is heard at once in preview, « Appliquer » offered`, (await page.evaluate(() => window.__fabtice.engine.isRenderedInUse())) === false);
      await page.screenshot({ path: path.join(out, `appliquer-${tag}.png`) });
      const t0 = Date.now();
      await page.click('[data-testid="appliquer"]');
      await page.waitForSelector('[data-testid="attente-rendu"]');
      await sleep(1500);
      const pct = async () => Number((await page.locator('.attente .phase span').last().innerText()).replace(/\D/g, ''));
      const p1 = await pct();
      await page.screenshot({ path: path.join(out, `appliquer-attente-${tag}.png`) });
      await sleep(2500);
      const p2 = await pct();
      check(`${tag}: the waiting screen shows a real progress that advances`, p2 > p1 && p1 >= 0 && p2 <= 100, `${p1} % then ${p2} %`);
      const left = await page.waitForSelector('.attente .panneau-note', { timeout: 15000 }).then(() => page.locator('.attente .panneau-note').innerText(), () => null);
      check(`${tag}: once the pace is known the waiting screen says how long is left`, !!left && /restante|environ/.test(left), String(left));
      if (left) await page.screenshot({ path: path.join(out, `appliquer-attente-reste-${tag}.png`) });
      await page.waitForSelector('[data-testid="applique"]', { timeout: 120000 });
      note(`${tag}: two stereo tracks of 36 s rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      const st = await page.evaluate(async () => {
        const e = window.__fabtice.engine;
        const before = e.getPosition();
        e.seek(5);
        await e.play();
        await new Promise((r) => setTimeout(r, 1500));
        const d = e.diagnostics();
        const pos = e.getPosition();
        e.pause();
        return { inUse: e.isRenderedInUse(), weight: d.applied, bytes: e.renderedBytes(), src: e.memoryBytes(), pos, before };
      });
      check(`${tag}: applied: the engine plays the rendered audio as it is`, st.inUse && st.weight === 1 && st.pos > 5.8, `weight ${st.weight}, position ${st.pos.toFixed(2)}, ${(st.bytes / 1048576).toFixed(1)} MB of render for ${(st.src / 1048576).toFixed(1)} MB of source`);
      await page.screenshot({ path: path.join(out, `applique-${tag}.png`) });
      await page.click('button[aria-label="Un demi-ton plus haut"]');
      await sleep(300);
      const back = await page.evaluate(() => ({ inUse: window.__fabtice.engine.isRenderedInUse(), button: !!document.querySelector('[data-testid="appliquer"]') }));
      check(`${tag}: any new change goes back to the preview, « Appliquer » again, the render dropped`, !back.inUse && back.button && (await page.evaluate(() => window.__fabtice.engine.renderedBytes())) === 0);
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- the calm refusal: a device that could not hold the render
    for (const [width, height] of [[1280, 800], [390, 844]]) {
      const tag = `${width}x${height}`;
      const { page, errors, context } = await open('?debug&analyse=aucune&rendu=reel', {
        viewport: { width, height },
        init: () => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 0.25 }),
      });
      await piece(page, 360, 2);
      await page.click('button[aria-label="Ralentir"]');
      await page.waitForSelector('[data-testid="appliquer"]');
      await page.click('[data-testid="appliquer"]');
      await page.waitForSelector('[data-testid="attente-rendu"] .import-erreur', { timeout: 20000 });
      const text = await page.locator('[data-testid="attente-rendu"] .import-erreur').innerText();
      check(`${tag}: refused in one calm sentence, nothing rendered, the preview stays`, /ne peut pas contenir/.test(text) && text.split(/[.;]/).filter((s) => s.trim()).length <= 3 && !(await page.evaluate(() => window.__fabtice.engine.isRenderedInUse())), text.replace(/\s+/g, ' '));
      await page.screenshot({ path: path.join(out, `appliquer-refus-${tag}.png`) });
      await page.click('[data-testid="attente-rendu"] button');
      check(`${tag}: the refusal can be dismissed and the piece plays on in preview`, (await page.locator('[data-testid="attente-rendu"]').count()) === 0 && (await page.evaluate(() => window.__fabtice.engine.getState())) === 'ready');
      check(`${tag}: no page errors (refusal)`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }
} finally {
  await browser.close();
  srv.close();
}
note(`screenshots in ${out}`);
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nrender: all checks passed');
