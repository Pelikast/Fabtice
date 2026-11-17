// « Projet Ableton Live… » (C15.5), the pure writer: a neutral description of
// the piece (types.ts) in, the bytes of the `.als` out. No DOM, no file
// system: the folder (audio files, MIDI file, how-to) is assembled elsewhere.
// Format, sources and degree of confidence: ALS-FORMAT.md. The format is
// announced « à l'essai »: nobody here could open it in Live.

import { gzipLive } from './gzip';
import { buildLiveSet } from './liveSet';
import type { AbletonSetInput, AbletonSetResult } from './types';

export * from './types';
export { buildLiveSet, DIALECTS, LIVE_SCHEMA } from './liveSet';
export { liveFileCrc, LIVE_CRC_BYTES } from './crc';
export { LIVE_TEMPO_MAX, LIVE_TEMPO_MIN, liveTempoSteps, quartersToSeconds, secondsToQuarters, timeSignatureCode } from './tempo';

/** The `.als` file: the document of `buildLiveSet()`, gzipped the way Live writes it. */
export async function writeAbletonSet(input: AbletonSetInput): Promise<AbletonSetResult & { bytes: Uint8Array }> {
  const result = buildLiveSet(input);
  const bytes = await gzipLive(new TextEncoder().encode(result.xml));
  return { ...result, bytes };
}
