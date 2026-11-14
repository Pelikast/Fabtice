// The encoders of « Exporter le son », one per format. Today only WAV
// (`wav.ts`); the export agent adds mp3 and flac (wasm ports of free
// encoders, loaded on first use) through `registerEncoder`, and the dialog
// offers a format only when its encoder is here.

import type { AudioFormat } from '../../model/audioExport';
import type { AudioEncoder } from './types';
import { wavEncoder } from './wav';

const encoders = new Map<AudioFormat, AudioEncoder>([['wav', wavEncoder]]);

export function getEncoder(format: AudioFormat): AudioEncoder | null {
  return encoders.get(format) ?? null;
}

/** True when a format can be exported now. */
export function hasEncoder(format: AudioFormat): boolean {
  return encoders.has(format);
}

/** Adds (or replaces) the encoder of a format. */
export function registerEncoder(encoder: AudioEncoder): void {
  encoders.set(encoder.format, encoder);
}

/** Removes an encoder (tests). */
export function unregisterEncoder(format: AudioFormat): void {
  encoders.delete(format);
}
