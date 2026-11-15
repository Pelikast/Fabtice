// The bass note of each beat, by harmonic summation (the chord network's
// pitch output does not hear a bass alone: measured on the bench, its best
// pitch class is the root on a quarter of the beats only).
//
// For each beat: the start of the beat (where a walking bass sounds its note),
// Hann window, spectrum at about 5.5 kHz; the salience of every note from E1
// to C4 is the weighted sum of the spectrum at its first six harmonics (the
// fundamental of a bass is often weak, on an old record almost gone); notes
// are folded to pitch classes. Octave errors do not matter here; the
// harmonics of the note a fifth below match only every third one. Pure.

import { fft, hann } from './fft';
import { resampleRatio } from './resample';

export const BASS_SR = 5512.5;
const NFFT = 4096;
const LOW_NOTE = 28; // E1
const HIGH_NOTE = 60; // C4
const HARMONICS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

export interface BassBeat {
  /** Distribution over the 12 pitch classes (sums to 1; flat when nothing sounds). */
  pcs: Float64Array;
  /** 0…1: how clearly a bass note sounds on this beat (energy and peakedness). */
  strength: number;
}

/** The audio brought to the rate of the bass estimate (call once per piece). */
export function bassAudio(audio: Float32Array, sr: number): Float32Array {
  return resampleRatio(audio, sr / BASS_SR, 32);
}

/**
 * The bass note of each segment [t0, t1) (seconds of the audio given). `low`
 * is `bassAudio(...)`; `cents`: the tuning of the recording (`tuning.ts`).
 */
export function bassBeats(low: Float32Array, segments: readonly (readonly [number, number])[], cents = 0): BassBeat[] {
  const tune = Math.pow(2, cents / 1200);
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const notes = HIGH_NOTE - LOW_NOTE + 1;
  const sal = new Float64Array(notes);
  const energies: number[] = [];
  const raw: { pcs: Float64Array; peak: number; energy: number }[] = [];
  for (const [a, b] of segments) {
    const dur = Math.max(0.05, b - a);
    const s0 = Math.floor((a + 0.015) * BASS_SR);
    const len = Math.max(64, Math.min(NFFT, Math.floor(Math.min(0.5, 0.7 * dur) * BASS_SR)));
    const w = hann(len);
    re.fill(0);
    im.fill(0);
    let energy = 0;
    for (let i = 0; i < len; i++) {
      const v = low[s0 + i] ?? 0;
      energy += v * v;
      re[i] = v * w[i]!;
    }
    energy /= len;
    fft(re, im);
    const mag = (f: number) => {
      const x = (f * NFFT) / BASS_SR;
      const k = Math.floor(x);
      if (k + 1 >= NFFT / 2) return 0;
      const m0 = Math.sqrt(Math.hypot(re[k]!, im[k]!));
      const m1 = Math.sqrt(Math.hypot(re[k + 1]!, im[k + 1]!));
      return m0 + (m1 - m0) * (x - k);
    };
    for (let n = 0; n < notes; n++) {
      const f0 = tune * 440 * Math.pow(2, (LOW_NOTE + n - 69) / 12);
      let s = 0;
      for (let h = 0; h < HARMONICS.length; h++) s += HARMONICS[h]! * mag(f0 * (h + 1));
      sal[n] = s;
    }
    const pcs = new Float64Array(12);
    for (let n = 0; n < notes; n++) {
      const pc = (LOW_NOTE + n) % 12;
      if (sal[n]! > pcs[pc]!) pcs[pc] = sal[n]!;
    }
    const sorted = Array.from(pcs).sort((x, y) => x - y);
    const med = sorted[6]!;
    const top = sorted[11]!;
    let tot = 0;
    for (let k = 0; k < 12; k++) {
      const v = Math.max(0, pcs[k]! - med);
      pcs[k] = v * v;
      tot += pcs[k]!;
    }
    if (tot > 0) for (let k = 0; k < 12; k++) pcs[k]! /= tot;
    else pcs.fill(1 / 12);
    raw.push({ pcs, peak: top > 0 ? (top - med) / top : 0, energy });
    energies.push(energy);
  }
  const sortedE = energies.slice().sort((x, y) => x - y);
  const medE = sortedE[Math.floor(sortedE.length / 2)] ?? 0;
  return raw.map((r) => ({
    pcs: r.pcs,
    strength: medE > 0 ? Math.min(1, r.energy / medE) * Math.min(1, 2 * r.peak) : 0,
  }));
}
