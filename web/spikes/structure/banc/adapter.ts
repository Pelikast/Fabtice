// From the app's analysis of a rendered piece to the `HarmonyInput` the
// harmony pass reads (Tier R), and the `StructureEvidence` measured on the
// rendered tracks.
//
// The bars come from the detected beats exactly as the chart does it: a bar
// line every `beatsPerBar` beats from the detected downbeat (full bars before
// it are pick-up bars, numbered −1, −2…), each chord in the bar where it
// starts, on the nearest detected beat. Positions are converted to the
// truth's seconds (÷ timeScale) so that the scorer reads them directly.
//
// IDEALISED: the evidence is measured on the rendered tracks of each
// instrument, i.e. a PERFECT separation; the wind recogniser is simulated
// from the truth (the « realiste » rates of Tier S). A detector author may
// replace `measureEvidence` (the `EvidenceAdapter`) with his own `evidence.ts`.

import { execFileSync } from 'node:child_process';
import type { StemId } from '../../../../app/src/model/separation';
import type { HarmonyBar, HarmonyChord, HarmonyInput, StructureEvidence } from '../../../../app/src/structure/types';
import { knownStandard, type TruthPiece } from '../../../../app/src/structure/bench/cases';
import { NOISE } from '../../../../app/src/structure/bench/noise';
import { rng, seedOf } from '../../../../app/src/structure/bench/rng';
import { BENCH_STEMS, simulatedEvidence, TIMBRE_BANDS, type EvidenceKind } from '../../../../app/src/structure/bench/simEvidence';
import type { DetectedAnalysis } from './analyse';

/** Bars of the chart from a detected grid and chords (times in the analysis' seconds). */
export function barsFromAnalysis(a: Pick<DetectedAnalysis, 'beats' | 'chords'>): HarmonyBar[] {
  const { times, downbeat, beatsPerBar: m } = a.beats;
  const lines: { line: number; bar: number }[] = [];
  let first = downbeat;
  let n = 0;
  while (first - m >= 0) {
    first -= m;
    n--;
  }
  for (let i = first; i + m < times.length; i += m) lines.push({ line: i, bar: n++ });
  const meter = { numerator: m, denominator: m === 6 || m === 9 || m === 12 ? 8 : 4 };
  const chords = a.chords;
  const bars: HarmonyBar[] = [];
  let ci = 0;
  let sounding: (typeof chords)[number] | null = null;
  for (const { line, bar } of lines) {
    const beatTimes = times.slice(line, line + m + 1);
    const start = beatTimes[0]!;
    const end = beatTimes[m]!;
    const half = (beatTimes[1]! - start) / 2;
    while (ci < chords.length && chords[ci]!.time < start - half) sounding = chords[ci++]!;
    const carried = sounding?.chord ?? null;
    const inBar: HarmonyChord[] = [];
    while (ci < chords.length && chords[ci]!.time < end - half) {
      const c = chords[ci++]!;
      sounding = c;
      let beat = 0;
      for (let k = 1; k < m; k++) if (Math.abs(beatTimes[k]! - c.time) < Math.abs(beatTimes[beat]! - c.time)) beat = k;
      const entry: HarmonyChord = { beat, chord: c.chord, doubtful: c.doubtful, byHand: false };
      const last = inBar[inBar.length - 1];
      if (last && last.beat === beat) inBar[inBar.length - 1] = entry;
      else inBar.push(entry);
    }
    bars.push({ bar, start, end, beats: m, meter, chords: inBar, carried: inBar[0]?.beat === 0 ? null : carried });
  }
  return bars;
}

/** Mono samples of an audio file (ffmpeg). */
export function decodeMono(path: string, sampleRate: number): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1', '-ar', String(sampleRate), '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function rmsPerBar(x: Float32Array, sr: number, bars: readonly HarmonyBar[]): Float32Array {
  const out = new Float32Array(bars.length);
  bars.forEach((b, k) => {
    const i0 = Math.max(0, Math.floor(b.start * sr));
    const i1 = Math.min(x.length, Math.floor(b.end * sr));
    let s = 0;
    for (let i = i0; i < i1; i++) s += x[i]! * x[i]!;
    out[k] = i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
  });
  return out;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const ai = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k + len / 2] = re[i + k]! - ar;
        im[i + k + len / 2] = im[i + k]! - ai;
        re[i + k] = re[i + k]! + ar;
        im[i + k] = im[i + k]! + ai;
      }
    }
  }
}

