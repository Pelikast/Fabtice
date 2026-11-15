// Diagnostic: the app's decoding step on network outputs dumped from the app
// in Chromium (JSON: frames, activations, tuning, bass line), next to the
// bench's own outputs for the same file. Usage:
//   node dist/sonde-app.mjs <dump.json> <corpus audio file> <title>

import { readFileSync } from 'node:fs';
import { resultFromOutputs } from '../../../../app/src/analysis/engine/analyse';
import { analyseChart } from '../../../../app/src/analysis/engine/chart';
import { gridFromActivations } from '../../../../app/src/analysis/engine/pipeline';
import type { NetworkOutputs } from '../../../../app/src/analysis/engine/pipeline';
import { lowAudio } from './ecoute';
import { networks } from './networks';
import { knownFor } from './variantes/app';

const [dumpPath, audioPath, title] = process.argv.slice(2) as [string, string, string];
const d = JSON.parse(readFileSync(dumpPath, 'utf8'));
const f32 = (a: number[]) => Float32Array.from(a);
const appOut: NetworkOutputs = {
  tuning: d.tuning,
  timeScale: d.timeScale,
  act: { beat: f32(d.beat), down: f32(d.down), frames: d.act, fps: d.actFps },
  frames: { T: d.T, fps: d.fps, probs: f32(d.probs), pitch: f32(d.pitch), bass: f32(d.bass) },
  listening: { harmony: null, bass: { low: f32(d.low), from: 'band' } },
};
const net = await networks(audioPath);
const benchOut: NetworkOutputs = { ...net.outputs, listening: { harmony: null, bass: { low: await lowAudio({ paths: [audioPath], transform: 'bass' }), from: 'band' } } };
const known = await knownFor(title);
for (const [name, o] of [['app', appOut], ['banc', benchOut]] as const) {
  const r = resultFromOutputs({ outputs: o, grid: null, key: null, known, duration: net.duration, models: [] });
  const bt = r.beats.times; const iv = bt.slice(1).map((x, i) => x - bt[i]!);
  const odd = iv.map((v, i) => [i, v] as const).filter(([, v]) => v < 0.3 || v > 0.6).map(([i, v]) => `${bt[i]!.toFixed(2)}:${v.toFixed(2)}`);
  console.log(name, 'repaired', JSON.stringify((r.beats as { repaired?: unknown }).repaired ?? []), 'odd', odd.slice(0, 30).join(' '), 'last', bt[bt.length - 1]);
  const g = gridFromActivations(o.act).grid;
  const run = analyseChart({ frames: o.frames, timeScale: o.timeScale, grid: g, cents: o.tuning.cents, bass: o.listening!.bass, known });
  const run0 = analyseChart({ frames: o.frames, timeScale: o.timeScale, grid: g, cents: o.tuning.cents, bass: null, known });
  console.log(name, 'fit', run.fit?.accepted, run.fit?.reason, 'form', run.repeats?.formLength, '| without bass cue: fit', run0.fit?.accepted, run0.fit?.reason, 'form', run0.repeats?.formLength);
  console.log(name, JSON.stringify({ tuning: o.tuning.cents, timeScale: o.timeScale, T: o.frames.T, beats: r.beats.times.length, firstBeats: r.beats.times.slice(0, 4).map((x) => x.toFixed(3)), downbeat: r.beats.downbeat, low: o.listening!.bass!.low.length, key: r.key, evidence: (r as { evidence?: unknown }).evidence }));
}
