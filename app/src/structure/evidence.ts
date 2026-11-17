// What the audio says, bar by bar, about who plays (`StructureEvidence`):
// the level of each separated track, the coarse timbre of the mix, the
// melody each lead-capable track plays, and (second step) which wind
// instrument the « Autres » track holds.
//
//   level    RMS of each separated track per bar
//   timbre   8 log-energy bands of the mix per bar (60 Hz … 11 kHz); without
//            the mix in memory, the separated tracks' energies added up
//   melody   per lead-capable track (voice, « Autres », piano, guitar…) and
//            per eighth of a bar (8 slots), the pitch class that dominates,
//            or `MELODY_NONE` when nothing clear sounds: a theme plays the
//            same melody at each repeat of a section, a solo does not
//            (`parts.ts` compares them)
//   winds    the instrument recogniser's reading per bar (step 2, below)
//
// Two steps, so that the recogniser runs on few, long excerpts:
//   1. `buildStructureEvidence(sources, bars)` (levels, timbre, melody), then
//      `detectStructure` with it: the stretches the « Autres » track leads are
//      found;
//   2. `windsExcerpts(input, keyChanges)` lists them (one per chorus of each
//      such stretch); `recogniseWinds(evidence, bars, excerpts, recogniser,
//      other)` runs the recogniser once per excerpt and returns the evidence
//      with `winds` filled; `detectStructure` again names the instruments.
//
// The core (`measureEvidence`) is pure and synchronous over mono sources
// (testable in Node, used by the bench's Tier R on the rendered tracks). The
// async wrapper reads the audio registry in slices and yields to the page
// every few milliseconds; its result is cached per (audio ids, bar grid).

import { fft, hann } from '../analysis/engine/fft';
import { getAudio } from '../audio/registry';
import { readPcm, yieldToMain, type PcmAudio } from '../audio/pcm';
import type { Key } from '../model/harmony';
import type { Seconds } from '../model/project';
import type { StemId } from '../model/separation';
import { structureInBars } from './detect';
import { windsStretches } from './parts';
import type { HarmonyBar, HarmonyInput, InstrumentGuess, InstrumentRecognizer, StructureEvidence } from './types';

/** A mono signal read by ranges (frames at `sampleRate`; outside the audio reads 0). */
export interface MonoSource {
  sampleRate: number;
  frames: number;
  read(start: number, out: Float32Array): void;
}

/** A mono source over a plain array. */
export function arraySource(samples: Float32Array, sampleRate: number): MonoSource {
  return {
    sampleRate,
    frames: samples.length,
    read(start, out) {
      for (let i = 0; i < out.length; i++) {
        const f = start + i;
        out[i] = f >= 0 && f < samples.length ? samples[f]! : 0;
      }
    },
  };
}

/** A mono source over registered audio (both channels averaged). */
export function pcmSource(pcm: PcmAudio): MonoSource {
  let right = new Float32Array(0);
  return {
    sampleRate: pcm.sampleRate,
    frames: pcm.frames,
    read(start, out) {
      readPcm(pcm, 0, start, out);
      if (pcm.mono) return;
      if (right.length < out.length) right = new Float32Array(out.length);
      const r = right.subarray(0, out.length);
      readPcm(pcm, 1, start, r);
      for (let i = 0; i < out.length; i++) out[i] = 0.5 * (out[i]! + r[i]!);
    },
  };
}

/** Bands of the timbre (log-spaced, 60 Hz … 11 kHz). */
export const TIMBRE_BANDS = 8;
/** Melody slots per bar (eighths of a 4/4 bar). */
export const MELODY_SLOTS = 8;
/** A slot where no pitch stands out. */
export const MELODY_NONE = 255;

/** Tracks whose melody is measured (those that can lead a theme). */
export const MELODY_STEMS: readonly StemId[] = ['vocals', 'other', 'piano', 'guitar', 'winds', 'saxophone', 'brass'];

// ---------------------------------------------------------------- the core

const RATE = 11025;
const N = 2048;

interface TrackMeasure {
  rms: Float32Array;
  /** `bars × TIMBRE_BANDS` mean band energies (linear), when asked. */
  bands: Float64Array | null;
  /** `bars × MELODY_SLOTS` pitch class, clarity and energy, when asked. */
  pitch: Uint8Array | null;
  clarity: Float32Array | null;
  energy: Float32Array | null;
}

const window2048 = (() => {
  let w: Float64Array | null = null;
  return () => (w ??= hann(N));
})();

