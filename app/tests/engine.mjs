// Browser checks of the real audio engine (AudioWorklet + Signalsmith Stretch)
// in Chromium: serves the built web/ folder with the isolation headers, opens
// ?demo and measures. There is no audio device, so everything is verified by
// measurement: a recorder worklet taps the engine's output, the engine's
// position is sampled against the audio clock, and counters are read back.
//   npm run build && npm run test:engine
// Optional: `npm run build:desktop` first, and the desktop build (relative
// base, served from a sub-folder) is checked too. Playwright and Chromium are
// expected preinstalled (here under /opt/node-tools); PLAYWRIGHT_MODULE_DIR
// loads them from elsewhere. Speeds measured here say nothing about other
// machines.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain', '.json': 'application/json' };

/** Static server for one folder, with (or without) cross-origin isolation headers, under an optional URL prefix. */
function serveDir(root, { isolated = true, prefix = '' } = {}) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(prefix + '/')) p = '/__none__';
      else p = p.slice(prefix.length);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const h = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (isolated) {
        h['Cross-Origin-Opener-Policy'] = 'same-origin';
        h['Cross-Origin-Embedder-Policy'] = 'require-corp';
      }
      res.writeHead(200, h);
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}${prefix}` }));
  });
}

// ENGINE_ONLY=4,5 runs only those numbered sections (debugging).
const only = process.env.ENGINE_ONLY ? process.env.ENGINE_ONLY.split(',') : null;
const want = (n) => !only || only.includes(n);

let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---------------------------------------------------------------- helpers living in the page

function installHelpers() {
  const SR = 48000;
  const T = {};
  window.T = T;
  T.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  T.eng = () => window.__fabtice.engine;
  T.ctx = () => T.eng().debugContext;
  T.clock = () => T.ctx().currentTime;

  // ----- signals
  T.sine = (f, sec, amp = 0.5) => {
    const a = new Float32Array(Math.round(sec * SR));
    for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * f * i) / SR);
    return a;
  };
  T.harmonic = (f0, sec) => {
    const a = new Float32Array(Math.round(sec * SR));
    for (let k = 1; k <= 12; k++) for (let i = 0; i < a.length; i++) a[i] += (0.3 / k) * Math.sin((2 * Math.PI * f0 * k * i) / SR + k);
    return a;
  };
  T.pulses = (sec, times, amp = 0.8, freq = 2000) => {
    const a = new Float32Array(Math.round(sec * SR));
    const len = Math.round(0.003 * SR);
    for (const t of times) {
      const s = Math.round(t * SR);
      for (let i = 0; i < len && s + i < a.length; i++) a[s + i] += amp * Math.sin((Math.PI * i) / len) ** 2 * Math.sin((2 * Math.PI * freq * i) / SR);
    }
    return a;
  };
  /** Loads tracks given as { id, data (Float32Array, mono) | channels, mix? } and resets every setting. */
  T.load = async (specs) => {
    const e = T.eng();
    e.pause();
    e.setLoop(null);
    e.setTransposition(0, 0);
    e.setTempoRatio(1);
    e.setMetronome(false);
    e.setClickTrack({ times: new Float64Array(0), accents: new Uint8Array(0) });
    const tracks = specs.map((s) => ({ id: s.id, channels: s.channels || [s.data], sampleRate: SR }));
    const mixes = Object.fromEntries(specs.map((s) => [s.id, s.mix || { mute: false, solo: false, volume: 1 }]));
    await e.loadTracks(tracks, mixes);
  };

  // ----- recorder: taps the engine's output, remembers the frame of the first sample
  T.recorder = async () => {
    if (T.rec) return T.rec;
    const ctx = T.ctx();
    const code = `class Rec extends AudioWorkletProcessor {
      constructor() { super(); this.on = false; this.b = []; this.first = -1;
        this.port.onmessage = (e) => {
          if (e.data === 'start') { this.on = true; this.b = []; this.first = -1; }
          else if (e.data === 'stop') {
            this.on = false;
            const n = this.b.reduce((a, x) => a + x.length, 0), out = new Float32Array(n);
            let o = 0; for (const x of this.b) { out.set(x, o); o += x.length; }
            this.port.postMessage({ data: out, first: this.first }, [out.buffer]); this.b = [];
          }
        }; }
      process(inputs) { if (this.on && inputs[0] && inputs[0][0]) { if (this.first < 0) this.first = currentFrame; this.b.push(inputs[0][0].slice()); } return true; }
    }
    registerProcessor('fab-rec', Rec);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(ctx, 'fab-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    T.eng().debugNode.connect(node);
    node.connect(ctx.destination);
    T.rec = {
      node,
      start() { node.port.postMessage('start'); },
      stop() { return new Promise((res) => { node.port.onmessage = (e) => res(e.data); node.port.postMessage('stop'); }); },
    };
    return T.rec;
  };

  // ----- analysis
  T.zeroCrossFreq = (x, from, to) => {
    let first = -1, last = -1, count = 0;
    for (let i = Math.max(1, from); i < to; i++) {
      if (x[i - 1] < 0 && x[i] >= 0) {
        const t = i - 1 + (0 - x[i - 1]) / (x[i] - x[i - 1]);
        if (first < 0) first = t;
        last = t;
        count++;
      }
    }
    return count > 1 ? ((count - 1) * SR) / (last - first) : 0;
  };
  /** Fundamental by autocorrelation with parabolic refinement, searched around `fexp`. */
  T.f0auto = (x, from, len, fexp) => {
    const lagMin = Math.floor(SR / (fexp * 1.25)), lagMax = Math.ceil(SR / (fexp * 0.8));
    const r = new Float64Array(lagMax + 2);
    for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
      let s = 0;
      for (let i = from; i < from + len; i++) s += x[i] * x[i + lag];
      r[lag] = s;
    }
    let best = lagMin;
    for (let lag = lagMin; lag <= lagMax; lag++) if (r[lag] > r[best]) best = lag;
    const d = (0.5 * (r[best - 1] - r[best + 1])) / (r[best - 1] - 2 * r[best] + r[best + 1]);
    return SR / (best + d);
  };
  T.cents = (f, ref) => 1200 * Math.log2(f / ref);
  /** Amplitude of the component at frequency f (Goertzel-like, rectangular window, whole periods not required). */
  T.amp = (x, from, to, f) => {
    let re = 0, im = 0;
    for (let i = from; i < to; i++) {
      const w = (2 * Math.PI * f * i) / SR;
      re += x[i] * Math.cos(w);
      im += x[i] * Math.sin(w);
    }
    return (2 * Math.hypot(re, im)) / (to - from);
  };
  T.db = (a, b) => 20 * Math.log10(Math.max(a, 1e-9) / Math.max(b, 1e-9));
  T.findBursts = (x, thr, from = 0, to = x.length, minGap = 2400) => {
    const out = [];
    let i = from;
    while (i < to) {
      if (Math.abs(x[i]) > thr) {
        let j = i, last = i, num = 0, den = 0;
        while (j < to && j - last < minGap / 2) {
          const a = Math.abs(x[j]);
          if (a > thr * 0.3) {
            last = j;
            num += a * a * j;
            den += a * a;
          }
          j++;
        }
        out.push(num / den);
        i = j;
      } else i++;
    }
    return out;
  };
  /** Peak of the second difference over its RMS: a pure sine gives 1.41, a click much more. */
  T.seam = (x, from, to) => {
    let mx = 0, s2 = 0, n = 0;
    for (let i = Math.max(2, from); i < to; i++) {
      const r = x[i] - 2 * x[i - 1] + x[i - 2];
      mx = Math.max(mx, Math.abs(r));
      s2 += r * r;
      n++;
    }
    return mx / Math.sqrt(s2 / n);
  };
  /** Records `ms` of output while `during` runs; returns { data, first }. */
  T.record = async (ms, during) => {
    console.log('[trace]', Math.round(performance.now()), 'record: recorder');
    const rec = await T.recorder();
    console.log('[trace]', Math.round(performance.now()), 'record: start, ctx', T.ctx().state);
    rec.start();
    const p = during ? during() : null;
    await T.sleep(ms);
    console.log('[trace]', Math.round(performance.now()), 'record: slept, ctx', T.ctx().state, 'engine', T.eng().getState());
    if (p) await p;
    const r = await rec.stop();
    console.log('[trace]', Math.round(performance.now()), 'record: stopped', r.data.length);
    return r;
  };
  /** Waits on the audio clock (not the wall clock). */
  T.audioWait = async (sec) => {
    const t0 = T.clock();
    while (T.clock() - t0 < sec) await T.sleep(5);
  };
  /** Samples [audio frame, engine position (frames)] every few ms while `fn` runs. */
  T.samplePosition = async (fn) => {
    const out = [];
    const id = setInterval(() => out.push([T.clock() * SR, T.eng().getPosition() * SR]), 6);
    await fn();
    clearInterval(id);
    return out;
  };
}

