// The ground truth of a piece (written by corpus/prepare.py and
// corpus/reel_guitarset.py), and how to read it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChordExtension, ChordQuality } from '../../../../app/src/model/harmony';
import { CORPUS } from './paths';
import type { GridInput, StemName } from './types';

export interface TruthChord {
  /** Beat of the bar where the chord starts, 1-based. */
  beat: number;
  symbol: string;
  root: number;
  quality: ChordQuality;
  extensions: ChordExtension[];
  bass: number | null;
}

export interface TruthBar {
  index: number;
  chorus: number;
  section: string;
  start: number;
  end: number;
  beats: number[];
  chords: TruthChord[];
}

export interface Condition {
  mix: string;
  stems: Partial<Record<StemName, string>>;
  /** Times of this condition = times of the truth × timeScale (the old record turns a little fast or slow). */
  timeScale: number;
  settings?: Record<string, unknown>;
}

export interface Truth {
  id: string;
  title: string;
  standard: boolean;
  source: string;
  style: string;
  key: { tonic: number; mode: 'major' | 'minor'; name: string };
  meter: number;
  bpm: number;
  beats: number[];
  downbeat: number;
  duration: number;
  bars: TruthBar[];
  sections: { label: string; chorus: number; firstBar: number; lastBar: number }[];
  stems: StemName[];
  harmonyStems: StemName[];
  conditions: Record<string, Condition>;
  /** Folder of the piece (filled in when loaded). */
  dir: string;
  [k: string]: unknown;
}

export function loadCorpus(): Truth[] {
  if (!existsSync(CORPUS)) return [];
  const out: Truth[] = [];
  for (const d of readdirSync(CORPUS, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = join(CORPUS, d.name, 'truth.json');
    if (!existsSync(f)) continue;
    const t = JSON.parse(readFileSync(f, 'utf8')) as Truth;
    t.dir = join(CORPUS, d.name);
    out.push(t);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The true grid of a condition, as the pipeline's « regrid » input. */
export function truthGrid(t: Truth, condition: string): GridInput {
  const s = t.conditions[condition]!.timeScale;
  return { times: t.beats.map((x) => x * s), downbeat: t.downbeat, beatsPerBar: t.meter };
}

/** The chord sounding at `beat` (1-based) of a bar. */
export function chordAt(bar: TruthBar, beat: number): TruthChord {
  let cur = bar.chords[0]!;
  for (const c of bar.chords) if (c.beat <= beat + 1e-9) cur = c;
  return cur;
}
