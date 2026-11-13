// Test page: decode, analyse in a worker, draw the grid, play with a click, correct.
import { shiftDownbeat, setMeter, doubleTempo, halveTempo, bars } from './lib/grid.js';
import { chordName, keyName, keyShort, pcName } from './lib/labels.js';
import { NO_CHORD } from './lib/chords.js';

const $ = (id) => document.getElementById(id);
const C = { bg: '#fbf6ee', ink: '#3a2a1e', soft: '#7a6250', line: '#d9c9b2', wave: '#b89f82', accent: '#9a3b1f', doubt: '#b7a38e' };

const st = {
  file: null, buffer: null, a22: null, a44: null, env: null, result: null, grid: null, segments: [], key: null,
  tempo: null, meterScores: [], workerEnv: null, models: [], errors: [], corrections: [], history: [],
  decodeMs: 0, analyseMs: 0, chartMs: 0, opts: null,
};

window.addEventListener('error', (e) => st.errors.push(`${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => st.errors.push(String(e.reason && e.reason.message || e.reason)));

function status(msg, err = false) {
  $('status').textContent = msg;
  $('status').className = err ? 'err' : '';
  if (err) st.errors.push(msg);
}

// ---------- worker ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onerror = (e) => status(`Erreur du module d'analyse : ${e.message || 'chargement impossible'}`, true);
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') {
    const pct = m.p != null ? ` ${Math.round(m.p * 100)} %` : '';
    status(`${m.msg || m.stage}…${pct}`);
  } else if (m.type === 'result') {
    st.analyseMs = performance.now() - st.t0;
    st.result = m.result; st.workerEnv = m.env; st.models = m.models;
    st.history = []; st.corrections = [];
    $('results').hidden = false;
    applyChart({ grid: m.result.grid, tempo: m.result.tempo, key: m.result.key, segments: m.result.segments, meterScores: m.result.meterScores });
    status(`Analyse terminée en ${(st.analyseMs / 1000).toFixed(1)} s.`);
    $('analyse').disabled = false;
  } else if (m.type === 'chart') {
    st.chartMs = m.ms;
    applyChart(m);
    status(`Grille recalculée (${Math.round(m.ms)} ms).`);
  } else if (m.type === 'error') {
    status(`Erreur : ${m.message}`, true);
    if (m.stack) st.errors.push(m.stack);
    $('analyse').disabled = false;
  }
};

function options() {
  return {
    beatModel: $('beatModel').value, post: $('post').value,
    minBpm: Number($('minBpm').value) || 40, maxBpm: Number($('maxBpm').value) || 300,
    tuningCorrection: $('tuningCorrection').checked, harmonyPrior: $('harmonyPrior').checked,
  };
}

// ---------- decoding ----------
function mono(buf) {
  const n = buf.length, ch = buf.numberOfChannels;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch; }
  return out;
}

async function loadAudio(arrayBuffer, name, size) {
  stop();
  status('Décodage du fichier…');
  const t0 = performance.now();
  try {
    const b44 = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(arrayBuffer.slice(0));
    const b22 = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(arrayBuffer.slice(0));
    st.buffer = b44; st.a44 = mono(b44); st.a22 = mono(b22);
  } catch (e) {
    status(`Impossible de décoder ce fichier (${e.message || e}).`, true);
    return;
  }
  st.decodeMs = performance.now() - t0;
  st.file = { name, size, duration: st.buffer.duration, channels: st.buffer.numberOfChannels };
  buildEnvelope();
  $('analyse').disabled = false;
  status(`${name} : ${fmtTime(st.buffer.duration)}, ${st.buffer.numberOfChannels} canal(aux). Lancement de l'analyse…`);
  runAnalysis();
}

function runAnalysis() {
  if (!st.a22) return;
  $('analyse').disabled = true;
  st.t0 = performance.now();
  st.opts = options();
  st.errors = st.errors.filter((e) => !e.startsWith('Erreur'));
  const a22 = st.a22.slice(), a44 = st.a44.slice();
  worker.postMessage({ type: 'analyse', audio22: a22, audio44: a44, opts: st.opts }, [a22.buffer, a44.buffer]);
}

