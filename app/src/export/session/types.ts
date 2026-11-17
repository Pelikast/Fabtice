// The common session model of the sequencer exports (C15.4 « Dossier pour
// Logic Pro… », C15.5 « Projet Ableton Live… »): what a sequencer must
// receive to rebuild the piece as the user hears it, built once from the app's
// state by `buildSession()` (pure, tested in Node), then written by each
// exporter in its own format (`export/midi/`, `export/logic/`, `export/ableton/`).
//
// THE TIME OF THE OUTPUT
//   Everything here is in the time of the exported audio, after the tempo
//   change chosen in the transport (`playback.tempoRatio`): output time =
//   source time / tempoRatio (`render/types.ts`: the rendered audio is aligned,
//   output frame k is source time k × tempoRatio / sampleRate). The tempo curve
//   is the one heard, the chords and keys are transposed by the transport's
//   semitones (the cents are a tuning, they move no chord). Every exported
//   track starts at output time 0 and lasts `frames` frames.
//
// TWO COORDINATES FOR EVERY POSITION
//   - `time`: output seconds from the start of the audio (0 = first sample);
//   - `quarters`: quarter notes from the start of the sequencer's timeline
//     (0 = its first bar line, aligned with the first sample), through the
//     lead-in below. A sequencer bar line is at a whole `quarters` value
//     (a multiple of 1/8: the shortest bar unit is a 32nd), exact in binary.
//   MIDI ticks are `quarters × PPQ`; Ableton's beats are quarters too.
//
// THE LEAD-IN (« mesure d'attente »)
//   The tracks start at 0, the bar lines of the piece usually do not. The
//   first bar line represented is the first bar line of the grid at or after
//   output time 0 (`startBar`, a pick-up bar of the grid when there is one
//   there). The stretch before it is the lead-in: `leadIn.bars` bars of
//   `leadIn.meter`, at a constant tempo computed so that they last exactly
//   `leadIn.duration` seconds (`leadIn.quarterBpm`, within the tempo range
//   asked for: `SessionOptions.tempoRange`). When the first bar line is at 0
//   (closer than `START_SNAP`), there is no lead-in. When it is so close to 0
//   that no lead-in bar could last that little within the tempo range (a few
//   milliseconds), there is none either and the first bar line is put at 0:
//   `startError` says by how much it is then early (every later beat is exact).
//
// THE BEATS
//   `beats`: every beat of the grid from `startBar` to the end of the audio,
//   in the bar's OWN signature (the eighths of a 6/8 bar in a 4/4 piece: « la
//   noire reste la noire », `model/tempoMap.ts`), with the tempo (in quarter
//   notes per minute) that takes it exactly to the next beat. A tempo curve
//   made of these values, changing at each beat, puts every beat at its time.
//
// STABILITY
//   This is a contract shared by several exporters: add fields, do not rename
//   or change the meaning of existing ones.

import type { ChordSymbol, Key } from '../../model/harmony';
import type { TrackRole } from '../../model/project';
import type { StemId } from '../../model/separation';
import type { PartInstrument, PartType, StructureMode } from '../../model/structure';
import type { Meter } from '../../model/tempoMap';

/** Output seconds (time of the exported audio, after the tempo change). */
export type OutputSeconds = number;

export interface SessionTrack {
  /** The app's track id (`Track.id`). */
  id: string;
  /** Its name as shown (« Morceau », « Voix »…). */
  name: string;
  role: TrackRole;
  stem: StemId | null;
  /** Its audio in the registry (`Track.audio.id`). */
  audioId: string;
  /**
   * A file name without extension, safe on every system, numbered in the
   * order of the tracks and unique: « 01 Morceau », « 02 Voix ».
   */
  fileStem: string;
}

export interface SessionBeat {
  time: OutputSeconds;
  quarters: number;
  /** Bar index of the grid (0 = « mesure 1 », negative before it). */
  bar: number;
  /** 0-based beat in its bar, in the bar's own signature (0 = the bar line). */
  beatInBar: number;
  /** Quarter notes per minute from this beat to the next one (the last: the tempo in force there). */
  quarterBpm: number;
}

export interface SessionBar {
  /** Bar index of the grid (0 = « mesure 1 »). */
  bar: number;
  /** As the app shows it: index + 1 (« 0 » for the pick-up bar). */
  number: number;
  time: OutputSeconds;
  quarters: number;
  meter: Meter;
}