/** Band edges in FFT bins at the decimated rate. */
function bandBins(rate: number): number[] {
  const top = Math.min(11000, rate / 2 - 1);
  return Array.from({ length: TIMBRE_BANDS + 1 }, (_, i) => Math.min(N / 2, Math.round((60 * Math.pow(top / 60, i / TIMBRE_BANDS) * N) / rate)));
}

/** Pitch class of each FFT bin from 80 Hz to 2 kHz (−1 elsewhere). */
function pitchBins(rate: number): Int8Array {
  const out = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * rate) / N;
    if (f < 80 || f > 2000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    out[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  return out;
}

/**
 * Measures one track over the bars, one bar per step (the async wrapper
 * yields between steps). The track is read decimated to about 11 kHz (a box
 * average: enough for levels, bands and pitch classes up to 2 kHz).
 */
function* measureTrack(src: MonoSource, bars: readonly { start: Seconds; end: Seconds }[], opts: { bands: boolean; melody: boolean }): Generator<void, TrackMeasure> {
  const n = bars.length;
  const dec = Math.max(1, Math.round(src.sampleRate / RATE));
  const rate = src.sampleRate / dec;
  const rms = new Float32Array(n);
  const bands = opts.bands ? new Float64Array(n * TIMBRE_BANDS) : null;
  const pitch = opts.melody ? new Uint8Array(n * MELODY_SLOTS).fill(MELODY_NONE) : null;
  const clarity = opts.melody ? new Float32Array(n * MELODY_SLOTS) : null;
  const energy = opts.melody ? new Float32Array(n * MELODY_SLOTS) : null;
  const edges = bandBins(rate);
  const pcs = pitchBins(rate);
  const win = window2048();
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let raw = new Float32Array(0);
  let x = new Float32Array(0);
  const spectrum = (from: number, to: number, out: Float64Array) => {
    // power spectrum of x[from, from + N), zero-padded past `to`
    for (let i = 0; i < N; i++) {
      const j = from + i;
      re[i] = j < to ? x[j]! * win[i]! : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) out[k] = re[k]! * re[k]! + im[k]! * im[k]!;
  };
  const power = new Float64Array(N / 2);
  for (let b = 0; b < n; b++) {
    const f0 = Math.max(0, Math.floor(bars[b]!.start * src.sampleRate));
    const f1 = Math.max(f0, Math.min(src.frames, Math.floor(bars[b]!.end * src.sampleRate)));
    const len = Math.floor((f1 - f0) / dec);
    if (len <= 0) {
      yield;
      continue;
    }
    if (raw.length < len * dec) raw = new Float32Array(len * dec);
    if (x.length < len) x = new Float32Array(len);
    src.read(f0, raw.subarray(0, len * dec));
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let k = 0; k < dec; k++) s += raw[i * dec + k]!;
      x[i] = s / dec;
    }
    // RMS from the full-rate samples (the box average loses the highs)
    let full = 0;
    for (let i = 0; i < len * dec; i++) full += raw[i]! * raw[i]!;
    rms[b] = Math.sqrt(full / (len * dec));
    if (bands) {
      let frames = 0;
      for (let s = 0; s + N <= len || (s === 0 && len > 0); s += N) {
        spectrum(s, len, power);
        for (let band = 0; band < TIMBRE_BANDS; band++) {
          let e = 0;
          for (let k = edges[band]!; k < edges[band + 1]!; k++) e += power[k]!;
          bands[b * TIMBRE_BANDS + band] = bands[b * TIMBRE_BANDS + band]! + e;
        }
        frames++;
        if (s + N > len) break;
      }
      for (let band = 0; band < TIMBRE_BANDS; band++) bands[b * TIMBRE_BANDS + band] = bands[b * TIMBRE_BANDS + band]! / Math.max(1, frames);
    }
    if (pitch && clarity && energy) {
      const slot = len / MELODY_SLOTS;
      for (let s = 0; s < MELODY_SLOTS; s++) {
        const center = Math.floor((s + 0.5) * slot);
        const from = Math.max(0, Math.min(len - N, center - N / 2));
        spectrum(from, len, power);
        const chroma = new Float64Array(12);
        let tot = 0;
        for (let k = 0; k < N / 2; k++) {
          const pc = pcs[k]!;
          if (pc < 0) continue;
          const m = Math.sqrt(power[k]!);
          chroma[pc] = chroma[pc]! + m;
          tot += m;
        }
        let best = 0;
        for (let pc = 1; pc < 12; pc++) if (chroma[pc]! > chroma[best]!) best = pc;
        pitch[b * MELODY_SLOTS + s] = best;
        clarity[b * MELODY_SLOTS + s] = tot > 0 ? chroma[best]! / tot : 0;
        energy[b * MELODY_SLOTS + s] = tot;
      }
    }
    yield;
  }
  return { rms, bands, pitch, clarity, energy };
}

