// Shared helpers for the Node checks: engine loading, signal generators, running the player core.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WasmEngine, SoundTouchEngine, calibrateLatency } from '../src/engines.js';
import { PlayerCore, StemData, CHUNK, CHUNK_BITS, N } from '../src/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SR = 48000;

export const ENGINES = {
	'signalsmith': { wasm: 'signalsmith', variant: 0, label: 'Signalsmith (defaut)' },
	'signalsmith-cheap': { wasm: 'signalsmith', variant: 1, label: 'Signalsmith (econome)' },
	'rubberband-r3': { wasm: 'rubberband', variant: 0, label: 'Rubber Band R3' },
	'rubberband-r2': { wasm: 'rubberband', variant: 1, label: 'Rubber Band R2' },
	'soundtouch': { js: true, label: 'SoundTouch JS' },
};

const modCache = new Map();
export async function loadEngine(key, sr = SR, simd = true) {
	const def = ENGINES[key];
	if (def.js) return { engine: new SoundTouchEngine(sr), name: key };
	const file = path.join(here, '..', 'engines', def.wasm + (simd ? '' : '-nosimd') + '.wasm');
	if (!modCache.has(file)) modCache.set(file, await WebAssembly.compile(fs.readFileSync(file)));
	return { engine: await WasmEngine.load(modCache.get(file), sr, def.variant), name: key };
}

export async function makeCore(key, { sr = SR, simd = true, calibrate = true } = {}) {
	const { engine, name } = await loadEngine(key, sr, simd);
	const core = new PlayerCore(sr);
	const lat = calibrate ? calibrateLatency(engine, sr) : { a: 0, b: 0 };
	core.setEngine(engine, name, lat);
	return core;
}

/** Float arrays -> StemData (Int16 chunks). */
export function stemFromFloat(l, r, kind = 'i16') {
	const frames = l.length;
	const mono = !r || r === l;
	const d = new StemData(frames, mono, kind);
	for (let c = 0; c < d.chunks.length; c++) {
		const s = c << CHUNK_BITS, n = Math.min(CHUNK, frames - s);
		const mk = (src) => {
			const a = kind === 'i16' ? new Int16Array(CHUNK) : new Float32Array(CHUNK);
			for (let i = 0; i < n; i++) a[i] = kind === 'i16' ? Math.max(-32768, Math.min(32767, Math.round(src[s + i] * 32768))) : src[s + i];
			return a;
		};
		const cl = mk(l);
		d.chunks[c] = { l: cl, r: mono ? null : mk(r) };
	}
	return d;
}

/** Runs the core for `quanta` render calls and returns the concatenated stereo output. */
export function run(core, quanta, each) {
	const L = new Float32Array(quanta * N), R = new Float32Array(quanta * N);
	const bl = new Float32Array(N), br = new Float32Array(N);
	for (let q = 0; q < quanta; q++) {
		if (each) each(q);
		core.render(bl, br);
		L.set(bl, q * N); R.set(br, q * N);
	}
	return { L, R };
}

export function sine(freq, seconds, sr = SR, amp = 0.5) {
	const n = Math.round(seconds * sr), a = new Float32Array(n);
	for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * freq * i / sr);
	return a;
}

/** Frequency from rising zero crossings with linear interpolation over [from, to). */
export function zeroCrossFreq(x, from, to, sr = SR) {
	let first = -1, last = -1, count = 0;
	for (let i = Math.max(1, from); i < to; i++) {
		if (x[i - 1] < 0 && x[i] >= 0) {
			const t = i - 1 + (0 - x[i - 1]) / (x[i] - x[i - 1]);
			if (first < 0) first = t;
			last = t; count++;
		}
	}
	return count > 1 ? (count - 1) * sr / (last - first) : 0;
}

export const cents = (f, ref) => 1200 * Math.log2(f / ref);

/** Bursts: 3 ms raised-cosine tone burst starting at each time (seconds). */
export function pulses(seconds, times, sr = SR, amp = 0.8, freq = 2000) {
	const n = Math.round(seconds * sr), a = new Float32Array(n), len = Math.round(0.003 * sr);
	for (const t of times) {
		const s = Math.round(t * sr);
		for (let i = 0; i < len && s + i < n; i++) a[s + i] += amp * Math.sin(Math.PI * i / len) ** 2 * Math.sin(2 * Math.PI * freq * i / sr);
	}
	return a;
}

/** Finds bursts: energy-weighted centre (frame index) of each group of samples above thr. */
export function findBursts(x, thr, minGap = 2400, from = 0, to = x.length) {
	const out = [];
	let i = from;
	while (i < to) {
		if (Math.abs(x[i]) > thr) {
			let j = i, last = i, num = 0, den = 0;
			while (j < to && j - last < minGap / 2) {
				const a = Math.abs(x[j]);
				if (a > thr * 0.3) { last = j; num += a * a * j; den += a * a; }
				j++;
			}
			out.push(num / den);
			i = j;
		} else i++;
	}
	return out;
}
