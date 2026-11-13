// Player core: transport, loop feeder, per-stem stretching and mixing, metronome.
// No Web Audio dependency: the AudioWorklet processor calls render() once per
// 128-frame quantum, and the Node tests call it directly.
//
// Timeline model
//   - Source time is measured in frames of the stems. The "cursor" is the source position
//     that has been *fed* to the stretchers: ip (integer) + acc (fraction).
//   - Each output quantum of N frames consumes N * rate source frames (rate = tempo ratio,
//     smoothed). The integer part goes to the engines, the fraction is carried in acc, so the
//     long-run position never drifts whatever the rate does.
//   - All stems read the same cursor and produce exactly N output frames per quantum, so they stay
//     aligned by construction (exact engines) or by calibrated latency (streaming engines).
//   - Loops are handled on the *input* side: the virtual input stream wraps from loop end to loop
//     start with a short equal-power crossfade, so the stretchers see a continuous signal.
//   - Heard position = cursor - (a * rate + b), from the engine latency model L(rate) = a + b / rate.

export const N = 128;
export const CHUNK_BITS = 15;
export const CHUNK = 1 << CHUNK_BITS;

const timeNow = (typeof performance !== 'undefined' && performance.now)
	? () => performance.now() : () => Date.now();
export const HAS_HIRES_TIMER = typeof performance !== 'undefined' && !!performance.now;

// ---------------------------------------------------------------- stem storage
/** Audio of one stem, as fixed-size chunks (Int16 or Float32), mono stored once. */
export class StemData {
	constructor(frames, mono, kind) {
		this.frames = frames; this.mono = mono; this.kind = kind; // kind: 'i16' | 'f32'
		this.chunks = new Array(Math.ceil(frames / CHUNK)).fill(null);
		this.missing = 0; this.missingSet = new Set();
	}
	get bytes() {
		let b = 0;
		const bpe = this.kind === 'i16' ? 2 : 4;
		for (const c of this.chunks) if (c) b += (c.l.length + (c.r && c.r !== c.l ? c.r.length : 0)) * bpe;
		return b;
	}
}

function zero(dl, dr, off, n) { dl.fill(0, off, off + n); dr.fill(0, off, off + n); }

/** Reads n frames starting at source frame `start` (may be out of range: zeros) into dl/dr[off..]. */
export function readStem(stem, start, n, dl, dr, off) {
	let i = 0;
	const frames = stem.frames;
	if (start < 0) { const z = Math.min(n, -start); zero(dl, dr, off, z); i = z; }
	const K = 1 / 32768;
	while (i < n) {
		const f = start + i;
		if (f >= frames) { zero(dl, dr, off + i, n - i); break; }
		const ci = f >> CHUNK_BITS, co = f & (CHUNK - 1);
		const cnt = Math.min(n - i, CHUNK - co, frames - f);
		const ch = stem.chunks[ci];
		if (!ch) {
			zero(dl, dr, off + i, cnt);
			stem.missing++; stem.missingSet.add(ci);
		} else if (stem.kind === 'i16') {
			const L = ch.l, R = ch.r || ch.l, o = off + i;
			for (let j = 0; j < cnt; j++) { dl[o + j] = L[co + j] * K; dr[o + j] = R[co + j] * K; }
		} else {
			const L = ch.l, R = ch.r || ch.l;
			dl.set(L.subarray(co, co + cnt), off + i);
			dr.set(R.subarray(co, co + cnt), off + i);
		}
		i += cnt;
	}
}

// ---------------------------------------------------------------- click sounds
function makeClick(sr, freq, amp) {
	const len = Math.round(0.045 * sr), b = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / sr;
		b[i] = amp * Math.exp(-t * 110) * Math.sin(2 * Math.PI * freq * t) * Math.min(1, i / 8);
	}
	return b;
}

