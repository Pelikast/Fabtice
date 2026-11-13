// Fabtice player spike: page logic (UI, loading, status, diagnostics, export).
import { chunkize, storeBytes, computePeaks, peaksBytes, encodeWav, canShare } from './stems.js';
import { synthDemo, tile, DEMO } from './demo.js';
import { WaveformView } from './waveform.js';
import { ENGINES, createNode, setEngine, sendStem, hasSimd } from './player.js';
import { opusSupported, encodeOpus, OpusReader } from './opus.js';
import { CHUNK, CHUNK_BITS } from './stems.js';

const $ = (id) => document.getElementById(id);
const S = {
	ctx: null, node: null, sr: 48000,
	engineKey: 'signalsmith', engineInfo: null,
	stems: [], duration: 0,
	playing: false, pos: 0, st: null,
	loop: { start: 0, end: 0, enabled: false },
	loadSum: 0, loadN: 0, loadMaxWin: 0, loadPeak: 0, loadRecent: [], over: 0, underruns: 0, active: 0, wasmBytes: 0,
	errors: [], lastExport: null, fpsPlaying: { sum: 0, n: 0, min: 1e9 },
	startedAt: 0, loadMs: [], hiresTimer: null, missing: 0,
};
window.S = S; // handy for the automated checks and for debugging

const fmtT = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s - m * 60 < 10 ? '0' : '') + (s - m * 60).toFixed(1); };
const MB = (b) => (b / 1048576).toFixed(1) + ' Mo';
function logErr(msg) { S.errors.push(new Date().toISOString().slice(11, 19) + ' ' + msg); if (S.errors.length > 30) S.errors.shift(); $('log').textContent = S.errors.slice(-5).join('\n'); }
window.addEventListener('error', (e) => logErr('erreur: ' + e.message));
window.addEventListener('unhandledrejection', (e) => logErr('promesse rejetée: ' + (e.reason && e.reason.message || e.reason)));

// ---------------------------------------------------------------- waveform
const view = new WaveformView($('wave'), {
	onSeek: (t) => seek(t),
	onLoop: (s, e, final) => {
		if (s === null) { S.loop = { start: 0, end: 0, enabled: false }; sendLoop(); view.setLoop(null); return; }
		S.loop = { start: s, end: e, enabled: $('loop-on').checked };
		sendLoop(); view.setLoop(S.loop);
		if (final && e - s > 0.05 && (S.pos < s || S.pos > e)) seek(s);
	},
	onView: () => {},
});

function sendLoop() {
	if (!S.node) return;
	const L = S.loop, sr = S.sr;
	S.node.port.postMessage({ type: 'loop', enabled: L.enabled && L.end > L.start, start: L.start * sr, end: L.end * sr });
}

// ---------------------------------------------------------------- audio setup
function getCtx() {
	if (S.ctx) return S.ctx;
	const AC = window.AudioContext || window.webkitAudioContext;
	const qsSr = +new URLSearchParams(location.search).get('sr') || 0;
	const wantSr = qsSr || ($('mem').value === 'opus' ? 48000 : 0); // Opus mode needs 48 kHz
	S.ctx = wantSr ? new AC({ latencyHint: 'interactive', sampleRate: wantSr }) : new AC({ latencyHint: 'interactive' });
	S.sr = S.ctx.sampleRate;
	S.ctxReady = (async () => {
		S.node = await createNode(S.ctx, false);
		S.node.onmsg = onNodeMsg;
		S.node.connect(S.ctx.destination);
		S.hiresTimer = S.node.hello.hiresTimer;
		await switchEngine(S.engineKey);
		sendParams(); sendMetro();
	})();
	S.ctxReady.catch((e) => logErr('audio: ' + e.message));
	return S.ctx;
}
async function ensureAudio() {
	const ctx = getCtx();
	if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { logErr('resume: ' + e.message); } }
	await S.ctxReady;
}

async function switchEngine(key) {
	const eng = ENGINES.find((e) => e.key === key);
	const was = S.playing;
	$('engine-info').textContent = 'chargement…';
	const t0 = performance.now();
	const info = await setEngine(S.node, eng);
	S.engineKey = key; S.engineInfo = info; S.engine = eng;
	S.loadMs.push([key, Math.round(performance.now() - t0), info.ms]);
	$('engine-info').textContent = `prêt en ${Math.round(performance.now() - t0)} ms · retard ≈ ${(info.lat.a + info.lat.b) / S.sr * 1000 | 0} ms`;
	$('engine-warn').textContent = eng.exact ? '' : 'Ce moteur ne garantit pas l’alignement exact des pistes transposées et non transposées (retards différents, mesurés en test) : écart possible sur la batterie.';
	if (was) S.node.port.postMessage({ type: 'play' });
}

