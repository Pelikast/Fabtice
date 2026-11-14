// Memory of « Exporter le son » with seven five-minute stereo tracks (the size
// of a separated piece), measured the way `test:memory` does: the resident
// memory of every Chromium process, before the export and at its peak, sampled
// every 50 ms while it runs. The three exports of the spec: the tracks as a ZIP
// of WAV (about 400 MB), the tracks as a ZIP of mp3, and the mix as an mp3; plus
// the mix as a WAV and a flac, for the figures. Prints the numbers; checks that the
// files are what they say, and that the peak stays within the bounds the design
// promises (stated below).
//   npm run build && npm run test:export-memory
// Run in the foreground (like test:engine and test:memory).

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
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;

/** Resident memory of every Chromium process of this run, in bytes. */
const rss = () => {
  const lines = execSync('ps -eo rss=,comm=', { encoding: 'utf8' }).split('\n').filter((l) => /\s(chrome|chromium|headless_shell|chrome-headless-shell)\S*$/.test(l));
  return lines.reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[0]) * 1024, 0);
};

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });

async function settle(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      window.gc?.();
      await new Promise((r) => setTimeout(r, 300));
    }
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/?debug&analyse=aucune`);
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3);
  const base0 = rss();
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
          const v = 0.12 * Math.sin((2 * Math.PI * (110 + 40 * k) * i) / sr) + 0.05 * Math.sin((2 * Math.PI * (330 + 90 * k) * i) / sr) + (seed / 0x7fffffff - 0.5) * 0.08;
          l[i] = v;
          r[i] = -v * 0.9 + 0.02 * Math.sin((2 * Math.PI * 220 * i) / sr);
        }
        tracks.push({ role: roles[k % roles.length], audio: { channels: [l, r], sampleRate: sr } });
      }
      await window.__fabtice.actions.openProject({ title: 'mesure', source: { kind: 'demo' }, tracks });
    },
    { count: 7, seconds: 300 },
  );
  await page.waitForFunction(() => window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 180000 });
  await settle(page);
  const opened = rss();
  note(`seven 5-minute stereo tracks open: resident ${mb(base0)} -> ${mb(opened)} (+${mb(opened - base0)}); the samples as 16 bits are ${mb(7 * 300 * 48000 * 4)}`);

  for (const [label, prefs, expectBytes] of [
    ['ZIP of 7 WAV (tracks)', { what: 'tracks', range: 'whole', format: 'wav' }, 7 * 300 * 48000 * 4],
    ['mix as WAV', { what: 'mix', range: 'whole', format: 'wav' }, 300 * 48000 * 4],
    ['mix as FLAC', { what: 'mix', range: 'whole', format: 'flac' }, null],
    ['mix as MP3', { what: 'mix', range: 'whole', format: 'mp3' }, 300 * 32000],
    ['ZIP of 7 MP3 (tracks)', { what: 'tracks', range: 'whole', format: 'mp3' }, 7 * 300 * 32000],
  ]) {
    await settle(page);
    const before = rss();
    let peak = before;
    const timer = setInterval(() => {
      try {
        peak = Math.max(peak, rss());
      } catch {
        // ps failed once: ignore this sample
      }
    }, 50);
    const t0 = Date.now();
    const result = await page.evaluate(async (prefs) => {
      const f = window.__fabtice;
      f.lot3.exportAudio.setExportPrefs(prefs);
      const s = f.store.getState();
      const plan = f.lot3.exportAudio.planAudioExport(s, s.exportPrefs, null);
      const file = await f.lot3.exportAudio.exportWithApp(plan, {});
      window.__kept = file.blob; // as the dialog keeps it until the file is saved
      return { name: file.name, size: file.blob.size };
    }, prefs);
    clearInterval(timer);
    const seconds = (Date.now() - t0) / 1000;
    peak = Math.max(peak, rss());
    await settle(page);
    const kept = rss();
    note(`${label}: ${mb(result.size)} in ${seconds.toFixed(1)} s; resident before ${mb(before)}, PEAK ${mb(peak)} (+${mb(peak - before)}), after, file kept ${mb(kept)} (+${mb(kept - before)})`);
    if (expectBytes) check(`${label}: the file has about the expected size`, result.size > expectBytes * 0.9 && result.size < expectBytes * 1.2, `${mb(result.size)} vs ~${mb(expectBytes)}`);
    // The design's promise: a peak above the file's own size, by less than a quarter of the samples held
    // (one 64 KB chunk at a time, nothing whole in Float32), for the tracks; the mix adds its accumulator (two Float32 channels of the mix).
    const mixExtra = prefs.what === 'mix' ? 300 * 48000 * 8 + 300 * 48000 * 4 : 0;
    const bound = result.size + mixExtra + 7 * 300 * 48000 * 4 * 0.5 + 150 * 1048576;
    check(`${label}: the peak stays within the file + the mix accumulator + 50 % of the samples + 150 MB`, peak - before <= bound, `+${mb(peak - before)} vs ${mb(bound)}`);
    await page.evaluate(() => {
      window.__kept = null;
    });
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
} finally {
  await browser.close();
  srv.close();
}
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nexport-memory: all checks passed');