$('file').addEventListener('change', async () => {
  const f = $('file').files[0];
  if (f) loadAudio(await f.arrayBuffer(), f.name, f.size);
});
$('demo').addEventListener('click', async () => {
  status('Chargement de l\'extrait…');
  const r = await fetch('./demo/demo-swing.mp3');
  if (!r.ok) return status('Extrait introuvable.', true);
  const b = await r.arrayBuffer();
  loadAudio(b, 'demo-swing.mp3 (synthétique)', b.byteLength);
});
$('analyse').addEventListener('click', runAnalysis);
for (const id of ['post', 'harmonyPrior', 'minBpm', 'maxBpm']) {
  $(id).addEventListener('change', () => {
    if (!st.result) return;
    st.opts = { ...st.opts, ...options() };
    st.corrections.push(`réglage ${id} = ${$(id).type === 'checkbox' ? $(id).checked : $(id).value}`);
    worker.postMessage({ type: 'repost', opts: st.opts });
  });
}

// ---------- results ----------
function applyChart(m) {
  st.grid = m.grid; st.tempo = m.tempo; st.key = m.key; st.segments = m.segments;
  if (m.meterScores) st.meterScores = m.meterScores;
  const k = st.key.best;
  $('key').textContent = `${keyName(k)} (${keyShort(k)})`;
  $('keyAlt').textContent = 'ensuite : ' + st.key.ranked.slice(1, 3).map((x) => `${keyName(x)} ${Math.round(x.p * 100)} %`).join(', ') + ` ; sûreté ${Math.round(k.p * 100)} %`;
  const tu = st.result.tuning;
  $('tuning').textContent = `La = ${tu.refHz.toFixed(1)} Hz`;
  $('tuningDetail').textContent = `${tu.cents >= 0 ? '+' : ''}${tu.cents.toFixed(1)} cents par rapport à 440 ; cohérence ${Math.round(tu.confidence * 100)} %`;
  $('tempo').textContent = `${Math.round(st.tempo.median)} BPM`;
  $('tempoRange').textContent = `de ${Math.round(st.tempo.p05)} à ${Math.round(st.tempo.p95)} (5–95 %), ${st.grid.beats.length} temps`;
  $('meter').textContent = meterLabel(st.grid.beatsPerBar);
  $('meterAlt').textContent = st.meterScores.length && st.meterScores[0].prob != null
    ? st.meterScores.slice(0, 3).map((s) => `${meterLabel(s.meter)} ${Math.round(s.prob * 100)} %`).join(', ')
    : st.corrections.length ? 'corrigée à la main' : '';
  $('meterSel').value = String(st.grid.beatsPerBar);
  layout();
  drawChart();
  draw();
  if (playing) nextBeat = st.grid.beats.findIndex((t) => t >= position());
}

const meterLabel = (m) => (m === 6 ? '6/8' : m === 7 ? '7/8' : `${m}/4`);

// ---------- corrections ----------
function correct(label, fn) {
  if (!st.grid) return;
  st.history.push(st.grid);
  st.corrections.push(label);
  st.meterScores = []; // the meter is now the user's choice
  const g = fn(st.grid);
  worker.postMessage({ type: 'regrid', grid: g });
}
$('downPrev').onclick = () => correct('premier temps -1', (g) => shiftDownbeat(g, -1));
$('downNext').onclick = () => correct('premier temps +1', (g) => shiftDownbeat(g, 1));
$('dbl').onclick = () => correct('tempo x2', doubleTempo);
$('half').onclick = () => correct('tempo /2', halveTempo);
$('meterSel').onchange = () => correct(`métrique ${$('meterSel').value}`, (g) => setMeter(g, Number($('meterSel').value)));
$('undo').onclick = () => {
  if (!st.history.length) return;
  st.corrections.push('annuler');
  worker.postMessage({ type: 'regrid', grid: st.history.pop() });
};

// ---------- drawing ----------
let pps = 80; // pixels per second
const dpr = () => window.devicePixelRatio || 1;

