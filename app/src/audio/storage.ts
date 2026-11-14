// Main-thread side of the track memory: Float32 channels become 16-bit chunks
// in SharedArrayBuffers (readable by the audio thread without a copy), and a
// stereo track whose channels are identical is stored once (mono). A 5-minute
// stereo piece weighs 5 x 60 x 48 000 x 2 channels x 2 bytes = 58 MB.
//
// Since lot 3 this is the app-wide form of decoded audio (`audio/pcm.ts`):
// the registry holds it and the engine receives the same chunks. These names
// stay for the engine's own code and tests.

import { ENGINE_SAMPLE_RATE } from './AudioEngine';
import { channelsEqual, pcmFromChannels, type Chunk } from './pcm';

export interface StoredTrack {
  frames: number;
  mono: boolean;
  chunks: readonly Chunk[];
  bytes: number;
}

/** True when the right channel equals the left one to within one 16-bit step. */
export const isMono = channelsEqual;

/** Converts decoded channels (1 or 2) to 16-bit chunks, in shared memory when the page can have it. */
export function storeTrack(channels: Float32Array[]): StoredTrack {
  return pcmFromChannels(channels, ENGINE_SAMPLE_RATE);
}