// ---------------------------------------------------------------- run

const { srv, url: webUrl } = await serveDir(path.resolve(here, '../../web'));
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errorsOf = new WeakMap();

async function open(base, query, { isolated = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  if (!isolated) {
    // Same server, answers without the isolation headers: what a host that does not set them would serve.
    await context.route('**/*', async (route) => {
      const resp = await route.fetch();
      const headers = { ...resp.headers() };
      delete headers['cross-origin-opener-policy'];
      delete headers['cross-origin-embedder-policy'];
      await route.fulfill({ response: resp, headers });
    });
  }
  const page = await context.newPage();
  const errors = [];
  errorsOf.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (process.env.ENGINE_TRACE && m.text().startsWith('[trace]')) console.log(m.text());
  });
  await page.goto(`${base}/${query}`);
  return page;
}
const waitEngine = (page, states = ['ready', 'error'], timeout = 30000) =>
  page.waitForFunction((s) => window.__fabtice && s.includes(window.__fabtice.store.getState().transport.engine), states, { timeout });

try {
  // ------------------------------------------------------------ the mock stays available
  {
    const page = await open(webUrl, '?demo&moteur=factice');
    await waitEngine(page);
    const kind = await page.evaluate(() => typeof window.__fabtice.engine.snapshot === 'function');
    check('?moteur=factice forces the mock engine', kind);
    await page.context().close();
  }

  // ------------------------------------------------------------ unsupported: no cross-origin isolation
  {
    const page = await open(webUrl, '?demo', { isolated: false });
    await waitEngine(page, ['error']);
    const r = await page.evaluate(() => ({ iso: crossOriginIsolated, st: window.__fabtice.engine.getState(), err: window.__fabtice.store.getState().transport.error, mock: typeof window.__fabtice.engine.snapshot === 'function' }));
    check('without isolation: state error, code unsupported, no silent mock', !r.iso && r.st === 'error' && r.err?.code === 'unsupported' && !r.mock, `${r.err?.code}: ${r.err?.detail}`);
    await page.context().close();
  }

  // ------------------------------------------------------------ the real engine on ?demo
  const page = await open(webUrl, '?demo');
  await waitEngine(page);
  await page.evaluate(installHelpers);
  const info = await page.evaluate(() => {
    const e = window.__fabtice.engine;
    return { state: e.getState(), sr: e.debugContext.sampleRate, isolated: crossOriginIsolated, duration: e.getDuration(), real: typeof e.snapshot !== 'function', diag: e.diagnostics() };
  });
  check('demo loads in the real engine, context at 48 kHz', info.state === 'ready' && info.real && info.sr === 48000 && info.isolated, `duration ${info.duration.toFixed(2)} s, latency model a=${info.diag.latencyA.toFixed(0)} b=${info.diag.latencyB.toFixed(0)} frames (${(((info.diag.latencyA + info.diag.latencyB) / 48000) * 1000).toFixed(0)} ms at 100 %)`);

  // ---- 1. position advances at the tempo ratio, paused position holds, seek
  if (want('1')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      const out = {};
      await T.load([{ id: 'a', data: T.sine(220, 60) }]);
      out.pausedAt0 = e.getPosition();
      e.seek(10);
      out.afterSeekPaused = e.getPosition();
      for (const ratio of [1, 0.5, 1.5]) {
        e.setTempoRatio(ratio);
        e.seek(5);
        await e.play();
        await T.audioWait(1.2); // settle: engine start-up and the ratio smoothing
        const c0 = T.clock(), p0 = e.getPosition();
        await T.audioWait(3);
        const c1 = T.clock(), p1 = e.getPosition();
        out['rate' + ratio] = (p1 - p0) / (c1 - c0);
        e.pause();
        out['held' + ratio] = [e.getPosition(), (await T.sleep(300), e.getPosition())];
      }
      e.setTempoRatio(1);
      e.seek(20);
      await e.play();
      await T.sleep(60);
      out.seekPlaying = e.getPosition();
      e.seek(40);
      out.seekJump = e.getPosition();
      await T.audioWait(0.8);
      out.afterJump = e.getPosition();
      e.pause();
      return out;
    });
    check('paused position starts at 0, seek while paused is immediate', r.pausedAt0 === 0 && r.afterSeekPaused === 10);
    for (const ratio of [1, 0.5, 1.5]) {
      const v = r['rate' + ratio];
      check(`position advances at the tempo ratio ${ratio}`, Math.abs(v / ratio - 1) < 0.01, `${v.toFixed(4)} source s per audio s (expected ${ratio})`);
      const [a, b] = r['held' + ratio];
      check(`pause holds the position (ratio ${ratio})`, a === b, `${a.toFixed(4)} then ${b.toFixed(4)}`);
    }
    check('seek while playing: shown at once, then keeps playing', Math.abs(r.seekPlaying - 20) < 0.5 && Math.abs(r.seekJump - 40) < 0.05 && r.afterJump > 40.3 && r.afterJump < 41.5, `after 60 ms ${r.seekPlaying.toFixed(3)}, jump shows ${r.seekJump.toFixed(3)}, 0.8 s later ${r.afterJump.toFixed(3)}`);
  }

  // ---- 2. the heard position agrees with what comes out (pulses at known source times)
  if (want('2')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      const times = [];
      for (let t = 0.7; t < 25; t += 0.5) times.push(t);
      await T.load([{ id: 'p', data: T.pulses(30, times) }]);
      e.setTempoRatio(0.8);
      e.seek(0);
      const samples = [];
      const rec = await T.recorder();
      rec.start();
      await e.play();
      const series = await T.samplePosition(() => T.audioWait(7));
      e.pause();
      const { data, first } = await rec.stop();
      const bursts = T.findBursts(data, 0.2);
      let pk = 0, at = 0;
      for (let i = 0; i < 4000; i++) if (Math.abs(data[i]) > pk) { pk = Math.abs(data[i]); at = i; }
      return { times, series, bursts, first, n: data.length, samples, head: [pk, at, Array.from(data.slice(at - 3, at + 4))] };
    });
    // burst k (source time times[k] + 1.5 ms) is heard at output frame first + bursts[k]
    if (process.env.ENGINE_TRACE) console.log('bursts (s, from recorder start)', r.bursts.slice(0, 6).map((b) => (b / 48000).toFixed(3)), 'first', r.first, 'series0', r.series[0], 'head', JSON.stringify(r.head));
    let worst = 0, n = 0;
    for (let k = 0; k < r.bursts.length; k++) {
      const F = r.first + r.bursts[k];
      const S = (r.times[k] + 0.0015) * 48000;
      // position of the engine at audio frame F, by interpolation
      let i = r.series.findIndex((s) => s[0] >= F);
      if (i <= 0) continue;
      const [c0, p0] = r.series[i - 1], [c1, p1] = r.series[i];
      if (c1 - c0 > 4800 || c1 === c0) continue;
      const P = p0 + ((p1 - p0) * (F - c0)) / (c1 - c0);
      const err = ((P - S) / 48000) * 1000;
      if (Math.abs(err) > Math.abs(worst)) worst = err;
      n++;
    }
    check('heard position matches the sound that comes out (rate 0.8)', n >= 6 && Math.abs(worst) < 25, `${n} pulses compared, worst error ${worst.toFixed(1)} ms (positions in source time, audio-clock granularity)`);
  }

  // ---- 3. loop: wraps, stays inside, no click at the seam, position wraps
  if (want('3')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([{ id: 'a', data: T.sine(330, 30, 0.5) }]);
      const L0 = 2.003, L1 = 3.611; // not beat aligned on purpose
      e.setLoop({ start: L0, end: L1 });
      e.seek(1.5);
      const positions = [];
      const rec = await T.recorder();
      rec.start();
      await e.play();
      const t0 = T.clock();
      while (T.clock() - t0 < 9) {
        positions.push(e.getPosition());
        await T.sleep(20);
      }
      e.pause();
      const { data } = await rec.stop();
      // 1.5 s of start-up, then compare with a naive wrap: the metric on the whole stretch after that
      const seam = T.seam(data, 48000 * 2, data.length);
      return { positions, seam, L0, L1 };
    });
    const inside = r.positions.filter((p) => p > 1.4).every((p) => p >= r.L0 - 0.01 && p <= r.L1 + 0.01) || false;
    const first = r.positions.findIndex((p) => p >= r.L0);
    const after = r.positions.slice(first);
    let wraps = 0;
    for (let i = 1; i < after.length; i++) if (after[i] < after[i - 1] - 0.5) wraps++;
    check('loop: position wraps at the loop end and stays in the loop', wraps >= 3 && after.every((p) => p >= r.L0 - 0.01 && p <= r.L1 + 0.01) && inside !== undefined, `${wraps} wraps in 9 s, loop ${(r.L1 - r.L0).toFixed(3)} s`);
    check('loop: no click at the seam (second-difference peak/rms, pure sine 1.41)', r.seam < 4.5, `${r.seam.toFixed(2)}`);
  }

  // ---- 4. transposition: semitones and cents move a measured fundamental by the expected ratio
  if (want('4')) {
    const cases = [[7, 0], [-5, 0], [12, 0], [-12, 0], [0, 40], [0, -50], [3, 25], [-2, -30]];
    const rows = await page.evaluate(async (cases) => {
      const e = T.eng();
      const f0 = 110;
      await T.load([{ id: 'h', data: T.harmonic(f0, 40) }]);
      const out = [];
      for (const [semi, cents] of cases) {
        e.setTransposition(semi, cents);
        e.seek(1);
        const { data } = await T.record(3600, () => e.play());
        e.pause();
        const fe = f0 * 2 ** ((semi + cents / 100) / 12);
        const f = T.f0auto(data, 48000 * 2, 24000, fe);
        out.push({ semi, cents, f, fe, err: T.cents(f, fe) });
      }
      return out;
    }, cases);
    for (const c of rows) check(`transposition ${c.semi >= 0 ? '+' : ''}${c.semi} st ${c.cents >= 0 ? '+' : ''}${c.cents} cents`, Math.abs(c.err) < 8, `${c.f.toFixed(2)} Hz for ${c.fe.toFixed(2)} Hz: ${c.err.toFixed(2)} cents`);
  }

  // ---- 5. tempo change keeps the pitch (and the tempo is right)
  if (want('5')) {
    const rows = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([{ id: 'a', data: T.harmonic(110, 60) }]);
      const out = [];
      for (const ratio of [0.5, 0.75, 1.5, 2]) {
        e.setTempoRatio(ratio);
        e.seek(1);
        const { data } = await T.record(3400, () => e.play());
        e.pause();
        out.push({ ratio, err: T.cents(T.f0auto(data, 48000 * 2, 24000, 110), 110) });
      }
      // live change while playing: pitch before and after
      e.setTempoRatio(1);
      e.seek(1);
      const rec = await T.recorder();
      rec.start();
      await e.play();
      await T.audioWait(2);
      e.setTempoRatio(0.6);
      await T.audioWait(2.5);
      e.pause();
      const { data } = await rec.stop();
      const sec = (a, b) => T.f0auto(data, Math.round(a * 48000), 24000, 110);
      out.push({ ratio: 'live 1 to 0.6 (before)', err: T.cents(sec(1.0), 110) });
      out.push({ ratio: 'live 1 to 0.6 (after)', err: T.cents(sec(3.6), 110) });
      return out;
    });
    for (const c of rows) check(`tempo ${c.ratio}: pitch unchanged`, Math.abs(c.err) < 8, `${c.err.toFixed(2)} cents`);
  }

  // ---- 6. mute, solo, volume
  if (want('6')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      const mix = (m) => ({ mute: false, solo: false, volume: 1, ...m });
      await T.load([
        { id: 'A', data: T.sine(440, 30, 0.3) },
        { id: 'B', data: T.sine(660, 30, 0.3) },
      ]);
      e.seek(1);
      const rec = await T.recorder();
      rec.start();
      await e.play();
      await T.audioWait(1.5);
      const marks = {};
      const step = async (name, fn) => {
        fn();
        await T.audioWait(0.3); // gain ramps and latency
        marks[name] = T.clock();
        await T.audioWait(0.5);
      };
      await step('both', () => {});
      await step('muteA', () => e.setTrackMix('A', mix({ mute: true })));
      await step('unmuteA', () => e.setTrackMix('A', mix({})));
      await step('soloB', () => e.setTrackMix('B', mix({ solo: true })));
      await step('unsolo', () => e.setTrackMix('B', mix({})));
      await step('halfA', () => e.setTrackMix('A', mix({ volume: 0.5 })));
      await step('mixB_ignored', () => e.setTrackMix('nope', mix({ mute: true })));
      e.pause();
      const { data, first } = await rec.stop();
      const res = {};
      for (const [name, t] of Object.entries(marks)) {
        const from = Math.round(t * 48000 - first), to = from + Math.round(0.4 * 48000);
        res[name] = [T.amp(data, from, to, 440), T.amp(data, from, to, 660)];
      }
      return res;
    });
    const [a0, b0] = r.both;
    check('both tracks audible at the start (0.3 each)', Math.abs(a0 - 0.3) < 0.02 && Math.abs(b0 - 0.3) < 0.02, `A ${a0.toFixed(3)}, B ${b0.toFixed(3)}`);
    check('mute silences the track, the other is untouched', r.muteA[0] < 0.003 && Math.abs(r.muteA[1] - b0) < 0.02, `A ${r.muteA[0].toFixed(4)} (${(20 * Math.log10(r.muteA[0] / a0)).toFixed(0)} dB), B ${r.muteA[1].toFixed(3)}`);
    check('unmute restores it', Math.abs(r.unmuteA[0] - a0) < 0.02, `A ${r.unmuteA[0].toFixed(3)}`);
    check('solo keeps only the soloed track', r.soloB[0] < 0.003 && Math.abs(r.soloB[1] - b0) < 0.02, `A ${r.soloB[0].toFixed(4)}, B ${r.soloB[1].toFixed(3)}`);
    check('leaving solo restores everything', Math.abs(r.unsolo[0] - a0) < 0.02 && Math.abs(r.unsolo[1] - b0) < 0.02);
    check('volume 0.5 halves the level (-6 dB)', Math.abs(r.halfA[0] / a0 - 0.5) < 0.03 && Math.abs(r.halfA[1] - b0) < 0.02, `ratio ${(r.halfA[0] / a0).toFixed(3)}`);
    check('mix of an unknown track id is ignored', Math.abs(r.mixB_ignored[0] - r.halfA[0]) < 0.02 && Math.abs(r.mixB_ignored[1] - b0) < 0.02);
  }

  // ---- 7. metronome: clicks land on the click track, at the played tempo
  if (want('7')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      // irregular beats, as a tempo map with a ritardando would give; a pulse track sits on the same beats
      const beats = [];
      let t = 0.9, iv = 0.5;
      for (let i = 0; i < 40; i++) {
        beats.push(t);
        t += iv;
        iv = 0.5 + 0.1 * Math.sin(i / 3);
      }
      const accents = Uint8Array.from(beats.map((_, i) => (i % 4 === 0 ? 1 : 0)));
      const out = {};
      for (const ratio of [1, 0.6, 1.4]) {
        await T.load([{ id: 'p', data: T.pulses(40, beats), mix: { mute: false, solo: false, volume: 1 } }]);
        e.setTempoRatio(ratio);
        e.setClickTrack({ times: Float64Array.from(beats), accents });
        const run = async (metronome) => {
          e.setMetronome(metronome);
          e.setTrackMix('p', { mute: metronome, solo: false, volume: 1 });
          e.seek(0.2);
          await T.sleep(50);
          const { data } = await T.record(Math.round((8 / ratio) * 1000), () => e.play());
          e.pause();
          return data;
        };
        const stems = await run(false);
        const clicks = await run(true);
        const onsets = (a, thr) => {
          const o = [];
          let last = -1e9;
          for (let i = 0; i < a.length; i++) {
            if (Math.abs(a[i]) > thr) {
              if (i - last > 2000) o.push(i);
              last = i;
            }
          }
          return o;
        };
        const so = onsets(stems, 0.05), co = onsets(clicks, 0.05);
        const n = Math.min(so.length, co.length);
        let worst = 0;
        // both runs start the same way; compare onset k of each, relative to their first onset
        for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(so[i] - so[0] - (co[i] - co[0])));
        // absolute: the first click against the first pulse
        out[ratio] = { n, so: so.length, co: co.length, worstMs: (worst / 48000) * 1000, firstMs: ((co[0] - so[0]) / 48000) * 1000 };
      }
      // a click is not time-stretched: its length does not depend on the ratio
      return out;
    });
    for (const ratio of ['1', '0.6', '1.4']) {
      const c = r[ratio];
      check(`metronome clicks on the click track at ratio ${ratio}`, c.n >= 8 && c.worstMs < 6 && Math.abs(c.firstMs) < 12, `${c.co} clicks vs ${c.so} pulses, spacing error max ${c.worstMs.toFixed(2)} ms, first click vs first pulse ${c.firstMs.toFixed(2)} ms`);
    }
  }

  // ---- 8. ended fires, restart from 0
  if (want('8')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([{ id: 'a', data: T.sine(220, 4) }]);
      const events = [];
      const off = e.on('ended', () => events.push(['ended', T.clock(), e.getState(), e.getPosition()]));
      e.seek(2.5);
      const t0 = T.clock();
      await e.play();
      await T.audioWait(3);
      const res = { events, t0, state: e.getState(), pos: e.getPosition(), dur: e.getDuration() };
      await e.play(); // at the end: restarts from 0
      await T.sleep(50);
      res.restart = e.getPosition();
      await T.audioWait(0.5);
      res.restartLater = e.getPosition();
      e.pause();
      // loop never ends
      e.setLoop({ start: 1, end: 2 });
      e.seek(1.5);
      events.length = 0;
      await e.play();
      await T.audioWait(3);
      res.loopEnded = events.length;
      e.pause();
      off();
      return res;
    });
    const ev = r.events[0];
    check('ended fires once, engine ready at the end', r.events.length === 1 && r.state === 'ready' && Math.abs(r.pos - r.dur) < 1e-6 && ev && ev[2] === 'ready', `fired ${((ev?.[1] ?? 0) - r.t0).toFixed(2)} audio s after play (1.5 s of material + latency)`);
    check('play at the end restarts from 0', r.restart < 0.3 && r.restartLater > 0.3 && r.restartLater < 1.5, `${r.restart.toFixed(3)} then ${r.restartLater.toFixed(3)}`);
    check('ended never fires while looping', r.loopEnded === 0);
  }

  // ---- 9. safety limiter on the mix bus
  if (want('9')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([
        { id: 'a', data: T.sine(300, 20, 0.6) },
        { id: 'b', data: T.sine(300, 20, 0.6) },
        { id: 'c', data: T.sine(300, 20, 0.6) },
      ]);
      e.seek(1);
      const { data } = await T.record(4000, () => e.play());
      e.pause();
      let peak = 0;
      for (let i = 48000 * 2; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      await T.load([{ id: 'q', data: T.sine(300, 20, 0.5) }]);
      e.seek(1);
      const q = await T.record(3600, () => e.play());
      e.pause();
      let qpeak = 0;
      for (let i = 48000 * 2; i < q.data.length; i++) qpeak = Math.max(qpeak, Math.abs(q.data[i]));
      return { peak, qpeak };
    });
    check('limiter: three summed 0.6 sines (1.8 peak) stay under -1 dBFS', r.peak <= 0.8914 && r.peak > 0.8, `peak ${r.peak.toFixed(4)} (ceiling 0.8913)`);
    check('limiter: a 0.5 sine is untouched', Math.abs(r.qpeak - 0.5) < 0.01, `peak ${r.qpeak.toFixed(4)}`);
  }

  // ---- 10. real-time stability and processing load, 7 tracks
  if (want('10')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      const specs = [];
      for (let k = 0; k < 7; k++) {
        const times = [];
        for (let t = 0.3 + 0.05 * k; t < 118; t += 0.4) times.push(t);
        const a = T.harmonic(110 * (k + 1), 120);
        const p = T.pulses(120, times, 0.2, 800 + 300 * k);
        for (let i = 0; i < a.length; i++) a[i] = 0.15 * a[i] + p[i];
        specs.push({ id: 't' + k, channels: [a, a.map((v, i) => (i % 97 === 0 ? v * 0.5 : v))] }); // stereo (not identical)
      }
      await T.load(specs);
      e.setTransposition(-3, 20);
      e.setTempoRatio(0.8);
      e.setMetronome(true);
      const us0 = T.ctx().playbackStats ? T.ctx().playbackStats.underrunEvents : -1;
      e.seek(5);
      const rec = await T.recorder();
      rec.start();
      await e.play();
      const loads = [];
      const t0 = T.clock();
      while (T.clock() - t0 < 12) {
        await T.sleep(250);
        const d = e.diagnostics();
        loads.push(d.loadAvg);
      }
      const d = e.diagnostics();
      const us1 = T.ctx().playbackStats ? T.ctx().playbackStats.underrunEvents : -1;
      e.pause();
      const { data } = await rec.stop();
      // gaps: runs of exact zeros inside the stretch of continuous material
      let zeroRun = 0, maxRun = 0;
      for (let i = 48000 * 2; i < data.length; i++) {
        if (data[i] === 0) zeroRun++;
        else zeroRun = 0;
        if (zeroRun > maxRun) maxRun = zeroRun;
      }
      return { loads, d, us0, us1, maxRun, mem: e.memoryBytes(), n: data.length, clock: T.clock() - t0 };
    });
    const avg = r.loads.reduce((a, b) => a + b, 0) / r.loads.length;
    check('7 tracks play without underrun or gap', r.d.overBudget === 0 && r.d.missingChunks === 0 && r.maxRun < 64 && (r.us0 < 0 || r.us1 === r.us0), `over-budget quanta ${r.d.overBudget}, playbackStats underrun events ${r.us0} -> ${r.us1}, longest run of exact zeros ${r.maxRun} samples, active tracks ${r.d.activeTracks}`);
    check('processing load per track in the spike range (about 2 to 3.5 % of a core)', avg / 7 < 0.06, `${(avg * 100).toFixed(1)} % of the audio-thread budget for 7 stereo tracks, +metronome, -3.2 st, 0.8: ${((avg / 7) * 100).toFixed(2)} % per track (coarse: the worklet has a 1 ms timer)`);
    console.log(`      audio memory for these 7 tracks of 120 s: ${(r.mem / 1048576).toFixed(0)} MB (16-bit stereo), wasm heap ${(r.d.wasmBytes / 1048576).toFixed(0)} MB`);
  }

  // ---- 11. mute skips computing; load drops
  if (want('11')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load(['a', 'b', 'c', 'd'].map((id, k) => ({ id, data: T.harmonic(110 * (k + 1), 30) })));
      e.seek(1);
      await e.play();
      await T.audioWait(1.5);
      const all = e.diagnostics().activeTracks;
      for (const id of ['b', 'c', 'd']) e.setTrackMix(id, { mute: true, solo: false, volume: 1 });
      await T.audioWait(1.5);
      const some = e.diagnostics().activeTracks;
      e.pause();
      return { all, some };
    });
    check('muted tracks are not computed', r.all === 4 && r.some === 1, `active ${r.all} -> ${r.some}`);
  }

  // ---- 12. add / remove / clear
  if (want('12')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([{ id: 'a', data: T.sine(440, 10) }]);
      const out = { d0: e.getDuration() };
      await e.addTrack({ id: 'b', channels: [T.sine(660, 20)], sampleRate: 48000 }, { mute: false, solo: false, volume: 1 });
      out.d1 = e.getDuration();
      e.seek(1);
      const { data } = await T.record(2500, () => e.play());
      e.pause();
      out.both = [T.amp(data, 48000 * 1.2, 48000 * 2, 440), T.amp(data, 48000 * 1.2, 48000 * 2, 660)];
      e.removeTrack('a');
      out.d2 = e.getDuration();
      e.removeTrack('zzz');
      e.clear();
      out.state = e.getState();
      out.d3 = e.getDuration();
      let rejected = false;
      try {
        await e.loadTracks([{ id: 'x', channels: [new Float32Array(100)], sampleRate: 44100 }], {});
      } catch {
        rejected = true;
      }
      out.badRate = [rejected, e.getState()];
      return out;
    });
    check('addTrack extends the piece and sounds; removeTrack shrinks it; clear empties', r.d0 === 10 && r.d1 === 20 && r.both[0] > 0.2 && r.both[1] > 0.2 && r.d2 === 20 && r.state === 'empty' && r.d3 === 0, `durations ${r.d0} ${r.d1} ${r.d2} ${r.d3}, amplitudes ${r.both.map((x) => x.toFixed(2)).join(' ')}`);
    check('a wrong sample rate rejects with state error', r.badRate[0] && r.badRate[1] === 'error');
  }

  // ---- 13. suspended context after a pause, resumed by play()
  if (want('13')) {
    const r = await page.evaluate(async () => {
      const e = T.eng();
      await T.load([{ id: 'a', data: T.sine(440, 30) }]);
      e.seek(3);
      await e.play();
      await T.audioWait(0.5);
      e.pause();
      const held = e.getPosition();
      await T.sleep(900);
      const suspended = T.ctx().state;
      e.seek(7);
      const whileSuspended = e.getPosition();
      await e.play();
      await T.audioWait(0.6);
      const resumed = [T.ctx().state, e.getState(), e.getPosition()];
      e.pause();
      return { held, suspended, whileSuspended, resumed };
    });
    check('context sleeps after a pause, seek works asleep, play() resumes', r.suspended === 'suspended' && r.whileSuspended === 7 && r.resumed[0] === 'running' && r.resumed[1] === 'playing' && r.resumed[2] > 7.2 && r.resumed[2] < 8, `${r.suspended}; position ${r.whileSuspended} then ${r.resumed[2].toFixed(2)}`);
  }

  const errs = errorsOf.get(page);
  check('no page errors with the real engine', errs.length === 0, errs.join(' | '));
  await page.context().close();

  // ------------------------------------------------------------ the desktop build (relative base, sub-folder)
  const desktopDir = path.resolve(here, '../../desktop/ui');
  if (fs.existsSync(path.join(desktopDir, 'index.html'))) {
    const { srv: dsrv, url: durl } = await serveDir(desktopDir, { prefix: '/app/ui' });
    const p2 = await open(durl, '?demo');
    await waitEngine(p2);
    const r = await p2.evaluate(async () => {
      const e = window.__fabtice.engine;
      await e.play();
      await new Promise((r) => setTimeout(r, 1200));
      const out = { state: e.getState(), pos: e.getPosition(), sr: e.debugContext.sampleRate };
      e.pause();
      return out;
    });
    check('desktop build (relative base, sub-folder): worklet and wasm load, plays', r.state === 'playing' && r.pos > 9.4 && r.sr === 48000, `position ${r.pos.toFixed(2)}`);
    const errs2 = errorsOf.get(p2);
    check('desktop build: no page errors', errs2.length === 0, errs2.join(' | '));
    await p2.context().close();
    dsrv.close();
  } else console.log('SKIP  desktop build not present (run `npm run build:desktop` first)');
} finally {
  await browser.close();
  srv.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll engine checks passed');
process.exit(failed ? 1 : 0);
