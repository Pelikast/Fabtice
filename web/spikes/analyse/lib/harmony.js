// Beat-synchronous chord decoding with a jazz-harmony transition prior.
//
// State = one of 168 chords (12 roots x 14 qualities) or N. One HMM step per beat.
// - Emission: CREMA's log-posteriors averaged over the frames of the beat, scaled by gamma.
// - Change probability depends on the metric position of the beat (bar start, half bar,
//   other beats), so charts change chords where lead sheets do.
// - When the chord changes, the next chord is drawn from a prior over root motion and
//   quality pairs (ii-V, V-I, tritone substitution, backdoor, passing diminished...),
//   plus a soft fit to the estimated key. The prior only re-ranks readings the audio
//   already supports: with gamma large it fades away.
// Viterbi gives the chart; forward-backward gives each segment's confidence.

import { N_CHORDS, NO_CHORD, chordRoot, chordQual, QUAL_PCS } from './chords.js';

const DOM = new Set(['7']);
const MAJ = new Set(['maj', 'maj7', 'maj6']);
const MIN = new Set(['min', 'min7', 'min6', 'minmaj7']);

// Root-motion and quality-pair score for a -> b (a != b), in nats.
export function motionScore(a, b) {
  if (a === NO_CHORD || b === NO_CHORD) return 0;
  const ra = chordRoot(a), rb = chordRoot(b), qa = chordQual(a), qb = chordQual(b);
  const d = (rb - ra + 12) % 12;
  let s = 0;
  switch (d) {
    case 5: // down a fifth: the engine of functional harmony
      s += 1.5;
      if ((qa === 'min7' || qa === 'hdim7' || qa === 'min') && DOM.has(qb)) s += 1.0; // ii-V
      if (DOM.has(qa) && (MAJ.has(qb) || MIN.has(qb) || DOM.has(qb))) s += 1.0;        // V-I, chains of dominants
      break;
    case 11: // down a semitone: tritone substitute resolving, chromatic ii-V
      s += 0.6;
      if (DOM.has(qa)) s += 1.0;
      if (qa === 'min7' && DOM.has(qb)) s += 0.3;
      break;
    case 6: // V7 <-> bII7 (tritone substitution), I -> #iv-7b5
      if (DOM.has(qa) && DOM.has(qb)) s += 0.8;
      if (qb === 'hdim7') s += 0.5;
      break;
    case 1: // up a semitone: passing diminished, Imaj7-#Idim7-ii-7
      s += 0.3;
      if (qa === 'dim7' || qb === 'dim7') s += 0.8;
      break;
    case 2: case 10: // whole steps: I-ii, IV-V, backdoor bVII7-I
      s += 0.4;
      if (d === 2 && DOM.has(qa) && MAJ.has(qb)) s += 0.6;
      break;
    case 9: // down a minor third: I-vi in turnarounds
      s += 0.5;
      break;
    case 7: s += 0.3; break;
    case 0: // same root, new colour: I-I7, ii-7 pedal, minor line cliche
      s += 0.6;
      break;
    default: s += 0;
  }
  return s;
}

// How well chord c fits key (tonic pc, minor flag). 0..1.
export function keyFit(c, tonic, minor) {
  if (c === NO_CHORD) return 0;
  const d = (chordRoot(c) - tonic + 12) % 12, q = chordQual(c);
  const isMaj = MAJ.has(q), isMin = MIN.has(q), isDom = DOM.has(q);
  if (!minor) {
    switch (d) {
      case 0: return isMaj ? 1 : isDom ? 0.6 : 0;
      case 2: return isMin ? 1 : isDom ? 0.6 : 0;
      case 4: return isMin ? 0.8 : isDom ? 0.6 : 0;
      case 5: return isMaj ? 1 : isMin ? 0.5 : isDom ? 0.6 : 0;
      case 7: return isDom || q === 'maj' || q === 'sus4' ? 1 : 0;
      case 9: return isMin ? 1 : isDom ? 0.6 : 0;
      case 11: return q === 'hdim7' ? 0.8 : q === 'dim7' || q === 'dim' ? 0.5 : isDom ? 0.4 : 0;
      case 1: return isDom ? 0.5 : q === 'dim7' ? 0.3 : 0;
      case 10: return isDom ? 0.5 : 0;
      case 6: return q === 'hdim7' ? 0.4 : q === 'dim7' ? 0.3 : 0;
      case 3: return q === 'dim7' ? 0.3 : 0;
      case 8: return isDom ? 0.3 : q === 'dim7' ? 0.3 : 0;
    }
  } else {
    switch (d) {
      case 0: return isMin ? 1 : 0;
      case 2: return q === 'hdim7' ? 1 : q === 'min7' ? 0.4 : q === 'dim' ? 0.6 : 0;
      case 3: return isMaj ? 0.8 : 0;
      case 5: return isMin ? 0.8 : isDom ? 0.4 : 0;
      case 7: return isDom || q === 'maj' ? 1 : q === 'min7' ? 0.3 : 0;
      case 8: return isMaj ? 0.8 : isDom ? 0.4 : 0;
      case 10: return isDom ? 0.6 : q === 'maj' ? 0.5 : 0;
      case 11: return q === 'dim7' ? 0.6 : 0;
      case 1: return isDom ? 0.4 : 0;
      case 9: return q === 'hdim7' ? 0.5 : 0;
      default: return 0;
    }
  }
  return 0;
}

