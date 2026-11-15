// Where the chords of a bar sit and how large they are written, as pure
// functions (tested in fit.test.ts).
//
// A chord is written AT THE PLACE OF ITS BEAT, as in a Real Book: in 4/4 beat 1
// at the bar line, beat 3 in the middle of the bar, beats 2 and 4 at a quarter
// and three quarters.
//
// ONE size for the whole chart (screen and paper alike), never one per bar: a
// bar with two chords is not written smaller than its neighbours. The rules,
// in this order, for a given size:
//   1. A chord that would run past the end bar line is pushed back (to the
//      left) against it, and so is the chord before it if they would touch:
//      « D♭7♯11 » on beat 4 is written against the end bar line, not smaller.
//      A chord that would touch the one before it moves a little to its right.
//   2. If the chords of the bar do not fit side by side even so (or the first
//      would be pushed past the start of the bar), they go on two rows at the
//      same size, one up and one down by turns; each row is pushed the same way.
//   3. Only when some bar still does not fit on two rows is the size of the
//      whole chart lowered one step (the steps of the chart: 30 px, 22, 17…),
//      the same for every bar, until every bar fits. If nothing fits at the
//      smallest step, that step is used and the bars that do not fit are
//      written as well as they can be, never with a hidden chord.
// `fitChart` also says which bar forced the step down (`limitedBy`), so that
// the rule that decides can be named.
//
// The widths come from the screen (`useFitChords.ts` measures each symbol once,
// in em: a symbol is as wide as its size times that number, whatever the size).

/** Size of the chords of a bar, as a fraction of the normal one, step by step (30, 22, 17, 14, 11 px on a desktop). */
export const FIT_RATIOS: readonly number[] = [1, 0.73, 0.57, 0.47, 0.38];

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

/** How the chords of one bar are written at a size: on one row or two, each moved by `push` px from its beat (negative: pushed back to the left, positive: moved right of the chord before it). */
export interface BarFit {
  rows: 1 | 2;
  push: number[];
  /** False only in the last resort: the bar does not fit at this size even on two rows. */
  fits: boolean;
}

/**
 * Places the chords of one row. Left to right, a chord that would touch the one before it moves
 * right of it; then, right to left, any chord that would run past the end bar line (or into the
 * next one) is pushed back to the left against it. `fits` is false when the first would have to
 * start before the bar's own left margin: the row is too full for this size.
 */
function pushRow(ideal: number[], widths: number[], g: FitGeometry, size: number): { pos: number[]; fits: boolean } {
  const pos = ideal.slice();
  for (let k = 1; k < pos.length; k++) pos[k] = Math.max(pos[k]!, pos[k - 1]! + widths[k - 1]! + FIT_GAP_EM * size);
  let limit = g.width - Math.max(g.padRight, FIT_MIN_RIGHT);
  for (let k = pos.length - 1; k >= 0; k--) {
    pos[k] = Math.min(pos[k]!, limit - widths[k]!);
    limit = pos[k]! - FIT_GAP_EM * size;
  }
  return { pos, fits: pos.length === 0 || pos[0]! >= g.padLeft - 0.01 };
}

/** One bar at `ratio`: the first arrangement that fits (one row, then two), or the two-row one with `fits` false. */
export function fitBar(chords: readonly FitChord[], g: FitGeometry, ratio: number): BarFit {
  const size = g.base * ratio;
  const ideal = chords.map((c) => chordStart(c.frac, g));
  const widths = chords.map((c) => c.em * size);
  const attempt = (rows: 1 | 2): BarFit => {
    const push = new Array<number>(chords.length).fill(0);
    let fits = rows === 1 || size * FIT_LINE_EM * 2 <= g.room + 0.01;
    for (let r = 0; r < rows; r++) {
      const idx = chords.map((_, i) => i).filter((i) => i % rows === r);
      const placed = pushRow(idx.map((i) => ideal[i]!), idx.map((i) => widths[i]!), g, size);
      idx.forEach((i, k) => (push[i] = placed.pos[k]! - ideal[i]!));
      if (!placed.fits) fits = false;
    }
    return { rows, push, fits };
  };
  const one = attempt(1);
  if (one.fits || chords.length < 2) return one;
  return attempt(2);
}

export interface ChartBar {
  chords: readonly FitChord[];
  geometry: FitGeometry;
}

export interface ChartFit {
  /** Step of `FIT_RATIOS` for every bar of the chart. */
  step: number;
  bars: BarFit[];
  /** Index (in the input) of a bar that did not fit one step larger, and so decided the size; null at step 0. */
  limitedBy: number | null;
  /** True when even the smallest step leaves a bar that does not fit. */
  lastResort: boolean;
}

/** The one size of the chart: the largest step at which every bar fits (rows apart), see the header. */
export function fitChart(bars: readonly ChartBar[]): ChartFit {
  let limitedBy: number | null = null;
  for (let step = 0; step < FIT_RATIOS.length; step++) {
    const fitted = bars.map((b) => (b.chords.length ? fitBar(b.chords, b.geometry, FIT_RATIOS[step]!) : ({ rows: 1, push: [], fits: true } as BarFit)));
    const bad = fitted.findIndex((f) => !f.fits);
    if (bad < 0) return { step, bars: fitted, limitedBy, lastResort: false };
    if (step === FIT_RATIOS.length - 1) return { step, bars: fitted, limitedBy: bad, lastResort: true };
    limitedBy = bad;
  }
  return { step: 0, bars: [], limitedBy: null, lastResort: false };
}
