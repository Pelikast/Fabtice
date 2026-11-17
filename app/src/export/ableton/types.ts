// The neutral input of the Ableton Live set writer (C15.5 « Projet Ableton
// Live… »), and what it reports back.
//
// Everything on the timeline is in Live's musical time: QUARTER NOTES from the
// start of the arrangement (Live's « beat » is a quarter note in every meter,
// like `Session.quarters` in `export/session/`). Live keeps the tempo curve in
// beats too, so a position given here lands exactly where the tempo curve puts
// it; seconds only appear where Live itself counts in seconds (the length of an
// unwarped clip). See ALS-FORMAT.md for the format and the sources.

export interface AbletonTrackInput {
  /** Track name as shown in Live (« Morceau », « Voix »…). */
  name: string;
  /**
   * The audio file, relative to the folder of the `.als`, with `/`
   * separators, as Live writes it: « Samples/Imported/01 Morceau.wav ».
   */
  file: string;
  /** Length of the file in sample frames. */
  frames: number;
  /** Where the clip starts on the timeline, in quarter notes (default 0: the first sample at the set's start). */
  startQuarters?: number;
  /**
   * Absolute path of the file where it will be opened, when known (the Mac
   * app knows the folder it writes to; a web download does not). Live looks
   * for a project file by its relative path first and falls back to this one.
   */
  absolutePath?: string;
  /** Size of the file in bytes, when known (`OriginalFileSize`; 0 = unknown, a value Live itself writes). */
  fileSize?: number;
  /** Live's checksum of the file (`liveFileCrc()` of its first 16 384 bytes); 0 = unknown, as Live itself writes. */
  crc?: number;
  /** Modification time of the file, Unix seconds (`LastModDate`); 0 = unknown. */
  lastModified?: number;
  /** Palette index 0..69 of the track (and its clip); default: a warm colour per track. */
  color?: number;
}

/** From `quarters` on (until the next segment), the tempo is `quarterBpm` quarter notes per minute. */
export interface TempoSegmentInput {
  quarters: number;
  quarterBpm: number;
}

/** A time signature from `quarters` on (at a bar line). */
export interface MeterInput {
  quarters: number;
  /** 1..99. */
  numerator: number;
  /** 1, 2, 4, 8 or 16: the denominators Live offers. */
  denominator: number;
}

/** A named marker of the arrangement (Live's « Locator »). */
export interface LocatorInput {
  quarters: number;
  name: string;
}

/**
 * The schema written: « live11 » (Live 11.0, opened by Live 11 and 12, the
 * default) or « live10 » (Live 10.1, for Live 10: the clips open « missing »
 * there, see ALS-FORMAT.md).
 */
export type AbletonTarget = 'live11' | 'live10';

export interface AbletonSetInput {
  /** Default « live11 ». */
  target?: AbletonTarget;
  /** The piece's title, written in the set's info text (`Annotation`). */
  title: string;
  /** Sample rate of every track's file (the app works at 48 000). */
  sampleRate: number;
  tracks: AbletonTrackInput[];
  /**
   * The tempo curve, piecewise constant, sorted, the first at quarter 0. A
   * curve that changes at every beat (`Session.beats`) is fine: consecutive
   * equal values are merged.
   */
  tempo: TempoSegmentInput[];
  /** Time signatures, sorted, the first at quarter 0. */
  meters: MeterInput[];
  /** Chords, sections, parts…: written as locators, sorted by time. */
  locators: LocatorInput[];
  /** Extra info text for the set (shown in Live's Info View); default: title and « Exporté par Fabtice ». */
  annotation?: string;
}

export type AbletonWarning =
  /** A tempo outside Live's range was clamped: the positions after it are no longer exact. */
  | { kind: 'tempo-clamped'; quarters: number; quarterBpm: number; written: number }
  /**
   * A tempo change between two sixteenth notes: Live reads the tempo curve
   * sixteenth by sixteenth, so the curve is averaged over that sixteenth
   * (exact on every sixteenth, off by `error` seconds at most in between).
   */
  | { kind: 'tempo-unaligned'; quarters: number; error: number }
  /** Two locators at the same time: their names are joined. */
  | { kind: 'locators-merged'; quarters: number; names: string[] }
  /** A locator before the start or after the end of the timeline that was kept anyway. */
  | { kind: 'locator-outside'; quarters: number; name: string };

/** One automation point of the tempo envelope, as written (value in float32). */
export interface LiveTempoPoint {
  quarters: number;
  quarterBpm: number;
}

export interface AbletonSetResult {
  target: AbletonTarget;
  /** The document, uncompressed (what is inside the `.als`). */
  xml: string;
  /** The tempo envelope as written: steps, the first point at quarter 0. */
  tempo: LiveTempoPoint[];
  /** Where each track's clip ends on the timeline (quarters), in the order of `tracks`. */
  clipEnds: number[];
  warnings: AbletonWarning[];
}
