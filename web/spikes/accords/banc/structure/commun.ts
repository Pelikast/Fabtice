// What the « structure » variants share: the app's chord decoding on a grid
// (`chartFromGrid` of app/src/analysis/engine/pipeline.ts, replicated line by
// line) with a hook between pooling and decoding, where the structural
// evidence (repeats of the form, known chart) is added; and the playlists of
// standards, read once from $BANC_DATA/recueils/ (never committed).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { poolSegments, type PooledUnit } from '../../../../../app/src/analysis/engine/chords';
import { buildSegments, decodeChords, type ChordSegment, type Decoded } from '../../../../../app/src/analysis/engine/decode';
import { estimateKey, type KeyEstimate } from '../../../../../app/src/analysis/engine/key';
import { OPTIONS, gridFromActivations, gridFromHint } from '../../../../../app/src/analysis/engine/pipeline';
import { DOUBT, symbolOf } from '../../../../../app/src/analysis/engine/result';
import type { Grid } from '../../../../../app/src/analysis/engine/grid';
import { readIRealText, type StandardChart } from '../../../../../app/src/standards/irealRead';
import { buildTitleIndex, type TitleIndex } from '../../../../../app/src/standards/match';
import type { NetworkResult } from '../networks';
import { DATA } from '../paths';
import type { VariantChord, VariantInput, VariantOutput } from '../types';

export interface Prepared {
  grid: Grid;
  units: PooledUnit[];
  key: KeyEstimate;
  times: number[];
}

function beatSegments(beats: readonly number[]): [number, number][] {
  return beats.map((t, i) => [t, beats[i + 1] ?? t + (i > 0 ? t - beats[i - 1]! : 0.5)] as [number, number]);
}

/** Grid, pooled units and key exactly as `chartFromGrid` computes them. */
export function prepare(input: VariantInput, net: NetworkResult): Prepared {
  const { outputs } = net;
  const h = input.truthGrid;
  const grid = h ? gridFromHint(h.times, h.downbeat, h.beatsPerBar) : gridFromActivations(outputs.act).grid;
  const segs = beatSegments(grid.beats);
  const units = poolSegments(outputs.frames, segs, outputs.timeScale);
  const prior = { priorOn: OPTIONS.harmonyPrior };
  const first = decodeChords(units, grid.numbers, grid.beatsPerBar, null, { ...prior, kappa: 0 });
  const chordSegs = first.path.map((c, i) => ({ chord: c, dur: units[i]!.t1 - units[i]!.t0 }));
  const chroma = new Array<number>(12).fill(0);
  const fr = outputs.frames;
  for (let f = 0; f < fr.T; f++) for (let k = 0; k < 12; k++) chroma[k]! += fr.pitch[f * 12 + k]!;
  const key = estimateKey(chroma, chordSegs);
  const times = grid.beats.concat([segs[segs.length - 1]?.[1] ?? 0]);
  return { grid, units, key, times };
}

export interface Decoding {
  dec: Decoded;
  segments: ChordSegment[];
}

/** The decoder and segments of the app on (possibly adjusted) units. */
export function decode(p: Prepared, units: readonly PooledUnit[]): Decoding {
  const dec = decodeChords(units, p.grid.numbers, p.grid.beatsPerBar, p.key.best, { priorOn: OPTIONS.harmonyPrior });
  return { dec, segments: buildSegments(units, p.times, dec.path, dec.post) };
}

/** Segments as the bench's output (doubtful as the app: geometric mean < DOUBT, unless a probability is given). */
export function output(p: Prepared, segments: readonly ChordSegment[], prob?: readonly number[]): VariantOutput {
  const chords: VariantChord[] = segments.map((s, k) => {
    const suggestions = s.extensions.map((e) => e.name);
    const conf = prob ? prob[k]! : s.confidence;
    return { time: s.t0, chord: symbolOf(s.chord, suggestions, s.bass ? s.bass.pc : null), confidence: conf, doubtful: prob ? conf < 0.5 : s.confidence < DOUBT };
  });
  const downbeat = Math.max(0, p.grid.numbers.indexOf(1));
  return {
    chords,
    beats: { times: p.grid.beats, downbeat, beatsPerBar: p.grid.beatsPerBar },
    key: { tonic: p.key.best.tonic, mode: p.key.best.minor ? 'minor' : 'major' },
  };
}

// ------------------------------------------------------------------ playlists

let library: { charts: StandardChart[]; index: TitleIndex<StandardChart> } | null = null;

/** Every chart of the playlists in $BANC_DATA/recueils/ and their title index (empty when the folder is missing). */
export function standards(): { charts: StandardChart[]; index: TitleIndex<StandardChart> } {
  if (library) return library;
  const dir = join(DATA, 'recueils');
  const charts: StandardChart[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
      const pl = readIRealText(readFileSync(join(dir, f), 'utf8'));
      charts.push(...pl.songs);
    }
  }
  const index = buildTitleIndex(charts.map((s, i) => ({ id: String(i), title: s.rawTitle, composer: s.composerRaw, data: s })));
  library = { charts, index };
  return library;
}
