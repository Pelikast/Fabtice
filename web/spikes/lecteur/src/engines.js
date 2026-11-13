// Time-stretch / pitch-shift engines behind one small interface, usable in an
// AudioWorklet and in Node (tests). Three families:
//   - Signalsmith Stretch 1.3.2 (WebAssembly, MIT)       "exact": N input frames -> exactly M output frames
//   - Rubber Band 4.0 R3 / R2 (WebAssembly, GPL-2.0+)     "streaming": output arrives in bursts, FIFO in the wrapper
//   - SoundTouch (JavaScript port, MPL-2.0)               "streaming" too
// A "stem processor" is a stereo processor with:
//   setParams(semitones, rate, formant)   rate = input frames consumed per output frame (0.55 = slower)
//   process(inL, inR, nIn, outL, outR, nOut) -> frames written to out (nOut for exact engines)
//   reset(), seek(inL, inR, n, rate) (exact engines only), destroy()

import { SoundTouch } from './vendor/soundtouch/index.js';

// ---------------------------------------------------------------- WASI stubs
function wasiImports(module, getMemory) {
	const stub = {
		fd_write: (fd, iovs, n, outp) => {
			const dv = new DataView(getMemory().buffer);
			let total = 0;
			for (let i = 0; i < n; i++) total += dv.getUint32(iovs + i * 8 + 4, true);
			dv.setUint32(outp, total, true);
			return 0;
		},
		fd_close: () => 0,
		fd_seek: () => 70, // ESPIPE
		fd_read: () => 8,
		fd_fdstat_get: () => 8, // EBADF
		environ_sizes_get: (a, b) => { const dv = new DataView(getMemory().buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; },
		environ_get: () => 0,
		clock_time_get: (id, prec, outp) => {
			const dv = new DataView(getMemory().buffer);
			dv.setBigUint64(outp, BigInt(Math.round(Date.now() * 1e6)), true);
			return 0;
		},
		random_get: (ptr, len) => {
			const u8 = new Uint8Array(getMemory().buffer, ptr, len);
			for (let i = 0; i < len; i++) u8[i] = (Math.random() * 256) | 0;
			return 0;
		},
		proc_exit: (code) => { throw new Error('wasm proc_exit ' + code); },
	};
	const wasi = {};
	for (const imp of WebAssembly.Module.imports(module)) {
		wasi[imp.name] = stub[imp.name] || (() => 52); // ENOSYS
	}
	return { wasi_snapshot_preview1: wasi };
}

// ---------------------------------------------------------------- wasm engines
export class WasmEngine {
	/** @param {WebAssembly.Module} module */
	static async load(module, sampleRate, variant) {
		let mem = null;
		const imports = wasiImports(module, () => mem);
		const inst = await WebAssembly.instantiate(module, imports);
		mem = inst.exports.memory;
		if (inst.exports._initialize) inst.exports._initialize();
		return new WasmEngine(inst.exports, sampleRate, variant);
	}
	constructor(exports, sampleRate, variant) {
		this.x = exports;
		this.sampleRate = sampleRate;
		this.variant = variant;
		this.exact = exports.fe_exact() === 1;
		this.cap = exports.fe_cap();
		this.buf = null;
		this.f32 = null;
	}
	heap() {
		const b = this.x.memory.buffer;
		if (b !== this.buf) { this.buf = b; this.f32 = new Float32Array(b); }
		return this.f32;
	}
	create() { return new WasmStem(this); }
	get memoryBytes() { return this.x.memory.buffer.byteLength; }
}

class WasmStem {
	constructor(engine) {
		this.e = engine;
		this.x = engine.x;
		this.p = this.x.fe_create(engine.sampleRate, 2, engine.variant);
		this.exact = engine.exact;
		this.cap = engine.cap;
		this.inIdx = this.x.fe_in(this.p) >> 2;
		this.outIdx = this.x.fe_out(this.p) >> 2;
		this.lastSemi = NaN; this.lastRate = NaN; this.lastFormant = -1;
	}
	setParams(semitones, rate, formant) {
		if (semitones === this.lastSemi && rate === this.lastRate && formant === this.lastFormant) return;
		this.lastSemi = semitones; this.lastRate = rate; this.lastFormant = formant;
		this.x.fe_set(this.p, semitones, rate, formant ? 1 : 0);
	}
	// Parameters are kept across reset(): call setParams() first so the engine computes its start delay for them.
	reset() { this.x.fe_reset(this.p); }
	process(inL, inR, nIn, outL, outR, nOut) {
		const h = this.e.heap(), cap = this.cap;
		h.set(inL.subarray(0, nIn), this.inIdx);
		h.set(inR.subarray(0, nIn), this.inIdx + cap);
		const n = this.x.fe_process(this.p, nIn, nOut);
		const h2 = this.e.heap(); // memory may have grown
		outL.set(h2.subarray(this.outIdx, this.outIdx + n));
		outR.set(h2.subarray(this.outIdx + cap, this.outIdx + cap + n));
		return n;
	}
	/** Exact engines only: feed audio preceding the new position without computing output. */
	seek(inL, inR, n, rate) {
		const h = this.e.heap(), cap = this.cap;
		h.set(inL.subarray(0, n), this.inIdx);
		h.set(inR.subarray(0, n), this.inIdx + cap);
		this.x.fe_seek(this.p, n, rate);
	}
	get seekLength() { return this.x.fe_seek_len(this.p); }
	destroy() { this.x.fe_destroy(this.p); this.p = 0; }
}

// ---------------------------------------------------------------- SoundTouch (JS)
export class SoundTouchEngine {
	constructor(sampleRate) { this.sampleRate = sampleRate; this.exact = false; this.cap = 4096; }
	create() { return new SoundTouchStem(this.sampleRate); }
	get memoryBytes() { return 0; }
}

class SoundTouchStem {
	constructor(sr) {
		this.exact = false;
		this.sr = sr;
		this.st = new SoundTouch({ sampleRate: sr });
		this.inter = new Float32Array(2 * 4096);
		this.outer = new Float32Array(2 * 4096);
		this.lastSemi = NaN; this.lastRate = NaN; this.primed = false;
	}
	setParams(semitones, rate) {
		if (semitones === this.lastSemi && rate === this.lastRate) return;
		this.lastSemi = semitones; this.lastRate = rate;
		const pitch = Math.pow(2, semitones / 12);
		this.st.pitch = pitch;               // wires rate transposer / stretch order, tempo = 1/pitch
		this.st.stretch.tempo = rate / pitch; // net tempo = rate
	}
	reset() { this.st.clear(); this.lastSemi = NaN; this.lastRate = NaN; this.primed = false; }
	process(inL, inR, nIn, outL, outR, nOut) {
		const it = this.inter;
		for (let i = 0; i < nIn; i++) { it[2 * i] = inL[i]; it[2 * i + 1] = inR[i]; }
		this.st.inputBuffer.putSamples(it, 0, nIn);
		this.st.process();
		const ob = this.st.outputBuffer;
		if (!this.primed) { if (ob.frameCount >= 2048) this.primed = true; else return 0; }
		const n = Math.min(ob.frameCount, nOut);
		if (n > 0) {
			ob.extract(this.outer, 0, n);
			ob.receive(n);
			const ot = this.outer;
			for (let i = 0; i < n; i++) { outL[i] = ot[2 * i]; outR[i] = ot[2 * i + 1]; }
		}
		return n;
	}
	seek() {}
	get seekLength() { return 0; }
	destroy() {}
}

// ---------------------------------------------------------------- latency calibration
/**
 * Measures the engine delay model  L_out(rate) = a + b / rate  (output frames) with a short
 * tone burst: the burst enters at input frame P and its envelope peak leaves at output frame Q,
 * so L = Q - P / rate. Two rates give a (output-side delay) and b (input-side delay, in input frames).
 */
export function calibrateLatency(engine, sr, semitones = 0) {
	const probe = (rate) => {
		const st = engine.create();
		st.setParams(semitones, rate, false);
		st.reset();
		const P = Math.round(0.45 * sr), total = Math.round(1.6 * sr / Math.min(1, rate));
		const burstLen = Math.round(0.004 * sr);
		const inL = new Float32Array(256), inR = new Float32Array(256);
		const outL = new Float32Array(128), outR = new Float32Array(128);
		let acc = 0, inPos = 0, outPos = 0, bestV = 0, bestQ = 0, warm = false;
		const env = [];
		while (outPos < total) {
			acc += 128 * rate;
			const nIn = Math.floor(acc); acc -= nIn;
			for (let i = 0; i < nIn; i++) {
				const t = inPos + i - P;
				const s = t >= 0 && t < burstLen ? Math.sin(Math.PI * t / burstLen) ** 2 * Math.sin(2 * Math.PI * 3000 * t / sr) : 0;
				inL[i] = inR[i] = s;
			}
			inPos += nIn;
			const n = st.process(inL, inR, nIn, outL, outR, 128);
			for (let i = 0; i < 128; i++) env.push(i < n ? Math.abs(outL[i]) : 0);
			outPos += 128;
		}
		// smoothed envelope (~1 ms) then peak
		const w = Math.max(1, Math.round(0.001 * sr));
		let run = 0;
		for (let i = 0; i < env.length; i++) {
			run += env[i]; if (i >= w) run -= env[i - w];
			if (run > bestV) { bestV = run; bestQ = i - w / 2; }
		}
		st.destroy();
		return { q: bestQ, P, peak: bestV / w };
	};
	const r1 = probe(1), r2 = probe(0.5);
	const L1 = r1.q - r1.P / 1, L2 = r2.q - r2.P / 0.5;
	// L(rate) = a + b / rate  ->  L1 = a + b, L2 = a + 2b
	const b = L2 - L1, a = 2 * L1 - L2;
	return { a, b, L1, L2, peak1: r1.peak, peak2: r2.peak };
}