// ---------------------------------------------------------------- core
export class PlayerCore {
	constructor(sampleRate, opts = {}) {
		this.sr = sampleRate;
		this.stems = [];
		this.engine = null;          // engine object (create() -> stem processor)
		this.engineName = '';
		this.lat = { a: 0, b: 0 };   // latency model of the current engine
		this.skipMuted = opts.skipMuted !== false;

		this.playing = false;
		this.ip = 0; this.acc = 0;
		this.rate = 1; this.rateTarget = 1;
		this.semitones = 0; this.formant = false;
		this.master = 0.8;
		this.mg = 0; this.mgTarget = 0; this.afterFade = null; // master fade (click-free play/pause/seek)
		this.loop = { enabled: false, start: 0, end: 0, len: 0, xf: 0, cos: null, sin: null };

		this.metro = { enabled: false, vol: 0.5, frames: new Float64Array(0), accents: new Uint8Array(0), bi: 0, resync: true };
		this.clickN = makeClick(sampleRate, 1000, 0.8);
		this.clickA = makeClick(sampleRate, 1600, 1.0);
		this.clicks = [];            // {f: absolute output frame, acc: bool}
		this.outFrame = 0;

		this.inL = new Float32Array(1024); this.inR = new Float32Array(1024);
		this.t2L = new Float32Array(1024); this.t2R = new Float32Array(1024);
		this.tmpL = new Float32Array(N); this.tmpR = new Float32Array(N);

		this.stat = { quanta: 0, tSum: 0, tMax: 0, over: 0, underruns: 0, budget: N / sampleRate * 1000, wlen: 0, wSum: 0, wMax: 0 };
		this.ended = false;
		this.offlineEnd = -1;        // offline: stop after this many output frames
		this.onStem = null;          // test hook: (stemIndex, outL, outR, gain) after each stem is processed
		this.noCrossfade = false;
		this.immediate = false;      // offline rendering: no fades at start
	}

	// ----- configuration
	setEngine(engine, name, lat) {
		for (const s of this.stems) if (s.proc) { s.proc.destroy(); s.proc = null; }
		this.engine = engine; this.engineName = name; this.lat = lat || { a: 0, b: 0 };
		for (const s of this.stems) { s.proc = engine.create(); s.needPrime = true; }
	}
	addStem(data, name) {
		const s = { data, name, proc: this.engine ? this.engine.create() : null, gain: 0, vol: 1, mute: false, solo: false,
			noTranspose: false, needPrime: true, warm: false, active: false };
		this.stems.push(s);
		return this.stems.length - 1;
	}
	clearStems() {
		for (const s of this.stems) if (s.proc) s.proc.destroy();
		this.stems = [];
	}
	get totalFrames() { let m = 0; for (const s of this.stems) m = Math.max(m, s.data.frames); return m; }

	setLoop(enabled, start, end) {
		const L = this.loop;
		start = Math.max(0, Math.round(start)); end = Math.round(end);
		L.enabled = !!enabled && end - start > 2048;
		L.start = start; L.end = end; L.len = end - start;
		if (L.len > 0) {
			// crossfade: 20 ms, at most a quarter of the loop
			L.xf = Math.max(16, Math.min(Math.round(0.02 * this.sr), L.len >> 2));
			L.cos = new Float32Array(L.xf); L.sin = new Float32Array(L.xf);
			for (let i = 0; i < L.xf; i++) { const w = (i + 0.5) / L.xf; L.cos[i] = Math.cos(w * Math.PI / 2); L.sin[i] = Math.sin(w * Math.PI / 2); }
		}
		this.metro.resync = true;
	}
	setBeats(frames, accents) {
		this.metro.frames = frames; this.metro.accents = accents; this.metro.resync = true;
	}
	setRate(r) { this.rateTarget = Math.max(0.1, Math.min(4, r)); }

	// ----- transport
	play() {
		if (this.playing && this.mgTarget === 1) return;
		this.ended = false;
		if (!this.playing) { this.mg = this.immediate ? 1 : 0; for (const s of this.stems) { s.needPrime = true; s.gain = 0; } this.metro.resync = true; this.clicks.length = 0; }
		this.playing = true; this.mgTarget = 1; this.afterFade = null;
	}
	pause() {
		if (!this.playing) return;
		this.mgTarget = 0; this.afterFade = () => { this.playing = false; };
	}
	seek(frame) {
		frame = Math.max(0, Math.round(frame));
		const apply = () => {
			this.ip = frame; this.acc = 0; this.ended = false;
			for (const s of this.stems) { s.needPrime = true; s.gain = 0; }
			this.metro.resync = true; this.clicks.length = 0;
		};
		if (!this.playing || this.mg < 0.01) { apply(); return; }
		this.mgTarget = 0;
		this.afterFade = () => { apply(); this.mgTarget = 1; this.afterFade = null; };
	}
	get cursor() { return this.ip + this.acc; }
	/** Source position of what is currently audible (frames). */
	heardPos() {
		let h = this.cursor - (this.lat.a * this.rate + this.lat.b);
		const L = this.loop;
		if (L.enabled && h < L.start && this.cursor >= L.start && this.cursor < L.end) h += L.len;
		return Math.max(0, h);
	}
	/** Output latency in frames at the current rate. */
	latencyOut(rate = this.rate) { return this.lat.a + this.lat.b / rate; }

