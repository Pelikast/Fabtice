// The encoders of « Exporter le son », one per format: WAV (`wav.ts`, written
// straight from the samples) and mp3 and flac (`encoders/`: LAME and libFLAC
// compiled to WebAssembly, in a worker created by the first file of that format).
// The dialog offers a format only when its encoder is registered.

import type { AudioFormat } from '../../model/audioExport';
import type { AudioEncoder } from './types';
import { flacEncoder, mp3Encoder } from './encoders/index';
import { wavEncoder } from './wav';

const encoders = new Map<AudioFormat, AudioEncoder>([['wav', wavEncoder]]);
registerEncoder(mp3Encoder);
registerEncoder(flacEncoder);

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
