// Messages between the recogniser (`recognizer.ts`, main thread) and its worker.

import type { InstrumentGuess } from '../types';

export type ToInstrumentsWorker =
  | {
      type: 'recognise';
      id: number;
      /** Transferred: the main thread gives up its copy. */
      mono: Float32Array;
      sampleRate: number;
      /** Whether the model may be downloaded if it is not on the device yet. */
      download: boolean;
      /** « Alléger le travail pour l'appareil »: the share of the time the worker may spend working (0.2…0.99), absent at full speed. */
      loadShare?: number;
    }
  | { type: 'cancel'; id: number };

export type FromInstrumentsWorker =
  | { type: 'result'; id: number; guess: InstrumentGuess | null }
  /** The model is not usable here (not downloaded and not allowed to be, offline, refused, no WebAssembly…). */
  | { type: 'unavailable'; id: number; reason: string };