/** Mean log energy of the mix in 8 log-spaced bands (60 Hz … 11 kHz), per bar. */
function timbrePerBar(x: Float32Array, sr: number, bars: readonly HarmonyBar[]): Float32Array {
  const N = 2048;
  const edges = Array.from({ length: TIMBRE_BANDS + 1 }, (_, i) => 60 * Math.pow(11000 / 60, i / TIMBRE_BANDS));
  const bin = (f: number) => Math.min(N / 2, Math.round((f * N) / sr));
  const out = new Float32Array(bars.length * TIMBRE_BANDS);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  bars.forEach((b, k) => {
    const acc = new Float64Array(TIMBRE_BANDS);
    let frames = 0;
    for (let s = Math.floor(b.start * sr); s + N <= Math.min(x.length, Math.floor(b.end * sr)); s += N) {
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i]! * win[i]!;
      fft(re, im);
      for (let band = 0; band < TIMBRE_BANDS; band++) {
        let e = 0;
        for (let f = bin(edges[band]!); f < bin(edges[band + 1]!); f++) e += re[f]! * re[f]! + im[f]! * im[f]!;
        acc[band] += e;
      }
      frames++;
    }
    for (let band = 0; band < TIMBRE_BANDS; band++) out[k * TIMBRE_BANDS + band] = Math.log(1e-9 + acc[band]! / Math.max(1, frames));
  });
  return out;
}

/** Evidence measured on the audio, per detected bar: what is stored in analyses/ (plain arrays). */
export interface MeasuredEvidence {
  stems: Partial<Record<StemId, number[]>>;
  timbre: number[];
}

export function measureEvidence(bars: readonly HarmonyBar[], mixPath: string, stemPaths: Partial<Record<StemId, string>>): MeasuredEvidence {
  const SR = 11025;
  const stems: Partial<Record<StemId, number[]>> = {};
  for (const s of BENCH_STEMS) {
    const p = stemPaths[s];
    stems[s] = p ? Array.from(rmsPerBar(decodeMono(p, SR), SR, bars), (v) => Math.round(v * 1e5) / 1e5) : bars.map(() => 0);
  }
  const timbre = Array.from(timbrePerBar(decodeMono(mixPath, 22050), 22050, bars), (v) => Math.round(v * 1000) / 1000);
  return { stems, timbre };
}

/** The evidence of one kind (`stems`: ideal separation + simulated recogniser; `mix`: timbre only; `none`). */
export function evidenceOf(piece: TruthPiece, truthBars: readonly HarmonyBar[], measured: MeasuredEvidence, kind: EvidenceKind): StructureEvidence | null {
  if (kind === 'none') return null;
  const timbre = { bands: TIMBRE_BANDS, data: Float32Array.from(measured.timbre) };
  if (kind === 'mix') return { stems: null, timbre, winds: null };
  const stems: Partial<Record<StemId, Float32Array>> = {};
  for (const [s, v] of Object.entries(measured.stems)) stems[s as StemId] = Float32Array.from(v);
  const winds = simulatedEvidence(piece, truthBars, 'stems', NOISE.realiste, rng(seedOf(`${piece.id}|winds`)))!.winds;
  return { stems, timbre, winds };
}

/** The bars in the truth's seconds. */
export function toTruthTime(bars: readonly HarmonyBar[], timeScale: number): HarmonyBar[] {
  return bars.map((b) => ({ ...b, start: b.start / timeScale, end: b.end / timeScale }));
}

export function harmonyInput(piece: TruthPiece, a: DetectedAnalysis, measured: MeasuredEvidence, kind: EvidenceKind, known: boolean): HarmonyInput {
  const bars = toTruthTime(barsFromAnalysis(a), a.timeScale);
  const k = known ? knownStandard(piece) : null;
  return {
    bars,
    duration: a.duration / a.timeScale,
    key: a.key,
    keyConfidence: 0.8,
    known: k ? [k] : [],
    evidence: evidenceOf(piece, bars, measured, kind),
    mode: 'auto',
  };
}
