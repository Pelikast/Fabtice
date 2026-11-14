// The port against the prototype, in Chromium, on the processor: for each
// tool, the prototype's own code (`web/spikes/separation/separator.js` +
// `dsp.js`, with its own ONNX Runtime build) and the app's pipeline
// (`separation/engine/`) run on the SAME 44.1 kHz input with the SAME network
// session; the parts must agree to numerical noise. Each excerpt spans two
// segments or more, so that the overlap between segments (and, for SCNet, the
// mirrored borders) is exercised. Also prints how far the sum of the parts is
// from the piece, for both, and for HTDemucs with another overlap.
//   npm run build && npm run test:separation-prototype
// Downloads the three tools (422 MB) from Hugging Face. FABTICE_PROTO_TOOLS=scnet,htdemucs-6s,bs-roformer-sw;
// FABTICE_PROTO_FP32=1 also runs HTDemucs with its 32-bit weights (110 MB more, same repository and revision).

import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const note = (s) => console.log(`NOTE  ${s}`);

// Prototype tier of each tool, and the excerpt: SCNet mirrored at both ends (longer than a segment), the
// others two segments without borders (a piece no longer than one segment is not mirrored by MSST).
const TOOLS = {
  scnet: { tier: 'leger', seconds: 12.5 },
  'htdemucs-6s': { tier: 'standard', seconds: 11.7 },
  'bs-roformer-sw': { tier: 'maximal', seconds: 4 },
};
const wanted = (process.env.FABTICE_PROTO_TOOLS || Object.keys(TOOLS).join(',')).split(',');

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const id of wanted) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/?debug&moteur=factice&analyse=aucune`);
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.lot3, null, { timeout: 20000 });
    const r = await page.evaluate(
      async ({ id, tier, seconds, withFp32 }) => {
        const proto = await import('./spikes/separation/separator.js');
        const { MODELS } = await import('./spikes/separation/models.js');
        const { engine, models } = window.__fabtice.lot3.separation;
        const spec = models().list.models.find((m) => m.id === id);
        const pm = MODELS[tier];
        // The settings of the list are the prototype's.
        const cfg = engine.parseConfig(spec.config);
        const same =
          pm.sha256 === spec.file.sha256 &&
          pm.segment === cfg.segment &&
          pm.overlap === cfg.overlap &&
          pm.family === cfg.family &&
          pm.io === cfg.io &&
          !!pm.normalize === cfg.normalize &&
          JSON.stringify(pm.stems) === JSON.stringify(spec.stems) &&
          pm.stft.nfft === cfg.stft.nfft &&
          pm.stft.hop === cfg.stft.hop &&
          pm.stft.window === cfg.stft.window &&
          pm.stft.normalized === cfg.stft.normalized &&
          !!pm.stft.zeroDC === cfg.stft.zeroDC;

        // The input: the analysis' demo piece at 44.1 kHz, made stereo (right channel 7 ms late).
        const mp3 = await (await fetch('./spikes/analyse/demo/demo-swing.mp3')).arrayBuffer();
        const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(mp3);
        const n = Math.round(seconds * 44100);
        const src = buf.getChannelData(0);
        const L = new Float32Array(n);
        const R = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          L[i] = src[44100 + i];
          R[i] = src[44100 + i - 309];
        }

        // One session for both: the prototype's ONNX Runtime build, on the processor.
        const bytes = new Uint8Array(await (await fetch(spec.file.url)).arrayBuffer());
        const ort = await proto.loadOrt('native', Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)));
        const { session } = await proto.createSession(ort, bytes, 'wasm', false);

        const t0 = performance.now();
        const ref = await proto.separate(pm, ort, session, L, R);
        const tProto = (performance.now() - t0) / 1000;

        const runPort = async (config) => {
          const runner = engine.makeRunner(config, spec.stems.length, (data, dims) => new ort.Tensor('float32', data, dims));
          const out = spec.stems.map(() => [new Float32Array(n), new Float32Array(n)]);
          const res = await engine.separatePiece({
            cfg: config,
            stems: spec.stems.length,
            input: { frames: n, sampleRate: 44100, stereo: true, read: (ch, start, o) => {
              const x = ch === 0 ? L : R;
              for (let i = 0; i < o.length; i++) {
                const k = start + i;
                o[i] = k >= 0 && k < n ? x[k] : 0;
              }
            } },
            model: { prepare: (l, r) => runner.prepare(l, r), run: (p) => session.run(p.feeds), finish: (p, o) => runner.finish(p, o) },
            emit: (offset, parts) => parts.forEach((p, s) => p.forEach((a, c) => out[s][c].set(a, offset))),
          });
          return { out, segments: res.segments };
        };
        const t1 = performance.now();
        const port = await runPort(cfg);
        const tPort = (performance.now() - t1) / 1000;

        const db = (e, s) => 10 * Math.log10(e / s);
        const parts = spec.stems.map((stem, s) => {
          let e = 0;
          let sig = 0;
          for (let c = 0; c < 2; c++) {
            const a = ref.stems[stem][c];
            const b = port.out[s][c];
            for (let i = 0; i < n; i++) {
              e += (a[i] - b[i]) ** 2;
              sig += a[i] ** 2;
            }
          }
          return { stem, diffDb: db(e, sig), levelDb: 10 * Math.log10(sig / (2 * n)) };
        });
        const sumDb = (get) => {
          let e = 0;
          let sig = 0;
          for (let c = 0; c < 2; c++) {
            const x = c === 0 ? L : R;
            for (let i = 0; i < n; i++) {
              let sum = 0;
              for (let s = 0; s < spec.stems.length; s++) sum += get(s, c)[i];
              e += (sum - x[i]) ** 2;
              sig += x[i] ** 2;
            }
          }
          return db(e, sig);
        };
        const sumProto = sumDb((s, c) => ref.stems[spec.stems[s]][c]);
        const sumPort = sumDb((s, c) => port.out[s][c]);
        let sumOther = null;
        let fp32 = null;
        if (cfg.family === 'demucs') {
          // Another overlap (0.5): is the residual a matter of segmenting?
          const half = await runPort({ ...cfg, overlap: 0.5 });
          sumOther = sumDb((s, c) => half.out[s][c]);
        }
        await session.release();
        if (withFp32 && cfg.family === 'demucs') {
          // The same network with 32-bit weights (same repository and revision; test only, never shipped): is the
          // residual the half-precision conversion?
          const b32 = new Uint8Array(await (await fetch(spec.file.url.replace('_fp16.onnx', '_fp32.onnx'))).arrayBuffer());
          const s32 = (await proto.createSession(ort, b32, 'wasm', false)).session;
          const runner = engine.makeRunner(cfg, spec.stems.length, (data, dims) => new ort.Tensor('float32', data, dims));
          const out = spec.stems.map(() => [new Float32Array(n), new Float32Array(n)]);
          await engine.separatePiece({
            cfg,
            stems: spec.stems.length,
            input: { frames: n, sampleRate: 44100, stereo: true, read: (ch, start, o) => {
              const x = ch === 0 ? L : R;
              for (let i = 0; i < o.length; i++) {
                const k = start + i;
                o[i] = k >= 0 && k < n ? x[k] : 0;
              }
            } },
            model: { prepare: (l, r) => runner.prepare(l, r), run: (p) => s32.run(p.feeds), finish: (p, o) => runner.finish(p, o) },
            emit: (offset, parts) => parts.forEach((p, s) => p.forEach((a, c) => out[s][c].set(a, offset))),
          });
          await s32.release();
          const diffs = spec.stems.map((stem, s) => {
            let e = 0;
            let sig = 0;
            for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) {
              e += (out[s][c][i] - port.out[s][c][i]) ** 2;
              sig += out[s][c][i] ** 2;
            }
            return `${stem} ${db(e, sig).toFixed(1)} dB`;
          });
          fp32 = { sum: sumDb((s, c) => out[s][c]), diffs, bytes: b32.length };
        }
        return { same, parts, sumProto, sumPort, sumOther, fp32, segments: port.segments, protoChunks: ref.chunks, tProto, tPort };
      },
      { id, ...TOOLS[id], withFp32: process.env.FABTICE_PROTO_FP32 === '1' },
    );
    check(`${id}: the list's settings are the prototype's (file, segment, overlap, STFT, normalisation, parts)`, r.same);
    check(`${id}: same segments as the prototype`, r.segments === r.protoChunks, `${r.segments} / ${r.protoChunks}`);
    for (const p of r.parts) check(`${id} ${p.stem}: the port gives the prototype's part (difference under −80 dB)`, p.diffDb < -80, `${p.diffDb.toFixed(1)} dB, part at ${p.levelDb.toFixed(1)} dBFS`);
    note(`${id}: ${r.segments} segments; prototype ${r.tProto.toFixed(1)} s, port ${r.tPort.toFixed(1)} s; sum of the parts vs the piece: prototype ${r.sumProto.toFixed(1)} dB, port ${r.sumPort.toFixed(1)} dB${r.sumOther !== null ? `, port with overlap 0.5 ${r.sumOther.toFixed(1)} dB` : ''}`);
    if (r.fp32) note(`${id} with 32-bit weights (${r.fp32.bytes} bytes): sum of the parts vs the piece ${r.fp32.sum.toFixed(1)} dB; 16-bit weights vs 32-bit, per part: ${r.fp32.diffs.join(', ')}`);
    check(`${id}: no page errors`, errors.length === 0, errors.join(' | '));
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
console.log('\nseparation vs prototype: all checks passed');