function onNodeMsg(m) {
	if (m.type === 'status') {
		S.st = { t: performance.now(), heard: m.heard, rate: m.rate, playing: m.playing };
		if (m.playing && m.load.n > 0) {
			S.loadSum += m.load.avg; S.loadN++; S.loadRecent.push(m.load.avg); if (S.loadRecent.length > 40) S.loadRecent.shift();
			S.loadMaxWin = m.load.max; if (m.load.max > S.loadPeak) S.loadPeak = m.load.max;
		}
		S.over = m.over; S.underruns = m.underruns; S.wasmBytes = m.wasmBytes || 0;
		S.active = m.active; S.missing += m.missing.length; if (m.missing.length) S.missingList = m.missing;
	} else if (m.type === 'ended') {
		S.playing = false; $('btn-play').textContent = '▶ Lecture';
	} else if (m.type === 'error') logErr('worklet: ' + m.message);
}

function sendParams() {
	if (!S.node) return;
	const semi = +$('semi').value + +$('cents').value / 100;
	S.node.port.postMessage({ type: 'params', rate: +$('tempo').value / 100, semitones: semi, formant: $('formant').checked, skipMuted: $('skipmuted').checked });
}

// ---------------------------------------------------------------- stems
function refreshTracks() {
	const anySolo = S.stems.some((s) => s.solo);
	view.setTracks(S.stems.map((s) => ({ name: s.name, peaks: s.peaks, dim: s.mute || (anySolo && !s.solo) })), S.sr, S.duration);
	view.setGrid(gridObj());
	renderStemRows();
}
function refreshDims() {
	const anySolo = S.stems.some((s) => s.solo);
	view.tracks.forEach((t, i) => { t.dim = S.stems[i].mute || (anySolo && !S.stems[i].solo); });
	view.requestDraw();
}
function postStem(i) {
	const s = S.stems[i];
	S.node.port.postMessage({ type: 'stem-params', index: i, vol: s.vol, mute: s.mute, solo: s.solo, noTranspose: s.noTranspose });
}
function renderStemRows() {
	const box = $('stems');
	if (!S.stems.length) { box.innerHTML = '<p class="note">Aucune piste chargée.</p>'; return; }
	box.innerHTML = '';
	S.stems.forEach((s, i) => {
		const row = document.createElement('div'); row.className = 'stem';
		row.innerHTML = `<span class="nm"></span><button class="m">Muet</button><button class="s">Solo</button>
			<input type="range" min="0" max="100" value="${Math.round(s.vol * 100)}" aria-label="Volume">
			<label><input type="checkbox" class="nt"> ne pas transposer</label><small></small>`;
		row.querySelector('.nm').textContent = s.name;
		const m = row.querySelector('.m'), so = row.querySelector('.s'), nt = row.querySelector('.nt');
		m.classList.toggle('on', s.mute); so.classList.toggle('on', s.solo); nt.checked = s.noTranspose;
		m.onclick = () => { s.mute = !s.mute; m.classList.toggle('on', s.mute); postStem(i); refreshDims(); };
		so.onclick = () => { s.solo = !s.solo; so.classList.toggle('on', s.solo); postStem(i); refreshDims(); };
		row.querySelector('input[type=range]').oninput = (e) => { s.vol = e.target.value / 100; postStem(i); };
		nt.onchange = () => { s.noTranspose = nt.checked; postStem(i); };
		row.querySelector('small').textContent = `${s.store.mono ? 'mono' : 'stéréo'} · ${MB(stemBytes(s))}`;
		box.appendChild(row);
	});
}