/** A slot is melody when it sounds (a tenth of the track's loud slots) and one pitch class stands out. */
function finishMelody(m: TrackMeasure): Uint8Array | null {
  if (!m.pitch || !m.clarity || !m.energy) return null;
  const e = Array.from(m.energy).filter((v) => v > 0).sort((a, b) => a - b);
  if (!e.length) return null;
  const loud = e[Math.floor(0.9 * (e.length - 1))]!;
  const out = new Uint8Array(m.pitch.length).fill(MELODY_NONE);
  for (let i = 0; i < out.length; i++) if (m.energy[i]! > 0.1 * loud && m.clarity[i]! >= MELODY_CLARITY) out[i] = m.pitch[i]!;
  return out;
}

/** Share of the chroma the strongest pitch class must hold (12 equal classes hold 0.083 each). */
const MELODY_CLARITY = 0.18;

export interface EvidenceTracks {
  /** The whole piece, when in memory (the timbre); null without. */
  mix: MonoSource | null;
  /** The separated tracks in memory, by stem. */
  stems: Partial<Record<StemId, MonoSource>>;
}

/** Every step of the measure (the sync core runs them all, the async wrapper yields between them). */
function* evidenceSteps(tracks: EvidenceTracks, bars: readonly { start: Seconds; end: Seconds }[]): Generator<void, StructureEvidence> {
  const n = bars.length;
  const stemIds = (Object.keys(tracks.stems) as StemId[]).filter((s) => tracks.stems[s]);
  const levels: Partial<Record<StemId, Float32Array>> = {};
  const melody: Partial<Record<StemId, Uint8Array>> = {};
  const bandSum = new Float64Array(n * TIMBRE_BANDS);
  for (const s of stemIds) {
    const m: TrackMeasure = yield* measureTrack(tracks.stems[s]!, bars, { bands: !tracks.mix, melody: MELODY_STEMS.includes(s) });
    levels[s] = m.rms;
    if (m.bands) for (let i = 0; i < bandSum.length; i++) bandSum[i] = bandSum[i]! + m.bands[i]!;
    const mel = finishMelody(m);
    if (mel) melody[s] = mel;
  }
  if (tracks.mix) {
    const m: TrackMeasure = yield* measureTrack(tracks.mix, bars, { bands: true, melody: false });
    bandSum.set(m.bands!);
  }
  const timbre = new Float32Array(n * TIMBRE_BANDS);
  for (let i = 0; i < timbre.length; i++) timbre[i] = Math.log(1e-9 + bandSum[i]!);
  const ev: StructureEvidence = {
    stems: stemIds.length ? levels : null,
    timbre: { bands: TIMBRE_BANDS, data: timbre },
    winds: null,
  };
  if (Object.keys(melody).length) ev.melody = { slots: MELODY_SLOTS, stems: melody };
  return ev;
}

