'use strict';

// Where the separated instruments (lot 3) can be kept, checked IN THE APP, on
// its `fabtice://app` origin, with sizes of tens of MB, across a quit and a
// relaunch:
//   1. the store the interface uses (IndexedDB, `ProjectStorage.saveTrackAudio`):
//      two stereo tracks of 2 min 30 (about 29 MB each in 16 bits) written, the
//      app quit, relaunched, both read back sample for sample;
//   2. the alternative that was considered, the origin private file system
//      (`navigator.storage.getDirectory()`), with a file of the same size: does it
//      exist on this origin, does it keep the bytes across a relaunch?
// The result of (2) is printed, not asserted: the decision (IndexedDB) does not
// depend on it, the measure documents it.
//
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface: launch, assertClean } = require('./helpers');

const SECONDS = 150;

/** Waits for the lot 3 handle that `?debug` exposes. */
async function handle(page) {
  await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 30000 });
}

test('separated instruments of real size are kept on the app origin and read back after a relaunch', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-separated-'));
  let { app, page, problems } = await launch({}, userData);
  let written;
  try {
    await handle(page);
    written = await page.evaluate(async (seconds) => {
      const { pcm, storage } = window.__fabtice.lot3;
      const sr = 48000;
      const n = sr * seconds;
      const make = (f1, f2) => {
        const l = new Float32Array(n);
        const r = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          l[i] = 0.4 * Math.sin((2 * Math.PI * f1 * i) / sr);
          r[i] = 0.3 * Math.sin((2 * Math.PI * f2 * i) / sr + 0.5);
        }
        return pcm.pcmFromChannels([l, r], sr);
      };
      const store = storage();
      const t0 = performance.now();
      const a = make(110, 220);
      await store.saveTrackAudio('e2e-basse', a);
      const b = make(440, 660);
      await store.saveTrackAudio('e2e-voix', b);
      const writeMs = performance.now() - t0;
      // A few samples to compare after the relaunch.
      const probe = (p) => {
        const out = new Float32Array(8);
        pcm.readPcm(p, 1, 5_000_000, out);
        return Array.from(out);
      };
      // The alternative: the origin private file system, same size.
      let opfs = 'absent';
      try {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle('e2e-essai.bin', { create: true });
        const w = await fh.createWritable();
        const chunk = new Uint8Array(1024 * 1024);
        for (let i = 0; i < chunk.length; i++) chunk[i] = i & 255;
        for (let k = 0; k < Math.round(a.bytes / chunk.length); k++) await w.write(chunk);
        await w.close();
        opfs = `written ${(await fh.getFile()).size}`;
      } catch (e) {
        opfs = `refused: ${e && e.name}: ${e && e.message}`;
      }
      const usage = await store.trackAudioUsage();
      return { bytes: a.bytes + b.bytes, frames: a.frames, probeA: probe(a), probeB: probe(b), writeMs, opfs, usage };
    }, SECONDS);
    assert.equal(written.usage.ids.length, 2);
    assert.equal(written.usage.bytes, written.bytes);
    assert.ok(written.bytes > 50e6, `${written.bytes} bytes written`);
    console.log(`IndexedDB on fabtice://app: ${(written.bytes / 1e6).toFixed(1)} MB written in ${(written.writeMs / 1000).toFixed(1)} s; private file system: ${written.opfs}`);
    await assertClean(page, problems, 'first launch');
  } finally {
    await app.close();
  }

  ({ app, page, problems } = await launch({}, userData));
  try {
    await handle(page);
    const back = await page.evaluate(async () => {
      const { pcm, storage } = window.__fabtice.lot3;
      const store = storage();
      const t0 = performance.now();
      const a = await store.loadTrackAudio('e2e-basse');
      const b = await store.loadTrackAudio('e2e-voix');
      const readMs = performance.now() - t0;
      const probe = (p) => {
        const out = new Float32Array(8);
        pcm.readPcm(p, 1, 5_000_000, out);
        return Array.from(out);
      };
      let opfs = 'absent';
      try {
        const root = await navigator.storage.getDirectory();
        const f = await (await root.getFileHandle('e2e-essai.bin')).getFile();
        opfs = `read back ${f.size}`;
      } catch (e) {
        opfs = `not found: ${e && e.name}`;
      }
      const shared = a && a.chunks[0].l.buffer instanceof SharedArrayBuffer;
      await store.deleteTrackAudio(['e2e-basse', 'e2e-voix']);
      const after = await store.trackAudioUsage();
      return { a: a && { frames: a.frames, mono: a.mono, probe: probe(a) }, b: b && { frames: b.frames, probe: probe(b) }, readMs, opfs, shared, after };
    });
    assert.ok(back.a && back.b, 'both tracks are back');
    assert.equal(back.a.frames, written.frames);
    assert.equal(back.a.mono, false);
    assert.deepEqual(back.a.probe, written.probeA);
    assert.deepEqual(back.b.probe, written.probeB);
    assert.equal(back.shared, true, 'read back into shared memory, ready for the engine');
    assert.deepEqual(back.after, { bytes: 0, ids: [] }, 'freed');
    console.log(`after the relaunch: both tracks read back in ${(back.readMs / 1000).toFixed(1)} s; private file system: ${back.opfs}`);
    await assertClean(page, problems, 'relaunch');
  } finally {
    await app.close();
  }
});
