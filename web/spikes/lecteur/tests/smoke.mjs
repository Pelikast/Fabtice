import { makeCore, stemFromFloat, run, sine, zeroCrossFreq, cents, SR, ENGINES } from './helpers.mjs';
for (const key of Object.keys(ENGINES)) {
	const t0 = performance.now();
	const core = await makeCore(key);
	const x = sine(440, 8);
	core.addStem(stemFromFloat(x, x));
	core.semitones = 5; core.setRate(1);
	core.play();
	const quanta = Math.round(4 * SR / 128);
	const { L } = run(core, quanta);
	const f = zeroCrossFreq(L, SR, 4 * SR);
	console.log(key, 'lat a,b', core.lat.a.toFixed(0), core.lat.b.toFixed(0), 'f', f.toFixed(2), 'expected', (440 * 2 ** (5 / 12)).toFixed(2), 'err cents', cents(f, 440 * 2 ** (5 / 12)).toFixed(2), 'ms', (performance.now() - t0).toFixed(0), 'underruns', core.stat.underruns);
}
