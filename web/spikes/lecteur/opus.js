// Experimental compressed storage: stems are kept as Opus packets (WebCodecs) and only the chunks near the
// playhead / loop are decoded to 16 bits and handed to the worklet. 7 stems x 5 min come to roughly 25-35 MB.
import { CHUNK, CHUNK_BITS } from './stems.js';

export const opusSupported = typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined';
let globalQueue = Promise.resolve();
const PKT = 960; // frames per 20 ms packet at 48 kHz

function planes(l, r) { return r ? [l, r] : [l]; }

/** Encodes float channels to Opus packets. Only 48 kHz is handled here (Opus' native rate). */
export async function encodeOpus(l, r, sr, bitrate = 96000) {
	const ch = r ? 2 : 1, frames = l.length;
	const packets = []; let description = null, error = null;
	const enc = new AudioEncoder({
		output: (chunk, meta) => {
			const u = new Uint8Array(chunk.byteLength); chunk.copyTo(u); packets.push(u);
			if (!description && meta && meta.decoderConfig && meta.decoderConfig.description) description = meta.decoderConfig.description.slice ? meta.decoderConfig.description.slice(0) : meta.decoderConfig.description;
		},
		error: (e) => { error = e; },
	});
	enc.configure({ codec: 'opus', sampleRate: sr, numberOfChannels: ch, bitrate: bitrate * ch / 2, opus: { application: 'audio', frameDuration: 20000 } });
	const step = PKT * 50;
	for (let s = 0; s < frames && !error; s += step) {
		const n = Math.min(step, frames - s), data = new Float32Array(n * ch);
		data.set(l.subarray(s, s + n), 0); if (r) data.set(r.subarray(s, s + n), n);
		const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(s / sr * 1e6), data });
		enc.encode(ad); ad.close();
		if (enc.encodeQueueSize > 8) await new Promise((res) => setTimeout(res, 0));
	}
	await enc.flush(); enc.close();
	if (error) throw error;
	let bytes = 0; for (const p of packets) bytes += p.length;
	return { packets, description, channels: ch, sr, frames, bytes };
}

export class OpusReader {
	constructor(enc, shareable) { this.enc = enc; this.share = shareable; }
	/** Decodes chunks c0..c1 (inclusive) with one decoder session. Resolves to an array of {l, r} (Int16; r null for mono). */
	decodeChunks(c0, c1, stale) {
		// One queue for all stems: concurrent AudioDecoders were measured much slower per chunk than one at a time,
		// and creating a decoder per chunk costs more than decoding it, hence runs of several chunks.
		// `stale()` lets the caller drop a request that was queued for a position the playhead has left.
		const run = () => (stale && stale() ? null : this._decode(c0, c1));
		const p = globalQueue.then(run, run);
		globalQueue = p.catch(() => {});
		return p;
	}
	decodeChunk(ci) { return this.decodeChunks(ci, ci).then((a) => a[0]); }
	async _decode(c0, c1) {
		const e = this.enc, start = c0 << CHUNK_BITS, end = Math.min(e.frames, ((c1 + 1) << CHUNK_BITS));
		const p0 = Math.max(0, Math.floor(start / PKT) - 4), p1 = Math.min(e.packets.length, Math.ceil(end / PKT) + 1);
		const outs = []; let err = null;
		const dec = new AudioDecoder({ output: (ad) => outs.push(ad), error: (x) => { err = x; } });
		const cfg = { codec: 'opus', sampleRate: e.sr, numberOfChannels: e.channels };
		if (e.description) cfg.description = e.description;
		dec.configure(cfg);
		for (let p = p0; p < p1; p++) dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: p * 20000, data: e.packets[p] }));
		await dec.flush(); dec.close();
		if (err) throw err;
		// the decoder drops the stream's pre-skip again after configure(): output frame k == source frame p0*PKT + k
		const base = p0 * PKT, n = c1 - c0 + 1;
		const mk = () => { const b = CHUNK * 2; return new Int16Array(this.share ? new SharedArrayBuffer(b) : new ArrayBuffer(b)); };
		const res = Array.from({ length: n }, () => ({ l: mk(), r: e.channels > 1 ? mk() : null }));
		let pos = 0; const tmp = new Float32Array(4096);
		for (const ad of outs) {
			const m = ad.numberOfFrames;
			for (let c = 0; c < e.channels; c++) {
				const a = m > tmp.length ? new Float32Array(m) : tmp;
				ad.copyTo(a, { planeIndex: c, format: 'f32-planar' });
				for (let i = 0; i < m; i++) {
					const f = base + pos + i - start;
					if (f < 0) continue;
					const ci = f >> CHUNK_BITS; if (ci >= n) break;
					const v = Math.round(a[i] * 32768);
					(c ? res[ci].r : res[ci].l)[f & (CHUNK - 1)] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
				}
			}
			pos += m; ad.close();
		}
		return res;
	}
}
