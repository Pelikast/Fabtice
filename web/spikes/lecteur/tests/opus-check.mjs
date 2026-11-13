// Checks the Opus chunk decoder: alignment with the source, quality, size and speed (Chromium WebCodecs).
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';
const { chromium } = createRequire('/opt/node-tools/')('playwright');
const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url + '/spikes/lecteur/');
const r = await page.evaluate(async () => {
	const { encodeOpus, OpusReader } = await import('./opus.js');
	const { synthDemo } = await import('./demo.js');
	const sr = 48000, demo = synthDemo(sr);
	const st = demo.stems.find((s) => s.name === 'Piano'); // stereo
	const t0 = performance.now();
	const enc = await encodeOpus(st.l, st.r, sr, 96000);
	const encMs = performance.now() - t0;
	const rd = new OpusReader(enc, false);
	const out = { frames: st.l.length, bytes: enc.bytes, secs: st.l.length / sr, encMs, chunks: [] };
	for (const ci of [0, 1, 7, 20, 55]) {
		const t1 = performance.now();
		const c = await rd.decodeChunk(ci);
		const ms = performance.now() - t1;
		// compare against the original with lags -400..400 to find the alignment; SNR at best lag
		const s0 = ci * 32768, n = Math.min(32768, st.l.length - s0);
		let best = { lag: 0, snr: -1e9 };
		for (let lag = -400; lag <= 400; lag += 1) {
			let num = 0, den = 0;
			for (let i = 2000; i < n - 2000; i += 3) { const a = st.l[s0 + i + lag] || 0, b = c.l[i] / 32768; num += a * a; den += (a - b) * (a - b); }
			const snr = 10 * Math.log10(num / (den + 1e-12));
			if (snr > best.snr) best = { lag, snr };
		}
		out.chunks.push({ ci, ms: +ms.toFixed(1), lag: best.lag, snr: +best.snr.toFixed(1) });
	}
	return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); srv.close();
