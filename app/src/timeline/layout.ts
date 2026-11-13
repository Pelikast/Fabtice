// Vertical layout shared by the header column and the timeline column, so
// their rows always line up. Heights mirror the CSS tokens of styles/tokens.css.

export type RulerRowId = 'tempo' | 'accords' | 'mesures';

export interface RulerRow {
  id: RulerRowId;
  /** CSS pixels. */
  height: number;
}

export const RULER_ROW_HEIGHT: Record<RulerRowId, number> = { tempo: 34, accords: 42, mesures: 24 };

/** Height kept under the last track for the display tools (CSS `--pied-pistes`). */
export const TRACKS_FOOT = 56;

/**
 * Rows of the sticky ruler, top to bottom. The chords row only exists once
 * the project has chords (lot 2).
 */
export function rulerRows({ hasChords }: { hasChords: boolean }): RulerRow[] {
  const ids: RulerRowId[] = hasChords ? ['tempo', 'accords', 'mesures'] : ['tempo', 'mesures'];
  return ids.map((id) => ({ id, height: RULER_ROW_HEIGHT[id] }));
}

/** Total ruler height, its bottom rule included. */
export function rulerHeight(rows: RulerRow[]): number {
  return rows.reduce((h, r) => h + r.height, 0) + 1;
}
