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
// The evidence is measured by the app's own `structure/evidence.ts` core
// (`measureEvidence`: levels, timbre, melody of the lead tracks) on the
// rendered tracks. IDEALISED: the tracks are the rendered instruments, i.e. a
// PERFECT separation; the wind recogniser is simulated from the truth (the
// « realiste » rates of Tier S).

import { execFileSync } from 'node:child_process';
import type { StemId } from '../../../../app/src/model/separation';
import type { HarmonyBar, HarmonyChord, HarmonyInput, StructureEvidence } from '../../../../app/src/structure/types';
import { knownStandard, type TruthPiece } from '../../../../app/src/structure/bench/cases';
import { NOISE } from '../../../../app/src/structure/bench/noise';
import { rng, seedOf } from '../../../../app/src/structure/bench/rng';
import { BENCH_STEMS, simulatedEvidence, TIMBRE_BANDS, type EvidenceKind } from '../../../../app/src/structure/bench/simEvidence';
import { arraySource, measureEvidence as measureWithApp, MELODY_NONE, MELODY_SLOTS, type MonoSource } from '../../../../app/src/structure/evidence';
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

/** Evidence measured on the audio, per detected bar: what is stored in analyses/ (plain arrays, the melody as one character per slot). */
export interface MeasuredEvidence {
  stems: Partial<Record<StemId, number[]>>;
  timbre: number[];
  /** Per lead-capable track, `bars × MELODY_SLOTS` characters: 0-9, a, b (pitch class) or « . » (none). Absent in analyses measured before. */
  melody?: Partial<Record<StemId, string>>;
}

const PC = '0123456789ab';

/** The app's evidence core on the rendered files (mono, 22 050 Hz). */
export function measureEvidence(bars: readonly HarmonyBar[], mixPath: string, stemPaths: Partial<Record<StemId, string>>): MeasuredEvidence {
  const SR = 22050;
  const stems: Partial<Record<StemId, MonoSource>> = {};
  for (const s of BENCH_STEMS) {
    const p = stemPaths[s];
    if (p) stems[s] = arraySource(decodeMono(p, SR), SR);
  }
  const ev = measureWithApp({ mix: arraySource(decodeMono(mixPath, SR), SR), stems }, bars);
  const out: MeasuredEvidence = { stems: {}, timbre: Array.from(ev.timbre.data, (v) => Math.round(v * 1000) / 1000) };
  for (const s of BENCH_STEMS) {
    const v = ev.stems?.[s];
    out.stems[s] = v ? Array.from(v, (x) => Math.round(x * 1e5) / 1e5) : bars.map(() => 0);
  }
  if (ev.melody) {
    out.melody = {};
    for (const [s, m] of Object.entries(ev.melody.stems) as [StemId, Uint8Array][]) out.melody[s] = Array.from(m, (x) => (x === MELODY_NONE ? '.' : PC[x]!)).join('');
  }
  return out;
}

/** The stored melody back as the app's `StructureEvidence.melody`. */
function melodyOf(m: MeasuredEvidence['melody'], n: number): StructureEvidence['melody'] {
  if (!m) return undefined;
  const stems: Partial<Record<StemId, Uint8Array>> = {};
  for (const [s, text] of Object.entries(m) as [StemId, string][]) {
    if (text.length !== n * MELODY_SLOTS) continue;
    stems[s] = Uint8Array.from(text, (ch) => (ch === '.' ? MELODY_NONE : PC.indexOf(ch)));
  }
  return { slots: MELODY_SLOTS, stems };
}

/** The evidence of one kind (`stems`: ideal separation + simulated recogniser; `mix`: timbre only; `none`). */
export function evidenceOf(piece: TruthPiece, truthBars: readonly HarmonyBar[], measured: MeasuredEvidence, kind: EvidenceKind): StructureEvidence | null {
  if (kind === 'none') return null;
  const timbre = { bands: TIMBRE_BANDS, data: Float32Array.from(measured.timbre) };
  if (kind === 'mix') return { stems: null, timbre, winds: null };
  const stems: Partial<Record<StemId, Float32Array>> = {};
  for (const [s, v] of Object.entries(measured.stems)) stems[s as StemId] = Float32Array.from(v);
  const winds = simulatedEvidence(piece, truthBars, 'stems', NOISE.realiste, rng(seedOf(`${piece.id}|winds`)))!.winds;
  const melody = melodyOf(measured.melody, truthBars.length);
  return melody ? { stems, timbre, winds, melody } : { stems, timbre, winds };
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