async function addStem({ name, l, r }) {
	await ensureAudio();
	const kind = $('mem').value;
	const peaks = computePeaks(l, r);
	let store, opus = null;
	if (kind === 'opus') {
		if (!opusSupported || S.sr !== 48000) throw new Error('Mode Opus indisponible (WebCodecs absent ou contexte audio pas à 48 kHz : ajoutez ?sr=48000 à l’adresse)');
		const t0 = performance.now();
		const enc = await encodeOpus(l, r, S.sr, 96000);
		S.encodeMs = (S.encodeMs || 0) + performance.now() - t0;
		store = { frames: l.length, mono: !r, kind: 'i16', chunks: new Array(Math.ceil(l.length / CHUNK)).fill(null) };
		opus = { enc, reader: new OpusReader(enc, canShare), resident: new Set(), pending: new Set() };
	} else store = chunkize(l, r, kind);
	const i = S.stems.length;
	const s = { name, store, peaks, opus, vol: 1, mute: false, solo: false, noTranspose: /batterie|drum|perc/i.test(name) };
	S.stems.push(s);
	sendStem(S.node, i, name, store);
	postStem(i);
	S.duration = Math.max(S.duration, store.frames / S.sr);
	refreshTracks();
	await new Promise((r2) => setTimeout(r2, 0)); // let the UI breathe between stems
}

async function loadDemo(long) {
	await ensureAudio();
	const state = $('loadstate');
	await clearStems();
	state.textContent = 'génération de la démo…';
	await new Promise((r) => setTimeout(r, 30));
	const t0 = performance.now();
	const demo = synthDemo(S.sr, (p) => { state.textContent = `génération de la démo… ${Math.round(p * 100)} %`; });
	S.demoInfo = DEMO;
	$('bpm').value = DEMO.bpm; $('offset').value = DEMO.offset; $('bpb').value = DEMO.beatsPerBar;
	for (const st of demo.stems) {
		const t = long ? tile(st, 8) : st;
		await addStem(t);
	}
	state.textContent = `${S.stems.length} pistes, ${fmtT(S.duration)} — prêt (${Math.round(performance.now() - t0)} ms)`;
	onGridChange();
	updateStats();
}

async function loadFiles(files) {
	await ensureAudio();
	const state = $('loadstate');
	for (const f of files) {
		state.textContent = `décodage de « ${f.name} »…`;
		try {
			const buf = await f.arrayBuffer();
			const ab = await S.ctx.decodeAudioData(buf);
			const l = ab.getChannelData(0), r = ab.numberOfChannels > 1 ? ab.getChannelData(1) : null;
			await addStem({ name: f.name.replace(/\.[^.]+$/, ''), l, r });
		} catch (e) { logErr(`décodage de ${f.name}: ${e && e.message || e}`); state.textContent = 'échec : ' + f.name; }
	}
	state.textContent = `${S.stems.length} pistes, ${fmtT(S.duration)}`;
	onGridChange();
}

async function clearStems() {
	if (S.playing) pause();
	S.stems = []; S.duration = 0; S.pos = 0;
	if (S.node) S.node.port.postMessage({ type: 'clear' });
	S.loop = { start: 0, end: 0, enabled: false }; view.setLoop(null);
	refreshTracks();
}

// ---------------------------------------------------------------- transport
async function play() {
	await ensureAudio();
	if (!S.stems.length) { $('loadstate').textContent = 'Chargez d’abord des fichiers ou la démo.'; return; }
	if (S.pos >= S.duration - 0.05) seek(0);
	S.node.port.postMessage({ type: 'play' });
	S.playing = true; S.startedAt = performance.now(); $('btn-play').textContent = '⏸ Pause';
	S.st = { t: performance.now(), heard: S.pos * S.sr, rate: +$('tempo').value / 100, playing: true };
}
function pause() {
	if (S.node) S.node.port.postMessage({ type: 'pause' });
	S.playing = false; $('btn-play').textContent = '▶ Lecture';
}
function seek(t) {
	t = Math.max(0, Math.min(S.duration, t));
	S.pos = t;
	if (S.node) S.node.port.postMessage({ type: 'seek', frame: t * S.sr });
	if (S.st) S.st = { ...S.st, t: performance.now(), heard: t * S.sr };
	view.setPlayhead(t);
	if (S.stems.some((x) => x.opus)) streamTick();
}
$('btn-play').onclick = () => (S.playing ? pause() : play());
$('btn-start').onclick = () => seek(S.loop.enabled && S.loop.end > S.loop.start ? S.loop.start : 0);
window.addEventListener('keydown', (e) => {
	if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); S.playing ? pause() : play(); }
});

