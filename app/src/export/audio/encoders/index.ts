// The mp3 and flac encoders (worker + WebAssembly), see `workerEncoder.ts`.

import { createWorkerEncoder } from './workerEncoder';

export const mp3Encoder = createWorkerEncoder({ format: 'mp3', extension: 'mp3', mimeType: 'audio/mpeg' });
export const flacEncoder = createWorkerEncoder({ format: 'flac', extension: 'flac', mimeType: 'audio/flac' });
export { createWorkerEncoder } from './workerEncoder';