function buildEnvelope() {
  const bin = 110, a = st.a22, n = Math.ceil(a.length / bin);
  const mn = new Float32Array(n), mx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    for (let j = i * bin; j < Math.min(a.length, (i + 1) * bin); j++) { const v = a[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[i] = lo; mx[i] = hi;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, mx[i], -mn[i]);
  st.env = { mn, mx, rate: 22050 / bin, peak };
}

function layout() {
  if (!st.buffer) return;
  pps = Number($('zoom').value);
  $('spacer').style.width = `${Math.ceil(st.buffer.duration * pps) + $('timeline').clientWidth}px`;
  for (const id of ['timeline', 'tempoCanvas']) {
    const c = $(id);
    const h = id === 'timeline' ? 230 : 110;
    c.width = Math.round(c.clientWidth * dpr());
    c.height = Math.round(h * dpr());
    c.style.height = `${h}px`;
  }
}

function viewStart() { return $('scroller').scrollLeft / pps; }

function draw() {
  if (!st.buffer) return;
  const cv = $('timeline'), g = cv.getContext('2d');
  const r = dpr(), W = cv.width / r, H = cv.height / r;
  g.setTransform(r, 0, 0, r, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const t0 = viewStart(), t1 = t0 + W / pps;
  const X = (t) => (t - t0) * pps;
  const laneH = 34, top = laneH + 14, wh = H - top - 4, mid = top + wh / 2;
  // waveform
  const e = st.env;
  g.fillStyle = C.wave;
  for (let x = 0; x < W; x++) {
    const a = Math.floor((t0 + x / pps) * e.rate), b = Math.max(a + 1, Math.floor((t0 + (x + 1) / pps) * e.rate));
    if (a >= e.mn.length) break;
    let lo = 0, hi = 0;
    for (let i = Math.max(0, a); i < Math.min(e.mn.length, b); i++) { if (e.mn[i] < lo) lo = e.mn[i]; if (e.mx[i] > hi) hi = e.mx[i]; }
    const y0 = mid - (hi / e.peak) * wh / 2, y1 = mid - (lo / e.peak) * wh / 2;
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
  // grid
  if (st.grid) {
    const { beats, numbers } = st.grid;
    let bar = 0;
    g.font = '11px Georgia, serif';
    for (let i = 0; i < beats.length; i++) {
      if (numbers[i] === 1) bar++;
      const t = beats[i];
      if (t < t0 - 1 || t > t1 + 1) continue;
      const x = Math.round(X(t)) + 0.5;
      const down = numbers[i] === 1;
      g.strokeStyle = down ? C.ink : C.line;
      g.lineWidth = down ? 2 : 1;
      g.beginPath(); g.moveTo(x, down ? laneH + 2 : top); g.lineTo(x, H - 2); g.stroke();
      if (down) { g.fillStyle = C.ink; g.fillText(String(bar), x + 3, laneH + 12); }
    }
    // chords
    g.font = '15px Georgia, serif';
    let freeX = -Infinity;
    for (const s of st.segments) {
      if (s.t1 < t0 || s.t0 > t1) continue;
      const x = X(s.t0);
      const doubt = s.confidence < 0.5;
      g.fillStyle = doubt ? C.doubt : C.ink;
      g.fillRect(Math.round(x), 4, 1, laneH - 8);
      const label = chordName(s.chord, st.key.best) + (doubt ? ' ?' : '');
      const w = g.measureText(label).width;
      if (x + 4 < freeX) continue; // no room: keep the tick, skip the text
      g.fillText(label, x + 4, 20);
      freeX = x + 10 + w;
      if (s.extensions.length) {
        g.font = '11px Georgia, serif'; g.fillStyle = C.soft;
        const ext = s.extensions.map((x2) => x2.name).join(' ');
        g.fillText(ext, x + 6 + w, 14);
        freeX += g.measureText(ext).width + 2;
        g.font = '15px Georgia, serif';
      }
    }
  }
  // playhead
  const p = position();
  g.fillStyle = C.accent;
  g.fillRect(Math.round(X(p)), 0, 2, H);
  drawTempo(t0, t1);
  $('pos').textContent = fmtTime(p, true);
}

function drawTempo(t0, t1) {
  const cv = $('tempoCanvas'), g = cv.getContext('2d');
  const r = dpr(), W = cv.width / r, H = cv.height / r;
  g.setTransform(r, 0, 0, r, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, 0.5); g.lineTo(W, 0.5); g.stroke();
  const tp = st.tempo;
  if (!tp || !tp.bpm.length) return;
  const lo = Math.floor((tp.p05 - 8) / 5) * 5, hi = Math.ceil((tp.p95 + 8) / 5) * 5;
  const Y = (b) => H - 14 - ((b - lo) / (hi - lo || 1)) * (H - 28);
  const X = (t) => (t - t0) * pps;
  g.font = '11px Georgia, serif';
  for (let b = lo; b <= hi; b += (hi - lo > 40 ? 20 : 5)) {
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, Math.round(Y(b)) + 0.5); g.lineTo(W, Math.round(Y(b)) + 0.5); g.stroke();
    g.fillStyle = C.soft; g.fillText(`${b}`, 4, Y(b) - 2);
  }
  g.fillStyle = C.wave;
  for (let i = 0; i < tp.bpm.length; i++) {
    const t = tp.times[i];
    if (t < t0 - 2 || t > t1 + 2) continue;
    g.fillRect(X(t) - 1, Math.max(0, Math.min(H - 3, Y(tp.bpm[i]) - 1)), 3, 3);
  }
  g.strokeStyle = C.ink; g.lineWidth = 1.5; g.beginPath();
  let started = false;
  for (let i = 0; i < tp.smooth.length; i++) {
    const t = tp.times[i];
    if (t < t0 - 2 || t > t1 + 2) continue;
    const y = Math.max(0, Math.min(H, Y(tp.smooth[i])));
    if (!started) { g.moveTo(X(t), y); started = true; } else g.lineTo(X(t), y);
  }
  g.stroke();
  g.fillStyle = C.soft; g.fillText('tempo (BPM), temps par temps', W - 170, 12);
}

function drawChart() {
  const el = $('chart');
  el.innerHTML = '';
  if (!st.grid) return;
  const key = st.key.best;
  const bs = bars(st.grid);
  // chord at each beat
  const atBeat = new Array(st.grid.beats.length);
  for (const s of st.segments) for (const i of s.beats) atBeat[i] = s;
  let prevSig = '';
  for (const b of bs) {
    const d = document.createElement('div');
    d.className = 'bar';
    d.dataset.t = b.t0;
    d.innerHTML = `<span class="n">${b.index}</span>`;
    const inBar = [];
    for (const i of b.beats) { const s = atBeat[i]; if (s && (!inBar.length || inBar[inBar.length - 1] !== s)) inBar.push(s); }
    const sig = inBar.map((s) => s.chord).join(',');
    if (inBar.length === 1 && sig === prevSig && inBar[0].beats[0] < b.beats[0]) {
      d.insertAdjacentHTML('beforeend', '<span class="c" title="même accord">%</span>');
    } else {
      for (const s of inBar) {
        const doubt = s.confidence < 0.5;
        const alt = s.alternatives.map((a) => `${chordName(a.chord, key)} ${Math.round(a.p * 100)} %`).join(', ');
        const name = chordName(s.chord, key) + (s.bass ? '/' + pcName(s.bass.pc, key) : '') + (doubt ? ' ?' : '');
        d.insertAdjacentHTML('beforeend', `<span class="c${doubt ? ' doubt' : ''}" title="sûreté ${Math.round(s.confidence * 100)} % ; autres : ${alt}">${name}</span>`);
      }
      const ext = inBar.filter((s) => s.extensions.length).map((s) => `${chordName(s.chord, key)} : ` + s.extensions.map((x) => `${x.name.replace('b', '♭').replace('#', '♯')} ${Math.round(x.p * 100)} %`).join(', '));
      if (ext.length) d.insertAdjacentHTML('beforeend', `<span class="x">${ext.join(' · ')}</span>`);
    }
    prevSig = sig;
    d.onclick = () => seek(Number(d.dataset.t));
    el.appendChild(d);
  }
}

$('zoom').addEventListener('input', () => { const t = viewStart(); layout(); $('scroller').scrollLeft = t * pps; draw(); });
$('scroller').addEventListener('scroll', () => { if (!playing) draw(); });
window.addEventListener('resize', () => { layout(); draw(); });
$('timeline').addEventListener('click', (e) => {
  const rect = $('timeline').getBoundingClientRect();
  seek(viewStart() + (e.clientX - rect.left) / pps);
});
$('timeline').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  $('scroller').scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

// ---------- playback with click ----------
let actx = null, musicGain, clickGain, src = null, playing = false, startCtx = 0, offset = 0, nextBeat = 0, timer = null;

function ensureCtx() {
  if (actx) return;
  actx = new AudioContext({ latencyHint: 'interactive' });
  musicGain = actx.createGain(); clickGain = actx.createGain();
  musicGain.connect(actx.destination); clickGain.connect(actx.destination);
  setVolumes();
}
function setVolumes() {
  if (!actx) return;
  musicGain.gain.value = Number($('musicVol').value) ** 2;
  clickGain.gain.value = Number($('clickVol').value) ** 2 * 1.5;
}
$('musicVol').oninput = setVolumes;
$('clickVol').oninput = setVolumes;

function position() { return playing ? offset + (actx.currentTime - startCtx) : offset; }

function clickAt(when, accent) {
  const o = actx.createOscillator(), e = actx.createGain();
  o.type = 'sine';
  o.frequency.value = accent ? 1760 : 1175;
  e.gain.setValueAtTime(0, when);
  e.gain.linearRampToValueAtTime(accent ? 1 : 0.5, when + 0.002);
  e.gain.exponentialRampToValueAtTime(0.001, when + (accent ? 0.08 : 0.05));
  o.connect(e).connect(clickGain);
  o.start(when); o.stop(when + 0.1);
}

function schedule() {
  if (!playing || !st.grid) return;
  const horizon = position() + 0.2;
  const { beats, numbers } = st.grid;
  while (nextBeat >= 0 && nextBeat < beats.length && beats[nextBeat] < horizon) {
    const t = beats[nextBeat];
    if (t >= offset - 1e-3 && $('click').checked) clickAt(startCtx + (t - offset), numbers[nextBeat] === 1);
    nextBeat++;
  }
}

function play() {
  if (!st.buffer) return;
  ensureCtx();
  actx.resume();
  src = actx.createBufferSource();
  src.buffer = st.buffer;
  src.connect(musicGain);
  startCtx = actx.currentTime + 0.08;
  src.start(startCtx, offset);
  playing = true;
  nextBeat = st.grid ? st.grid.beats.findIndex((t) => t >= offset) : -1;
  timer = setInterval(schedule, 25);
  schedule();
  src.onended = () => { if (playing && position() >= st.buffer.duration - 0.05) { stop(); offset = 0; draw(); } };
  $('play').textContent = 'Pause';
  requestAnimationFrame(tick);
}

function stop() {
  if (!playing) return;
  offset = position();
  playing = false;
  try { src.stop(); } catch { /* already stopped */ }
  clearInterval(timer);
  $('play').textContent = 'Lecture';
}

function seek(t) {
  const was = playing;
  stop();
  offset = Math.max(0, Math.min(st.buffer ? st.buffer.duration - 0.01 : 0, t));
  if (was) play(); else draw();
}

function tick() {
  if (!playing) return;
  const p = position();
  if ($('follow').checked) {
    const W = $('timeline').clientWidth, x = (p - viewStart()) * pps;
    if (x > W * 0.8 || x < 0) $('scroller').scrollLeft = Math.max(0, (p - (W * 0.2) / pps) * pps);
  }
  draw();
  highlightBar(p);
  requestAnimationFrame(tick);
}

let lastBar = null;
function highlightBar(p) {
  const els = $('chart').children;
  let cur = null;
  for (const el of els) { if (Number(el.dataset.t) <= p) cur = el; else break; }
  if (cur !== lastBar) { if (lastBar) lastBar.classList.remove('now'); if (cur) cur.classList.add('now'); lastBar = cur; }
}

$('play').onclick = () => (playing ? stop() : play());
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); playing ? stop() : play(); }
});