// 60 fps tick: extrapolate the heard position between the worklet's status messages
let lastLabel = 0;
function tick(now) {
	if (S.st && S.playing && S.st.playing) {
		let t = (S.st.heard + (now - S.st.t) / 1000 * S.sr * S.st.rate) / S.sr;
		const L = S.loop;
		if (L.enabled && L.end > L.start && S.st.heard / S.sr < L.end && t > L.end) t = L.start + (t - L.end);
		S.pos = Math.min(t, S.duration);
	}
	view.playing = S.playing;
	view.setPlayhead(S.pos);
	if (now - lastLabel > 100) {
		lastLabel = now;
		$('time').textContent = `${fmtT(S.pos)} / ${fmtT(S.duration)}`;
		const g = gridObj();
		if (g.bpm > 0 && S.pos >= g.offset) {
			const beat = (S.pos - g.offset) / (60 / g.bpm), bar = Math.floor(beat / g.beatsPerBar) + 1, b = Math.floor(beat % g.beatsPerBar) + 1;
			$('barpos').textContent = `mesure ${bar}, temps ${b}`;
		} else $('barpos').textContent = '';
		if (S.playing && view.fps.value > 0) { const f = S.fpsPlaying; f.sum += view.fps.value; f.n++; f.min = Math.min(f.min, view.fps.value); }
	}
	requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------- controls
$('btn-files').onclick = () => { getCtx(); $('file').click(); };
$('file').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) loadFiles(fs); };
$('btn-demo').onclick = () => { getCtx(); loadDemo(false); };
$('btn-demo-long').onclick = () => { getCtx(); loadDemo(true); };
$('btn-clear').onclick = () => clearStems();
$('loop-on').onchange = () => { S.loop.enabled = $('loop-on').checked && S.loop.end > S.loop.start; if (S.loop.end > S.loop.start) { S.loop.enabled = $('loop-on').checked; } sendLoop(); view.setLoop(S.loop.end > S.loop.start ? S.loop : null); };
$('btn-loop-clear').onclick = () => { S.loop = { start: 0, end: 0, enabled: false }; sendLoop(); view.setLoop(null); };
$('snap').onchange = () => { view.snap = $('snap').checked; };
$('follow').onchange = () => { view.follow = $('follow').checked; };
$('pan-mode').onchange = () => { view.panMode = $('pan-mode').checked; };
$('grid-on').onchange = () => view.setGrid($('grid-on').checked ? gridObj() : null);
$('z-in').onclick = () => view.zoom(0.5, S.pos);
$('z-out').onclick = () => view.zoom(2, S.pos);
$('z-all').onclick = () => view.showAll();
$('z-loop').onclick = () => view.showLoop();

const semiTxt = () => { const v = +$('semi').value; $('semi-v').textContent = (v > 0 ? '+' : '') + v + (Math.abs(v) > 1 ? ' demi-tons' : ' demi-ton'); };
const centsTxt = () => { const v = +$('cents').value; $('cents-v').textContent = (v > 0 ? '+' : '') + v + (Math.abs(v) > 1 ? ' cents' : ' cent'); };
const tempoTxt = () => { $('tempo-v').textContent = $('tempo').value + ' %'; };
$('semi').oninput = () => { semiTxt(); sendParams(); };
$('cents').oninput = () => { centsTxt(); sendParams(); };
$('tempo').oninput = () => { tempoTxt(); sendParams(); };
$('semi-0').onclick = () => { $('semi').value = 0; semiTxt(); sendParams(); };
$('cents-0').onclick = () => { $('cents').value = 0; centsTxt(); sendParams(); };
$('tempo-0').onclick = () => { $('tempo').value = 100; tempoTxt(); sendParams(); };
$('formant').onchange = sendParams; $('skipmuted').onchange = sendParams;
semiTxt(); centsTxt(); tempoTxt();

for (const e of ENGINES) { const o = document.createElement('option'); o.value = e.key; o.textContent = e.label; $('engine').appendChild(o); }
$('engine').onchange = async () => { try { await ensureAudio(); await switchEngine($('engine').value); } catch (e) { logErr('moteur: ' + e.message); } };

// metronome
function gridObj() { return { bpm: +$('bpm').value, offset: +$('offset').value, beatsPerBar: Math.max(1, +$('bpb').value | 0) }; }
function sendBeats() {
	if (!S.node) return;
	const g = gridObj(), sr = S.sr;
	if (!(g.bpm > 0)) return;
	const beat = 60 / g.bpm, n = Math.max(0, Math.ceil((S.duration + 5 - g.offset) / beat));
	const frames = new Float64Array(n), acc = new Uint8Array(n);
	for (let k = 0; k < n; k++) { frames[k] = (g.offset + k * beat) * sr; acc[k] = k % g.beatsPerBar === 0 ? 1 : 0; }
	S.node.port.postMessage({ type: 'beats', frames, accents: acc });
}
function sendMetro() { if (S.node) S.node.port.postMessage({ type: 'metro', enabled: $('metro-on').checked, vol: +$('metro-vol').value / 100 }); }
function onGridChange() { sendBeats(); view.setGrid($('grid-on').checked ? gridObj() : null); }
$('metro-on').onchange = async () => { await ensureAudio(); sendBeats(); sendMetro(); };
$('metro-vol').oninput = sendMetro;
for (const id of ['bpm', 'offset', 'bpb']) $(id).onchange = onGridChange;

