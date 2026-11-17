// What the « Grille d'accords » shows (C14): the display chosen in the
// structure column (`ui.chartDisplay`), the bars it puts on the chart, and the
// commands of the column that go with it (a click on a part, « Boucle »).
// Interface state: not saved, not undoable. A display that points to a part
// which is gone is shown as the whole chart (`chart/structureDisplay.ts`).

import { barsOfRange, FULL_DISPLAY, partBars, resolveDisplay, sameDisplay } from '../chart/structureDisplay';
import type { ChartBar } from '../chart/layout';
import type { Seconds } from '../model/project';
import { enterLoop, seek, setLoopRegion } from './actions';
import { selectChartBars } from './chartSelectors';
import { editPart, removePart, type PartFields } from './structureActions';
import { structureInForce, type PartInForce } from './structureSelectors';
import { appStore, type AppState, type ChartDisplay } from './store';

const get = () => appStore.getState();

// ---------------------------------------------------------------- selectors

/** The display in force: the chosen one, or the whole chart when its part is gone. */
export function selectChartDisplay(s: AppState): ChartDisplay {
  return resolveDisplay(s.ui.chartDisplay, structureInForce(s).parts);
}

/** The part shown alone, or null. */
export function selectShownPart(s: AppState): PartInForce | null {
  const d = selectChartDisplay(s);
  if (d.kind !== 'part') return null;
  return structureInForce(s).parts.find((p) => p.id === d.id) ?? null;
}

let memo: { bars: ChartBar[]; part: PartInForce | null; map: AppState['tempoMap']; duration: Seconds; value: ChartBar[] } | null = null;

/** The bars the chart draws: all of them, or those of the part shown (bar numbers kept). The same array while nothing it reads changed. */
export function selectShownBars(s: AppState): ChartBar[] {
  const bars = selectChartBars(s);
  const part = selectShownPart(s);
  if (!part) return bars;
  const duration = s.project?.duration ?? 0;
  if (memo && memo.bars === bars && memo.part === part && memo.map === s.tempoMap && memo.duration === duration) return memo.value;
  const last = bars[bars.length - 1];
  const value = barsOfRange(bars, partBars(s.tempoMap, part, duration, last ? last.bar : 0));
  memo = { bars, part, map: s.tempoMap, duration, value };
  return value;
}

// ---------------------------------------------------------------- commands

function setDisplay(chartDisplay: ChartDisplay): void {
  const s = get();
  if (sameDisplay(s.ui.chartDisplay, chartDisplay)) return;
  appStore.setState({ ui: { ...s.ui, chartDisplay } });
}

/** « Affichage complet ». */
export function showFullChart(): void {
  setDisplay(FULL_DISPLAY);
}

/** « Grille complète simplifiée ». */
export function showSimplifiedChart(): void {
  setDisplay({ kind: 'simplified' });
}

/** A click on a part: its bars alone, and the playhead at its start (heard at once when playing). False when there is no such part. */
export function showPart(id: string): boolean {
  const part = structureInForce(get()).parts.find((p) => p.id === id);
  if (!part) return false;
  setDisplay({ kind: 'part', id });
  seek(part.start);
  return true;
}

/** « Boucle » beside a part: the loop on the whole part, shown and played when the playback runs. False when there is no such part. */
export function loopPart(id: string): boolean {
  const part = structureInForce(get()).parts.find((p) => p.id === id);
  if (!part) return false;
  setLoopRegion({ start: part.start, end: part.end });
  enterLoop();
  return true;
}

/** `editPart`, and the part shown follows it when it is the one that was changed (a detected part gets a new id). */
export function changePart(id: string, patch: Partial<PartFields>): string | null {
  const shown = get().ui.chartDisplay;
  const next = editPart(id, patch);
  if (next !== null && shown.kind === 'part' && shown.id === id) setDisplay({ kind: 'part', id: next });
  return next;
}

/** `removePart`; the chart shows in full again if it was that part (see `resolveDisplay`). */
export function deletePart(id: string): boolean {
  return removePart(id);
}
