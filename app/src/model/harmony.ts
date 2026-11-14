// Harmony data: pitch classes, chord symbols, keys, instruments. Plain data;
// the functions (spelling, parsing, formatting, transposition) are in
// `harmony/`.
//
// Everything stored is at CONCERT PITCH in the ORIGINAL key of the recording.
// Transposition (the transport's semitones) and the instrument (Ut, Si♭, Mi♭)
// are applied only when displaying or exporting.

/** 0 = C, 1 = C♯/D♭, … 11 = B. Always an integer in 0…11. */
export type PitchClass = number;

/**
 * Chord qualities. The first fourteen are exactly the vocabulary of the
 * analysis prototype's decoder (`web/spikes/analyse/lib/chords.js`, `QUALS`);
 * the last two are what a jazz player also writes by hand.
 *
 *   maj C · min Cm · aug C+ · dim C° · sus2 Csus2 · sus4 Csus4 · 7 C7 ·
 *   maj7 C△ · min7 Cm7 · minmaj7 Cm△ · maj6 C6 · min6 Cm6 · dim7 C°7 ·
 *   hdim7 Cm7♭5 · 7sus4 C7sus4 · aug7 C+7
 */
export const CHORD_QUALITIES = [
  'maj', 'min', 'aug', 'dim', 'sus2', 'sus4', '7', 'maj7', 'min7', 'minmaj7', 'maj6', 'min6', 'dim7', 'hdim7',
  '7sus4', 'aug7',
] as const;
export type ChordQuality = (typeof CHORD_QUALITIES)[number];

/**
 * Extensions and alterations, written in ASCII in the data (`b` flat, `#`
 * sharp) and with ♭ ♯ on screen. Shown raised after the quality (DESIGN.md).
 * `alt` is the altered dominant (C7alt). The prototype's suggestions map onto
 * these directly (`b9`, `9`, `#9`, `11`, `#11`, `b13`, `13`, `6`); its « sus4
 * + 7 » becomes the quality `7sus4`.
 */
export const CHORD_EXTENSIONS = ['6', 'b9', '9', '#9', '11', '#11', 'b5', '#5', 'b13', '13', 'alt'] as const;
export type ChordExtension = (typeof CHORD_EXTENSIONS)[number];

/** A chord symbol, at concert pitch, independent of any spelling. */
export interface ChordSymbol {
  root: PitchClass;
  quality: ChordQuality;
  /**
   * Extensions in display order. From the analysis they are suggestions
   * (unreliable, measured); typed by hand they are what the user wants.
   */
  extensions: ChordExtension[];
  /** Bass note when it is not the root (« C7/E »); null otherwise. */
  bass: PitchClass | null;
}

export type KeyMode = 'major' | 'minor';

/** A key: tonic and mode. Its spelling (A♭, not G♯) follows from the tonic, see `harmony/key.ts`. */
export interface Key {
  tonic: PitchClass;
  mode: KeyMode;
}

/**
 * How the chart is shown: for a concert-pitch instrument (« Ut »), a B♭
 * instrument (« Si♭ », reads a major second higher) or an E♭ instrument
 * (« Mi♭ », reads a major sixth higher). Display only.
 */
export type Instrument = 'ut' | 'sib' | 'mib';
export const INSTRUMENTS: readonly Instrument[] = ['ut', 'sib', 'mib'];
