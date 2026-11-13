// Built-in synthesized demo: a small jazz-ish band (voice, drums, bass, guitar, piano, winds, other)
// generated in the page, so no recording is needed. 100 BPM, 4/4, first beat at 0 s, 16 bars (38.4 s).
// Deterministic (seeded noise).

export const DEMO = { bpm: 100, beatsPerBar: 4, bars: 16, offset: 0 };

function rng(seed) {
	let a = seed >>> 0;
	return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ii - V - I - VI7 (D minor 7, G7, C major 7, A7), repeated
const CHORDS = [
	{ root: 50, notes: [60, 65, 69, 72], scale: [62, 64, 65, 67, 69, 71, 72, 74] },        // Dm7
	{ root: 43, notes: [59, 62, 65, 67], scale: [55, 57, 59, 60, 62, 64, 65, 67] },        // G7
	{ root: 48, notes: [59, 64, 67, 71], scale: [60, 62, 64, 65, 67, 69, 71, 72] },        // Cmaj7
	{ root: 45, notes: [61, 64, 67, 69], scale: [57, 59, 61, 62, 64, 65, 67, 69] },        // A7
];

/** Adds a decaying additive tone (harmonic amplitudes h[], attack/decay in s) into out[] */
function tone(out, sr, t0, dur, f, amp, h, atk, dec, pan = 0, out2 = null) {
	const tail = Math.min(4 * dec, 0.8), s0 = Math.floor(t0 * sr), n = Math.floor((dur + tail) * sr), w0 = 2 * Math.PI * f / sr;
	const gl = amp * Math.cos((pan + 1) * Math.PI / 4), gr = amp * Math.sin((pan + 1) * Math.PI / 4);
	for (let i = 0; i < n; i++) {
		const idx = s0 + i; if (idx >= out.length) break;
		const t = i / sr;
		const env = Math.min(1, t / atk) * Math.exp(-t / dec) * (t > dur ? Math.max(0, 1 - (t - dur) / tail) : 1);
		if (env < 1e-4) continue;
		let v = 0;
		for (let k = 0; k < h.length; k++) v += h[k] * Math.sin(w0 * (k + 1) * i + k);
		if (out2) { out[idx] += v * env * gl; out2[idx] += v * env * gr; } else out[idx] += v * env;
	}
}

export function synthDemo(sr, onProgress) {
	const { bpm, beatsPerBar, bars } = DEMO;
	const beat = 60 / bpm, bar = beat * beatsPerBar, total = bar * bars, frames = Math.round(total * sr);
	const mk = () => new Float32Array(frames);
	const R = rng(12345);
	const stems = [];
	const prog = (b) => CHORDS[b % 4];

	// Drums (stereo): kick on 1, snare ghost + accent on 2 and 4, swung ride, noise-based
	{
		const l = mk(), r = mk();
		const noise = (t0, dur, gain, pan, lp, tonehz) => {
			const s0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
			let y = 0;
			const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
			for (let i = 0; i < n && s0 + i < frames; i++) {
				const env = Math.exp(-i / sr / (dur / 5));
				y += lp * ((R() * 2 - 1) - y);
				const v = (y + (tonehz ? 0.4 * Math.sin(2 * Math.PI * tonehz * i / sr) : 0)) * env;
				l[s0 + i] += v * gl; r[s0 + i] += v * gr;
			}
		};
		for (let b = 0; b < bars; b++) {
			for (let k = 0; k < beatsPerBar; k++) {
				const t = b * bar + k * beat;
				if (k === 0 || (k === 2 && b % 2)) { // kick
					const s0 = Math.floor(t * sr), n = Math.floor(0.3 * sr);
					let ph = 0;
					for (let i = 0; i < n && s0 + i < frames; i++) {
						const tt = i / sr, f = 45 + 90 * Math.exp(-tt * 28);
						ph += 2 * Math.PI * f / sr;
						const v = 0.8 * Math.sin(ph) * Math.exp(-tt * 12);
						l[s0 + i] += v; r[s0 + i] += v;
					}
				}
				if (k === 1 || k === 3) noise(t, 0.22, 0.45, 0, 0.55, 190); // snare
				if (k === 1 || k === 3) noise(t + 0.01, 0.05, 0.25, -0.5, 0.9, 0); // foot hat
				noise(t, 0.35, 0.18, 0.4, 0.97, 0);                              // ride, on the beat
				noise(t + beat * 2 / 3, 0.3, 0.12, 0.4, 0.97, 0);                // ride, swung skip note
			}
			if (onProgress) onProgress(0.1 * (b + 1) / bars);
		}
		stems.push({ name: 'Batterie', l, r });
	}
	// Bass (mono): walking quarter notes
	{
		const l = mk();
		for (let b = 0; b < bars; b++) {
			const c = prog(b), nx = prog(b + 1);
			const seq = [c.root, c.root + 7, c.root + (c === CHORDS[1] ? 4 : 3) + (b % 2 ? 2 : 0), nx.root + (R() < 0.5 ? 1 : -1)];
			seq.forEach((m, k) => tone(l, sr, b * bar + k * beat, beat * 0.9, mtof(m - 12 + (m < 45 ? 12 : 0)), 0.5, [1, 0.45, 0.2], 0.01, 0.25));
		}
		stems.push({ name: 'Basse', l, r: null });
		if (onProgress) onProgress(0.2);
	}
	// Piano (stereo, two slightly detuned layers): stabs on 1 and the "and" of 2
	{
		const l = mk(), r = mk();
		for (let b = 0; b < bars; b++) {
			const c = prog(b);
			for (const [pos, g] of [[0, 1], [1.67, 0.8], [3, 0.6]]) {
				c.notes.forEach((m, i) => {
					tone(l, sr, b * bar + pos * beat, 0.4, mtof(m) * 0.9997, 0.11 * g, [1, 0.5, 0.3, 0.15, 0.08], 0.004, 0.45, -0.3 + 0.2 * i / 3, r);
					tone(l, sr, b * bar + pos * beat, 0.4, mtof(m) * 1.0003, 0.11 * g, [1, 0.5, 0.3, 0.15, 0.08], 0.004, 0.45, 0.3 - 0.2 * i / 3, r);
				});
			}
			if (onProgress) onProgress(0.2 + 0.2 * (b + 1) / bars);
		}
		stems.push({ name: 'Piano', l, r });
	}
	// Guitar (mono): arpeggio, eighth notes
	{
		const l = mk();
		for (let b = 0; b < bars; b++) {
			const c = prog(b);
			for (let k = 0; k < 8; k++) {
				const m = c.notes[[0, 1, 2, 3, 2, 1, 3, 2][k]] - 12;
				tone(l, sr, b * bar + k * beat / 2, 0.2, mtof(m), 0.2, [1, 0.6, 0.4, 0.3, 0.2, 0.1], 0.002, 0.28);
			}
		}
		stems.push({ name: 'Guitare', l, r: null });
		if (onProgress) onProgress(0.55);
	}
	// Voice (mono): vowel-like additive sound, vibrato, simple melody on the chord scales
	{
		const l = mk();
		let idx = 3;
		const f1 = 700, f2 = 1150;
		for (let b = 0; b < bars; b++) {
			const c = prog(b);
			let t = b * bar;
			const rhythm = b % 4 === 3 ? [2, 2] : [1.5, 0.5, 1, 1];
			for (const d of rhythm) {
				idx = Math.max(0, Math.min(c.scale.length - 1, idx + Math.round((R() - 0.5) * 4)));
				const f = mtof(c.scale[idx] + 12), dur = d * beat * 0.95;
				const s0 = Math.floor(t * sr), n = Math.floor((dur + 0.08) * sr);
				let ph = 0;
				for (let i = 0; i < n && s0 + i < frames; i++) {
					const tt = i / sr, vib = 1 + 0.0087 * Math.sin(2 * Math.PI * 5.5 * tt) * Math.min(1, tt / 0.3);
					ph += 2 * Math.PI * f * vib / sr;
					let v = 0;
					for (let k = 1; k <= 14; k++) { // harmonics shaped by two formants
						const fk = f * k, a = Math.exp(-(((fk - f1) / 260) ** 2)) + 0.6 * Math.exp(-(((fk - f2) / 330) ** 2)) + 0.05 / k;
						v += a * Math.sin(k * ph) / k;
					}
					const env = Math.min(1, tt / 0.04) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.08) : 1);
					l[s0 + i] += 0.45 * v * env;
				}
				t += d * beat;
			}
		}
		stems.push({ name: 'Voix', l, r: null });
		if (onProgress) onProgress(0.75);
	}
	// Winds (stereo): sustained soft chord pad
	{
		const l = mk(), r = mk();
		for (let b = 0; b < bars; b += 1) {
			const c = prog(b);
			[1, 2, 3].forEach((i) => tone(l, sr, b * bar, bar * 0.9, mtof(c.notes[i] - 12), 0.1, [1, 0.5, 0.35, 0.2, 0.1], 0.25, 3, -0.6 + 0.6 * i, r));
		}
		stems.push({ name: 'Vents', l, r });
		if (onProgress) onProgress(0.9);
	}
	// Other (stereo): shaker on eighths + a bell on beat 3 of every second bar
	{
		const l = mk(), r = mk();
		for (let b = 0; b < bars; b++) {
			for (let k = 0; k < 8; k++) {
				const s0 = Math.floor((b * bar + k * beat / 2) * sr), n = Math.floor(0.05 * sr);
				let y = 0;
				for (let i = 0; i < n && s0 + i < frames; i++) {
					y += 0.8 * ((R() * 2 - 1) - y);
					const v = y * Math.exp(-i / sr / 0.012) * (k % 2 ? 0.07 : 0.11);
					l[s0 + i] += v * 0.7; r[s0 + i] += v * 1.0;
				}
			}
			if (b % 2 === 0) tone(l, sr, b * bar + 2 * beat, 0.3, mtof(prog(b).notes[3] + 12), 0.08, [1, 0.0, 0.6, 0.0, 0.3], 0.002, 0.8, 0.2, r);
		}
		stems.push({ name: 'Autres', l, r });
	}
	if (onProgress) onProgress(1);
	// natural mixing order
	const order = ['Voix', 'Batterie', 'Basse', 'Guitare', 'Piano', 'Vents', 'Autres'];
	stems.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
	return { stems, duration: total, frames, ...DEMO };
}

/** Repeats the demo `times` times (long stress test: 5 min of 7 stems). */
export function tile(stem, times) {
	const n = stem.l.length, l = new Float32Array(n * times);
	for (let k = 0; k < times; k++) l.set(stem.l, k * n);
	let r = null;
	if (stem.r) { r = new Float32Array(n * times); for (let k = 0; k < times; k++) r.set(stem.r, k * n); }
	return { name: stem.name, l, r };
}