// Change probability by position in the bar (1-based beat number).
export function changeProb(beatNumber, beatsPerBar) {
  if (beatNumber === 1) return 0.55;
  if (beatsPerBar % 2 === 0 && beatNumber === beatsPerBar / 2 + 1) return 0.25;
  return 0.04;
}

export const DEFAULTS = { gamma: 3, beta: 1, kappa: 1.5, priorOn: true };

function transitionMatrix(key, opts) {
  const { beta, kappa, priorOn } = opts;
  const M = new Float64Array(N_CHORDS * N_CHORDS); // probabilities given a change
  const fit = new Float64Array(N_CHORDS);
  if (key && priorOn) for (let c = 0; c < N_CHORDS; c++) fit[c] = keyFit(c, key.tonic, key.minor);
  for (let a = 0; a < N_CHORDS; a++) {
    let s = 0;
    for (let b = 0; b < N_CHORDS; b++) {
      if (a === b) continue;
      let sc = priorOn ? beta * motionScore(a, b) + kappa * fit[b] : 0;
      if (b === NO_CHORD) sc -= 1;
      const v = Math.exp(sc);
      M[a * N_CHORDS + b] = v;
      s += v;
    }
    for (let b = 0; b < N_CHORDS; b++) M[a * N_CHORDS + b] /= s;
  }
  return M;
}

// units: pooled evidence per beat (from poolSegments), numbers: beat numbers, bpb: meter.
export function decodeChords(units, numbers, bpb, key, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const n = units.length;
  if (!n) return { path: [], post: [] };
  const M = transitionMatrix(key, opts);
  const S = N_CHORDS;
  const em = units.map((u) => {
    const e = new Float64Array(S);
    for (let c = 0; c < S; c++) e[c] = opts.gamma * u.logp[c];
    return e;
  });
  const logM = M.map((v) => Math.log(v + 1e-300));
  // Viterbi.
  let delta = Float64Array.from(em[0], (v) => v - Math.log(S));
  const bp = [];
  for (let i = 1; i < n; i++) {
    const pc = opts.priorOn ? changeProb(numbers[i], bpb) : 0.2;
    const ls = Math.log(1 - pc), lc = Math.log(pc);
    const nd = new Float64Array(S), b = new Int16Array(S);
    for (let y = 0; y < S; y++) {
      let best = delta[y] + ls, arg = y;
      for (let x = 0; x < S; x++) {
        if (x === y) continue;
        const v = delta[x] + lc + logM[x * S + y];
        if (v > best) { best = v; arg = x; }
      }
      nd[y] = best + em[i][y];
      b[y] = arg;
    }
    delta = nd; bp.push(b);
  }
  const path = new Array(n);
  let y = 0;
  for (let c = 1; c < S; c++) if (delta[c] > delta[y]) y = c;
  for (let i = n - 1; i >= 0; i--) { path[i] = y; if (i > 0) y = bp[i - 1][y]; }
  // Forward-backward with per-step scaling for posteriors.
  const lik = em.map((e) => { let m = -Infinity; for (const v of e) if (v > m) m = v; return Float64Array.from(e, (v) => Math.exp(v - m)); });
  const A = [];
  let a = Float64Array.from(lik[0], (v) => v / S);
  let z = a.reduce((p, q) => p + q, 0); a = a.map((v) => v / z); A.push(a);
  const pcs = [0];
  for (let i = 1; i < n; i++) {
    const pc = opts.priorOn ? changeProb(numbers[i], bpb) : 0.2;
    pcs.push(pc);
    const na = new Float64Array(S);
    for (let x = 0; x < S; x++) {
      const ax = A[i - 1][x];
      if (ax < 1e-12) continue;
      na[x] += ax * (1 - pc);
      const row = x * S, w = ax * pc;
      for (let y2 = 0; y2 < S; y2++) if (y2 !== x) na[y2] += w * M[row + y2];
    }
    let s = 0;
    for (let c = 0; c < S; c++) { na[c] *= lik[i][c]; s += na[c]; }
    for (let c = 0; c < S; c++) na[c] /= s || 1;
    A.push(na);
  }
  const post = new Array(n);
  let beta = new Float64Array(S).fill(1);
  post[n - 1] = A[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    const pc = pcs[i + 1];
    const tmp = Float64Array.from(beta, (v, c) => v * lik[i + 1][c]);
    const nb = new Float64Array(S);
    let tot = 0;
    for (let c = 0; c < S; c++) tot += tmp[c];
    for (let x = 0; x < S; x++) {
      let s = (1 - pc) * tmp[x];
      const row = x * S;
      let acc = 0;
      for (let y2 = 0; y2 < S; y2++) if (y2 !== x) acc += M[row + y2] * tmp[y2];
      s += pc * acc;
      nb[x] = s / (tot || 1);
    }
    beta = nb;
    const g = Float64Array.from(A[i], (v, c) => v * beta[c]);
    const gs = g.reduce((p, q) => p + q, 0);
    post[i] = g.map((v) => v / (gs || 1));
  }
  return { path, post };
}

