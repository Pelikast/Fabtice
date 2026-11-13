// UI of the separation spike: file choice, model tier, progress, player, benchmark and
// the plain-text diagnostic the owner pastes back.

import { MODELS, TIER_ORDER, STEM_LABELS } from './models.js';
import {
  ENGINES, loadOrt, fetchModel, createSession, separate, benchmarkChunks, rtfFromChunkTime, clearModelCache,
} from './separator.js';
import { decodeFile, encodeWav, RATE } from './audio.js';

const BUILD = '2026-11-13';
const ORT_VERSION = '1.31.1';
const LS_BENCH = 'fabtice.separation.bench.v1';
const LS_INFLIGHT = 'fabtice.separation.inflight.v1';
const LIMIT_KEYS = [
  'maxBufferSize', 'maxStorageBufferBindingSize', 'maxStorageBuffersPerShaderStage',
  'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupsPerDimension',
];
const STEM_ORDER = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];

const $ = (id) => document.getElementById(id);
const state = { env: null, audio: null, runs: [], bench: [], errors: [], busy: false, previousCrash: null };

// ---------------------------------------------------------------- small helpers

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '?';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const mb = (b) => (b == null ? '?' : `${Math.round(b / 1e6)} Mo`);
const sec = (s) => (s == null ? '?' : `${s.toFixed(s < 10 ? 2 : 1)} s`);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const errMsg = (e) => String((e && e.message) || e);
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } };
const pickLimits = (lim) => Object.fromEntries(LIMIT_KEYS.filter((k) => lim && lim[k] != null).map((k) => [k, Number(lim[k])]));

function logError(where, e) {
  state.errors.push({
    t: new Date().toISOString().slice(11, 19), where, message: errMsg(e),
    stack: ((e && e.stack) || '').split('\n').slice(0, 3).join(' | '),
  });
  renderDiag();
}
window.addEventListener('error', (e) => logError('page', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => logError('promesse', e.reason));

function setStatus(text, progress) {
  $('status').textContent = text;
  const p = $('progress');
  if (progress == null) p.hidden = true;
  else { p.hidden = false; p.value = progress; }
}

// ---------------------------------------------------------------- environment

async function probeEnv() {
  const env = {
    ua: navigator.userAgent, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    coi: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined', touch: navigator.maxTouchPoints,
  };
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      env.uach = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'model', 'fullVersionList']);
    }
  } catch (_) { /* not available */ }
  env.mobile = /iPhone|iPad|iPod|Android|Mobile/i.test(env.ua) || (/Macintosh/.test(env.ua) && navigator.maxTouchPoints > 1);
  env.gpu = null;
  if (navigator.gpu) {
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (a) {
        const info = a.info || {};
        env.gpu = {
          vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description,
          fallback: !!(info.isFallbackAdapter || a.isFallbackAdapter),
          features: [...a.features].sort(), limits: pickLimits(a.limits),
        };
      } else env.gpuError = 'aucun adaptateur';
    } catch (e) { env.gpuError = errMsg(e); }
  } else env.gpuError = 'navigator.gpu absent';
  try {
    const est = await navigator.storage.estimate();
    env.storage = { usage: est.usage, quota: est.quota };
    env.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : undefined;
  } catch (_) { /* no storage API */ }
  return env;
}

const deviceKey = (env) => [env.ua, env.gpu && env.gpu.architecture, env.gpu && env.gpu.description].join('|');

function heuristicTier(env) {
  if (env.mobile) return { tier: 'leger', why: 'appareil mobile' };
  if (!env.gpu || env.gpu.fallback) return { tier: 'standard', why: 'pas de carte graphique utilisable (WebGPU)' };
  if (env.gpu.vendor === 'apple') return { tier: 'maximal', why: 'puce graphique Apple' };
  return { tier: 'standard', why: 'carte graphique de puissance inconnue : lancez le banc d’essai' };
}

