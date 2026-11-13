// Bar-pointer dynamic Bayesian network decoded with Viterbi, a re-implementation of the
// state space, transition and observation models of madmom's DBNDownBeatTrackingProcessor
// (Krebs, Böck, Widmer 2015; Böck, Krebs, Widmer 2016). No madmom code or weights are used.
// Tempo may change at every beat; the transition_lambda sets how strongly it is held steady.

import { sigmoid, refinePeak } from './beats.js';

const EPS = 1e-5;

function buildSpace(beatsPerBar, minInterval, maxInterval) {
  const intervals = [];
  for (let i = minInterval; i <= maxInterval; i++) intervals.push(i);
  const K = intervals.length;
  const perBeat = intervals.reduce((a, b) => a + b, 0);
  const offsets = new Int32Array(K); // offset of tempo k inside one beat block
  let o = 0;
  for (let k = 0; k < K; k++) { offsets[k] = o; o += intervals[k]; }
  return { beatsPerBar, intervals, K, perBeat, offsets, numStates: perBeat * beatsPerBar };
}

function tempoTransitions(intervals, lambda) {
  const K = intervals.length;
  const logp = new Float64Array(K * K);
  for (let i = 0; i < K; i++) {
    let sum = 0;
    const row = new Float64Array(K);
    for (let j = 0; j < K; j++) {
      const p = Math.exp(-lambda * Math.abs(intervals[j] / intervals[i] - 1));
      row[j] = p > 2.220446049250313e-16 ? p : 0;
      sum += row[j];
    }
    for (let j = 0; j < K; j++) logp[i * K + j] = row[j] > 0 ? Math.log(row[j] / sum) : -Infinity;
  }
  return logp;
}

// act: { beat, down } logits per frame at fps. Returns beats (s), beat numbers and log-prob.
// beatsPerBar = 1 gives a beat-only tracker (downbeat activations ignored).
export function dbnDecode(act, { beatsPerBar = 4, minBpm = 55, maxBpm = 215, lambda = 100, obsLambda = 16 } = {}) {
  const fps = act.fps;
  const T = act.frames;
  const minI = Math.round((60 * fps) / maxBpm);
  const maxI = Math.round((60 * fps) / minBpm);
  const sp = buildSpace(beatsPerBar, minI, maxI);
  const { K, perBeat, offsets, intervals, numStates } = sp;
  const logTm = tempoTransitions(intervals, lambda);

  // Observation log densities per frame: [nonbeat, beat, downbeat].
  const ob = new Float64Array(T * 3);
  for (let t = 0; t < T; t++) {
    let b = sigmoid(act.beat[t]) * (1 - EPS) + EPS / 2;
    let d = sigmoid(act.down[t]) * (1 - EPS) + EPS / 2;
    let beatOnly, down;
    if (beatsPerBar === 1) { beatOnly = b; down = b; }
    else { beatOnly = Math.max(b - d, EPS / 2); down = d; }
    const sum = beatsPerBar === 1 ? b : beatOnly + down;
    ob[t * 3] = Math.log(Math.max(1 - sum, 1e-12) / (obsLambda - 1));
    ob[t * 3 + 1] = Math.log(beatOnly);
    ob[t * 3 + 2] = Math.log(down);
  }
  // Pointer per state: 0 nonbeat, 1 beat, 2 downbeat.
  const ptr = new Uint8Array(numStates);
  for (let bb = 0; bb < beatsPerBar; bb++) {
    for (let k = 0; k < K; k++) {
      const L = intervals[k];
      for (let p = 0; p < L; p++) {
        const s = bb * perBeat + offsets[k] + p;
        if (p / L < 1 / obsLambda) ptr[s] = bb === 0 ? 2 : 1;
      }
    }
  }
  let prev = new Float64Array(numStates);
  let cur = new Float64Array(numStates);
  const init = -Math.log(numStates);
  for (let s = 0; s < numStates; s++) prev[s] = init + ob[ptr[s]];
  // Back-pointers only for beat-start states (p = 0): best previous tempo index.
  const bp = new Int16Array(T * beatsPerBar * K);
  const lastVals = new Float64Array(K);
  for (let t = 1; t < T; t++) {
    const o0 = ob[t * 3], o1 = ob[t * 3 + 1], o2 = ob[t * 3 + 2];
    const oo = [o0, o1, o2];
    for (let bb = 0; bb < beatsPerBar; bb++) {
      const base = bb * perBeat;
      // Within-beat advance.
      for (let k = 0; k < K; k++) {
        const L = intervals[k];
        const s0 = base + offsets[k];
        for (let p = L - 1; p >= 1; p--) cur[s0 + p] = prev[s0 + p - 1] + oo[ptr[s0 + p]];
      }
      // Beat boundary: from the last position of the previous beat in the bar.
      const pb = (bb + beatsPerBar - 1) % beatsPerBar;
      const pbase = pb * perBeat;
      for (let k = 0; k < K; k++) lastVals[k] = prev[pbase + offsets[k] + intervals[k] - 1];
      for (let j = 0; j < K; j++) {
        let best = -Infinity, arg = 0;
        for (let k = 0; k < K; k++) {
          const v = lastVals[k] + logTm[k * K + j];
          if (v > best) { best = v; arg = k; }
        }
        const s = base + offsets[j];
        cur[s] = best + oo[ptr[s]];
        bp[(t * beatsPerBar + bb) * K + j] = arg;
      }
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  let best = -Infinity, bs = 0;
  for (let s = 0; s < numStates; s++) if (prev[s] > best) { best = prev[s]; bs = s; }
  // Backtrack.
  const path = new Int32Array(T);
  let s = bs;
  for (let t = T - 1; t >= 0; t--) {
    path[t] = s;
    if (t === 0) break;
    const bb = Math.floor(s / perBeat);
    const r = s - bb * perBeat;
    let k = 0;
    while (k + 1 < K && offsets[k + 1] <= r) k++;
    const p = r - offsets[k];
    if (p > 0) s = s - 1;
    else {
      const pk = bp[(t * beatsPerBar + bb) * K + k];
      const pb = (bb + beatsPerBar - 1) % beatsPerBar;
      s = pb * perBeat + offsets[pk] + intervals[pk] - 1;
    }
  }
  // madmom's "correct" step: inside each beat region pick the frame of highest activation.
  const beats = [], numbers = [];
  let t = 0;
  while (t < T) {
    if (ptr[path[t]] >= 1) {
      let e = t;
      while (e + 1 < T && ptr[path[e + 1]] >= 1) e++;
      let pk = t, pv = -Infinity;
      for (let u = t; u <= e; u++) {
        const v = Math.max(act.beat[u], beatsPerBar === 1 ? -Infinity : act.down[u]);
        if (v > pv) { pv = v; pk = u; }
      }
      beats.push(refinePeak(act.beat, pk) / fps);
      numbers.push(Math.floor(path[pk] / perBeat) + 1);
      t = e + 1;
    } else t++;
  }
  return { beats, numbers, logProb: best, beatsPerBar };
}