/** The evidence of the audio over the bars (pure, synchronous; see the header). */
export function measureEvidence(tracks: EvidenceTracks, bars: readonly { start: Seconds; end: Seconds }[]): StructureEvidence {
  const it = evidenceSteps(tracks, bars);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

// ---------------------------------------------------------------- the app's wrapper

/** Where the audio of the piece is, as audio ids of the registry. */
export interface EvidenceSources {
  /** The whole piece (`Track.audioId` of the « morceau » track, in the tracks or aside), null when not in memory. */
  mix: string | null;
  /** The separated tracks in memory (`Track.stem` → `Track.audioId`, in the tracks or aside). */
  stems: Partial<Record<StemId, string>>;
}

const cache = new Map<string, StructureEvidence>();
const CACHE_SIZE = 2;

/** FNV-1a of a string, as 8 hex digits. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The cache key of an evidence: the audio ids and the bar grid (to the millisecond). */
export function evidenceKey(sources: EvidenceSources, bars: readonly { start: Seconds; end: Seconds }[]): string {
  const ids = [sources.mix ?? '-', ...Object.entries(sources.stems).sort(([a], [b]) => a.localeCompare(b)).map(([s, id]) => `${s}=${id}`)].join(',');
  return `${ids}|${bars.length}|${hash(bars.map((b) => `${Math.round(b.start * 1000)}-${Math.round(b.end * 1000)}`).join(','))}`;
}

/**
 * The evidence of the audio in memory over the bars of the chart in force,
 * measured in slices (the page never waits more than `sliceMs`), cached per
 * (audio ids, bar grid). Null when no audio of the piece is in memory.
 * Rejects with an `AbortError` when `signal` aborts.
 */
export async function buildStructureEvidence(
  sources: EvidenceSources,
  bars: readonly Pick<HarmonyBar, 'start' | 'end'>[],
  options: { signal?: AbortSignal; sliceMs?: number } = {},
): Promise<StructureEvidence | null> {
  const key = evidenceKey(sources, bars);
  const hit = cache.get(key);
  if (hit) return hit;
  const mixPcm = sources.mix ? getAudio(sources.mix) : undefined;
  const stems: Partial<Record<StemId, MonoSource>> = {};
  for (const [s, id] of Object.entries(sources.stems) as [StemId, string][]) {
    const pcm = getAudio(id);
    if (pcm) stems[s] = pcmSource(pcm);
  }
  if (!mixPcm && !Object.keys(stems).length) return null;
  const it = evidenceSteps({ mix: mixPcm ? pcmSource(mixPcm) : null, stems }, bars);
  const slice = options.sliceMs ?? 8;
  let t0 = performance.now();
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const r = it.next();
    if (r.done) {
      cache.set(key, r.value);
      while (cache.size > CACHE_SIZE) cache.delete([...cache.keys()][0]!);
      return r.value;
    }
    if (performance.now() - t0 > slice) {
      await yieldToMain();
      t0 = performance.now();
    }
  }
}

/** Forgets the cached evidence (a test, or the audio of the piece replaced). */
export function clearEvidenceCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------- step 2: the wind instruments

/** One excerpt of the « Autres » track to ask the recogniser about. */
export interface WindsExcerpt {
  /** Bar indices into `HarmonyInput.bars`, [firstBar, endBar). */
  firstBar: number;
  endBar: number;
  start: Seconds;
  end: Seconds;
}

/**
 * Where the « Autres » track leads (after a first `detectStructure` with the
 * evidence of step 1): one excerpt per chorus of each such stretch, so that
 * two wind soloists in a row are told apart. Empty without separated tracks.
 */
export function windsExcerpts(input: HarmonyInput, keyChanges: readonly { time: Seconds; key: Key }[]): WindsExcerpt[] {
  if (!input.evidence?.stems) return [];
  const found = structureInBars(input, keyChanges);
  if (!found) return [];
  const bars = input.bars;
  return windsStretches({ n: bars.length, layout: found.layout, evidence: input.evidence, chordsFirst: 0, chordsEnd: bars.length }).map((s) => ({
    firstBar: s.first,
    endBar: s.end,
    start: bars[s.first]!.start,
    end: bars[s.end - 1]!.end,
  }));
}

/**
 * Runs the recogniser once per excerpt on the « Autres » track and returns
 * the evidence with `winds` filled (each bar of an excerpt gets its reading;
 * other bars null). A recogniser that fails or answers null leaves the bars
 * null (« Solo (Vents) »).
 */
export async function recogniseWinds(
  evidence: StructureEvidence,
  bars: readonly Pick<HarmonyBar, 'start' | 'end'>[],
  excerpts: readonly WindsExcerpt[],
  recognizer: InstrumentRecognizer,
  other: MonoSource | string,
  signal?: AbortSignal,
): Promise<StructureEvidence> {
  const src = typeof other === 'string' ? (() => {
    const pcm = getAudio(other);
    return pcm ? pcmSource(pcm) : null;
  })() : other;
  const winds: (InstrumentGuess | null)[] = bars.map(() => null);
  if (src) {
    for (const ex of excerpts) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const f0 = Math.max(0, Math.floor(ex.start * src.sampleRate));
      const f1 = Math.min(src.frames, Math.floor(ex.end * src.sampleRate));
      if (f1 <= f0) continue;
      const mono = new Float32Array(f1 - f0);
      src.read(f0, mono);
      let guess: InstrumentGuess | null = null;
      try {
        guess = await recognizer.recognise(mono, src.sampleRate, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        guess = null;
      }
      for (let i = ex.firstBar; i < ex.endBar && i < winds.length; i++) winds[i] = guess;
    }
  }
  return { ...evidence, winds };
}