// Best-quality tier whose measured time stays under the song's duration.
function benchRecommendation(results) {
  const best = {};
  for (const r of results) {
    if (r.rtf == null) continue;
    if (!best[r.tier] || r.rtf < best[r.tier].rtf) best[r.tier] = r;
  }
  for (const t of [...TIER_ORDER].reverse()) {
    if (best[t] && best[t].rtf <= 1) return { tier: t, backend: best[t].backend, rtf: best[t].rtf, why: 'banc d’essai' };
  }
  const any = Object.values(best).sort((a, b) => a.rtf - b.rtf)[0];
  return any ? { tier: any.tier, backend: any.backend, rtf: any.rtf, why: 'banc d’essai (aucun niveau en temps réel)' } : null;
}

function autoChoice() {
  const saved = lsGet(LS_BENCH);
  if (saved && saved.key === deviceKey(state.env)) {
    const rec = benchRecommendation(saved.results);
    if (rec) return rec;
  }
  return heuristicTier(state.env);
}

// ---------------------------------------------------------------- tier choice

function renderTiers() {
  const auto = autoChoice();
  const box = $('tiers');
  const opts = [{ id: 'auto', label: 'Automatique', text: `choisit « ${MODELS[auto.tier].label} » pour cet appareil (${auto.why})` }]
    .concat(TIER_ORDER.map((t) => ({ id: t, label: MODELS[t].label, text: `${MODELS[t].summary} — ${MODELS[t].name} ; ${MODELS[t].licence}` })));
  const current = (box.querySelector('input:checked') || {}).value || 'auto';
  box.innerHTML = '';
  for (const o of opts) {
    const l = document.createElement('label');
    l.className = 'tier';
    l.innerHTML = `<input type="radio" name="tier" value="${o.id}"><strong></strong><span class="muted"></span>`;
    l.querySelector('strong').textContent = o.label;
    l.querySelector('.muted').textContent = o.text;
    l.querySelector('input').checked = o.id === current;
    box.appendChild(l);
  }
}

function selectedTier() {
  const v = (document.querySelector('input[name=tier]:checked') || {}).value || 'auto';
  return v === 'auto' ? autoChoice().tier : v;
}

function renderBenchOptions() {
  const box = $('benchopts');
  box.innerHTML = '';
  for (const t of TIER_ORDER) {
    const l = document.createElement('label');
    l.style.display = 'inline-block';
    l.style.marginRight = '14px';
    const on = !(state.env.mobile && t === 'maximal');
    l.innerHTML = `<input type="checkbox" name="benchtier" value="${t}" ${on ? 'checked' : ''}> ${MODELS[t].label}`;
    box.appendChild(l);
  }
  const w = document.createElement('label');
  w.style.display = 'block';
  w.innerHTML = `<input type="checkbox" id="benchwasm" ${state.env.mobile ? '' : 'checked'}> mesurer aussi sur le processeur (WebAssembly)`;
  box.appendChild(w);
}

// ---------------------------------------------------------------- file

$('file').addEventListener('change', async () => {
  const f = $('file').files[0];
  if (!f) return;
  state.audio = null;
  $('run').disabled = true;
  $('fileinfo').textContent = 'Lecture du fichier…';
  try {
    const t0 = performance.now();
    const a = await decodeFile(f);
    a.name = f.name;
    a.size = f.size;
    a.decodeSeconds = (performance.now() - t0) / 1000;
    state.audio = a;
    $('fileinfo').textContent = `${f.name} — ${fmtTime(a.duration)} (${a.info.channels === 1 ? 'mono' : 'stéréo'}, ${a.info.origRate} Hz)`;
    $('run').disabled = state.busy;
  } catch (e) {
    $('fileinfo').textContent = 'Ce fichier n’a pas pu être lu : ' + errMsg(e);
    logError('lecture du fichier', e);
  }
  renderDiag();
});

// ---------------------------------------------------------------- separation

function options() {
  return {
    backend: $('backend').value,
    engine: $('engine').value,
    threads: Math.max(1, Math.min(16, parseInt($('threads').value, 10) || 1)),
    verbose: $('verbose').checked,
    limit: Math.max(0, parseFloat($('limit').value) || 0),
  };
}

