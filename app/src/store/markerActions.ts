// Repères (lot 4): named loops (saved, recalled, renamed, deleted,
// reordered) and sections (the chart's letters, `corrections.sections`:
// added at the loop start or the playhead, renamed, deleted, looped).
// Recalling sets the loop; the playhead follows the rule of any new loop
// (`actions.ts#enterLoop`: it goes to the loop start when heard outside it).

import { getEngine } from '../audio';
import { t } from '../i18n';
import {
  barForNewSection,
  cleanName,
  defaultLoopName,
  loopWithRegion,
  nextSectionLetter,
  sectionRanges,
  withLoopAdded,
  withLoopMoved,
  withLoopRemoved,
  withLoopRenamed,
} from '../markers/markers';
import type { Markers } from '../model/markers';
import { newId } from '../util/id';
import { enterLoop, setLoopRegion } from './actions';
import { setSection } from './harmonyActions';
import { appStore, type AppState } from './store';
import { sectionsInForce } from './structureSelectors';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

function update(fn: (m: Markers) => Markers): void {
  set((s) => {
    const markers = fn(s.markers);
    return markers === s.markers ? {} : { markers };
  });
}

/**
 * « Garder cette boucle »: the current loop under a name (« Boucle 1 » when
 * none is given). The same region is never kept twice: it returns the loop
 * already kept. Null when there is no loop.
 */
export function saveCurrentLoop(name?: string): string | null {
  const s = get();
  const region = s.loop.region;
  if (!s.project || !region) return null;
  const already = loopWithRegion(s.markers, region);
  if (already) return already.id;
  const id = newId();
  const n = (name !== undefined && cleanName(name)) || defaultLoopName(s.markers.loops, t('markers.loopWord'));
  update((m) => withLoopAdded(m, { id, name: n, region: { ...region } }));
  return id;
}

/** Sets the loop to a named loop and switches it on. */
export function recallLoop(id: string): void {
  const l = get().markers.loops.find((x) => x.id === id);
  if (!l) return;
  setLoopRegion(l.region);
  enterLoop();
}

export function renameLoop(id: string, name: string): void {
  update((m) => withLoopRenamed(m, id, name));
}

export function deleteLoop(id: string): void {
  update((m) => withLoopRemoved(m, id));
}

export function moveLoop(id: string, direction: -1 | 1): void {
  update((m) => withLoopMoved(m, id, direction));
}

/** The sections (the letters in force) as ranges on the grid in force. */
export function currentSections(s: AppState = get()) {
  return sectionRanges(s.tempoMap, sectionsInForce(s), s.project?.duration ?? 0);
}

/**
 * « Nouvelle section »: a letter on the bar where the loop starts (when a
 * loop is set) or where the playhead is. The next free letter unless a label
 * is given. Returns the bar.
 */
export function addSection(label?: string): number | null {
  const s = get();
  if (!s.project) return null;
  const at = s.loop.region ? s.loop.region.start : getEngine().getPosition();
  const bar = barForNewSection(s.tempoMap, at);
  setSection(bar, label ?? nextSectionLetter(sectionsInForce(s)));
  return bar;
}

export function renameSection(bar: number, label: string): void {
  if (label.trim()) setSection(bar, label);
}

export function deleteSection(bar: number): void {
  setSection(bar, null);
}

/** Loops a section, from its bar line to the next section's. */
export function recallSection(bar: number): void {
  const r = currentSections().find((x) => x.bar === bar);
  if (!r) return;
  setLoopRegion({ start: r.start, end: r.end });
  enterLoop();
}
