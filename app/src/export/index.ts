// Exports offered by the « Exporter » menu of the top bar.
//
//   - « Grille pour iReal Pro »: `chartForExport()` then `exportToIRealPro()` (./ireal.ts).
//   - « Imprimer la grille »: `printChart()`, written with the print styles of
//     the chart view by the chart agent; `PRINT_READY` is false until then.
//   - Audio export (lot 3): shown, inactive.

export * from './chartExport';
export * from './ireal';

/** False until printing the chart is written (print styles of `.vue-grille`, page breaks between lines). */
export const PRINT_READY = false;

/**
 * Prints the chord chart. Contract for the chart agent: switch to the chart
 * view if needed, wait for fonts, `window.print()`, restore the view. The
 * print styles show only `.feuille` (title line and bars), ink on white.
 */
export function printChart(): void {
  throw new Error('printing the chart is not implemented yet');
}