function watchDevice(ort, run) {
  try {
    const dev = ort.env.webgpu && ort.env.webgpu.device;
    if (dev && dev.limits) {
      run.deviceLimits = pickLimits(dev.limits);
      run.deviceFeatures = dev.features ? [...dev.features].sort() : undefined;
      if (dev.lost && !dev.__fabticeWatched) {
        dev.__fabticeWatched = true;
        // 'destroyed' is ONNX Runtime releasing its device with the session, not a failure.
        dev.lost.then((info) => { if (info.reason !== 'destroyed') logError('WebGPU', new Error(`périphérique perdu (${info.reason}) : ${info.message}`)); });
      }
    }
  } catch (_) { /* engine without device access */ }
}

async function loadModelSession(model, opt, run, label) {
  setStatus(`${label} : chargement du moteur de calcul…`, 0);
  const ort = await loadOrt(opt.engine, opt.threads);
  const f = await fetchModel(model, (p) => setStatus(
    `${label} : téléchargement du modèle ${Math.round((p * model.bytes) / 1e6)} / ${Math.round(model.bytes / 1e6)} Mo`, p));
  run.download = { fromCache: f.fromCache, seconds: f.seconds, bytes: model.bytes, cacheError: f.cacheError };
  setStatus(`${label} : préparation du modèle (peut prendre une minute)…`, null);
  const s = await createSession(ort, f.bytes, run.backendAsked, opt.verbose);
  run.backend = s.backend;
  run.sessionSeconds = s.seconds;
  run.attempts = s.attempts;
  run.ortLogs = s.logs;
  if (s.backend === 'webgpu') watchDevice(ort, run);
  return { ort, session: s.session };
}

$('run').addEventListener('click', async () => {
  if (!state.audio || state.busy) return;
  state.busy = true;
  $('run').disabled = true;
  $('bench').disabled = true;
  const opt = options();
  const tier = selectedTier();
  const model = MODELS[tier];
  const a = state.audio;
  let left = a.left, right = a.right;
  if (opt.limit > 0 && opt.limit * RATE < left.length) {
    left = left.subarray(0, Math.round(opt.limit * RATE));
    right = right.subarray(0, Math.round(opt.limit * RATE));
  }
  const duration = left.length / RATE;
  const run = {
    n: state.runs.length + 1, file: a.name, duration, tier, model: model.name, backendAsked: opt.backend,
    engine: opt.engine, threads: opt.threads, choice: (document.querySelector('input[name=tier]:checked') || {}).value,
  };
  state.runs.push(run);
  lsSet(LS_INFLIGHT, { what: `séparation ${model.label} (${opt.backend})`, t: new Date().toISOString() });
  let session = null;
  try {
    let loaded = await loadModelSession(model, opt, run, model.label);
    session = loaded.session;
    renderDiag();
    let t0 = performance.now();
    const onProgress = (p, j, n) => {
      const el = (performance.now() - t0) / 1000;
      const eta = (el / p) * (1 - p);
      setStatus(`Séparation (${run.backend === 'webgpu' ? 'carte graphique' : 'processeur'}) : morceau ${j} / ${n} · ${fmtTime(el)} écoulées · reste environ ${fmtTime(eta)}`, p);
    };
    let res;
    try {
      res = await separate(model, loaded.ort, session, left, right, { onProgress });
    } catch (e) {
      // In automatic mode, a WebGPU result that fails the sanity check is retried on the processor.
      if (e.code !== 'BAD_OUTPUT' || opt.backend !== 'auto' || run.backend !== 'webgpu') throw e;
      run.gpuBadOutput = errMsg(e);
      logError('séparation WebGPU', e);
      await session.release();
      session = null;
      loaded = await loadModelSession(model, { ...opt }, Object.assign(run, { backendAsked: 'wasm' }), model.label);
      session = loaded.session;
      t0 = performance.now();
      res = await separate(model, loaded.ort, session, left, right, { onProgress });
    }
    run.seconds = res.seconds;
    run.rtf = res.seconds / duration;
    run.chunks = res.chunks;
    const walls = res.chunkTimes.map((c) => c.wall);
    run.firstChunk = walls[0];
    run.medianChunk = median(walls.slice(1).length ? walls.slice(1) : walls);
    run.medianPost = median(res.chunkTimes.map((c) => c.post));
    if (performance.memory) run.heap = performance.memory.usedJSHeapSize;
    await session.release();
    session = null;
    buildPlayer(res.stems, left, right, a.name, model);
    setStatus(`Terminé : ${fmtTime(duration)} de musique séparés en ${fmtTime(res.seconds)} (${run.rtf.toFixed(2)} × la durée du morceau).`);
  } catch (e) {
    run.error = errMsg(e);
    logError('séparation', e);
    setStatus('Erreur : ' + errMsg(e));
    if (session) { try { await session.release(); } catch (_) { /* ignore */ } }
  } finally {
    lsSet(LS_INFLIGHT, null);
    state.busy = false;
    $('run').disabled = !state.audio;
    $('bench').disabled = false;
    renderDiag();
  }
});

