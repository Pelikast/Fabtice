// Automated checks of the player core with every engine (Node, real WebAssembly engines).
//   node tests/checks.mjs [engine ...]      e.g. node tests/checks.mjs signalsmith rubberband-r3
// Exit code 1 if a check fails. Quality by ear is NOT covered here.
import { makeCore, stemFromFloat, run, sine, zeroCrossFreq, cents, pulses, findBursts, SR, ENGINES } from './helpers.mjs';
import { N } from '../src/core.js';

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENGINES);
let failed = 0;
const rows = [];
// `informational`: a known limitation of the engine, reported but not counted as a failure of the prototype.
// Strict engines (the two candidates for live / export use) must pass; the others are reported for the comparison
// (e.g. SoundTouch repeats transients at slow tempo, the Signalsmith "cheaper" preset ripples at tempo != 100 %).
const STRICT = new Set(['signalsmith', 'rubberband-r3']);
function check(engine, name, ok, detail, informational = false) {
	informational = informational || !STRICT.has(engine);
	if (!ok && !informational) failed++;
	rows.push({ engine, name, ok, detail });
	console.log(`${ok ? 'PASS' : informational ? 'KNOWN' : 'FAIL'}  ${engine.padEnd(18)} ${name.padEnd(46)} ${detail}`);
}
const EXACT = new Set(['signalsmith', 'signalsmith-cheap']);
const q = (sec) => Math.round(sec * SR / N);
function harmonic(f0, sec) {
	const n = Math.round(sec * SR), a = new Float32Array(n);
	for (let k = 1; k <= 12; k++) for (let i = 0; i < n; i++) a[i] += (0.3 / k) * Math.sin(2 * Math.PI * f0 * k * i / SR + k);
	return a;
}
// fundamental by autocorrelation with parabolic refinement
function f0auto(x, from, len, fexp) {
	const lagMin = Math.floor(SR / (fexp * 1.25)), lagMax = Math.ceil(SR / (fexp * 0.8));
	const r = new Float64Array(lagMax + 2);
	for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) { let s = 0; for (let i = from; i < from + len; i++) s += x[i] * x[i + lag]; r[lag] = s; }
	let best = lagMin; for (let lag = lagMin; lag <= lagMax; lag++) if (r[lag] > r[best]) best = lag;
	const d = 0.5 * (r[best - 1] - r[best + 1]) / (r[best - 1] - 2 * r[best] + r[best + 1]);
	return SR / (best + d);
}

