// The instrument-recognition model: CED-Tiny (`analysis/models.ts#MODEL_REGISTRY['ced-tiny']`),
// a small transformer trained on AudioSet by its authors (Apache-2.0, weights and code), chosen on
// the bench of `web/spikes/structure/instruments/` (README there: candidates, figures, limits).
//
// It reads 16 kHz mono samples (its log-mel front end is inside the graph) and gives a sigmoid
// score for each of the 527 AudioSet classes. The app gathers those classes into the groups it
// can name (`model/structure.ts#PART_INSTRUMENTS`) plus the generic wind families: a group's
// score is the best score of its classes. Indices are those of the model's own `config.json`
// (`id2label`) at the pinned revision; the bench's `models.py#GROUPS` holds the same lists by name.

/** The groups that compete for the name (the five winds first). */
export const WIND_GROUPS = ['trumpet', 'trombone', 'saxophone', 'clarinet', 'flute'] as const;
export const OTHER_GROUPS = ['piano', 'guitar', 'vibraphone', 'violin', 'organ', 'voice'] as const;
export type WindGroup = (typeof WIND_GROUPS)[number];
export type NamedGroup = WindGroup | (typeof OTHER_GROUPS)[number];
export const NAMED_GROUPS: readonly NamedGroup[] = [...WIND_GROUPS, ...OTHER_GROUPS];
/** The non-winds the recogniser may name (the others only compete: see `decide.ts`). */
export const NAMEABLE_OTHERS = ['vibraphone', 'violin', 'organ'] as const;

/** Every group read from the model: the named ones and the two wind families. */
export type Group = NamedGroup | 'brass' | 'woodwind';
export type GroupScores = Readonly<Record<Group, number>>;

/** AudioSet class indices of each group (CED-Tiny's `id2label`). */
export const CED_GROUPS: Readonly<Record<Group, readonly number[]>> = {
  trumpet: [187], // Trumpet
  trombone: [188], // Trombone
  saxophone: [197], // Saxophone
  clarinet: [198], // Clarinet
  flute: [196], // Flute
  brass: [185, 186], // Brass instrument, French horn
  woodwind: [195], // Wind instrument
  piano: [153, 154], // Piano, Electric piano
  guitar: [140, 141, 143, 144], // Guitar, Electric guitar, Acoustic guitar, Steel guitar
  vibraphone: [182, 180, 179], // Vibraphone, Marimba, Mallet percussion
  violin: [191, 189, 190, 193], // Violin, Bowed string instrument, String section, Cello
  organ: [155, 156, 157], // Organ, Electronic organ, Hammond organ
  voice: [27, 28, 32, 33, 37, 0], // Singing, Choir, Male singing, Female singing, Humming, Speech
};

export const CED_CLASSES = 527;
export const CED_SAMPLE_RATE = 16000;
/** The model was trained on 10 s clips. */
export const WINDOW_SECONDS = 10;
/** Windows overlap by half. */
export const HOP_SECONDS = 5;
/** A long solo is read on at most this many windows, spread evenly (about 3 s of work on one core). */
export const MAX_WINDOWS = 12;
/** A window shorter than this is not read (the end of an excerpt). */
export const MIN_WINDOW_SECONDS = 3;

/** Group scores of one window, from the model's 527 scores. */
export function groupScores(scores: ArrayLike<number>): GroupScores {
  const out = {} as Record<Group, number>;
  for (const g of Object.keys(CED_GROUPS) as Group[]) {
    let best = 0;
    for (const i of CED_GROUPS[g]) best = Math.max(best, scores[i] ?? 0);
    out[g] = best;
  }
  return out;
}

/** Mean of the group scores of several windows (null for none). */
export function meanScores(windows: readonly GroupScores[]): GroupScores | null {
  if (!windows.length) return null;
  const out = {} as Record<Group, number>;
  for (const g of Object.keys(CED_GROUPS) as Group[]) out[g] = windows.reduce((s, w) => s + w[g], 0) / windows.length;
  return out;
}