// ---------------------------------------------------------------- player

const player = { ctx: null, tracks: [], sources: [], playing: false, offset: 0, startedAt: 0, duration: 0, raf: 0 };

function updateGains() {
  const anySolo = player.tracks.some((t) => t.solo);
  for (const t of player.tracks) {
    const audible = !t.mute && (!anySolo || t.solo);
    t.gain.gain.value = audible ? t.volume : 0;
  }
}

function stopSources() {
  for (const s of player.sources) { try { s.stop(); } catch (_) { /* already stopped */ } }
  player.sources = [];
}

function position() {
  return player.playing ? Math.min(player.duration, player.ctx.currentTime - player.startedAt) : player.offset;
}

function play() {
  const ctx = player.ctx;
  ctx.resume();
  stopSources();
  if (player.offset >= player.duration) player.offset = 0;
  const when = ctx.currentTime + 0.05;
  player.sources = player.tracks.map((t) => {
    const s = ctx.createBufferSource();
    s.buffer = t.buffer;
    s.connect(t.gain);
    s.start(when, player.offset);
    return s;
  });
  player.startedAt = when - player.offset;
  player.playing = true;
  $('play').textContent = '❚❚ Pause';
  const tick = () => {
    const p = position();
    $('seek').value = p / player.duration;
    $('time').textContent = `${fmtTime(p)} / ${fmtTime(player.duration)}`;
    if (p >= player.duration) { pause(); player.offset = 0; return; }
    if (player.playing) player.raf = requestAnimationFrame(tick);
  };
  player.raf = requestAnimationFrame(tick);
}

function pause() {
  if (!player.playing) return;
  player.offset = position();
  player.playing = false;
  stopSources();
  cancelAnimationFrame(player.raf);
  $('play').textContent = '▶ Lecture';
}

$('play').addEventListener('click', () => (player.playing ? pause() : play()));
$('stop').addEventListener('click', () => {
  const was = player.playing;
  pause();
  player.offset = 0;
  $('seek').value = 0;
  $('time').textContent = `0:00 / ${fmtTime(player.duration)}`;
  if (was) play();
});
$('seek').addEventListener('input', () => {
  const was = player.playing;
  pause();
  player.offset = parseFloat($('seek').value) * player.duration;
  $('time').textContent = `${fmtTime(player.offset)} / ${fmtTime(player.duration)}`;
  if (was) play();
});

