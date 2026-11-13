// Main-thread side of the player: AudioContext, worklet node, engine loading, messages, status.
import { canShare } from './stems.js';

export const ENGINES = [
	{ key: 'signalsmith', label: 'Signalsmith Stretch (par défaut)', kind: 'wasm', wasm: 'signalsmith', variant: 0, exact: true },
	{ key: 'signalsmith-cheap', label: 'Signalsmith Stretch (économe)', kind: 'wasm', wasm: 'signalsmith', variant: 1, exact: true },
	{ key: 'rubberband-r3', label: 'Rubber Band R3 « finer » (GPL)', kind: 'wasm', wasm: 'rubberband', variant: 0, exact: false },
	{ key: 'rubberband-r2', label: 'Rubber Band R2 « faster » (GPL)', kind: 'wasm', wasm: 'rubberband', variant: 1, exact: false },
	{ key: 'soundtouch', label: 'SoundTouch (JavaScript, référence)', kind: 'soundtouch', exact: false },
];

// Smallest module using a v128 instruction: validates only where WebAssembly SIMD is supported.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export const hasSimd = (() => { try { return WebAssembly.validate(SIMD_PROBE); } catch { return false; } })();

const moduleCache = new Map();
export async function loadWasmModule(name) {
	// measured: the SIMD build of Signalsmith is not faster (no explicit SIMD in the library), so only Rubber Band uses it
	const file = `engines/${name}${hasSimd && name === 'rubberband' ? '' : '-nosimd'}.wasm`;
	if (!moduleCache.has(file)) {
		moduleCache.set(file, (async () => {
			const r = await fetch(file);
			if (!r.ok) throw new Error('fetch ' + file + ' ' + r.status);
			return { bytes: await r.arrayBuffer() };
		})());
	}
	return moduleCache.get(file);
}

export const WORKLET_URL = 'worklet/player-worklet.js';

/** Creates the worklet node on any (live or offline) context and waits for its hello. */
export async function createNode(ctx, offline) {
	await ctx.audioWorklet.addModule(WORKLET_URL);
	const node = new AudioWorkletNode(ctx, 'fabtice-player', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { offline } });
	const hello = new Promise((res, rej) => {
		const t = setTimeout(() => rej(new Error('worklet: no hello')), 8000);
		node._waiters = [];
		node.port.onmessage = (e) => {
			const m = e.data;
			if (m.type === 'hello') { clearTimeout(t); res(m); }
			if (node.onmsg) node.onmsg(m);
		};
	});
	node.port.onmessageerror = () => { if (node.onmsg) node.onmsg({ type: 'error', message: 'messageerror' }); };
	node.hello = await hello;
	return node;
}

export async function setEngine(node, eng) {
	const msg = { type: 'engine', key: eng.key, id: Math.random(), kind: eng.kind, variant: eng.variant };
	if (eng.kind === 'wasm') {
		// A WebAssembly.Module cannot be posted to an AudioWorklet (the message is silently dropped in Chromium):
		// send the bytes and compile inside the worklet.
		const { bytes } = await loadWasmModule(eng.wasm);
		msg.bytes = bytes.slice(0);
		node.port.postMessage(msg);
	} else node.port.postMessage(msg);
	return new Promise((res, rej) => {
		const prev = node.onmsg;
		const t = setTimeout(() => { node.onmsg = prev; rej(new Error('engine load timeout')); }, 60000);
		node.onmsg = (m) => {
			if (prev) prev(m);
			if (m.type === 'engine-ready' && m.id === msg.id) { clearTimeout(t); node.onmsg = prev; res(m); }
		};
	});
}

export function sendStem(node, index, name, st) {
	// chunk objects are posted as-is: SharedArrayBuffer views are shared, plain buffers are copied (or transferred)
	node.port.postMessage({ type: 'stem', index, name, frames: st.frames, mono: st.mono, kind: st.kind, chunks: st.chunks });
}

export { canShare };
