// The whole analysis, independent of the browser: the worker and the unit
// tests both call these functions (the worker with ONNX Runtime and open
// sessions). Ported from the prototype (`web/spikes/analyse/lib/pipeline.js`),
// default options only: « minimal » beat post-processing (the Beat This!
// authors' own, no tempo model), meter by HMM over the downbeat probabilities
// with 3 or 4 beats as candidates (2, 5, 6 and 7 are left to the user:
// measured, more false alarms than hits), tuning correction before the chord
// network, harmony prior on.
//
// The prototype's two other beat post-processings (`dbn`, `joint`) are not
// ported: the default never uses them.

import { AnalysisError, type AnalysisStep } from '../types';
import { beatDownProb, beatLogits, logMel, postMinimal, type BeatActivations } from './beats';
import { cremaFrames, poolSegments, type ChordFrames } from './chords';
import { buildSegments, decodeChords, type ChordSegment } from './decode';
import { makeGrid, renumber, type Grid } from './grid';
import { estimateKey, type KeyEstimate } from './key';
import { inferMeter, type MeterScore } from './meter';
import { resampleRatio } from './resample';
import { type OrtLike, type RunControl, type SessionLike } from './session';
import { estimateTuning, type TuningEstimate } from './tuning';

export const OPTIONS = {
  /** Beat counts the meter is chosen among. */
  meterCandidates: [3, 4] as readonly number[],
  /** Resample the audio before the chord network when the recording is not at 440 Hz (|cents| ≥ 5). */
  tuningCorrection: true,
  harmonyPrior: true,
};

/** Shortest piece analysed, in seconds: below it there is nothing to find. */
export const MIN_SECONDS = 3;

export interface Sessions {
  logmel: SessionLike;
  beat: SessionLike;
  crema: SessionLike;
}

/** The run control of the pipeline: it also announces which step it is in. */
export interface StepControl extends RunControl {
  step(step: AnalysisStep): void;
}

/** What the networks produced: everything the cheap decoding needs, small enough to keep. */
export interface NetworkOutputs {
  tuning: TuningEstimate;
  act: BeatActivations;
  frames: ChordFrames;
  /** Tuning correction stretched the audio by this factor (original time × timeScale = model time). */
  timeScale: number;
}

/** Beat stage: log-mel graph, then the beat network. */
export async function beatStage(ort: OrtLike, sessions: Sessions, audio22: Float32Array, ctl: RunControl): Promise<BeatActivations> {
  const mel = await logMel(ort, sessions.logmel, audio22, ctl);
  return beatLogits(ort, sessions.beat, mel, ctl);
}

/** Chord stage: tuning-corrected audio, then the chord network. */
export async function chordStage(ort: OrtLike, sessions: Sessions, audio44: Float32Array, tuning: TuningEstimate, ctl: RunControl): Promise<{ frames: ChordFrames; timeScale: number }> {
  let input = audio44;
  let timeScale = 1;
  if (OPTIONS.tuningCorrection && Math.abs(tuning.cents) >= 5) {
    const ratio = Math.pow(2, -tuning.cents / 1200);
    ctl.check();
    input = resampleRatio(audio44, ratio);
    timeScale = 1 / ratio;
    await ctl.yieldNow();
  }
  ctl.check();
  const frames = await cremaFrames(ort, sessions.crema, input);
  return { frames, timeScale };
}

/** From network activations to a grid: peaks, then the meter. */
export function gridFromActivations(act: BeatActivations): { grid: Grid; meterScores: MeterScore[] } {
  const { beats } = postMinimal(act);
  const dp = beatDownProb(act, beats);
  const m = inferMeter(dp, { candidates: OPTIONS.meterCandidates });
  return { grid: makeGrid(beats, m.numbers, m.beatsPerBar), meterScores: m.scores };
}

/** The user's grid as the pipeline's grid (numbers counted from their first downbeat). */
export function gridFromHint(times: readonly number[], downbeat: number, beatsPerBar: number): Grid {
  return makeGrid(times, renumber(times, beatsPerBar, downbeat), beatsPerBar);
}

function beatSegments(beats: readonly number[]): [number, number][] {
  return beats.map((t, i) => [t, beats[i + 1] ?? t + (i > 0 ? t - beats[i - 1]! : 0.5)] as [number, number]);
}

export interface TonalHint {
  tonic: number;
  minor: boolean;
}

export interface Chart {
  key: KeyEstimate;
  segments: ChordSegment[];
}

/** Chords on the grid, key estimate and chart. Cheap: also re-run after a grid correction. */
export function chartFromGrid(frames: ChordFrames, timeScale: number, grid: Grid, fixedKey: TonalHint | null = null): Chart {
  const segs = beatSegments(grid.beats);
  const units = poolSegments(frames, segs, timeScale);
  const prior = { priorOn: OPTIONS.harmonyPrior };
  let key: Chart['key'];
  if (fixedKey) key = { best: { tonic: fixedKey.tonic, minor: fixedKey.minor }, ranked: [] };
  else {
    const first = decodeChords(units, grid.numbers, grid.beatsPerBar, null, { ...prior, kappa: 0 });
    const chordSegs = first.path.map((c, i) => ({ chord: c, dur: units[i]!.t1 - units[i]!.t0 }));
    const chroma = new Array<number>(12).fill(0);
    for (let f = 0; f < frames.T; f++) for (let k = 0; k < 12; k++) chroma[k]! += frames.pitch[f * 12 + k]!;
    key = estimateKey(chroma, chordSegs);
  }
  const dec = decodeChords(units, grid.numbers, grid.beatsPerBar, key.best, prior);
  const times = grid.beats.concat([segs[segs.length - 1]?.[1] ?? 0]);
  return { key, segments: buildSegments(units, times, dec.path, dec.post) };
}

/** Everything the networks do, with the steps announced to `ctl`. */
export async function runNetworks(ort: OrtLike, sessions: Sessions, audio22: Float32Array, audio44: Float32Array, ctl: StepControl): Promise<NetworkOutputs> {
  if (audio22.length < MIN_SECONDS * 22050) throw new AnalysisError('no-music', 'the piece is too short');
  ctl.step('tuning');
  ctl.check();
  const tuning = estimateTuning(audio22, 22050);
  ctl.progress(1);
  await ctl.yieldNow();
  ctl.step('beats');
  const act = await beatStage(ort, sessions, audio22, ctl);
  ctl.step('chords');
  const { frames, timeScale } = await chordStage(ort, sessions, audio44, tuning, ctl);
  return { tuning, act, frames, timeScale };
}
