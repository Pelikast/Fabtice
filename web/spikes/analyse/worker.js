// Analysis worker: loads the models, runs the networks, keeps their outputs so that grid
// corrections only re-run the cheap decoding steps.
import * as ort from './vendor/ort/ort.wasm.min.mjs';
import { loadModel, MODELS } from './lib/models.js';
import { analyse, gridFromActivations, chartFromGrid } from './lib/pipeline.js';
import { tempoCurve } from './lib/beats.js';

const threads = Math.max(1, Math.min(4, (self.navigator && navigator.hardwareConcurrency) || 1));
ort.env.wasm.numThreads = self.crossOriginIsolated ? threads : 1;
ort.env.wasm.wasmPaths = new URL('./vendor/ort/', import.meta.url).href;

const sessions = {};
const modelInfo = {};
let state = null; // { act, frames, timeScale, opts }

const post = (type, data = {}) => self.postMessage({ type, ...data });

async function session(key) {
  if (sessions[key]) return sessions[key];
  post('progress', { stage: 'model', msg: `Téléchargement : ${MODELS[key].name}`, p: 0 });
  const m = await loadModel(key, (p) => post('progress', { stage: 'model', msg: `Téléchargement : ${MODELS[key].name}`, p }));
  const t0 = performance.now();
  sessions[key] = await ort.InferenceSession.create(m.buffer, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  modelInfo[key] = { ...MODELS[key], fromCache: m.fromCache, loadMs: Math.round(m.ms), initMs: Math.round(performance.now() - t0), verified: true };
  return sessions[key];
}

function slimResult(r) {
  return {
    tuning: r.tuning, grid: r.grid, meterScores: r.meterScores, tempo: r.tempo, key: r.key,
    segments: r.segments, raw: r.raw, timings: r.timings, timeScale: r.timeScale,
    beatAct: r.act.beat, downAct: r.act.down, fps: r.act.fps,
  };
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'analyse') {
      const s = {
        logmel: await session('logmel'),
        beat: await session(msg.opts.beatModel || 'small0'),
        crema: await session('crema'),
      };
      const r = await analyse(ort, s, { audio22: msg.audio22, audio44: msg.audio44 }, msg.opts,
        (stage, p) => post('progress', { stage, p, msg: { tuning: 'Accordage', beats: 'Pulsation', chords: 'Accords' }[stage] }));
      state = { act: r.act, frames: r.frames, timeScale: r.timeScale, opts: msg.opts, key: r.key };
      post('result', {
        result: slimResult(r),
        env: { ortVersion: ort.env.versions?.web || '1.31.1', backend: 'wasm', threads: ort.env.wasm.numThreads, simd: true, crossOriginIsolated: self.crossOriginIsolated },
        models: Object.values(modelInfo),
      });
    } else if (msg.type === 'repost') {
      // New post-processing options on the cached network output.
      const opts = { ...state.opts, ...msg.opts };
      const t0 = performance.now();
      const g = gridFromActivations(state.act, opts);
      const chart = chartFromGrid(state.frames, state.timeScale, g.grid, opts);
      state.key = chart.key; state.opts = opts;
      post('chart', { grid: g.grid, meterScores: g.meterScores, tempo: tempoCurve(g.grid.beats), key: chart.key, segments: chart.segments, ms: performance.now() - t0 });
    } else if (msg.type === 'regrid') {
      // Hand-corrected grid: re-decode the chords on it (key kept unless asked).
      const t0 = performance.now();
      const chart = chartFromGrid(state.frames, state.timeScale, msg.grid, state.opts, msg.keepKey ? state.key : null);
      state.key = chart.key;
      post('chart', { grid: msg.grid, tempo: tempoCurve(msg.grid.beats), key: chart.key, segments: chart.segments, ms: performance.now() - t0 });
    }
  } catch (e) {
    post('error', { message: String(e && e.message ? e.message : e), stack: e && e.stack ? String(e.stack).slice(0, 800) : '' });
  }
};
