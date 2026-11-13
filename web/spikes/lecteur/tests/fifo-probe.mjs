// Diagnostic: how bursty is the Rubber Band output (FIFO fill after each 128-frame call)?
import { loadEngine, SR } from './helpers.mjs';
for (const key of ['rubberband-r3', 'rubberband-r2']) {
	for (const [semi, rate] of [[0, 1], [5, 1], [0, 0.55], [-7, 0.55], [5, 1.6]]) {
		const { engine } = await loadEngine(key);
		const x = engine.x, p = x.fe_create(SR, 2, engine.variant);
		x.fe_reset(p);
		x.fe_set(p, semi, rate, 0);
		const fill = [];
		let acc = 0;
		const inIdx = x.fe_in(p) >> 2;
		for (let q = 0; q < 800; q++) {
			acc += 128 * rate; const nIn = Math.floor(acc); acc -= nIn;
			const h = engine.heap();
			for (let i = 0; i < nIn; i++) { const v = 0.3 * Math.sin(i * 0.1 + q); h[inIdx + i] = v; h[inIdx + engine.cap + i] = v; }
			const n = x.fe_process(p, nIn, 128);
			fill.push(x.fe_fifo(p));
		}
		const tail = fill.slice(200);
		console.log(key, 'semi', semi, 'rate', rate, 'fifo after pop: min', Math.min(...tail), 'max', Math.max(...tail), 'first nonzero at quantum', fill.findIndex((v) => v > 0));
	}
}
