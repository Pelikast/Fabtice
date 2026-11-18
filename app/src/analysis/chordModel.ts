// « Modèle d'accords » (Réglages → Détection des accords): which network reads the chords. A
// preference of the DEVICE, like the separation tool, kept in localStorage under its own key,
// never in the project. Three values (owner's decision, 17 November 2026):
//   - nothing stored: « Automatique (recommandé) », the detailed model (Tsumugi-Chords) when the
//     device allows it (`autoChordModel`), the standard one (CREMA) otherwise;
//   - `crema` or `fine` stored: the user's explicit choice, always respected, never overwritten
//     (a stored `crema` is explicit too: the old code only wrote it when the user picked it).
// Best effort: without storage the choice is automatic.
//
// « The device allows it »: a computer (never a phone or a tablet, as the separation's device
// probe judges them, `separation/device.ts`) whose memory is known to be at least
// `FINE_MIN_MEMORY_GB`. The detailed model needs about 2.5 GB for its worker (3.0 to 3.3 GB at
// the peak for all the processes of the browser, measured: app/README.md); 8 GB leaves more than
// twice that to the system and the rest of the page, and it is what `navigator.deviceMemory`
// reports at most (Chromium, so also the Mac app). Unknown memory (Safari, Firefox): the
// standard model. On the test addresses (`?debug`, `?demo`, a page served from this machine) the
// automatic choice is the standard model, so that no check downloads the detailed one by itself
// (`main.tsx`; `?modele-accords=auto` keeps the real rule there).

import { useSyncExternalStore } from 'react';
import { knownDevice } from '../separation/device';
import type { ChordModelChoice } from './models';

const KEY = 'fabtice.chordModel.v1';

/** What the user set: `auto` (nothing stored) or an explicit model. */
export type ChordModelSetting = 'auto' | ChordModelChoice;
export const CHORD_MODEL_SETTINGS: readonly ChordModelSetting[] = ['auto', 'crema', 'fine', 'sheetsage2', 'combined'];

/** Least memory (GB, as `navigator.deviceMemory` reports it) for the automatic choice to take the detailed model. */
export const FINE_MIN_MEMORY_GB = 8;

/** What the automatic choice looks at. */
export interface ChordModelDevice {
  phone: boolean;
  /** Null when the browser does not say. */
  memoryGB: number | null;
}

/** The automatic choice for a device: the detailed model on a computer with enough memory known, else the standard one. */
export function autoChordModel(d: ChordModelDevice | null): ChordModelChoice {
  if (!d || d.phone || d.memoryGB === null) return 'crema';
  return d.memoryGB >= FINE_MIN_MEMORY_GB ? 'fine' : 'crema';
}

/** The model in use for a setting on a device. */
export function resolveChordModel(setting: ChordModelSetting, d: ChordModelDevice | null): ChordModelChoice {
  return setting === 'auto' ? autoChordModel(d) : setting;
}

let current: ChordModelSetting | null = null;
let autoAllowed = true;
let deviceOverride: ChordModelDevice | null = null;
const listeners = new Set<() => void>();

/**
 * Reads the stored value: `fine`, `crema` and (1.0.2, à l'essai) `sheetsage2`, `combined` are explicit
 * choices; nothing (or anything else) is automatic. The automatic choice never takes the ones on trial.
 */
export function readStoredSetting(value: string | null): ChordModelSetting {
  return value === 'fine' || value === 'crema' || value === 'sheetsage2' || value === 'combined' ? value : 'auto';
}

function read(): ChordModelSetting {
  try {
    return readStoredSetting(typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null);
  } catch {
    return 'auto';
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** The setting of this device (`auto` unless the user chose a model). */
export function chordModelSetting(): ChordModelSetting {
  current ??= read();
  return current;
}

/** The device as the automatic choice sees it (null: the automatic choice is held to the standard model). */
export function chordModelDevice(): ChordModelDevice | null {
  if (!autoAllowed) return null;
  if (deviceOverride) return deviceOverride;
  const d = knownDevice();
  return { phone: d.phone, memoryGB: d.memoryGB };
}

/** What « Automatique » gives on this device. */
export function autoChordModelHere(): ChordModelChoice {
  return autoChordModel(chordModelDevice());
}

/** The chord model in use on this device: the user's choice, else the automatic one. */
export function chordModelChoice(): ChordModelChoice {
  return resolveChordModel(chordModelSetting(), chordModelDevice());
}

/** Sets the preference; `auto` forgets the stored choice. */
export function setChordModelSetting(setting: ChordModelSetting): void {
  if (setting === chordModelSetting()) return;
  current = setting;
  try {
    if (setting === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, setting);
  } catch {
    // storage unavailable: the choice holds until the page is closed
  }
  notify();
}

/** An explicit choice of a model (kept, never overwritten). */
export function setChordModelChoice(choice: ChordModelChoice): void {
  setChordModelSetting(choice);
}

/** The test addresses hold the automatic choice to the standard model (`main.tsx`). */
export function setChordModelAutoAllowed(allowed: boolean): void {
  if (allowed === autoAllowed) return;
  autoAllowed = allowed;
  notify();
}

/** Replaces the device the automatic choice sees (tests); null goes back to the probe. */
export function setChordModelDevice(d: ChordModelDevice | null): void {
  deviceOverride = d;
  notify();
}

export function onChordModelChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook on the model in use. */
export function useChordModelChoice(): ChordModelChoice {
  return useSyncExternalStore(onChordModelChange, chordModelChoice, () => 'crema');
}

/** React hook on the setting. */
export function useChordModelSetting(): ChordModelSetting {
  return useSyncExternalStore(onChordModelChange, chordModelSetting, () => 'auto');
}

/** Forget the cached value and the test seams (tests). */
export function resetChordModelChoice(): void {
  current = null;
  autoAllowed = true;
  deviceOverride = null;
}
