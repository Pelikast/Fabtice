// The chords of a piece on its grid, from everything the analysis has heard:
// the single entry point of the worker and of the bench's `app` variant.
//
//   1. the chord network on the mix, pooled per beat;
//   2. when the piece was separated, the network on the parts that carry the
//      harmony (with the bass, no drums, no melody), pooled with the mix;
//   3. the bass line (separated bass, else the 40–300 Hz band of the mix) as
//      soft evidence for the root;
//   4. the key (the user's, else estimated on that evidence);
//   5. the repeats of the form and, when the title gave candidates, a known
//      chart (`repeats.ts`, `knownChart.ts`), added to the evidence;
//   6. the decoder, the segments, and each chord's probability of being right
//      (`reliability.ts`): « doubtful » = more likely wrong than right.
// Pure; each step can be switched off (`ChartOptions`), for the bench.

import { bassBeats, type BassBeat } from './bassline';
import type { ChordFrames, PooledUnit } from './chords';
import { buildSegments, decodeChords, type ChordSegment, type DecodeOptions } from './decode';
import { applyEvidence, type EvidenceSource } from './evidence';
import type { Grid } from './grid';
import { estimateKey, type KeyEstimate } from './key';
import { fitKnownChart, type ChartCandidate, type ChartFit, type ChartOptions } from './knownChart';
import { bassSource, blendUnits, type BassCueOptions } from './listen';
import { beatSegments, beatUnits, frameChroma, OPTIONS, type TonalHint } from './pipeline';
import { reliability, reliabilityFeatures, RELIABILITY_DOUBT } from './reliability';
import { findRepeats, type RepeatAnalysis, type RepeatOptions } from './repeats';
import type { StandardChart } from '../../standards/irealRead';

/** The network on the remix of the harmony parts and the bass (`listen.ts#selectHarmony`). */
export interface HarmonyListening {
  frames: ChordFrames;
  timeScale: number;
  /** The parts heard (stem names), for the report. */
  stems: string[];
}

/** The bass line's audio at `bassline.ts#BASS_SR` and where it comes from. */
export interface BassListening {
  low: Float32Array;
  from: 'stem' | 'band';
}

export interface KnownCharts {
  /** Charts whose title matches the piece's, best first; `collection`: the playlist it comes from, for the report. */
  candidates: (ChartCandidate & { collection?: string | null })[];
  references: StandardChart[];
}

export interface ChartSettings {
  /** Weight of the mix when pooled with the harmony parts. */
  mixWeight: number;
  bass: Partial<BassCueOptions> | null;
  repeats: Partial<RepeatOptions> | null;
  chart: Partial<ChartOptions> | null;
  decode: Partial<DecodeOptions>;
}

export const CHART_SETTINGS: ChartSettings = { mixWeight: 0.3, bass: {}, repeats: {}, chart: {}, decode: {} };

export interface ChartInput {
  frames: ChordFrames;
  timeScale: number;
  grid: Grid;
  /** The recording's tuning in cents (`tuning.ts`). */
  cents: number;
  fixedKey?: TonalHint | null;
  harmony?: HarmonyListening | null;
  bass?: BassListening | null;
  known?: KnownCharts | null;
  settings?: Partial<ChartSettings>;
}

/** What the analysis listened to, for one line in the interface. */
export interface ChartEvidence {
  /** Parts of the separation heard as carrying the harmony (empty: the mix only). */
  harmonyStems: string[];
  bass: 'stem' | 'band' | null;
  /** Length of the form in bars, when its repeats were found. */
  formBars: number | null;
  /** The known chart used, when one was accepted. */
  knownChart: { title: string; collection: string | null } | null;
}

export interface ChartRun {
  key: KeyEstimate;
  segments: ChordSegment[];
  /** Per segment: probability that the chord (root and colour) is right. */
  reliability: number[];
  evidence: ChartEvidence;
  /** For diagnostics. */
  repeats: RepeatAnalysis | null;
  fit: ChartFit | null;
}

export const DOUBTFUL_BELOW = RELIABILITY_DOUBT;

export function analyseChart(input: ChartInput): ChartRun {
  const s = { ...CHART_SETTINGS, ...input.settings };
  const { grid } = input;
  const segs = beatSegments(grid.beats);
  const mix = beatUnits(input.frames, input.timeScale, grid);
  // What the network heard: the mix, or the mix pooled with the harmony parts.
  let net: PooledUnit[] = mix;
  if (input.harmony) net = blendUnits(mix, beatUnits(input.harmony.frames, input.harmony.timeScale, grid), s.mixWeight);
  let units = net;
  let bass: BassBeat[] | null = null;
  if (input.bass && s.bass) {
    bass = bassBeats(input.bass.low, segs, input.cents);
    units = applyEvidence(units, [bassSource(bass, grid.numbers, grid.beatsPerBar, s.bass)]);
  }
  const prior = { ...s.decode, priorOn: OPTIONS.harmonyPrior };
  let key: KeyEstimate;
  if (input.fixedKey) key = { best: { tonic: input.fixedKey.tonic, minor: input.fixedKey.minor }, ranked: [] };
  else {
    const first = decodeChords(units, grid.numbers, grid.beatsPerBar, null, { ...prior, kappa: 0 });
    key = estimateKey(frameChroma(input.frames), first.path.map((c, i) => ({ chord: c, dur: units[i]!.t1 - units[i]!.t0 })));
  }
  const sources: EvidenceSource[] = [];
  const rep = s.repeats ? findRepeats(units, grid.numbers, s.repeats) : null;
  if (rep) sources.push(rep.source);
  let fit: ChartFit | null = null;
  if (s.chart && input.known?.candidates.length) {
    fit = fitKnownChart(units, grid.numbers, grid.beatsPerBar, key, input.known.candidates, s.chart, input.known.references);
    if (fit.accepted) {
      sources.push(fit.source);
      if (!input.fixedKey && fit.key) key = { best: { tonic: fit.key.tonic, minor: fit.key.mode === 'minor' }, ranked: key.ranked };
    }
  }
  if (sources.length) units = applyEvidence(units, sources);
  const dec = decodeChords(units, grid.numbers, grid.beatsPerBar, key.best, prior);
  const last = units[units.length - 1];
  const segments = buildSegments(units, grid.beats.concat([last ? last.t1 : 0]), dec.path, dec.post);
  const accepted = fit?.accepted ? fit : null;
  const rel = reliabilityFeatures(segments, net, rep, accepted).map((f) => reliability(f));
  return {
    key,
    segments,
    reliability: rel,
    evidence: {
      harmonyStems: input.harmony ? input.harmony.stems.filter((x) => x !== 'bass') : [],
      bass: bass ? input.bass!.from : null,
      formBars: rep?.formLength ?? null,
      knownChart: accepted?.chart ? { title: accepted.chart.title, collection: input.known?.candidates.find((c) => c.chart === accepted.chart)?.collection ?? null } : null,
    },
    repeats: rep,
    fit,
  };
}