function buildPlayer(stems, mixL, mixR, fileName, model) {
  pause();
  if (!player.ctx) player.ctx = new AudioContext();
  const ctx = player.ctx;
  for (const t of player.tracks) t.gain.disconnect();
  player.tracks = [];
  player.offset = 0;
  player.duration = mixL.length / RATE;
  const mk = (id, label, l, r, mute) => {
    const buffer = ctx.createBuffer(2, l.length, RATE);
    buffer.copyToChannel(l, 0);
    buffer.copyToChannel(r, 1);
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    player.tracks.push({ id, label, buffer, gain, volume: 1, mute, solo: false });
  };
  mk('mix', 'Morceau d’origine', mixL, mixR, true);
  for (const s of STEM_ORDER) if (stems[s]) mk(s, STEM_LABELS[s] || s, stems[s][0], stems[s][1], false);
  const base = fileName.replace(/\.[^.]+$/, '');
  const box = $('tracks');
  box.innerHTML = '';
  for (const t of player.tracks) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="name"></span><button data-k="solo">Solo</button><button data-k="mute">Muet</button>
      <input type="range" min="0" max="1.5" step="0.01" value="1" aria-label="volume"><button data-k="dl">Télécharger</button>`;
    row.querySelector('.name').textContent = t.label;
    const solo = row.querySelector('[data-k=solo]'), mute = row.querySelector('[data-k=mute]');
    const refresh = () => { solo.classList.toggle('on', t.solo); mute.classList.toggle('on', t.mute); updateGains(); };
    solo.onclick = () => { t.solo = !t.solo; refresh(); };
    mute.onclick = () => { t.mute = !t.mute; refresh(); };
    row.querySelector('input').oninput = (e) => { t.volume = parseFloat(e.target.value); updateGains(); };
    row.querySelector('[data-k=dl]').onclick = () => {
      const blob = encodeWav(t.buffer.getChannelData(0), t.buffer.getChannelData(1));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${base} - ${t.id === 'mix' ? 'original' : t.label.toLowerCase()} (${model.label.toLowerCase()}).wav`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    refresh();
    box.appendChild(row);
  }
  $('time').textContent = `0:00 / ${fmtTime(player.duration)}`;
  $('seek').value = 0;
  $('player').hidden = false;
}

// ---------------------------------------------------------------- benchmark

$('bench').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  $('bench').disabled = true;
  $('run').disabled = true;
  const opt = options();
  const tiers = [...document.querySelectorAll('input[name=benchtier]:checked')].map((i) => i.value);
  const backends = [];
  if (state.env.gpu) backends.push('webgpu');
  if ($('benchwasm').checked || !state.env.gpu) backends.push('wasm');
  const results = [];
  state.bench = results;
  try {
    for (const tier of tiers) {
      const model = MODELS[tier];
      for (const backend of backends) {
        const r = { tier, backend, model: model.name, engine: opt.engine, backendAsked: backend };
        results.push(r);
        renderDiag();
        lsSet(LS_INFLIGHT, { what: `banc d’essai ${model.label} (${backend})`, t: new Date().toISOString() });
        let session = null;
        try {
          const loaded = await loadModelSession(model, opt, r, `Banc d’essai ${model.label} (${backend})`);
          session = loaded.session;
          const n = backend === 'wasm' && tier === 'maximal' ? 2 : 3;
          setStatus(`Banc d’essai ${model.label} (${r.backend}) : ${n} morceaux de ${(model.segment / RATE).toFixed(1)} s…`, null);
          r.times = await benchmarkChunks(model, loaded.ort, session, n);
          r.rtf = rtfFromChunkTime(model, Math.min(...r.times.slice(1)));
          if (performance.memory) r.heap = performance.memory.usedJSHeapSize;
        } catch (e) {
          r.error = errMsg(e);
          logError(`banc d’essai ${tier}/${backend}`, e);
        } finally {
          if (session) { try { await session.release(); } catch (_) { /* ignore */ } }
          lsSet(LS_INFLIGHT, null);
          renderDiag();
        }
      }
    }
    // Keep earlier measurements of the tiers and backends not run this time.
    const prev = lsGet(LS_BENCH);
    const kept = prev && prev.key === deviceKey(state.env)
      ? prev.results.filter((p) => !results.some((r) => r.tier === p.tier && r.backend === p.backend)) : [];
    lsSet(LS_BENCH, { key: deviceKey(state.env), date: new Date().toISOString(), results: kept.concat(results.map(({ tier, backend, rtf }) => ({ tier, backend, rtf }))) });
    const rec = benchRecommendation(results);
    setStatus(rec ? `Banc d’essai terminé. Recommandé ici : ${MODELS[rec.tier].label} (${rec.backend === 'webgpu' ? 'carte graphique' : 'processeur'}).` : 'Banc d’essai terminé, sans résultat utilisable.');
    renderTiers();
  } finally {
    state.busy = false;
    $('bench').disabled = false;
    $('run').disabled = !state.audio;
    renderDiag();
  }
});

