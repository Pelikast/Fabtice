// Stem storage on the main thread: chunked 16-bit (or 32-bit float) audio, peak pyramids, WAV encoding.
// Chunks are SharedArrayBuffer-backed when the page is cross-origin isolated, so the live worklet and the
// offline (export) worklet read the same memory without a copy.

export const CHUNK_BITS = 15;
export const CHUNK = 1 << CHUNK_BITS;
export const PEAK_BASE = 64; // frames per base peak block

export const canShare = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;

function alloc(kind, n) {
	const bytes = n * (kind === 'i16' ? 2 : 4);
	const buf = canShare ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
	return kind === 'i16' ? new Int16Array(buf) : new Float32Array(buf);
}

/** True if the right channel is (nearly) identical to the left: store one channel only. */
export function isMono(l, r) {
	if (!r || r === l) return true;
	let max = 0;
	for (let i = 0; i < l.length; i += 1) { const d = Math.abs(l[i] - r[i]); if (d > max) max = d; }
	return max < 1.5 / 32768; // within one 16-bit step
}

/**
 * Converts float channels to chunk storage.
 * @returns {{frames:number, mono:boolean, kind:string, chunks:{l:TypedArray,r:TypedArray|null}[]}}
 */
export function chunkize(l, r, kind = 'i16') {
	const frames = l.length, mono = isMono(l, r);
	const nChunks = Math.ceil(frames / CHUNK), chunks = new Array(nChunks);
	for (let c = 0; c < nChunks; c++) {
		const s = c << CHUNK_BITS, n = Math.min(CHUNK, frames - s);
		const mk = (src) => {
			const a = alloc(kind, CHUNK);
			if (kind === 'i16') {
				for (let i = 0; i < n; i++) { const v = Math.round(src[s + i] * 32768); a[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
			} else a.set(src.subarray(s, s + n));
			return a;
		};
		chunks[c] = { l: mk(l), r: mono ? null : mk(r) };
	}
	return { frames, mono, kind, chunks };
}

export function storeBytes(st) {
	let b = 0; const bpe = st.kind === 'i16' ? 2 : 4;
	for (const c of st.chunks) if (c) b += (c.l.length + (c.r ? c.r.length : 0)) * bpe;
	return b;
}

/** Transferables for postMessage when the chunks are not shared. */
export function transferList(st) {
	if (canShare) return [];
	const t = [];
	for (const c of st.chunks) if (c) { t.push(c.l.buffer); if (c.r) t.push(c.r.buffer); }
	return t;
}

// ---------------------------------------------------------------- peaks
/** Min/max pyramid: level k has blocks of PEAK_BASE * 2^k frames; stereo folded to one envelope. */
export function computePeaks(l, r) {
	const frames = l.length, n0 = Math.ceil(frames / PEAK_BASE);
	let mn = new Float32Array(n0), mx = new Float32Array(n0);
	for (let b = 0; b < n0; b++) {
		const s = b * PEAK_BASE, e = Math.min(frames, s + PEAK_BASE);
		let lo = 1, hi = -1;
		for (let i = s; i < e; i++) { const v = l[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
		if (r && r !== l) for (let i = s; i < e; i++) { const v = r[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
		mn[b] = lo; mx[b] = hi;
	}
	const levels = [{ block: PEAK_BASE, min: mn, max: mx }];
	while (levels[levels.length - 1].min.length > 8) {
		const p = levels[levels.length - 1], n = Math.ceil(p.min.length / 2);
		const a = new Float32Array(n), b = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const i0 = 2 * i, i1 = Math.min(p.min.length - 1, i0 + 1);
			a[i] = Math.min(p.min[i0], p.min[i1]); b[i] = Math.max(p.max[i0], p.max[i1]);
		}
		levels.push({ block: p.block * 2, min: a, max: b });
	}
	return { frames, levels };
}
export function peaksBytes(pk) { let b = 0; for (const l of pk.levels) b += (l.min.length + l.max.length) * 4; return b; }

// ---------------------------------------------------------------- WAV
/** Interleaved little-endian WAV; bits = 16 (TPDF dither) or 32 (float). */
export function encodeWav(channels, sampleRate, bits = 16) {
	const n = channels[0].length, nch = channels.length, bps = bits / 8;
	const dataBytes = n * nch * bps, buf = new ArrayBuffer(44 + dataBytes), dv = new DataView(buf);
	const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
	wr(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); wr(8, 'WAVE'); wr(12, 'fmt ');
	dv.setUint32(16, 16, true); dv.setUint16(20, bits === 32 ? 3 : 1, true); dv.setUint16(22, nch, true);
	dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * nch * bps, true); dv.setUint16(32, nch * bps, true);
	dv.setUint16(34, bits, true); wr(36, 'data'); dv.setUint32(40, dataBytes, true);
	let o = 44;
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < nch; c++) {
			const v = channels[c][i];
			if (bits === 32) dv.setFloat32(o, v, true);
			else {
				const d = (Math.random() - Math.random()) / 32768; // TPDF dither
				const q = Math.round((v + d) * 32767);
				dv.setInt16(o, q > 32767 ? 32767 : q < -32768 ? -32768 : q, true);
			}
			o += bps;
		}
	}
	return new Blob([buf], { type: 'audio/wav' });
}