	// ----- input feeding with loop wrap and crossfade
	_fill(stem, ip, n, loopActive, dl, dr) {
		const L = this.loop;
		if (!loopActive) { readStem(stem.data, ip, n, dl, dr, 0); return; }
		const xf = this.noCrossfade ? 0 : L.xf; // noCrossfade: negative control for the tests
		let i = 0, idx = ip;
		while (i < n) {
			if (idx >= L.end) idx -= L.len;
			const seg = Math.min(n - i, L.end - idx);
			readStem(stem.data, idx, seg, dl, dr, i);
			const zs = Math.max(idx, L.end - xf), ze = idx + seg;
			if (ze > zs) {
				const cnt = ze - zs, off = i + (zs - idx);
				readStem(stem.data, zs - L.len, cnt, this.t2L, this.t2R, 0);
				for (let j = 0; j < cnt; j++) {
					const k = zs + j - (L.end - L.xf);
					const g1 = L.cos[k], g2 = L.sin[k];
					dl[off + j] = dl[off + j] * g1 + this.t2L[j] * g2;
					dr[off + j] = dr[off + j] * g1 + this.t2R[j] * g2;
				}
			}
			i += seg; idx += seg;
		}
	}

	// ----- metronome scheduling in the stretched timeline
	_scanBeats(srcA, srcB, outStart, rate) {
		const M = this.metro;
		if (!M.enabled || M.frames.length === 0) return;
		const fr = M.frames;
		if (M.resync) { // binary search first beat >= srcA
			let lo = 0, hi = fr.length;
			while (lo < hi) { const mid = (lo + hi) >> 1; if (fr[mid] < srcA) lo = mid + 1; else hi = mid; }
			M.bi = lo; M.resync = false;
		}
		while (M.bi > 0 && fr[M.bi - 1] >= srcA) M.bi--;
		while (M.bi < fr.length && fr[M.bi] < srcA) M.bi++;
		const lat = this.latencyOut(rate);
		while (M.bi < fr.length && fr[M.bi] < srcB) {
			const i = (fr[M.bi] - srcA) / rate;
			this.clicks.push({ f: Math.round(this.outFrame + outStart + i + lat), acc: M.accents[M.bi] === 1 });
			M.bi++;
		}
	}