$('clearcache').addEventListener('click', async () => {
  await clearModelCache();
  try { state.env.storage = await navigator.storage.estimate(); } catch (_) { /* ignore */ }
  setStatus('Modèles effacés du navigateur.');
  renderDiag();
});

// ---------------------------------------------------------------- diagnostic

function diagText() {
  const e = state.env;
  const L = [];
  L.push(`Fabtice — diagnostic séparation (prototype ${BUILD}) — ${new Date().toISOString()}`);
  L.push(`Page : ${location.href}`);
  L.push(`Navigateur : ${e.ua}`);
  if (e.uach) {
    const brands = (e.uach.fullVersionList || []).map((b) => `${b.brand} ${b.version}`).join(', ');
    L.push(`Système (UA-CH) : ${e.uach.platform} ${e.uach.platformVersion} · ${e.uach.architecture || '?'} · modèle « ${e.uach.model || ''} » · ${brands}`);
  }
  L.push(`Cœurs logiques : ${e.cores} · mémoire annoncée : ${e.memory != null ? e.memory + ' Go' : 'non communiquée'} · mobile : ${e.mobile ? 'oui' : 'non'} · isolation cross-origin : ${e.coi ? 'oui' : 'NON'} · SharedArrayBuffer : ${e.sab ? 'oui' : 'NON'}`);
  if (e.gpu) {
    const g = e.gpu;
    L.push(`WebGPU : oui · ${g.vendor || '?'} / ${g.architecture || '?'} / ${g.device || '-'} / ${g.description || '-'} · adaptateur de secours : ${g.fallback ? 'OUI (logiciel)' : 'non'}`);
    L.push(`  limites adaptateur : ${Object.entries(g.limits).map(([k, v]) => `${k} ${v >= 1048576 ? Math.round(v / 1048576) + ' Mio' : v}`).join(' · ')}`);
    L.push(`  fonctions : ${g.features.join(', ')}`);
  } else {
    L.push(`WebGPU : non (${e.gpuError})`);
  }
  if (e.storage) L.push(`Stockage : ${mb(e.storage.usage)} utilisés / quota ${mb(e.storage.quota)} · persistant : ${e.persisted === undefined ? '?' : e.persisted ? 'oui' : 'non'}`);
  const opt = options();
  L.push(`ONNX Runtime Web ${ORT_VERSION} · moteur : ${ENGINES[opt.engine].label} · fils processeur : ${opt.threads}`);
  const auto = autoChoice();
  L.push(`Choix automatique : ${MODELS[auto.tier].label} (${auto.why}${auto.rtf != null ? `, ${auto.rtf.toFixed(2)} × la durée` : ''})`);
  if (state.previousCrash) L.push(`ATTENTION : la page s’est arrêtée pendant « ${state.previousCrash.what} » (${state.previousCrash.t}) — probablement manque de mémoire.`);

  if (state.bench.length) {
    L.push('');
    L.push('Banc d’essai (son synthétique, temps par morceau, le premier inclut la compilation) :');
    for (const r of state.bench) {
      const m = MODELS[r.tier];
      let s = `  ${m.label.padEnd(8)} ${String(r.backend || r.backendAsked).padEnd(6)} `;
      if (r.error) s += `ÉCHEC : ${r.error}`;
      else if (!r.times) s += 'en cours…';
      else {
        s += `télécharg. ${r.download.fromCache ? 'cache' : sec(r.download.seconds)} · session ${sec(r.sessionSeconds)} · morceaux ${r.times.map((t) => t.toFixed(2)).join(' / ')} s`;
        s += ` (morceau ${(m.segment / RATE).toFixed(1)} s) → ${r.rtf.toFixed(2)} × la durée du morceau`;
        if (r.heap) s += ` · tas JS ${mb(r.heap)}`;
      }
      L.push(s);
      if (r.attempts && r.attempts.length) L.push(`      essais refusés : ${r.attempts.map((a) => `${a.backend}: ${a.error}`).join(' | ')}`);
    }
    const rec = benchRecommendation(state.bench);
    if (rec) L.push(`Recommandation pour cet appareil : ${MODELS[rec.tier].label} sur ${rec.backend === 'webgpu' ? 'carte graphique' : 'processeur'} (${rec.rtf.toFixed(2)} × la durée)`);
  }

  const saved = lsGet(LS_BENCH);
  if (!state.bench.length && saved && saved.key === deviceKey(e) && saved.results.length) {
    L.push('');
    L.push(`Banc d’essai précédent (${saved.date}) : ` + saved.results.map((r) => `${MODELS[r.tier].label}/${r.backend} ${r.rtf != null ? r.rtf.toFixed(2) + ' ×' : 'échec'}`).join(' · '));
  }

  if (state.runs.length) {
    L.push('');
    L.push('Séparations :');
    for (const r of state.runs) {
      L.push(`  #${r.n} « ${r.file} » ${fmtTime(r.duration)} (${r.duration.toFixed(1)} s) · ${MODELS[r.tier].label} = ${r.model} · choix ${r.choice} · calcul demandé ${r.backendAsked} → utilisé ${r.backend || '?'}`);
      if (r.download) L.push(`     modèle ${mb(r.download.bytes)} ${r.download.fromCache ? 'depuis le cache' : `téléchargé en ${sec(r.download.seconds)}`}${r.download.cacheError ? ` (cache : ${r.download.cacheError})` : ''} · session créée en ${sec(r.sessionSeconds)}`);
      if (r.seconds != null) L.push(`     traitement ${sec(r.seconds)} = ${r.rtf.toFixed(2)} × la durée · ${r.chunks} morceaux · premier ${sec(r.firstChunk)} · médiane ${sec(r.medianChunk)} (dont iSTFT ${sec(r.medianPost)})${r.heap ? ` · tas JS ${mb(r.heap)}` : ''}`);
      if (r.deviceLimits) L.push(`     périphérique ORT : ${Object.entries(r.deviceLimits).map(([k, v]) => `${k} ${v >= 1048576 ? Math.round(v / 1048576) + ' Mio' : v}`).join(' · ')}`);
      if (r.attempts && r.attempts.length) L.push(`     essais refusés : ${r.attempts.map((a) => `${a.backend}: ${a.error}`).join(' | ')}`);
      if (r.gpuBadOutput) L.push(`     WebGPU a rendu un résultat faux (${r.gpuBadOutput}) : refait sur le processeur`);
      if (r.error) L.push(`     ERREUR : ${r.error}`);
    }
  }
  const logs = [...state.runs, ...state.bench].flatMap((r) => (r.ortLogs || []).map((l) => `[${MODELS[r.tier].label}/${r.backend}] ${l}`));
  if (logs.length) {
    L.push('');
    L.push(`Messages d’ONNX Runtime (${logs.length}) :`);
    for (const l of logs.slice(0, 40)) L.push('  ' + l);
  }
  L.push('');
  if (state.errors.length) {
    L.push('Erreurs :');
    for (const x of state.errors) L.push(`  ${x.t} [${x.where}] ${x.message}${x.stack ? ` — ${x.stack}` : ''}`);
  } else L.push('Erreurs : aucune');
  return L.join('\n');
}

function renderDiag() {
  if (state.env) $('diag').textContent = diagText();
}

$('copy').addEventListener('click', async () => {
  const text = diagText();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { /* fallback below */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
  }
  $('copied').textContent = ok ? 'copié — collez-le dans votre message' : 'copie impossible : sélectionnez le texte ci-dessous';
});

// ---------------------------------------------------------------- start

(async () => {
  state.previousCrash = lsGet(LS_INFLIGHT);
  lsSet(LS_INFLIGHT, null);
  const hc = navigator.hardwareConcurrency || 4;
  $('threads').value = Math.max(1, Math.min(8, hc - 1));
  state.env = await probeEnv();
  renderTiers();
  renderBenchOptions();
  renderDiag();
  // Expose a small hook for automated tests.
  window.fabticeSeparation = { state, MODELS, diagText, player };
})();
