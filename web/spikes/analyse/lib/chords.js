// Frame-level chord evidence from the CREMA structured chord model (McFee & Bello,
// ISMIR 2017), converted to ONNX with its constant-Q front end inside the graph.
// Outputs per frame (hop 4096 at 44.1 kHz): 170 chord posteriors, 12 pitch-class
// sigmoids, root and bass posteriors (13 classes: 12 pitch classes + none).

export const CREMA = { sr: 44100, hop: 4096 };

export const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const QUALS = ['maj', 'min', 'aug', 'dim', 'sus2', 'sus4', '7', 'maj7', 'min7', 'minmaj7', 'maj6', 'min6', 'dim7', 'hdim7'];

// Chord tones (semitones above the root) for each quality.
export const QUAL_PCS = {
  maj: [0, 4, 7], min: [0, 3, 7], aug: [0, 4, 8], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], minmaj7: [0, 3, 7, 11],
  maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], dim7: [0, 3, 6, 9], hdim7: [0, 3, 6, 10],
};

// CREMA's label encoder sorts the 170 label strings.
function cremaLabels() {
  const labels = ['N', 'X'];
  for (const r of PCS) for (const q of QUALS) labels.push(`${r}:${q}`);
  return labels.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
export const CREMA_LABELS = cremaLabels();

// Our own chord index: 0..167 = root * 14 + quality, 168 = N (no chord). X is dropped.
export const N_CHORDS = 169;
export const NO_CHORD = 168;
export const chordRoot = (c) => (c === NO_CHORD ? -1 : Math.floor(c / 14));
export const chordQual = (c) => (c === NO_CHORD ? null : QUALS[c % 14]);
export const chordPcs = (c) => (c === NO_CHORD ? [] : QUAL_PCS[QUALS[c % 14]].map((i) => (i + chordRoot(c)) % 12));
export const harteLabel = (c) => (c === NO_CHORD ? 'N' : `${PCS[chordRoot(c)]}:${QUALS[c % 14]}`);

const cremaToOurs = CREMA_LABELS.map((l) => {
  if (l === 'N') return NO_CHORD;
  if (l === 'X') return -1;
  const [r, q] = l.split(':');
  return PCS.indexOf(r) * 14 + QUALS.indexOf(q);
});

// Run the model. audio: mono Float32Array at 44.1 kHz (already tuning-corrected if wanted).
// Returns frame posteriors re-indexed to our vocabulary (X removed and renormalised).
export async function cremaFrames(ort, session, audio) {
  const res = await session.run({ audio: new ort.Tensor('float32', audio, [1, audio.length]) });
  const tag = res.chord_tag, T = tag.dims[0];
  const probs = new Float32Array(T * N_CHORDS);
  for (let t = 0; t < T; t++) {
    let s = 0;
    for (let i = 0; i < 170; i++) {
      const c = cremaToOurs[i];
      if (c < 0) continue;
      const v = tag.data[t * 170 + i];
      probs[t * N_CHORDS + c] = v;
      s += v;
    }
    for (let c = 0; c < N_CHORDS; c++) probs[t * N_CHORDS + c] /= s || 1;
  }
  return {
    T, fps: CREMA.sr / CREMA.hop, probs,
    pitch: res.chord_pitch.data.slice(), // [T,12]
    root: res.chord_root.data.slice(),   // [T,13]
    bass: res.chord_bass.data.slice(),   // [T,13]
  };
}

// Pool frame evidence over segments [t0, t1) given in seconds of the ORIGINAL audio.
// timeScale maps original time to model time (tuning correction stretches the audio).
export function poolSegments(fr, segments, timeScale = 1) {
  const out = [];
  for (const [t0, t1] of segments) {
    let f0 = Math.ceil(t0 * timeScale * fr.fps), f1 = Math.ceil(t1 * timeScale * fr.fps);
    f0 = Math.max(0, Math.min(fr.T - 1, f0));
    f1 = Math.max(f0 + 1, Math.min(fr.T, f1));
    const logp = new Float64Array(N_CHORDS), pitch = new Float64Array(12), bass = new Float64Array(13);
    const n = f1 - f0;
    for (let f = f0; f < f1; f++) {
      for (let c = 0; c < N_CHORDS; c++) logp[c] += Math.log(fr.probs[f * N_CHORDS + c] + 1e-6) / n;
      for (let k = 0; k < 12; k++) pitch[k] += fr.pitch[f * 12 + k] / n;
      for (let k = 0; k < 13; k++) bass[k] += fr.bass[f * 13 + k] / n;
    }
    out.push({ t0, t1, logp, pitch, bass, frames: n });
  }
  return out;
}

// Frame-wise argmax chord segments (the model's raw reading, no grid, no prior).
export function rawSegments(fr, timeScale = 1) {
  const segs = [];
  for (let t = 0; t < fr.T; t++) {
    let best = 0;
    for (let c = 1; c < N_CHORDS; c++) if (fr.probs[t * N_CHORDS + c] > fr.probs[t * N_CHORDS + best]) best = c;
    const time = (t - 0.5) / fr.fps / timeScale;
    if (segs.length && segs[segs.length - 1].chord === best) continue;
    segs.push({ t0: Math.max(0, time), chord: best });
  }
  for (let i = 0; i < segs.length; i++) segs[i].t1 = i + 1 < segs.length ? segs[i + 1].t0 : (fr.T - 0.5) / fr.fps / timeScale;
  return segs;
}
