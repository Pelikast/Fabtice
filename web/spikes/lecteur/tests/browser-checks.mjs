// Browser checks in Chromium (real AudioWorklet, real OfflineAudioContext).
//   node tests/browser-checks.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { startServer } from './serve.mjs';
const { chromium } = createRequire('/opt/node-tools/')('playwright');

let failed = 0;
const ok = (name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${detail}`); };
let browserPid = 0;
const rssMB = () => { // resident memory of this run's Chromium process tree only (the machine is shared)
	try {
		const out = execSync('ps -eo pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
		const kids = new Map(); for (const [pid, ppid, rss] of out) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push([pid, rss]); }
		let sum = 0; const walk = (pid) => { for (const [k, rss] of kids.get(pid) || []) { sum += rss; walk(k); } };
		walk(browserPid); return sum / 1024;
	} catch { return 0; }
};

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc', `--fab-test=${process.pid}`] });
browserPid = +execSync(`ps -eo pid=,args= | grep -- '--fab-test=${process.pid}' | grep -v -- '--type=' | grep -v grep | head -1 | awk '{print $1}'`).toString().trim();
async function fresh(opts = {}) {
	const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	page.on('filechooser', (fc) => fc.setFiles([]));
	await page.goto(url + '/spikes/lecteur/');
	return page;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ 1. offline rendering: pitch, duration, speed
{
	const page = await fresh();
	await page.click('#btn-files'); // creates the context (needs a gesture); cancel the picker is not needed headless
	await page.evaluate(async () => {
		const { addStem } = window.__fab;
		await new Promise((r) => setTimeout(r, 300));
		const sr = S.sr, n = sr * 20, l = new Float32Array(n);
		for (let i = 0; i < n; i++) l[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr);
		await addStem({ name: 'sinus', l, r: null });
	});
	for (const key of ['signalsmith', 'rubberband-r3', 'soundtouch']) {
		const res = await page.evaluate(async (key) => {
			window.__keepExport = true;
			document.getElementById('engine').value = key; document.getElementById('engine').dispatchEvent(new Event('change'));
			await new Promise((r) => setTimeout(r, 1500));
			for (let i = 0; i < 40 && S.engineKey !== key; i++) await new Promise((r) => setTimeout(r, 250));
			const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
			set('semi', 7); set('tempo', 50);
			document.getElementById('exp-scope').value = 'all';
			await window.exportWav();
			const x = window.__lastExport, sr = x.sr, a = x.ch0;
			let first = -1, last = -1, c = 0;
			for (let i = Math.floor(5 * sr); i < Math.floor(30 * sr); i++) if (a[i - 1] < 0 && a[i] >= 0) { const t = i - 1 + -a[i - 1] / (a[i] - a[i - 1]); if (first < 0) first = t; last = t; c++; }
			let peakHead = 0; for (let i = 0; i < 2000; i++) peakHead = Math.max(peakHead, Math.abs(a[i]));
			return { key, freq: (c - 1) * sr / (last - first), secs: x.secs, wall: x.wall, speed: x.speed, len: a.length / sr, headPeak: peakHead, state: document.getElementById('exp-state').textContent.slice(0, 160) };
		}, key);
		const exp = 440 * 2 ** (7 / 12), cents = 1200 * Math.log2(res.freq / exp);
		ok(`offline render ${key}: +7 st, 50% tempo`, Math.abs(cents) < 25 && Math.abs(res.secs - 40) < 0.05 && res.speed > 1, `f=${res.freq.toFixed(2)} Hz (${cents.toFixed(1)} cents), duration ${res.secs.toFixed(3)} s (expected 40), ${res.speed.toFixed(1)}x realtime, first 2000 samples peak ${res.headPeak.toFixed(2)}`);
	}
	await page.close();
}

// ------------------------------------------------------------ 2. real-time playback of the demo through the worklet
{
	const page = await fresh();
	await page.click('#btn-demo');
	await page.waitForFunction(() => window.S && S.stems.length === 7, null, { timeout: 90000 });
	const info = await page.evaluate(() => ({ dur: S.duration, state: document.getElementById('loadstate').textContent }));
	console.log('demo:', info.state);
	// loop bar 5 (9.6 s .. 12.0 s), -5 st, 60 %, drums fixed
	const r = await page.evaluate(async () => {
		const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
		set('semi', -5); set('tempo', 60);
		const f = window.__fab;
		S.loop = { start: 9.6, end: 12.0, enabled: true }; f.view.setLoop(S.loop);
		S.node.port.postMessage({ type: 'loop', enabled: true, start: 9.6 * S.sr, end: 12.0 * S.sr });
		f.seek(9.0);
		await f.play();
		await new Promise((r) => setTimeout(r, 1500));
		const us0 = S.ctx.playbackStats ? S.ctx.playbackStats.underrunEvents : -1;
		const samples = [];
		const t0 = performance.now(); const p0 = S.pos;
		for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); samples.push(S.pos); }
		const us1 = S.ctx.playbackStats ? S.ctx.playbackStats.underrunEvents : -1;
		const wall = (performance.now() - t0) / 1000;
		return { samples, wall, p0, us0, us1, over: S.over, underruns: S.underruns, load: S.loadRecent.slice(-10), active: S.active, fps: window.__fab.view.fps.value };
	});
	const inLoop = r.samples.every((p) => p >= 8.9 && p <= 12.1);
	let wraps = 0; for (let i = 1; i < r.samples.length; i++) if (r.samples[i] < r.samples[i - 1] - 1.2) wraps++;
	// total travelled in source time: sum of forward steps + wraps * loop length ~ rate * wall
	let travelled = 0; for (let i = 1; i < r.samples.length; i++) travelled += r.samples[i] >= r.samples[i - 1] ? r.samples[i] - r.samples[i - 1] : (12.0 - r.samples[i - 1]) + (r.samples[i] - 9.6);
	ok('real-time: playhead stays in the loop, wraps', inLoop && wraps >= 1, `${wraps} wraps in ${r.wall.toFixed(1)} s, positions ${r.samples.slice(0, 6).map((x) => x.toFixed(2)).join(' ')}...`);
	ok('real-time: source time advances at the tempo ratio (60 %)', Math.abs(travelled / r.wall - 0.6) < 0.05, `${(travelled / r.wall).toFixed(3)} source s per wall s`);
	ok('real-time: no audio-thread underruns (browser playbackStats)', r.us1 - r.us0 === 0 && r.underruns === 0, `playbackStats underrunEvents ${r.us0} -> ${r.us1}, engine underruns ${r.underruns}, over-budget quanta ${r.over}`);
	console.log(`      audio load (7 stems, -5 st, 60%): ${(r.load.reduce((a, b) => a + b, 0) / r.load.length * 100).toFixed(1)} % avg, active stems ${r.active}`);
	// mute / solo: skipped stems are not computed
	const act = await page.evaluate(async () => {
		const rows = document.querySelectorAll('.stem');
		for (let i = 2; i < 7; i++) rows[i].querySelector('.m').click();
		await new Promise((r) => setTimeout(r, 1200));
		const a1 = S.active;
		for (let i = 2; i < 7; i++) rows[i].querySelector('.m').click();
		await new Promise((r) => setTimeout(r, 1200));
		return [a1, S.active];
	});
	ok('mute: muted stems are not computed, unmuting restores them', act[0] === 2 && act[1] === 7, `active stems with 5 muted: ${act[0]}, after unmute: ${act[1]}`);
	// waveform draw cost, 7 stems
	const wf = await page.evaluate(() => {
		const v = window.__fab.view, out = {};
		for (const span of [38.4, 10, 2, 0.3]) {
			v.setView(5, span); const t0 = performance.now(); for (let i = 0; i < 100; i++) v.draw(); out[span] = (performance.now() - t0) / 100;
		}
		return out;
	});
	ok('waveform draw time, 7 stacked tracks (ms/frame)', Object.values(wf).every((x) => x < 8), Object.entries(wf).map(([k, x]) => `${k}s view: ${x.toFixed(2)}`).join('  '));
	await page.close();
}

// ------------------------------------------------------------ 3. memory: 7 stems x 5 min
for (const kind of ['i16', 'f32']) {
	const page = await fresh();
	const base = rssMB();
	await page.selectOption('#mem', kind);
	await page.click('#btn-demo-long');
	await page.waitForFunction(() => window.S && S.stems.length === 7 && S.duration > 300, null, { timeout: 180000 });
	await sleep(1500);
	await page.evaluate(() => { for (let i = 0; i < 3; i++) gc(); });
	await sleep(1500);
	const m = await page.evaluate(() => {
		const t = { store: 0 };
		for (const s of S.stems) { for (const c of s.store.chunks) t.store += c.l.byteLength + (c.r ? c.r.byteLength : 0); }
		return { store: t.store, dur: S.duration, heap: performance.memory.usedJSHeapSize, sr: S.sr, mono: S.stems.map((s) => s.store.mono) };
	});
	// worst-case equivalent: 7 stereo float32 stems at 44.1 kHz
	const eq = 7 * 300 * 44100 * 2 * 4;
	const rss = rssMB();
	ok(`memory ${kind}: 7 stems x ${m.dur.toFixed(0)} s @ ${m.sr} Hz`, true, `audio store ${(m.store / 1048576).toFixed(0)} MB (all-stereo float32 would be ${(7 * m.dur * m.sr * 8 / 1048576).toFixed(0)} MB), JS heap ${(m.heap / 1048576).toFixed(0)} MB, browser RSS ${rss.toFixed(0)} MB (blank page ${base.toFixed(0)} MB), mono stems: ${m.mono.filter(Boolean).length}/7`);
	if (kind === 'i16') {
		// play the long demo with 7 stems to check stability and load
		const r = await page.evaluate(async () => {
			const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
			set('semi', 3); set('tempo', 80);
			const f = window.__fab; f.seek(100); await f.play();
			await new Promise((r) => setTimeout(r, 6000));
			const us = S.ctx.playbackStats ? S.ctx.playbackStats.underrunEvents : -1;
			return { pos: S.pos, load: S.loadRecent.slice(-20), us, underruns: S.underruns, missing: S.missing };
		});
		ok('long demo plays (7 stems, +3 st, 80 %)', r.pos > 103 && r.missing === 0, `position ${r.pos.toFixed(1)} s, load ${(r.load.reduce((a, b) => a + b, 0) / r.load.length * 100).toFixed(1)} %, underruns ${r.underruns}, playbackStats underrunEvents ${r.us}`);
	}
	await page.close();
}

// ------------------------------------------------------------ 4. compressed (Opus) mode: 7 stems x 5 min at 48 kHz
{
	const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	page.on('filechooser', (fc) => fc.setFiles([]));
	await page.goto(url + '/spikes/lecteur/?sr=48000');
	const base = rssMB();
	await page.selectOption('#mem', 'opus');
	await page.click('#btn-demo-long');
	await page.waitForFunction(() => window.S && S.stems.length === 7 && S.duration > 300, null, { timeout: 240000 });
	await sleep(1500);
	await page.evaluate(() => { for (let i = 0; i < 3; i++) gc(); });
	await sleep(1500);
	const m = await page.evaluate(async () => {
		const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
		const f = window.__fab;
		set('semi', -5); set('tempo', 60);
		f.seek(100); await f.play();
		await new Promise((r) => setTimeout(r, 4000));
		const us0 = S.ctx.playbackStats.underrunEvents;
		const pos1 = S.pos; const miss0 = S.missing;
		// jump far away while playing, then loop a bar elsewhere
		f.seek(200);
		await new Promise((r) => setTimeout(r, 2500));
		S.loop = { start: 230.4, end: 232.8, enabled: true }; f.view.setLoop(S.loop);
		S.node.port.postMessage({ type: 'loop', enabled: true, start: 230.4 * S.sr, end: 232.8 * S.sr });
		f.seek(230.0);
		await new Promise((r) => setTimeout(r, 7000));
		const missMid = S.missing;
		await new Promise((r) => setTimeout(r, 3000));
		const us1 = S.ctx.playbackStats.underrunEvents;
		let resident = 0, opusBytes = 0;
		for (const s of S.stems) { resident += s.opus.resident.size; opusBytes += s.opus.enc.bytes; }
		return { missMid, missEnd: S.missing, sr: S.sr, encodeMs: S.encodeMs, opusBytes, resident, pos1, pos: S.pos, us0, us1, underruns: S.underruns, missing: S.missing, errors: S.errors, active: S.active,
			load: S.loadRecent.slice(-20), heap: performance.memory.usedJSHeapSize };
	});
	const rss = rssMB();
	ok('opus mode: 7 stems x 307 s, memory', true, `Opus data ${(m.opusBytes / 1048576).toFixed(1)} MB, resident chunks ${m.resident} (${(m.resident * 32768 * 2 * 1.5 / 1048576).toFixed(0)} MB approx), JS heap ${(m.heap / 1048576).toFixed(0)} MB, browser RSS ${rss.toFixed(0)} MB (blank page ${base.toFixed(0)} MB), encoding took ${(m.encodeMs / 1000).toFixed(1)} s in total`);
	ok('opus mode: playback, far seek and loop', m.errors.length === 0 && m.pos > 229 && m.pos < 233 && m.resident > 20 && m.missEnd - m.missMid < 10, `position ${m.pos.toFixed(1)} s, chunk misses ${m.missing} (${m.missEnd - m.missMid} in the last 3 s of looping, after a 7 s catch-up following the far seek), underruns ${m.underruns}, playbackStats underrunEvents ${m.us0} -> ${m.us1}, load ${(m.load.reduce((a, b) => a + b, 0) / m.load.length * 100).toFixed(1)} %, errors ${JSON.stringify(m.errors)}`);
	// export a loop in opus mode
	const ex = await page.evaluate(async () => {
		window.__keepExport = true;
		document.getElementById('exp-scope').value = 'loop';
		await window.exportWav();
		const x = window.__lastExport;
		let pk = 0; for (let i = 0; i < x.ch0.length; i++) pk = Math.max(pk, Math.abs(x.ch0[i]));
		return { secs: x.secs, speed: x.speed, pk, state: document.getElementById('exp-state').textContent.slice(0, 200) };
	});
	ok('opus mode: offline export of the loop', Math.abs(ex.secs - 2.4 / 0.6) < 0.05 && ex.pk > 0.05, `${ex.secs.toFixed(2)} s (expected 4.00), peak ${ex.pk.toFixed(2)}, ${ex.speed.toFixed(1)}x realtime`);
	await page.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} FAILED` : '\nall browser checks passed');
process.exit(failed ? 1 : 0);
