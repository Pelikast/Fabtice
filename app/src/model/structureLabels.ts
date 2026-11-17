// The names of the parts of the structure, in one place: « Intro », « Thème 1 »,
// « Solo (Guitare) », « Solo 2 (Vents) ». The structure column of « Grille
// d'accords », its window and the markers of the exports (`export/session`)
// all write a part through `partName`, so they never differ.
//
// Rule: the name of the type; then the number when there is one; then the
// instrument in parentheses when it is known (« Vents » for the id `winds`).
// An instrument id the app does not know is left out.
//
// Pure: the translation function is given, so these functions are tested
// without the interface language.

import type { MessageKey } from '../i18n';
import type { PartInstrument, PartType, StructurePart } from './structure';

/** What a translation function looks like (`i18n#t`). */
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** The message of each kind of part. */
export const PART_TYPE_KEYS: Readonly<Record<PartType, MessageKey>> = {
  intro: 'structure.part.intro',
  theme: 'structure.part.theme',
  solo: 'structure.part.solo',
  bridge: 'structure.part.bridge',
  special: 'structure.part.special',
  outro: 'structure.part.outro',
  verse: 'structure.part.verse',
  chorus: 'structure.part.chorus',
};

/** The message of each known instrument (`PART_INSTRUMENTS`). */
export const INSTRUMENT_KEYS: Readonly<Record<string, MessageKey>> = {
  voice: 'structure.instrument.voice',
  guitar: 'structure.instrument.guitar',
  piano: 'structure.instrument.piano',
  bass: 'structure.instrument.bass',
  drums: 'structure.instrument.drums',
  winds: 'structure.instrument.winds',
  trumpet: 'structure.instrument.trumpet',
  saxophone: 'structure.instrument.saxophone',
  trombone: 'structure.instrument.trombone',
  clarinet: 'structure.instrument.clarinet',
  flute: 'structure.instrument.flute',
  violin: 'structure.instrument.violin',
  vibraphone: 'structure.instrument.vibraphone',
  organ: 'structure.instrument.organ',
};

/** « Guitare », « Vents »…; null for an id the app does not know. */
export function instrumentName(id: PartInstrument, tr: Translate): string | null {
  const key = INSTRUMENT_KEYS[id];
  return key ? tr(key) : null;
}

/** « Intro », « Thème 1 », « Solo (Guitare) », « Solo 2 (Vents) ». */
export function partName(p: Pick<StructurePart, 'type' | 'number' | 'instrument'>, tr: Translate): string {
  const name = tr(PART_TYPE_KEYS[p.type]) + (p.number !== null ? ` ${p.number}` : '');
  const instrument = p.instrument !== null ? instrumentName(p.instrument, tr) : null;
  return instrument ? `${name} (${instrument})` : name;
}