// ---------------------------------------------------------------- stats
function stemBytes(s) {
	if (!s.opus) return storeBytes(s.store);
	return s.opus.enc.bytes + s.opus.resident.size * CHUNK * 2 * (s.store.mono ? 1 : 2);
}
function totals() {
	let store = 0, peaks = 0, frames = 0, f32eq = 0;
	for (const s of S.stems) { store += stemBytes(s); peaks += peaksBytes(s.peaks); frames = Math.max(frames, s.store.frames); f32eq += s.store.frames * 2 * 4; }
	return { store, peaks, frames, f32eq };
}
function updateStats() {
	const t = totals(), ctx = S.ctx;
	const avg = S.loadRecent.length ? S.loadRecent.reduce((a, b) => a + b, 0) / S.loadRecent.length : 0;
	const bar = $('cpu-bar');
	bar.style.width = Math.min(100, avg * 100) + '%';
	bar.className = avg > 0.8 ? 'bad' : avg > 0.5 ? 'warn' : '';
	const perStem = S.active ? avg / S.active : 0;
	$('cpu-txt').textContent = S.playing ? `${(avg * 100).toFixed(1)} % (pic ${(S.loadMaxWin * 100).toFixed(0)} %) · ${S.active} piste(s) calculée(s)` : '— (en pause)';
	const rows = [
		['Moteur', `${S.engine ? S.engine.label : '—'} · SIMD WebAssembly : ${hasSimd ? 'oui' : 'non'}`],
		['Fréquence d’échantillonnage', ctx ? `${ctx.sampleRate} Hz · latence de sortie ≈ ${((ctx.baseLatency || 0) * 1000).toFixed(0)} ms (base)` : '—'],
		['Charge par piste calculée', S.playing && S.active ? `${(perStem * 100).toFixed(1)} %` : '—'],
		['Quanta hors budget / coupures de moteur', `${S.over} / ${S.underruns}${S.hiresTimer === false ? ' (chronomètre à 1 ms : hors budget non mesurable)' : ''}`],
		['Mémoire audio des pistes', `${MB(t.store)} (équivalent 32 bits stéréo : ${MB(t.f32eq)})`],
		['Mémoire des crêtes (forme d’onde)', MB(t.peaks)],
		['Mémoire WebAssembly du moteur', S.wasmBytes ? MB(S.wasmBytes) : '—'],
		['Tas JavaScript', performance.memory ? MB(performance.memory.usedJSHeapSize) : 'non disponible sur ce navigateur'],
		['Forme d’onde', `${view.fps.value.toFixed(0)} images/s · dessin ${view.fps.drawMs.toFixed(2)} ms (max ${view.fps.drawMax.toFixed(1)} ms)`],
		['Isolation inter-origines (mémoire partagée)', crossOriginIsolated ? 'oui' : 'non'],
	];
	$('stats').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}
setInterval(updateStats, 500);

