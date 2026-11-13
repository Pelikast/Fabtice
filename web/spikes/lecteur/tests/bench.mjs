// CPU cost per stereo stem of each engine on the synthesized demo band (Node, single thread, this sandbox's CPU).
//   node tests/bench.mjs [seconds]
// Reports % of one core needed in real time (CPU time / audio time) for 1 stem and for 7 stems.
import { makeCore, stemFromFloat, run, SR, ENGINES } from './helpers.mjs';
import { synthDemo } from '../demo.js';
import { N } from '../src/core.js';

const seconds = +process.argv[2] || 10;
const demo = synthDemo(SR);
const mkStems = (core, n) => {
	for (let i = 0; i < n; i++) { const s = demo.stems[i % demo.stems.length]; core.addStem(stemFromFloat(s.l, s.r || s.l)); }
};
const configs = [
	{ label: 'tempo 100 %, 0 st (reference)', rate: 1, semi: 0 },
	{ label: '100 %, +5 st', rate: 1, semi: 5 },
	{ label: '55 %, +5 st', rate: 0.55, semi: 5 },
	{ label: '55 %, -12 st', rate: 0.55, semi: -12 },
];
const variants = [['signalsmith', true], ['signalsmith', false], ['signalsmith-cheap', true], ['rubberband-r3', true], ['rubberband-r3', false], ['rubberband-r2', true], ['soundtouch', true]];
console.log('engine'.padEnd(20) + configs.map((c) => c.label.padEnd(30)).join(''));
for (const [key, simd] of variants) {
	let line = (key + (ENGINES[key].wasm ? (simd ? ' simd' : ' nosimd') : '')).padEnd(20);
	for (const c of configs) {
		const res = [];
		for (const nst of [1, 7]) {
			const core = await makeCore(key, { simd, calibrate: false });
			mkStems(core, nst);
			core.rate = core.rateTarget = c.rate; core.semitones = c.semi;
			core.skipMuted = false;
			core.play();
			run(core, Math.round(2 * SR / N)); // warm-up
			// CPU time of the process (not wall time): this sandbox is shared with other jobs, wall time would be inflated
			const c0 = process.cpuUsage();
			run(core, Math.round(seconds * SR / N));
			const c1 = process.cpuUsage(c0);
			res.push((c1.user + c1.system) / 1e6 / seconds * 100);
		}
		line += `1 stem ${res[0].toFixed(1)}% | 7 stems ${res[1].toFixed(0)}%`.padEnd(30);
	}
	console.log(line);
}