export interface SessionMeter {
  /** Bar index of the grid where it starts; null for the lead-in. */
  bar: number | null;
  time: OutputSeconds;
  quarters: number;
  meter: Meter;
}

export interface SessionKey {
  /** The first one at 0; a modulation at the bar line nearest to it. */
  time: OutputSeconds;
  quarters: number;
  /** Bar index of the grid (null for the first one, from the start of the file). */
  bar: number | null;
  /** Transposed by the transport's semitones. */
  key: Key;
  /** ASCII: « Bb », « F#m ». */
  text: string;
  /** For display, in American letters as everywhere: « B♭ », « F♯m ». */
  name: string;
}

export interface SessionChord {
  /** The time of the beat the chord is written on (the chart's placement). */
  time: OutputSeconds;
  quarters: number;
  bar: number;
  /** 0-based beat in its bar, in the bar's own signature. */
  beatInBar: number;
  /** Transposed; null for « N.C. ». */
  chord: ChordSymbol | null;
  /** ASCII, spelled in the key of its passage: « Bbmaj7 », « F#m7b5 », « G7(b9,#11)/F », « N.C. ». */
  text: string;
  /** As the app writes it: « B♭△ », « F♯m7♭5 ». */
  display: string;
  /** The analysis was unsure. */
  doubtful: boolean;
}

export interface SessionSection {
  /** At its bar line. */
  time: OutputSeconds;
  quarters: number;
  bar: number;
  /** « A », « B »… (or a label typed by hand). */
  label: string;
}

export interface SessionPart {
  /** At the bar line nearest to its start. */
  time: OutputSeconds;
  quarters: number;
  bar: number;
  end: OutputSeconds;
  endQuarters: number;
  type: PartType;
  number: number | null;
  instrument: PartInstrument | null;
  /** French: « Intro », « Thème 1 », « Solo (Guitare) ». */
  label: string;
  /** Section letters it covers (« A », « A », « B », « A »). */
  letters: string[];
}

export interface LeadIn {
  /** From 0 to the first bar line represented: `Session.start.time`. */
  duration: OutputSeconds;
  meter: Meter;
  bars: number;
  /** Constant: `bars × quarters of meter × 60 / duration`. */
  quarterBpm: number;
}

/** Something a sequencer may not follow exactly (reported, the export still goes on). */
export type SessionWarning =
  /** A tempo of the curve is outside the range asked for (`tempoRange`): the sequencer may clamp it. */
  | { kind: 'tempo-out-of-range'; time: OutputSeconds; quarterBpm: number }
  /** The first bar line is put at 0 although it is `error` seconds later (no lead-in that short). */
  | { kind: 'start-snapped'; error: OutputSeconds };

export interface Session {
  title: string;
  /** The transport's choices, as exported. */
  semitones: number;
  cents: number;
  tempoRatio: number;
  sampleRate: number;
  /** Frames of every exported track (all the same length). */
  frames: number;
  duration: OutputSeconds;
  /** Quarter notes at the end of the audio. */
  endQuarters: number;
  tracks: SessionTrack[];
  leadIn: LeadIn | null;
  /**
   * The first bar line represented: its bar index, its true output time (`leadIn.duration` with a lead-in, at
   * most a few milliseconds without), its quarters (`leadIn.bars × quarters of leadIn.meter`, or 0).
   */
  start: { bar: number; time: OutputSeconds; quarters: number };
  /** Set when there is no lead-in but the first bar line is not exactly at 0 (see the header). 0 otherwise. */
  startError: OutputSeconds;
  /** Tempo of the piece at its start (quarter notes per minute, output). */
  startQuarterBpm: number;
  bars: SessionBar[];
  beats: SessionBeat[];
  /** The lead-in's signature first (when there is one), then the start bar's, then each change. */
  meters: SessionMeter[];
  keys: SessionKey[];
  chords: SessionChord[];
  sections: SessionSection[];
  parts: SessionPart[];
  mode: StructureMode;
  /** « Forme globale » (« AABA »), '' when unknown. */
  form: string;
  warnings: SessionWarning[];
}

export interface SessionOptions {
  /**
   * The tempos the target sequencer accepts, in quarter notes per minute:
   * the lead-in stays inside, and a tempo of the curve outside it is reported.
   * Default `DEFAULT_TEMPO_RANGE`.
   */
  tempoRange?: { min: number; max: number };
}