// ---------------------------------------------------------------- diagnostic
async function userAgentMemory() {
	try {
		if (performance.measureUserAgentSpecificMemory && crossOriginIsolated) {
			const m = await performance.measureUserAgentSpecificMemory();
			return `${MB(m.bytes)} (measureUserAgentSpecificMemory)`;
		}
	} catch (e) { return 'erreur: ' + e.message; }
	return 'non disponible';
}
async function buildDiagnostic() {
	const t = totals(), ctx = S.ctx, nav = navigator;
	const lines = [];
	const push = (k, v) => lines.push(`${k}: ${v}`);
	lines.push('== Fabtice lecteur — diagnostic ==');
	push('date', new Date().toISOString());
	push('navigateur', nav.userAgent);
	push('plateforme', `${nav.platform || '?'} · cœurs logiques: ${nav.hardwareConcurrency || '?'} · mémoire déclarée (Go): ${nav.deviceMemory || 'n/d'}`);
	push('écran', `${screen.width}x${screen.height} @${devicePixelRatio}x · fenêtre ${innerWidth}x${innerHeight}`);
	push('isolation inter-origines', crossOriginIsolated);
	push('SIMD WebAssembly', hasSimd);
	push('mémoire partagée (SharedArrayBuffer) utilisée pour les pistes', canShare);
	push('fréquence d’échantillonnage', ctx ? ctx.sampleRate : '—');
	push('latence contexte (base/sortie, ms)', ctx ? `${((ctx.baseLatency || 0) * 1000).toFixed(1)} / ${((ctx.outputLatency || 0) * 1000).toFixed(1)}` : '—');
	push('état du contexte audio', ctx ? ctx.state : '—');
	push('chronomètre du fil audio', S.hiresTimer === null ? '—' : S.hiresTimer ? 'haute résolution' : 'millisecondes (moyenne seulement)');
	push('moteur', `${S.engine ? S.engine.label : '—'} (${S.engineKey})`);
	push('chargement du moteur (ms, total / worklet)', S.loadMs.map((x) => `${x[0]}: ${x[1]}/${x[2]}`).join(' ; ') || '—');
	if (S.engineInfo) push('retard du moteur (sorties: a + b/tempo, images)', `a=${S.engineInfo.lat.a.toFixed(0)} b=${S.engineInfo.lat.b.toFixed(0)} → ${((S.engineInfo.lat.a + S.engineInfo.lat.b) / S.sr * 1000).toFixed(0)} ms à 100 %`);
	push('pistes', `${S.stems.length} · durée ${S.duration.toFixed(1)} s · ${S.stems.map((s) => `${s.name}(${s.store.mono ? 'mono' : 'stéréo'}${s.noTranspose ? ',fixe' : ''}${s.mute ? ',muet' : ''}${s.solo ? ',solo' : ''})`).join(' ')}`);
	push('stockage des pistes', S.stems[0] ? (S.stems[0].opus ? `Opus 96 kb/s (encodage ${(S.encodeMs / 1000).toFixed(1)} s au total), blocs 16 bits décodés à la demande` : S.stems[0].store.kind) : '—');
	push('réglages', `tonalité ${(+$('semi').value + $('cents').value / 100).toFixed(2)} demi-tons · tempo ${$('tempo').value} % · formants ${$('formant').checked} · métronome ${$('metro-on').checked} (${$('bpm').value} BPM) · boucle ${S.loop.end > S.loop.start ? `${S.loop.start.toFixed(2)}–${S.loop.end.toFixed(2)} s ${S.loop.enabled ? 'active' : 'inactive'}` : 'aucune'}`);
	const avg = S.loadN ? S.loadSum / S.loadN : 0;
	push('charge du fil audio (moyenne sur la lecture / pic de fenêtre / pic absolu)', S.loadN ? `${(avg * 100).toFixed(1)} % / ${(S.loadMaxWin * 100).toFixed(0)} % / ${(S.loadPeak * 100).toFixed(0)} %` : 'aucune lecture mesurée');
	push('pistes calculées pendant la mesure', S.active);
	push('quanta de 128 images hors budget (chronomètre précis seulement)', S.over);
	push('tampons perdus (coupures de sortie du moteur de dilatation)', S.underruns);
	push('blocs de pistes manquants', S.missing);
	if (ctx && ctx.playbackStats) { try { push('playbackStats du navigateur', JSON.stringify(ctx.playbackStats.toJSON ? ctx.playbackStats.toJSON() : ctx.playbackStats)); } catch (e) { /* ignore */ } }
	push('mémoire audio des pistes', `${MB(t.store)} (équivalent 32 bits stéréo ${MB(t.f32eq)})`);
	push('mémoire des crêtes', MB(t.peaks));
	push('mémoire WebAssembly du moteur', S.wasmBytes ? MB(S.wasmBytes) : '—');
	push('tas JavaScript', performance.memory ? `${MB(performance.memory.usedJSHeapSize)} / limite ${MB(performance.memory.jsHeapSizeLimit)}` : 'non disponible');
	push('mémoire totale de la page', await userAgentMemory());
	const f = S.fpsPlaying;
	push('forme d’onde: images/s pendant la lecture (moyenne / minimum)', f.n ? `${(f.sum / f.n).toFixed(1)} / ${f.min.toFixed(0)}` : 'non mesuré (lancer la lecture)');
	push('forme d’onde: dessin (dernier / max, ms)', `${view.fps.drawMs.toFixed(2)} / ${view.fps.drawMax.toFixed(1)}`);
	if (S.lastExport) push('dernier rendu hors ligne', S.lastExport);
	push('erreurs', S.errors.length ? '\n  ' + S.errors.join('\n  ') : 'aucune');
	return lines.join('\n');
}
$('btn-diag').onclick = async () => {
	const txt = await buildDiagnostic();
	try { await navigator.clipboard.writeText(txt); $('diag-state').textContent = 'Copié dans le presse-papiers.'; }
	catch (e) {
		const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'width:100%;height:240px'; $('diag-state').textContent = 'Copie automatique impossible : sélectionnez le texte ci-dessous.';
		$('diag-state').after(ta); ta.select();
	}
};
window.buildDiagnostic = buildDiagnostic;

