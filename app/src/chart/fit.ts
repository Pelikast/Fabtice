// Where the chords of a bar sit and how large they are written, as pure
// functions (tested in fit.test.ts).
//
// A chord is written AT THE PLACE OF ITS BEAT, as in a Real Book: in 4/4 beat 1
// at the bar line, beat 3 in the middle of the bar, beats 2 and 4 at a quarter
// and three quarters. Chords therefore never sit side by side by default; but a
// long symbol can reach the next chord (« C♯m7♭5 » then « F♯7♭9 »), and the bar
// is only so wide. The size of the bar's chords then goes down by steps (the
// steps of the chart: 30 px, then 22, 17…), the same for every chord of the bar,
// until no chord touches the next one or leaves the bar.
//
// On a phone a bar is a quarter of 360 px, and three or four chords do not fit
// side by side at a size one can read. Before going below `READABLE_STEP`, the
// chords go on two rows, one up and one down by turns (the way a cramped bar
// is written by hand): each row is then checked on its own.
//
// The widths come from the screen (`useFitChords.ts` measures each symbol once,
// in em: a symbol is as wide as its size times that number, whatever the size).

/** Size of the chords of a bar, as a fraction of the normal one, step by step (30, 22, 17, 14, 11 px on a desktop). */
export const FIT_RATIOS: readonly number[] = [1, 0.73, 0.57, 0.47, 0.38];

/** The smallest step used before the chords of a bar go on two rows (17 px on a desktop, 12 px on a phone). */
export const READABLE_STEP = 2;

/** Height of a line of chords, in em (a raised extension reaches above the line). */
export const FIT_LINE_EM = 1.2;

/** Free space kept between two chords, in em of the chord size. */
export const FIT_GAP_EM = 0.3;

/** Smallest margin kept between a chord and the bar line that ends the bar, in px. */
export const FIT_MIN_RIGHT = 3;

export interface FitChord {
  /** Where the chord starts in the bar: beat in the bar over beats in the bar (0 = on the bar line). */
  frac: number;
  /** Width of the written symbol, in em (width at one pixel of size). */
  em: number;
}

/** The inside of a bar, in px of the layout it is fitted for. */
export interface FitGeometry {
  /** Width of the bar, bar line to bar line. */
  width: number;
  /** Space between the bar line and where the chord of beat 1 starts. */
  padLeft: number;
  /** Space kept at the right end of the bar. */
  padRight: number;
  /** Size of the chords at step 0, in px. */
  base: number;
  /** Height of the room for chords, under the bar number, in px. */
  room: number;
}

/**
 * The geometry of the printed chart: its bars are drawn as the desktop's are,
 * then scaled to the width of the page (`styles/print.css` works in units of
 * 1/206 of a bar), so the same steps fit on every paper and in both orientations.
 */
export const PRINT_GEOMETRY: FitGeometry = { width: 206, padLeft: 16, padRight: 8, base: 30, room: 52 };

/** Where the symbol of a chord starts, from the bar line. */
export function chordStart(frac: number, g: FitGeometry): number {
  return g.padLeft + frac * (g.width - g.padLeft - g.padRight);
}

/** How a bar's chords are written: at which step, on one row or two. */
export interface FitResult {
  step: number;
  rows: 1 | 2;
}

/**
 * True when every chord fits at `ratio` on `rows` rows (the chords go to the rows by turns): clear of the
 * next one on its row, inside the bar, and with the rows not taller than the room.
 */
export function fitsAt(chords: readonly FitChord[], g: FitGeometry, ratio: number, rows: 1 | 2 = 1): boolean {
  const size = g.base * ratio;
  if (rows === 2 && size * FIT_LINE_EM * 2 > g.room + 0.01) return false;
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i]!;
    const start = chordStart(c.frac, g);
    const end = start + c.em * size;
    const next = chords[i + rows];
    const limit = next ? chordStart(next.frac, g) - FIT_GAP_EM * size : g.width - Math.max(g.padRight, FIT_MIN_RIGHT);
    if (end > limit + 0.01) return false;
  }
  return true;
}

/**
 * How the chords of a bar are written: the largest step at which they fit on one row, down to
 * `READABLE_STEP`; then on two rows down to the same step; then smaller steps, one row then two.
 * When nothing fits (a symbol too long for its place at any size the chart allows) the smallest
 * step on two rows is the least bad choice, never a hidden chord.
 */
export function fitLayout(chords: readonly FitChord[], g: FitGeometry): FitResult {
  const order: FitResult[] = [];
  for (const [from, to] of [[0, READABLE_STEP], [READABLE_STEP + 1, FIT_RATIOS.length - 1]] as const) {
    for (const rows of [1, 2] as const) {
      for (let step = from; step <= to; step++) order.push({ step, rows });
    }
  }
  // One row at every readable step, then two rows at every readable step, then the same below.
  for (const r of order) {
    if (r.rows === 2 && chords.length < 2) continue;
    if (fitsAt(chords, g, FIT_RATIOS[r.step]!, r.rows)) return r;
  }
  return { step: FIT_RATIOS.length - 1, rows: chords.length > 1 ? 2 : 1 };
}