for (const key of keys) {
	// ---------------------------------------------------------------- A. pitch accuracy
	for (const [semi, rate] of [[12, 1], [-12, 1], [5, 1], [-5, 1], [7.37, 1], [5, 0.55], [-7, 0.55], [12, 0.55], [-12, 0.55], [3, 1.5]]) {
		const core = await makeCore(key);
		const f0 = 220, x = sine(f0, 14);
		core.addStem(stemFromFloat(x, x));
		core.semitones = semi; core.rate = core.rateTarget = rate;
		core.play();
		const { L } = run(core, q(8));
		const f = zeroCrossFreq(L, 4 * SR, 7.5 * SR);
		const err = cents(f, f0 * 2 ** (semi / 12));
		// Pure low sines are the worst case for phase vocoders: 25 cents is the bar, harmonic tones below must be much tighter.
		check(key, `sine ${semi >= 0 ? '+' : ''}${semi} st @ rate ${rate}`, Math.abs(err) < 25, `${f.toFixed(2)} Hz, error ${err.toFixed(2)} cents`);
	}
	for (const [semi, rate] of [[-7, 0.55], [5, 0.55], [12, 0.55], [-12, 1], [7, 1]]) {
		const core = await makeCore(key);
		const f0 = 110, x = harmonic(f0, 14);
		core.addStem(stemFromFloat(x, x));
		core.semitones = semi; core.rate = core.rateTarget = rate; core.play();
		const { L } = run(core, q(8));
		const fe = f0 * 2 ** (semi / 12), f = f0auto(L, 4 * SR, 24000, fe);
		check(key, `harmonic tone 110 Hz ${semi >= 0 ? '+' : ''}${semi} st @ rate ${rate}`, Math.abs(cents(f, fe)) < 8, `error ${cents(f, fe).toFixed(2)} cents`);
	}

	// ---------------------------------------------------------------- B. tempo: position of bursts, no drift
	for (const rate of [0.55, 1, 1.5, 2]) {
		const core = await makeCore(key);
		const times = []; for (let t = 1; t < 30; t += 1) times.push(t);
		const x = pulses(32, times);
		core.addStem(stemFromFloat(x, x));
		core.rate = core.rateTarget = rate; core.play();
		const secOut = 26 / rate;
		const { L } = run(core, q(secOut));
		const found = findBursts(L, 0.15);
		let maxErr = 0, n = 0;
		for (let i = 0; i < found.length; i++) {
			const t = times[i]; if (t * SR + 3000 >= core.ip + 1e9) break;
			const expect = (t * SR + 72) / rate + core.latencyOut(rate); // 72 = burst centre (1.5 ms) in frames
			const err = (found[i] - expect) / SR * 1000;
			if (Math.abs(err) > Math.abs(maxErr)) maxErr = err; n++;
		}
		const spacing = (found[found.length - 1] - found[0]) / (found.length - 1) / SR;
		check(key, `tempo rate ${rate}: burst spacing`, Math.abs(spacing * rate - 1) < 0.0005 && found.length >= times.length - 6, `spacing ${spacing.toFixed(5)} s (expected ${(1 / rate).toFixed(5)}), ${found.length} bursts`);
		check(key, `tempo rate ${rate}: absolute position vs latency model`, Math.abs(maxErr) < 12, `max error ${maxErr.toFixed(2)} ms over ${n} bursts (L = ${(core.latencyOut(rate) / SR * 1000).toFixed(1)} ms)`);
	}

	// ---------------------------------------------------------------- B2. cursor integral (no drift when the rate moves)
	{
		const core = await makeCore(key);
		const x = sine(200, 160); core.addStem(stemFromFloat(x, x));
		core.play();
		let sum = 0;
		const rates = [1, 0.6, 1.3, 0.4, 2, 0.75];
		run(core, q(60), (qi) => {
			if (qi % 600 === 0) core.setRate(rates[(qi / 600 | 0) % rates.length]);
			if (qi >= 1) sum += core.rate; // rate used by the previous quantum
		});
		// the last quantum's rate is not yet in `sum`; cursor = sum_of_used_rates * N
		const used = sum + core.rate;
		check(key, 'cursor = integral of tempo (no drift)', Math.abs(core.cursor - used * N) < 1.5 && !core.ended, `cursor ${core.cursor.toFixed(2)} vs integral ${(used * N).toFixed(2)} frames over ${q(60)} quanta`);
	}

	// ---------------------------------------------------------------- C. stems stay aligned (different pitch / no-transpose)
	{
		const core = await makeCore(key);
		const times = []; for (let t = 0.8; t < 14; t += 0.7) times.push(t);
		const names = [];
		for (let k = 0; k < 7; k++) {
			const x = pulses(16, times, SR, 0.8, 1500 + 250 * k);
			core.addStem(stemFromFloat(x, k % 2 ? x : null || x));
			core.stems[k].noTranspose = k === 1 || k === 4;
			names.push(k);
		}
		core.semitones = 5; core.rate = core.rateTarget = 0.8;
		const perStem = Array.from({ length: 7 }, () => []);
		let qi = 0;
		core.onStem = (si, l) => { for (let i = 0; i < N; i++) perStem[si].push(l[i]); };
		core.play();
		run(core, q(14));
		const centres = perStem.map((arr) => findBursts(Float32Array.from(arr), 0.2));
		const m = Math.min(...centres.map((c) => c.length));
		let spread = 0;
		for (let i = 0; i < m; i++) {
			const v = centres.map((c) => c[i]);
			spread = Math.max(spread, (Math.max(...v) - Math.min(...v)) / SR * 1000);
		}
		check(key, 'stems aligned (5 transposed + 2 not, rate 0.8)', m >= 10 && spread < 2.5, `max spread between stems ${spread.toFixed(2)} ms over ${m} bursts`, !EXACT.has(key));
		// same, with a different pitch per stem
		const core2 = await makeCore(key);
		for (let k = 0; k < 4; k++) { const x = pulses(16, times, SR, 0.8, 1500 + 250 * k); core2.addStem(stemFromFloat(x, x)); }
		const per2 = Array.from({ length: 4 }, () => []);
		core2.onStem = (si, l) => { for (let i = 0; i < N; i++) per2[si].push(l[i]); };
		core2.rate = core2.rateTarget = 1;
		core2.semitones = -3; core2.stems[1].noTranspose = true;
		core2.play(); run(core2, q(14));
		const c2 = per2.map((arr) => findBursts(Float32Array.from(arr), 0.2));
		const m2 = Math.min(...c2.map((c) => c.length));
		let spread2 = 0;
		for (let i = 0; i < m2; i++) { const v = c2.map((c) => c[i]); spread2 = Math.max(spread2, (Math.max(...v) - Math.min(...v)) / SR * 1000); }
		check(key, 'stems aligned (4 stems, -3 st, one untransposed, rate 1)', m2 >= 10 && spread2 < 2.5, `max spread ${spread2.toFixed(2)} ms`, !EXACT.has(key));
	}

	// ---------------------------------------------------------------- D. loop boundaries: continuity and drift
	for (const [rate, semi] of [[1, 0], [0.7, 0], [1.25, 0], [0.7, 5]]) {
		const mk = async (noXf) => {
			const core = await makeCore(key);
			const x = sine(330, 20, SR, 0.5);
			core.addStem(stemFromFloat(x, x));
			core.setLoop(true, Math.round(0.5 * SR) + 37, Math.round(2.1 * SR) + 501);
			core.noCrossfade = noXf;
			core.rate = core.rateTarget = rate; core.semitones = semi;
			core.ip = core.loop.start - 5000; // approach the loop from outside
			core.play();
			const { L } = run(core, q(14));
			// discontinuity metric: second difference peak vs RMS, ignoring the first second (latency, start-up)
			let mx = 0, s2 = 0, cnt = 0;
			for (let i = SR + 2; i < L.length; i++) {
				const r = L[i] - 2 * L[i - 1] + L[i - 2];
				mx = Math.max(mx, Math.abs(r)); s2 += r * r; cnt++;
			}
			return mx / Math.sqrt(s2 / cnt);
		};
		const withXf = await mk(false), without = await mk(true);
		check(key, `loop wrap continuity, rate ${rate}, ${semi} st`, withXf < 4.5, `peak/rms of 2nd difference: ${withXf.toFixed(2)} with crossfade (naive wrap: ${without.toFixed(2)}; pure sine = 1.41)`);
	}
	{
		// drift: one marker per loop at a known source frame, 40 loops at rate 0.6
		const core = await makeCore(key);
		const loopStart = Math.round(0.5 * SR) + 37, loopEnd = Math.round(1.3 * SR) + 501; // arbitrary, not beat-aligned
		const len = loopEnd - loopStart;
		const marker = pulses(3, [(loopStart + 6000) / SR]);
		core.addStem(stemFromFloat(marker, marker));
		core.setLoop(true, loopStart, loopEnd);
		core.rate = core.rateTarget = 0.6;
		core.ip = loopStart - 3000;
		core.play();
		const { L } = run(core, q(60));
		const b = findBursts(L, 0.2);
		const period = len / 0.6;
		// error of each repetition against the ideal period; drift = slope of a line fitted through them
		const err = b.map((v, i) => v - b[0] - i * period);
		const m = err.length, mi = (m - 1) / 2, me = err.reduce((a, c) => a + c, 0) / m;
		let sxy = 0, sxx = 0; err.forEach((e, i) => { sxy += (i - mi) * (e - me); sxx += (i - mi) ** 2; });
		const slope = sxy / sxx; // frames per repetition
		const resid = Math.max(...err.map((e, i) => Math.abs(e - (me + slope * (i - mi)))));
		check(key, 'loop: no drift over many repetitions (rate 0.6)', m >= 30 && Math.abs(slope * m) < 6 && resid < 80, `${m} repetitions of ${(period / SR * 1000).toFixed(2)} ms: drift ${(slope * m).toFixed(2)} frames total, jitter +-${resid.toFixed(0)} frames (${(resid / SR * 1000).toFixed(2)} ms, engine hop quantisation)`);
	}
	{
		// tempo change in the middle of a loop: continuity
		const trial = async (withLoop) => {
			const core = await makeCore(key);
			const x = sine(260, 60); core.addStem(stemFromFloat(x, x));
			if (withLoop) { core.setLoop(true, Math.round(0.5 * SR) + 11, Math.round(2.5 * SR) + 333); core.ip = core.loop.start - 4000; }
			core.play();
			const { L } = run(core, q(16), (qi) => { if (qi === q(5)) core.setRate(0.5); if (qi === q(9)) core.setRate(1.6); if (qi === q(12)) core.setRate(0.8); });
			let mx = 0, s2 = 0, cnt = 0;
			for (let i = SR + 2; i < L.length; i++) { const r = L[i] - 2 * L[i - 1] + L[i - 2]; mx = Math.max(mx, Math.abs(r)); s2 += r * r; cnt++; }
			return mx / Math.sqrt(s2 / cnt);
		};
		const withLoop = await trial(true), baseline = await trial(false);
		check(key, 'loop + tempo changes mid-loop: continuity', withLoop < baseline * 1.5 + 0.5, `peak/rms of 2nd difference: ${withLoop.toFixed(2)} looping vs ${baseline.toFixed(2)} same tempo changes without a loop`);
	}

	// ---------------------------------------------------------------- E. metronome on the stretched timeline (irregular beats)
	for (const [rate, loop] of [[0.6, false], [1.3, false], [0.75, true]]) {
		const beats = []; let t = 1.0, iv = 0.5;
		for (let i = 0; i < 60; i++) { beats.push(t); t += iv; iv = 0.5 + 0.12 * Math.sin(i / 3); } // tempo varies beat to beat
		const x = pulses(40, beats);
		const run1 = async (metro) => {
			const core = await makeCore(key);
			core.addStem(stemFromFloat(x, x));
			core.rate = core.rateTarget = rate;
			if (loop) { core.setLoop(true, Math.round(beats[4] * SR), Math.round(beats[12] * SR)); core.ip = Math.round(beats[2] * SR); }
			core.metro.enabled = metro; core.metro.vol = 1;
			core.setBeats(Float64Array.from(beats.map((b) => b * SR)), Uint8Array.from(beats.map((_, i) => (i % 4 === 0 ? 1 : 0))));
			if (metro) core.stems[0].mute = true;
			core.play();
			return run(core, q(loop ? 20 : 30 / rate)).L;
		};
		const stemOut = await run1(false), clickOut = await run1(true);
		const onsets = (a, thr) => { const o = []; let last = -1e9; for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > thr && i - last > 2000) { o.push(i); last = i; } else if (Math.abs(a[i]) > thr) last = i; return o; };
		const so = onsets(stemOut, 0.04), co = onsets(clickOut, 0.04);
		let worst = 0, n = Math.min(so.length, co.length);
		// compare the k-th onset of each (both start from the same cursor)
		for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(so[i] - co[i]));
		check(key, `metronome vs stems, irregular beats, rate ${rate}${loop ? ', looping' : ''}`, n >= 8 && worst / SR * 1000 < 6, `${so.length} stem bursts, ${co.length} clicks, max offset ${(worst / SR * 1000).toFixed(2)} ms`);
	}
}

console.log(`\n${rows.length - failed}/${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