// ---------------------------------------------------------------- offline rendering (export)
// Compressed mode: decode just the chunks the export needs (the offline worklet has its own store).
async function exportStore(s, fromF, toF) {
	if (!s.opus) return s.store;
	const st = { frames: s.store.frames, mono: s.store.mono, kind: 'i16', chunks: new Array(s.store.chunks.length).fill(null) };
	const c0 = Math.max(0, Math.floor(fromF) >> CHUNK_BITS), c1 = Math.min(st.chunks.length - 1, Math.floor(toF) >> CHUNK_BITS);
	for (let c = c0; c <= c1; c++) st.chunks[c] = await s.opus.reader.decodeChunk(c);
	return st;
}
async function exportWav() {
	const out = $('exp-state');
	try {
		await ensureAudio();
		if (!S.stems.length) { out.textContent = 'Aucune piste.'; return; }
		const sr = S.sr, rate = +$('tempo').value / 100, eng = ENGINES.find((e) => e.key === S.engineKey);
		const useLoop = $('exp-scope').value === 'loop' && S.loop.end > S.loop.start;
		const startF = useLoop ? Math.round(S.loop.start * sr) : 0;
		const endF = useLoop ? Math.round(S.loop.end * sr) : Math.round(S.duration * sr);
		const lat = S.engineInfo.lat, L = Math.round(lat.a + lat.b / rate);
		const outFrames = Math.ceil((endF - startF) / rate);
		const total = outFrames + L + 4096;
		out.textContent = 'préparation…';
		const off = new OfflineAudioContext(2, total, sr);
		const node = await createNode(off, true);
		const errs = [];
		node.onmsg = (m) => { if (m.type === 'error') errs.push(m.message); };
		await setEngine(node, eng);
		for (let i = 0; i < S.stems.length; i++) {
			const s = S.stems[i];
			out.textContent = `préparation de la piste ${i + 1}/${S.stems.length}…`;
			sendStem(node, i, s.name, await exportStore(s, startF - 16384, endF + Math.ceil((lat.a + 4 * lat.b) * rate) + 16384));
			node.port.postMessage({ type: 'stem-params', index: i, vol: s.vol, mute: s.mute, solo: s.solo, noTranspose: s.noTranspose });
		}
		node.port.postMessage({ type: 'params', rate, semitones: +$('semi').value + +$('cents').value / 100, formant: $('formant').checked, skipMuted: true });
		node.port.postMessage({ type: 'loop', enabled: false, start: 0, end: 0 });
		if ($('metro-on').checked) {
			const g = gridObj(), beat = 60 / g.bpm, n = Math.ceil((S.duration + 5 - g.offset) / beat);
			const frames = new Float64Array(n), acc = new Uint8Array(n);
			for (let k = 0; k < n; k++) { frames[k] = (g.offset + k * beat) * sr; acc[k] = k % g.beatsPerBar === 0 ? 1 : 0; }
			node.port.postMessage({ type: 'beats', frames, accents: acc });
			node.port.postMessage({ type: 'metro', enabled: true, vol: +$('metro-vol').value / 100 });
		}
		node.port.postMessage({ type: 'seek', frame: startF });
		node.port.postMessage({ type: 'play' });
		await new Promise((res) => { const prev = node.onmsg; node.onmsg = (m) => { if (m.type === 'pong') { node.onmsg = prev; res(); } else prev(m); }; node.port.postMessage({ type: 'ping' }); });
		node.connect(off.destination);
		out.textContent = 'rendu en cours…';
		const t0 = performance.now();
		const buf = await off.startRendering();
		const wall = (performance.now() - t0) / 1000;
		const keep = Math.min(outFrames, buf.length - L);
		const ch = [buf.getChannelData(0).subarray(L, L + keep), buf.getChannelData(1).subarray(L, L + keep)];
		const blob = encodeWav(ch, sr, +$('exp-fmt').value);
		const secs = keep / sr;
		const speed = secs / wall;
		S.lastExport = `${useLoop ? 'boucle' : 'morceau'} ${secs.toFixed(1)} s, moteur ${S.engineKey}, ${S.stems.length} pistes, rendu en ${wall.toFixed(2)} s (${speed.toFixed(1)}× le temps réel), WAV ${(blob.size / 1048576).toFixed(1)} Mo${errs.length ? ', erreurs: ' + errs.join(';') : ''}`;
		const url = URL.createObjectURL(blob);
		out.innerHTML = '';
		out.append(`${S.lastExport} — `);
		const a = document.createElement('a'); a.href = url; a.download = 'fabtice-rendu.wav'; a.textContent = 'télécharger le WAV'; out.append(a);
		if (window.__keepExport) window.__lastExport = { ch0: ch[0].slice(), ch1: ch[1].slice(), sr, wall, secs, speed };
	} catch (e) { out.textContent = 'échec : ' + (e && e.message || e); logErr('export: ' + (e && e.stack || e)); }
}
$('btn-export').onclick = exportWav;
window.exportWav = exportWav;

