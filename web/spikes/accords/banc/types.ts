// The contract between the bench and a variant (banc/variantes/<name>.ts).
//
// A variant is a module whose default export is a `Variant`. It receives the
// paths of the piece (the mix, and the ideal stems when the corpus has them),
// the title, and in « true grid » mode the true beat grid; it returns chords
// as the app's `AnalysisResult.chords` (a chord starts at `time` and lasts
// until the next one), and optionally the beat grid it used.

import type { ChordSymbol } from '../../../../app/src/model/harmony';
import type { NetworkResult } from './networks';

/** Stem names, as in app/src/separation/models.json. */
export type StemName = 'drums' | 'bass' | 'piano' | 'guitar' | 'other' | 'vocals';

/** A beat grid in the pipeline's « regrid » form: what the app passes when the user fixed the grid. */
export interface GridInput {
  /** Beat times in seconds of the audio file. */
  times: number[];
  /** Index in `times` of the first downbeat. */
  downbeat: number;
  beatsPerBar: number;
}

export interface VariantInput {
  /** Piece id (folder name in the corpus). */
  id: string;
  /** Condition: `propre` (clean render), `disque` (old record), `reel` (real recording). */
  condition: string;
  mixPath: string;
  /** Ideal stems of this condition, when they exist (rendered separately; the old-record stems get the same treatment as the mix). */
  stemPaths: Partial<Record<StemName, string>>;
  title: string;
  /** Present in « true grid » mode only: decode on this grid instead of detecting one. */
  truthGrid?: GridInput;
  /** Free metadata of the piece (style, harmonic stems…). Do not read the answers from it. */
  meta: Record<string, unknown>;
}

export interface VariantChord {
  time: number;
  chord: ChordSymbol | null;
  /** 0…1, optional. */
  confidence?: number;
  /** The app's « doubtful » flag, optional. */
  doubtful?: boolean;
}

export interface VariantOutput {
  chords: VariantChord[];
  /** The grid the chords were decoded on (for the beat scores). */
  beats?: { times: number[]; downbeat: number; beatsPerBar: number };
  key?: { tonic: number; mode: 'major' | 'minor' };
}

/** What the bench hands to every variant: cached access to the app's networks. */
export interface VariantContext {
  /** The app's network outputs for any audio file (cached per file content). */
  networks(path: string): Promise<NetworkResult>;
}

export type Variant = (input: VariantInput, ctx: VariantContext) => Promise<VariantOutput>;
