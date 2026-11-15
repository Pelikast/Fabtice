// Checks that the bench reproduces the app: runs `base` on the prototype's
// demo piece (web/spikes/analyse/demo/demo-swing.mp3) and scores it the way
// app/tests/analysis.mjs does (`compare()`): share of the time, sampled every
// 50 ms, where the root, then root and quality, are right. The app's README
// gives 84.2 % and 74.3 %.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { networks } from './networks';
import { ROOT } from './paths';
import base from './variantes/base';

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const demo = join(ROOT, '..', 'analyse', 'demo');
const TRUTH = JSON.parse(readFileSync(join(demo, 'demo-swing.json'), 'utf8')) as {
  key: string;
  beats: [number, number][];
  chords: [number, number, string, string][];
};

const t0 = Date.now();
const r = await base({ id: 'demo-swing', condition: 'demo', mixPath: join(demo, 'demo-swing.mp3'), stemPaths: {}, title: 'demo', meta: {} }, { networks });
const at = (t: number) => {
  let found = null;
  for (const c of r.chords) if (c.time <= t) found = c;
  return found;
};
let total = 0;
let roots = 0;
let rq = 0;
for (const [a, b, , basic] of TRUTH.chords) {
  const [rootName, quality] = basic.split(':') as [string, string];
  const root = PCS.indexOf(rootName);
  for (let t = a; t < b; t += 0.05) {
    total++;
    const c = at(t)?.chord;
    if (!c) continue;
    if (c.root === root) roots++;
    if (c.root === root && c.quality === quality) rq++;
  }
}
const truth = TRUTH.beats.map((b) => b[0]);
const times = r.beats!.times;
const hit = truth.filter((t) => times.some((b) => Math.abs(b - t) <= 0.07)).length;
console.log(`temps trouvés ${((100 * hit) / truth.length).toFixed(1)} % (app : 96,3 %)`);
console.log(`fondamentale juste ${((100 * roots) / total).toFixed(1)} % du temps (app : 84,2 %)`);
console.log(`fondamentale et qualité ${((100 * rq) / total).toFixed(1)} % (app : 74,3 %)`);
console.log(`tonalité ${PCS[r.key!.tonic]} ${r.key!.mode} (connue : ${TRUTH.key}) — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