// ---------------------------------------------------------------- compressed mode: decode chunks near the playhead
function wanted(frames, margin) {
	const sr = S.sr, set = new Set(), last = Math.ceil(frames / CHUNK) - 1;
	const add = (a, b) => { for (let c = Math.max(0, Math.floor(a) >> CHUNK_BITS); c <= Math.min(last, Math.floor(b) >> CHUNK_BITS); c++) set.add(c); };
	const rate = Math.max(1, +$('tempo').value / 100), pos = S.pos * sr, m = margin;
	const L = S.loop;
	if (L.enabled && L.end > L.start && L.end - L.start < 120 && S.pos >= L.start - 0.5 && S.pos <= L.end + 0.2) {
		add(L.start * sr - 0.2 * sr, L.end * sr + 0.2 * sr); // inside a loop: only the loop is needed
		return set;
	}
	add(pos - 1.5 * sr * m, pos + (S.playing ? 4 : 2) * sr * rate * m);
	if (L.enabled && L.end > L.start && L.end - L.start < 120) add(L.start * sr - 0.2 * sr, L.end * sr + 0.2 * sr);
	return set;
}
function streamTick() {
	S.stems.forEach((s, i) => {
		const o = s.opus; if (!o) return;
		const want = wanted(s.store.frames, 1);
		for (const [si, list] of S.missingList || []) if (si === i) for (const c of list) want.add(c);
		const keep = wanted(s.store.frames, 2);
		const drop = [];
		for (const c of o.resident) if (!keep.has(c)) { drop.push(c); }
		if (drop.length) { for (const c of drop) o.resident.delete(c); S.node.port.postMessage({ type: 'chunks', index: i, drop }); }
		const pc = Math.floor(S.pos * S.sr) >> CHUNK_BITS;
		const need = [...want].filter((c) => !o.resident.has(c) && !o.pending.has(c)).sort((a, b) => a - b);
		// contiguous runs of at most 4 chunks, nearest to the playhead first
		const runs = [];
		for (const c of need) { const r = runs[runs.length - 1]; if (r && c === r[1] + 1 && r[1] - r[0] < 3) r[1] = c; else runs.push([c, c]); }
		runs.sort((a, b) => Math.abs(a[0] - pc) - Math.abs(b[0] - pc));
		for (const [a, b] of runs) {
			for (let c = a; c <= b; c++) o.pending.add(c);
			o.reader.decodeChunks(a, b, () => { const w = wanted(s.store.frames, 1); return !S.stems.includes(s) || ![...Array(b - a + 1).keys()].some((k) => w.has(a + k)); }).then((chs) => {
				for (let c = a; c <= b; c++) o.pending.delete(c);
				if (!chs || !S.stems.includes(s)) return;
				const put = [];
				chs.forEach((ch, k) => { o.resident.add(a + k); put.push([a + k, ch]); });
				S.node.port.postMessage({ type: 'chunks', index: i, put });
			}).catch((e) => { for (let c = a; c <= b; c++) o.pending.delete(c); logErr('Opus: ' + (e && e.message || e)); });
		}
	});
	S.missingList = null;
}
setInterval(() => { if (S.node && S.stems.some((s) => s.opus)) streamTick(); }, 120);

// handles for the automated checks
window.__fab = { addStem, clearStems, view, seek, play, pause, loadDemo, sendParams };
