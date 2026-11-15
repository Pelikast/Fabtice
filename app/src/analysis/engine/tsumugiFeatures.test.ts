// The input side of the Tsumugi-Chords model. Parity with the author's Python on bench
// files is checked in web/spikes/accords/modeles/ts/ (make_fixtures.py, ts_parity.py).

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BEAT_FEATURES,
  KEY_FEATURES,
  WINDOW_FRAMES,
  beatFeatures,
  keyFeatures,
  keyIndex,
  keyName,
  resampleTo25600,
  stitch,
  windowPlan,
  windowWave,
} from './tsumugiFeatures';


test('key index as the author writes it', () => {
  assert.equal(keyIndex('E:major'), 4);
  assert.equal(keyIndex('A:minor'), 21);
  assert.equal(keyIndex('Bb:major'), 10);
  assert.equal(keyIndex('D:dorian'), 0);
  assert.equal(keyIndex('H:major'), null);
  assert.equal(keyName(10, 'minor'), 'A#:minor');
});

test('window plan: 30 s windows, middle 20 s kept, last one on the end', () => {
  assert.deepEqual(windowPlan(25_600 * 10).windows, [{ start: 0, keepFrom: 0, keepTo: 250 }]);
  const { frames, windows } = windowPlan(25_600 * 61);
  assert.equal(frames, 1525);
  assert.deepEqual(windows, [
    { start: 0, keepFrom: 0, keepTo: 500 },
    { start: 375, keepFrom: 500, keepTo: 1000 },
    { start: 775, keepFrom: 1000, keepTo: 1500 },
    { start: 775, keepFrom: 1500, keepTo: 1525 },
  ]);
  // every frame kept exactly once
  const seen = new Uint8Array(frames);
  for (const w of windows) for (let f = w.keepFrom; f < w.keepTo; f++) seen[f]!++;
  assert.ok(seen.every((v) => v === 1));
});

test('window wave pads past the end and keeps both channels', () => {
  const l = new Float32Array(2000).fill(1);
  const r = new Float32Array(2000).fill(-1);
  const w = windowWave(l, r, { start: 1, keepFrom: 1, keepTo: 2 });
  assert.equal(w.length, 2 * 768_000);
  assert.equal(w[0], 1);
  assert.equal(w[2000 - 1024 - 1], 1);
  assert.equal(w[2000 - 1024], 0);
  assert.equal(w[768_000], -1);
});

test('stitch copies the kept frames only', () => {
  const song = new Float32Array(10 * 2).fill(-1);
  const out = Float32Array.from({ length: WINDOW_FRAMES * 2 }, (_, i) => i);
  stitch(song, out, { start: 0, keepFrom: 2, keepTo: 4 }, 2);
  assert.deepEqual([...song.slice(0, 10)], [-1, -1, -1, -1, 4, 5, 6, 7, -1, -1]);
});

test('beat features on a regular grid', () => {
  const beats = Array.from({ length: 80 }, (_, i) => i * 0.5);
  const downbeats = beats.filter((_, i) => i % 4 === 0);
  const f = beatFeatures(beats, downbeats, 0);
  assert.equal(f.length, WINDOW_FRAMES * BEAT_FEATURES);
  assert.equal(f[0 * BEAT_FEATURES + 0], 1); // beat at 0 s
  assert.equal(f[12 * BEAT_FEATURES + 0], 1); // beat at 0.5 s -> frame 12
  assert.equal(f[50 * BEAT_FEATURES + 1], 1); // downbeat at 2 s -> frame 50
  assert.equal(f[3 * BEAT_FEATURES + 10], 1);
  assert.equal(beatFeatures([1], [], 0).every((v) => v === 0), true);
});

test('key features: one-hot and present inside the span only', () => {
  const k = keyFeatures([{ start: 1, end: 2, key: 'G:major' }], 0);
  assert.equal(k[10 * KEY_FEATURES + 7], 0);
  assert.equal(k[30 * KEY_FEATURES + 7], 1);
  assert.equal(k[30 * KEY_FEATURES + 24], 1);
  assert.equal(k[60 * KEY_FEATURES + 7], 0);
});

test('resampler: a 1 kHz tone at 48 kHz stays a 1 kHz tone at 25.6 kHz', () => {
  const x = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 48_000));
  const y = resampleTo25600(x, 48_000);
  assert.equal(y.length, 25_600);
  let err = 0;
  for (let j = 2000; j < 23_000; j++) err = Math.max(err, Math.abs(y[j]! - Math.sin((2 * Math.PI * 1000 * j) / 25_600)));
  assert.ok(err < 2e-3, `max error ${err}`);
  // an 18 kHz tone (above the new Nyquist) is removed
  const z = resampleTo25600(Float32Array.from({ length: 48_000 }, (_, i) => Math.sin((2 * Math.PI * 18_000 * i) / 48_000)), 48_000);
  let peak = 0;
  for (let j = 2000; j < 23_000; j++) peak = Math.max(peak, Math.abs(z[j]!));
  assert.ok(peak < 1e-3, `alias ${peak}`);
});
