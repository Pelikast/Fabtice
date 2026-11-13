// AudioWorklet entry: one processor renders all stems (see core.js for the timeline model).
// Bundled with esbuild into ../worklet/player-worklet.js (see ../build.mjs).
import { PlayerCore, StemData, N, HAS_HIRES_TIMER } from './core.js';
import { WasmEngine, SoundTouchEngine, calibrateLatency } from './engines.js';

const latencyCache = new Map();

class FabticePlayer extends AudioWorkletProcessor {
	constructor(options) {
		super();
		const po = (options && options.processorOptions) || {};
		this.offline = !!po.offline;
		this.core = new PlayerCore(sampleRate, { skipMuted: po.skipMuted !== false });
		this.core.immediate = this.offline;
		this.port.onmessage = (e) => { try { this.onMessage(e.data); } catch (err) { this.port.postMessage({ type: 'error', message: String(err && err.stack || err) }); } };
		this.port.onmessageerror = () => this.port.postMessage({ type: 'error', message: 'messageerror (a posted value could not be deserialized)' });
		this.tick = 0;
		this.lastEnded = false;
		this.port.postMessage({ type: 'hello', sampleRate, hiresTimer: HAS_HIRES_TIMER, offline: this.offline });
	}

	async loadEngine(m) {
		const t0 = Date.now();
		let engine;
		if (m.kind === 'soundtouch') engine = new SoundTouchEngine(sampleRate);
		else {
			let module = m.module;
			if (!module) module = await WebAssembly.compile(m.bytes);
			engine = await WasmEngine.load(module, sampleRate, m.variant);
		}
		const ck = m.key + '@' + sampleRate;
		let lat = latencyCache.get(ck);
		if (!lat) { lat = calibrateLatency(engine, sampleRate); latencyCache.set(ck, lat); }
		this.core.setEngine(engine, m.key, lat);
		this.port.postMessage({ type: 'engine-ready', key: m.key, id: m.id, lat, exact: engine.exact, wasmBytes: engine.memoryBytes, ms: Date.now() - t0 });
	}

	onMessage(m) {
		const c = this.core;
		switch (m.type) {
			case 'engine': this.loadEngine(m).catch((err) => this.port.postMessage({ type: 'error', message: 'engine: ' + String(err && err.stack || err) })); break;
			case 'stem': { // full stem: chunks already decoded
				const d = new StemData(m.frames, m.mono, m.kind);
				for (let i = 0; i < m.chunks.length; i++) d.chunks[i] = m.chunks[i];
				if (m.index < c.stems.length) { c.stems[m.index].data = d; c.stems[m.index].needPrime = true; }
				else c.addStem(d, m.name);
				break;
			}
			case 'chunks': { // streaming mode: put / drop chunks of a stem
				const d = c.stems[m.index] && c.stems[m.index].data;
				if (!d) break;
				if (m.put) for (const [ci, ch] of m.put) d.chunks[ci] = ch;
				if (m.drop) for (const ci of m.drop) d.chunks[ci] = null;
				break;
			}
			case 'clear': c.clearStems(); c.ip = 0; c.acc = 0; break;
			case 'stem-params': {
				const s = c.stems[m.index]; if (!s) break;
				if (m.vol !== undefined) s.vol = m.vol;
				if (m.mute !== undefined) s.mute = m.mute;
				if (m.solo !== undefined) s.solo = m.solo;
				if (m.noTranspose !== undefined) s.noTranspose = m.noTranspose;
				break;
			}
			case 'params':
				if (m.rate !== undefined) c.setRate(m.rate);
				if (m.semitones !== undefined) c.semitones = m.semitones;
				if (m.formant !== undefined) c.formant = m.formant;
				if (m.master !== undefined) c.master = m.master;
				if (m.skipMuted !== undefined) c.skipMuted = m.skipMuted;
				break;
			case 'loop': c.setLoop(m.enabled, m.start, m.end); break;
			case 'beats': c.setBeats(m.frames, m.accents); break;
			case 'metro': c.metro.enabled = !!m.enabled; if (m.vol !== undefined) c.metro.vol = m.vol; c.metro.resync = true; break;
			case 'play': c.play(); break;
			case 'pause': c.pause(); break;
			case 'seek': c.seek(m.frame); break;
			case 'offline': c.offlineEnd = m.frames; c.rate = c.rateTarget; break;
			case 'ping': this.port.postMessage({ type: 'pong', t: m.t }); break;
		}
	}

	process(inputs, outputs) {
		const out = outputs[0];
		const c = this.core;
		c.render(out[0], out.length > 1 ? out[1] : out[0]);
		if (!this.offline && (++this.tick & 15) === 0) {
			const load = c.takeLoad();
			this.port.postMessage({
				type: 'status', heard: c.heardPos(), cursor: c.cursor, playing: c.playing, rate: c.rate, t: currentTime,
				load, over: c.stat.over, underruns: c.stat.underruns, ended: c.ended,
				missing: c.missingChunks(), active: c.stems.filter((x) => x.active).length, wasmBytes: c.engine ? c.engine.memoryBytes : 0,
			});
		}
		if (c.ended && !this.lastEnded) this.port.postMessage({ type: 'ended' });
		this.lastEnded = c.ended;
		return true;
	}
}
registerProcessor('fabtice-player', FabticePlayer);