// ---------- diagnostic ----------
function fmtTime(t, tenths = false) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${(tenths ? s.toFixed(1) : Math.floor(s).toString()).padStart(tenths ? 4 : 2, '0')}`;
}

function diagnostic() {
  const L = [];
  const n = navigator;
  L.push('Fabtice — diagnostic de la page d\'essai « analyse »');
  L.push(`Date : ${new Date().toISOString()}`);
  L.push(`Page : ${location.href}`);
  L.push(`Navigateur : ${n.userAgent}`);
  if (n.userAgentData) L.push(`Marques : ${n.userAgentData.brands.map((b) => `${b.brand} ${b.version}`).join(', ')} ; plateforme ${n.userAgentData.platform} ; mobile ${n.userAgentData.mobile}`);
  L.push(`Système : ${n.platform || '?'} ; langue ${n.language} ; cœurs ${n.hardwareConcurrency || '?'} ; mémoire ${n.deviceMemory ? n.deviceMemory + ' Go' : '?'} ; isolation cross-origin ${self.crossOriginIsolated}`);
  if (st.workerEnv) L.push(`Moteur : onnxruntime-web ${st.workerEnv.ortVersion}, backend ${st.workerEnv.backend}, ${st.workerEnv.threads} fil(s), isolation dans le worker ${st.workerEnv.crossOriginIsolated}`);
  for (const m of st.models) L.push(`Modèle : ${m.name} — ${m.licence} — ${(m.bytes / 1e6).toFixed(1)} Mo — SHA-256 ${m.sha256.slice(0, 16)}… vérifiée — ${m.fromCache ? 'depuis le cache' : 'téléchargé'} en ${m.loadMs} ms, initialisé en ${m.initMs} ms — ${m.url}`);
  if (st.file) L.push(`Fichier : ${st.file.name} ; ${(st.file.size / 1e6).toFixed(2)} Mo ; ${st.file.duration.toFixed(2)} s ; ${st.file.channels} canal(aux) ; décodage ${Math.round(st.decodeMs)} ms`);
  if (st.opts) L.push(`Réglages : ${JSON.stringify(st.opts)}`);
  if (st.result) {
    const t = st.result.timings;
    L.push(`Durées (ms) : ${Object.entries(t).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')} ; total analyse ${Math.round(st.analyseMs)} (y compris téléchargements)`);
    const tu = st.result.tuning;
    L.push(`Accordage : La = ${tu.refHz.toFixed(2)} Hz (${tu.cents.toFixed(1)} cents), cohérence ${tu.confidence.toFixed(2)}, ${tu.peaks} pics ; correction appliquée aux accords : ${st.result.timeScale !== 1 ? 'oui' : 'non'}`);
  }
  if (st.tempo) L.push(`Tempo : médiane ${st.tempo.median.toFixed(1)} BPM ; plage 5–95 % ${st.tempo.p05.toFixed(1)}–${st.tempo.p95.toFixed(1)} ; ${st.grid.beats.length} temps ; ${bars(st.grid).length} mesures ; premier temps à ${st.grid.beats[0]?.toFixed(2)} s`);
  if (st.grid) L.push(`Métrique : ${meterLabel(st.grid.beatsPerBar)}${st.meterScores.length && st.meterScores[0].prob != null ? ' (' + st.meterScores.map((s) => `${s.meter}: ${s.prob.toFixed(3)}`).join(', ') + ')' : ''}`);
  if (st.key) L.push(`Tonalité : ${st.key.ranked.map((k) => `${keyName(k)} ${(k.p * 100).toFixed(0)} %`).join(' ; ')}`);
  if (st.corrections.length) L.push(`Corrections : ${st.corrections.join(' ; ')}`);
  if (st.grid) {
    L.push('Grille (mesure : accords, ? = douteux) :');
    const atBeat = [];
    for (const s of st.segments) for (const i of s.beats) atBeat[i] = s;
    const key = st.key.best;
    let line = [];
    for (const b of bars(st.grid)) {
      const inBar = [];
      for (const i of b.beats) { const s = atBeat[i]; if (s && inBar[inBar.length - 1] !== s) inBar.push(s); }
      line.push(`${b.index}: ` + inBar.map((s) => chordName(s.chord, key) + (s.extensions.length ? `(${s.extensions.map((x) => x.name).join(',')})` : '') + (s.confidence < 0.5 ? '?' : '')).join(' '));
      if (line.length === 4) { L.push('  | ' + line.join(' | ') + ' |'); line = []; }
    }
    if (line.length) L.push('  | ' + line.join(' | ') + ' |');
    L.push(`Accords (début en s, accord, sûreté) : ${st.segments.map((s) => `${s.t0.toFixed(2)} ${s.chord === NO_CHORD ? 'N' : chordName(s.chord, key)} ${s.confidence.toFixed(2)}`).join(' ; ')}`);
  }
  L.push(`Erreurs : ${st.errors.length ? st.errors.join(' || ') : 'aucune'}`);
  return L.join('\n');
}

$('copyDiag').onclick = async () => {
  const text = diagnostic();
  const ta = $('diag');
  ta.value = text;
  try {
    await navigator.clipboard.writeText(text);
    $('copied').textContent = 'Copié dans le presse-papiers.';
    ta.hidden = true;
  } catch {
    ta.hidden = false; ta.select();
    $('copied').textContent = 'Copie automatique refusée : le texte est sélectionné ci-dessous.';
  }
};

window.__analyse = { st, diagnostic }; // for automated checks
