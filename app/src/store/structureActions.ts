// The structure by hand (document version 6): mode, parts (add, change,
// delete), back to the analysis. The section letters are edited as before
// (`harmonyActions.ts#setSection`, the markers panel), which marks them as the
// user's (`structureSelectors.ts#withLettersAdopted`).
//
// How a part edit is kept (rules in `model/structure.ts`): the part, as the
// user wants it, goes into `corrections.structure.parts`, and the stretch it
// touched (its old and new limits) into `spans`. A part in force that
// overlaps the new limits is cut around them (copied into the hand layer: two
// pieces when the new part falls in its middle, none when it covers it).
// Shrinking a part leaves a stretch with no part: the neighbours do not grow
// by themselves. Each command returns false (or null), changing nothing, when
// it cannot apply.

import type { Seconds, TimeRange } from '../model/project';
import {
  PART_INSTRUMENT_PATTERN,
  PART_TYPES,
  STRUCTURE_MODE_CHOICES,
  emptyStructureCorrections,
  type StructureCorrections,
  type StructureModeChoice,
  type StructurePart,
} from '../model/structure';
import { newId } from '../util/id';
import { appStore } from './store';
import { STRUCTURE_EPS, structureInForce, type PartInForce } from './structureSelectors';

/** What a part is made of, without its identifier. */
export type PartFields = Omit<StructurePart, 'id'>;

const get = () => appStore.getState();

function setStructure(fn: (st: StructureCorrections) => StructureCorrections | null): boolean {
  const s = get();
  if (!s.project) return false;
  const structure = fn(s.corrections.structure);
  if (!structure) return false;
  appStore.setState({ corrections: { ...s.corrections, structure } });
  return true;
}

function isValidPart(p: PartFields): boolean {
  if (!PART_TYPES.includes(p.type)) return false;
  if (p.number !== null && !(Number.isInteger(p.number) && p.number >= 1)) return false;
  if (p.instrument !== null && !PART_INSTRUMENT_PATTERN.test(p.instrument)) return false;
  return Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start + STRUCTURE_EPS;
}

const plainPart = (p: StructurePart): StructurePart => ({ id: p.id, type: p.type, number: p.number, instrument: p.instrument, start: p.start, end: p.end });

/** Ranges merged where they overlap or touch, ascending. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + STRUCTURE_EPS) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/**
 * The hand layer after placing `part` (null: removing) instead of the part in
 * force `editedId` (null: a new part). `inForce` is the merged list the user
 * sees. Pure; see the header for the rule.
 */
export function withPartPlaced(st: StructureCorrections, inForce: readonly PartInForce[], editedId: string | null, part: StructurePart | null): StructureCorrections {
  const edited = editedId === null ? undefined : inForce.find((p) => p.id === editedId);
  const touched: TimeRange[] = [];
  if (edited) touched.push({ start: edited.start, end: edited.end });
  if (part) touched.push({ start: part.start, end: part.end });
  const hole = part ?? edited;
  const hand: StructurePart[] = [];
  for (const p of inForce) {
    if (p.id === editedId) continue;
    const overlaps = hole !== undefined && p.start < hole.end - STRUCTURE_EPS && p.end > hole.start + STRUCTURE_EPS;
    if (!overlaps) {
      if (p.origin === 'manual') hand.push(plainPart(p));
      continue;
    }
    // Cut around the new limits; its old place is covered so that the detected original stays hidden.
    touched.push({ start: p.start, end: p.end });
    let firstId: string | null = p.origin === 'manual' ? p.id : null;
    const piece = (start: Seconds, end: Seconds) => {
      if (end <= start + STRUCTURE_EPS) return;
      hand.push({ ...plainPart(p), id: firstId ?? newId(), start, end });
      firstId = null;
    };
    piece(p.start, Math.min(p.end, hole.start));
    piece(Math.max(p.start, hole.end), p.end);
  }
  if (part) hand.push(part);
  hand.sort((a, b) => a.start - b.start);
  return { ...st, parts: hand, spans: mergeRanges([...st.spans, ...touched]) };
}

// ---------------------------------------------------------------- commands

/** « Mode »: Jazz, Pop, or `auto` (the detected one). */
export function setStructureMode(mode: StructureModeChoice): boolean {
  if (!STRUCTURE_MODE_CHOICES.includes(mode)) return false;
  return setStructure((st) => (st.mode === mode ? null : { ...st, mode }));
}

/** A new part (stored as the user's). Returns its id, or null when the part is not valid. */
export function addPart(fields: PartFields): string | null {
  if (!isValidPart(fields)) return null;
  const id = newId();
  const s = get();
  const ok = setStructure((st) => withPartPlaced(st, structureInForce(s).parts, null, { id, ...fields }));
  return ok ? id : null;
}

/**
 * Changes a part in force (name/type, number, instrument, limits). A detected
 * part becomes the user's (under a new id, returned); a hand part keeps its id.
 * Null when there is no such part or the result is not valid.
 */
export function editPart(id: string, patch: Partial<PartFields>): string | null {
  const s = get();
  const parts = structureInForce(s).parts;
  const old = parts.find((p) => p.id === id);
  if (!old) return null;
  const next: StructurePart = { ...plainPart(old), ...patch, id: old.origin === 'manual' ? old.id : newId() };
  if (!isValidPart(next)) return null;
  return setStructure((st) => withPartPlaced(st, parts, id, next)) ? next.id : null;
}

/** Deletes a part in force (a detected one stays deleted after a new analysis). */
export function removePart(id: string): boolean {
  const s = get();
  const parts = structureInForce(s).parts;
  if (!parts.some((p) => p.id === id)) return false;
  return setStructure((st) => withPartPlaced(st, parts, id, null));
}

/** « Revenir à l'analyse » for the structure: mode and parts as detected. The section letters stay as they are. */
export function resetStructure(): boolean {
  return setStructure((st) => {
    const empty = emptyStructureCorrections();
    if (st.mode === empty.mode && st.parts.length === 0 && st.spans.length === 0) return null;
    return { ...empty, lettersByHand: st.lettersByHand };
  });
}

/** The letters go back to the detected ones: the user's section marks are dropped (only when the user asks). */
export function resetSectionLetters(): boolean {
  const s = get();
  if (!s.project || (s.corrections.sections.length === 0 && !s.corrections.structure.lettersByHand)) return false;
  appStore.setState({ corrections: { ...s.corrections, sections: [], structure: { ...s.corrections.structure, lettersByHand: false } } });
  return true;
}
