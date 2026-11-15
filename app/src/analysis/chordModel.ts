// « Modèle d'accords » (Réglages avancés): which network reads the chords. A preference of
// the DEVICE, like the separation tool (the fine model needs a computer with memory to
// spare), kept in localStorage under its own key, never in the project. Best effort: without
// storage the default (CREMA) is used.

import { useSyncExternalStore } from 'react';
import type { ChordModelChoice } from './models';

const KEY = 'fabtice.chordModel.v1';

let current: ChordModelChoice | null = null;
const listeners = new Set<() => void>();

function read(): ChordModelChoice {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    return v === 'fine' ? 'fine' : 'crema';
  } catch {
    return 'crema';
  }
}

/** The chord model chosen on this device (`crema` unless the user chose the fine one). */
export function chordModelChoice(): ChordModelChoice {
  current ??= read();
  return current;
}

export function setChordModelChoice(choice: ChordModelChoice): void {
  if (choice === chordModelChoice()) return;
  current = choice;
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // storage unavailable: the choice holds until the page is closed
  }
  for (const fn of listeners) fn();
}

export function onChordModelChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook on the choice. */
export function useChordModelChoice(): ChordModelChoice {
  return useSyncExternalStore(onChordModelChange, chordModelChoice, () => 'crema');
}

/** Forget the cached value (tests). */
export function resetChordModelChoice(): void {
  current = null;
}
