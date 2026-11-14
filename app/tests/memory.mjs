// Memory held by the decoded audio of an open piece, with the REAL engine, in
// Chromium: a five-minute stereo piece as one track, then as seven tracks (a
// separated piece). Prints the numbers; checks only that the single-copy
// design holds (the engine and the registry share the same samples).
//   npm run build && npm run test:memory
// Run in the foreground (like test:engine).

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);
const mb = (n) => (n === null || n === undefined ? 'n/a' : `${(n / 1048576).toFixed(0)} MB`);

/** Resident memory of every Chromium process of this run, in bytes. */
const rss = () => {
  try {
    const lines = execSync('ps -eo rss=,comm=', { encoding: 'utf8' }).split('\n').filter((l) => /\s(chrome|chromium|headless_shell|chrome-headless-shell)\S*$/.test(l));
    return lines.reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[0]) * 1024, 0);
  } catch {
    return null;
  }
};

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });

async function measure(page) {
  return page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      window.gc?.();
      await new Promise((r) => setTimeout(r, 200));
    }
    let total = null;
    try {
      total = (await performance.measureUserAgentSpecificMemory()).bytes;
    } catch {
      // not available
    }
    const engine = window.__fabtice.engine;
    const lot3 = window.__fabtice.lot3;
    return {
      total,
      engineBytes: typeof engine.memoryBytes === 'function' ? engine.memoryBytes() : null,
      registryBytes: lot3 ? lot3.registry.registryBytes() : null,
      // Same chunks in the engine and in the registry: no second copy.
      shared: lot3
        ? window.__fabtice.store.getState().tracks.every((tr) => lot3.registry.getAudio(tr.audio.id)?.chunks[0].l.buffer instanceof SharedArrayBuffer)
        : null,
    };
  });
}

/** Opens `count` tracks of `seconds` of stereo noise-like audio through the real store and engine. */
async function openTracks(page, count, seconds) {
  await page.evaluate(
    async ({ count, seconds }) => {
      const sr = 48000;
      const n = sr * seconds;
      const roles = ['voix', 'batterie', 'basse', 'guitare', 'piano', 'vents', 'autres'];
      const tracks = [];
      for (let k = 0; k < count; k++) {
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        let seed = 1234 + k;
        for (let i = 0; i < n; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const v = 0.3 * Math.sin((2 * Math.PI * (110 + 40 * k) * i) / sr) + (seed / 0x7fffffff - 0.5) * 0.05;
          l[i] = v;
          r[i] = -v * 0.9;
        }
        tracks.push({ role: count === 1 ? 'morceau' : roles[k % roles.length], audio: { channels: [l, r], sampleRate: sr } });
      }
      await window.__fabtice.actions.openProject({ title: 'mesure', source: { kind: 'demo' }, tracks });
    },
    { count, seconds },
  );
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 120000 });
  // Let the waveform peaks finish (they read the samples once).
  await page.waitForFunction(() => document.querySelector('.frise')?.dataset.peaks === 'ready', null, { timeout: 120000 }).catch(() => {});
}

try {
  const results = [];
  for (const count of [1, 7]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/?debug&analyse=aucune`);
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3);
    const before = await measure(page);
    const rssBefore = rss();
    await openTracks(page, count, 300);
    const after = await measure(page);
    const rssAfter = rss();
    const pcmFloat = count * 300 * 48000 * 2 * 4;
    results.push({ count, before, after, rssBefore, rssAfter });
    note(
      `${count} stereo track(s) of 5 min: page memory ${mb(before.total)} -> ${mb(after.total)} (+${mb(after.total - before.total)}); engine holds ${mb(after.engineBytes)}; ` +
        `resident (all Chromium processes) ${mb(rssBefore)} -> ${mb(rssAfter)} (+${mb(rssAfter - rssBefore)}); for reference the samples as Float32 = ${mb(pcmFloat)}, as 16-bit = ${mb(pcmFloat / 2)}`,
    );
    check(`${count} track(s): the registry holds the samples once, in shared memory, and the engine uses those`, after.shared === true && after.registryBytes === after.engineBytes, `${after.registryBytes} / ${after.engineBytes}`);
    if (count === 7) {
      // « Appliquer »: an applied set is one more copy of the tracks at the played speed (1.43 times the sources at 0.7).
      // Built track by track here (the renderer's own speed is measured in test:render), handed to the real engine
      // like the controller does, and let go again.
      const budget = await page.evaluate(() => window.__fabtice.lot3.renderer.renderBudgetBytes());
      const ratio = 0.7;
      await page.evaluate(() => window.__fabtice.actions.setTempoRatio(0.7));
      const rssSources = rss();
      const set = await page.evaluate(
        async ({ ratio }) => {
          const { pcm, renderer } = window.__fabtice.lot3;
          const e = window.__fabtice.engine;
          const state = window.__fabtice.store.getState();
          const sr = 48000;
          const n = Math.round((300 * sr) / ratio);
          const tracks = [];
          for (const [k, tr] of state.tracks.entries()) {
            const l = new Float32Array(n);
            const r = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const v = 0.3 * Math.sin((2 * Math.PI * (110 + 40 * k) * i) / sr);
              l[i] = v;
              r[i] = -v * 0.9;
            }
            tracks.push({ id: tr.id, pcm: pcm.pcmFromChannels([l, r], sr) }); // one track's Float32 at a time
          }
          const fits = renderer.appliedFits(tracks.map((t) => t.pcm), ratio);
          await e.setRenderedTracks({ semitones: 0, cents: 0, tempoRatio: ratio, tracks });
          return { fits, inUse: e.isRenderedInUse(), rendered: e.renderedBytes(), sources: e.memoryBytes(), shared: tracks.every((t) => t.pcm.chunks[0].l.buffer instanceof SharedArrayBuffer) };
        },
        { ratio },
      );
      const afterSet = await measure(page);
      const rssSet = rss();
      note(
        `applied set for the 7 tracks of 5 min at 0.7: ${mb(set.rendered)} next to ${mb(set.sources)} of sources (${(set.rendered / set.sources).toFixed(2)} times); ` +
          `page memory ${mb(after.total)} -> ${mb(afterSet.total)} (+${mb(afterSet.total - after.total)}); resident +${mb(rssSet - rssSources)}; the budget here is ${mb(budget)} (${set.fits ? 'fits' : 'refused'})`,
      );
      check('the applied set is one copy in shared memory (the engine reads the page\'s own chunks), 1/0.7 times the sources', set.inUse && set.shared && Math.abs(set.rendered / set.sources - 1 / ratio) < 0.01, `${mb(set.rendered)} / ${mb(set.sources)}`);
      check('the budget lets seven 5-minute stereo tracks at 0.7 through on this computer', set.fits && set.rendered <= budget, `${mb(set.rendered)} against ${mb(budget)}`);
      await page.evaluate(async () => window.__fabtice.engine.setRenderedTracks(null));
      const freed = await measure(page);
      note(`the set let go: page memory ${mb(afterSet.total)} -> ${mb(freed.total)}`);
      check('letting the set go frees it (the engine holds none)', (await page.evaluate(() => window.__fabtice.engine.renderedBytes())) === 0);
    }
    check(`${count} track(s): no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  srv.close();
}
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nmemory: all checks passed');