// Tension candidates per quality: semitone above root -> label.
const TENSIONS = {
  '7': { 1: 'b9', 2: '9', 3: '#9', 6: '#11', 8: 'b13', 9: '13' },
  maj: { 2: '9', 6: '#11', 9: '6' }, maj7: { 2: '9', 6: '#11', 9: '13' }, maj6: { 2: '9' },
  min: { 2: '9', 5: '11', 9: '6' }, min7: { 2: '9', 5: '11' }, min6: { 2: '9' }, minmaj7: { 2: '9' },
  hdim7: { 2: '9', 5: '11' }, sus4: { 2: '9', 10: '7' }, sus2: { 10: '7' },
};

// Group beats into chord segments and attach confidences and suggestions.
export function buildSegments(units, beatTimes, path, post, { extThreshold = 0.5, bassThreshold = 0.55 } = {}) {
  const segs = [];
  for (let i = 0; i < path.length; i++) {
    if (segs.length && segs[segs.length - 1].chord === path[i]) { segs[segs.length - 1].beats.push(i); continue; }
    segs.push({ chord: path[i], beats: [i] });
  }
  for (const s of segs) {
    const conf = new Float64Array(N_CHORDS);
    const pitch = new Float64Array(12), bass = new Float64Array(13);
    let frames = 0;
    for (const i of s.beats) {
      for (let c = 0; c < N_CHORDS; c++) conf[c] += post[i][c] / s.beats.length;
      const u = units[i];
      for (let k = 0; k < 12; k++) pitch[k] += u.pitch[k] * u.frames;
      for (let k = 0; k < 13; k++) bass[k] += u.bass[k] * u.frames;
      frames += u.frames;
    }
    for (let k = 0; k < 12; k++) pitch[k] /= frames || 1;
    for (let k = 0; k < 13; k++) bass[k] /= frames || 1;
    s.t0 = beatTimes[s.beats[0]];
    s.t1 = beatTimes[s.beats[s.beats.length - 1] + 1] ?? (s.t0 + 0.5);
    // The HMM marginal is over-confident (doubtful segments barely ever fall below 0.5).
    // The geometric mean of the network's own frame posterior for the chosen chord is
    // better calibrated (measured on GuitarSet), so it drives the "doubtful" flag.
    s.posterior = conf[s.chord];
    const geo = new Float64Array(N_CHORDS);
    for (const i of s.beats) for (let c = 0; c < N_CHORDS; c++) geo[c] += units[i].logp[c] / s.beats.length;
    s.confidence = Math.exp(geo[s.chord]);
    const order = [...geo.keys()].sort((x, y) => geo[y] - geo[x]);
    s.alternatives = order.filter((c) => c !== s.chord).slice(0, 2).map((c) => ({ chord: c, p: Math.exp(geo[c]) }));
    s.pitch = Array.from(pitch);
    s.extensions = [];
    s.bass = null;
    if (s.chord !== NO_CHORD) {
      const r = chordRoot(s.chord), q = chordQual(s.chord);
      const tones = new Set(QUAL_PCS[q]);
      for (const [iv, name] of Object.entries(TENSIONS[q] || {})) {
        const k = (r + Number(iv)) % 12;
        if (tones.has(Number(iv))) continue;
        if (pitch[k] >= extThreshold) s.extensions.push({ name, p: pitch[k] });
      }
      s.extensions.sort((x, y) => y.p - x.p);
      let bb = 0;
      for (let k = 1; k < 12; k++) if (bass[k] > bass[bb]) bb = k;
      const iv = (bb - r + 12) % 12;
      if (iv !== 0 && bass[bb] >= bassThreshold && tones.has(iv)) s.bass = { pc: bb, p: bass[bb] };
    }
  }
  return segs;
}