	// ----- one quantum
	render(outL, outR) {
		const t0 = timeNow();
		const sr = this.sr;
		outL.fill(0); outR.fill(0);
		if (!this.playing || !this.engine || this.stems.length === 0) { this._stats(t0, false); return; }

		// tempo ratio: smooth (about 25 ms) to avoid steps in the stretchers
		const dr = this.rateTarget - this.rate;
		const maxStep = 0.004;
		this.rate += Math.abs(dr) <= maxStep ? dr : Math.sign(dr) * maxStep;
		const rate = this.rate;

		const L = this.loop;
		const loopActive = L.enabled && this.ip < L.end;
		const accBefore = this.acc;
		this.acc += N * rate;
		const nIn = Math.floor(this.acc); this.acc -= nIn;
		const ip = this.ip;

		// metronome: map the source span consumed by this quantum onto output frames
		if (this.metro.enabled) {
			const c0v = ip + accBefore; // cursor before this quantum
			const span = N * rate;
			if (loopActive && c0v + span >= L.end) {
				const k = (L.end - c0v) / rate; // output frames before the wrap
				this._scanBeats(c0v, L.end, 0, rate);
				this._scanBeats(L.start, L.start + (c0v + span - L.end), k, rate);
			} else this._scanBeats(c0v, c0v + span, 0, rate);
		}

		// master fade state
		const sps = 1 / (0.008 * sr);
		let any = false;

		const anySolo = this.stems.some((s) => s.solo);
		const mixL = this._mixL || (this._mixL = new Float32Array(N));
		const mixR = this._mixR || (this._mixR = new Float32Array(N));
		mixL.fill(0); mixR.fill(0);

		const stepG = N / (0.012 * sr);
		for (const s of this.stems) {
			const audible = !s.mute && (!anySolo || s.solo);
			const target = audible ? s.vol : 0;
			const running = !this.skipMuted || !this.engine.exact || audible || s.gain > 1e-4;
			if (!running) { s.active = false; s.needPrime = true; s.gain = 0; continue; }
			s.active = true;
			const proc = s.proc;
			const semi = s.noTranspose ? 0 : this.semitones;
			proc.setParams(semi, rate, this.formant && !s.noTranspose);
			if (s.needPrime) {
				proc.reset();
				proc.setParams(semi, rate, this.formant && !s.noTranspose);
				if (proc.exact) {
					const pre = Math.min(proc.seekLength, 1024 * 8);
					// pre-roll may exceed the scratch size: feed in the tail only
					const n = Math.min(pre, this.inL.length);
					readStem(s.data, ip - n, n, this.inL, this.inR, 0);
					proc.seek(this.inL, this.inR, n, rate);
				}
				s.needPrime = false; s.warm = proc.exact;
				if (this.immediate) s.gain = target; // offline export: no fade-in
			}
			this._fill(s, ip, nIn, loopActive, this.inL, this.inR);
			const got = proc.process(this.inL, this.inR, nIn, this.tmpL, this.tmpR, N);
			if (got < N) {
				this.tmpL.fill(0, got, N); this.tmpR.fill(0, got, N);
				if (s.warm) this.stat.underruns++;
			} else s.warm = true;
			if (this.onStem) this.onStem(this.stems.indexOf(s), this.tmpL, this.tmpR, s.gain);
			// gain ramp
			const g0 = s.gain;
			let g1 = g0 + Math.max(-stepG, Math.min(stepG, target - g0));
			s.gain = g1;
			const inv = 1 / N;
			for (let i = 0; i < N; i++) {
				const g = g0 + (g1 - g0) * (i + 1) * inv;
				mixL[i] += this.tmpL[i] * g; mixR[i] += this.tmpR[i] * g;
			}
			any = true;
		}

		// metronome clicks (output domain, not stretched)
		const M = this.metro;
		if (this.clicks.length) {
			const base = this.outFrame;
			for (let k = this.clicks.length - 1; k >= 0; k--) {
				const c = this.clicks[k], buf = c.acc ? this.clickA : this.clickN;
				const start = Math.max(0, c.f - base);
				const end = Math.min(N, c.f + buf.length - base);
				if (c.f + buf.length <= base) { this.clicks.splice(k, 1); continue; }
				for (let i = start; i < end; i++) {
					const v = buf[base + i - c.f] * M.vol;
					mixL[i] += v; mixR[i] += v;
				}
			}
		}

		// master gain + fade, write out
		let mg = this.mg;
		for (let i = 0; i < N; i++) {
			if (mg < this.mgTarget) mg = Math.min(this.mgTarget, mg + sps); else if (mg > this.mgTarget) mg = Math.max(this.mgTarget, mg - sps);
			outL[i] = mixL[i] * this.master * mg; outR[i] = mixR[i] * this.master * mg;
		}
		this.mg = mg;
		this.outFrame += N;

		// advance cursor
		let nip = ip + nIn;
		if (loopActive && nip >= L.end) nip -= L.len;
		this.ip = nip;

		if (this.mg === 0 && this.mgTarget === 0 && this.afterFade) { const f = this.afterFade; this.afterFade = null; f(); }
		// end of material
		if (!loopActive && this.ip > this.totalFrames + 4 * 8192 + Math.round(this.latencyOut() * rate)) {
			this.playing = false; this.ended = true;
		}
		if (this.offlineEnd >= 0 && this.outFrame >= this.offlineEnd) { this.playing = false; this.ended = true; }
		this._stats(t0, any);
	}

	_stats(t0, worked) {
		const st = this.stat;
		const dt = timeNow() - t0;
		st.quanta++;
		if (worked) {
			st.tSum += dt; if (dt > st.tMax) st.tMax = dt;
			st.wSum += dt; st.wlen++; if (dt > st.wMax) st.wMax = dt;
			if (HAS_HIRES_TIMER && dt > st.budget) st.over++;
		}
	}
	/** CPU load of the audio thread since the last call (fraction of the quantum budget). */
	takeLoad() {
		const st = this.stat;
		const r = { avg: st.wlen ? st.wSum / st.wlen / st.budget : 0, max: st.wMax / st.budget, n: st.wlen };
		st.wSum = 0; st.wlen = 0; st.wMax = 0;
		return r;
	}
	missingChunks() {
		const out = [];
		this.stems.forEach((s, i) => { if (s.data.missingSet.size) { out.push([i, [...s.data.missingSet]]); s.data.missingSet.clear(); } });
		return out;
	}
}
